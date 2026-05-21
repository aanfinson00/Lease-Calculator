"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";

/**
 * Client-side Excel download of the current A vs B comparison.
 *
 * Why dynamic import: exceljs is ~1MB. Same pattern as the PDF export —
 * users only pay for the bundle if they click the button.
 */
export function ExportExcelButton() {
  const propertyName = useAppStore(
    (s) => s.properties.find((p) => p.id === s.activePropertyId)?.name ?? "",
  );
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
      const { buildWorkbook } = await import("./buildWorkbook");
      const buf = await buildWorkbook({
        propertyName,
        aName: a.inputs.name,
        aInputs: a.inputs,
        bName: b.inputs.name,
        bInputs: b.inputs,
        globals,
      });

      const blob = new Blob([buf], {
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
    <Button
      onClick={handleExport}
      disabled={busy || !a || !b}
      size="sm"
      variant="outline"
    >
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {busy ? "Generating…" : "Export Excel"}
    </Button>
  );
}
