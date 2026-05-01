import { describe, expect, it } from "vitest";
import {
  buildAnnualSchedule,
  calcAvgRatePSF,
  calcDiscountedNER,
  calcLC,
  calcUndiscountedNER,
  runScenario,
} from "./calc";
import type { Globals, ScenarioInputs } from "./types";

// Helpers ----------------------------------------------------------------

const makeGlobals = (overrides: Partial<Globals> = {}): Globals => ({
  discountRate: 0.08,
  shellCostPSF: 140,
  horizonMonths: 204,
  ...overrides,
});

// Inputs mirroring spec §12 Proposal: 300k SF, $8 PSF Yr1, 4% esc,
// 10 PSF TI, 6 mo free, 130 mo term.
// Default executionDate === commencement → calc collapses to original spec.
const proposalInputs: ScenarioInputs = {
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

// Inputs mirroring spec §12 UW: 300k SF, $7 PSF, 3% esc,
// 5 PSF TI, 4 mo free, 125 mo term.
const uwInputs: ScenarioInputs = {
  name: "UW",
  projectSF: 300_000,
  buildingSF: 300_000,
  proposedLeaseSF: 300_000,
  baseRatePSF: 7,
  escalation: 0.03,
  lcLLRepPercent: 0.045,
  lcTenantRepPercent: 0.045,
  lcCalculation: "tiered",
  lcStructure: "upfront",
  tiAllowancePSF: 5,
  freeRentMonths: 4,
  leaseTermMonths: 125,
  leaseCommencement: "2025-01-01",
  leaseExecutionDate: "2025-01-01",
  tiDurationMonths: 1,
};

// ------------------------------------------------------------------------
// buildAnnualSchedule
// ------------------------------------------------------------------------

describe("buildAnnualSchedule", () => {
  it("calendar-aligned: yr 1 = mo 1-12, escalation always lands at the 12-month anniversary regardless of free rent", () => {
    const s = buildAnnualSchedule(proposalInputs);
    // 130 mo → 10 full years + 1 partial (10 mo). No "year 0" row; free rent
    // is a grid-level flag, not a schedule shift.
    expect(s).toHaveLength(11);
    expect(s[0]).toEqual({ year: 1, annualRatePSF: 8, monthsActive: 12 });
    expect(s[1].annualRatePSF).toBeCloseTo(8 * 1.04, 6);
    expect(s[9].annualRatePSF).toBeCloseTo(8 * Math.pow(1.04, 9), 6);
    expect(s[10]).toEqual({
      year: 11,
      annualRatePSF: 8 * Math.pow(1.04, 10),
      monthsActive: 10,
    });
    expect(s.reduce((sum, r) => sum + r.monthsActive, 0)).toBe(130);
  });

  it("schedule shape is invariant to free-rent count or location", () => {
    const noFree = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 0 });
    const someFree = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 6 });
    const lotsOfFree = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 18 });
    const midTerm = buildAnnualSchedule({ ...proposalInputs, freeRentStartMonth: 13 });
    expect(noFree).toEqual(someFree);
    expect(noFree).toEqual(lotsOfFree);
    expect(noFree).toEqual(midTerm);
  });

  it("handles partial final year (term not divisible by 12)", () => {
    const s = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 0, leaseTermMonths: 50 });
    // 4 full years + 2 mo
    expect(s[s.length - 1]).toEqual({
      year: 5,
      annualRatePSF: 8 * Math.pow(1.04, 4),
      monthsActive: 2,
    });
  });

  it("term equal to free rent: schedule still shows yr 1 contracted at full rate (free is grid-only)", () => {
    const s = buildAnnualSchedule({ ...proposalInputs, leaseTermMonths: 6 });
    expect(s).toEqual([{ year: 1, annualRatePSF: 8, monthsActive: 6 }]);
  });

  // ---- Step rent + CPI collar (Phase A) ----

  it("rentScheduleOverride sets only the specified year, others keep formula", () => {
    const s = buildAnnualSchedule({
      ...proposalInputs,
      rentScheduleOverride: [null, null, null, null, null, 12.5], // override yr 6 only
    });
    // Yr 1-5 untouched (formula). Schedule is calendar-aligned: s[0] is yr 1.
    expect(s[0].annualRatePSF).toBeCloseTo(8, 6);                       // yr 1
    expect(s[4].annualRatePSF).toBeCloseTo(8 * Math.pow(1.04, 4), 6);   // yr 5
    // Yr 6 overridden
    expect(s[5].annualRatePSF).toBeCloseTo(12.5, 6);
    // Yr 7+ continues from the formula curve (NOT compounded from override)
    expect(s[6].annualRatePSF).toBeCloseTo(8 * Math.pow(1.04, 6), 6);
  });

  it("override leaves non-overridden years on the formula", () => {
    const s = buildAnnualSchedule({
      ...proposalInputs,
      rentScheduleOverride: [null, null, 99], // override yr 3 only
    });
    expect(s[2].annualRatePSF).toBe(99);                                // yr 3
    // Years before and after still on the formula
    expect(s[1].annualRatePSF).toBeCloseTo(8 * 1.04, 6);                // yr 2
    expect(s[3].annualRatePSF).toBeCloseTo(8 * Math.pow(1.04, 3), 6);   // yr 4
  });

  it("YoC Yr1 reflects a year-1 override (regression)", () => {
    // Without override, YoC Yr1 = baseRate / buildingCostPSF
    const baseline = runScenario(proposalInputs, makeGlobals());
    // Override yr 1 to a different rate; YoC Yr1 should track the override,
    // not the unchanged inputs.baseRatePSF.
    const overridden = runScenario(
      { ...proposalInputs, rentScheduleOverride: [12.0] },
      makeGlobals(),
    );
    expect(overridden.yocYr1).not.toBeCloseTo(baseline.yocYr1, 4);
    // numerator = 12.0 (override); denominator differs only because LC
    // shifts slightly when yr-1 contracted rent rises, so just sanity-check
    // the override numerator dominates.
    expect(overridden.yocYr1).toBeCloseTo(12.0 / overridden.buildingCostPSF, 6);
  });
});

