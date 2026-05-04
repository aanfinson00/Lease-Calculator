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

/**
 * Build a draft Comp from a scenario the user has been working on in
 * the analyzer. Intake-form-required fields that the scenario has are
 * filled in directly; everything the analyzer doesn't track (market,
 * subtype, signed date, broker, etc.) is left blank for the user to
 * supply at save time. The NER snapshot is computed up-front so the
 * form's preview opens with the live answer.
 */
export function scenarioToComp(
  inputs: ScenarioInputs,
  globals: Globals,
): Comp {
  const base = defaultComp();
  const draft: Comp = {
    ...base,
    code: inputs.dealCode || inputs.name || base.code,
    dealName: inputs.name || base.dealName,
    tenantName: "",
    status: "PROPOSAL",
    signedDate: inputs.leaseExecutionDate || undefined,
    commencementDate: inputs.leaseCommencement || base.commencementDate,
    projectSF: inputs.projectSF,
    buildingSF: inputs.buildingSF,
    leaseSF: inputs.proposedLeaseSF,
    baseRatePSF: inputs.baseRatePSF,
    escalation: inputs.escalation,
    leaseTermMonths: inputs.leaseTermMonths,
    freeRentMonths: inputs.freeRentMonths,
    tiAllowancePSF: inputs.tiAllowancePSF,
    tiDurationMonths: inputs.tiDurationMonths,
    lcLLRepPercent: inputs.lcLLRepPercent,
    lcTenantRepPercent: inputs.lcTenantRepPercent,
    leaseStructure: "NNN",
    dataSource: "INTERNAL",
    notes: `Captured from analyzer scenario "${inputs.name}".`,
  };
  draft.ner = computeCompSnapshot(draft, globals);
  return draft;
}

// ---------------------------------------------------------------------------
// Filtering, sorting, summarizing — pure helpers used by the index page
// ---------------------------------------------------------------------------

export interface CompFilters {
  search: string;
  statuses: LeaseStatus[];
  subtypes: PropertySubtype[];
  classes: BuildingClass[];
  markets: string[];
  termMonths: { min?: number; max?: number };
  baseRatePSF: { min?: number; max?: number };
  leaseSF: { min?: number; max?: number };
}

export const emptyFilters = (): CompFilters => ({
  search: "",
  statuses: [],
  subtypes: [],
  classes: [],
  markets: [],
  termMonths: {},
  baseRatePSF: {},
  leaseSF: {},
});

export function hasActiveFilters(f: CompFilters): boolean {
  return (
    f.search.trim().length > 0 ||
    f.statuses.length > 0 ||
    f.subtypes.length > 0 ||
    f.classes.length > 0 ||
    f.markets.length > 0 ||
    f.termMonths.min != null ||
    f.termMonths.max != null ||
    f.baseRatePSF.min != null ||
    f.baseRatePSF.max != null ||
    f.leaseSF.min != null ||
    f.leaseSF.max != null
  );
}

const inRange = (v: number, r: { min?: number; max?: number }): boolean =>
  (r.min == null || v >= r.min) && (r.max == null || v <= r.max);

