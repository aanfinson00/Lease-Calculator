/**
 * Generate a sample .xlsx + .pdf using the spec §12 inputs. Useful for
 * sharing a "this is what the export looks like" preview with reviewers.
 *
 * Run from project root:  npx tsx scripts/preview-gen.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";

const { buildWorkbook } = await import("../lib/export-xlsx.ts");
const { ComparisonDoc } = await import("../components/pdf/ComparisonDoc.tsx");
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
  leaseCommencement: "2025-01-01", leaseExecutionDate: "2025-01-01",
  tiDurationMonths: 1,
};
const prop = {
  ...uw, name: "Proposal",
  baseRatePSF: 8, escalation: 0.04, tiAllowancePSF: 10,
  freeRentMonths: 6, leaseTermMonths: 130,
};

const aRes = runScenario(uw, globals);
const bRes = runScenario(prop, globals);

const wb = await buildWorkbook("Sample Property",
  { name: uw.name, inputs: uw, results: aRes },
  { name: prop.name, inputs: prop, results: bRes },
  globals,
);
const outDir = path.resolve(process.argv[2] ?? "/tmp");
writeFileSync(path.join(outDir, "sample-comparison.xlsx"), Buffer.from(await wb.xlsx.writeBuffer()));

const pdf = await renderToBuffer(React.createElement(ComparisonDoc, {
  propertyName: "Sample Property",
  aName: uw.name, aInputs: uw, aResults: aRes,
  bName: prop.name, bInputs: prop, bResults: bRes,
  globals,
}));
writeFileSync(path.join(outDir, "sample-comparison.pdf"), pdf);

console.log(`Wrote ${outDir}/sample-comparison.xlsx and sample-comparison.pdf`);
