import { describe, expect, it } from "vitest";
import { diffScenarios } from "./scenario-diff";
import type { ScenarioInputs } from "./types";

const base: ScenarioInputs = {
  name: "A",
  notes: "",
  projectSF: 300_000,
  buildingSF: 300_000,
  proposedLeaseSF: 300_000,
  baseRatePSF: 7,
  escalation: 0.03,
  lcLLRepPercent: 0.03,
  lcTenantRepPercent: 0.06,
  lcCalculation: "tiered",
  lcStructure: "split50",
  tiAllowancePSF: 5,
  additionalTIPSF: 0,
  freeRentMonths: 4,
  leaseTermMonths: 125,
  leaseCommencement: "2026-01-01",
  leaseExecutionDate: "2026-01-01",
  tiDurationMonths: 1,
};

describe("diffScenarios", () => {
  it("identical inputs → empty array", () => {
    expect(diffScenarios(base, { ...base, name: "B" })).toEqual([]);
  });

  it("differing scenario names are NOT reported (column header, not a diff)", () => {
    expect(diffScenarios({ ...base, name: "X" }, { ...base, name: "Y" })).toEqual([]);
  });

  it("differing notes are NOT reported (covered by the notes UI)", () => {
    expect(
      diffScenarios({ ...base, notes: "hello" }, { ...base, notes: "" }),
    ).toEqual([]);
  });

  it("differing baseRate produces one currency entry", () => {
    const entries = diffScenarios(base, { ...base, baseRatePSF: 8 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      field: "baseRatePSF",
      sectionLabel: "Rent",
      fieldLabel: "Base Rate",
      format: "currency",
      aValue: 7,
      bValue: 8,
    });
  });

  it("differing lcStructure produces an enum entry", () => {
    const entries = diffScenarios(base, { ...base, lcStructure: "upfront" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      field: "lcStructure",
      format: "enum",
      aValue: "split50",
      bValue: "upfront",
    });
  });

  it("multiple diffs are ordered to match the inputs panel layout (SF → Rent → Concessions → LC → Term)", () => {
    const b: ScenarioInputs = {
      ...base,
      leaseTermMonths: 130, // Term
      baseRatePSF: 8,        // Rent
      lcCalculation: "flat", // LC
      proposedLeaseSF: 250_000, // Square Footage
      additionalTIPSF: 5,    // Concessions
    };
    const sections = diffScenarios(base, b).map((e) => e.sectionLabel);
    expect(sections).toEqual([
      "Square Footage",
      "Rent",
      "Concessions",
      "Leasing Commissions",
      "Term",
    ]);
  });

  it("dates compared as ISO strings; differing commencement produces a date entry", () => {
    const entries = diffScenarios(base, {
      ...base,
      leaseCommencement: "2026-06-01",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      field: "leaseCommencement",
      format: "date",
      aValue: "2026-01-01",
      bValue: "2026-06-01",
    });
  });
});
