/**
 * Parity test: build a workbook from each canonical scenario, read it back
 * through exceljs, and confirm key cells contain the formulas we expect.
 *
 * We don't evaluate the formulas (exceljs ships a formula parser but it's
 * incomplete for SUMPRODUCT + named ranges). The parity guarantee comes
 * from cross-checking the formula STRINGS against the calc engine's
 * spec — i.e. "this cell references A_Term" rather than "this cell
 * evaluates to 7.34". Calc-engine correctness lives in calc.test.ts.
 *
 * Structural assertions only — sheets exist, cells are populated, formulas
 * mention the right named ranges.
 */

import { describe, expect, it } from "vitest";
import { buildWorkbook } from "./export-xlsx";
import { runScenario } from "./calc";
import type { Globals, ScenarioInputs } from "./types";

const globals: Globals = {
  discountRate: 0.08,
  projectBasisPSF: 140,
  horizonMonths: 204,
};

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

async function makeBook() {
  const aResults = runScenario(uwInputs, globals);
  const bResults = runScenario(proposalInputs, globals);
  return buildWorkbook(
    "Test Property",
    { name: uwInputs.name, inputs: uwInputs, results: aResults },
    { name: proposalInputs.name, inputs: proposalInputs, results: bResults },
    globals,
  );
}

describe("buildWorkbook — structure", () => {
  it("contains all expected sheets", async () => {
    const wb = await makeBook();
    const names = wb.worksheets.map((s) => s.name);
    expect(names).toContain("Summary");
    expect(names).toContain("Assumptions");
    expect(names).toContain("Annual Schedule A");
    expect(names).toContain("Annual Schedule B");
    expect(names).toContain("Monthly Grid A");
    expect(names).toContain("Monthly Grid B");
    expect(names).toContain("NER");
    expect(names).toContain("Validation");
  });

  it("Assumptions sheet has input values written as raw numbers", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("Assumptions");
    expect(ws).toBeDefined();
    // B10 = base rate (UW = 7), C10 = base rate (Proposal = 8)
    expect(ws!.getCell("B10").value).toBe(7);
    expect(ws!.getCell("C10").value).toBe(8);
    // B25 = lease term (UW = 125), C25 = lease term (Proposal = 130)
    expect(ws!.getCell("B25").value).toBe(125);
    expect(ws!.getCell("C25").value).toBe(130);
    // B30 = discount rate
    expect(ws!.getCell("B30").value).toBe(0.08);
  });

  it("Annual Schedule A row 5 is the escalation formula", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("Annual Schedule A");
    const b5 = ws!.getCell("B5").value as { formula: string };
    expect(b5.formula).toContain("A_Base");
    expect(b5.formula).toContain("A_Esc");
    // Y1 → exponent (A5-1) = 0 → just baseRate.
    expect(b5.formula).toContain("A5-1");
  });

  it("Monthly Grid A row 5 (M=1) has the LC payment formula", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("Monthly Grid A");
    const n5 = ws!.getCell("N5").value as { formula: string };
    expect(n5.formula).toContain("A_LCStruct");
    expect(n5.formula).toContain("NER!");
  });

  it("NER sheet B2 contains the tier1 + tier2 LC formula", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("NER");
    const b2 = ws!.getCell("B2").value as { formula: string };
    expect(b2.formula).toContain("A_LLRep");
    expect(b2.formula).toContain("A_TRep");
    expect(b2.formula).toContain("A_Grid_T1");
    expect(b2.formula).toContain("A_Grid_T2");
    expect(b2.formula).toContain("A_Grid_BaseRent");
    expect(b2.formula).toContain("A_LCCalc");
  });

  it("NER undiscounted formula is NetCF / Term × 12", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("NER");
    const b5 = ws!.getCell("B5").value as { formula: string };
    expect(b5.formula).toBe("B4/A_Term*12");
  });

  it("NER discounted formula is PV / Term × 12", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("NER");
    const b7 = ws!.getCell("B7").value as { formula: string };
    expect(b7.formula).toBe("B6/A_Term*12");

    const b6 = ws!.getCell("B6").value as { formula: string };
    // PV formula: SUMPRODUCT with /(1+r/12)^(m-1) for period 0 = M1.
    expect(b6.formula).toContain("DiscRate/12");
    expect(b6.formula).toContain("A_Grid_NetCF");
  });

  it("Summary sheet references NER values via defined names", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("Summary");
    // Row 6 = Undiscounted NER. B6 should reference A_UndiscNER, C6 → B_UndiscNER.
    const b6 = ws!.getCell("B6").value as { formula: string };
    const c6 = ws!.getCell("C6").value as { formula: string };
    expect(b6.formula).toBe("A_UndiscNER");
    expect(c6.formula).toBe("B_UndiscNER");
  });

  it("Validation sheet captures app snapshot as raw numbers", async () => {
    const wb = await makeBook();
    const ws = wb.getWorksheet("Validation");
    // Row 5, col C = UW undiscounted NER from the app at generation time.
    const aResults = runScenario(uwInputs, globals);
    expect(ws!.getCell("C5").value).toBeCloseTo(aResults.undiscountedNER, 6);
  });
});

describe("buildWorkbook — writes a valid .xlsx", () => {
  it("produces a non-empty buffer", async () => {
    const wb = await makeBook();
    const buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);
    // XLSX = ZIP archive, starts with "PK\x03\x04".
    const u8 = new Uint8Array(buf as ArrayBuffer);
    expect(u8[0]).toBe(0x50); // P
    expect(u8[1]).toBe(0x4b); // K
  });
});
