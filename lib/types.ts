/**
 * Core data model for the RFP Analyzer.
 *
 * Conventions:
 * - All money is USD. PSF = "per square foot".
 * - All rates are decimals: 0.03 = 3%, NOT 3.
 * - All durations are months unless suffixed (e.g. annualRatePSF).
 * - Negative numbers in cash-flow rows mean money OUT (concessions, LC, TI).
 */

export type LCStructure = "upfront" | "split50";
//  upfront — full LC paid in month 1
//  split50 — 50% in month 1, 50% at rent commencement (after free rent)

export type LCCalculation = "tiered" | "flat";
//  tiered — full % on yr 1-5 rent, half % on yr 6+ rent (industrial standard)
//  flat   — full % on all years' rent

export interface Globals {
  /** Annual discount rate, decimal (0.08 = 8%). Compounded monthly in PV. */
  discountRate: number;
  /** Building shell cost PSF, $ — replaces the Excel hardcoded $140. */
  shellCostPSF: number;
  /** Default lease horizon in months. Used when a scenario's term is shorter. */
  horizonMonths: number;
}

export interface ScenarioInputs {
  /** Display name (e.g. "UW", "Counter v1"). */
  name: string;

  /**
   * Optional CSV deal code that this scenario was last loaded from. Audit
   * trail only — clearing or editing inputs doesn't unset this. The deal
   * picker writes it; nothing in the calc engine reads it.
   */
  dealCode?: string;

  // SF block
  projectSF: number;
  buildingSF: number;
  proposedLeaseSF: number;

  // Rent block
  /** Annual base rent PSF in year 1, $. */
  baseRatePSF: number;
  /** Annual escalation, decimal (0.03 = 3%). */
  escalation: number;
  /**
   * Optional per-year rent override. Sparse: index Y-1 corresponds to
   * lease year Y. A `null` (or undefined) entry means "use the formula"
   * (constant escalation). A number overrides the rate for that year
   * while leaving other years on the formula.
   */
  rentScheduleOverride?: (number | null)[];

  /**
   * Landlord-rep brokerage commission rate, decimal (0.045 = 4.5%). Per
   * scenario because deals can have different broker structures (e.g. UW
   * assumes a co-broke split, but a direct deal might be LL-rep only).
   */
  lcLLRepPercent: number;
  /** Tenant-rep brokerage commission rate, decimal. Per scenario. */
  lcTenantRepPercent: number;
  /** How LC totals are calculated against the rent schedule (per scenario). */
  lcCalculation: LCCalculation;
  /** How LC payments are timed (per scenario). */
  lcStructure: LCStructure;

  // Concessions
  /** TI allowance PSF, $. */
  tiAllowancePSF: number;
  /** Free rent in months (always front-loaded — months 1..freeRentMonths). */
  freeRentMonths: number;

  // Term
  /** Total lease term in months, INCLUDING free-rent period. */
  leaseTermMonths: number;
  /** ISO date string (YYYY-MM-DD) for lease commencement. */
  leaseCommencement: string;
  /**
   * ISO date string (YYYY-MM-DD) for lease execution (signing).
   * Triggers 50% commission payment and the start of TI work.
   * If equal to leaseCommencement (the default for new scenarios), the model
   * collapses to single-anchor behavior identical to the original spec.
   */
  leaseExecutionDate: string;
  /**
   * How many months the TI work takes. The TI allowance is paid out evenly
   * across this many months starting at execution. 1 = single lump sum
   * (the original spec behavior).
   */
  tiDurationMonths: number;
}

/** One row of the year-by-year rent schedule. */
export interface AnnualScheduleRow {
  /** 0 = free-rent row, 1 = year 1, 2 = year 2, ... */
  year: number;
  /** Annual rate PSF for that year, $. 0 for the free-rent row. */
  annualRatePSF: number;
  /** How many months of the term fall into this year (0-12). */
  monthsActive: number;
}

/** One row of the month-by-month cash flow grid (all values PSF). */
export interface MonthlyGridRow {
  /** 1-indexed month number from lease execution. */
  month: number;
  /** ISO date string for this month. */
  date: string;
  baseRentPSF: number;
  /** Negative offset to base rent during free-rent period (NER bookkeeping). */
  freeRentPSF: number;
  /** Negative — TI draw spread across tiDurationMonths starting at execution. */
  tiPSF: number;
  /** Negative — leasing commission, timing depends on lcStructure. */
  lcPSF: number;
  /** Sum of the four columns above (NER basis). */
  netCFPSF: number;
}

/** PSF totals over the term — feeds the NER waterfall chart. */
export interface WaterfallComponents {
  baseRent: number;
  freeRent: number;     // negative
  ti: number;           // negative
  lc: number;           // negative
  netCashFlow: number;  // sum of the four
}

export interface ScenarioResults {
  schedule: AnnualScheduleRow[];
  grid: MonthlyGridRow[];

  /** Headline metric: undiscounted annual NER PSF, $. */
  undiscountedNER: number;
  /** Headline metric: discounted annual NER PSF, $. */
  discountedNER: number;

  /** Year-1 base rate ÷ building cost PSF, decimal. */
  yocYr1: number;
  /** Avg rate over term ÷ building cost PSF, decimal. */
  yocTerm: number;

  /** shellCostPSF + tiAllowancePSF + lcPSF, $. */
  buildingCostPSF: number;

  /** PSF — feeds the waterfall. */
  waterfall: WaterfallComponents;

  /** Convenience: PSF totals (mostly for UI). */
  totals: {
    lcPSF: number;
    /** Free rent value, expressed as a positive $ (concession value). */
    freeRentValuePSF: number;
    tiPSF: number;
    /** Weighted-average annual rate over term, $. */
    avgRatePSF: number;
  };

  /** Convenience: absolute $ totals (= PSF × proposedLeaseSF). */
  totalsAbsolute: {
    lc: number;
    freeRentValue: number;
    ti: number;
  };
}

/** The full app state — what gets persisted to localStorage. */
export interface AppState {
  property: {
    name: string;
  };
  globals: Globals;
  scenarios: Array<{ id: string; inputs: ScenarioInputs }>;
  comparison: {
    aId: string;
    bId: string;
  };
}
