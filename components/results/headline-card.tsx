"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fmtCurrency,
  fmtPercent,
  fmtSignedCurrency,
  fmtSignedPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScenarioResults } from "@/lib/types";

interface Props {
  aName: string;
  aResults: ScenarioResults;
  bName: string;
  bResults: ScenarioResults;
}

type Format = "currency" | "percent";

interface MetricDef {
  label: string;
  /** Optional unit suffix shown in the metric label (e.g. "$/SF"). */
  unit?: string;
  a: number;
  b: number;
  format: Format;
}

/**
 * Headline metrics — KPI tiles in a horizontal grid (5 / 3 / 2 / 1 cols by
 * breakpoint). Each tile shows B's value as the headline with the Δ inline
 * and A's value as a sub-line, so a quick scan tells the story without
 * scrolling. Δ uses theme `success` / `destructive` tokens.
 */
export function HeadlineCard({ aName, aResults, bName, bResults }: Props) {
  const metrics: MetricDef[] = [
    {
      label: "Discounted NER",
      unit: "$/SF",
      a: aResults.discountedNER,
      b: bResults.discountedNER,
      format: "currency",
    },
    {
      label: "Undiscounted NER",
      unit: "$/SF",
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
      label: "Total Basis",
      unit: "$/SF",
      a: aResults.buildingCostPSF,
      b: bResults.buildingCostPSF,
      format: "currency",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Headline Metrics · {bName} vs {aName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => (
            <Tile key={m.label} metric={m} aName={aName} bName={bName} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface TileProps {
  metric: MetricDef;
  aName: string;
  bName: string;
}

function Tile({ metric, aName, bName }: TileProps) {
  const fmt = metric.format === "percent" ? fmtPercent : fmtCurrency;
  const fmtSigned =
    metric.format === "percent" ? fmtSignedPercent : fmtSignedCurrency;
  const delta = metric.b - metric.a;
  const isGain = delta > 0;
  const isLoss = delta < 0;

  return (
    <div className="flex flex-col gap-1 rounded-md border bg-[var(--color-card)] p-2.5">
      <div className="flex items-baseline justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
        <span className="truncate">{metric.label}</span>
        {metric.unit && <span className="text-[var(--color-muted-foreground)]/70">{metric.unit}</span>}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">{fmt(metric.b)}</span>
        <span
          className={cn(
            "text-xs tabular-nums",
            isGain && "text-[var(--color-success)]",
            isLoss && "text-[var(--color-destructive)]",
            !isGain && !isLoss && "text-[var(--color-muted-foreground)]",
          )}
        >
          {fmtSigned(delta)}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
        <span className="truncate" title={aName}>{aName}</span>
        <span>{fmt(metric.a)}</span>
      </div>
      <div className="sr-only">{bName}: {fmt(metric.b)}</div>
    </div>
  );
}
