"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { runScenario } from "@/lib/calc";
import { fmtPSF, fmtPercent } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { defaultBounds, solveFor, type FreeVariable, type NERKind } from "@/lib/solver";
import { cn } from "@/lib/utils";
import { TornadoChart } from "./tornado-chart";

const FREE_VARS: { value: FreeVariable; label: string }[] = [
  { value: "baseRatePSF", label: "Base Rate" },
  { value: "escalation", label: "Escalation" },
  { value: "freeRentMonths", label: "Free Rent" },
  { value: "tiAllowancePSF", label: "TI Allowance" },
  { value: "discountRate", label: "Discount Rate" },
];

/** Discount rate doesn't affect undiscounted NER, so it's not a valid free
 *  variable when holding the undiscounted metric. */
const FREE_VARS_FOR_UNDISCOUNTED = FREE_VARS.filter((v) => v.value !== "discountRate");

/**
 * Sensitivity sliders + Hold-NER mode.
 *
 * Scenario picker selects which scenario the sliders mutate. Default is the
 * Scenario B from the comparison view, since users typically iterate on the
 * counter-offer side.
 *
 * Hold-NER mode: when enabled, dragging any non-free-variable slider triggers
 * solveFor() on the chosen free variable to keep discounted NER pinned at
 * the target. The free variable's slider becomes a read-only output indicator
 * (dashed border, OUTPUT badge).
 */
