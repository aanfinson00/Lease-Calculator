/**
 * Excel workbook builder for the RFP Analyzer.
 *
 * Mirrors the app's calc engine in lib/calc.ts using live Excel formulas
 * so the resulting .xlsx recomputes when you edit the Assumptions sheet.
 * Sheet layout:
 *
 *   1. Summary            — headline metrics, links upstream to NER + Assumptions.
 *   2. Assumptions        — the only editable sheet. Inputs + globals, side-by-side.
 *   3. Annual Schedule A  — year-by-year escalation table (mirrors buildAnnualSchedule).
 *   4. Annual Schedule B
 *   5. Monthly Grid A     — month-by-month cash flow (mirrors buildMonthlyGrid).
 *   6. Monthly Grid B
 *   7. NER                — LC PSF, undiscounted + discounted NER, YoC, totals.
 *   8. Validation         — spec §12 targets vs live calc, parity check.
 *
 * The LC calc carries one subtlety: tier1/tier2 are bucketed by PAYING-month
 * count (free months don't count). Implemented via a running-count column on
 * the Monthly Grid, then SUMPRODUCT to total tier1/tier2 base rent. This
 * matches calcLC() at lib/calc.ts:91 month-for-month.
 *
 * No circularity: LC PSF depends on the Base Rent column; the LC PAYMENT
 * column depends on LC PSF + month index. The base rent column never reads
 * the LC payment column.
 */

import type { Workbook, Worksheet, Cell } from "exceljs";
import type { Globals, ScenarioInputs, ScenarioResults } from "./types";

// ---------------------------------------------------------------------------
// Sheet-A / sheet-B coordinates
// ---------------------------------------------------------------------------

// Row offsets on the Assumptions sheet. Two scenario columns side-by-side
// (B = A, C = B); globals in B30+.
const ASSUMPTIONS = {
  // header row at 1
  scenarioName: 3,
  projectSF: 5,
  buildingSF: 6,
  leaseSF: 7,
  baseRate: 10,
  escalation: 11,
  tiAllowance: 14,
  tiDuration: 15,
  freeRent: 16,
  llRep: 19,
  tenantRep: 20,
  lcCalc: 21,
  lcStruct: 22,
  term: 25,
  execution: 26,
  commencement: 27,
  discountRate: 30,
  projectBasis: 31,
  horizon: 32,
} as const;

const MAX_YEARS = 30;             // annual schedule rows — covers 30-year leases
const GRID_MAX_MONTHS = 360;      // monthly grid horizon (30 years; matches MAX_YEARS)

