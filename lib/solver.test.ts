import { describe, expect, it } from "vitest";
import { runScenario } from "./calc";
import { defaultBounds, solveFor, type FreeVariable } from "./solver";
import type { Globals, ScenarioInputs } from "./types";

const baseGlobals: Globals = {
  discountRate: 0.08,
  shellCostPSF: 140,
  horizonMonths: 204,
};

const baseInputs: ScenarioInputs = {
  name: "Proposal",
  projectSF: 300_000,
  buildingSF: 300_000,
  proposedLeaseSF: 300_000,
  baseRatePSF: 8,
  escalation: 0.04,
  lcLLRepPercent: 0.045,
  lcTenantRepPercent: 0.045,
  lcCalculation: "tiered",
  lcStructure: "upfront",
  tiAllowancePSF: 10,
  freeRentMonths: 6,
  leaseTermMonths: 130,
  leaseCommencement: "2025-01-01",
  leaseExecutionDate: "2025-01-01",
  tiDurationMonths: 1,
};

// Round-trip helper: pin scenario, compute NER, solve back for the chosen var.
function roundTrip(freeVar: FreeVariable) {
  const target = runScenario(baseInputs, baseGlobals).discountedNER;
  const result = solveFor(baseInputs, baseGlobals, target, freeVar);
  return { target, result };
}

describe("solveFor — round-trip recovers the original input", () => {
  it.each<FreeVariable>([
    "baseRatePSF",
    "escalation",
    "freeRentMonths",
    "tiAllowancePSF",
    "discountRate",
  ])("recovers %s", (freeVar) => {
    const { target, result } = roundTrip(freeVar);
    expect(result.converged).toBe(true);

    // Compute NER using the solved value; should match target within tolerance.
    const overrideInputs =
      freeVar === "discountRate"
        ? baseInputs
        : { ...baseInputs, [freeVar]: result.value };
    const overrideGlobals =
      freeVar === "discountRate" ? { ...baseGlobals, discountRate: result.value } : baseGlobals;
    const newNER = runScenario(overrideInputs, overrideGlobals).discountedNER;

    expect(newNER).toBeCloseTo(target, 3);
  });
});

describe("solveFor — moving target", () => {
  it("solving for higher target NER raises baseRatePSF", () => {
    const baseline = runScenario(baseInputs, baseGlobals).discountedNER;
    const r = solveFor(baseInputs, baseGlobals, baseline + 0.5, "baseRatePSF");
    expect(r.converged).toBe(true);
    expect(r.value).toBeGreaterThan(baseInputs.baseRatePSF);
  });

  it("solving for higher target NER lowers freeRentMonths", () => {
    const baseline = runScenario(baseInputs, baseGlobals).discountedNER;
    const r = solveFor(baseInputs, baseGlobals, baseline + 0.5, "freeRentMonths");
    expect(r.converged).toBe(true);
    expect(r.value).toBeLessThan(baseInputs.freeRentMonths);
  });

  it("solving for higher target NER lowers discountRate", () => {
    const baseline = runScenario(baseInputs, baseGlobals).discountedNER;
    const r = solveFor(baseInputs, baseGlobals, baseline + 0.3, "discountRate");
    expect(r.converged).toBe(true);
    expect(r.value).toBeLessThan(baseGlobals.discountRate);
  });
});

describe("solveFor — unreachable targets", () => {
  it("returns !converged when target is above max baseRate range", () => {
    // Even at +30% baseRate, NER won't reach an absurd $50 target.
    const r = solveFor(baseInputs, baseGlobals, 50, "baseRatePSF");
    expect(r.converged).toBe(false);
    expect(Number.isNaN(r.value)).toBe(true);
  });

  it("returns !converged when target is below min freeRent range", () => {
    // freeRent already 0 wouldn't push NER low enough to hit -$10.
    const r = solveFor(baseInputs, baseGlobals, -10, "freeRentMonths");
    expect(r.converged).toBe(false);
  });
});

describe("solveFor — undiscounted NER mode", () => {
  it.each<FreeVariable>([
    "baseRatePSF",
    "escalation",
    "freeRentMonths",
    "tiAllowancePSF",
  ])("round-trips %s against undiscounted NER", (freeVar) => {
    const target = runScenario(baseInputs, baseGlobals).undiscountedNER;
    const result = solveFor(baseInputs, baseGlobals, target, freeVar, "undiscounted");
    expect(result.converged).toBe(true);

    const inputs = { ...baseInputs, [freeVar]: result.value };
    const newNER = runScenario(inputs, baseGlobals).undiscountedNER;
    // 2-decimal tolerance: undiscounted NER has a higher dNER/dvar gradient
    // than discounted (less PV smoothing), so the bisection's input-tolerance
    // exit produces slightly looser output residual.
    expect(newNER).toBeCloseTo(target, 2);
  });

  it("does NOT converge when solving an undiscounted target by adjusting discountRate (no effect)", () => {
    const target = runScenario(baseInputs, baseGlobals).undiscountedNER;
    const result = solveFor(baseInputs, baseGlobals, target + 1, "discountRate", "undiscounted");
    expect(result.converged).toBe(false);
  });

  it("kind defaults to discounted when omitted (back-compat)", () => {
    const target = runScenario(baseInputs, baseGlobals).discountedNER;
    const result = solveFor(baseInputs, baseGlobals, target, "baseRatePSF");
    expect(result.converged).toBe(true);
    const newNER = runScenario(
      { ...baseInputs, baseRatePSF: result.value },
      baseGlobals,
    ).discountedNER;
    expect(newNER).toBeCloseTo(target, 3);
  });
});

describe("defaultBounds", () => {
  it("baseRatePSF is ±30% of current", () => {
    const [lo, hi] = defaultBounds("baseRatePSF", baseInputs);
    expect(lo).toBeCloseTo(8 * 0.7, 6);
    expect(hi).toBeCloseTo(8 * 1.3, 6);
  });

  it("escalation bounds = [0, 0.06]", () => {
    expect(defaultBounds("escalation", baseInputs)).toEqual([0, 0.06]);
  });

  it("freeRentMonths bounds = [0, 18]", () => {
    expect(defaultBounds("freeRentMonths", baseInputs)).toEqual([0, 18]);
  });

  it("tiAllowancePSF bounds = [0, 30]", () => {
    expect(defaultBounds("tiAllowancePSF", baseInputs)).toEqual([0, 30]);
  });

  it("discountRate bounds = [0.05, 0.12]", () => {
    expect(defaultBounds("discountRate", baseInputs)).toEqual([0.05, 0.12]);
  });
});
