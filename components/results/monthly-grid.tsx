"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtCurrency } from "@/lib/format";
import type { ScenarioResults } from "@/lib/types";

interface Props {
  aName: string;
  aResults: ScenarioResults;
  bName: string;
  bResults: ScenarioResults;
}

/**
 * Monthly cash flow preview. We show the first 24 months by default with
 * a toggle to expand to the full horizon. Real virtualization (react-window
 * or react-virtual) is overkill until we hit thousands of cells.
 */
export function MonthlyGrid({ aName, aResults, bName, bResults }: Props) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const horizon = Math.min(aResults.grid.length, bResults.grid.length);
  const visible = showAll ? horizon : Math.min(24, horizon);

  return (
    <Card>
      <CardHeader>
        <Button
          variant="ghost"
          className="-mx-2 -my-1 justify-start gap-2 px-2 py-1"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
          <CardTitle>Monthly Cash Flow Grid</CardTitle>
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="flex items-center justify-end gap-2 pb-2">
            <span className="text-xs text-[var(--color-muted-foreground)]">
              Showing {visible} of {horizon} months
            </span>
            <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show first 24 only" : "Show all months"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs tabular-nums">
              <thead className="bg-[var(--color-muted)]">
                <tr className="border-b text-left">
                  <th className="px-2 py-1.5 text-left">Month</th>
                  <th className="px-2 py-1.5 text-right">{aName} Net CF</th>
                  <th className="px-2 py-1.5 text-right">{bName} Net CF</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: visible }).map((_, i) => (
                  <tr key={i} className="border-b last:border-b-0 hover:bg-[var(--color-accent)]">
                    <td className="px-2 py-1">
                      {aResults.grid[i]?.month}
                      <span className="ml-2 text-[var(--color-muted-foreground)]">
                        {aResults.grid[i]?.date.slice(0, 7)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right">
                      {fmtCurrency(aResults.grid[i]?.netCFPSF ?? null, 4)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {fmtCurrency(bResults.grid[i]?.netCFPSF ?? null, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