interface Scenario {
  name: string;
  inputs: ScenarioInputs;
  results: ScenarioResults;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the workbook in memory. Caller is responsible for writing it to a
 * blob (`workbook.xlsx.writeBuffer()`).
 */
export async function buildWorkbook(
  propertyName: string,
  a: Scenario,
  b: Scenario,
  globals: Globals,
): Promise<Workbook> {
  // Dynamic import so vitest can run this in a node env and the browser
  // bundle can code-split exceljs out of the main JS chunk.
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "RFP Analyzer";
  wb.created = new Date();
  wb.title = `${propertyName || "RFP"} Comparison`;

  buildAssumptionsSheet(wb, a, b, globals);
  buildAnnualScheduleSheet(wb, "Annual Schedule A", "A", a);
  buildAnnualScheduleSheet(wb, "Annual Schedule B", "B", b);
  buildMonthlyGridSheet(wb, "Monthly Grid A", "A", a, globals);
  buildMonthlyGridSheet(wb, "Monthly Grid B", "B", b, globals);
  buildNerSheet(wb, a, b);
  buildSummarySheet(wb, propertyName, a, b);
  buildValidationSheet(wb, a, b);

  // Make Summary the active sheet on open. ExcelJS's WorkbookView type
  // requires full window geometry; the values below are reasonable defaults
  // (mirrors what Excel writes for a maximized window).
  wb.views = [{
    x: 0, y: 0, width: 12000, height: 8000,
    firstSheet: 0, activeTab: wb.worksheets.findIndex((s) => s.name === "Summary"),
    visibility: "visible",
  }];

  return wb;
}

// ---------------------------------------------------------------------------
// Assumptions sheet — the only editable inputs
// ---------------------------------------------------------------------------

function buildAssumptionsSheet(
  wb: Workbook,
  a: Scenario,
  b: Scenario,
  globals: Globals,
): void {
  const ws = wb.addWorksheet("Assumptions");
  ws.columns = [
    { width: 32 },
    { width: 18 },
    { width: 18 },
  ];

  setTitle(ws, "A1", "Inputs & globals");
  setSubtitle(
    ws,
    "A2",
    "Edit any cell here — the rest of the workbook recomputes.",
  );

  // Column headers
  writeHeader(ws.getCell(`B${ASSUMPTIONS.scenarioName}`), "Scenario A");
  writeHeader(ws.getCell(`C${ASSUMPTIONS.scenarioName}`), "Scenario B");
  ws.getCell(`B${ASSUMPTIONS.scenarioName}`).value = a.name;
  ws.getCell(`C${ASSUMPTIONS.scenarioName}`).value = b.name;

  // Sections
  writeSectionRow(ws, 4, "Square Footage");
  writeInputRow(ws, ASSUMPTIONS.projectSF, "Project SF", a.inputs.projectSF, b.inputs.projectSF, "#,##0");
  writeInputRow(ws, ASSUMPTIONS.buildingSF, "Building SF", a.inputs.buildingSF, b.inputs.buildingSF, "#,##0");
  writeInputRow(ws, ASSUMPTIONS.leaseSF, "Lease SF", a.inputs.proposedLeaseSF, b.inputs.proposedLeaseSF, "#,##0");

  writeSectionRow(ws, 9, "Rent");
  writeInputRow(ws, ASSUMPTIONS.baseRate, "Base Rate ($/SF)", a.inputs.baseRatePSF, b.inputs.baseRatePSF, "$#,##0.00");
  writeInputRow(ws, ASSUMPTIONS.escalation, "Escalation (annual)", a.inputs.escalation, b.inputs.escalation, "0.00%");

  writeSectionRow(ws, 13, "Concessions");
  writeInputRow(ws, ASSUMPTIONS.tiAllowance, "TI Allowance ($/SF)", a.inputs.tiAllowancePSF, b.inputs.tiAllowancePSF, "$#,##0.00");
  writeInputRow(ws, ASSUMPTIONS.tiDuration, "TI Duration (mo)", a.inputs.tiDurationMonths, b.inputs.tiDurationMonths, "0");
  writeInputRow(ws, ASSUMPTIONS.freeRent, "Free Rent (mo)", a.inputs.freeRentMonths, b.inputs.freeRentMonths, "0");

  writeSectionRow(ws, 18, "Leasing Commissions");
  writeInputRow(ws, ASSUMPTIONS.llRep, "Landlord Rep (%)", a.inputs.lcLLRepPercent, b.inputs.lcLLRepPercent, "0.00%");
  writeInputRow(ws, ASSUMPTIONS.tenantRep, "Tenant Rep (%)", a.inputs.lcTenantRepPercent, b.inputs.lcTenantRepPercent, "0.00%");
  writeInputRow(ws, ASSUMPTIONS.lcCalc, "LC Calc (tiered|flat)", a.inputs.lcCalculation, b.inputs.lcCalculation);
  writeInputRow(ws, ASSUMPTIONS.lcStruct, "LC Structure (upfront|split50)", a.inputs.lcStructure, b.inputs.lcStructure);

  writeSectionRow(ws, 24, "Term");
  writeInputRow(ws, ASSUMPTIONS.term, "Lease Term (mo)", a.inputs.leaseTermMonths, b.inputs.leaseTermMonths, "0");
  writeDateRow(ws, ASSUMPTIONS.execution, "Execution Date", a.inputs.leaseExecutionDate, b.inputs.leaseExecutionDate);
  writeDateRow(ws, ASSUMPTIONS.commencement, "Commencement Date", a.inputs.leaseCommencement, b.inputs.leaseCommencement);

  writeSectionRow(ws, 29, "Global assumptions");
  writeGlobalRow(ws, ASSUMPTIONS.discountRate, "Discount Rate", globals.discountRate, "0.00%");
  writeGlobalRow(ws, ASSUMPTIONS.projectBasis, "Project Basis ($/SF)", globals.projectBasisPSF, "$#,##0.00");
  writeGlobalRow(ws, ASSUMPTIONS.horizon, "Horizon (mo)", globals.horizonMonths, "0");

  // Defined names — referenced by every downstream sheet. Using sheet-local
  // names so we can have A_Base and B_Base distinct.
  const ABS = (col: string, row: number) => `Assumptions!$${col}$${row}`;
  defineName(wb, "A_Name", ABS("B", ASSUMPTIONS.scenarioName));
  defineName(wb, "B_Name", ABS("C", ASSUMPTIONS.scenarioName));
  defineName(wb, "A_LeaseSF", ABS("B", ASSUMPTIONS.leaseSF));
  defineName(wb, "B_LeaseSF", ABS("C", ASSUMPTIONS.leaseSF));
  defineName(wb, "A_Base", ABS("B", ASSUMPTIONS.baseRate));
  defineName(wb, "B_Base", ABS("C", ASSUMPTIONS.baseRate));
  defineName(wb, "A_Esc", ABS("B", ASSUMPTIONS.escalation));
  defineName(wb, "B_Esc", ABS("C", ASSUMPTIONS.escalation));
  defineName(wb, "A_TIAllow", ABS("B", ASSUMPTIONS.tiAllowance));
  defineName(wb, "B_TIAllow", ABS("C", ASSUMPTIONS.tiAllowance));
  defineName(wb, "A_TIDur", ABS("B", ASSUMPTIONS.tiDuration));
  defineName(wb, "B_TIDur", ABS("C", ASSUMPTIONS.tiDuration));
  defineName(wb, "A_Free", ABS("B", ASSUMPTIONS.freeRent));
  defineName(wb, "B_Free", ABS("C", ASSUMPTIONS.freeRent));
  defineName(wb, "A_LLRep", ABS("B", ASSUMPTIONS.llRep));
  defineName(wb, "B_LLRep", ABS("C", ASSUMPTIONS.llRep));
  defineName(wb, "A_TRep", ABS("B", ASSUMPTIONS.tenantRep));
  defineName(wb, "B_TRep", ABS("C", ASSUMPTIONS.tenantRep));
  defineName(wb, "A_LCCalc", ABS("B", ASSUMPTIONS.lcCalc));
  defineName(wb, "B_LCCalc", ABS("C", ASSUMPTIONS.lcCalc));
  defineName(wb, "A_LCStruct", ABS("B", ASSUMPTIONS.lcStruct));
  defineName(wb, "B_LCStruct", ABS("C", ASSUMPTIONS.lcStruct));
  defineName(wb, "A_Term", ABS("B", ASSUMPTIONS.term));
  defineName(wb, "B_Term", ABS("C", ASSUMPTIONS.term));
  defineName(wb, "A_Exec", ABS("B", ASSUMPTIONS.execution));
  defineName(wb, "B_Exec", ABS("C", ASSUMPTIONS.execution));
  defineName(wb, "A_Comm", ABS("B", ASSUMPTIONS.commencement));
  defineName(wb, "B_Comm", ABS("C", ASSUMPTIONS.commencement));
  defineName(wb, "DiscRate", ABS("B", ASSUMPTIONS.discountRate));
  defineName(wb, "ProjBasis", ABS("B", ASSUMPTIONS.projectBasis));

  // Visual polish on the inputs column — light blue fill says "editable".
  for (const r of [
    ASSUMPTIONS.projectSF, ASSUMPTIONS.buildingSF, ASSUMPTIONS.leaseSF,
    ASSUMPTIONS.baseRate, ASSUMPTIONS.escalation,
    ASSUMPTIONS.tiAllowance, ASSUMPTIONS.tiDuration, ASSUMPTIONS.freeRent,
    ASSUMPTIONS.llRep, ASSUMPTIONS.tenantRep, ASSUMPTIONS.lcCalc, ASSUMPTIONS.lcStruct,
    ASSUMPTIONS.term, ASSUMPTIONS.execution, ASSUMPTIONS.commencement,
    ASSUMPTIONS.discountRate, ASSUMPTIONS.projectBasis, ASSUMPTIONS.horizon,
  ]) {
    for (const col of ["B", "C"]) {
      ws.getCell(`${col}${r}`).fill = INPUT_FILL;
    }
  }
}

// ---------------------------------------------------------------------------
// Annual Schedule sheet — buildAnnualSchedule() at lib/calc.ts:44
// ---------------------------------------------------------------------------

function buildAnnualScheduleSheet(
  wb: Workbook,
  name: string,
  side: "A" | "B",
  scenario: Scenario,
): void {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { width: 8 },     // Year
    { width: 20 },    // Annual Rate PSF
    { width: 18 },    // Months Active
    { width: 22 },    // Monthly Rate PSF
  ];

