"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPSF, fmtPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScenarioResults } from "@/lib/types";

interface Props {
  aName: string;
  aResults: ScenarioResults;
  bName: string;
  bResults: ScenarioResults;
}

/**
 * The headline metrics card — five rows × three columns (A | B | Δ).
 * Δ is colored: positive = green, negative = red. We deliberately don't
 * editorialize "Δ should be positive" — that varies by metric.
 */
export function HeadlineCard({ aName, aResults, bName, bResults }: Props) {
  const rows: Array<{ label: string; a: number; b: number; format: (v: number) => string }> = [
    {
      label: "Undiscounted NER",
      a: aResults.undiscountedNER,
      b: bResults.undiscountedNER,
      format: (v) => fmtPSF(v),
    },
    {
      label: "Discounted NER",
      a: aResults.discountedNER,
      b: bResults.discountedNER,
      format: (v) => fmtPSF(v),
    },
    {
      label: "YoC (Year 1)",
      a: aResults.yocYr1,
      b: bResults.yocYr1,
      format: (v) => fmtPercent(v),
    },
    {
      label: "YoC (Term)",
      a: aResults.yocTerm,
      b: bResults.yocTerm,
      format: (v) => fmtPercent(v),
    },
    {
      label: "Building Cost",
      a: aResults.buildingCostPSF,
      b: bResults.buildingCostPSF,
      format: (v) => fmtPSF(v),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Headline Metrics</CardTitle>
        <div className="grid grid-cols-[1.4fr,1fr,1fr,1fr] gap-2 pt-2 text-sm font-semibold">
          <div className="text-[var(--color-muted-foreground)]">Metric</div>
          <div className="text-right">{aName}</div>
          <div className="text-right">{bName}</div>
          <div className="text-right">Δ (B − A)</div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map((r) => {
          const delta = r.b - r.a;
          const positive = delta > 0;
          const negative = delta < 0;
          return (
            <div
              key={r.label}
              className="grid grid-cols-[1.4fr,1fr,1fr,1fr] items-center gap-2 border-t pt-2 text-sm first:border-t-0 first:pt-0"
            >
              <div className="text-[var(--color-muted-foreground)]">{r.label}</div>
              <div className="text-right tabular-nums">{r.format(r.a)}</div>
              <div className="text-right font-semibold tabular-nums">{r.format(r.b)}</div>
              <div
                className={cn(
                  "text-right tabular-nums",
                  positive && "text-emerald-600",
                  negative && "text-red-600",
                )}
              >
                {r.format(delta).replace("$", delta >= 0 ? "+$" : "-$").replace("--$", "$")}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
