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
  LCCalculation,
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
  const { leaseTermMonths } = inputs;
  // Free rent is months in real life — round to handle solver's continuous
  // bisection (any fractional x maps to the same integer-month behavior).
  const freeRentMonths = Math.round(inputs.freeRentMonths);
  const freeStart = Math.max(1, Math.round(inputs.freeRentStartMonth ?? 1));
  const isFrontLoaded = freeStart === 1 && freeRentMonths > 0;
  const rows: AnnualScheduleRow[] = [];

  // Year 0 (free rent) is only present for FRONT-LOADED abatement: rent years
  // SHIFT to start after the abatement (Excel/spec semantics — rent yr 1
  // begins at rent commencement, which is after the free period).
  // For MID-TERM abatement, rent years run on the contract calendar — no
  // year-0 row, year 1 = months 1-12 of the lease.
  let remaining: number;
  if (isFrontLoaded) {
    const freeMonths = Math.min(freeRentMonths, leaseTermMonths);
    rows.push({ year: 0, annualRatePSF: 0, monthsActive: freeMonths });
    remaining = leaseTermMonths - freeMonths;
  } else {
    remaining = leaseTermMonths;
  }

  let year = 1;
  while (remaining > 0) {
    const monthsActive = Math.min(12, remaining);
    rows.push({ year, annualRatePSF: annualRateForYear(inputs, year), monthsActive });
    remaining -= monthsActive;
    year += 1;
  }

  return rows;
}

/**
 * Annual rate for lease year Y (1-indexed). Resolves in priority order:
 *   1. Manual override (rentScheduleOverride[Y-1]) if set
 *   2. Constant escalation: baseRatePSF × (1 + escalation)^(Y-1)
 *
 * Used by both buildAnnualSchedule (for LC + display) and buildMonthlyGrid
 * (for per-month rate lookup, decoupled from the year-0 free-rent hack).
 */
function annualRateForYear(inputs: ScenarioInputs, year: number): number {
  const override = inputs.rentScheduleOverride?.[year - 1];
  if (override != null && Number.isFinite(override)) return override;
  return inputs.baseRatePSF * Math.pow(1 + inputs.escalation, year - 1);
}

// ---------------------------------------------------------------------------
// 2. Leasing commission (split-tier)
// ---------------------------------------------------------------------------

/**
 * Leasing commission total ($/SF over the term).
 *
 * Two calculation modes:
 *   tiered — full lcPercent on yrs 1-5 rent + lcPercent/2 on yrs 6+ rent
 *            (industrial standard; brokers earn full LC on the early "won"
 *             portion and a reduced rate on later renewal-equivalent years).
 *   flat   — full lcPercent on rent across the entire term.
 *
 * "Rent collected in year Y" = annualRatePSF[Y] × monthsActive[Y] / 12.
 * The free-rent row (year 0) is excluded — it contributes $0 either way,
 * but skipping it makes the convention explicit.
 */
export function calcLC(
  schedule: AnnualScheduleRow[],
  lcPercent: number,
  calculation: LCCalculation = "tiered",
): number {
  let tier1 = 0; // years 1-5
  let tier2 = 0; // years 6+

  for (const row of schedule) {
    if (row.year === 0) continue;
    const rentPSF = row.annualRatePSF * (row.monthsActive / 12);
    if (row.year <= 5) tier1 += rentPSF;
    else tier2 += rentPSF;
  }

  if (calculation === "flat") return lcPercent * (tier1 + tier2);
  return lcPercent * tier1 + (lcPercent / 2) * tier2;
}

// ---------------------------------------------------------------------------
// 3. Monthly cash flow grid
// ---------------------------------------------------------------------------

/**
 * Build a month-by-month grid of PSF cash flows over the lease horizon.
 *
 * Origin: month 1 = lease execution date. If executionDate < commencementDate,
 * the first `commencementOffset` months are pre-rent (TI draws, commission
 * half #1 may land here). Free rent and base rent kick in at month
 * `commencementOffset + 1`. If executionDate === commencementDate (the default
 * for legacy scenarios), commencementOffset = 0 and the grid collapses to the
 * original single-anchor behavior.
 *
 * The grid extends to `globals.horizonMonths` past execution; months past
 * (commencementOffset + leaseTerm) are all zeros. This symmetry — every
 * scenario runs the same length — fixes one of the Excel's structural bugs.
 */
