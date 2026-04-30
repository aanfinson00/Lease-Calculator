/**
 * Core type contracts for the RFP Analyzer.
 *
 * Why these types live in their own file:
 *   - calc.ts and solver.ts both import from here, so a separate types
 *     module keeps imports unidirectional (no cycles).
 *   - The UI (later) will import the same types so the shape of state
 *     and results is consistent end-to-end.
 *
 * Convention: dollar values are PSF (per square foot) unless suffixed
 * with `Total`. Rates are decimals (0.08, not 8).
 */

export type LCPaymentStructure = '100_upfront' | '50_50' | 'spread';

/** §3 inputs for one scenario. */
export interface ScenarioInputs {
  // Sizes
  projectSF: number;
  buildingSF: number;
  proposedLeaseSF: number;

  // Rent terms
  baseRatePSF: number;          // Year-1 annual rent PSF
  escalation: number;           // decimal, e.g. 0.03 for 3%
  freeRentMonths: number;       // integer months, applied at front of term
  leaseTermMonths: number;      // total months including any free rent
  leaseCommencement: string;    // ISO date — used for the date axis only

  // Concessions / costs
  tiAllowancePSF: number;
}

/**
 * Globals are shared across all scenarios in one comparison.
 * Pulled out separately because changing them should propagate to every
 * scenario at once (e.g. shell cost, discount rate). The original Excel
 * had these inconsistently scattered — keeping them in one place is a fix.
 */
export interface Globals {
  discountRate: number;          // annual, monthly compounding (annual/12)
  lcPercent: number;             // default 0.09
  shellCostPSF: number;          // dynamic input, default $140
  horizonMonths: number;         // default 204 (17 yrs)
  lcPaymentStructure: LCPaymentStructure; // default '50_50'
}

/** One row of the year-by-year rent schedule. */
export interface AnnualRow {
  year: number;                  // 1-indexed; year 0 is reserved for free rent
  monthlyRatePSF: number;        // annualPSF / 12 (per-month for that year)
  annualPSF: number;             // PSF rate for that year (full-year basis)
  monthsActive: number;          // 0–12; partial in the trailing year
  effectivePSF: number;          // annualPSF * monthsActive / 12
}

/** One column of the monthly cash-flow grid. */
export interface MonthlyRow {
  month: number;                 // 1-indexed
  baseRentPSF: number;           // monthly PSF cash inflow (positive)
  freeRentPSF: number;           // negative offset during free-rent months
  rentalRevenuePSF: number;      // baseRent + freeRent
  tiPSF: number;                 // negative; lump in month 1
  lcPSF: number;                 // negative; placement depends on structure
  netCashFlowPSF: number;        // sum of all above
}

export interface ScenarioTotals {
  baseRentPSF: number;           // sum over schedule
  freeRentPSF: number;           // negative
  tiPSF: number;                 // negative
  lcPSF: number;                 // negative
  netCashFlowPSF: number;        // = sum of the above
}

export interface ScenarioResults {
  annualSchedule: AnnualRow[];
  monthlyGrid: MonthlyRow[];

  // Headline metrics
  avgRatePSF: number;            // months-weighted average annual PSF
  lcPSF: number;                 // total LC PSF (positive)
  buildingCostPSF: number;       // shell + TI + LC
  yocYr1: number;                // baseRatePSF / buildingCostPSF
  yocTerm: number;               // avgRatePSF / buildingCostPSF
  undiscountedNER: number;       // PSF/year
  discountedNER: number;         // PSF/year
  totals: ScenarioTotals;
}

/** Full app state — what we persist to localStorage. */
export interface Scenario {
  id: string;
  name: string;
  inputs: ScenarioInputs;
}

export interface AppState {
  property: {
    name: string;
    date: string;                // ISO date
  };
  globals: Globals;
  scenarios: Scenario[];
  comparison: { aId: string; bId: string };
}

/** Free-variable slots for the Hold-NER solver. */
export type FreeVariable =
  | 'baseRatePSF'
  | 'escalation'
  | 'freeRentMonths'
  | 'tiAllowancePSF'
  | 'discountRate';

export type SolverResult =
  | { ok: true; value: number; iterations: number }
  | { ok: false; reason: 'no_bracket' | 'unreachable_in_range'; value?: number };