  setTitle(ws, "A1", `${scenario.name} — Annual Rent Schedule`);
  setSubtitle(ws, "A2", "Year-by-year escalation. Rate = base × (1 + esc)^(yr − 1).");

  writeHeader(ws.getCell("A4"), "Year");
  writeHeader(ws.getCell("B4"), "Annual Rate ($/SF)");
  writeHeader(ws.getCell("C4"), "Months Active");
  writeHeader(ws.getCell("D4"), "Monthly Rate ($/SF)");

  for (let y = 1; y <= MAX_YEARS; y++) {
    const row = 4 + y;
    ws.getCell(`A${row}`).value = y;

    // Annual rate. Mirrors annualRateForYear() at lib/calc.ts:66.
    // No rentScheduleOverride support here — sparse arrays don't translate
    // cleanly to a flat Excel column. Users wanting an override just type
    // a number into the cell, which replaces the formula.
    ws.getCell(`B${row}`).value = {
      formula: `${side}_Base*(1+${side}_Esc)^(A${row}-1)`,
    };
    ws.getCell(`B${row}`).numFmt = "$#,##0.0000";

    // Months active for this year. Calendar-aligned: year Y covers months
    // (Y-1)*12+1 .. Y*12 of the lease. Clamps to 0..12.
    // monthsActive = MAX(0, MIN(12, term - (year-1)*12))
    // Direct math avoids the "$C$5:C4" backwards-range gotcha that LO
    // returns #VALUE! for on the first year's row.
    ws.getCell(`C${row}`).value = {
      formula: `MAX(0, MIN(12, ${side}_Term - (A${row}-1)*12))`,
    };
    ws.getCell(`C${row}`).numFmt = "0";

    // Convenience: monthly rate (annual ÷ 12) — used by Monthly Grid.
    ws.getCell(`D${row}`).value = {
      formula: `B${row}/12`,
    };
    ws.getCell(`D${row}`).numFmt = "$#,##0.0000";
  }

  // Footer: weighted-average annual rate, mirrors calcAvgRatePSF() at lib/calc.ts:311.
  const totalsRow = 4 + MAX_YEARS + 2;
  writeLabel(ws.getCell(`A${totalsRow}`), "Avg Rate PSF (weighted)", { bold: true });
  ws.getCell(`B${totalsRow}`).value = {
    formula: `SUMPRODUCT(B5:B${4 + MAX_YEARS},C5:C${4 + MAX_YEARS})/${side}_Term`,
  };
  ws.getCell(`B${totalsRow}`).numFmt = "$#,##0.0000";

  // Defined name for the avg-rate cell — used by the NER sheet.
  defineName(wb, `${side}_AvgRate`, `'${name}'!$B$${totalsRow}`);

  // Defined name for the schedule range — VLOOKUP target on the Monthly Grid.
  defineName(wb, `${side}_Schedule`, `'${name}'!$A$5:$B$${4 + MAX_YEARS}`);

  ws.views = [{ state: "frozen", ySplit: 4 }];
}

// ---------------------------------------------------------------------------
// Monthly Grid sheet — buildMonthlyGrid() at lib/calc.ts:134
// ---------------------------------------------------------------------------

const GRID_COLS = {
  month: "A",
  date: "B",
  monthFromComm: "C",
  inLease: "D",
  isFree: "E",
  calYear: "F",
  annualRate: "G",
  baseRent: "H",
  freeRent: "I",
  ti: "J",
  payingCount: "K",
  tier1Flag: "L",
  tier2Flag: "M",
  lcPayment: "N",
  netCFPSF: "O",
  cashFlowPSF: "P",
} as const;

