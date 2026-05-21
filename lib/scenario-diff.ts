/**
 * Pure helper: compare two ScenarioInputs and return the fields that differ.
 *
 * Drives the "What's different · A vs B" card on the results page. Walks a
 * fixed field metadata list in the same order as the Inputs panel sections
 * so the diff reads in the same rhythm the user typed it in.
 *
 * Skipped fields:
 *   - `name`        — shown as the column header on the card
 *   - `dealCode`    — audit trail of which comp the scenario was loaded from
 *   - `notes`       — covered by the notes UI, not part of the input diff
 *   - `rentScheduleOverride` — sparse array; deserves its own diff UI later
 */

import type { ScenarioInputs } from "./types";

export type DiffFormat = "currency" | "percent" | "integer" | "date" | "enum";

export interface DiffEntry {
  field: keyof ScenarioInputs;
  /** Inputs-panel section the field lives in (for grouping on the card). */
  sectionLabel: string;
  /** Short user-facing field name. */
  fieldLabel: string;
  /** How to format aValue / bValue when rendering. */
  format: DiffFormat;
  aValue: string | number;
  bValue: string | number;
}

interface FieldMeta {
  section: string;
  label: string;
  format: DiffFormat;
}

// Ordered to match SECTIONS in components/inputs-panel.tsx so the diff card
// reads top-to-bottom in the same rhythm as the inputs panel. Adding a new
// scenario input? Add it here too (or it won't show up in the diff).
const FIELD_META: ReadonlyArray<readonly [keyof ScenarioInputs, FieldMeta]> = [
  ["projectSF", { section: "Square Footage", label: "Project SF", format: "integer" }],
  ["buildingSF", { section: "Square Footage", label: "Building SF", format: "integer" }],
  ["proposedLeaseSF", { section: "Square Footage", label: "Lease SF", format: "integer" }],

  ["baseRatePSF", { section: "Rent", label: "Base Rate", format: "currency" }],
  ["escalation", { section: "Rent", label: "Escalation", format: "percent" }],

  ["tiAllowancePSF", { section: "Concessions", label: "TI Allowance", format: "currency" }],
  ["additionalTIPSF", { section: "Concessions", label: "Add'l TI Amortized", format: "currency" }],
  ["tiDurationMonths", { section: "Concessions", label: "TI Duration (mo)", format: "integer" }],
  ["freeRentMonths", { section: "Concessions", label: "Free Rent (mo)", format: "integer" }],

  ["lcLLRepPercent", { section: "Leasing Commissions", label: "Landlord Rep", format: "percent" }],
  ["lcTenantRepPercent", { section: "Leasing Commissions", label: "Tenant Rep", format: "percent" }],
  ["lcCalculation", { section: "Leasing Commissions", label: "Calc Method", format: "enum" }],
  ["lcStructure", { section: "Leasing Commissions", label: "Payment", format: "enum" }],

  ["leaseTermMonths", { section: "Term", label: "Term (mo)", format: "integer" }],
  ["leaseExecutionDate", { section: "Term", label: "Execution", format: "date" }],
  ["leaseCommencement", { section: "Term", label: "Commencement", format: "date" }],
];

export function diffScenarios(a: ScenarioInputs, b: ScenarioInputs): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const [field, meta] of FIELD_META) {
    const av = a[field];
    const bv = b[field];
    if (av === bv) continue;
    out.push({
      field,
      sectionLabel: meta.section,
      fieldLabel: meta.label,
      format: meta.format,
      aValue: av as string | number,
      bValue: bv as string | number,
    });
  }
  return out;
}