// ------------------------------------------------------------------------
// calcLC — split-tier
// ------------------------------------------------------------------------

describe("calcLC", () => {
  it("Proposal LC ≈ $6.72 (calendar-aligned schedule, 9% tiered)", () => {
    // Spec §12 quoted $6.45 from the buggy Excel which used a "rent year
    // shift" semantic (free rent pushed escalation later → smaller yr-11
    // partial). With calendar-aligned escalation, yr 11 = 10 mo (not 4),
    // so the tier-2 base is larger and LC is higher.
    const s = buildAnnualSchedule(proposalInputs);
    const lc = calcLC(s, 0.09);
    expect(lc).toBeCloseTo(6.72, 1);
  });

  it("UW LC ≈ $5.46 (calendar-aligned, 9% tiered)", () => {
    const s = buildAnnualSchedule(uwInputs);
    const lc = calcLC(s, 0.09);
    expect(lc).toBeCloseTo(5.46, 1);
  });

  it("LL Rep + TR split sums to the same LC as a single equivalent percent", () => {
    const s = buildAnnualSchedule(proposalInputs);
    const single = calcLC(s, 0.09);
    // Same total split 50/50 between LL and TR (mirrors runScenario summing).
    const split = calcLC(s, 0.045 + 0.045);
    expect(split).toBeCloseTo(single, 6);
    // And split 4/5 vs 1/5
    const skewed = calcLC(s, 0.072 + 0.018);
    expect(skewed).toBeCloseTo(single, 6);
  });

  it("scales linearly with lcPercent", () => {
    const s = buildAnnualSchedule(proposalInputs);
    const a = calcLC(s, 0.09);
    const b = calcLC(s, 0.18);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it("free rent doesn't affect LC (calendar-aligned schedule is invariant to free rent)", () => {
    const s = buildAnnualSchedule(proposalInputs);
    const sNoFree = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 0 });
    // Same term → same calendar schedule → same LC, regardless of free.
    expect(calcLC(s, 0.09)).toBeCloseTo(calcLC(sNoFree, 0.09), 6);
  });

  it("flat calculation applies full % to every year (yields more than tiered)", () => {
    const s = buildAnnualSchedule(proposalInputs);
    const tiered = calcLC(s, 0.09, "tiered");
    const flat = calcLC(s, 0.09, "flat");
    expect(flat).toBeGreaterThan(tiered);
    // Flat = full % × full term rent. Tiered = full × yr1-5 + half × yr6+.
    // The diff is exactly half × yr6+ rent.
    const yr6plus = s
      .filter((row) => row.year >= 6)
      .reduce((sum, row) => sum + row.annualRatePSF * (row.monthsActive / 12), 0);
    expect(flat - tiered).toBeCloseTo(0.09 * yr6plus * 0.5, 6);
  });

  it("flat ≡ tiered when the term is ≤ 5 years (no yr6+ rent)", () => {
    const short = buildAnnualSchedule({ ...proposalInputs, leaseTermMonths: 60 });
    expect(calcLC(short, 0.09, "tiered")).toBeCloseTo(calcLC(short, 0.09, "flat"), 6);
  });
});