function buildMonthlyGridSheet(
  wb: Workbook,
  name: string,
  side: "A" | "B",
  scenario: Scenario,
  globals: Globals,
): void {
  const ws = wb.addWorksheet(name);
  // Column widths — first two are wider for date readability.
  ws.columns = [
    { width: 8 },   // A month
    { width: 13 },  // B date
    { width: 10 },  // C from commencement
    { width: 8 },   // D in lease
    { width: 8 },   // E is free
    { width: 8 },   // F cal year
    { width: 14 },  // G annual rate
    { width: 14 },  // H base rent
    { width: 14 },  // I free rent (-)
    { width: 14 },  // J ti (-)
    { width: 10 },  // K paying count
    { width: 10 },  // L tier1 flag
    { width: 10 },  // M tier2 flag
    { width: 14 },  // N lc payment (-)
    { width: 14 },  // O net cf psf (NER basis)
    { width: 14 },  // P cash flow psf (real-cash basis)
  ];

  setTitle(ws, "A1", `${scenario.name} — Monthly Cash Flow Grid`);
  setSubtitle(
    ws,
    "A2",
    "All PSF. NetCF = Base + FreeRent + TI + LC (NER basis). CashFlow = Base + TI + LC (what LL actually nets, real-cash basis).",
  );

  // Header row at 4.
  writeHeader(ws.getCell("A4"), "Month");
  writeHeader(ws.getCell("B4"), "Date");
  writeHeader(ws.getCell("C4"), "MoFromComm");
  writeHeader(ws.getCell("D4"), "InLease");
  writeHeader(ws.getCell("E4"), "IsFree");
  writeHeader(ws.getCell("F4"), "CalYear");
  writeHeader(ws.getCell("G4"), "AnnualRate $/SF");
  writeHeader(ws.getCell("H4"), "BaseRent $/SF");
  writeHeader(ws.getCell("I4"), "FreeRent $/SF");
  writeHeader(ws.getCell("J4"), "TI $/SF");
  writeHeader(ws.getCell("K4"), "PayCnt");
  writeHeader(ws.getCell("L4"), "T1");
  writeHeader(ws.getCell("M4"), "T2");
  writeHeader(ws.getCell("N4"), "LC $/SF");
  writeHeader(ws.getCell("O4"), "NetCF $/SF");
  writeHeader(ws.getCell("P4"), "CashFlow $/SF");

  // The grid horizon is max(global horizon, lease execution-to-end-of-lease).
  // Excel doesn't auto-grow, so size to GRID_MAX_MONTHS and let trailing rows
  // be zero. SUMPRODUCT below clips to the InLease flag.
  const horizon = Math.min(
    GRID_MAX_MONTHS,
    Math.max(
      globals.horizonMonths,
      scenario.inputs.leaseTermMonths +
        monthsBetweenISO(scenario.inputs.leaseExecutionDate, scenario.inputs.leaseCommencement),
    ),
  );

  for (let m = 1; m <= horizon; m++) {
    const r = 4 + m;

    // A: month index
    ws.getCell(`A${r}`).value = m;

    // B: date (Date object — exceljs handles the serial). Format yyyy-mm-dd.
    ws.getCell(`B${r}`).value = { formula: `EDATE(${side}_Exec, A${r}-1)` };
    ws.getCell(`B${r}`).numFmt = "yyyy-mm-dd";

    // C: month from commencement, 1-indexed. Negative or zero = pre-commencement.
    // commencementOffset = DATEDIF(execution, commencement, "m") — when exec === comm
    // this is 0 and monthFromComm === month index.
    ws.getCell(`C${r}`).value = {
      formula: `A${r} - DATEDIF(${side}_Exec, ${side}_Comm, "m")`,
    };

    // D: in lease (1/0). Inclusive 1..term.
    ws.getCell(`D${r}`).value = {
      formula: `IF(AND(C${r}>=1, C${r}<=${side}_Term), 1, 0)`,
    };

    // E: free-rent flag (1/0). Front-loaded — months 1..free of lease.
    ws.getCell(`E${r}`).value = {
      formula: `IF(AND(D${r}=1, C${r}<=${side}_Free), 1, 0)`,
    };

    // F: calendar lease year (1..N). 0 outside lease.
    ws.getCell(`F${r}`).value = {
      formula: `IF(D${r}=1, INT((C${r}-1)/12)+1, 0)`,
    };

    // G: annual rate this month. VLOOKUP against the Annual Schedule.
    // IFERROR catches months outside lease (F=0 → no match).
    ws.getCell(`G${r}`).value = {
      formula: `IFERROR(VLOOKUP(F${r}, ${side}_Schedule, 2, FALSE), 0)`,
    };
    ws.getCell(`G${r}`).numFmt = "$#,##0.0000";

    // H: base rent PSF this month. 0 in lease months that are free.
    ws.getCell(`H${r}`).value = {
      formula: `IF(AND(D${r}=1, E${r}=0), G${r}/12, 0)`,
    };
    ws.getCell(`H${r}`).numFmt = "$#,##0.0000";

    // I: free-rent PSF (negative — abates phantom rent during free months).
    // Mirrors phantomRateForMonth() at lib/calc.ts:172 — uses the rate that
    // WOULD be charged in this calendar lease year (not Yr1).
    ws.getCell(`I${r}`).value = {
      formula: `IF(E${r}=1, -G${r}/12, 0)`,
    };
    ws.getCell(`I${r}`).numFmt = "$#,##0.0000";

    // J: TI PSF (negative). Spread evenly across tiDurationMonths starting M1.
    ws.getCell(`J${r}`).value = {
      formula: `IF(AND(A${r}>=1, A${r}<=${side}_TIDur), -${side}_TIAllow/${side}_TIDur, 0)`,
    };
    ws.getCell(`J${r}`).numFmt = "$#,##0.0000";

    // K: paying-month running count. Mirrors the tiered logic in calcLC().
    // Free months don't increment; non-lease months don't either.
    if (m === 1) {
      ws.getCell(`K${r}`).value = {
        formula: `IF(AND(D${r}=1, E${r}=0), 1, 0)`,
      };
    } else {
      ws.getCell(`K${r}`).value = {
        formula: `K${r - 1} + IF(AND(D${r}=1, E${r}=0), 1, 0)`,
      };
    }

    // L: tier1 flag — paying months 1..60.
    ws.getCell(`L${r}`).value = {
      formula: `IF(AND(D${r}=1, E${r}=0, K${r}<=60), 1, 0)`,
    };

    // M: tier2 flag — paying months 61+.
    ws.getCell(`M${r}`).value = {
      formula: `IF(AND(D${r}=1, E${r}=0, K${r}>60), 1, 0)`,
    };

    // N: LC payment (negative). Timing:
    //   upfront — full LC in month 1.
    //   split50 — half in M1 (execution), half at commencement (offset+1).
    // When exec === comm both halves land at M1; the formula below collapses
    // automatically because both conditions hit the same row.
    ws.getCell(`N${r}`).value = {
      formula: lcPaymentFormula(side, r),
    };
    ws.getCell(`N${r}`).numFmt = "$#,##0.0000";

    // O: NER-basis net CF PSF (includes the phantom free-rent abatement).
    ws.getCell(`O${r}`).value = {
      formula: `H${r}+I${r}+J${r}+N${r}`,
    };
    ws.getCell(`O${r}`).numFmt = "$#,##0.0000";

    // P: real-cash CF PSF (what the LL actually pays/receives).
    // Free rent shows as $0 base, not an explicit negative.
    ws.getCell(`P${r}`).value = {
      formula: `H${r}+J${r}+N${r}`,
    };
    ws.getCell(`P${r}`).numFmt = "$#,##0.0000";
  }

  // Defined names for the SUMPRODUCT calls on the NER sheet.
  const lastRow = 4 + horizon;
  defineName(wb, `${side}_Grid_BaseRent`, `'${name}'!$H$5:$H$${lastRow}`);
  defineName(wb, `${side}_Grid_T1`, `'${name}'!$L$5:$L$${lastRow}`);
  defineName(wb, `${side}_Grid_T2`, `'${name}'!$M$5:$M$${lastRow}`);
  defineName(wb, `${side}_Grid_NetCF`, `'${name}'!$O$5:$O$${lastRow}`);
  defineName(wb, `${side}_Grid_Month`, `'${name}'!$A$5:$A$${lastRow}`);
  defineName(wb, `${side}_Grid_InLease`, `'${name}'!$D$5:$D$${lastRow}`);

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
}

