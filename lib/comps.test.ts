import { describe, expect, it } from "vitest";
import {
  compAsScenarioPatch,
  compsToCsv,
  csvHeader,
  defaultComp,
  emptyFilters,
  filterComps,
  hasActiveFilters,
  parseComps,
  parseUSDate,
  scenarioToComp,
  sortComps,
  summarizeComps,
  validateComp,
  type Comp,
} from "./comps";
import type { Globals, ScenarioInputs } from "./types";

const HEADER =
  "Code,Deal Name,Tenant Name,Project SF,Building SF,Lease SF,Untrended Rent,Trended Rent,Annual Growth,Lease Term,Start Month Post Completion,Starting Month,Start Month (Date),Free Rent (months),TIs,LCs,LC Override,Rent Escalations,MLA,Status";

const ROW_LEASE =
  "Deal01-4-01,Deal 01,Tenant 002,800000,650000,540726,11.22,11.22,0,84,0,33,5/15/2026,3,8.11,0.06,0,0.035,Global,LEASE";
const ROW_OVERRIDE =
  "Deal01-1-02,Deal 01,Tenant 006,46290,46290,46290,15.09,16.3,0.0335,84,6,54,10/19/2026,3,0,0,0.015,0.03,Global,SPEC";

describe("parseUSDate", () => {
  it("converts M/D/YYYY → YYYY-MM-DD", () => {
    expect(parseUSDate("5/14/2026")).toBe("2026-05-14");
    expect(parseUSDate("12/9/2024")).toBe("2024-12-09");
  });

  it("zero-pads single-digit months and days", () => {
    expect(parseUSDate("1/3/2025")).toBe("2025-01-03");
  });

  it("returns empty string for malformed input", () => {
    expect(parseUSDate("not-a-date")).toBe("");
    expect(parseUSDate("")).toBe("");
  });
});

describe("parseComps", () => {
  it("parses a header + single row into the Comp shape", () => {
    const comps = parseComps(`${HEADER}\n${ROW_LEASE}`);
    expect(comps).toHaveLength(1);
    const c = comps[0]!;
    expect(c.code).toBe("Deal01-4-01");
    expect(c.dealName).toBe("Deal 01");
    expect(c.tenantName).toBe("Tenant 002");
    expect(c.projectSF).toBe(800000);
    expect(c.buildingSF).toBe(650000);
    expect(c.leaseSF).toBe(540726);
    expect(c.baseRatePSF).toBe(11.22);
    expect(c.escalation).toBe(0.035);
    expect(c.leaseTermMonths).toBe(84);
    expect(c.commencementDate).toBe("2026-05-15");
    expect(c.freeRentMonths).toBe(3);
    expect(c.tiAllowancePSF).toBe(8.11);
    expect(c.leaseStructure).toBe("NNN");
  });

  it("maps legacy LEASE → EXECUTED, SPEC → PROPOSAL", () => {
    expect(parseComps(`${HEADER}\n${ROW_LEASE}`)[0]!.status).toBe("EXECUTED");
    expect(parseComps(`${HEADER}\n${ROW_OVERRIDE}`)[0]!.status).toBe("PROPOSAL");
  });

  it("splits combined LC into 1/3 LL + 2/3 TR (preserving the total)", () => {
    const c = parseComps(`${HEADER}\n${ROW_LEASE}`)[0]!;
    expect(c.lcLLRepPercent).toBeCloseTo(0.02, 10);
    expect(c.lcTenantRepPercent).toBeCloseTo(0.04, 10);
    expect(c.lcLLRepPercent + c.lcTenantRepPercent).toBe(0.06);
  });

  it("uses LC Override when greater than zero", () => {
    const c = parseComps(`${HEADER}\n${ROW_OVERRIDE}`)[0]!;
    expect(c.lcLLRepPercent + c.lcTenantRepPercent).toBeCloseTo(0.015, 10);
  });

  it("assigns a unique id to each row", () => {
    const csv = `${HEADER}\n${ROW_LEASE}\n${ROW_OVERRIDE}`;
    const comps = parseComps(csv);
    expect(comps).toHaveLength(2);
    expect(comps[0]!.id).not.toBe(comps[1]!.id);
    expect(comps[0]!.id.length).toBeGreaterThan(0);
  });

  it("throws on a missing required column", () => {
    expect(() => parseComps("Code,Deal Name\nA,B")).toThrow(/Missing CSV column/);
  });
});

