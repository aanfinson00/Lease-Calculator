"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import type { ScenarioResults } from "@/lib/types";

interface Props {
  aName: string;
  aResults: ScenarioResults;
  bName: string;
  bResults: ScenarioResults;
}

export function AnnualSchedule({ aName, aResults, bName, bResults }: Props) {
  const [open, setOpen] = useState(false);

  // Pad both schedules to the same length for side-by-side display.
  const maxYears = Math.max(aResults.schedule.length, bResults.schedule.length);

  return (
    <Card>
      <CardHeader>
        <Button
          variant="ghost"
          className="-mx-2 -my-1 justify-start gap-2 px-2 py-1"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
          <CardTitle>Annual Rent Schedule</CardTitle>
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  <th className="py-2 pr-4">Year</th>
                  <th className="py-2 pr-4 text-right">{aName} Rate</th>
                  <th className="py-2 pr-4 text-right">{aName} Months</th>
                  <th className="py-2 pr-4 text-right">{bName} Rate</th>
                  <th className="py-2 pr-4 text-right">{bName} Months</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxYears }).map((_, i) => {
                  const aRow = aResults.schedule[i];
                  const bRow = bResults.schedule[i];
                  return (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-4">
                        {(aRow ?? bRow)?.year === 0 ? "Free Rent" : `Year ${(aRow ?? bRow)?.year}`}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {aRow ? fmtCurrency(aRow.annualRatePSF, 2) : "—"}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {aRow ? fmtNumber(aRow.monthsActive, 0) : "—"}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {bRow ? fmtCurrency(bRow.annualRatePSF, 2) : "—"}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {bRow ? fmtNumber(bRow.monthsActive, 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