/**
 * LC payment timing formula for a given grid row.
 *
 * Mirrors the logic at lib/calc.ts:182-211 — single-anchor (upfront) puts
 * everything in M1; split50 puts half at execution (M1) and half at
 * commencement (DATEDIF(exec, comm, "m") + 1). When execution = commencement
 * the split50 condition collapses to a single M1 payment, which is what we
 * want.
 *
 * Negative because LC is a landlord cost. The total LC PSF (positive) is
 * NER!B2 / C2 — separately computed from base rent so no circularity.
 */
function lcPaymentFormula(side: "A" | "B", row: number): string {
  const commencementMonth = `(DATEDIF(${side}_Exec, ${side}_Comm, "m")+1)`;
  return (
    // M1: upfront → full LC; split50 → half LC.
    `IF(A${row}=1, -NER!$${side === "A" ? "B" : "C"}$2 * IF(${side}_LCStruct="upfront", 1, 0.5), 0)` +
    // commencement month: split50 only → other half.
    ` + IF(AND(A${row}=${commencementMonth}, ${side}_LCStruct="split50", A${row}<>1), -NER!$${side === "A" ? "B" : "C"}$2 * 0.5, 0)`
  );
}

// ---------------------------------------------------------------------------
// NER sheet — totals and headline metrics
// ---------------------------------------------------------------------------

