"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import type { ScenarioInputs } from "@/lib/types";

interface ScenarioPair {
  id: string;
  name: string;
  inputs: ScenarioInputs;
}

interface Props {
  a: ScenarioPair;
  b: ScenarioPair;
}

/**
 * Per-year rent schedule editor. Each cell shows the rate that year — either
 * the formula-driven value (Base Rate × (1+esc)^(y-1), with optional collar)
 * or a manual override stored in `rentScheduleOverride[y-1]`. Manual cells
 * are tinted with the primary color and get a reset button.
 */
export function RentSchedule({ a, b }: Props) {
  const [open, setOpen] = useState(false);

  const aYears = yearsFor(a.inputs);
  const bYears = yearsFor(b.inputs);
  const maxYears = Math.max(aYears, bYears);

  return (
    <Card>
      <CardHeader>
        <Button
          variant="ghost"
          className="-mx-2 -my-1 justify-start gap-2 px-2 py-1"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
          <CardTitle>Rent Schedule · per-year override</CardTitle>
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <p className="pb-3 text-xs text-[var(--color-muted-foreground)]">
            Each cell is the rate for that lease year. Edit to override; clear or click reset to revert to the
            formula <code className="font-mono">Base × (1 + Esc)<sup>y−1</sup></code>, clamped by Floor/Cap if set.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  <th className="py-2 pr-4">Year</th>
                  <th className="py-2 pr-4 text-right">{a.name}</th>
                  <th className="py-2 pr-4 text-right">{b.name}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxYears }).map((_, i) => {
                  const y = i + 1;
                  return (
                    <tr key={y} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-4">Year {y}</td>
                      <td className="py-1.5 pr-4">
                        <YearCell scenario={a} year={y} totalYears={aYears} />
                      </td>
                      <td className="py-1.5 pr-4">
                        <YearCell scenario={b} year={y} totalYears={bYears} />
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

function YearCell({
  scenario,
  year,
  totalYears,
}: {
  scenario: ScenarioPair;
  year: number;
  totalYears: number;
}) {
  const updateInput = useAppStore((s) => s.updateInput);
  const inputRef = useRef<HTMLInputElement>(null);

  if (year > totalYears) {
    return (
      <div className="flex justify-end">
        <span className="text-[var(--color-muted-foreground)]">—</span>
      </div>
    );
  }

  const override = scenario.inputs.rentScheduleOverride?.[year - 1];
  const isOverride = override != null && Number.isFinite(override);
  const stored = isOverride ? (override as number) : formulaRateFor(scenario.inputs, year);

  const setOverride = (val: number | null) => {
    const current = scenario.inputs.rentScheduleOverride ?? [];
    const next = [...current];
    while (next.length < year) next.push(null);
    next[year - 1] = val;
    // Trim trailing nulls so an all-formula schedule serializes back to undefined.
    while (next.length > 0 && next[next.length - 1] == null) next.pop();
    updateInput(scenario.id, "rentScheduleOverride", (next.length > 0 ? next : undefined) as never);
  };

  return <CellInput stored={stored} isOverride={isOverride} onCommit={setOverride} inputRef={inputRef} />;
}

interface CellInputProps {
  stored: number;
  isOverride: boolean;
  onCommit: (val: number | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function CellInput({ stored, isOverride, onCommit, inputRef }: CellInputProps) {
  const [local, setLocal] = useState<string>(stored.toFixed(2));

  // When the underlying value changes externally (e.g. baseRate edited),
  // resync the input — but only when it's not actively being typed in.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocal(stored.toFixed(2));
    }
  }, [stored, inputRef]);

  const commit = () => {
    if (local === "") {
      onCommit(null);
      return;
    }
    const n = Number(local);
    if (!Number.isFinite(n)) {
      // Invalid input — snap back.
      setLocal(stored.toFixed(2));
      return;
    }
    // Treat a value equal to the formula rate as "no override" only if it was
    // already an override; this prevents an editing session from "unsetting"
    // an intentional override that happens to match.
    onCommit(n);
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        ref={inputRef}
        type="number"
        step={0.01}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            inputRef.current?.blur();
          }
        }}
        className={`h-8 w-24 px-2 text-right text-sm ${
          isOverride ? "border-[var(--color-primary)] font-medium" : ""
        }`}
      />
      {isOverride ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Reset to formula"
          title="Reset to formula"
          onClick={() => onCommit(null)}
        >
          <RotateCcw />
        </Button>
      ) : (
        <span className="w-7" aria-hidden />
      )}
    </div>
  );
}

// ---------- helpers ----------

function yearsFor(inputs: ScenarioInputs): number {
  const free = Math.round(inputs.freeRentMonths);
  const paying = Math.max(0, inputs.leaseTermMonths - free);
  return Math.ceil(paying / 12);
}

function formulaRateFor(inputs: ScenarioInputs, year: number): number {
  const lo = inputs.escalationFloor ?? Number.NEGATIVE_INFINITY;
  const hi = inputs.escalationCap ?? Number.POSITIVE_INFINITY;
  const eff = Math.min(Math.max(inputs.escalation, lo), hi);
  return inputs.baseRatePSF * Math.pow(1 + eff, year - 1);
}
