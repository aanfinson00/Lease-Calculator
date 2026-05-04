/**
 * Comp schema + form-friendly helpers.
 *
 * Replaces the legacy `Deal` shape from `lib/deals.ts`. A Comp is an
 * executed (or in-progress) lease record that the user types into the
 * intake form or imports from a CSV. Comps live in zustand's persisted
 * `deals` slice so they roll forward on browser reload, and never leave
 * the user's machine.
 *
 * Versioning: the persisted slice is currently named `deals` for backward
 * compatibility with the v8-v13 migrations; the v13 -> v14 migration in
 * `lib/store.ts` upgrades the legacy Deal shape to Comp. UI code should
 * import `Comp` from here.
 */

import type { Globals, ScenarioInputs } from "./types";
import { runScenario } from "./calc";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type LeaseStatus = "EXECUTED" | "RENEWAL" | "PROPOSAL" | "LOI" | "DEAD";

export const LEASE_STATUSES: { value: LeaseStatus; label: string }[] = [
  { value: "EXECUTED", label: "Executed" },
  { value: "RENEWAL", label: "Renewal" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "LOI", label: "LOI" },
  { value: "DEAD", label: "Dead" },
];

export type LeaseStructure = "NNN" | "MG" | "FSG" | "OTHER";

export const LEASE_STRUCTURES: { value: LeaseStructure; label: string }[] = [
  { value: "NNN", label: "NNN (Triple Net)" },
  { value: "MG", label: "Modified Gross" },
  { value: "FSG", label: "Full Service Gross" },
  { value: "OTHER", label: "Other" },
];

export type PropertySubtype =
  | "WAREHOUSE"
  | "DISTRIBUTION"
  | "MANUFACTURING"
  | "FLEX"
  | "COLD_STORAGE"
  | "BULK"
  | "OTHER";

export const PROPERTY_SUBTYPES: { value: PropertySubtype; label: string }[] = [
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "DISTRIBUTION", label: "Distribution" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "FLEX", label: "Flex" },
  { value: "COLD_STORAGE", label: "Cold Storage" },
  { value: "BULK", label: "Bulk" },
  { value: "OTHER", label: "Other" },
];

export type BuildingClass = "A" | "B" | "C";

export const BUILDING_CLASSES: { value: BuildingClass; label: string }[] = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
];

export type DataSource = "INTERNAL" | "BROKER" | "COSTAR" | "OTHER";

export const DATA_SOURCES: { value: DataSource; label: string }[] = [
  { value: "INTERNAL", label: "Internal" },
  { value: "BROKER", label: "Broker" },
  { value: "COSTAR", label: "CoStar" },
  { value: "OTHER", label: "Other" },
];

// ---------------------------------------------------------------------------
// Comp shape
// ---------------------------------------------------------------------------

export interface CompNERSnapshot {
  undiscounted: number;
  discounted: number;
  totalBasisPSF: number;
}

export interface Comp {
  /** Stable internal identifier; auto-generated. */
  id: string;

  // -- Identification
  code: string;
  dealName: string;
  tenantName: string;
  tenantIndustry?: string;
  status: LeaseStatus;
  /** ISO YYYY-MM-DD — when the LOI/lease was signed. */
  signedDate?: string;
  /** ISO YYYY-MM-DD — rent commencement. */
  commencementDate: string;

  // -- Property
  propertyName?: string;
  market?: string;
  submarket?: string;
  /** Optional — leave undefined when unknown. */
  propertySubtype?: PropertySubtype;
  buildingClass?: BuildingClass;
  clearHeightFt?: number;
  yearBuilt?: number;
  projectSF: number;
  buildingSF: number;
  leaseSF: number;

  // -- Economics
  baseRatePSF: number;
  /** Decimal, e.g. 0.03 = 3%. */
  escalation: number;
  leaseTermMonths: number;
  freeRentMonths: number;
  tiAllowancePSF: number;
  /** Default 1 (single lump-sum draw). */
  tiDurationMonths?: number;
  lcLLRepPercent: number;
  lcTenantRepPercent: number;
  leaseStructure: LeaseStructure;

  // -- Computed snapshot (cached on save; not the source of truth).
  ner?: CompNERSnapshot;

  // -- Provenance
  dataSource?: DataSource;
  brokerName?: string;
  notes?: string;
  createdAt: string;
  modifiedAt: string;
}

// ---------------------------------------------------------------------------
// Defaults + ID generation
// ---------------------------------------------------------------------------