// ------------------------------------------------------------------------
// calcAvgRatePSF
// ------------------------------------------------------------------------

describe("calcAvgRatePSF", () => {
  it("Proposal avg rate ≈ $9.78 (calendar-aligned)", () => {
    // Calendar-aligned schedule weights yr 11 with 10 mo (not 4), so the
    // weighted average climbs vs the prior shifted-rent-year semantic.
    const s = buildAnnualSchedule(proposalInputs);
    const avg = calcAvgRatePSF(s, proposalInputs.leaseTermMonths);
    expect(avg).toBeCloseTo(9.78, 1);
  });

  it("UW avg rate ≈ $8.08 (calendar-aligned)", () => {
    const s = buildAnnualSchedule(uwInputs);
    const avg = calcAvgRatePSF(s, uwInputs.leaseTermMonths);
    expect(avg).toBeCloseTo(8.08, 1);
  });
});

// ------------------------------------------------------------------------
// runScenario — full pipeline
// ------------------------------------------------------------------------

describe("runScenario — Proposal (spec §12)", () => {
  const r = runScenario(proposalInputs, makeGlobals());

  it("building cost PSF ≈ $156.72 (140 shell + 10 TI + ~$6.72 LC)", () => {
    expect(r.buildingCostPSF).toBeCloseTo(156.72, 1);
  });

  it("YoC Yr1 = 8 / buildingCostPSF", () => {
    expect(r.yocYr1).toBeCloseTo(8 / r.buildingCostPSF, 6);
  });

  it("YoC Term = avgRate / buildingCostPSF", () => {
    expect(r.yocTerm).toBeCloseTo(r.totals.avgRatePSF / r.buildingCostPSF, 6);
  });

  it("undiscounted NER ≈ $7.49 (calendar-aligned)", () => {
    expect(r.undiscountedNER).toBeCloseTo(7.49, 1);
  });

  it("discounted NER < undiscounted NER for positive discount rate", () => {
    expect(r.discountedNER).toBeLessThan(r.undiscountedNER);
  });

  it("waterfall components sum to net cash flow", () => {
    const { baseRent, freeRent, ti, lc, netCashFlow } = r.waterfall;
    expect(baseRent + freeRent + ti + lc).toBeCloseTo(netCashFlow, 6);
  });

  it("free rent value (PSF) ≈ Yr1 monthly rate × 6 mo for our exact-grid calc", () => {
    // 6 free months at the year-1 rate of $8/yr → $8/12 × 6 = $4
    expect(r.totals.freeRentValuePSF).toBeCloseTo(4.0, 2);
  });

  it("monthly grid length === horizon", () => {
    expect(r.grid.length).toBe(204);
  });

  it("grid months past lease term are all zero", () => {
    expect(r.grid[200].baseRentPSF).toBe(0);
    expect(r.grid[200].netCFPSF).toBe(0);
  });
});

