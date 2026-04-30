/**
 * Pure calc engine for the RFP Analyzer.
 *
 * RULES OF THIS FILE
 *   1. No React. No npm deps. Stdlib only. Tests run in plain node.
 *   2. Every exported function is pure: same inputs → same outputs, no
 *      side effects, no hidden state. This is what lets the solver call
 *      runScenario thousands of times per slider drag without React
 *      reconciliation in the loop, and what lets us validate against the
 *      §12 targets in milliseconds.
 *   3. All dollar values are PSF unless suffixed `Total`. Rates are
 *      decimals (0.08, not 8). Months are 1-indexed in the monthly grid;
 *      year 1 is the first paying year of the schedule.
 *
 * TRACEABILITY
 *   Each helper notes which spec section it implements (RFP_Analysis_Spec.md).
 *   Where the rebuild diverges from Excel — to FIX a bug — the comment names
 *   the §10 quirk number being fixed.
 */

import type {
  AnnualRow,
  Globals,
  MonthlyRow,
  ScenarioInputs,
  ScenarioResults,
  ScenarioTotals,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Annual rent schedule  (spec §4)
// ─────────────────────────────────────────────────────────────────────────────
//
// The Excel builds rows 5–22 of cols G/H/I (UW) and K/L/M (Proposal):
//   row 5         : free-rent row, $0 rate, monthsActive = freeRentMonths
//   row 6 (year 1): annualPSF = baseRatePSF, monthsActive = 12 (or remainder)
//   row 7 (year 2): annualPSF = prev * (1 + escalation)
//   ...
// The §10 #1 bug is that UW caps at year 10 while Proposal goes to year 17.
// We always run to max(leaseTermMonths, horizonMonths), filling 12 months
// per year greedily until the term is exhausted, then padding with $0 rows
// past lease end up to the horizon (so both scenarios can be PV'd to a
// shared horizon).
//
// "free rent first" — the I/M column logic in Excel allocates free-rent
// months before paying months. We mirror that: months 1..freeRent are
// free, months freeRent+1..leaseTerm are paying, then $0 past leaseTerm.
//
// Why effectivePSF? It's the months-weighted contribution of that year to
// the avg rate (§7 H23 formula). Storing it once means the avg rate calc
// is a simple sum / sum.
function buildAnnualSchedule(
  inputs: ScenarioInputs,
  horizonMonths: number,
): AnnualRow[] {
  const { baseRatePSF, escalation, freeRentMonths, leaseTermMonths } = inputs;
  const totalMonths = Math.max(leaseTermMonths, horizonMonths);

  const rows: AnnualRow[] = [];

  // Year 0 == free rent row. Always present (zero rows if freeRent = 0
  // would be valid, but keeping a stable shape simplifies UI rendering).
  rows.push({
    year: 0,
    monthlyRatePSF: 0,
    annualPSF: 0,
    monthsActive: freeRentMonths,
    effectivePSF: 0,
  });

  let monthsConsumed = freeRentMonths;
  let annualPSF = baseRatePSF;
  let yearIdx = 1;

  while (monthsConsumed < totalMonths) {
    const monthsRemainingInTerm = Math.max(0, leaseTermMonths - monthsConsumed);
    const monthsRemainingInHorizon = totalMonths - monthsConsumed;
    const monthsActive = Math.min(12, monthsRemainingInHorizon);

    // If we're past the paying term, this is a $0 horizon-pad row.
    const isPaying = monthsRemainingInTerm > 0;
    const payingMonthsThisYear = Math.min(monthsActive, monthsRemainingInTerm);

    if (isPaying) {
      // Excel: H7 = H6 * (1 + escalation) * I7/12
      // Year 1 uses baseRatePSF unbumped; year 2+ bump first.
      const annualForYear = yearIdx === 1
        ? annualPSF
        : annualPSF * (1 + escalation);

      // We carry annualForYear forward as the new base for next year's bump.
      annualPSF = annualForYear;

      const effectivePSF = (annualForYear * payingMonthsThisYear) / 12;

      rows.push({
        year: yearIdx,
        monthlyRatePSF: annualForYear / 12,
        annualPSF: annualForYear,
        monthsActive,
        effectivePSF,
      });
    } else {
      // Past lease end — pad with zeros to fill the horizon.
      rows.push({
        year: yearIdx,
        monthlyRatePSF: 0,
        annualPSF: 0,
        monthsActive,
        effectivePSF: 0,
      });
    }

    monthsConsumed += monthsActive;
    yearIdx += 1;

    // Safety: in case of pathological inputs, don't loop forever.
    if (yearIdx > 100) break;
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Months-weighted average rate  (spec §4 / §7)
// ─────────────────────────────────────────────────────────────────────────────
//
// Excel: H23 = SUMPRODUCT(H5:H15, I5:I15) / SUM(I5:I15)
// In words: average annual PSF, weighted by months in each year.
// Free-rent row (year 0) participates with annualPSF = 0 — that's intentional;
// it pulls the average down because free rent is part of the term.
//
// We deliberately exclude horizon-pad rows (year > leaseTerm) so the avg
// reflects the actual lease, not the analysis horizon.
function computeAvgRatePSF(
  schedule: AnnualRow[],
  leaseTermMonths: number,
): number {
  let monthsConsumed = 0;
  let weightedSum = 0;
  let totalMonths = 0;

  for (const row of schedule) {
    if (monthsConsumed >= leaseTermMonths) break;
    const monthsInThisRow = Math.min(
      row.monthsActive,
      leaseTermMonths - monthsConsumed,
    );
    weightedSum += row.annualPSF * monthsInThisRow;
    totalMonths += monthsInThisRow;
    monthsConsumed += monthsInThisRow;
  }

  return totalMonths > 0 ? weightedSum / totalMonths : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Leasing commission PSF  (spec §6)
// ─────────────────────────────────────────────────────────────────────────────
//
// Standard industrial split-tier:
//   Years 1–5: full lcPercent on rent paid
//   Years 6+: half lcPercent on rent paid
//
// §10 #2 says Excel's UW formula includes the free-rent row in the years 1–5
// SUM (which is harmless because free rent annualPSF is 0) but Proposal
// excludes it. We pick the cleaner convention and exclude the free-rent
// row from both sums. We also use effectivePSF (months-weighted) rather
// than annualPSF, so partial trailing years are handled correctly.
//
// We also exclude horizon-pad rows past leaseTerm — they're not paying years.
function computeLcPSF(
  schedule: AnnualRow[],
  lcPercent: number,
  leaseTermMonths: number,
): number {
  let monthsConsumed = 0;
  let earlySum = 0; // years 1–5
  let lateSum = 0;  // years 6+

  for (const row of schedule) {
    if (row.year === 0) continue; // skip free rent row
    if (monthsConsumed >= leaseTermMonths) break;

    if (row.year <= 5) {
      earlySum += row.effectivePSF;
    } else {
      lateSum += row.effectivePSF;
    }
    monthsConsumed += row.monthsActive;
  }

  return lcPercent * earlySum + (lcPercent / 2) * lateSum;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Monthly cash-flow grid  (spec §9)
// ─────────────────────────────────────────────────────────────────────────────
//
// One column per month, length = max(leaseTerm, horizon). Rows in spec:
//   35: Base Rent    — annualPSF for that year / 12, $0 past leaseTerm
//   37: Free Rent    — −baseRent during free-rent months
//   43: Base TI      — −tiAllowancePSF in month 1 only (lump)
//   48: LC           — placement depends on lcPaymentStructure (§ user brief)
//
// LC payment structure (NOT in original Excel — added per user brief):
//   '100_upfront' : full LC at month 1 (matches Excel's intent)
//   '50_50'       : half at month 1, half at month freeRent + 1 (rent comm.)
//   'spread'      : equal monthly slices over leaseTermMonths
//
// §10 #6: Excel's monthly LC row uses a broken VLOOKUP. We replace it
// entirely with this clean structure-driven placement.
//
// Why month-1 indexed: the spec's monthly grid starts at column Q which
// represents the first month of the analysis. PV math elsewhere treats
// month 1 as t=0 (Excel's NPV() gotcha — see computeDiscountedPV below),
// so this aligns.
function buildMonthlyGrid(
  inputs: ScenarioInputs,
  globals: Globals,
  schedule: AnnualRow[],
  lcPSF: number,
): MonthlyRow[] {
  const { freeRentMonths, leaseTermMonths, tiAllowancePSF } = inputs;
  const { horizonMonths, lcPaymentStructure } = globals;
  const totalMonths = Math.max(leaseTermMonths, horizonMonths);

  // Pre-compute base-rent-per-month over the full timeline by walking the
  // annual schedule. This is the §9 row 35 INDEX(...)/12 lookup.
  const baseRentByMonth: number[] = new Array(totalMonths).fill(0);
  let monthCursor = 0;
  for (const row of schedule) {
    for (let i = 0; i < row.monthsActive && monthCursor < totalMonths; i++) {
      baseRentByMonth[monthCursor] = row.monthlyRatePSF;
      monthCursor += 1;
    }
  }

  // LC payment placement.
  const lcByMonth: number[] = new Array(totalMonths).fill(0);
  if (lcPaymentStructure === '100_upfront') {
    if (totalMonths > 0) lcByMonth[0] = -lcPSF;
  } else if (lcPaymentStructure === '50_50') {
    const half = lcPSF / 2;
    if (totalMonths > 0) lcByMonth[0] = -half;
    // Rent commencement = month freeRentMonths + 1 (1-indexed) = index freeRentMonths.
    const rentCommIdx = freeRentMonths;
    if (rentCommIdx >= 0 && rentCommIdx < totalMonths) {
      lcByMonth[rentCommIdx] += -half;
    }
  } else {
    // 'spread': equal monthly slices over the paying lease term.
    const slice = leaseTermMonths > 0 ? lcPSF / leaseTermMonths : 0;
    for (let i = 0; i < leaseTermMonths && i < totalMonths; i++) {
      lcByMonth[i] = -slice;
    }
  }

  const grid: MonthlyRow[] = [];
  for (let i = 0; i < totalMonths; i++) {
    const month = i + 1;
    const baseRent = baseRentByMonth[i] ?? 0;
    const isFreeRent = i < freeRentMonths;
    const freeRent = isFreeRent ? -baseRent : 0;
    const rentalRevenue = baseRent + freeRent;
    const ti = i === 0 ? -tiAllowancePSF : 0;
    const lc = lcByMonth[i] ?? 0;
    const netCashFlow = rentalRevenue + ti + lc;

    grid.push({
      month,
      baseRentPSF: baseRent,
      freeRentPSF: freeRent,
      rentalRevenuePSF: rentalRevenue,
      tiPSF: ti,
      lcPSF: lc,
      netCashFlowPSF: netCashFlow,
    });
  }

  return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Present-value helper  (spec §9, fixing §10 #4)
// ─────────────────────────────────────────────────────────────────────────────
//
// Excel's NPV() assumes the first cash flow happens at end of period 1, but
// our month 1 IS period 0 (the lease starts then). The spec's M44 formula
// is `NPV(L29/12, R35:IT35) + Q35` — exactly this t=0-anchored convention.
//
// Monthly compounding via annual/12 (spec §9, locked in plan).
//
// Critical: §10 #4 was Excel referencing $D$8 (=1.0) instead of $L$29 for
// PV of LC, TI, etc. — that gave a 100% discount rate on those line items.
// In our rebuild ALL components use the same `annualRate / 12`. One discount
// rate, applied everywhere — see how `computeDiscountedNER` below uses
// this single helper for every component.
function pv(cashFlows: number[], monthlyRate: number): number {
  // Anchor at t = 0 for cashFlows[0], t = 1 for cashFlows[1], etc.
  let total = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    total += (cashFlows[t] ?? 0) / Math.pow(1 + monthlyRate, t);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Discounted NER  (spec §9)
// ─────────────────────────────────────────────────────────────────────────────
//
// PV the net cash flow stream, then annualize by leaseTermMonths.
// Denominator is nominal months (NOT a PV-annuity), per the spec's M53
// formula: `M52 / Lease Term × 12`.
//
// We PV the net cash flow stream as a single column rather than PV'ing
// each component separately and summing — this is mathematically identical
// (linearity of PV) but keeps the function trivially correct: one rate,
// one stream, one PV. No way for one component to use the wrong rate.
function computeDiscountedNER(
  grid: MonthlyRow[],
  leaseTermMonths: number,
  annualDiscountRate: number,
): number {
  if (leaseTermMonths === 0) return 0;
  const monthlyRate = annualDiscountRate / 12;
  const cashFlows = grid.map((r) => r.netCashFlowPSF);
  const pvTotal = pv(cashFlows, monthlyRate);
  return (pvTotal / leaseTermMonths) * 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Top-level entry: runScenario
// ─────────────────────────────────────────────────────────────────────────────
//
// The single function the solver and the UI call. Inputs in → results out.
// Every derived field on ScenarioResults is computed here.
//
// Order matters:
//   1. annual schedule depends on inputs only
//   2. avg rate depends on schedule + term
//   3. LC PSF depends on schedule + lcPercent + term
//   4. monthly grid depends on schedule + LC PSF + structure
//   5. totals come from the grid
//   6. building cost = shell + TI + LC
//   7. YoC and NER come from the above
export function runScenario(
  inputs: ScenarioInputs,
  globals: Globals,
): ScenarioResults {
  const { leaseTermMonths, baseRatePSF, tiAllowancePSF } = inputs;
  const { horizonMonths, lcPercent, shellCostPSF, discountRate } = globals;

  const annualSchedule = buildAnnualSchedule(inputs, horizonMonths);
  const avgRatePSF = computeAvgRatePSF(annualSchedule, leaseTermMonths);
  const lcPSF = computeLcPSF(annualSchedule, lcPercent, leaseTermMonths);
  const monthlyGrid = buildMonthlyGrid(inputs, globals, annualSchedule, lcPSF);

  // Totals — sum across the grid up to leaseTermMonths only (horizon pad
  // is intentionally zero-cash so it wouldn't change the sum, but slicing
  // makes intent explicit and protects against any future non-zero pad).
  const totals = aggregateTotals(monthlyGrid, leaseTermMonths);

  // Building cost (§7 + §10 #3 fix): shell becomes an input, applied to both.
  const buildingCostPSF = shellCostPSF + tiAllowancePSF + lcPSF;

  const yocYr1 = buildingCostPSF > 0 ? baseRatePSF / buildingCostPSF : 0;
  const yocTerm = buildingCostPSF > 0 ? avgRatePSF / buildingCostPSF : 0;

  // Undiscounted NER (§8): netCashFlow / months × 12.
  const undiscountedNER = leaseTermMonths > 0
    ? (totals.netCashFlowPSF / leaseTermMonths) * 12
    : 0;

  const discountedNER = computeDiscountedNER(
    monthlyGrid,
    leaseTermMonths,
    discountRate,
  );

  return {
    annualSchedule,
    monthlyGrid,
    avgRatePSF,
    lcPSF,
    buildingCostPSF,
    yocYr1,
    yocTerm,
    undiscountedNER,
    discountedNER,
    totals,
  };
}

function aggregateTotals(
  grid: MonthlyRow[],
  leaseTermMonths: number,
): ScenarioTotals {
  let baseRentPSF = 0;
  let freeRentPSF = 0;
  let tiPSF = 0;
  let lcPSF = 0;
  let netCashFlowPSF = 0;

  const upTo = Math.min(grid.length, leaseTermMonths);
  for (let i = 0; i < upTo; i++) {
    const row = grid[i]!;
    baseRentPSF += row.baseRentPSF;
    freeRentPSF += row.freeRentPSF;
    tiPSF += row.tiPSF;
    lcPSF += row.lcPSF;
    netCashFlowPSF += row.netCashFlowPSF;
  }

  return { baseRentPSF, freeRentPSF, tiPSF, lcPSF, netCashFlowPSF };
}

// Internal exports kept for tests; the public API is `runScenario`.
export const __internals = {
  buildAnnualSchedule,
  computeAvgRatePSF,
  computeLcPSF,
  buildMonthlyGrid,
  computeDiscountedNER,
  pv,
};
