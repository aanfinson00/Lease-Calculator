/**
 * Verify the xlsx export formulas match runScenario().
 *
 * Generates a workbook with the spec §12 canonical scenarios, runs it
 * through LibreOffice headless to materialize formula results, then
 * reads the cells back and compares to the calc engine's output.
 *
 * Run:  npx tsx scripts/verify-xlsx.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { buildWorkbook } = await import("../lib/export-xlsx.ts");
const { runScenario } = await import("../lib/calc.ts");

const globals = { discountRate: 0.08, projectBasisPSF: 140, horizonMonths: 204 };

const uw = {
  name: "UW",
  projectSF: 300_000, buildingSF: 300_000, proposedLeaseSF: 300_000,
  baseRatePSF: 7, escalation: 0.03,
  lcLLRepPercent: 0.045, lcTenantRepPercent: 0.045,
  lcCalculation: "tiered", lcStructure: "upfront",
  tiAllowancePSF: 5, freeRentMonths: 4,
  leaseTermMonths: 125,
  leaseCommencement: "2025-01-01",
  leaseExecutionDate: "2025-01-01",
  tiDurationMonths: 1,
};

const prop = {
  name: "Proposal",
  projectSF: 300_000, buildingSF: 300_000, proposedLeaseSF: 300_000,
  baseRatePSF: 8, escalation: 0.04,
  lcLLRepPercent: 0.045, lcTenantRepPercent: 0.045,
  lcCalculation: "tiered", lcStructure: "upfront",
  tiAllowancePSF: 10, freeRentMonths: 6,
  leaseTermMonths: 130,
  leaseCommencement: "2025-01-01",
  leaseExecutionDate: "2025-01-01",
  tiDurationMonths: 1,
};

// Tricky cases to exercise split50, offset commencement, and the flat calc.
const split50 = {
  ...uw, name: "Split50",
  lcStructure: "split50",
  leaseExecutionDate: "2024-10-01",   // exec 3 mo before commencement
  leaseCommencement: "2025-01-01",
  tiDurationMonths: 3,
};
const flat = {
  ...prop, name: "Flat",
  lcCalculation: "flat",
};

async function run(label, a, b) {
  const aRes = runScenario(a, globals);
  const bRes = runScenario(b, globals);
  const wb = await buildWorkbook("Test", {
    name: a.name, inputs: a, results: aRes,
  }, {
    name: b.name, inputs: b, results: bRes,
  }, globals);

  const inDir = mkdtempSync(path.join(tmpdir(), "xlsx-verify-in-"));
  const outDir = mkdtempSync(path.join(tmpdir(), "xlsx-verify-out-"));
  const xlsxPath = path.join(inDir, "verify.xlsx");
  writeFileSync(xlsxPath, Buffer.from(await wb.xlsx.writeBuffer()));
  const r = spawnSync("libreoffice", [
    "--headless", "--calc",
    "--convert-to", "xlsx",
    "--outdir", outDir,
    xlsxPath,
  ], { encoding: "utf8" });
  if (r.status !== 0) { console.error("LO failed", r.stderr); process.exit(1); }

  const ExcelJS = (await import("exceljs")).default;
  const back = new ExcelJS.Workbook();
  await back.xlsx.readFile(path.join(outDir, "verify.xlsx"));
  const read = (sheet, addr) => {
    const v = back.getWorksheet(sheet).getCell(addr).value;
    return typeof v === "object" && v && "result" in v ? v.result : v;
  };

  const checks = [
    [`${a.name}: Undiscounted NER`, read("NER", "B5"),  aRes.undiscountedNER, 0.01],
    [`${b.name}: Undiscounted NER`, read("NER", "C5"),  bRes.undiscountedNER, 0.01],
    [`${a.name}: Discounted NER`,   read("NER", "B7"),  aRes.discountedNER, 0.01],
    [`${b.name}: Discounted NER`,   read("NER", "C7"),  bRes.discountedNER, 0.01],
    [`${a.name}: LC PSF`,           read("NER", "B2"),  aRes.totals.lcPSF, 0.01],
    [`${b.name}: LC PSF`,           read("NER", "C2"),  bRes.totals.lcPSF, 0.01],
    [`${a.name}: Total Basis`,      read("NER", "B9"),  aRes.totalBasisPSF, 0.01],
    [`${b.name}: Total Basis`,      read("NER", "C9"),  bRes.totalBasisPSF, 0.01],
    [`${a.name}: YoC Yr 1`,         read("NER", "B10"), aRes.yocYr1, 0.0001],
    [`${b.name}: YoC Yr 1`,         read("NER", "C10"), bRes.yocYr1, 0.0001],
    [`${a.name}: YoC Term`,         read("NER", "B11"), aRes.yocTerm, 0.0001],
    [`${b.name}: YoC Term`,         read("NER", "C11"), bRes.yocTerm, 0.0001],
  ];

  let ok = true;
  console.log(`\n=== ${label} ===`);
  for (const [name, excel, app, tol] of checks) {
    const e = typeof excel === "number" ? excel : Number(excel);
    const diff = Math.abs(e - app);
    const pass = Number.isFinite(diff) && diff < tol;
    console.log(`${pass ? "OK  " : "FAIL"}  ${name.padEnd(34)}  excel=${Number.isFinite(e) ? e.toFixed(4) : excel}  app=${app.toFixed(4)}  diff=${Number.isFinite(diff) ? diff.toFixed(6) : "n/a"}`);
    if (!pass) ok = false;
  }
  rmSync(inDir, { recursive: true });
  rmSync(outDir, { recursive: true });
  return ok;
}

const r1 = await run("Spec §12 (UW vs Proposal, upfront LC, no commencement offset)", uw, prop);
const r2 = await run("Split50 LC + offset commencement (3 mo) + TI over 3 mo", split50, prop);
const r3 = await run("Flat LC calc + tiered LC calc", uw, flat);

const allPass = r1 && r2 && r3;
console.log(allPass ? "\nAll formulas match the app across all three runs." : "\nDIFFS FOUND.");
process.exit(allPass ? 0 : 1);
