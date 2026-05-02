"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runScenario } from "@/lib/calc";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";

/**
 * Triggers a client-side PDF download of the current comparison view.
 *
 * Why dynamic import: @react-pdf/renderer is ~1MB of JS. Code-splitting it
 * out of the main bundle keeps the initial page load fast — users only pay
 * for it the first time they click Export.
 */
export function ExportPdfButton() {
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
      const [{ pdf }, { ComparisonDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./ComparisonDoc"),
      ]);
      const aResults = runScenario(a.inputs, globals);
      const bResults = runScenario(b.inputs, globals);
      const blob = await pdf(
        <ComparisonDoc
          propertyName={propertyName}
          aName={a.inputs.name}
          aInputs={a.inputs}
          aResults={aResults}
          bName={b.inputs.name}
          bInputs={b.inputs}
          bResults={bResults}
          globals={globals}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const slug = (propertyName || "rfp").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const date = new Date().toISOString().slice(0, 10);
      link.download = `${slug || "rfp"}-comparison-${date}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast("PDF downloaded", "success");
    } catch (e) {
      toast(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={handleExport} disabled={busy || !a || !b} size="sm" variant="outline">
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {busy ? "Generating…" : "Export PDF"}
    </Button>
  );
}