describe("runScenario — LC structure variants", () => {
  it("100% upfront puts entire LC in month 1", () => {
    const r = runScenario({ ...proposalInputs, lcStructure: "upfront" }, makeGlobals());
    expect(r.grid[0].lcPSF).toBeCloseTo(-r.totals.lcPSF, 6);
    expect(r.grid[1].lcPSF).toBe(0);
  });

  it("50/50 split puts half in month 1, half at rent commencement", () => {
    const r = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    const half = -r.totals.lcPSF / 2;
    expect(r.grid[0].lcPSF).toBeCloseTo(half, 6); // month 1
    // free=6 → rent commencement is month 7 → grid index 6
    expect(r.grid[6].lcPSF).toBeCloseTo(half, 6);
  });

  it("50/50 with no free rent collapses to month 1", () => {
    const r = runScenario(
      { ...proposalInputs, freeRentMonths: 0, lcStructure: "split50" },
      makeGlobals(),
    );
    expect(r.grid[0].lcPSF).toBeCloseTo(-r.totals.lcPSF, 6);
    expect(r.grid[1].lcPSF).toBe(0);
  });

  it("undiscounted NER is the same regardless of LC timing (only timing differs, not total)", () => {
    const a = runScenario({ ...proposalInputs, lcStructure: "upfront" }, makeGlobals());
    const b = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    expect(a.undiscountedNER).toBeCloseTo(b.undiscountedNER, 6);
  });

  it("discounted NER is HIGHER for split50 (deferred LC = less discount cost)", () => {
    const a = runScenario({ ...proposalInputs, lcStructure: "upfront" }, makeGlobals());
    const b = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    expect(b.discountedNER).toBeGreaterThan(a.discountedNER);
  });
});

describe("runScenario — UW (spec §12)", () => {
  const r = runScenario(uwInputs, makeGlobals());

  it("building cost PSF ≈ $150.46 (140 + 5 + ~$5.46 LC, calendar-aligned)", () => {
    expect(r.buildingCostPSF).toBeCloseTo(150.46, 1);
  });

  it("YoC Yr1 ≈ 7 / 150.46 ≈ 4.65%", () => {
    expect(r.yocYr1).toBeCloseTo(7 / 150.46, 3);
  });
});

// ------------------------------------------------------------------------
// Edge cases
// ------------------------------------------------------------------------

describe("edge cases", () => {
  it("term === free rent → all base rent zero, NER is just concessions", () => {
    const r = runScenario(
      { ...proposalInputs, leaseTermMonths: 6 },
      makeGlobals(),
    );
    expect(r.waterfall.baseRent).toBeCloseTo(0, 6);
    expect(r.undiscountedNER).toBeLessThan(0);
  });

  it("zero free rent + zero TI + zero LC% → NER ≈ avg rate", () => {
    const r = runScenario(
      {
        ...proposalInputs,
        freeRentMonths: 0,
        tiAllowancePSF: 0,
        lcLLRepPercent: 0,
        lcTenantRepPercent: 0,
      },
      makeGlobals(),
    );
    expect(r.undiscountedNER).toBeCloseTo(r.totals.avgRatePSF, 4);
  });

  it("zero discount rate → discounted NER === undiscounted NER", () => {
    const r = runScenario(proposalInputs, makeGlobals({ discountRate: 0 }));
    expect(r.discountedNER).toBeCloseTo(r.undiscountedNER, 6);
  });

  it("totalsAbsolute scales with lease SF", () => {
    const small = runScenario(
      { ...proposalInputs, proposedLeaseSF: 100_000 },
      makeGlobals(),
    );
    const big = runScenario(
      { ...proposalInputs, proposedLeaseSF: 300_000 },
      makeGlobals(),
    );
    expect(big.totalsAbsolute.lc).toBeCloseTo(small.totalsAbsolute.lc * 3, 4);
  });
});

// ------------------------------------------------------------------------
// Lone-function smoke tests (in case one is used standalone)
// ------------------------------------------------------------------------

describe("calcUndiscountedNER / calcDiscountedNER", () => {
  it("zero-cashflow grid → 0 NER", () => {
    const grid = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      date: "2025-01-01",
      baseRentPSF: 0,
      freeRentPSF: 0,
      tiPSF: 0,
      lcPSF: 0,
      netCFPSF: 0,
    }));
    expect(calcUndiscountedNER(grid, 12, 12)).toBe(0);
    expect(calcDiscountedNER(grid, 0.08, 12, 12)).toBe(0);
  });
});