export function buildMonthlyGrid(
  inputs: ScenarioInputs,
  globals: Globals,
  schedule: AnnualScheduleRow[],
  lcTotalPSF: number,
): MonthlyGridRow[] {
  const term = inputs.leaseTermMonths;
  const free = Math.min(Math.round(inputs.freeRentMonths), term);

  // Mid-term abatement window: 1-indexed from commencement. Defaults to 1
  // (front-loaded), preserving original behavior. Clamp the window to fit
  // inside the lease term.
  const freeStart = Math.max(1, Math.round(inputs.freeRentStartMonth ?? 1));
  const freeEnd = Math.min(freeStart + free - 1, term);

  const execution = new Date(inputs.leaseExecutionDate);
  const commencement = new Date(inputs.leaseCommencement);
  const commencementOffset = Math.max(0, monthsBetween(execution, commencement));

  const tiDuration = Math.max(1, Math.round(inputs.tiDurationMonths));

  const totalLeaseSpan = commencementOffset + term;
  const horizon = Math.max(globals.horizonMonths, totalLeaseSpan);

  // Lookup: monthFromCommencement (1-indexed) → annualRatePSF, derived from
  // the schedule's row layout. For front-loaded abatement, the schedule has
  // a year-0 row of `freeRentMonths` zero-rate slots at the front, then years
  // 1..N of paying-year rates ("rent years" shift after the abatement). For
  // mid-term abatement, the schedule has no year-0 row — rent years align
  // with the contract calendar (year 1 = months 1-12 of lease).
  const monthToRate = new Array<number>(term).fill(0);
  let cursor = 0;
  for (const row of schedule) {
    for (let i = 0; i < row.monthsActive && cursor < term; i++) {
      monthToRate[cursor++] = row.annualRatePSF;
    }
  }

  // Phantom rate for valuing free rent: the rate that WOULD be charged in
  // the corresponding calendar lease year. Calendar-indexed (not schedule-
  // indexed), so it's correct for both front-loaded and mid-term abatement.
  // Quirk #10 fix: uses the actual year's rate, not Yr1's.
  const phantomRateForMonth = (monthFromCommencement: number): number => {
    const calendarYear = Math.floor((monthFromCommencement - 1) / 12) + 1;
    return annualRateForYear(inputs, calendarYear);
  };

  // LC payment timing — half at execution (m=1), half at rent commencement
  // when split50; the full amount at execution when upfront.
  const lcAtExecution = globals.lcStructure === "upfront" ? -lcTotalPSF : -lcTotalPSF / 2;
  const lcAtRC = globals.lcStructure === "upfront" ? 0 : -lcTotalPSF / 2;
  // 1-indexed month (from execution) where rent collection first kicks in.
  // Front-loaded free rent (start === 1, free > 0) pushes rent commencement
  // out by `free` months; a mid-term abatement leaves rent starting at the
  // lease commencement.
  const rcOffset = freeStart === 1 ? free : 0;
  const rcMonth = commencementOffset + rcOffset + 1;

  const tiPerMonth = tiDuration > 0 ? -inputs.tiAllowancePSF / tiDuration : 0;

  const grid: MonthlyGridRow[] = [];
  for (let m = 1; m <= horizon; m++) {
    const monthFromCommencement = m - commencementOffset; // 1-indexed during lease
    const inLease = monthFromCommencement >= 1 && monthFromCommencement <= term;
    const annualRate = inLease ? monthToRate[monthFromCommencement - 1] : 0;

    const isFree =
      inLease && monthFromCommencement >= freeStart && monthFromCommencement <= freeEnd;
    const baseRentPSF = isFree ? 0 : annualRate / 12;
    const freeRentPSF = isFree ? -phantomRateForMonth(monthFromCommencement) / 12 : 0;

    // TI: spread evenly across tiDurationMonths starting at month 1 (execution).
    const tiPSF = m >= 1 && m <= tiDuration ? tiPerMonth : 0;

    let lcPSF = 0;
    if (m === 1) lcPSF += lcAtExecution;
    if (m === rcMonth && lcAtRC !== 0 && rcMonth !== 1) lcPSF += lcAtRC;
    // Edge case: execution = commencement AND no free rent → both LC halves
    // collapse to month 1 (rcMonth === 1). The lcAtExecution already holds half;
    // add the second half here to preserve the original lump-in-month-1 behavior.
    if (m === 1 && rcMonth === 1 && lcAtRC !== 0) lcPSF += lcAtRC;

    const netCFPSF = baseRentPSF + freeRentPSF + tiPSF + lcPSF;

    grid.push({
      month: m,
      date: addMonths(execution, m - 1).toISOString().slice(0, 10),
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

/** Whole-month difference (UTC, calendar-month boundary). */
function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

// ---------------------------------------------------------------------------
// 4. NER (undiscounted + discounted)
// ---------------------------------------------------------------------------

/**
 * Sum a column of the monthly grid over the first `span` months.
 * `span` defaults to the grid length to preserve the simple two-arg call site.
 */
function sumColumn(
  grid: MonthlyGridRow[],
  span: number,
  key: keyof Pick<MonthlyGridRow, "baseRentPSF" | "freeRentPSF" | "tiPSF" | "lcPSF" | "netCFPSF">,
): number {
  let total = 0;
  for (let i = 0; i < span && i < grid.length; i++) total += grid[i][key];
  return total;
}

/**
 * Undiscounted NER.
 *
 * `span` is how many months of grid to include in the sum (= commencement
 * offset + lease term). `term` is the rent-paying lease term in months;
 * NER is normalized per year over `term`. When execution === commencement
 * the two are equal — original spec behavior.
 */
export function calcUndiscountedNER(
  grid: MonthlyGridRow[],
  span: number,
  term: number,
): number {
  if (term === 0) return 0;
  const totalNetCF = sumColumn(grid, span, "netCFPSF");
  return (totalNetCF / term) * 12;
}

/**
 * Discounted NER.
 *
 * The Excel uses `NPV(rate, flows) + flow1` to compensate for `NPV()` discounting
 * the first cash flow by 1 period (off-by-one). We avoid that gotcha by computing
 * the PV ourselves with i starting at 0 — month 1 is discounted by 0 periods,
 * which is what we want since lease execution IS period 0.
 */
export function calcDiscountedNER(
  grid: MonthlyGridRow[],
  annualDiscountRate: number,
  span: number,
  term: number,
): number {
  if (term === 0) return 0;
  const r = annualDiscountRate / 12; // monthly compounding
  let pv = 0;
  for (let i = 0; i < span && i < grid.length; i++) {
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
  const totalLCPercent = globals.lcLLRepPercent + globals.lcTenantRepPercent;
  const lcPSF = calcLC(schedule, totalLCPercent, globals.lcCalculation);
  const grid = buildMonthlyGrid(inputs, globals, schedule, lcPSF);
  const term = inputs.leaseTermMonths;

  const execution = new Date(inputs.leaseExecutionDate);
  const commencement = new Date(inputs.leaseCommencement);
  const commencementOffset = Math.max(
    0,
    (commencement.getUTCFullYear() - execution.getUTCFullYear()) * 12 +
      (commencement.getUTCMonth() - execution.getUTCMonth()),
  );
  const span = commencementOffset + term;

  const undiscountedNER = calcUndiscountedNER(grid, span, term);
  const discountedNER = calcDiscountedNER(grid, globals.discountRate, span, term);

  const buildingCostPSF = globals.shellCostPSF + inputs.tiAllowancePSF + lcPSF;
  const avgRatePSF = calcAvgRatePSF(schedule, term);

  const yocYr1 = buildingCostPSF > 0 ? inputs.baseRatePSF / buildingCostPSF : 0;
  const yocTerm = buildingCostPSF > 0 ? avgRatePSF / buildingCostPSF : 0;

  const baseRent = sumColumn(grid, span, "baseRentPSF");
  const freeRent = sumColumn(grid, span, "freeRentPSF"); // negative
  const ti = sumColumn(grid, span, "tiPSF");             // negative
  const lc = sumColumn(grid, span, "lcPSF");             // negative
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
