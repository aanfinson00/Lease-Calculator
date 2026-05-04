"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compAsScenarioPatch, type Comp, type CompSort, type CompSortKey } from "@/lib/comps";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Props {
  comps: Comp[];
  sort: CompSort;
  onSortChange: (s: CompSort) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

/**
 * Sortable browse table. Filtering + state live in the parent page so
 * the sidebar can drive the same list through pure helpers. Selection
 * (for multi-comp compare) is also lifted to the parent.
 */
export function CompIndexTable({
  comps,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
}: Props) {
  const deleteComp = useAppStore((s) => s.deleteComp);
  const aId = useAppStore((s) => s.comparison.aId);
  const bId = useAppStore((s) => s.comparison.bId);
  const aName = useAppStore((s) => s.scenarios.find((sc) => sc.id === aId)?.inputs.name);
  const bName = useAppStore((s) => s.scenarios.find((sc) => sc.id === bId)?.inputs.name);
  const updateInput = useAppStore((s) => s.updateInput);

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

  const visibleIds = comps.map((c) => c.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someSelected = !allSelected && visibleIds.some((id) => selectedIds.includes(id));
  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(selectedIds.filter((id) => !visibleIds.includes(id)));
    } else {
      const set = new Set(selectedIds);
      for (const id of visibleIds) set.add(id);
      onSelectionChange(Array.from(set));
    }
  };
  const toggleOne = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  };

  return (
    <div className="overflow-auto rounded-md border lg:min-h-0 lg:flex-1">
      <table className="min-w-full text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-[var(--color-muted)] shadow-[0_1px_0_var(--color-border)]">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            <th className="px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all visible comps"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                className="size-3.5 accent-[var(--color-primary)]"
              />
            </th>
            <SortHeader label="Code" k="code" sort={sort} onSortChange={onSortChange} />
            <SortHeader label="Deal · Tenant" k="dealName" sort={sort} onSortChange={onSortChange} />
            <SortHeader label="Market" k="market" sort={sort} onSortChange={onSortChange} />
            <SortHeader label="Subtype" k="propertySubtype" sort={sort} onSortChange={onSortChange} />
            <SortHeader label="Lease SF" k="leaseSF" sort={sort} onSortChange={onSortChange} align="right" />
            <SortHeader label="Base $/SF" k="baseRatePSF" sort={sort} onSortChange={onSortChange} align="right" />
            <SortHeader label="Term" k="leaseTermMonths" sort={sort} onSortChange={onSortChange} align="right" />
            <SortHeader label="Free" k="freeRentMonths" sort={sort} onSortChange={onSortChange} align="right" />
            <SortHeader label="TI $/SF" k="tiAllowancePSF" sort={sort} onSortChange={onSortChange} align="right" />
            <SortHeader label="LC %" k="combinedLC" sort={sort} onSortChange={onSortChange} align="right" />
            <SortHeader label="Status" k="status" sort={sort} onSortChange={onSortChange} />
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {comps.map((c) => (
            <tr key={c.id} className="border-t hover:bg-[var(--color-muted)]/40">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${c.code} for comparison`}
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggleOne(c.id)}
                  className="size-3.5 accent-[var(--color-primary)]"
                />
              </td>
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
                {fmtPercent(c.lcLLRepPercent + c.lcTenantRepPercent, 2)}
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
          {comps.length === 0 && (
            <tr>
              <td colSpan={13} className="px-3 py-6 text-center text-[var(--color-muted-foreground)]">
                No comps match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface SortHeaderProps {
  label: string;
  k: CompSortKey;
  sort: CompSort;
  onSortChange: (s: CompSort) => void;
  align?: "left" | "right";
}

function SortHeader({ label, k, sort, onSortChange, align = "left" }: SortHeaderProps) {
  const active = sort.key === k;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : null;
  const onClick = () => {
    if (active) {
      onSortChange({ key: k, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      // Numeric / date columns default to descending (most useful first);
      // text columns default to ascending.
      const numericKeys: CompSortKey[] = [
        "leaseSF",
        "baseRatePSF",
        "leaseTermMonths",
        "freeRentMonths",
        "tiAllowancePSF",
        "combinedLC",
        "modifiedAt",
      ];
      onSortChange({ key: k, dir: numericKeys.includes(k) ? "desc" : "asc" });
    }
  };
  return (
    <th
      className={cn(
        "px-3 py-2",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-[var(--color-foreground)]",
          active && "text-[var(--color-foreground)]",
        )}
      >
        {label}
        {Icon && <Icon className="size-3" aria-hidden />}
      </button>
    </th>
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