function buildNerSheet(wb: Workbook, _a: Scenario, _b: Scenario): void {
  const ws = wb.addWorksheet("NER");
  ws.columns = [
    { width: 28 },
    { width: 16 },
    { width: 16 },
  ];

  setTitle(ws, "A1", "NER & Yield on Cost");

  // Row 2: LC PSF (positive). The "double-anchor" calc that breaks the
  // monthly-grid cycle: tier1 base rent × LC% + tier2 base rent × LC% × IF(tiered,0.5,1).
  writeLabel(ws.getCell("A2"), "LC PSF (combined)");
  ws.getCell("B2").value = { formula: lcTotalFormula("A") };
  ws.getCell("C2").value = { formula: lcTotalFormula("B") };
  ws.getCell("B2").numFmt = "$#,##0.0000";
  ws.getCell("C2").numFmt = "$#,##0.0000";

  // Row 3: span (commencement offset + term). Sets the SUM cutoff for NER.
  writeLabel(ws.getCell("A3"), "Span (commencement offset + term, mo)");
  ws.getCell("B3").value = { formula: `DATEDIF(A_Exec, A_Comm, "m") + A_Term` };
  ws.getCell("C3").value = { formula: `DATEDIF(B_Exec, B_Comm, "m") + B_Term` };

  // Row 4: sum of NetCF PSF over span.
  writeLabel(ws.getCell("A4"), "Sum NetCF PSF (over span)");
  ws.getCell("B4").value = {
    formula: `SUMPRODUCT((A_Grid_Month<=B3)*A_Grid_NetCF)`,
  };
  ws.getCell("C4").value = {
    formula: `SUMPRODUCT((B_Grid_Month<=C3)*B_Grid_NetCF)`,
  };
  ws.getCell("B4").numFmt = "$#,##0.0000";
  ws.getCell("C4").numFmt = "$#,##0.0000";

  // Row 5: Undiscounted NER. NetCF / Term × 12.
  writeLabel(ws.getCell("A5"), "Undiscounted NER ($/SF)", { bold: true });
  ws.getCell("B5").value = { formula: `B4/A_Term*12` };
  ws.getCell("C5").value = { formula: `C4/B_Term*12` };
  ws.getCell("B5").numFmt = "$#,##0.00";
  ws.getCell("C5").numFmt = "$#,##0.00";

  // Row 6: PV of NetCF — monthly compounding, period 0 = month 1 (no off-by-one).
  // Excel's NPV() bakes in an off-by-one; we use SUMPRODUCT with i = month-1 to
  // avoid it, mirroring calcDiscountedNER() at lib/calc.ts:287.
  writeLabel(ws.getCell("A6"), "PV NetCF PSF");
  ws.getCell("B6").value = {
    formula: `SUMPRODUCT((A_Grid_Month<=B3)*A_Grid_NetCF/(1+DiscRate/12)^(A_Grid_Month-1))`,
  };
  ws.getCell("C6").value = {
    formula: `SUMPRODUCT((B_Grid_Month<=C3)*B_Grid_NetCF/(1+DiscRate/12)^(B_Grid_Month-1))`,
  };
  ws.getCell("B6").numFmt = "$#,##0.0000";
  ws.getCell("C6").numFmt = "$#,##0.0000";

  // Row 7: Discounted NER.
  writeLabel(ws.getCell("A7"), "Discounted NER ($/SF)", { bold: true });
  ws.getCell("B7").value = { formula: `B6/A_Term*12` };
  ws.getCell("C7").value = { formula: `C6/B_Term*12` };
  ws.getCell("B7").numFmt = "$#,##0.00";
  ws.getCell("C7").numFmt = "$#,##0.00";

  // Row 8: Avg rate over term — pulled from Annual Schedule sheet.
  writeLabel(ws.getCell("A8"), "Avg Rate over Term ($/SF)");
  ws.getCell("B8").value = { formula: `A_AvgRate` };
  ws.getCell("C8").value = { formula: `B_AvgRate` };
  ws.getCell("B8").numFmt = "$#,##0.0000";
  ws.getCell("C8").numFmt = "$#,##0.0000";

  // Row 9: Total Basis PSF = ProjBasis + TI + LC.
  writeLabel(ws.getCell("A9"), "Total Basis ($/SF)");
  ws.getCell("B9").value = { formula: `ProjBasis + A_TIAllow + B2` };
  ws.getCell("C9").value = { formula: `ProjBasis + B_TIAllow + C2` };
  ws.getCell("B9").numFmt = "$#,##0.00";
  ws.getCell("C9").numFmt = "$#,##0.00";

  // Row 10: YoC Yr 1 — Yr-1 rate from schedule ÷ Total Basis.
  writeLabel(ws.getCell("A10"), "YoC Yr 1");
  ws.getCell("B10").value = { formula: `VLOOKUP(1, A_Schedule, 2, FALSE) / B9` };
  ws.getCell("C10").value = { formula: `VLOOKUP(1, B_Schedule, 2, FALSE) / C9` };
  ws.getCell("B10").numFmt = "0.00%";
  ws.getCell("C10").numFmt = "0.00%";

  // Row 11: YoC Term — Avg Rate ÷ Total Basis.
  writeLabel(ws.getCell("A11"), "YoC Term");
  ws.getCell("B11").value = { formula: `B8 / B9` };
  ws.getCell("C11").value = { formula: `C8 / C9` };
  ws.getCell("B11").numFmt = "0.00%";
  ws.getCell("C11").numFmt = "0.00%";

  // Waterfall components (the four bars + the net). All over span.
  writeSectionRow(ws, 13, "NER Waterfall (PSF over span)");
  writeLabel(ws.getCell("A14"), "Base Rent");
  ws.getCell("B14").value = {
    formula: `SUMPRODUCT((A_Grid_Month<=B3)*A_Grid_BaseRent)`,
  };
  ws.getCell("C14").value = {
    formula: `SUMPRODUCT((B_Grid_Month<=C3)*B_Grid_BaseRent)`,
  };

  writeLabel(ws.getCell("A15"), "Free Rent (offset)");
  ws.getCell("B15").value = {
    formula: `SUMPRODUCT((A_Grid_Month<=B3)*('Monthly Grid A'!I5:I${4 + GRID_MAX_MONTHS}))`,
  };
  ws.getCell("C15").value = {
    formula: `SUMPRODUCT((B_Grid_Month<=C3)*('Monthly Grid B'!I5:I${4 + GRID_MAX_MONTHS}))`,
  };

  writeLabel(ws.getCell("A16"), "TI Draw");
  ws.getCell("B16").value = {
    formula: `SUMPRODUCT((A_Grid_Month<=B3)*('Monthly Grid A'!J5:J${4 + GRID_MAX_MONTHS}))`,
  };
  ws.getCell("C16").value = {
    formula: `SUMPRODUCT((B_Grid_Month<=C3)*('Monthly Grid B'!J5:J${4 + GRID_MAX_MONTHS}))`,
  };

  writeLabel(ws.getCell("A17"), "Commission");
  ws.getCell("B17").value = {
    formula: `SUMPRODUCT((A_Grid_Month<=B3)*('Monthly Grid A'!N5:N${4 + GRID_MAX_MONTHS}))`,
  };
  ws.getCell("C17").value = {
    formula: `SUMPRODUCT((B_Grid_Month<=C3)*('Monthly Grid B'!N5:N${4 + GRID_MAX_MONTHS}))`,
  };

  writeLabel(ws.getCell("A18"), "Net Cash Flow", { bold: true });
  ws.getCell("B18").value = { formula: `B14+B15+B16+B17` };
  ws.getCell("C18").value = { formula: `C14+C15+C16+C17` };

  for (const r of [14, 15, 16, 17, 18]) {
    ws.getCell(`B${r}`).numFmt = "$#,##0.0000";
    ws.getCell(`C${r}`).numFmt = "$#,##0.0000";
  }

  // Defined names for the Summary sheet.
  defineName(wb, "A_UndiscNER", "NER!$B$5");
  defineName(wb, "B_UndiscNER", "NER!$C$5");
  defineName(wb, "A_DiscNER", "NER!$B$7");
  defineName(wb, "B_DiscNER", "NER!$C$7");
  defineName(wb, "A_TotalBasis", "NER!$B$9");
  defineName(wb, "B_TotalBasis", "NER!$C$9");
  defineName(wb, "A_YoC1", "NER!$B$10");
  defineName(wb, "B_YoC1", "NER!$C$10");
  defineName(wb, "A_YoCTerm", "NER!$B$11");
  defineName(wb, "B_YoCTerm", "NER!$C$11");
  defineName(wb, "A_LCTotal", "NER!$B$2");
  defineName(wb, "B_LCTotal", "NER!$C$2");
}

