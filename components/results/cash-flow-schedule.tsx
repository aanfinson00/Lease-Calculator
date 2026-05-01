"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ScenarioInputs, ScenarioResults } from "@/lib/types";

interface ScenarioPair {
  name: string;
  inputs: ScenarioInputs;
  results: ScenarioResults;
}

interface Props {
  a: ScenarioPair;
  b: ScenarioPair;
}

/**
 * Horizontal cash-flow schedule. One sub-table per scenario, dates running
 * left-to-right. Shows the components that sum to the monthly total cash flow
 * the LL actually pays/collects (real cash basis — free rent shows up
 * implicitly as $0 base rent rather than an explicit abatement line).
 *
 * Sticky first column = row labels. Markers at the execution → commencement
 * boundary and at the rent-commencement (free-rent end) boundary.
 */
export function CashFlowSchedule({ a, b }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <Button
          variant="ghost"
          className="-mx-2 -my-1 justify-start gap-2 px-2 py-1"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
          <CardTitle>Cash Flow Schedule</CardTitle>
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-6">
          <ScheduleTable {...a} />
          <ScheduleTable {...b} />
        </CardContent>
      )}
    </Card>
  );
}

function ScheduleTable({ name, inputs, results }: ScenarioPair) {
  const sf = inputs.proposedLeaseSF;
  const commencementOffset = monthsBetween(
    new Date(inputs.leaseExecutionDate),
    new Date(inputs.leaseCommencement),
  );
  const offset = Math.max(0, commencementOffset);
  const free = Math.max(0, Math.min(Math.round(inputs.freeRentMonths), inputs.leaseTermMonths));
  const rcMonth = offset + free + 1;
  const span = offset + inputs.leaseTermMonths;
  const rows = results.grid.slice(0, span);

  // Totals across the full lease span ($), used in the right-most "Total" col.
  const totals = rows.reduce(
    (acc, r) => {
      acc.base += r.baseRentPSF * sf;
      acc.ti += r.tiPSF * sf;
      acc.lc += r.lcPSF * sf;
      return acc;
    },
    { base: 0, ti: 0, lc: 0 },
  );
  const totalNet = totals.base + totals.ti + totals.lc; // real-cash basis

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">{name}</span>
        <span className="text-[var(--color-muted-foreground)]">
          Execution {inputs.leaseExecutionDate} · Commencement {inputs.leaseCommencement}
          {free > 0 && ` · Rent Comm. M${rcMonth}`}
          {" · "}
          {sf.toLocaleString("en-US")} SF
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="text-xs tabular-nums">
          <thead className="bg-[var(--color-muted)]">
            <tr>
              <th className="sticky left-0 z-10 w-[140px] min-w-[140px] border-r bg-[var(--color-muted)] px-2 py-1.5 text-left font-semibold">
                Month
              </th>
              {rows.map((r, i) => {
                const isExecution = i === 0;
                const isCommencement = i + 1 === offset + 1 && offset > 0;
                const isRentStart = i + 1 === rcMonth && free > 0;
                const marker = isExecution
                  ? { label: "Exec", color: "var(--color-primary)" }
                  : isCommencement
                    ? { label: "Comm", color: "var(--color-muted-foreground)" }
                    : isRentStart
                      ? { label: "Rent", color: "var(--color-success)" }
                      : null;
                return (
                  <th
                    key={i}
                    className={cellBorder(i + 1, offset, rcMonth, free) +
                      " min-w-[64px] px-2 py-1 text-right font-medium"}
                  >
                    <div>M{r.month}</div>
                    {marker && (
                      <div
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: marker.color }}
                      >
                        {marker.label}
                      </div>
                    )}
                  </th>
                );
              })}
              <th className="sticky right-0 z-10 min-w-[100px] border-l bg-[var(--color-muted)] px-2 py-1.5 text-right font-semibold">
                Total
              </th>
            </tr>
            <tr className="border-b">
              <th className="sticky left-0 z-10 border-r bg-[var(--color-muted)] px-2 py-1 text-left font-medium text-[var(--color-muted-foreground)]">
                Date
              </th>
              {rows.map((r, i) => (
                <th
                  key={i}
                  className={cellBorder(i + 1, offset, rcMonth, free) +
                    " px-2 py-1 text-right text-[var(--color-muted-foreground)]"}
                >
                  {fmtMonthYear(r.date)}
                </th>
              ))}
              <th className="sticky right-0 z-10 border-l bg-[var(--color-muted)] px-2 py-1 text-right text-[var(--color-muted-foreground)]">
                {inputs.leaseTermMonths}mo
              </th>
            </tr>
          </thead>
          <tbody>
            <Row
              label="Base Rent"
              values={rows.map((r) => r.baseRentPSF * sf)}
              total={totals.base}
              offset={offset}
              rcMonth={rcMonth}
              free={free}
            />
            <Row
              label="TI Draw"
              values={rows.map((r) => r.tiPSF * sf)}
              total={totals.ti}
              offset={offset}
              rcMonth={rcMonth}
              free={free}
            />
            <Row
              label="Commission"
              values={rows.map((r) => r.lcPSF * sf)}
              total={totals.lc}
              offset={offset}
              rcMonth={rcMonth}
              free={free}
            />
            <Row
              label="Net Cash Flow"
              values={rows.map((r) => (r.baseRentPSF + r.tiPSF + r.lcPSF) * sf)}
              total={totalNet}
              offset={offset}
              rcMonth={rcMonth}
              free={free}
              emphasized
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  values: number[];
  total: number;
  offset: number;
  rcMonth: number;
  free: number;
  emphasized?: boolean;
}

function Row({ label, values, total, offset, rcMonth, free, emphasized = false }: RowProps) {
  const rowCls = emphasized
    ? "border-t-2 border-t-[var(--color-border)] bg-[var(--color-muted)]/50 font-semibold"
    : "border-t";
  const cellCls = "px-2 py-1 text-right whitespace-nowrap";
  const labelBg = emphasized ? "bg-[var(--color-muted)]" : "bg-[var(--color-card)]";
  return (
    <tr className={rowCls}>
      <td className={`sticky left-0 z-10 border-r ${labelBg} px-2 py-1 text-left`}>{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cellBorder(i + 1, offset, rcMonth, free) + " " + cellCls}
          style={emphasized && v !== 0 ? { color: cashColor(v) } : undefined}
        >
          {fmtCash(v)}
        </td>
      ))}
      <td
        className={`sticky right-0 z-10 border-l ${labelBg} ${cellCls}`}
        style={emphasized ? { color: cashColor(total) } : undefined}
      >
        {fmtCash(total)}
      </td>
    </tr>
  );
}

function cashColor(v: number): string {
  if (v > 0) return "var(--color-success)";
  if (v < 0) return "var(--color-cost)";
  return "var(--color-muted-foreground)";
}

// ---------- helpers ----------

function cellBorder(month: number, offset: number, rcMonth: number, free: number): string {
  // Heavier left border at the commencement transition (entering month offset+1)
  // and at the rent commencement transition (entering month rcMonth).
  if (offset > 0 && month === offset + 1) return "border-l-2 border-l-[var(--color-border)]";
  if (free > 0 && month === rcMonth) return "border-l-2 border-l-[var(--color-border)]";
  return "";
}

function fmtCash(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtMonthYear(iso: string): string {
  // ISO like "2026-05-01" → "May '26"
  const [yyyy, mm] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Math.max(0, Math.min(11, Number(mm) - 1));
  return `${months[idx]} '${yyyy.slice(2)}`;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}