export function SensitivityPanel() {
  const scenarios = useAppStore((s) => s.scenarios);
  const comparison = useAppStore((s) => s.comparison);
  const globals = useAppStore((s) => s.globals);
  const updateInput = useAppStore((s) => s.updateInput);
  const updateGlobals = useAppStore((s) => s.updateGlobals);
  const holdNer = useAppStore((s) => s.holdNer);
  const setHoldNer = useAppStore((s) => s.setHoldNer);

  // Scenario being slid — defaults to B; switches if user picks another.
  const [activeId, setActiveId] = useState<string>(comparison.bId);
  useEffect(() => {
    // If the currently-active scenario was deleted, fall back to B.
    if (!scenarios.find((s) => s.id === activeId)) setActiveId(comparison.bId);
  }, [scenarios, activeId, comparison.bId]);

  const active = scenarios.find((s) => s.id === activeId);

  // Snapshot baseline baseRatePSF when scenario changes — keeps the slider
  // bounds stable as the user drags (otherwise ±30% shifts with each drag).
  const [baselineBaseRate, setBaselineBaseRate] = useState<number>(
    active?.inputs.baseRatePSF ?? 0,
  );
  useEffect(() => {
    if (active) setBaselineBaseRate(active.inputs.baseRatePSF);
  }, [active?.id]); // intentional — only on scenario switch
  // eslint-disable-line react-hooks/exhaustive-deps

  const [solverError, setSolverError] = useState<string | null>(null);

  // Preferred NER metric for the solver. Persists across Hold-NER toggles —
  // user can pick "Undiscounted" before checking the box, then enabling
  // Hold-NER seeds the solver target from the chosen metric.
  const [nerKind, setNerKindState] = useState<NERKind>(
    holdNer?.nerKind ?? "discounted",
  );
  // Keep local state in sync if holdNer.nerKind changes from elsewhere.
  useEffect(() => {
    if (holdNer?.nerKind && holdNer.nerKind !== nerKind) {
      setNerKindState(holdNer.nerKind);
    }
  }, [holdNer?.nerKind]);
  // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-[var(--color-muted-foreground)]">
          No scenario selected.
        </CardContent>
      </Card>
    );
  }

  const bounds = (freeVar: FreeVariable): [number, number] => {
    if (freeVar === "baseRatePSF") {
      return [Math.max(0.01, baselineBaseRate * 0.7), baselineBaseRate * 1.3];
    }
    return defaultBounds(freeVar, active.inputs);
  };

  const currentValue = (freeVar: FreeVariable): number => {
    if (freeVar === "discountRate") return globals.discountRate;
    return active.inputs[freeVar] as number;
  };

  /** Apply a value to the right slice of state (input or global). */
  const applyValue = (freeVar: FreeVariable, value: number) => {
    if (freeVar === "discountRate") {
      updateGlobals({ discountRate: value });
    } else {
      updateInput(active.id, freeVar, value as never);
    }
  };

  /** Slider onValueChange handler. Triggers solver if Hold-NER is on. */
  const onSlide = (freeVar: FreeVariable) => (vals: number[]) => {
    const v = vals[0]!;
    applyValue(freeVar, v);

    if (holdNer?.enabled && holdNer.scenarioId === active.id && holdNer.freeVar !== freeVar) {
      // Solve for the locked free variable to keep NER at target.
      const updatedInputs =
        freeVar === "discountRate" ? active.inputs : { ...active.inputs, [freeVar]: v };
      const updatedGlobals = freeVar === "discountRate" ? { ...globals, discountRate: v } : globals;
      const result = solveFor(
        updatedInputs,
        updatedGlobals,
        holdNer.targetNER,
        holdNer.freeVar,
        holdNer.nerKind,
      );
      if (!result.converged) {
        setSolverError(
          `Target ${holdNer.nerKind} NER of ${fmtPSF(holdNer.targetNER)} can't be reached by adjusting ${labelOf(holdNer.freeVar)} within its slider range.`,
        );
      } else {
        setSolverError(null);
        applyValue(holdNer.freeVar, result.value);
      }
    }
  };

  // Compute live discounted NER for the active scenario (display + Hold-NER seed).
  const liveResults = useMemo(
    () => runScenario(active.inputs, globals),
    [active.inputs, globals],
  );

  const isHolding = holdNer?.enabled === true && holdNer.scenarioId === active.id;
  const lockedVar = isHolding ? holdNer!.freeVar : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Sensitivity</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-[var(--color-muted-foreground)]">Sliding:</Label>
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              className="h-9 rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.inputs.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isHolding}
              onChange={(e) => {
                if (e.target.checked) {
                  setHoldNer({
                    enabled: true,
                    targetNER:
                      nerKind === "undiscounted"
                        ? liveResults.undiscountedNER
                        : liveResults.discountedNER,
                    freeVar: holdNer?.freeVar ?? "baseRatePSF",
                    scenarioId: active.id,
                    nerKind,
                  });
                } else {
                  setHoldNer(null);
                  setSolverError(null);
                }
              }}
            />
            <span className="font-medium">Hold NER</span>
          </label>

          <div className="flex items-center gap-2">
            <Label className="text-xs text-[var(--color-muted-foreground)]">Metric:</Label>
            <select
              value={nerKind}
              onChange={(e) => {
                const next = e.target.value as NERKind;
                setNerKindState(next);
                if (isHolding && holdNer) {
                  // Re-seed target to the current value of the chosen NER
                  // and bump the free var off discountRate if needed
                  // (DR has no effect on undiscounted NER → no convergence).
                  const seed =
                    next === "undiscounted"
                      ? liveResults.undiscountedNER
                      : liveResults.discountedNER;
                  const freeVar =
                    next === "undiscounted" && holdNer.freeVar === "discountRate"
                      ? "baseRatePSF"
                      : holdNer.freeVar;
                  setHoldNer({ ...holdNer, nerKind: next, targetNER: seed, freeVar });
                }
              }}
              className="h-9 rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            >
              <option value="discounted">Discounted NER</option>
              <option value="undiscounted">Undiscounted NER</option>
            </select>
          </div>

          {isHolding && (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-[var(--color-muted-foreground)]">
                  Target ({holdNer!.nerKind === "undiscounted" ? "undisc." : "disc."} NER, $/SF):
                </Label>
                <Input
                  type="number"
                  step={0.05}
                  className="h-9 w-24"
                  value={holdNer!.targetNER.toFixed(2)}
                  onChange={(e) =>
                    setHoldNer({
                      ...holdNer!,
                      targetNER: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-[var(--color-muted-foreground)]">Solve for:</Label>
                <select
                  value={holdNer!.freeVar}
                  onChange={(e) =>
                    setHoldNer({ ...holdNer!, freeVar: e.target.value as FreeVariable })
                  }
                  className="h-9 rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                >
                  {(holdNer!.nerKind === "undiscounted" ? FREE_VARS_FOR_UNDISCOUNTED : FREE_VARS).map(
                    (v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </>
          )}
        </div>

        {solverError && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-2 text-xs text-[var(--color-destructive)]">
            <AlertCircle className="mt-0.5 size-4 flex-shrink-0" />
            {solverError}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {FREE_VARS.map(({ value: fv, label }) => {
          const [lo, hi] = bounds(fv);
          const v = currentValue(fv);
          const locked = lockedVar === fv;
          return (
            <SliderRow
              key={fv}
              label={label}
              displayValue={displayFor(fv, v)}
              value={v}
              min={lo}
              max={hi}
              step={stepFor(fv)}
              locked={locked}
              onChange={onSlide(fv)}
            />
          );
        })}

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t pt-3 text-sm">
          <NERReadout
            label="Live undiscounted NER"
            value={liveResults.undiscountedNER}
            held={isHolding && holdNer!.nerKind === "undiscounted"}
          />
          <NERReadout
            label="Live discounted NER"
            value={liveResults.discountedNER}
            held={isHolding && holdNer!.nerKind === "discounted"}
          />
        </div>

        <TornadoChart
          inputs={active.inputs}
          globals={globals}
          scenarioName={active.inputs.name}
        />
      </CardContent>
    </Card>
  );
}

interface SliderRowProps {
  label: string;
  displayValue: string;
  value: number;
  min: number;
  max: number;
  step: number;
  locked: boolean;
  onChange: (v: number[]) => void;
}

function SliderRow({ label, displayValue, value, min, max, step, locked, onChange }: SliderRowProps) {
  return (
    <div className="grid grid-cols-[10rem,1fr,6rem] items-center gap-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm">{label}</Label>
        {locked && (
          <span className="rounded border border-dashed border-[var(--color-ring)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Output
          </span>
        )}
      </div>
      <Slider
        value={[Math.max(min, Math.min(max, value))]}
        min={min}
        max={max}
        step={step}
        disabled={locked}
        output={locked}
        onValueChange={onChange}
      />
      <div
        className={cn(
          "text-right text-sm tabular-nums",
          locked && "text-[var(--color-muted-foreground)]",
        )}
      >
        {displayValue}
      </div>
    </div>
  );
}

function NERReadout({
  label,
  value,
  held,
}: {
  label: string;
  value: number;
  held: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[var(--color-muted-foreground)]">{label}:</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          held && "text-[var(--color-primary)]",
        )}
      >
        {fmtPSF(value)}
      </span>
      {held && (
        <span className="rounded border border-[var(--color-primary)] px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Held
        </span>
      )}
    </div>
  );
}

function labelOf(fv: FreeVariable): string {
  return FREE_VARS.find((v) => v.value === fv)?.label ?? fv;
}

function stepFor(fv: FreeVariable): number {
  switch (fv) {
    case "baseRatePSF":
      return 0.05;
    case "escalation":
      return 0.0025; // 0.25%
    case "freeRentMonths":
      return 1;
    case "tiAllowancePSF":
      return 0.5;
    case "discountRate":
      return 0.0025;
  }
}

function displayFor(fv: FreeVariable, v: number): string {
  switch (fv) {
    case "baseRatePSF":
    case "tiAllowancePSF":
      return fmtPSF(v);
    case "escalation":
    case "discountRate":
      return fmtPercent(v);
    case "freeRentMonths":
      return `${Math.round(v)} mo`;
  }
}
