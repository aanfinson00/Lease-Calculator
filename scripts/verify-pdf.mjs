/**
 * Smoke test for the PDF export: render the comparison doc to a Buffer in
 * Node (using @react-pdf/renderer's `renderToBuffer`) to confirm none of
 * the new pages throw.
 *
 * Run:  npx tsx scripts/verify-pdf.mjs
 */
import { writeFileSync } from "node:fs";
import React from "react";

const { ComparisonDoc } = await import("../components/pdf/ComparisonDoc.tsx");
const { runScenario } = await import("../lib/calc.ts");
const { renderToBuffer } = await import("@react-pdf/renderer");

const globals = { discountRate: 0.08, projectBasisPSF: 140, horizonMonths: 204 };
const uw = { name: "UW", projectSF: 300_000, buildingSF: 300_000, proposedLeaseSF: 300_000, baseRatePSF: 7, escalation: 0.03, lcLLRepPercent: 0.045, lcTenantRepPercent: 0.045, lcCalculation: "tiered", lcStructure: "upfront", tiAllowancePSF: 5, freeRentMonths: 4, leaseTermMonths: 125, leaseCommencement: "2025-01-01", leaseExecutionDate: "2025-01-01", tiDurationMonths: 1 };
const prop = { name: "Proposal", projectSF: 300_000, buildingSF: 300_000, proposedLeaseSF: 300_000, baseRatePSF: 8, escalation: 0.04, lcLLRepPercent: 0.045, lcTenantRepPercent: 0.045, lcCalculation: "tiered", lcStructure: "upfront", tiAllowancePSF: 10, freeRentMonths: 6, leaseTermMonths: 130, leaseCommencement: "2025-01-01", leaseExecutionDate: "2025-01-01", tiDurationMonths: 1 };

const aResults = runScenario(uw, globals);
const bResults = runScenario(prop, globals);

const doc = React.createElement(ComparisonDoc, {
  propertyName: "Test Property",
  aName: uw.name,
  aInputs: uw,
  aResults,
  bName: prop.name,
  bInputs: prop,
  bResults,
  globals,
});

const buf = await renderToBuffer(doc);
console.log("PDF generated:", buf.length, "bytes");

// PDFs start with "%PDF-".
if (buf.subarray(0, 5).toString() !== "%PDF-") {
  console.error("Not a PDF — header mismatch");
  process.exit(1);
}

writeFileSync("/tmp/verify-comparison.pdf", buf);
console.log("Wrote /tmp/verify-comparison.pdf");
console.log("OK");
