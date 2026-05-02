import { describe, expect, it } from "vitest";
import { validateScenario } from "./validation";
import type { ScenarioInputs } from "./types";

const baseline: ScenarioInputs = {
  name: "Test",
  projectSF: 300_000,
  buildingSF: 300_000,
  proposedLeaseSF: 300_000,
  baseRatePSF: 8,
  escalation: 0.04,
  lcLLRepPercent: 0.03,
  lcTenantRepPercent: 0.06,
  lcCalculation: "tiered",
  lcStructure: "split50",
  tiAllowancePSF: 10,
  freeRentMonths: 6,
  leaseTermMonths: 130,
  leaseCommencement: "2025-01-01",
  leaseExecutionDate: "2025-01-01",
  tiDurationMonths: 1,
};

describe("validateScenario — clean baseline returns no warnings", () => {
  it("baseline is clean", () => {
    expect(validateScenario(baseline)).toEqual([]);
  });
});

describe("validateScenario — hard semantic warns", () => {
  it("flags free rent > term", () => {
    const warnings = validateScenario({ ...baseline, freeRentMonths: 200 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ field: "freeRentMonths", severity: "warn" });
    expect(warnings[0]!.message).toMatch(/clamps to the term/);
  });

  it("flags execution after commencement", () => {
    const warnings = validateScenario({
      ...baseline,
      leaseExecutionDate: "2025-06-01",
      leaseCommencement: "2025-01-01",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ field: "leaseExecutionDate", severity: "warn" });
  });

  it("flags an empty execution date", () => {
    const warnings = validateScenario({ ...baseline, leaseExecutionDate: "" });
    expect(warnings.find((w) => w.field === "leaseExecutionDate")).toMatchObject({
      severity: "warn",
    });
  });

  it("flags an empty commencement date", () => {
    const warnings = validateScenario({ ...baseline, leaseCommencement: "" });
    expect(warnings.find((w) => w.field === "leaseCommencement")).toMatchObject({
      severity: "warn",
    });
  });

  it("flags an invalid (non-ISO) execution date", () => {
    const warnings = validateScenario({ ...baseline, leaseExecutionDate: "not-a-date" });
    expect(warnings.find((w) => w.field === "leaseExecutionDate")).toBeDefined();
  });

  it("flags zero base rate", () => {
    const warnings = validateScenario({ ...baseline, baseRatePSF: 0 });
    expect(warnings.find((w) => w.field === "baseRatePSF")).toBeDefined();
  });

  it("flags lease SF > building SF", () => {
    const warnings = validateScenario({
      ...baseline,
      proposedLeaseSF: 400_000,
      buildingSF: 300_000,
    });
    expect(warnings.find((w) => w.field === "proposedLeaseSF")).toBeDefined();
  });

  it("flags building SF > project SF", () => {
    const warnings = validateScenario({
      ...baseline,
      buildingSF: 400_000,
      projectSF: 300_000,
    });
    expect(warnings.find((w) => w.field === "buildingSF")).toBeDefined();
  });
});

describe("validateScenario — soft infos", () => {
  it("flags combined LC over 15%", () => {
    const warnings = validateScenario({
      ...baseline,
      lcLLRepPercent: 0.10,
      lcTenantRepPercent: 0.10,
    });
    const info = warnings.find((w) => w.field === "lcLLRepPercent");
    expect(info).toBeDefined();
    expect(info!.severity).toBe("info");
  });

  it("flags TI duration over 24 months", () => {
    expect(validateScenario({ ...baseline, tiDurationMonths: 30 }))
      .toContainEqual(expect.objectContaining({ field: "tiDurationMonths", severity: "info" }));
  });

  it("flags very short lease (<12 mo)", () => {
    expect(validateScenario({ ...baseline, leaseTermMonths: 6 }))
      .toContainEqual(expect.objectContaining({ field: "leaseTermMonths", severity: "info" }));
  });

  it("flags very long lease (>240 mo)", () => {
    expect(validateScenario({ ...baseline, leaseTermMonths: 300 }))
      .toContainEqual(expect.objectContaining({ field: "leaseTermMonths", severity: "info" }));
  });
});
