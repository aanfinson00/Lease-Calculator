"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { fmtCurrency } from "@/lib/format";
import { computeTornado, type TornadoMetric } from "@/lib/sensitivity";
import type { Globals, ScenarioInputs } from "@/lib/types";

interface Props {
  inputs: ScenarioInputs;
  globals: Globals;
  /** Display name of the active scenario, shown in the chart heading. */
  scenarioName: string;
}

/**
 * Tornado chart — ranks each input by how much it swings NER under
 * symmetric perturbations, biggest mover on top. Helps a user see at a
 * glance which lever to negotiate hardest on.
 *
 * Two horizontal bar segments per row (down + up) drawn around a
 * reference line at zero, sized in NER $/SF.
 */
export function TornadoChart({ inputs, globals, scenarioName }: Props) {
  const [metric, setMetric] = useState<TornadoMetric>("discountedNER");

  const rows = useMemo(
    () => computeTornado(inputs, globals, metric),
    [inputs, globals, metric],
  );

  // Recharts wants one record per "Y-axis category" with the two
  // signed values as separate keys. Reverse so the largest mover ends
  // up at the TOP (Recharts plots the first category at the bottom).
  const data = [...rows].reverse().map((r) => ({
    label: r.label,
    perturbation: r.perturbation,
    down: r.downDelta,
    up: r.upDelta,
  }));

  const maxAbs = Math.max(
    ...rows.flatMap((r) => [Math.abs(r.upDelta), Math.abs(r.downDelta)]),
    0.01,
  );
  const domain: [number, number] = [-maxAbs * 1.1, maxAbs * 1.1];

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-[var(--color-card)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          Tornado · {scenarioName}
        </div>
        <RadioGroup
          value={metric}
          onValueChange={(v) => setMetric(v as TornadoMetric)}
          className="flex items-center gap-3 text-xs"
        >
          <Label className="flex items-center gap-1">
            <RadioGroupItem value="discountedNER" /> Discounted NER
          </Label>
          <Label className="flex items-center gap-1">
            <RadioGroupItem value="undiscountedNER" /> Undiscounted NER
          </Label>
        </RadioGroup>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            stackOffset="sign"
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <XAxis
              type="number"
              domain={domain}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              tickFormatter={(v) => fmtCurrency(Number(v), 2)}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              width={92}
            />
            <ReferenceLine x={0} stroke="var(--color-border)" />
            <Tooltip
              cursor={{ fill: "var(--color-muted)" }}
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(v, name) => [
                fmtCurrency(typeof v === "number" ? v : Number(v), 2),
                name === "down" ? "Worse for LL" : "Better for LL",
              ]}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as { perturbation?: string } | undefined;
                return p?.perturbation ? `${label} · ${p.perturbation}` : String(label);
              }}
            />
            <Bar dataKey="down" stackId="ner" fill="var(--color-cost)">
              {data.map((_, i) => (
                <Cell key={`d-${i}`} fill="var(--color-cost)" />
              ))}
            </Bar>
            <Bar dataKey="up" stackId="ner" fill="var(--color-success)">
              {data.map((_, i) => (
                <Cell key={`u-${i}`} fill="var(--color-success)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] leading-tight text-[var(--color-muted-foreground)]">
        Each bar shows ΔNER when that input moves the perturbation amount in
        each direction. Perturbations are sized to reflect typical
        negotiation room: percentages for inputs with non-zero baselines,
        absolute deltas (bps, mo, $/SF) for inputs that often start at zero.
      </p>
    </div>
  );
}