export function filterComps(comps: Comp[], f: CompFilters): Comp[] {
  const q = f.search.trim().toLowerCase();
  return comps.filter((c) => {
    if (q) {
      const hay = `${c.code} ${c.dealName} ${c.tenantName} ${c.market ?? ""} ${c.submarket ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.statuses.length > 0 && !f.statuses.includes(c.status)) return false;
    if (f.subtypes.length > 0 && (!c.propertySubtype || !f.subtypes.includes(c.propertySubtype))) return false;
    if (f.classes.length > 0 && (!c.buildingClass || !f.classes.includes(c.buildingClass))) return false;
    if (f.markets.length > 0 && (!c.market || !f.markets.includes(c.market))) return false;
    if (!inRange(c.leaseTermMonths, f.termMonths)) return false;
    if (!inRange(c.baseRatePSF, f.baseRatePSF)) return false;
    if (!inRange(c.leaseSF, f.leaseSF)) return false;
    return true;
  });
}

export type CompSortKey =
  | "code"
  | "dealName"
  | "market"
  | "propertySubtype"
  | "leaseSF"
  | "baseRatePSF"
  | "leaseTermMonths"
  | "freeRentMonths"
  | "tiAllowancePSF"
  | "combinedLC"
  | "status"
  | "modifiedAt";

export interface CompSort {
  key: CompSortKey;
  dir: "asc" | "desc";
}

const STATUS_ORDER: Record<LeaseStatus, number> = {
  EXECUTED: 0,
  RENEWAL: 1,
  PROPOSAL: 2,
  LOI: 3,
  DEAD: 4,
};

function compareValues(a: unknown, b: unknown): number {
  // Nulls / undefined sort last regardless of direction.
  const aNil = a == null || a === "";
  const bNil = b == null || b === "";
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function sortValueFor(c: Comp, key: CompSortKey): unknown {
  switch (key) {
    case "combinedLC":
      return c.lcLLRepPercent + c.lcTenantRepPercent;
    case "status":
      return STATUS_ORDER[c.status];
    default:
      return c[key];
  }
}

export function sortComps(comps: Comp[], sort: CompSort): Comp[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...comps].sort((a, b) => {
    const cmp = compareValues(sortValueFor(a, sort.key), sortValueFor(b, sort.key));
    // Tie-break on modifiedAt desc so order is stable across renders.
    if (cmp === 0 && sort.key !== "modifiedAt") {
      return -compareValues(a.modifiedAt, b.modifiedAt);
    }
    return cmp * dir;
  });
}

export interface CompSummary {
  count: number;
  avgBaseRatePSF: number;
  avgTermMonths: number;
  avgTIPSF: number;
  avgCombinedLCPercent: number; // decimal (e.g. 0.09 = 9%)
  /** How many comps have a cached `ner` snapshot among the input list. */
  nerSnapshotCount: number;
  /** Avg of cached discounted NER (only over comps with a snapshot). */
  avgDiscountedNER?: number;
  /** Avg of cached undiscounted NER (only over comps with a snapshot). */
  avgUndiscountedNER?: number;
}

export function summarizeComps(comps: Comp[]): CompSummary {
  const n = comps.length;
  if (n === 0) {
    return {
      count: 0,
      avgBaseRatePSF: 0,
      avgTermMonths: 0,
      avgTIPSF: 0,
      avgCombinedLCPercent: 0,
      nerSnapshotCount: 0,
    };
  }
  let baseSum = 0;
  let termSum = 0;
  let tiSum = 0;
  let lcSum = 0;
  let discSum = 0;
  let undiscSum = 0;
  let snapshotCount = 0;
  for (const c of comps) {
    baseSum += c.baseRatePSF;
    termSum += c.leaseTermMonths;
    tiSum += c.tiAllowancePSF;
    lcSum += c.lcLLRepPercent + c.lcTenantRepPercent;
    if (c.ner) {
      discSum += c.ner.discounted;
      undiscSum += c.ner.undiscounted;
      snapshotCount += 1;
    }
  }
  return {
    count: n,
    avgBaseRatePSF: baseSum / n,
    avgTermMonths: termSum / n,
    avgTIPSF: tiSum / n,
    avgCombinedLCPercent: lcSum / n,
    nerSnapshotCount: snapshotCount,
    avgDiscountedNER: snapshotCount > 0 ? discSum / snapshotCount : undefined,
    avgUndiscountedNER: snapshotCount > 0 ? undiscSum / snapshotCount : undefined,
  };
}

// ---------------------------------------------------------------------------
// CSV export — standardized column set (one column per Comp field).
// Not round-trippable through parseComps (which uses the legacy header).
// ---------------------------------------------------------------------------

const CSV_COLUMNS: readonly { header: string; field: keyof Comp }[] = [
  { header: "id", field: "id" },
  { header: "code", field: "code" },
  { header: "dealName", field: "dealName" },
  { header: "tenantName", field: "tenantName" },
  { header: "tenantIndustry", field: "tenantIndustry" },
  { header: "status", field: "status" },
  { header: "signedDate", field: "signedDate" },
  { header: "commencementDate", field: "commencementDate" },
  { header: "propertyName", field: "propertyName" },
  { header: "market", field: "market" },
  { header: "submarket", field: "submarket" },
  { header: "propertySubtype", field: "propertySubtype" },
  { header: "buildingClass", field: "buildingClass" },
  { header: "clearHeightFt", field: "clearHeightFt" },
  { header: "yearBuilt", field: "yearBuilt" },
  { header: "projectSF", field: "projectSF" },
  { header: "buildingSF", field: "buildingSF" },
  { header: "leaseSF", field: "leaseSF" },
  { header: "baseRatePSF", field: "baseRatePSF" },
  { header: "escalation", field: "escalation" },
  { header: "leaseTermMonths", field: "leaseTermMonths" },
  { header: "freeRentMonths", field: "freeRentMonths" },
  { header: "tiAllowancePSF", field: "tiAllowancePSF" },
  { header: "tiDurationMonths", field: "tiDurationMonths" },
  { header: "lcLLRepPercent", field: "lcLLRepPercent" },
  { header: "lcTenantRepPercent", field: "lcTenantRepPercent" },
  { header: "leaseStructure", field: "leaseStructure" },
  { header: "dataSource", field: "dataSource" },
  { header: "brokerName", field: "brokerName" },
  { header: "notes", field: "notes" },
  { header: "createdAt", field: "createdAt" },
  { header: "modifiedAt", field: "modifiedAt" },
];

export function csvHeader(): string {
  return CSV_COLUMNS.map((c) => c.header).join(",");
}

/**
 * Quote a field if it contains commas, quotes, or newlines (RFC 4180).
 * Escapes embedded quotes by doubling them.
 */
function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : String(v);
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function compToCsvRow(c: Comp): string {
  return CSV_COLUMNS.map(({ field }) => csvEscape(c[field])).join(",");
}

export function compsToCsv(comps: Comp[]): string {
  const lines = [csvHeader(), ...comps.map(compToCsvRow)];
  return lines.join("\n");
}
