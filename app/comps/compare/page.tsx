"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Toaster } from "@/components/ui/toaster";
import {
  compAsScenarioPatch,
  computeCompSnapshot,
  type Comp,
  type CompNERSnapshot,
} from "@/lib/comps";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { useAppStore, useHasHydrated } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Multi-comp side-by-side comparison sheet. Reads the picked IDs from
 * the transient `compareIds` slot in the store. NER values are
 * recomputed live so they reflect current globals (no stale snapshots).
 */
export default function CompareCompsPage() {
  const hydrated = useHasHydrated();
  const router = useRouter();
  const ids = useAppStore((s) => s.compareIds);
  const allComps = useAppStore((s) => s.deals);
  const globals = useAppStore((s) => s.globals);
  const aId = useAppStore((s) => s.comparison.aId);
  const bId = useAppStore((s) => s.comparison.bId);
  const aName = useAppStore((s) => s.scenarios.find((sc) => sc.id === aId)?.inputs.name);
  const bName = useAppStore((s) => s.scenarios.find((sc) => sc.id === bId)?.inputs.name);
  const updateInput = useAppStore((s) => s.updateInput);

  const comps = useMemo(
    () => ids.map((id) => allComps.find((c) => c.id === id)).filter((c): c is Comp => !!c),
    [ids, allComps],
  );

  const snapshots = useMemo<CompNERSnapshot[]>(
    () => comps.map((c) => computeCompSnapshot(c, globals)),
    [comps, globals],
  );

  const loadInto = (comp: Comp, target: "A" | "B") => {
    const targetId = target === "A" ? aId : bId;
    const targetName = target === "A" ? aName : bName;
    const patch = compAsScenarioPatch(comp);
    for (const [k, v] of Object.entries(patch)) {
      updateInput(targetId, k as keyof typeof patch, v as never);
    }
    toast(`Loaded ${comp.code} into ${targetName ?? `Scenario ${target}`}`, "success");
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    );
  }

  if (comps.length < 2) {
    return (
      <div className="mx-auto max-w-[600px] px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">Compare needs at least 2 comps</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Pick comps from the index to compare. State doesn't persist across
          page refreshes; head back to make a new selection.
        </p>
        <Link
          href="/comps"
          className="mt-4 inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-[var(--color-accent)]"
        >
          <ArrowLeft className="size-4" /> Back to Comp Index
        </Link>
      </div>
    );
  }

  // Identify the "best" value per row so it gets a directional accent.
  const numericRows = buildNumericRows(comps, snapshots);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6">
      <header className="flex items-end justify-between gap-4 border-b pb-4">
        <div className="flex items-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/comps")}
            className="-ml-2"
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Compare
            </span>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              {comps.length} comp{comps.length === 1 ? "" : "s"} · NER recomputed live
            </span>
          </div>
        </div>
      </header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                <th className="px-3 py-2 w-44">Field</th>
                {comps.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <Link
                        href={`/comps/edit?id=${c.id}`}
                        className="font-semibold normal-case text-[var(--color-foreground)] hover:underline"
                      >
                        {c.code}
                      </Link>
                      <span className="font-normal normal-case text-[var(--color-muted-foreground)]">
                        {c.tenantName || c.dealName}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SectionRow label="Identification" colSpan={comps.length + 1} />
              <TextRow label="Deal name" comps={comps} get={(c) => c.dealName} />
              <TextRow label="Tenant" comps={comps} get={(c) => c.tenantName} />
              <TextRow label="Status" comps={comps} get={(c) => c.status} />
              <TextRow label="Signed" comps={comps} get={(c) => c.signedDate ?? "-"} />
              <TextRow label="Commencement" comps={comps} get={(c) => c.commencementDate} />

              <SectionRow label="Property" colSpan={comps.length + 1} />
              <TextRow label="Market" comps={comps} get={(c) => c.market ?? "-"} />
              <TextRow label="Submarket" comps={comps} get={(c) => c.submarket ?? "-"} />
              <TextRow label="Subtype" comps={comps} get={(c) => c.propertySubtype ?? "-"} />
              <TextRow label="Class" comps={comps} get={(c) => c.buildingClass ?? "-"} />

              <SectionRow label="Economics" colSpan={comps.length + 1} />
              {numericRows.map((row) => (
                <NumericRow key={row.label} row={row} comps={comps} />
              ))}

              <SectionRow label="Computed NER" colSpan={comps.length + 1} />
              <NumericRow
                row={buildNumericRow("Discounted NER ($/SF)", snapshots, (s) => s.discounted, "currency", "higher")}
                comps={comps}
              />
              <NumericRow
                row={buildNumericRow("Undiscounted NER ($/SF)", snapshots, (s) => s.undiscounted, "currency", "higher")}
                comps={comps}
              />
              <NumericRow
                row={buildNumericRow("Total Basis ($/SF)", snapshots, (s) => s.totalBasisPSF, "currency", "lower")}
                comps={comps}
              />
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
          Load into scenario:
        </span>
        {comps.map((c) => (
          <div key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
            <span className="font-medium">{c.code}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => loadInto(c, "A")}
            >
              → A
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => loadInto(c, "B")}
            >
              → B
            </Button>
            <Link
              href={`/comps/edit?id=${c.id}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-foreground)] hover:bg-[var(--color-accent)]"
              aria-label={`Edit ${c.code}`}
            >
              <Pencil className="size-3.5" />
            </Link>
          </div>
        ))}
      </div>

      <Toaster />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row primitives
// ---------------------------------------------------------------------------

function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className="border-t bg-[var(--color-muted)]/40">
      <td
        colSpan={colSpan}
        className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]"
      >
        {label}
      </td>
    </tr>
  );
}

function TextRow({
  label,
  comps,
  get,
}: {
  label: string;
  comps: Comp[];
  get: (c: Comp) => string;
}) {
  return (
    <tr className="border-t">
      <td className="px-3 py-1.5 text-[var(--color-muted-foreground)]">{label}</td>
      {comps.map((c) => (
        <td key={c.id} className="px-3 py-1.5 text-right">
          {get(c)}
        </td>
      ))}
    </tr>
  );
}

interface NumericRowDef {
  label: string;
  values: number[];
  format: "currency" | "percent" | "number" | "months";
  betterIs: "higher" | "lower";
}

function buildNumericRow<T>(
  label: string,
  source: T[],
  get: (s: T) => number,
  format: NumericRowDef["format"],
  betterIs: NumericRowDef["betterIs"],
): NumericRowDef {
  return { label, values: source.map(get), format, betterIs };
}

function buildNumericRows(comps: Comp[], snapshots: CompNERSnapshot[]): NumericRowDef[] {
  void snapshots;
  return [
    buildNumericRow("Lease SF", comps, (c) => c.leaseSF, "number", "higher"),
    buildNumericRow("Base rate ($/SF)", comps, (c) => c.baseRatePSF, "currency", "higher"),
    buildNumericRow("Escalation", comps, (c) => c.escalation, "percent", "higher"),
    buildNumericRow("Term (mo)", comps, (c) => c.leaseTermMonths, "months", "higher"),
    buildNumericRow("Free rent (mo)", comps, (c) => c.freeRentMonths, "months", "lower"),
    buildNumericRow("TI ($/SF)", comps, (c) => c.tiAllowancePSF, "currency", "lower"),
    buildNumericRow(
      "Combined LC",
      comps,
      (c) => c.lcLLRepPercent + c.lcTenantRepPercent,
      "percent",
      "lower",
    ),
  ];
}

function NumericRow({ row, comps }: { row: NumericRowDef; comps: Comp[] }) {
  const finite = row.values.filter((v) => Number.isFinite(v));
  // No accent when all values are equal — there's no winner to highlight.
  const allEqual = finite.length > 0 && finite.every((v) => v === finite[0]);
  const best = !allEqual && finite.length > 0
    ? row.betterIs === "higher"
      ? Math.max(...finite)
      : Math.min(...finite)
    : null;
  const worst = !allEqual && finite.length > 0
    ? row.betterIs === "higher"
      ? Math.min(...finite)
      : Math.max(...finite)
    : null;

  return (
    <tr className="border-t">
      <td className="px-3 py-1.5 text-[var(--color-muted-foreground)]">{row.label}</td>
      {comps.map((c, i) => {
        const v = row.values[i]!;
        const tone =
          v === best
            ? "text-[var(--color-success)] font-semibold"
            : v === worst
              ? "text-[var(--color-cost)]"
              : "";
        return (
          <td key={c.id} className={cn("px-3 py-1.5 text-right tabular-nums", tone)}>
            {formatValue(v, row.format)}
          </td>
        );
      })}
    </tr>
  );
}

function formatValue(v: number, fmt: NumericRowDef["format"]): string {
  if (!Number.isFinite(v)) return "-";
  switch (fmt) {
    case "currency":
      return fmtCurrency(v, 2);
    case "percent":
      return fmtPercent(v, 2);
    case "months":
      return `${fmtNumber(v, 0)} mo`;
    case "number":
    default:
      return fmtNumber(v, 0);
  }
}
