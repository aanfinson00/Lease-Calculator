"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPSF, fmtPercent, fmtSignedCurrency, fmtSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScenarioResults } from "@/lib/types";

interface Props {
  aName: string;
  aResults: ScenarioResults;
  bName: string;
  bResults: ScenarioResults;
}

type Format = "currency" | "percent";

interface MetricRow {
  label: string;
  a: number;
  b: number;
  format: Format;
  /** True if the headline metric — gets the bigger treatment. */
  primary?: boolean;
}

/**
 * Headline metrics card — five rows × three columns (A | B | Δ).
 * Δ uses theme `success` (gain) and `destructive` (loss) tokens; we don't
 * editorialize whether positive is good — the analyst reads context.
 * Primary metrics (NER) get larger numerals.
 */
export function HeadlineCard({ aName, aResults, bName, bResults }: Props) {
  const rows: MetricRow[] = [
    {
      label: "Discounted NER",
      a: aResults.discountedNER,
      b: bResults.discountedNER,
      format: "currency",
      primary: true,
    },
    {
      label: "Undiscounted NER",
      a: aResults.undiscountedNER,
      b: bResults.undiscountedNER,
      format: "currency",
    },
    {
      label: "YoC · Year 1",
      a: aResults.yocYr1,
      b: bResults.yocYr1,
      format: "percent",
    },
    {
      label: "YoC · Term",
      a: aResults.yocTerm,
      b: bResults.yocTerm,
      format: "percent",
    },
    {
      label: "Building Cost",
      a: aResults.buildingCostPSF,
      b: bResults.buildingCostPSF,
      format: "currency",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Headline Metrics</CardTitle>
        <div className="grid grid-cols-[1.4fr,1fr,1fr,1fr] gap-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          <div>Metric</div>
          <div className="text-right">{aName}</div>
          <div className="text-right">{bName}</div>
          <div className="text-right">Δ (B − A)</div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {rows.map((r) => {
          const delta = r.b - r.a;
          const isGain = delta > 0;
          const isLoss = delta < 0;
          const fmt = r.format === "percent" ? fmtPercent : fmtPSF;
          const fmtSigned = r.format === "percent" ? fmtSignedPercent : fmtSignedCurrency;
          return (
            <div
              key={r.label}
              className={cn(
                "grid grid-cols-[1.4fr,1fr,1fr,1fr] items-baseline gap-2 border-t py-2.5 first:border-t-0 first:pt-0",
                r.primary && "py-3.5",
              )}
            >
              <div className="text-sm text-[var(--color-muted-foreground)]">{r.label}</div>
              <div
                className={cn(
                  "text-right tabular-nums",
                  r.primary ? "text-base" : "text-sm",
                )}
              >
                {fmt(r.a)}
              </div>
              <div
                className={cn(
                  "text-right font-semibold tabular-nums",
                  r.primary ? "text-lg text-[var(--color-foreground)]" : "text-sm",
                )}
              >
                {fmt(r.b)}
              </div>
              <div
                className={cn(
                  "text-right tabular-nums",
                  r.primary ? "text-base font-medium" : "text-sm",
                  isGain && "text-[var(--color-success)]",
                  isLoss && "text-[var(--color-destructive)]",
                  !isGain && !isLoss && "text-[var(--color-muted-foreground)]",
                )}
              >
                {fmtSigned(delta)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
