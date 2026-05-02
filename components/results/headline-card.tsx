"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
  /** Plain-language definition shown in the tile's help tooltip. */
  glossary: string;
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
      glossary:
        "Net Effective Rent on a present-value basis. Sum of discounted base rent over the term, less the present value of landlord costs (LC, TI, free rent), spread across the lease SF and term in years. Reflects time value of money.",
    },
    {
      label: "Undiscounted NER",
      unit: "$/SF",
      a: aResults.undiscountedNER,
      b: bResults.undiscountedNER,
      format: "currency",
      glossary:
        "Same calculation as Discounted NER but with no discount rate applied. The average rent the landlord effectively earns per SF per year over the term, net of all concessions.",
    },
    {
      label: "Yield on Cost · Yr 1",
      a: aResults.yocYr1,
      b: bResults.yocYr1,
      format: "percent",
      glossary:
        "Year-1 base rent divided by total project basis (land + shell + soft costs + TI + LC). Cash-on-cost return at lease commencement.",
    },
    {
      label: "Yield on Cost · Term",
      a: aResults.yocTerm,
      b: bResults.yocTerm,
      format: "percent",
      glossary:
        "Average annual rent over the lease term divided by total project basis (land + shell + soft costs + TI + LC). Levelized return across the term.",
    },
    {
      label: "Total Basis",
      unit: "$/SF",
      a: aResults.totalBasisPSF,
      b: bResults.totalBasisPSF,
      format: "currency",
      glossary:
        "All-in project cost per SF: land + shell construction + soft costs (A&E, permits, financing) + TI allowance + leasing commissions. Free rent isn't a separate component — it lowers the LC base by reducing paying months.",
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
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{metric.label}</span>
          <HelpTooltip>{metric.glossary}</HelpTooltip>
        </span>
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