export function newCompId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Best-effort fallback for environments without crypto.randomUUID.
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Returns a blank Comp pre-filled with sensible defaults so the intake
 * form opens with a usable starting point. Code is empty so the user
 * supplies a meaningful one; defaults skew toward industrial NNN norms.
 */
export function defaultComp(): Comp {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return {
    id: newCompId(),
    code: "",
    dealName: "",
    tenantName: "",
    status: "PROPOSAL",
    commencementDate: today,
    projectSF: 0,
    buildingSF: 0,
    leaseSF: 0,
    baseRatePSF: 0,
    escalation: 0.03,
    leaseTermMonths: 60,
    freeRentMonths: 0,
    tiAllowancePSF: 0,
    tiDurationMonths: 1,
    lcLLRepPercent: 0.03,
    lcTenantRepPercent: 0.06,
    leaseStructure: "NNN",
    createdAt: now,
    modifiedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface CompValidationError {
  field: keyof Comp;
  message: string;
}

/**
 * Returns blocking errors. The intake form disables Save until this is
 * empty. Soft warnings (e.g. unusual values) live in `validation.ts`
 * and surface at the scenario analyzer; we don't repeat them here.
 */
export function validateComp(c: Comp): CompValidationError[] {
  const errs: CompValidationError[] = [];
  if (!c.code.trim()) errs.push({ field: "code", message: "Code is required." });
  if (!c.dealName.trim()) errs.push({ field: "dealName", message: "Deal name is required." });
  if (!c.tenantName.trim()) errs.push({ field: "tenantName", message: "Tenant name is required." });
  if (!c.commencementDate) errs.push({ field: "commencementDate", message: "Commencement date is required." });
  if (c.signedDate && c.commencementDate && c.signedDate > c.commencementDate) {
    errs.push({ field: "signedDate", message: "Signed date must be on or before commencement." });
  }
  if (c.projectSF <= 0) errs.push({ field: "projectSF", message: "Project SF must be greater than zero." });
  if (c.buildingSF <= 0) errs.push({ field: "buildingSF", message: "Building SF must be greater than zero." });
  if (c.leaseSF <= 0) errs.push({ field: "leaseSF", message: "Lease SF must be greater than zero." });
  if (c.baseRatePSF <= 0) errs.push({ field: "baseRatePSF", message: "Base rate must be greater than zero." });
  if (c.leaseTermMonths <= 0) errs.push({ field: "leaseTermMonths", message: "Lease term must be greater than zero." });
  if (c.freeRentMonths < 0) errs.push({ field: "freeRentMonths", message: "Free rent can't be negative." });
  if (c.freeRentMonths > c.leaseTermMonths) {
    errs.push({ field: "freeRentMonths", message: "Free rent can't exceed the lease term." });
  }
  if (c.tiAllowancePSF < 0) errs.push({ field: "tiAllowancePSF", message: "TI allowance can't be negative." });
  if (c.lcLLRepPercent < 0) errs.push({ field: "lcLLRepPercent", message: "LL Rep LC can't be negative." });
  if (c.lcTenantRepPercent < 0) errs.push({ field: "lcTenantRepPercent", message: "Tenant Rep LC can't be negative." });
  return errs;
}

// ---------------------------------------------------------------------------
// CSV parsing — back-compat with the legacy Deal CSV
// ---------------------------------------------------------------------------

/**
 * Parses the legacy UW assumptions CSV into Comps. Unknown / new fields
 * (subtype, market, etc.) come back undefined; the user can fill them
 * in via the intake form afterward.
 *
 * Column mapping (CSV -> Comp):
 *   Code              -> code
 *   Deal Name         -> dealName
 *   Tenant Name       -> tenantName
 *   Project SF        -> projectSF
 *   Building SF       -> buildingSF
 *   Lease SF          -> leaseSF
 *   Trended Rent      -> baseRatePSF
 *   Rent Escalations  -> escalation
 *   Lease Term        -> leaseTermMonths
 *   Start Month (Date)-> commencementDate (ISO)
 *   Free Rent (months)-> freeRentMonths
 *   TIs               -> tiAllowancePSF
 *   LCs / LC Override -> split 1/3 LL + 2/3 Tenant Rep
 *   Status            -> status (LEASE -> EXECUTED, SPEC -> PROPOSAL,
 *                                RENEWAL -> RENEWAL; anything else
 *                                falls through to EXECUTED)
 */
export function parseComps(csv: string): Comp[] {
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

  const now = new Date().toISOString();
  const comps: Comp[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    const lcs = num(cols[cLC]);
    const lcOverride = num(cols[cLCOverride]);
    const lcPercent = lcOverride > 0 ? lcOverride : lcs;
    const llShare = lcPercent / 3;
    const trShare = lcPercent - llShare;
    comps.push({
      id: newCompId(),
      code: (cols[cCode] ?? "").trim(),
      dealName: (cols[cDealName] ?? "").trim(),
      tenantName: (cols[cTenant] ?? "").trim(),
      status: mapLegacyStatus((cols[cStatus] ?? "").trim()),
      commencementDate: parseUSDate(cols[cStartDate] ?? ""),
      projectSF: int(cols[cProjectSF]),
      buildingSF: int(cols[cBuildingSF]),
      leaseSF: int(cols[cLeaseSF]),
      baseRatePSF: num(cols[cTrended]),
      escalation: num(cols[cEsc]),
      leaseTermMonths: int(cols[cTerm]),
      freeRentMonths: int(cols[cFreeRent]),
      tiAllowancePSF: num(cols[cTI]),
      tiDurationMonths: 1,
      lcLLRepPercent: llShare,
      lcTenantRepPercent: trShare,
      leaseStructure: "NNN",
      createdAt: now,
      modifiedAt: now,
    });
  }
  return comps;
}

function mapLegacyStatus(raw: string): LeaseStatus {
  const s = raw.toUpperCase();
  if (s === "LEASE") return "EXECUTED";
  if (s === "RENEWAL") return "RENEWAL";
  if (s === "SPEC") return "PROPOSAL";
  if (s === "EXECUTED" || s === "PROPOSAL" || s === "LOI" || s === "DEAD") return s;
  return "EXECUTED";
}

function num(s: string | undefined): number {
  if (s == null || s.trim() === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function int(s: string | undefined): number {
  return Math.round(num(s));
}

/** Parse "M/D/YYYY" or "MM/DD/YYYY" -> "YYYY-MM-DD". */
export function parseUSDate(s: string): string {
  const parts = s.trim().split("/");
  if (parts.length !== 3) return "";
  const [m, d, y] = parts;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Comp -> ScenarioInputs patch (used by the deal picker on the analyzer)
// ---------------------------------------------------------------------------

export function compAsScenarioPatch(comp: Comp): Partial<ScenarioInputs> {
  return {
    name: comp.code,
    dealCode: comp.code,
    projectSF: comp.projectSF,
    buildingSF: comp.buildingSF,
    proposedLeaseSF: comp.leaseSF,
    baseRatePSF: comp.baseRatePSF,
    escalation: comp.escalation,
    lcLLRepPercent: comp.lcLLRepPercent,
    lcTenantRepPercent: comp.lcTenantRepPercent,
    leaseTermMonths: comp.leaseTermMonths,
    leaseCommencement: comp.commencementDate,
    leaseExecutionDate: comp.signedDate || comp.commencementDate,
    freeRentMonths: comp.freeRentMonths,
    tiAllowancePSF: comp.tiAllowancePSF,
    tiDurationMonths: comp.tiDurationMonths ?? 1,
    rentScheduleOverride: undefined,
  };
}

// ---------------------------------------------------------------------------
// Comp NER snapshot — runs the calc engine against the comp so the
// intake form can show a live preview and the index can sort/filter on
// economic results.
// ---------------------------------------------------------------------------

export function computeCompSnapshot(comp: Comp, globals: Globals): CompNERSnapshot {
  const inputs: ScenarioInputs = {
    name: comp.code,
    projectSF: comp.projectSF,
    buildingSF: comp.buildingSF,
    proposedLeaseSF: comp.leaseSF,
    baseRatePSF: comp.baseRatePSF,
    escalation: comp.escalation,
    lcLLRepPercent: comp.lcLLRepPercent,
    lcTenantRepPercent: comp.lcTenantRepPercent,
    lcCalculation: "tiered",
    lcStructure: "split50",
    tiAllowancePSF: comp.tiAllowancePSF,
    freeRentMonths: comp.freeRentMonths,
    leaseTermMonths: comp.leaseTermMonths,
    leaseCommencement: comp.commencementDate,
    leaseExecutionDate: comp.signedDate || comp.commencementDate,
    tiDurationMonths: comp.tiDurationMonths ?? 1,
  };
  // Guard against the calc engine crashing on a partially-filled form.
  try {
    const r = runScenario(inputs, globals);
    return {
      undiscounted: r.undiscountedNER,
      discounted: r.discountedNER,
      totalBasisPSF: r.totalBasisPSF,
    };
  } catch {
    return { undiscounted: 0, discounted: 0, totalBasisPSF: 0 };
  }
}
