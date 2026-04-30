"use client";

import { useMemo } from "react";
import { GlobalsPanel } from "@/components/globals-panel";
import { InputsPanel } from "@/components/inputs-panel";
import { ExportPdfButton } from "@/components/pdf/export-button";
import { PropertyHeader, ScenarioBar } from "@/components/scenario-bar";
import { AnnualSchedule } from "@/components/results/annual-schedule";
import { HeadlineCard } from "@/components/results/headline-card";
import { MonthlyGrid } from "@/components/results/monthly-grid";
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
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1"><PropertyHeader /></div>
          <ExportPdfButton />
        </div>
        <ScenarioBar />
      </header>

      <GlobalsPanel />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]">
        <InputsPanel />
        <div className="flex flex-col gap-6">
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
          <AnnualSchedule
            aName={a.inputs.name}
            aResults={aResults}
            bName={b.inputs.name}
            bResults={bResults}
          />
          <MonthlyGrid
            aName={a.inputs.name}
            aResults={aResults}
            bName={b.inputs.name}
            bResults={bResults}
          />
        </>
      )}

      <SensitivityPanel />
    </div>
  );
}
