"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WaterfallComponents } from "@/lib/types";
import { fmtCurrency } from "@/lib/format";

interface Props {
  title: string;
  waterfall: WaterfallComponents;
}

/**
 * A NER waterfall chart: Base Rent → Free Rent → TI → LC → Net CF.
 *
 * Implementation note: Recharts doesn't have a built-in waterfall, so we fake
 * one by stacking an invisible "base" bar with the visible "value" bar. Each
 * bar's "base" is where the running total currently sits; its value is the
 * delta (positive or negative). The final Net CF bar starts from 0.
 */
export function WaterfallChart({ title, waterfall }: Props) {
  const data = [
    {
      name: "Base Rent",
      base: 0,
      value: waterfall.baseRent,
      color: "var(--color-primary)",
    },
    {
      name: "Free Rent",
      base: waterfall.baseRent + waterfall.freeRent, // running total bottom
      value: -waterfall.freeRent, // bar height (positive)
      color: "#dc2626", // red
    },
    {
      name: "TI",
      base: waterfall.baseRent + waterfall.freeRent + waterfall.ti,
      value: -waterfall.ti,
      color: "#dc2626",
    },
    {
      name: "LC",
      base: waterfall.baseRent + waterfall.freeRent + waterfall.ti + waterfall.lc,
      value: -waterfall.lc,
      color: "#dc2626",
    },
    {
      name: "Net CF",
      base: 0,
      value: waterfall.netCashFlow,
      color: "#059669", // emerald
    },
  ];

  const max = Math.max(...data.map((d) => d.base + d.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                domain={[0, Math.ceil(max * 1.1)]}
              />
              <Tooltip
                formatter={(v) => fmtCurrency(typeof v === "number" ? v : Number(v), 2)}
                labelStyle={{ color: "var(--color-foreground)" }}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="base" stackId="w" fill="transparent" />
              <Bar dataKey="value" stackId="w">
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-5 gap-1 pt-2 text-xs tabular-nums text-[var(--color-muted-foreground)]">
          {data.map((d) => (
            <div key={d.name} className="text-center">
              <div className="font-medium">{d.name}</div>
              <div>{fmtCurrency(d.value, 2)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
