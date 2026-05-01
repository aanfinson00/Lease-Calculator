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

  it("schedule shape is invariant to free-rent count", () => {
    const noFree = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 0 });
    const someFree = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 6 });
    const lotsOfFree = buildAnnualSchedule({ ...proposalInputs, freeRentMonths: 18 });
    expect(noFree).toEqual(someFree);
    expect(noFree).toEqual(lotsOfFree);
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
  it("Proposal LC ≈ $6.57 (paying-month tier, 6 mo free at front, 9% tiered)", () => {
    // 130 mo / 6 free at front: paying mo 7-130 = 124 paying months.
    // Tier 1 = first 60 paying = mo 7-66 (yrs 1-6 mix). Tier 2 = mo 67-130.
    expect(calcLC(proposalInputs, 0.09)).toBeCloseTo(6.57, 1);
  });

  it("UW LC ≈ $5.37 (paying-month tier, 4 mo free at front, 9% tiered)", () => {
    expect(calcLC(uwInputs, 0.09)).toBeCloseTo(5.37, 1);
  });

  it("LL Rep + TR split sums to the same LC as a single equivalent percent", () => {
    const single = calcLC(proposalInputs, 0.09);
    const split = calcLC(proposalInputs, 0.045 + 0.045);
    expect(split).toBeCloseTo(single, 6);
    const skewed = calcLC(proposalInputs, 0.072 + 0.018);
    expect(skewed).toBeCloseTo(single, 6);
  });

  it("scales linearly with lcPercent", () => {
    const a = calcLC(proposalInputs, 0.09);
    const b = calcLC(proposalInputs, 0.18);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it("free rent excludes abated months from the LC base", () => {
    // 6 mo free vs 0 mo free for the SAME 130-mo term: with free rent,
    // those 6 months don't contribute to LC, and tier 1 advances 6 paying
    // months further into the schedule (mo 7-66 instead of mo 1-60).
    const withFree = calcLC(proposalInputs, 0.09);
    const noFree = calcLC({ ...proposalInputs, freeRentMonths: 0 }, 0.09);
    expect(withFree).not.toBeCloseTo(noFree, 4);
  });

  it("flat ≥ tiered (flat charges full % on month 61+ that tiered halves)", () => {
    expect(calcLC(proposalInputs, 0.09, "flat")).toBeGreaterThan(
      calcLC(proposalInputs, 0.09, "tiered"),
    );
  });

  it("flat ≡ tiered when total paying months ≤ 60 (no tier-2 rent)", () => {
    // 60-mo lease, 0 free → 60 paying mo, all in tier 1.
    const short = { ...proposalInputs, leaseTermMonths: 60, freeRentMonths: 0 };
    expect(calcLC(short, 0.09, "tiered")).toBeCloseTo(calcLC(short, 0.09, "flat"), 6);

    // 60-mo lease, 6 mo free → only 54 paying mo, still all in tier 1.
    const shortWithFree = { ...proposalInputs, leaseTermMonths: 60, freeRentMonths: 6 };
    expect(calcLC(shortWithFree, 0.09, "tiered")).toBeCloseTo(
      calcLC(shortWithFree, 0.09, "flat"),
      6,
    );
  });

  it("tier boundary is exactly the 60th paying month (61-mo lease, 0 free → 1 mo at half %)", () => {
    const inputs = { ...proposalInputs, leaseTermMonths: 61, freeRentMonths: 0 };
    const tiered = calcLC(inputs, 0.09, "tiered");
    const flat = calcLC(inputs, 0.09, "flat");
    // The 61st paying month (calendar mo 61) is yr 6.
    const yr6Rate = inputs.baseRatePSF * Math.pow(1 + inputs.escalation, 5);
    const yr6OneMonth = yr6Rate / 12;
    // Diff between flat and tiered is the half-rate "savings" on the 1 mo of tier 2.
    expect(flat - tiered).toBeCloseTo(0.045 * yr6OneMonth, 6);
  });

  it("tier boundary advances when there's free rent (66-mo lease + 6 mo free = same as 60-mo + 0 free)", () => {
    // 66-mo term + 6 mo free = 60 paying mo, all in tier 1.
    // 60-mo term + 0 free = 60 paying mo, all in tier 1.
    // Both should produce the same LC since the contracted PAYING months
    // are identical (mo 7-66 of the 66-mo lease = mo 1-60 of the 60-mo lease,
    // shifted by 6 calendar months — different yr indices, so values differ
    // due to escalation, BUT both fully fall in tier 1, so both are flat-=-tiered).
    const longer = { ...proposalInputs, leaseTermMonths: 66, freeRentMonths: 6 };
    expect(calcLC(longer, 0.09, "tiered")).toBeCloseTo(calcLC(longer, 0.09, "flat"), 6);
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

  it("building cost PSF ≈ $156.57 (140 shell + 10 TI + ~$6.57 LC, paying-month tier)", () => {
    expect(r.buildingCostPSF).toBeCloseTo(156.57, 1);
  });

  it("YoC Yr1 = 8 / buildingCostPSF", () => {
    expect(r.yocYr1).toBeCloseTo(8 / r.buildingCostPSF, 6);
  });

  it("YoC Term = avgRate / buildingCostPSF", () => {
    expect(r.yocTerm).toBeCloseTo(r.totals.avgRatePSF / r.buildingCostPSF, 6);
  });

  it("undiscounted NER ≈ $7.51 (paying-month-tier LC, 6 mo free at front)", () => {
    expect(r.undiscountedNER).toBeCloseTo(7.51, 1);
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

  it("50/50 with execution = commencement: both halves collapse to M1 regardless of free rent", () => {
    // proposalInputs has execution = commencement = "2025-01-01", so the
    // commencement month is M1 of the grid; both halves land there.
    const r = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    expect(r.grid[0].lcPSF).toBeCloseTo(-r.totals.lcPSF, 6);
    expect(r.grid[1].lcPSF).toBe(0);
    expect(r.grid[6].lcPSF).toBe(0); // not at rent commencement (post-free)
  });

  it("50/50 with execution before commencement: half at M1 (exec), half at commencement", () => {
    // 3-month lead time → commencement is grid M4 (index 3).
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
    expect(r.grid[3].lcPSF).toBeCloseTo(half, 6);
    // Free rent post-commencement does NOT delay the second half.
    expect(r.grid[9].lcPSF).toBe(0);
  });

  it("undiscounted NER is the same regardless of LC timing (only timing differs, not total)", () => {
    const a = runScenario({ ...proposalInputs, lcStructure: "upfront" }, makeGlobals());
    const b = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    expect(a.undiscountedNER).toBeCloseTo(b.undiscountedNER, 6);
  });

  it("discounted NER is the same as upfront when execution = commencement (both collapse to M1)", () => {
    // With execution = commencement, split50 puts both halves at M1 too —
    // identical timing to upfront, so the discounted NERs match exactly.
    const a = runScenario({ ...proposalInputs, lcStructure: "upfront" }, makeGlobals());
    const b = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    expect(a.discountedNER).toBeCloseTo(b.discountedNER, 6);
  });

  it("discounted NER is HIGHER for split50 when execution precedes commencement (second half is deferred)", () => {
    const earlySign = {
      ...proposalInputs,
      leaseExecutionDate: "2024-07-01",
      leaseCommencement: "2025-01-01",
    };
    const a = runScenario({ ...earlySign, lcStructure: "upfront" }, makeGlobals());
    const b = runScenario({ ...earlySign, lcStructure: "split50" }, makeGlobals());
    expect(b.discountedNER).toBeGreaterThan(a.discountedNER);
  });
});

describe("runScenario — UW (spec §12)", () => {
  const r = runScenario(uwInputs, makeGlobals());

  it("building cost PSF ≈ $150.37 (140 + 5 + ~$5.37 LC, paying-month tier)", () => {
    expect(r.buildingCostPSF).toBeCloseTo(150.37, 1);
  });

  it("YoC Yr1 ≈ 7 / 150.37 ≈ 4.66%", () => {
    expect(r.yocYr1).toBeCloseTo(7 / 150.37, 3);
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
  it("execution === commencement: split50 collapses both halves to M1", () => {
    // proposalInputs: execution = commencement. commencement month = M1 of
    // grid → both halves land there; full LC at M1.
    const r = runScenario({ ...proposalInputs, lcStructure: "split50" }, makeGlobals());
    expect(r.grid[0].lcPSF).toBeCloseTo(-r.totals.lcPSF, 6);
    expect(r.grid[1].lcPSF).toBe(0);
  });

  it("execution before commencement: half at M1 (exec), half at lease commencement", () => {
    // 3-month lead time → commencement is M4 of grid (index 3). Free rent
    // doesn't delay the second half — it's tied to commencement, not rent
    // commencement.
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
    expect(r.grid[3].lcPSF).toBeCloseTo(half, 6);
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

describe("free rent (always front-loaded)", () => {
  it("free rent abates months 1..freeRentMonths of the lease", () => {
    const r = runScenario(proposalInputs, makeGlobals());
    // Months 1-6: free (baseRent=0). Month 7+: paying.
    expect(r.grid[0].baseRentPSF).toBe(0);
    expect(r.grid[5].baseRentPSF).toBe(0);
    expect(r.grid[6].baseRentPSF).toBeGreaterThan(0);
  });

  it("split50 with execution = commencement: free rent does NOT delay the second LC half", () => {
    // Both halves collapse to M1 (lease commencement) regardless of free.
    const r = runScenario(
      { ...proposalInputs, lcStructure: "split50" },
      makeGlobals(),
    );
    expect(r.grid[0].lcPSF).toBeCloseTo(-r.totals.lcPSF, 6);
    expect(r.grid[6].lcPSF).toBe(0); // not at the post-free "rent commencement"
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
