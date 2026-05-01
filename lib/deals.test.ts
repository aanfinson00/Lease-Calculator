import { describe, expect, it } from "vitest";
import { dealAsScenarioPatch, dealLCSplit, parseDeals, parseUSDate } from "./deals";

const HEADER =
  "Code,Deal Name,Tenant Name,Project SF,Building SF,Lease SF,Untrended Rent,Trended Rent,Annual Growth,Lease Term,Start Month Post Completion,Starting Month,Start Month (Date),Free Rent (months),TIs,LCs,LC Override,Rent Escalations,MLA,Status";

const ROW_LEASE =
  "Deal01-4-01,Deal 01,Tenant 002,800000,650000,540726,11.22,11.22,0,84,0,33,5/15/2026,3,8.11,0.06,0,0.035,Global,LEASE";
const ROW_OVERRIDE =
  "Deal01-1-02,Deal 01,Tenant 006,46290,46290,46290,15.09,16.3,0.0335,84,6,54,10/19/2026,3,0,0,0.015,0.03,Global,SPEC";
const ROW_BOTH_LC_AND_OVERRIDE =
  "Deal03-1-03,Deal 03,Tenant 020,400000,400000,358606,15.83,15.83,0.0159,84,9,58,7/31/2024,9,7.69,0.04,0.017,0.03,Global,LEASE";

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

describe("parseDeals", () => {
  it("parses a header + single row", () => {
    const csv = `${HEADER}\n${ROW_LEASE}`;
    const deals = parseDeals(csv);
    expect(deals).toHaveLength(1);
    const d = deals[0]!;
    expect(d.code).toBe("Deal01-4-01");
    expect(d.dealName).toBe("Deal 01");
    expect(d.tenantName).toBe("Tenant 002");
    expect(d.projectSF).toBe(800000);
    expect(d.buildingSF).toBe(650000);
    expect(d.leaseSF).toBe(540726);
    expect(d.baseRatePSF).toBe(11.22);
    expect(d.escalation).toBe(0.035);
    expect(d.leaseTermMonths).toBe(84);
    expect(d.commencement).toBe("2026-05-15");
    expect(d.freeRentMonths).toBe(3);
    expect(d.tiAllowancePSF).toBe(8.11);
    expect(d.lcPercent).toBe(0.06);
    expect(d.status).toBe("LEASE");
  });

  it("uses LC Override when > 0 (instead of LCs)", () => {
    const csv = `${HEADER}\n${ROW_OVERRIDE}`;
    const deals = parseDeals(csv);
    // LCs=0, LC Override=0.015 → 0.015
    expect(deals[0]!.lcPercent).toBe(0.015);
  });

  it("LC Override wins over a non-zero LCs value too", () => {
    const csv = `${HEADER}\n${ROW_BOTH_LC_AND_OVERRIDE}`;
    const deals = parseDeals(csv);
    // LCs=0.04, LC Override=0.017 → 0.017
    expect(deals[0]!.lcPercent).toBe(0.017);
  });

  it("handles trailing blank lines and \\r\\n endings", () => {
    const csv = `${HEADER}\r\n${ROW_LEASE}\r\n\r\n`;
    const deals = parseDeals(csv);
    expect(deals).toHaveLength(1);
  });

  it("throws on a missing required column", () => {
    const bad = "Code,Deal Name\nA,B";
    expect(() => parseDeals(bad)).toThrow(/Missing CSV column/);
  });
});

describe("dealAsScenarioPatch", () => {
  const csv = `${HEADER}\n${ROW_LEASE}`;
  const deal = parseDeals(csv)[0]!;
  const patch = dealAsScenarioPatch(deal);

  it("maps the three SF columns separately to project / building / lease SF", () => {
    expect(patch.projectSF).toBe(800000);
    expect(patch.buildingSF).toBe(650000);
    expect(patch.proposedLeaseSF).toBe(540726);
  });

  it("uses Trended Rent as baseRatePSF", () => {
    expect(patch.baseRatePSF).toBe(11.22);
  });

  it("uses Rent Escalations (not Annual Growth) as escalation", () => {
    expect(patch.escalation).toBe(0.035);
  });

  it("sets execution = commencement (CSV doesn't carry execution date)", () => {
    expect(patch.leaseExecutionDate).toBe(patch.leaseCommencement);
  });

  it("clears prior overrides + collar to start clean", () => {
    expect(patch.rentScheduleOverride).toBeUndefined();
    expect(patch.escalationFloor).toBeUndefined();
    expect(patch.escalationCap).toBeUndefined();
    expect(patch.freeRentStartMonth).toBe(1);
    expect(patch.tiDurationMonths).toBe(1);
  });

  it("sets the scenario name to the deal code (renames whatever was there)", () => {
    expect(patch.name).toBe("Deal01-4-01");
    expect(patch.dealCode).toBe("Deal01-4-01");
  });
});

describe("dealLCSplit", () => {
  it("splits the deal's LC% 50/50 into LL Rep + Tenant Rep", () => {
    const deal = parseDeals(`${HEADER}\n${ROW_LEASE}`)[0]!;
    const split = dealLCSplit(deal);
    expect(split.lcLLRepPercent).toBe(0.03);
    expect(split.lcTenantRepPercent).toBe(0.03);
    expect(split.lcLLRepPercent + split.lcTenantRepPercent).toBe(deal.lcPercent);
  });

  it("respects the LC Override too", () => {
    const deal = parseDeals(`${HEADER}\n${ROW_OVERRIDE}`)[0]!;
    const split = dealLCSplit(deal);
    expect(split.lcLLRepPercent + split.lcTenantRepPercent).toBe(0.015);
  });
});