// ------------------------------------------------------------------------
// Lease execution date + TI duration (new in v2)
// ------------------------------------------------------------------------

describe("lease execution date — commission split timing", () => {
  it("execution === commencement preserves original split50 timing (half M1, half at RC)", () => {
    const r = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    const half = -r.totals.lcPSF / 2;
    expect(r.grid[0].lcPSF).toBeCloseTo(half, 6);
    expect(r.grid[6].lcPSF).toBeCloseTo(half, 6); // free=6 → RC at month 7
  });

  it("execution before commencement pushes commission half #2 out further", () => {
    // 3-month lead time; free=6. Half at execution (M1). Half at rent comm
    // (M = offset + free + 1 = 3 + 6 + 1 = 10, grid index 9).
    const r = runScenario(
      {
        ...proposalInputs,
        leaseExecutionDate: "2024-10-01",
        leaseCommencement: "2025-01-01",
        lcStructure: "split50",
      },
      makeGlobals(),
    );
    const half = -r.totals.lcPSF / 2;
    expect(r.grid[0].lcPSF).toBeCloseTo(half, 6);
    expect(r.grid[9].lcPSF).toBeCloseTo(half, 6);
  });

  it("execution before commencement → discounted NER is LOWER than execution = commencement (later cash inflows discounted more)", () => {
    const sameDay = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    const earlySign = runScenario(
      {
        ...proposalInputs,
        leaseExecutionDate: "2024-07-01",
        leaseCommencement: "2025-01-01",
        lcStructure: "split50",
      },
      makeGlobals(),
    );
    expect(earlySign.discountedNER).toBeLessThan(sameDay.discountedNER);
  });

  it("execution after commencement is clamped to commencement (no negative offset)", () => {
    const r = runScenario(
      { ...proposalInputs, leaseExecutionDate: "2025-06-01", leaseCommencement: "2025-01-01" },
      makeGlobals(),
    );
    // Should behave identically to executionDate === commencementDate.
    const baseline = runScenario(proposalInputs, makeGlobals());
    expect(r.undiscountedNER).toBeCloseTo(baseline.undiscountedNER, 6);
  });
});

