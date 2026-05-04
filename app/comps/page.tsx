"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Database, Download, GitCompare, Plus, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CompFilterSidebar } from "@/components/comps/comp-filter-sidebar";
import { CompIndexTable } from "@/components/comps/comp-index-table";
import { CompSummaryStats } from "@/components/comps/comp-summary";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/toaster";
import {
  computeCompSnapshot,
  compsToCsv,
  emptyFilters,
  filterComps,
  parseComps,
  sortComps,
  summarizeComps,
  type CompFilters,
  type CompSort,
} from "@/lib/comps";
import { useAppStore, useHasHydrated } from "@/lib/store";
import { toast } from "@/lib/toast";

export default function CompsIndex() {
  const hydrated = useHasHydrated();
  const router = useRouter();
  const comps = useAppStore((s) => s.deals);
  const globals = useAppStore((s) => s.globals);
  const setDeals = useAppStore((s) => s.setDeals);
  const setCompareIds = useAppStore((s) => s.setCompareIds);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState<CompFilters>(emptyFilters);
  const [sort, setSort] = useState<CompSort>({ key: "modifiedAt", dir: "desc" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const startCompare = () => {
    if (selectedIds.length < 2) return;
    setCompareIds(selectedIds);
    router.push("/comps/compare");
  };

  const filtered = useMemo(() => filterComps(comps, filters), [comps, filters]);
  const sorted = useMemo(() => sortComps(filtered, sort), [filtered, sort]);
  const summary = useMemo(() => summarizeComps(filtered), [filtered]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => toast("Couldn't read the file.", "error");
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = parseComps(text);
        if (parsed.length === 0) {
          toast("No deal rows found in the file.", "error");
          return;
        }
        setDeals([...comps, ...parsed]);
        toast(`Imported ${parsed.length} comp${parsed.length === 1 ? "" : "s"}`, "success");
      } catch (e) {
        toast(`CSV parse failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    };
    reader.readAsText(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const recomputeSnapshots = () => {
    if (comps.length === 0) return;
    const refreshed = comps.map((c) => ({
      ...c,
      ner: computeCompSnapshot(c, globals),
    }));
    setDeals(refreshed);
    toast(
      `Recomputed NER for ${refreshed.length} comp${refreshed.length === 1 ? "" : "s"}`,
      "success",
    );
  };

  const exportCsv = () => {
    if (sorted.length === 0) return;
    const csv = compsToCsv(sorted);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const date = new Date().toISOString().slice(0, 10);
    link.download = `comps-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast(`Exported ${sorted.length} comp${sorted.length === 1 ? "" : "s"}`, "success");
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    );
  }

  const exportDisabled = sorted.length === 0;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6 lg:h-screen lg:max-h-screen lg:overflow-hidden">
      <header className="flex items-end justify-between gap-4 border-b pb-4">
        <div className="flex items-end gap-6">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Comp Index
            </span>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              Standardized lease comp database · stays in this browser
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-accent)]"
          >
            <ArrowLeft className="size-4" /> Analyzer
          </Link>
          <ThemeToggle />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={recomputeSnapshots}
            disabled={comps.length === 0}
            title="Recompute every comp's NER against the current globals"
          >
            <RefreshCw className="size-4" /> Recompute NER
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={exportDisabled}
            title={exportDisabled ? "No comps to export" : "Export the filtered list to CSV"}
          >
            <Download className="size-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" /> Import CSV
          </Button>
          <Link
            href="/comps/new"
            className="inline-flex h-9 items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary)]/90"
          >
            <Plus className="size-4" /> New comp
          </Link>
        </div>
      </header>

      {comps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 bg-[var(--color-muted)]/30 p-12 text-center">
            <div className="rounded-full bg-[var(--color-muted)] p-3 text-[var(--color-muted-foreground)]">
              <Database className="size-6" />
            </div>
            <div className="text-base font-medium">No comps yet</div>
            <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
              Add a comp by hand using the standardized intake form, or
              import an existing UW assumptions CSV. Comps live in this
              browser's local storage — never sent to a server.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <Link
                href="/comps/new"
                className="inline-flex h-9 items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary)]/90"
              >
                <Plus className="size-4" /> Add your first comp
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-4" /> Import CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[280px,1fr]">
          <CompFilterSidebar comps={comps} filters={filters} onChange={setFilters} />
          <div className="flex flex-col gap-4 lg:min-h-0">
            <CompSummaryStats summary={summary} total={comps.length} />
            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-3 py-2 text-xs">
                <span>
                  <span className="font-semibold tabular-nums">{selectedIds.length}</span>
                  <span className="text-[var(--color-muted-foreground)]"> selected</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setSelectedIds([])}
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={startCompare}
                    disabled={selectedIds.length < 2}
                    title={selectedIds.length < 2 ? "Pick at least 2 comps" : undefined}
                  >
                    <GitCompare className="size-4" /> Compare ({selectedIds.length})
                  </Button>
                </div>
              </div>
            )}
            <CompIndexTable
              comps={sorted}
              sort={sort}
              onSortChange={setSort}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          </div>
        </div>
      )}

      <Toaster />
    </div>
  );
}
