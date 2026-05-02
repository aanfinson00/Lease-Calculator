/**
 * Tornado-chart sensitivity analysis.
 *
 * For each input that drives NER, we run the scenario at "down" and "up"
 * perturbations of that input alone (everything else held at the
 * baseline) and record the resulting ΔNER. The result is a list of rows
 * — one per input — sorted by absolute swing magnitude descending. The
 * top row is the input that moves NER the most; that's what the user
 * should negotiate hardest on.
 *
 * Why mixed perturbation styles: a 10% swing on a 0% baseline (e.g. a
 * deal with no escalation, no free rent, or no TI) is still 0%, so the
 * row would always read flat. For inputs where 0 is a common baseline
 * we use additive deltas (±100 bps for rates, ±2 mo for free rent, ±$5
 * for TI) so the chart stays useful regardless of starting point.
 *
 * Pure function — no React, no store. Caller provides inputs + globals.
 */

import { runScenario } from "./calc";
import type { Globals, ScenarioInputs } from "./types";

export type TornadoMetric = "discountedNER" | "undiscountedNER";

export interface TornadoRow {
  /** Display label, e.g. "Base Rate" or "Combined LC". */
  label: string;
  /** ΔNER when this input moves the "bad" way (typically negative). */
  downDelta: number;
  /** ΔNER when this input moves the "good" way (typically positive). */
  upDelta: number;
  /** Description of the perturbation, e.g. "±10%" or "±100 bps". */
  perturbation: string;
}

interface InputSpec {
  label: string;
  perturbation: string;
  /** Apply the "up" perturbation (good for landlord) to inputs+globals. */
  up: (i: ScenarioInputs, g: Globals) => { inputs: ScenarioInputs; globals: Globals };
  /** Apply the "down" perturbation (bad for landlord). */
  down: (i: ScenarioInputs, g: Globals) => { inputs: ScenarioInputs; globals: Globals };
}

const SPECS: InputSpec[] = [
  {
    label: "Base Rate",
    perturbation: "±10%",
    up: (i, g) => ({ inputs: { ...i, baseRatePSF: i.baseRatePSF * 1.1 }, globals: g }),
    down: (i, g) => ({ inputs: { ...i, baseRatePSF: i.baseRatePSF * 0.9 }, globals: g }),
  },
  {
    label: "Escalation",
    perturbation: "±100 bps",
    up: (i, g) => ({ inputs: { ...i, escalation: i.escalation + 0.01 }, globals: g }),
    down: (i, g) => ({ inputs: { ...i, escalation: Math.max(0, i.escalation - 0.01) }, globals: g }),
  },
  {
    label: "Free Rent",
    perturbation: "±2 mo",
    // More free rent = bad for LL → "down". Less free rent = good → "up".
    up: (i, g) => ({ inputs: { ...i, freeRentMonths: Math.max(0, i.freeRentMonths - 2) }, globals: g }),
    down: (i, g) => ({ inputs: { ...i, freeRentMonths: i.freeRentMonths + 2 }, globals: g }),
  },
  {
    label: "TI Allowance",
    perturbation: "±$5/SF",
    // More TI = bad for LL → "down". Less TI = good → "up".
    up: (i, g) => ({ inputs: { ...i, tiAllowancePSF: Math.max(0, i.tiAllowancePSF - 5) }, globals: g }),
    down: (i, g) => ({ inputs: { ...i, tiAllowancePSF: i.tiAllowancePSF + 5 }, globals: g }),
  },
  {
    label: "Combined LC",
    perturbation: "±100 bps",
    // More LC = bad for LL → "down". Split the bps proportionally between
    // LL-rep and Tenant-rep so the structure is preserved.
    up: (i, g) => ({ inputs: applyLcDelta(i, -0.01), globals: g }),
    down: (i, g) => ({ inputs: applyLcDelta(i, +0.01), globals: g }),
  },
  {
    label: "Discount Rate",
    perturbation: "±100 bps",
    // Higher discount rate = lower PV of rent = bad for LL (only matters
    // for discountedNER; undiscountedNER is unaffected).
    up: (i, g) => ({ inputs: i, globals: { ...g, discountRate: Math.max(0, g.discountRate - 0.01) } }),
    down: (i, g) => ({ inputs: i, globals: { ...g, discountRate: g.discountRate + 0.01 } }),
  },
];

function applyLcDelta(i: ScenarioInputs, delta: number): ScenarioInputs {
  const total = i.lcLLRepPercent + i.lcTenantRepPercent;
  if (total <= 0) {
    // Nothing to scale proportionally — split evenly.
    return {
      ...i,
      lcLLRepPercent: Math.max(0, i.lcLLRepPercent + delta / 2),
      lcTenantRepPercent: Math.max(0, i.lcTenantRepPercent + delta / 2),
    };
  }
  const llShare = i.lcLLRepPercent / total;
  return {
    ...i,
    lcLLRepPercent: Math.max(0, i.lcLLRepPercent + delta * llShare),
    lcTenantRepPercent: Math.max(0, i.lcTenantRepPercent + delta * (1 - llShare)),
  };
}

export function computeTornado(
  inputs: ScenarioInputs,
  globals: Globals,
  metric: TornadoMetric,
): TornadoRow[] {
  const baseline = runScenario(inputs, globals)[metric];

  const rows: TornadoRow[] = SPECS.map((spec) => {
    const upRun = spec.up(inputs, globals);
    const downRun = spec.down(inputs, globals);
    const upNer = runScenario(upRun.inputs, upRun.globals)[metric];
    const downNer = runScenario(downRun.inputs, downRun.globals)[metric];
    return {
      label: spec.label,
      perturbation: spec.perturbation,
      upDelta: upNer - baseline,
      downDelta: downNer - baseline,
    };
  });

  // Sort by absolute max swing descending — biggest mover on top.
  rows.sort((a, b) => {
    const aMax = Math.max(Math.abs(a.upDelta), Math.abs(a.downDelta));
    const bMax = Math.max(Math.abs(b.upDelta), Math.abs(b.downDelta));
    return bMax - aMax;
  });

  return rows;
}