describe("compAsScenarioPatch", () => {
  it("rounds-trips through Comp -> ScenarioInputs patch", () => {
    const c = parseComps(`${HEADER}\n${ROW_LEASE}`)[0]!;
    const p = compAsScenarioPatch(c);
    expect(p.projectSF).toBe(800000);
    expect(p.buildingSF).toBe(650000);
    expect(p.proposedLeaseSF).toBe(540726);
    expect(p.baseRatePSF).toBe(11.22);
    expect(p.escalation).toBe(0.035);
    expect(p.leaseCommencement).toBe("2026-05-15");
    // CSV has no signed date — execution defaults to commencement.
    expect(p.leaseExecutionDate).toBe("2026-05-15");
    expect(p.lcLLRepPercent).toBeCloseTo(0.02, 10);
    expect(p.lcTenantRepPercent).toBeCloseTo(0.04, 10);
  });

  it("uses signedDate as the execution anchor when set", () => {
    const c: Comp = {
      ...parseComps(`${HEADER}\n${ROW_LEASE}`)[0]!,
      signedDate: "2026-04-01",
    };
    expect(compAsScenarioPatch(c).leaseExecutionDate).toBe("2026-04-01");
  });
});

describe("defaultComp", () => {
  it("returns a Comp that fails validation only on the required text fields", () => {
    const c = defaultComp();
    const errs = validateComp(c).map((e) => e.field);
    expect(errs).toContain("code");
    expect(errs).toContain("dealName");
    expect(errs).toContain("tenantName");
    // SF fields default to 0 → also blocking; that's expected for a blank form.
    expect(errs).toContain("projectSF");
    expect(errs).toContain("baseRatePSF");
  });

  it("uses NNN as the default lease structure (industrial norm)", () => {
    expect(defaultComp().leaseStructure).toBe("NNN");
  });
});

