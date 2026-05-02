import { describe, expect, it } from "vitest";
import { computeTornado } from "./sensitivity";
import type { Globals, ScenarioInputs } from "./types";

const inputs: ScenarioInputs = {
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

const globals: Globals = {
  discountRate: 0.08,
  shellCostPSF: 140,
  horizonMonths: 204,
};

describe("computeTornado", () => {
  it("returns one row per spec", () => {
    const rows = computeTornado(inputs, globals, "discountedNER");
    expect(rows).toHaveLength(6);
    const labels = rows.map((r) => r.label).sort();
    expect(labels).toEqual([
      "Base Rate",
      "Combined LC",
      "Discount Rate",
      "Escalation",
      "Free Rent",
      "TI Allowance",
    ]);
  });

  it("sorts rows by absolute swing magnitude descending", () => {
    const rows = computeTornado(inputs, globals, "discountedNER");
    for (let i = 1; i < rows.length; i++) {
      const prev = Math.max(Math.abs(rows[i - 1]!.upDelta), Math.abs(rows[i - 1]!.downDelta));
      const cur = Math.max(Math.abs(rows[i]!.upDelta), Math.abs(rows[i]!.downDelta));
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it("Base Rate is the dominant lever (top row) for typical inputs", () => {
    const rows = computeTornado(inputs, globals, "discountedNER");
    expect(rows[0]!.label).toBe("Base Rate");
  });

  it("Base Rate up swing is positive, down swing is negative", () => {
    const rows = computeTornado(inputs, globals, "undiscountedNER");
    const row = rows.find((r) => r.label === "Base Rate")!;
    expect(row.upDelta).toBeGreaterThan(0);
    expect(row.downDelta).toBeLessThan(0);
  });

  it("Free Rent up swing is positive (less free rent = better LL economics)", () => {
    const rows = computeTornado(inputs, globals, "undiscountedNER");
    const row = rows.find((r) => r.label === "Free Rent")!;
    expect(row.upDelta).toBeGreaterThan(0);
    expect(row.downDelta).toBeLessThan(0);
  });

  it("TI Allowance up swing is positive (less TI = better LL economics)", () => {
    const rows = computeTornado(inputs, globals, "undiscountedNER");
    const row = rows.find((r) => r.label === "TI Allowance")!;
    expect(row.upDelta).toBeGreaterThan(0);
    expect(row.downDelta).toBeLessThan(0);
  });

  it("Discount Rate has zero swing on undiscountedNER", () => {
    const rows = computeTornado(inputs, globals, "undiscountedNER");
    const row = rows.find((r) => r.label === "Discount Rate")!;
    expect(Math.abs(row.upDelta)).toBeLessThan(1e-6);
    expect(Math.abs(row.downDelta)).toBeLessThan(1e-6);
  });

  it("Discount Rate has nonzero swing on discountedNER", () => {
    const rows = computeTornado(inputs, globals, "discountedNER");
    const row = rows.find((r) => r.label === "Discount Rate")!;
    expect(Math.abs(row.upDelta) + Math.abs(row.downDelta)).toBeGreaterThan(0.01);
  });
});
