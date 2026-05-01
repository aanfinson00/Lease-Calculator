"use client";

import { useMemo } from "react";
import { InputsPanel } from "@/components/inputs-panel";
import { ExportPdfButton } from "@/components/pdf/export-button";
import { PropertyHeader, ScenarioBar } from "@/components/scenario-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/toaster";
import { AnnualSchedule } from "@/components/results/annual-schedule";
import { CashFlowSchedule } from "@/components/results/cash-flow-schedule";
import { HeadlineCard } from "@/components/results/headline-card";
import { RentSchedule } from "@/components/results/rent-schedule";
import { WaterfallChart } from "@/components/results/waterfall-chart";
import { SensitivityPanel } from "@/components/sensitivity/sensitivity-panel";
import { runScenario } from "@/lib/calc";
import { useAppStore, useHasHydrated } from "@/lib/store";

export default function Home() {
  const hydrated = useHasHydrated();
  const aId = useAppStore((s) => s.comparison.aId);
  const bId = useAppStore((s) => s.comparison.bId);
  const a = useAppStore((s) => s.scenarios.find((sc) => sc.id === aId));
  const b = useAppStore((s) => s.scenarios.find((sc) => sc.id === bId));
  const globals = useAppStore((s) => s.globals);

  // Memoize so a slider that only touches one scenario doesn't rerun the
  // other's calc on every keystroke.
  const aResults = useMemo(
    () => (a ? runScenario(a.inputs, globals) : null),
    [a, globals],
  );
  const bResults = useMemo(
    () => (b ? runScenario(b.inputs, globals) : null),
    [b, globals],
  );

  if (!hydrated) {
    // Avoid the SSR/CSR flash of default state before localStorage restores.
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            RFP Analyzer
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6">
      <header className="flex flex-col gap-4 border-b pb-5">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-1 items-end gap-6">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                RFP Analyzer
              </span>
              <span className="text-[11px] text-[var(--color-muted-foreground)]">
                Net Effective Rent · Industrial Lease Comparison
              </span>
            </div>
            <div className="h-10 w-px bg-[var(--color-border)]" />
            <div className="flex-1"><PropertyHeader /></div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ExportPdfButton />
          </div>
        </div>
        <ScenarioBar />
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]">
        <InputsPanel />
        <div className="flex flex-col gap-5">
          {a && b && aResults && bResults && (
            <>
              <HeadlineCard
                aName={a.inputs.name}
                aResults={aResults}
                bName={b.inputs.name}
                bResults={bResults}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <WaterfallChart title={a.inputs.name} waterfall={aResults.waterfall} />
                <WaterfallChart title={b.inputs.name} waterfall={bResults.waterfall} />
              </div>
            </>
          )}
        </div>
      </div>

      {a && b && aResults && bResults && (
        <>
          <RentSchedule
            a={{ id: a.id, name: a.inputs.name, inputs: a.inputs }}
            b={{ id: b.id, name: b.inputs.name, inputs: b.inputs }}
          />
          <AnnualSchedule
            aName={a.inputs.name}
            aResults={aResults}
            bName={b.inputs.name}
            bResults={bResults}
          />
          <CashFlowSchedule
            a={{ name: a.inputs.name, inputs: a.inputs, results: aResults }}
            b={{ name: b.inputs.name, inputs: b.inputs, results: bResults }}
          />
        </>
      )}

      <SensitivityPanel />
      <Toaster />
    </div>
  );
}