describe("validateComp", () => {
  const filled = (): Comp => ({
    ...defaultComp(),
    code: "C-001",
    dealName: "Deal A",
    tenantName: "Tenant",
    commencementDate: "2026-01-01",
    projectSF: 100000,
    buildingSF: 100000,
    leaseSF: 100000,
    baseRatePSF: 10,
    leaseTermMonths: 60,
    freeRentMonths: 6,
    tiAllowancePSF: 5,
  });

  it("a fully-filled comp validates clean", () => {
    expect(validateComp(filled())).toEqual([]);
  });

  it("flags free rent > term", () => {
    const c = { ...filled(), freeRentMonths: 120 };
    expect(validateComp(c).find((e) => e.field === "freeRentMonths")).toBeDefined();
  });

  it("flags signed date after commencement", () => {
    const c: Comp = { ...filled(), signedDate: "2026-06-01" };
    expect(validateComp(c).find((e) => e.field === "signedDate")).toBeDefined();
  });

  it("allows signed date == commencement (same-day execution)", () => {
    const c: Comp = { ...filled(), signedDate: filled().commencementDate };
    expect(validateComp(c).find((e) => e.field === "signedDate")).toBeUndefined();
  });

  it("flags zero SF", () => {
    const c = { ...filled(), leaseSF: 0 };
    expect(validateComp(c).find((e) => e.field === "leaseSF")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Filter / sort / summary / CSV helpers
// ---------------------------------------------------------------------------

const baseComp = (overrides: Partial<Comp> = {}): Comp => ({
  ...defaultComp(),
  code: "C-1",
  dealName: "Deal 1",
  tenantName: "Tenant",
  status: "EXECUTED",
  commencementDate: "2026-01-01",
  projectSF: 100_000,
  buildingSF: 100_000,
  leaseSF: 50_000,
  baseRatePSF: 10,
  escalation: 0.03,
  leaseTermMonths: 60,
  freeRentMonths: 6,
  tiAllowancePSF: 5,
  lcLLRepPercent: 0.03,
  lcTenantRepPercent: 0.06,
  leaseStructure: "NNN",
  ...overrides,
});

describe("hasActiveFilters", () => {
  it("returns false when nothing is set", () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false);
  });

  it("returns true when search has any non-whitespace text", () => {
    expect(hasActiveFilters({ ...emptyFilters(), search: "acme" })).toBe(true);
  });

  it("ignores whitespace-only search", () => {
    expect(hasActiveFilters({ ...emptyFilters(), search: "   " })).toBe(false);
  });

  it("returns true when any range bound is set", () => {
    expect(hasActiveFilters({ ...emptyFilters(), termMonths: { min: 12 } })).toBe(true);
  });
});

describe("filterComps", () => {
  const corpus: Comp[] = [
    baseComp({ id: "1", code: "A-1", market: "IE West", baseRatePSF: 8, leaseTermMonths: 60, leaseSF: 50_000, status: "EXECUTED", propertySubtype: "WAREHOUSE", buildingClass: "A" }),
    baseComp({ id: "2", code: "A-2", market: "IE East", baseRatePSF: 12, leaseTermMonths: 84, leaseSF: 100_000, status: "PROPOSAL", propertySubtype: "DISTRIBUTION", buildingClass: "B" }),
    baseComp({ id: "3", code: "A-3", market: "IE West", baseRatePSF: 15, leaseTermMonths: 120, leaseSF: 200_000, status: "RENEWAL", propertySubtype: "WAREHOUSE" }),
  ];

  it("matches search across code, deal, tenant, market, submarket", () => {
    expect(filterComps(corpus, { ...emptyFilters(), search: "ie east" })).toHaveLength(1);
    expect(filterComps(corpus, { ...emptyFilters(), search: "A-3" })).toHaveLength(1);
  });

  it("filters by multi-select status", () => {
    const r = filterComps(corpus, { ...emptyFilters(), statuses: ["EXECUTED", "RENEWAL"] });
    expect(r.map((c) => c.code).sort()).toEqual(["A-1", "A-3"]);
  });

  it("filters by subtype + class together (AND across categories)", () => {
    const r = filterComps(corpus, {
      ...emptyFilters(),
      subtypes: ["WAREHOUSE"],
      classes: ["A"],
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.code).toBe("A-1");
  });

  it("filters by market multi-select", () => {
    const r = filterComps(corpus, { ...emptyFilters(), markets: ["IE West"] });
    expect(r.map((c) => c.code).sort()).toEqual(["A-1", "A-3"]);
  });

  it("applies term + base rate ranges (inclusive)", () => {
    const r = filterComps(corpus, {
      ...emptyFilters(),
      termMonths: { min: 60, max: 84 },
      baseRatePSF: { min: 10, max: 15 },
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.code).toBe("A-2");
  });

  it("returns empty when no comp matches", () => {
    expect(filterComps(corpus, { ...emptyFilters(), search: "nope" })).toEqual([]);
  });

  it("returns the full list when filters are empty", () => {
    expect(filterComps(corpus, emptyFilters())).toHaveLength(3);
  });
});

describe("sortComps", () => {
  const corpus: Comp[] = [
    baseComp({ id: "1", code: "B", baseRatePSF: 10, leaseTermMonths: 60, status: "RENEWAL", lcLLRepPercent: 0.02, lcTenantRepPercent: 0.04, modifiedAt: "2026-01-01T00:00:00Z" }),
    baseComp({ id: "2", code: "A", baseRatePSF: 15, leaseTermMonths: 36, status: "EXECUTED", lcLLRepPercent: 0.03, lcTenantRepPercent: 0.06, modifiedAt: "2026-02-01T00:00:00Z" }),
    baseComp({ id: "3", code: "C", baseRatePSF: 8, leaseTermMonths: 120, status: "PROPOSAL", lcLLRepPercent: 0.04, lcTenantRepPercent: 0.08, modifiedAt: "2026-03-01T00:00:00Z" }),
  ];

  it("sorts by code asc", () => {
    expect(sortComps(corpus, { key: "code", dir: "asc" }).map((c) => c.code)).toEqual(["A", "B", "C"]);
  });

  it("sorts by code desc", () => {
    expect(sortComps(corpus, { key: "code", dir: "desc" }).map((c) => c.code)).toEqual(["C", "B", "A"]);
  });

  it("sorts numerically by base rate", () => {
    expect(sortComps(corpus, { key: "baseRatePSF", dir: "asc" }).map((c) => c.baseRatePSF)).toEqual([8, 10, 15]);
  });

  it("sorts by combined LC (derived field)", () => {
    expect(sortComps(corpus, { key: "combinedLC", dir: "asc" }).map((c) => c.code)).toEqual(["B", "A", "C"]);
  });

  it("sorts status by enum priority (EXECUTED first)", () => {
    expect(sortComps(corpus, { key: "status", dir: "asc" }).map((c) => c.status)).toEqual([
      "EXECUTED",
      "RENEWAL",
      "PROPOSAL",
    ]);
  });

  it("sorts by modifiedAt", () => {
    expect(sortComps(corpus, { key: "modifiedAt", dir: "desc" }).map((c) => c.id)).toEqual(["3", "2", "1"]);
  });

  it("does not mutate the input array", () => {
    const original = [...corpus];
    sortComps(corpus, { key: "code", dir: "desc" });
    expect(corpus).toEqual(original);
  });
});

describe("summarizeComps", () => {
  it("returns zeroes for an empty list", () => {
    expect(summarizeComps([])).toEqual({
      count: 0,
      avgBaseRatePSF: 0,
      avgTermMonths: 0,
      avgTIPSF: 0,
      avgCombinedLCPercent: 0,
      nerSnapshotCount: 0,
    });
  });

  it("counts how many comps have a cached NER snapshot", () => {
    const corpus: Comp[] = [
      baseComp({ id: "1" }),
      baseComp({ id: "2", ner: { undiscounted: 9, discounted: 8, totalBasisPSF: 150 } }),
      baseComp({ id: "3", ner: { undiscounted: 11, discounted: 10, totalBasisPSF: 160 } }),
    ];
    const s = summarizeComps(corpus);
    expect(s.nerSnapshotCount).toBe(2);
    expect(s.avgDiscountedNER).toBe(9);
    expect(s.avgUndiscountedNER).toBe(10);
  });

  it("leaves NER averages undefined when nothing has a snapshot", () => {
    const s = summarizeComps([baseComp(), baseComp()]);
    expect(s.nerSnapshotCount).toBe(0);
    expect(s.avgDiscountedNER).toBeUndefined();
    expect(s.avgUndiscountedNER).toBeUndefined();
  });

  it("averages numeric fields across the list", () => {
    const corpus: Comp[] = [
      baseComp({ baseRatePSF: 10, leaseTermMonths: 60, tiAllowancePSF: 5, lcLLRepPercent: 0.03, lcTenantRepPercent: 0.06 }),
      baseComp({ baseRatePSF: 20, leaseTermMonths: 120, tiAllowancePSF: 15, lcLLRepPercent: 0.05, lcTenantRepPercent: 0.10 }),
    ];
    const s = summarizeComps(corpus);
    expect(s.count).toBe(2);
    expect(s.avgBaseRatePSF).toBe(15);
    expect(s.avgTermMonths).toBe(90);
    expect(s.avgTIPSF).toBe(10);
    expect(s.avgCombinedLCPercent).toBeCloseTo(0.12, 6);
  });
});

describe("compsToCsv / csvHeader / csvEscape", () => {
  it("emits a header line + one row per comp", () => {
    const corpus = [
      baseComp({ id: "1", code: "A", dealName: "Plain" }),
      baseComp({ id: "2", code: "B", dealName: "Plain" }),
    ];
    const csv = compsToCsv(corpus);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(csvHeader());
    expect(lines[0]).toContain("code");
    expect(lines[0]).toContain("modifiedAt");
  });

  it("quotes fields containing commas", () => {
    const c = baseComp({ notes: "Has, a comma" });
    const csv = compsToCsv([c]);
    expect(csv).toContain('"Has, a comma"');
  });

  it("escapes embedded quotes by doubling", () => {
    const c = baseComp({ notes: 'Has "quotes"' });
    const csv = compsToCsv([c]);
    expect(csv).toContain('"Has ""quotes"""');
  });

  it("handles undefined optional fields as empty strings", () => {
    const c = baseComp({ market: undefined, submarket: undefined, notes: undefined });
    const row = compsToCsv([c]).split("\n")[1]!;
    // Two consecutive commas signal an empty cell.
    expect(row).toMatch(/,,/);
  });
});

describe("scenarioToComp", () => {
  const inputs: ScenarioInputs = {
    name: "Counter v1",
    dealCode: "DEAL-X",
    projectSF: 300_000,
    buildingSF: 300_000,
    proposedLeaseSF: 100_000,
    baseRatePSF: 9.5,
    escalation: 0.03,
    lcLLRepPercent: 0.03,
    lcTenantRepPercent: 0.06,
    lcCalculation: "tiered",
    lcStructure: "split50",
    tiAllowancePSF: 7,
    freeRentMonths: 4,
    leaseTermMonths: 84,
    leaseCommencement: "2026-06-01",
    leaseExecutionDate: "2026-04-01",
    tiDurationMonths: 1,
  };
  const globals: Globals = {
    discountRate: 0.08,
    projectBasisPSF: 140,
    horizonMonths: 204,
  };

  it("copies the scenario's economics into the draft", () => {
    const c = scenarioToComp(inputs, globals);
    expect(c.code).toBe("DEAL-X");
    expect(c.dealName).toBe("Counter v1");
    expect(c.projectSF).toBe(300_000);
    expect(c.leaseSF).toBe(100_000);
    expect(c.baseRatePSF).toBe(9.5);
    expect(c.leaseTermMonths).toBe(84);
    expect(c.freeRentMonths).toBe(4);
    expect(c.tiAllowancePSF).toBe(7);
    expect(c.lcLLRepPercent).toBeCloseTo(0.03, 10);
    expect(c.lcTenantRepPercent).toBeCloseTo(0.06, 10);
  });

  it("uses the execution date as the signed date", () => {
    const c = scenarioToComp(inputs, globals);
    expect(c.signedDate).toBe("2026-04-01");
    expect(c.commencementDate).toBe("2026-06-01");
  });

  it("falls back to scenario name when dealCode is unset", () => {
    const c = scenarioToComp({ ...inputs, dealCode: undefined }, globals);
    expect(c.code).toBe("Counter v1");
  });

  it("seeds a non-zero NER snapshot from the calc engine", () => {
    const c = scenarioToComp(inputs, globals);
    expect(c.ner).toBeDefined();
    expect(c.ner!.discounted).toBeGreaterThan(0);
    expect(c.ner!.totalBasisPSF).toBeGreaterThan(0);
  });

  it("starts as PROPOSAL with an audit-trail note", () => {
    const c = scenarioToComp(inputs, globals);
    expect(c.status).toBe("PROPOSAL");
    expect(c.notes).toMatch(/Captured from analyzer scenario "Counter v1"/);
  });
});
