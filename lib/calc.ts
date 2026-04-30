/**
 * Pure calculation engine for the RFP Analyzer.
 *
 * No React, no DOM, no I/O — everything in here is a pure function
 * of its inputs. That's deliberate: it makes the whole module trivially
 * testable, and lets the solver call `runScenario` thousands of times
 * during a slider drag without re-rendering anything.
 */

import type {
  AnnualScheduleRow,
  Globals,
  MonthlyGridRow,
  ScenarioInputs,
  ScenarioResults,
  WaterfallComponents,
} from "./types";

// ---------------------------------------------------------------------------
// 1. Annual rent schedule
// ---------------------------------------------------------------------------

/**
 * Build the year-by-year rent schedule.
 *
 * Year 0 is the free-rent row (rate = $0). Years 1+ escalate from baseRatePSF.
 * The schedule covers the entire lease term — including the free-rent months,
 * which are counted in `leaseTermMonths`.
 *
 * Greedy month allocation: free rent first, then 12 mo/yr until the term is
 * exhausted. The final year may be partial (`monthsActive < 12`).
 */
export function buildAnnualSchedule(inputs: ScenarioInputs): AnnualScheduleRow[] {
  const { baseRatePSF, escalation, leaseTermMonths } = inputs;
  // Free rent is months in real life — round to handle solver's continuous
  // bisection (any fractional x maps to the same integer-month behavior).
  const freeRentMonths = Math.round(inputs.freeRentMonths);
  const rows: AnnualScheduleRow[] = [];

  // Year 0: free rent.
  const freeMonths = Math.min(freeRentMonths, leaseTermMonths);
  if (freeMonths > 0) {
    rows.push({ year: 0, annualRatePSF: 0, monthsActive: freeMonths });
  }

  let remaining = leaseTermMonths - freeMonths;
  let year = 1;
  while (remaining > 0) {
    const monthsActive = Math.min(12, remaining);
    const annualRatePSF = baseRatePSF * Math.pow(1 + escalation, year - 1);
    rows.push({ year, annualRatePSF, monthsActive });
    remaining -= monthsActive;
    year += 1;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 2. Leasing commission (split-tier)
// ---------------------------------------------------------------------------

/**
 * Split-tier LC formula:
 *   LC PSF = lcPercent × (rent collected in yrs 1-5)
 *          + (lcPercent / 2) × (rent collected in yrs 6+)
 *
 * "Rent collected in year Y" = annualRatePSF[Y] × monthsActive[Y] / 12.
 * The free-rent row (year 0) is excluded — it contributes $0 either way,
 * but skipping it makes the convention explicit.
 */
export function calcLC(schedule: AnnualScheduleRow[], lcPercent: number): number {
  let tier1 = 0; // years 1-5
  let tier2 = 0; // years 6+

  for (const row of schedule) {
    if (row.year === 0) continue;
    const rentPSF = row.annualRatePSF * (row.monthsActive / 12);
    if (row.year <= 5) tier1 += rentPSF;
    else tier2 += rentPSF;
  }

  return lcPercent * tier1 + (lcPercent / 2) * tier2;
}

// ---------------------------------------------------------------------------
// 3. Monthly cash flow grid
// ---------------------------------------------------------------------------

/**
 * Build a month-by-month grid of PSF cash flows over the lease horizon.
 *
 * The grid extends to `globals.horizonMonths` (default 17 yrs / 204 mo);
 * months past the lease term are all zeros. This symmetry — every scenario
 * runs the same length — fixes one of the Excel's structural bugs.
 */
export function buildMonthlyGrid(
  inputs: ScenarioInputs,
  globals: Globals,
  schedule: AnnualScheduleRow[],
  lcTotalPSF: number,
): MonthlyGridRow[] {
  const horizon = Math.max(globals.horizonMonths, inputs.leaseTermMonths);
  const term = inputs.leaseTermMonths;
  const free = Math.min(Math.round(inputs.freeRentMonths), term);

  // Build month → annualRatePSF lookup so each row resolves in O(1).
  // The free-rent row contributes its months at rate $0; year 1 starts after.
  const monthToRate = new Array<number>(term).fill(0);
  let cursor = 0;
  for (const row of schedule) {
    for (let i = 0; i < row.monthsActive && cursor < term; i++) {
      monthToRate[cursor++] = row.annualRatePSF;
    }
  }

  // Phantom rate for valuing free rent: rate that WOULD have been charged
  // at month m if rent commenced immediately (no free period). This escalates
  // on the same yearly cadence as the real schedule. Needed because Quirk #10
  // in the spec — the Excel uses Yr1 monthly × free months as a shortcut,
  // which is wrong when free rent crosses a year boundary.
  const phantomRateForMonth = (m: number): number => {
    const yearIndex = Math.floor((m - 1) / 12);
    return inputs.baseRatePSF * Math.pow(1 + inputs.escalation, yearIndex);
  };

  const commencement = new Date(inputs.leaseCommencement);

  // LC payment timing.
  let lcMonth1 = 0;
  let lcMonthRC = 0; // RC = rent commencement (month after free rent)
  if (globals.lcStructure === "upfront") {
    lcMonth1 = -lcTotalPSF;
  } else {
    // split50: half at execution (month 1), half at rent commencement
    lcMonth1 = -lcTotalPSF / 2;
    lcMonthRC = -lcTotalPSF / 2;
  }
  const rcMonth = free + 1; // 1-indexed month where rent first kicks in

  const grid: MonthlyGridRow[] = [];
  for (let m = 1; m <= horizon; m++) {
    const inTerm = m <= term;
    const annualRate = inTerm ? monthToRate[m - 1] : 0;
    // During free rent: no rent collected (baseRentPSF = 0), and the
    // foregone rate at the would-be year's escalation goes into freeRentPSF.
    // After free rent: real rate flows through baseRentPSF, freeRentPSF = 0.
    const isFree = inTerm && m <= free;
    const baseRentPSF = isFree ? 0 : annualRate / 12;
    const freeRentPSF = isFree ? -phantomRateForMonth(m) / 12 : 0;
    const tiPSF = m === 1 ? -inputs.tiAllowancePSF : 0;

    let lcPSF = 0;
    if (m === 1) lcPSF += lcMonth1;
    if (globals.lcStructure === "split50" && m === rcMonth && free > 0) {
      lcPSF += lcMonthRC;
    } else if (globals.lcStructure === "split50" && free === 0 && m === 1) {
      // No free rent → both halves land in month 1, so add the second half here.
      lcPSF += lcMonthRC;
    }

    const netCFPSF = baseRentPSF + freeRentPSF + tiPSF + lcPSF;

    grid.push({
      month: m,
      date: addMonths(commencement, m - 1).toISOString().slice(0, 10),
      baseRentPSF,
      freeRentPSF,
      tiPSF,
      lcPSF,
      netCFPSF,
    });
  }

  return grid;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ---------------------------------------------------------------------------
// 4. NER (undiscounted + discounted)
// ---------------------------------------------------------------------------

/** Sum a column of the monthly grid over the lease term. */
function sumColumn(
  grid: MonthlyGridRow[],
  term: number,
  key: keyof Pick<MonthlyGridRow, "baseRentPSF" | "freeRentPSF" | "tiPSF" | "lcPSF" | "netCFPSF">,
): number {
  let total = 0;
  for (let i = 0; i < term && i < grid.length; i++) total += grid[i][key];
  return total;
}

export function calcUndiscountedNER(grid: MonthlyGridRow[], term: number): number {
  if (term === 0) return 0;
  const totalNetCF = sumColumn(grid, term, "netCFPSF");
  return (totalNetCF / term) * 12;
}

/**
 * Discounted NER.
 *
 * The Excel uses `NPV(rate, flows) + flow1` to compensate for `NPV()` discounting
 * the first cash flow by 1 period (off-by-one). We avoid that gotcha by computing
 * the PV ourselves with i starting at 0 — month 1 is discounted by 0 periods,
 * which is what we want since lease commencement IS period 0.
 */
export function calcDiscountedNER(
  grid: MonthlyGridRow[],
  annualDiscountRate: number,
  term: number,
): number {
  if (term === 0) return 0;
  const r = annualDiscountRate / 12; // monthly compounding
  let pv = 0;
  for (let i = 0; i < term && i < grid.length; i++) {
    pv += grid[i].netCFPSF / Math.pow(1 + r, i);
  }
  return (pv / term) * 12;
}

// ---------------------------------------------------------------------------
// 5. Yield on Cost + averages
// ---------------------------------------------------------------------------

/**
 * Weighted-average annual rate over the term.
 * Includes the free-rent row at $0 (so free rent dilutes the average — same
 * as the Excel's H23 / L23 conventions).
 */
export function calcAvgRatePSF(schedule: AnnualScheduleRow[], term: number): number {
  if (term === 0) return 0;
  let weighted = 0;
  for (const row of schedule) {
    weighted += row.annualRatePSF * row.monthsActive;
  }
  return weighted / term;
}

// ---------------------------------------------------------------------------
// 6. The orchestrator
// ---------------------------------------------------------------------------

export function runScenario(
  inputs: ScenarioInputs,
  globals: Globals,
): ScenarioResults {
  const schedule = buildAnnualSchedule(inputs);
  const lcPSF = calcLC(schedule, globals.lcPercent);
  const grid = buildMonthlyGrid(inputs, globals, schedule, lcPSF);
  const term = inputs.leaseTermMonths;

  const undiscountedNER = calcUndiscountedNER(grid, term);
  const discountedNER = calcDiscountedNER(grid, globals.discountRate, term);

  const buildingCostPSF = globals.shellCostPSF + inputs.tiAllowancePSF + lcPSF;
  const avgRatePSF = calcAvgRatePSF(schedule, term);

  const yocYr1 = buildingCostPSF > 0 ? inputs.baseRatePSF / buildingCostPSF : 0;
  const yocTerm = buildingCostPSF > 0 ? avgRatePSF / buildingCostPSF : 0;

  const baseRent = sumColumn(grid, term, "baseRentPSF");
  const freeRent = sumColumn(grid, term, "freeRentPSF"); // negative
  const ti = sumColumn(grid, term, "tiPSF");             // negative
  const lc = sumColumn(grid, term, "lcPSF");             // negative
  const netCashFlow = baseRent + freeRent + ti + lc;

  const waterfall: WaterfallComponents = { baseRent, freeRent, ti, lc, netCashFlow };

  return {
    schedule,
    grid,
    undiscountedNER,
    discountedNER,
    yocYr1,
    yocTerm,
    buildingCostPSF,
    waterfall,
    totals: {
      lcPSF,
      freeRentValuePSF: -freeRent, // make the concession value positive
      tiPSF: inputs.tiAllowancePSF,
      avgRatePSF,
    },
    totalsAbsolute: {
      lc: lcPSF * inputs.proposedLeaseSF,
      freeRentValue: -freeRent * inputs.proposedLeaseSF,
      ti: inputs.tiAllowancePSF * inputs.proposedLeaseSF,
    },
  };
}
