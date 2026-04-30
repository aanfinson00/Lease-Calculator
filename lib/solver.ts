/**
 * Bisection solver for the "Hold NER" mode.
 *
 * Given a target NER and a free variable, finds the value of the free
 * variable (within slider bounds) that makes `runScenario` produce that
 * target NER. Returns { value, converged } so the UI can show an inline
 * error when the target is unreachable within bounds.
 */

import { runScenario } from "./calc";
import type { Globals, ScenarioInputs } from "./types";

export type FreeVariable =
  | "baseRatePSF"
  | "escalation"
  | "freeRentMonths"
  | "tiAllowancePSF"
  | "discountRate";

export interface SolverResult {
  /** The free-variable value found, or NaN if !converged. */
  value: number;
  converged: boolean;
}

/** Slider ranges from the spec, used as bisection bounds. */
export function defaultBounds(
  freeVar: FreeVariable,
  inputs: ScenarioInputs,
): [number, number] {
  switch (freeVar) {
    case "baseRatePSF":
      // ±30% of current value
      return [inputs.baseRatePSF * 0.7, inputs.baseRatePSF * 1.3];
    case "escalation":
      return [0, 0.06];
    case "freeRentMonths":
      return [0, 18];
    case "tiAllowancePSF":
      return [0, 30];
    case "discountRate":
      return [0.05, 0.12];
  }
}

/**
 * Apply a candidate free-variable value to inputs/globals, then return the
 * resulting discounted NER. We branch on which knob is being turned because
 * 4 of the 5 free vars live on `inputs` and 1 (discountRate) lives on `globals`.
 */
function nerWithOverride(
  inputs: ScenarioInputs,
  globals: Globals,
  freeVar: FreeVariable,
  x: number,
): number {
  if (freeVar === "discountRate") {
    return runScenario(inputs, { ...globals, discountRate: x }).discountedNER;
  }
  const next: ScenarioInputs = { ...inputs, [freeVar]: x };
  return runScenario(next, globals).discountedNER;
}

/**
 * Bisection root finder on `f(x) = ner(x) - target`.
 *
 * Bisection works whenever `f(lo)` and `f(hi)` have opposite signs and `f`
 * is continuous (it is — runScenario is piecewise smooth in all 5 vars).
 * Direction of monotonicity doesn't matter; we just check the sign at the
 * midpoint and update whichever bound has the same sign.
 */
export function solveFor(
  inputs: ScenarioInputs,
  globals: Globals,
  targetNER: number,
  freeVar: FreeVariable,
  options: { bounds?: [number, number]; tolerance?: number; maxIterations?: number } = {},
): SolverResult {
  const [lo, hi] = options.bounds ?? defaultBounds(freeVar, inputs);
  const tolerance = options.tolerance ?? 1e-4;
  const maxIterations = options.maxIterations ?? 60;

  const f = (x: number) => nerWithOverride(inputs, globals, freeVar, x) - targetNER;

  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);

  // If endpoints don't bracket a root, the target is unreachable in [lo, hi].
  if (fa === 0) return { value: a, converged: true };
  if (fb === 0) return { value: b, converged: true };
  if (fa * fb > 0) return { value: NaN, converged: false };

  for (let i = 0; i < maxIterations; i++) {
    const mid = (a + b) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < tolerance || (b - a) / 2 < tolerance) {
      return { value: mid, converged: true };
    }
    if (fa * fmid < 0) {
      b = mid;
      fb = fmid;
    } else {
      a = mid;
      fa = fmid;
    }
  }

  return { value: (a + b) / 2, converged: true };
}
