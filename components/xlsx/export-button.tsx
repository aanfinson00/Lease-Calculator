"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runScenario } from "@/lib/calc";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";

/**
 * Triggers a client-side .xlsx download of the comparison.
 *
 * Why dynamic import: exceljs is ~700KB. Code-splitting it out of the main
 * bundle keeps the initial page load fast — users only pay for it on the
 * first click. Same pattern as ExportPdfButton.
 */
export function ExportXlsxButton() {
  const propertyName = useAppStore((s) => s.property.name);
  const aId = useAppStore((s) => s.comparison.aId);
  const bId = useAppStore((s) => s.comparison.bId);
  const a = useAppStore((s) => s.scenarios.find((sc) => sc.id === aId));
  const b = useAppStore((s) => s.scenarios.find((sc) => sc.id === bId));
  const globals = useAppStore((s) => s.globals);

  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (!a || !b) return;
    setBusy(true);
    try {
      const { buildWorkbook } = await import("@/lib/export-xlsx");
      const aResults = runScenario(a.inputs, globals);
      const bResults = runScenario(b.inputs, globals);
      const wb = await buildWorkbook(
        propertyName,
        { name: a.inputs.name, inputs: a.inputs, results: aResults },
        { name: b.inputs.name, inputs: b.inputs, results: bResults },
        globals,
      );

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const slug = (propertyName || "rfp")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const date = new Date().toISOString().slice(0, 10);
      link.download = `${slug || "rfp"}-comparison-${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast("Excel downloaded", "success");
    } catch (e) {
      toast(
        `Excel export failed: ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={handleExport} disabled={busy || !a || !b} size="sm" variant="outline">
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
      {busy ? "Generating…" : "Export Excel"}
    </Button>
  );
}
