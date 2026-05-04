import { describe, expect, it } from "vitest";
import {
  compAsScenarioPatch,
  defaultComp,
  parseComps,
  parseUSDate,
  validateComp,
  type Comp,
} from "./comps";

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