// Mirrors calcLC() at lib/calc.ts:91. Units: BaseRent column is monthly $/SF
// (annual rate ÷ 12). SUMPRODUCT(T1, BaseRent) = total $/SF paid over paying
// months 1..60 — same as the `tier1` accumulator in calc.ts. No annualization;
// LC is a one-time landlord cost, expressed as $/SF over the term.
function lcTotalFormula(side: "A" | "B"): string {
  return (
    `(${side}_LLRep + ${side}_TRep) * (` +
    `SUMPRODUCT(${side}_Grid_T1 * ${side}_Grid_BaseRent)` +
    ` + IF(${side}_LCCalc="tiered", 0.5, 1) * SUMPRODUCT(${side}_Grid_T2 * ${side}_Grid_BaseRent)` +
    `)`
  );
}

// ---------------------------------------------------------------------------
// Summary sheet — headline metrics + side-by-side, linked upstream
// ---------------------------------------------------------------------------

function buildSummarySheet(
  wb: Workbook,
  propertyName: string,
  a: Scenario,
  b: Scenario,
): void {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [
    { width: 32 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ];

  setTitle(ws, "A1", propertyName || "RFP Comparison");
  setSubtitle(ws, "A2", "Net Effective Rent · industrial lease analysis");
  ws.getCell("A3").value = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  ws.getCell("A3").font = { size: 9, color: { argb: "FF64748B" } };

  // Header
  writeHeader(ws.getCell("A5"), "Metric");
  ws.getCell("B5").value = { formula: "A_Name" };
  ws.getCell("C5").value = { formula: "B_Name" };
  // Plain ASCII so it renders in any spreadsheet font / locale.
  ws.getCell("D5").value = "Diff (B - A)";
  for (const col of ["B", "C", "D"]) {
    const c = ws.getCell(`${col}5`);
    c.font = { bold: true };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: "right" };
  }
  ws.getCell("A5").font = { bold: true };
  ws.getCell("A5").fill = HEADER_FILL;

  const rows: Array<{
    label: string;
    aRef: string;
    bRef: string;
    fmt: string;
    bold?: boolean;
  }> = [
    { label: "Undiscounted NER ($/SF)", aRef: "A_UndiscNER", bRef: "B_UndiscNER", fmt: "$#,##0.00", bold: true },
    { label: "Discounted NER ($/SF)", aRef: "A_DiscNER", bRef: "B_DiscNER", fmt: "$#,##0.00", bold: true },
    { label: "YoC · Yr 1", aRef: "A_YoC1", bRef: "B_YoC1", fmt: "0.00%" },
    { label: "YoC · Term", aRef: "A_YoCTerm", bRef: "B_YoCTerm", fmt: "0.00%" },
    { label: "Total Basis ($/SF)", aRef: "A_TotalBasis", bRef: "B_TotalBasis", fmt: "$#,##0.00" },
    { label: "LC PSF", aRef: "A_LCTotal", bRef: "B_LCTotal", fmt: "$#,##0.0000" },
  ];

  rows.forEach((r, i) => {
    const row = 6 + i;
    writeLabel(ws.getCell(`A${row}`), r.label, { bold: r.bold });
    ws.getCell(`B${row}`).value = { formula: r.aRef };
    ws.getCell(`C${row}`).value = { formula: r.bRef };
    ws.getCell(`D${row}`).value = { formula: `C${row} - B${row}` };
    for (const col of ["B", "C", "D"]) {
      ws.getCell(`${col}${row}`).numFmt = r.fmt;
      ws.getCell(`${col}${row}`).alignment = { horizontal: "right" };
      if (r.bold) ws.getCell(`${col}${row}`).font = { bold: true };
    }
  });

  // Footer — pointer to other sheets
  ws.getCell("A14").value =
    "See Assumptions to edit inputs. NER sheet shows the full calc; Monthly Grid A/B are the month-by-month detail.";
  ws.getCell("A14").font = { size: 9, italic: true, color: { argb: "FF64748B" } };
  ws.mergeCells("A14:D14");

  ws.views = [{ state: "frozen", ySplit: 5 }];

  // Acknowledge that the unused params are intentional (not stripped because
  // we want them in the signature for future expansion).
  void a;
  void b;
}

// ---------------------------------------------------------------------------
// Validation sheet — spec §12 targets vs live calc, parity check
// ---------------------------------------------------------------------------

