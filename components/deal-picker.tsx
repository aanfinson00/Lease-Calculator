"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dealAsScenarioPatch, dealLCSplit, parseDeals, type Deal } from "@/lib/deals";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Searchable popover for picking an uploaded deal CSV. The user uploads a
 * CSV from their machine (FileReader → parseDeals → store.setDeals); deals
 * persist in this browser's localStorage and are never sent to the server.
 *
 * States:
 *   - empty (no deals loaded) → upload prompt
 *   - loaded → search input + filtered list, with replace/clear footer
 *
 * Selecting a deal writes the patch onto the target scenario and updates
 * globals.lc{LL,Tenant}RepPercent with a 50/50 split of the deal's LC%.
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
  const [parseError, setParseError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deals = useAppStore((s) => s.deals);
  const setDeals = useAppStore((s) => s.setDeals);
  const clearDeals = useAppStore((s) => s.clearDeals);
  const updateInput = useAppStore((s) => s.updateInput);
  const updateGlobals = useAppStore((s) => s.updateGlobals);

  // Focus search on open (only when deals are already loaded).
  useEffect(() => {
    if (open && deals.length > 0) inputRef.current?.focus();
  }, [open, deals.length]);

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

  const handleFile = (file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onerror = () => setParseError("Couldn't read the file.");
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = parseDeals(text);
        if (parsed.length === 0) {
          setParseError("No deal rows found in the file.");
          return;
        }
        setDeals(parsed);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
      }
    };
    reader.readAsText(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
    // Reset the file input so re-uploading the same file fires onChange again.
    e.target.value = "";
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

      {/* Hidden file input — opened programmatically from the upload buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onFileChange}
      />

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
          {deals.length === 0 ? (
            <UploadPrompt
              onClick={() => fileInputRef.current?.click()}
              error={parseError}
            />
          ) : (
            <>
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

              {parseError && (
                <div className="px-2 py-2 text-xs text-[var(--color-destructive)]">
                  {parseError}
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="px-2 py-3 text-xs text-[var(--color-muted-foreground)]">
                  No deals match "{query}".
                </div>
              ) : (
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

              <div className="mt-1 flex items-center justify-between border-t px-2 pt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                <span>↑↓ navigate · ⏎ select · esc close</span>
                <span className="flex items-center gap-2">
                  <span>{deals.length} loaded</span>
                  <button
                    type="button"
                    className="font-medium text-[var(--color-primary)] hover:underline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="font-medium text-[var(--color-destructive)] hover:underline"
                    onClick={() => {
                      clearDeals();
                      setQuery("");
                      setParseError(null);
                    }}
                  >
                    Clear
                  </button>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- subcomponents ----------

function UploadPrompt({ onClick, error }: { onClick: () => void; error: string | null }) {
  return (
    <div className="flex flex-col items-stretch gap-2 px-2 py-3 text-sm">
      <div className="flex flex-col items-center gap-1.5 py-3">
        <div className="rounded-full bg-[var(--color-muted)] p-2 text-[var(--color-muted-foreground)]">
          <Upload className="size-5" />
        </div>
        <div className="font-medium">Upload deals CSV</div>
        <p className="px-4 text-center text-[11px] text-[var(--color-muted-foreground)]">
          Stays in this browser's local storage. Never uploaded to a server,
          never committed to the repo.
        </p>
      </div>
      <Button onClick={onClick} className="mx-auto" size="sm">
        <Upload /> Choose file…
      </Button>
      {error && (
        <div className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-2 py-1.5 text-xs text-[var(--color-destructive)]">
          {error}
        </div>
      )}
      <p className="px-1 text-center text-[10px] text-[var(--color-muted-foreground)]">
        Required columns: Code · Deal Name · Tenant Name · Project SF · Building SF · Lease SF · Trended Rent · Rent Escalations · Lease Term · Start Month (Date) · Free Rent (months) · TIs · LCs · LC Override · Status
      </p>
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
