"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadDeals, dealAsScenarioPatch, dealLCSplit, type Deal } from "@/lib/deals";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Searchable popover for picking a deal from public/deals.csv. Click the
 * trigger to open; type to filter across code / deal name / tenant name.
 * Arrow keys + Enter to select. Selection writes the deal's fields onto
 * the target scenario and updates globals.lc{LL,Tenant}RepPercent with a
 * 50/50 split of the deal's LC% (Override > 0 wins over LCs).
 */
interface Props {
  scenarioId: string;
  /** Visual variant of the trigger button. Default is a small icon button. */
  variant?: "icon" | "text";
  /** Where the popover opens relative to the trigger. */
  align?: "left" | "right";
  /** Override the trigger's title attribute. */
  title?: string;
}

export function DealPicker({
  scenarioId,
  variant = "icon",
  align = "left",
  title = "Load from deal CSV",
}: Props) {
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const updateInput = useAppStore((s) => s.updateInput);
  const updateGlobals = useAppStore((s) => s.updateGlobals);

  // Lazy-load the CSV the first time the picker opens — saves a fetch on
  // initial page load if the user never opens the picker.
  useEffect(() => {
    if (!open || deals.length > 0) return;
    let cancelled = false;
    loadDeals()
      .then((d) => {
        if (!cancelled) setDeals(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, deals.length]);

  // Focus the search input on open.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.code.toLowerCase().includes(q) ||
        d.dealName.toLowerCase().includes(q) ||
        d.tenantName.toLowerCase().includes(q),
    );
  }, [deals, query]);

  // Keep activeIndex in range as the filter changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const apply = (deal: Deal) => {
    const patch = dealAsScenarioPatch(deal);
    for (const [k, v] of Object.entries(patch)) {
      updateInput(scenarioId, k as keyof typeof patch, v as never);
    }
    updateGlobals(dealLCSplit(deal));
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const deal = filtered[activeIndex];
      if (deal) apply(deal);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const triggerClassName =
    variant === "icon"
      ? "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-accent)] [&_svg]:size-4"
      : "text-[11px] font-medium text-[var(--color-primary)] underline-offset-2 hover:underline";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-label={title}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {variant === "icon" ? <Database /> : "Load deal…"}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={cn(
            "absolute top-full z-30 mt-1 w-[420px] rounded-md border bg-[var(--color-card)] p-2 shadow-md",
            align === "right" ? "right-0" : "left-0",
          )}
          role="dialog"
          aria-label="Pick a deal to load"
        >
          <div className="flex items-center gap-1 rounded-md border px-2">
            <Search className="size-4 text-[var(--color-muted-foreground)]" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search code, deal, or tenant…"
              className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <X />
              </Button>
            )}
          </div>

          {error && (
            <div className="px-2 py-3 text-xs text-[var(--color-destructive)]">{error}</div>
          )}

          {!error && deals.length === 0 && (
            <div className="px-2 py-3 text-xs text-[var(--color-muted-foreground)]">Loading…</div>
          )}

          {!error && deals.length > 0 && filtered.length === 0 && (
            <div className="px-2 py-3 text-xs text-[var(--color-muted-foreground)]">
              No deals match "{query}".
            </div>
          )}

          {filtered.length > 0 && (
            <ul className="mt-1 max-h-72 overflow-y-auto" role="listbox">
              {filtered.map((d, i) => (
                <li
                  key={d.code}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm",
                    i === activeIndex
                      ? "bg-[var(--color-accent)]"
                      : "hover:bg-[var(--color-muted)]",
                  )}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => apply(d)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{d.code}</span>
                    <StatusChip status={d.status} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
                    <span className="truncate">
                      {d.dealName} · {d.tenantName}
                    </span>
                    <span className="tabular-nums whitespace-nowrap">
                      {d.leaseSF.toLocaleString("en-US")} SF
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 border-t px-2 pt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
            ↑↓ navigate · ⏎ select · esc close
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  if (!status) return null;
  const tone =
    status === "LEASE"
      ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
      : status === "RENEWAL"
        ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
        : status === "SPEC"
          ? "bg-[var(--color-cost)]/10 text-[var(--color-cost)]"
          : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", tone)}>
      {status}
    </span>
  );
}