function buildValidationSheet(wb: Workbook, a: Scenario, b: Scenario): void {
  const ws = wb.addWorksheet("Validation");
  ws.columns = [
    { width: 36 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
  ];

  setTitle(ws, "A1", "Calc parity vs runScenario()");
  setSubtitle(
    ws,
    "A2",
    "Live Excel formula result vs the value the app computed when this file was generated. Within $0.01 → parity.",
  );

  writeHeader(ws.getCell("A4"), "Metric");
  writeHeader(ws.getCell("B4"), "Live (Excel)");
  writeHeader(ws.getCell("C4"), "App snapshot");
  writeHeader(ws.getCell("D4"), "Match");

  const checks: Array<{ label: string; live: string; snapshot: number }> = [
    { label: `${a.name}: Undiscounted NER`, live: "A_UndiscNER", snapshot: a.results.undiscountedNER },
    { label: `${a.name}: Discounted NER`,   live: "A_DiscNER",   snapshot: a.results.discountedNER },
    { label: `${a.name}: LC PSF`,           live: "A_LCTotal",   snapshot: a.results.totals.lcPSF },
    { label: `${a.name}: Total Basis`,      live: "A_TotalBasis",snapshot: a.results.totalBasisPSF },
    { label: `${a.name}: YoC Yr 1`,         live: "A_YoC1",      snapshot: a.results.yocYr1 },
    { label: `${b.name}: Undiscounted NER`, live: "B_UndiscNER", snapshot: b.results.undiscountedNER },
    { label: `${b.name}: Discounted NER`,   live: "B_DiscNER",   snapshot: b.results.discountedNER },
    { label: `${b.name}: LC PSF`,           live: "B_LCTotal",   snapshot: b.results.totals.lcPSF },
    { label: `${b.name}: Total Basis`,      live: "B_TotalBasis",snapshot: b.results.totalBasisPSF },
    { label: `${b.name}: YoC Yr 1`,         live: "B_YoC1",      snapshot: b.results.yocYr1 },
  ];

  checks.forEach((c, i) => {
    const row = 5 + i;
    writeLabel(ws.getCell(`A${row}`), c.label);
    ws.getCell(`B${row}`).value = { formula: c.live };
    ws.getCell(`C${row}`).value = c.snapshot;
    // Plain-ASCII match marker so it renders on every locale.
    ws.getCell(`D${row}`).value = {
      formula: `IF(ABS(B${row}-C${row})<0.01, "OK", "DIFF " & TEXT(B${row}-C${row}, "$#,##0.0000"))`,
    };
  });
}

// ---------------------------------------------------------------------------
// Tiny styling helpers
// ---------------------------------------------------------------------------

const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFF1F5F9" },
};
const INPUT_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFEFF6FF" },
};

function setTitle(ws: Worksheet, addr: string, text: string): void {
  const c = ws.getCell(addr);
  c.value = text;
  c.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
}

function setSubtitle(ws: Worksheet, addr: string, text: string): void {
  const c = ws.getCell(addr);
  c.value = text;
  c.font = { size: 9, color: { argb: "FF475569" } };
}

function writeHeader(c: Cell, text: string): void {
  c.value = text;
  c.font = { bold: true, size: 10 };
  c.fill = HEADER_FILL;
  c.alignment = { horizontal: "right" };
}

function writeLabel(c: Cell, text: string, opts: { bold?: boolean } = {}): void {
  c.value = text;
  c.font = { bold: opts.bold };
}

function writeSectionRow(ws: Worksheet, row: number, label: string): void {
  const c = ws.getCell(`A${row}`);
  c.value = label;
  c.font = { bold: true, size: 9, color: { argb: "FF64748B" } };
  c.fill = HEADER_FILL;
  ws.mergeCells(`A${row}:C${row}`);
}

function writeInputRow(
  ws: Worksheet,
  row: number,
  label: string,
  aValue: number | string,
  bValue: number | string,
  numFmt?: string,
): void {
  ws.getCell(`A${row}`).value = label;
  ws.getCell(`B${row}`).value = aValue;
  ws.getCell(`C${row}`).value = bValue;
  if (numFmt) {
    ws.getCell(`B${row}`).numFmt = numFmt;
    ws.getCell(`C${row}`).numFmt = numFmt;
  }
}

function writeDateRow(
  ws: Worksheet,
  row: number,
  label: string,
  aIso: string,
  bIso: string,
): void {
  ws.getCell(`A${row}`).value = label;
  // Use Date objects so Excel formulas (EDATE / DATEDIF) can operate on them.
  ws.getCell(`B${row}`).value = new Date(aIso);
  ws.getCell(`C${row}`).value = new Date(bIso);
  ws.getCell(`B${row}`).numFmt = "yyyy-mm-dd";
  ws.getCell(`C${row}`).numFmt = "yyyy-mm-dd";
}

function writeGlobalRow(
  ws: Worksheet,
  row: number,
  label: string,
  value: number,
  numFmt: string,
): void {
  ws.getCell(`A${row}`).value = label;
  ws.getCell(`B${row}`).value = value;
  ws.getCell(`B${row}`).numFmt = numFmt;
  // Globals only have one column; show C as a copy of B for visual symmetry.
  ws.getCell(`C${row}`).value = { formula: `B${row}` };
  ws.getCell(`C${row}`).numFmt = numFmt;
  ws.getCell(`C${row}`).font = { italic: true, color: { argb: "FF94A3B8" } };
}

function defineName(wb: Workbook, name: string, refersTo: string): void {
  wb.definedNames.add(refersTo, name);
}

function monthsBetweenISO(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return Math.max(
    0,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth()),
  );
}
