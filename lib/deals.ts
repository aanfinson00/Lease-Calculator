/**
 * Deal data from the UW assumptions CSV (`public/deals.csv`).
 *
 * The CSV is a static asset served from /deals.csv. Loaded once at app
 * startup, parsed into normalized Deal objects, and held in memory so the
 * deal picker can search instantly.
 *
 * Column mapping (CSV → Deal):
 *   Code              → code (search key + audit trail)
 *   Deal Name         → dealName (displayed)
 *   Tenant Name       → tenantName (displayed)
 *   Square Feet       → squareFeet
 *   Trended Rent      → baseRatePSF (rate at lease start)
 *   Rent Escalations  → escalation (in-lease escalator)
 *   Lease Term        → leaseTermMonths
 *   Start Month (Date)→ commencement (ISO yyyy-mm-dd)
 *   Free Rent (months)→ freeRentMonths
 *   TIs               → tiAllowancePSF
 *   LCs / LC Override → lcPercent (Override wins when > 0)
 *   Status            → status (displayed only)
 *
 * Skipped: Untrended Rent, Annual Growth, Start Month Post Completion,
 * Starting Month, MLA — pre-start trending / model bookkeeping that
 * doesn't map to our scenario inputs.
 */

import type { ScenarioInputs } from "./types";

export interface Deal {
  code: string;
  dealName: string;
  tenantName: string;
  squareFeet: number;
  baseRatePSF: number;
  escalation: number;
  leaseTermMonths: number;
  commencement: string; // ISO yyyy-mm-dd
  freeRentMonths: number;
  tiAllowancePSF: number;
  lcPercent: number;
  status: string;
}

// ---------------------------------------------------------------------------
// CSV parsing — minimal, no deps. The CSV has no quoted fields or embedded
// commas, so a split-by-line / split-by-comma is sufficient.
// ---------------------------------------------------------------------------

export function parseDeals(csv: string): Deal[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim());
  const idx = (name: string): number => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`Missing CSV column: ${name}`);
    return i;
  };
  const cCode = idx("Code");
  const cDealName = idx("Deal Name");
  const cTenant = idx("Tenant Name");
  const cSqFt = idx("Square Feet");
  const cTrended = idx("Trended Rent");
  const cEsc = idx("Rent Escalations");
  const cTerm = idx("Lease Term");
  const cStartDate = idx("Start Month (Date)");
  const cFreeRent = idx("Free Rent (months)");
  const cTI = idx("TIs");
  const cLC = idx("LCs");
  const cLCOverride = idx("LC Override");
  const cStatus = idx("Status");

  const deals: Deal[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    const lcs = num(cols[cLC]);
    const lcOverride = num(cols[cLCOverride]);
    deals.push({
      code: (cols[cCode] ?? "").trim(),
      dealName: (cols[cDealName] ?? "").trim(),
      tenantName: (cols[cTenant] ?? "").trim(),
      squareFeet: int(cols[cSqFt]),
      baseRatePSF: num(cols[cTrended]),
      escalation: num(cols[cEsc]),
      leaseTermMonths: int(cols[cTerm]),
      commencement: parseUSDate(cols[cStartDate] ?? ""),
      freeRentMonths: int(cols[cFreeRent]),
      tiAllowancePSF: num(cols[cTI]),
      lcPercent: lcOverride > 0 ? lcOverride : lcs,
      status: (cols[cStatus] ?? "").trim(),
    });
  }
  return deals;
}

function num(s: string | undefined): number {
  if (s == null || s.trim() === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function int(s: string | undefined): number {
  return Math.round(num(s));
}

/** Parse "M/D/YYYY" or "MM/DD/YYYY" → "YYYY-MM-DD". */
export function parseUSDate(s: string): string {
  const parts = s.trim().split("/");
  if (parts.length !== 3) return "";
  const [m, d, y] = parts;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Loader (browser-side, fetches the static asset)
// ---------------------------------------------------------------------------

let cache: Promise<Deal[]> | null = null;

export function loadDeals(): Promise<Deal[]> {
  if (cache) return cache;
  cache = fetch("/deals.csv")
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load deals.csv: ${r.status}`);
      return r.text();
    })
    .then(parseDeals)
    .catch((err) => {
      cache = null; // allow retry
      throw err;
    });
  return cache;
}

// ---------------------------------------------------------------------------
// Mapping: Deal → ScenarioInputs patch
// ---------------------------------------------------------------------------

/**
 * Returns the partial ScenarioInputs that should overwrite the scenario when
 * the user picks this deal. The caller merges this onto existing inputs and
 * also writes `globals.lc{LL,Tenant}RepPercent` from `effectiveLCSplit(deal)`.
 *
 * SF: the CSV has only one Square Feet column, so all three SF fields get
 * the same value. The user can adjust afterward (e.g. lease SF < building SF).
 */
export function dealAsScenarioPatch(deal: Deal): Partial<ScenarioInputs> {
  return {
    name: deal.code,
    dealCode: deal.code,
    projectSF: deal.squareFeet,
    buildingSF: deal.squareFeet,
    proposedLeaseSF: deal.squareFeet,
    baseRatePSF: deal.baseRatePSF,
    escalation: deal.escalation,
    leaseTermMonths: deal.leaseTermMonths,
    leaseCommencement: deal.commencement,
    leaseExecutionDate: deal.commencement,
    freeRentMonths: deal.freeRentMonths,
    tiAllowancePSF: deal.tiAllowancePSF,
    // Clear any prior step-rent override / collar so the loaded deal is
    // calculated from the formula until the user customizes again.
    rentScheduleOverride: undefined,
    escalationFloor: undefined,
    escalationCap: undefined,
    freeRentStartMonth: 1,
    tiDurationMonths: 1,
  };
}

/** Split the deal's total LC into LL Rep + Tenant Rep, 50/50. */
export function dealLCSplit(deal: Deal): { lcLLRepPercent: number; lcTenantRepPercent: number } {
  return {
    lcLLRepPercent: deal.lcPercent / 2,
    lcTenantRepPercent: deal.lcPercent / 2,
  };
}
