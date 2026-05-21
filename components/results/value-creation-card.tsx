"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScenarioInputs, ScenarioResults } from "@/lib/types";

interface Props {
  aName: string;
  aInputs: ScenarioInputs;
  aResults: ScenarioResults;
  bName: string;
  bInputs: ScenarioInputs;
  bResults: ScenarioResults;
}

/**
 * TI Amortization · Value Creation.
 *
 * Side-by-side A vs B view of the amortization deal: each column shows what
 * the landlord gives (additional TI), what they get back (constant monthly
 * uplift to base rent over the term at the amortization rate), and the
 * implied value creation at the market cap rate. Value creation here is the
 * standard perpetuity shortcut — annualUplift / capRate − additionalTI — i.e.
 * "the asset is worth this much more at exit vs. forfeiting the TI and
 * holding rate flat."
 */
export function ValueCreationCard({
  aName,
  aInputs,
  aResults,
  bName,
  bInputs,
  bResults,
}: Props) {
  const anyActive =
    aInputs.additionalTIPSF > 0 || bInputs.additionalTIPSF > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">
          TI Amortization · Value Creation
          <HelpTooltip>
            When a tenant takes additional TI in exchange for higher base
            rent, the landlord finances the extra dollars at the amortization
            rate. Value creation here is the capitalized rent uplift (annual
            uplift ÷ cap rate, perpetuity shortcut) less the additional TI
            given — i.e. how much more the asset is worth at exit vs.
            forfeiting the TI and holding rate flat.
          </HelpTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {anyActive ? (
          <div className="grid grid-cols-1 gap-3 divide-y divide-[var(--color-border)] sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-y-0">
            <Column name={aName} inputs={aInputs} results={aResults} />
            <Column name={bName} inputs={bInputs} results={bResults} />
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted-foreground)]">
            Add additional TI in Concessions and set the amortization /
            cap rate in Deal Assumptions to model the value creation of
            financing extra TI into base rent.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ColumnProps {
  name: string;
  inputs: ScenarioInputs;
  results: ScenarioResults;
}

function Column({ name, inputs, results }: ColumnProps) {
  const active = inputs.additionalTIPSF > 0;
  const a = results.amortization;
  const sf = inputs.proposedLeaseSF;

  if (!active) {
    return (
      <div className="flex flex-col gap-1 px-3 py-2 first:pl-0 last:pr-0 sm:first:pl-0 sm:last:pr-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
          {name}
        </div>
        <div className="text-sm text-[var(--color-muted-foreground)]">
          No amortization deal.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2 first:pl-0 last:pr-0 sm:first:pl-0 sm:last:pr-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
        {name}
      </div>

      <Row
        label="Additional TI"
        value={fmtCurrency(inputs.additionalTIPSF)}
        sub={`× ${sf.toLocaleString()} SF = ${fmtCurrency(inputs.additionalTIPSF * sf, 0)}`}
      />
      <Row
        label="Monthly uplift"
        value={`${fmtCurrency(a.monthlyUpliftPSF, 4)} /SF`}
      />
      <Row
        label="Annual uplift"
        value={`${fmtCurrency(a.annualUpliftPSF)} /SF`}
        sub={`= ${fmtCurrency(a.annualUpliftPSF * sf, 0)} /yr`}
      />
      <Row
        label="Capitalized uplift"
        value={`${fmtCurrency(a.capitalizedUpliftPSF)} /SF`}
        sub="annual uplift ÷ cap rate"
      />

      <div
        className={cn(
          "mt-1 flex items-baseline justify-between gap-2 border-t border-[var(--color-border)] pt-2",
        )}
      >
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
          Value created
        </div>
        <div className="flex flex-col items-end">
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              a.valueCreationAbsolute > 0 && "text-[var(--color-success)]",
              a.valueCreationAbsolute < 0 && "text-[var(--color-destructive)]",
            )}
          >
            {fmtCurrency(a.valueCreationAbsolute, 0)}
          </span>
          <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
            {fmtCurrency(a.valueCreationPSF)} /SF
          </span>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  sub?: string;
}

function Row({ label, value, sub }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-[var(--color-muted-foreground)]">{label}</span>
      <span className="flex flex-col items-end">
        <span className="text-sm tabular-nums">{value}</span>
        {sub && (
          <span className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}
