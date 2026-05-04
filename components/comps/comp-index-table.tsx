"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compAsScenarioPatch, type Comp } from "@/lib/comps";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Index table of saved comps. No filters/sort yet (Phase 2). Each row
 * has Edit / Delete / Load-to-A / Load-to-B actions.
 */
export function CompIndexTable() {
  const comps = useAppStore((s) => s.deals);
  const deleteComp = useAppStore((s) => s.deleteComp);
  const aId = useAppStore((s) => s.comparison.aId);
  const bId = useAppStore((s) => s.comparison.bId);
  const aName = useAppStore((s) => s.scenarios.find((sc) => sc.id === aId)?.inputs.name);
  const bName = useAppStore((s) => s.scenarios.find((sc) => sc.id === bId)?.inputs.name);
  const updateInput = useAppStore((s) => s.updateInput);

  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return comps;
    return comps.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.dealName.toLowerCase().includes(q) ||
        c.tenantName.toLowerCase().includes(q) ||
        (c.market ?? "").toLowerCase().includes(q) ||
        (c.submarket ?? "").toLowerCase().includes(q),
    );
  }, [comps, query]);

  const loadInto = (comp: Comp, target: "A" | "B") => {
    const targetId = target === "A" ? aId : bId;
    const targetName = target === "A" ? aName : bName;
    const patch = compAsScenarioPatch(comp);
    for (const [k, v] of Object.entries(patch)) {
      updateInput(targetId, k as keyof typeof patch, v as never);
    }
    toast(`Loaded ${comp.code} into ${targetName ?? `Scenario ${target}`}`, "success");
  };

  const remove = (comp: Comp) => {
    if (!window.confirm(`Delete comp "${comp.code}"? This can't be undone.`)) return;
    deleteComp(comp.id);
    toast(`Deleted ${comp.code}`, "info");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {filtered.length} of {comps.length} comp{comps.length === 1 ? "" : "s"}
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, deal, tenant, market…"
          className="h-9 w-72"
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-xs tabular-nums">
          <thead className="bg-[var(--color-muted)]">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Deal · Tenant</th>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Subtype</th>
              <th className="px-3 py-2 text-right">Lease SF</th>
              <th className="px-3 py-2 text-right">Base $/SF</th>
              <th className="px-3 py-2 text-right">Term</th>
              <th className="px-3 py-2 text-right">Free</th>
              <th className="px-3 py-2 text-right">TI $/SF</th>
              <th className="px-3 py-2 text-right">LC %</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t hover:bg-[var(--color-muted)]/40">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/comps/edit?id=${c.id}`} className="hover:underline">
                    {c.code}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.dealName}</div>
                  <div className="text-[var(--color-muted-foreground)]">{c.tenantName}</div>
                </td>
                <td className="px-3 py-2">
                  {c.market ? (
                    <>
                      <div>{c.market}</div>
                      {c.submarket && (
                        <div className="text-[var(--color-muted-foreground)]">{c.submarket}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-[var(--color-muted-foreground)]">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--color-muted-foreground)]">
                  {c.propertySubtype ? formatSubtype(c.propertySubtype) : "-"}
                </td>
                <td className="px-3 py-2 text-right">{fmtNumber(c.leaseSF)}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(c.baseRatePSF, 2)}</td>
                <td className="px-3 py-2 text-right">{c.leaseTermMonths} mo</td>
                <td className="px-3 py-2 text-right">{c.freeRentMonths} mo</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(c.tiAllowancePSF, 2)}</td>
                <td className="px-3 py-2 text-right">
                  {fmtPercent((c.lcLLRepPercent + c.lcTenantRepPercent) * 100, 2)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => loadInto(c, "A")}
                      aria-label={`Load ${c.code} into Scenario A`}
                    >
                      → A
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => loadInto(c, "B")}
                      aria-label={`Load ${c.code} into Scenario B`}
                    >
                      → B
                    </Button>
                    <Link
                      href={`/comps/edit?id=${c.id}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-accent)]"
                      aria-label={`Edit ${c.code}`}
                    >
                      <Pencil className="size-3.5" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                      onClick={() => remove(c)}
                      aria-label={`Delete ${c.code}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-[var(--color-muted-foreground)]">
                  No comps match "{query}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatSubtype(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/^./, (m) => m.toUpperCase());
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "EXECUTED"
      ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
      : status === "RENEWAL"
        ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
        : status === "PROPOSAL" || status === "LOI"
          ? "bg-[var(--color-cost)]/10 text-[var(--color-cost)]"
          : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", tone)}>
      {status}
    </span>
  );
}
