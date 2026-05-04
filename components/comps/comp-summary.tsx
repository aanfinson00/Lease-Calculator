"use client";

import { Card, CardContent } from "@/components/ui/card";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import type { CompSummary } from "@/lib/comps";

interface Props {
  summary: CompSummary;
  total: number;
}

/**
 * Small horizontal stat strip rendered above the comp table. Same
 * flat-divided look as the analyzer HeadlineCard, smaller font.
 */
export function CompSummaryStats({ summary, total }: Props) {
  const stats = [
    {
      label: "Comps",
      value: `${summary.count}`,
      sub: total !== summary.count ? `of ${total}` : undefined,
    },
    {
      label: "Avg Base Rate",
      unit: "$/SF",
      value: fmtCurrency(summary.avgBaseRatePSF, 2),
    },
    {
      label: "Avg Term",
      unit: "mo",
      value: fmtNumber(summary.avgTermMonths, 0),
    },
    {
      label: "Avg TI",
      unit: "$/SF",
      value: fmtCurrency(summary.avgTIPSF, 2),
    },
    {
      label: "Avg Combined LC",
      value: fmtPercent(summary.avgCombinedLCPercent * 100, 2),
    },
  ];

  return (
    <Card>
      <CardContent className="grid grid-cols-2 divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 px-3 py-2 first:pl-0 last:pr-0">
            <div className="flex items-baseline justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
              <span className="truncate">{s.label}</span>
              {s.unit && (
                <span className="text-[var(--color-muted-foreground)]/70">{s.unit}</span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold tabular-nums">{s.value}</span>
              {s.sub && (
                <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                  {s.sub}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