describe("free rent start month — mid-term abatements", () => {
  it("default (undefined or 1) reproduces the original front-loaded abatement", () => {
    const a = runScenario(proposalInputs, makeGlobals());
    const b = runScenario({ ...proposalInputs, freeRentStartMonth: 1 }, makeGlobals());
    expect(b.undiscountedNER).toBeCloseTo(a.undiscountedNER, 6);
    expect(b.discountedNER).toBeCloseTo(a.discountedNER, 6);
  });

  it("mid-term abatement: free rent lands at the specified month", () => {
    // 6 free months starting at month 13 (yr 2 anniversary)
    const r = runScenario(
      { ...proposalInputs, freeRentStartMonth: 13 },
      makeGlobals(),
    );
    // Months 1-12: paying. Months 13-18: free. Months 19+: paying.
    expect(r.grid[11].baseRentPSF).toBeGreaterThan(0); // M12
    expect(r.grid[12].baseRentPSF).toBe(0);            // M13
    expect(r.grid[17].baseRentPSF).toBe(0);            // M18
    expect(r.grid[18].baseRentPSF).toBeGreaterThan(0); // M19
  });

  // Note: front-loaded and mid-term abatements use intentionally different
  // schedule shapes — front-loaded shifts rent years after the abatement (the
  // Excel/spec convention where rent yr 1 starts at rent commencement),
  // mid-term uses calendar years (rent yr 1 = months 1-12 of contract).
  // The two shapes yield slightly different LC, avg rate, and NER for the
  // same parameters except free location. That's expected — the user picks
  // ONE timing for their lease, and the model is consistent within that
  // choice. We don't assert front-vs-mid invariance (it doesn't hold).

  it("front-loaded abatement: LC half lands at rent commencement (after free months)", () => {
    const r = runScenario(
      { ...proposalInputs, freeRentStartMonth: 1, lcStructure: "split50" },
      makeGlobals(),
    );
    const half = -r.totals.lcPSF / 2;
    expect(r.grid[0].lcPSF).toBeCloseTo(half, 6);
    // free=6 → rent commencement at month 7
    expect(r.grid[6].lcPSF).toBeCloseTo(half, 6);
  });

  it("mid-term abatement: rent starts at lease commencement → both LC halves collapse to M1 (when execution=commencement)", () => {
    const r = runScenario(
      { ...proposalInputs, freeRentStartMonth: 13, lcStructure: "split50" },
      makeGlobals(),
    );
    // Both halves at month 1 (rcMonth === 1 because execution=commencement and no front-load)
    expect(r.grid[0].lcPSF).toBeCloseTo(-r.totals.lcPSF, 6);
    // No second LC payment in M7 since rent already kicked in at M1.
    expect(r.grid[6].lcPSF).toBe(0);
  });

  it("mid-term abatement with execution before commencement: half at M1 (exec), half at commencement", () => {
    const r = runScenario(
      {
        ...proposalInputs,
        leaseExecutionDate: "2024-10-01",
        leaseCommencement: "2025-01-01",
        freeRentStartMonth: 13, // mid-term abatement
        lcStructure: "split50",
      },
      makeGlobals(),
    );
    const half = -r.totals.lcPSF / 2;
    // Half 1 at execution (M1 of grid)
    expect(r.grid[0].lcPSF).toBeCloseTo(half, 6);
    // Half 2 at commencement (M = commencementOffset+1 = 4, grid index 3)
    expect(r.grid[3].lcPSF).toBeCloseTo(half, 6);
  });

  it("abatement clamps when start + count exceeds the lease term", () => {
    // 6 free months starting at month 128 of a 130-mo term → only months 128-130 are free
    const r = runScenario(
      { ...proposalInputs, freeRentStartMonth: 128 },
      makeGlobals(),
    );
    expect(r.grid[126].baseRentPSF).toBeGreaterThan(0); // M127 paying
    expect(r.grid[127].baseRentPSF).toBe(0);            // M128 free
    expect(r.grid[129].baseRentPSF).toBe(0);            // M130 free
    // Past term, just zeros
    expect(r.grid[130].baseRentPSF).toBe(0);
  });
});

describe("TI duration — spread over months", () => {
  it("default tiDuration=1 keeps all TI in month 1", () => {
    const r = runScenario(proposalInputs, makeGlobals());
    expect(r.grid[0].tiPSF).toBeCloseTo(-proposalInputs.tiAllowancePSF, 6);
    expect(r.grid[1].tiPSF).toBe(0);
  });

  it("tiDuration=6 spreads TI evenly over 6 months", () => {
    const r = runScenario(
      { ...proposalInputs, tiDurationMonths: 6 },
      makeGlobals(),
    );
    const perMonth = -proposalInputs.tiAllowancePSF / 6;
    for (let i = 0; i < 6; i++) {
      expect(r.grid[i].tiPSF).toBeCloseTo(perMonth, 6);
    }
    expect(r.grid[6].tiPSF).toBe(0);
  });

  it("total TI over the term is invariant to tiDurationMonths", () => {
    const a = runScenario({ ...proposalInputs, tiDurationMonths: 1 }, makeGlobals());
    const b = runScenario({ ...proposalInputs, tiDurationMonths: 12 }, makeGlobals());
    expect(a.waterfall.ti).toBeCloseTo(b.waterfall.ti, 6);
  });

  it("undiscounted NER is invariant to tiDurationMonths (timing only)", () => {
    const a = runScenario({ ...proposalInputs, tiDurationMonths: 1 }, makeGlobals());
    const b = runScenario({ ...proposalInputs, tiDurationMonths: 6 }, makeGlobals());
    expect(a.undiscountedNER).toBeCloseTo(b.undiscountedNER, 6);
  });

  it("discounted NER is HIGHER when TI is spread (deferred cost = less PV drag)", () => {
    const a = runScenario({ ...proposalInputs, tiDurationMonths: 1 }, makeGlobals());
    const b = runScenario({ ...proposalInputs, tiDurationMonths: 12 }, makeGlobals());
    expect(b.discountedNER).toBeGreaterThan(a.discountedNER);
  });
});
