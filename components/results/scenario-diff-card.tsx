"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fmtCurrency,
  fmtPercent,
  fmtSignedCurrency,
  fmtSignedPercent,
} from "@/lib/format";
import { diffScenarios, type DiffEntry, type DiffFormat } from "@/lib/scenario-diff";
import { cn } from "@/lib/utils";
import type { ScenarioInputs } from "@/lib/types";

interface Props {
  aName: string;
  aInputs: ScenarioInputs;
  bName: string;
  bInputs: ScenarioInputs;
}

/**
 * Compact A-vs-B diff of the inputs. Every field where A !== B gets a row;
 * if everything matches, shows a muted "All inputs match." line so the card
 * has a stable anchor on the page.
 *
 * Rows group by section in the same order as the Inputs panel.
 */
export function ScenarioDiffCard({ aName, aInputs, bName, bInputs }: Props) {
  const entries = diffScenarios(aInputs, bInputs);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>What's Different · {aName} vs {bName}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            All inputs match.
          </p>
        ) : (
          <DiffTable entries={entries} aName={aName} bName={bName} />
        )}
      </CardContent>
    </Card>
  );
}

interface TableProps {
  entries: DiffEntry[];
  aName: string;
  bName: string;
}

function DiffTable({ entries, aName, bName }: TableProps) {
  // Group consecutive entries by section so we render a single subheader row
  // per section (input panel grouping carries over into the diff card).
  const groups: { section: string; rows: DiffEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.section === e.sectionLabel) last.rows.push(e);
    else groups.push({ section: e.sectionLabel, rows: [e] });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
            <th className="py-1 pr-3 text-left font-semibold">Field</th>
            <th className="py-1 px-2 text-right font-semibold">{aName}</th>
            <th className="py-1 px-2 text-right font-semibold">{bName}</th>
            <th className="py-1 pl-2 text-right font-semibold">Δ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {groups.map((g) => (
            <SectionRows key={g.section} section={g.section} rows={g.rows} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionRows({ section, rows }: { section: string; rows: DiffEntry[] }) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]"
        >
          {section}
        </td>
      </tr>
      {rows.map((r) => (
        <Row key={r.field} entry={r} />
      ))}
    </>
  );
}

function Row({ entry }: { entry: DiffEntry }) {
  const aFmt = formatValue(entry.aValue, entry.format);
  const bFmt = formatValue(entry.bValue, entry.format);
  const delta = computeDelta(entry);

  return (
    <tr>
      <td className="py-1.5 pr-3 text-[var(--color-foreground)]">{entry.fieldLabel}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-[var(--color-muted-foreground)]">
        {aFmt}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums">{bFmt}</td>
      <td
        className={cn(
          "py-1.5 pl-2 text-right tabular-nums",
          delta && delta.startsWith("+") && "text-[var(--color-success)]",
          delta && delta.startsWith("-") && "text-[var(--color-destructive)]",
          !delta && "text-[var(--color-muted-foreground)]",
        )}
      >
        {delta ?? "—"}
      </td>
    </tr>
  );
}

function formatValue(v: string | number, format: DiffFormat): string {
  if (format === "currency") return fmtCurrency(v as number);
  if (format === "percent") return fmtPercent(v as number);
  if (format === "integer") return Math.round(v as number).toLocaleString();
  if (format === "date") return String(v);
  // enum
  return String(v);
}

function computeDelta(entry: DiffEntry): string | null {
  if (entry.format === "enum" || entry.format === "date") return null;
  const a = entry.aValue as number;
  const b = entry.bValue as number;
  const d = b - a;
  if (entry.format === "currency") return fmtSignedCurrency(d);
  if (entry.format === "percent") return fmtSignedPercent(d);
  if (entry.format === "integer") {
    const sign = d > 0 ? "+" : d < 0 ? "-" : "";
    return `${sign}${Math.abs(Math.round(d)).toLocaleString()}`;
  }
  return null;
}
