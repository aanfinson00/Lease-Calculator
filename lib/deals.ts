/**
 * Deal data from a user-uploaded UW assumptions CSV.
 *
 * The CSV is uploaded in the browser (FileReader → parseDeals → store).
 * It never touches the repo, never leaves the user's machine. The parsed
 * Deal objects live in zustand's persisted slice, so the user uploads
 * once per browser and the data sticks across reloads.
 *
 * Column mapping (CSV → Deal):
 *   Code              → code (search key + audit trail)
 *   Deal Name         → dealName (displayed)
 *   Tenant Name       → tenantName (displayed)
 *   Project SF        → projectSF
 *   Building SF       → buildingSF
 *   Lease SF          → leaseSF
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
  projectSF: number;
  buildingSF: number;
  leaseSF: number;
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
  const cProjectSF = idx("Project SF");
  const cBuildingSF = idx("Building SF");
  const cLeaseSF = idx("Lease SF");
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
      projectSF: int(cols[cProjectSF]),
      buildingSF: int(cols[cBuildingSF]),
      leaseSF: int(cols[cLeaseSF]),
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
// Mapping: Deal → ScenarioInputs patch
// ---------------------------------------------------------------------------

/**
 * Returns the partial ScenarioInputs that should overwrite the scenario when
 * the user picks this deal. The deal's total LC% is split 1/3 Landlord Rep
 * + 2/3 Tenant Rep (the typical industrial default). The combined total is
 * preserved exactly via subtraction so floating-point drift can't change LC.
 * Adjust afterward if the deal is direct-to-LL with no co-broke (zero out
 * Tenant Rep and put the full % on Landlord Rep).
 */
export function dealAsScenarioPatch(deal: Deal): Partial<ScenarioInputs> {
  const llShare = deal.lcPercent / 3;
  const trShare = deal.lcPercent - llShare;
  return {
    name: deal.code,
    dealCode: deal.code,
    projectSF: deal.projectSF,
    buildingSF: deal.buildingSF,
    proposedLeaseSF: deal.leaseSF,
    baseRatePSF: deal.baseRatePSF,
    escalation: deal.escalation,
    lcLLRepPercent: llShare,
    lcTenantRepPercent: trShare,
    leaseTermMonths: deal.leaseTermMonths,
    leaseCommencement: deal.commencement,
    leaseExecutionDate: deal.commencement,
    freeRentMonths: deal.freeRentMonths,
    tiAllowancePSF: deal.tiAllowancePSF,
    // Clear any prior step-rent override so the loaded deal is calculated
    // from the formula until the user customizes again.
    rentScheduleOverride: undefined,
    freeRentStartMonth: 1,
    tiDurationMonths: 1,
  };
}
