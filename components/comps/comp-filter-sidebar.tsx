"use client";

import { useMemo } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUILDING_CLASSES,
  LEASE_STATUSES,
  PROPERTY_SUBTYPES,
  emptyFilters,
  hasActiveFilters,
  type BuildingClass,
  type Comp,
  type CompFilters,
  type LeaseStatus,
  type PropertySubtype,
} from "@/lib/comps";
import { cn } from "@/lib/utils";

interface Props {
  comps: Comp[];                  // full unfiltered list, used to source the market dropdown
  filters: CompFilters;
  onChange: (next: CompFilters) => void;
}

export function CompFilterSidebar({ comps, filters, onChange }: Props) {
  const markets = useMemo(() => {
    const set = new Set<string>();
    for (const c of comps) if (c.market) set.add(c.market);
    return Array.from(set).sort();
  }, [comps]);

  const active = hasActiveFilters(filters);

  return (
    <aside className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:rounded-md lg:border lg:bg-[var(--color-card)] lg:p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          Filter
        </h2>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => onChange(emptyFilters())}
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 rounded-md border px-2">
        <Search className="size-4 text-[var(--color-muted-foreground)]" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search…"
          className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
        {filters.search && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Clear search"
            onClick={() => onChange({ ...filters, search: "" })}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <Section label="Status">
        <ChipRow<LeaseStatus>
          options={LEASE_STATUSES}
          selected={filters.statuses}
          onChange={(statuses) => onChange({ ...filters, statuses })}
        />
      </Section>

      <Section label="Subtype">
        <ChipRow<PropertySubtype>
          options={PROPERTY_SUBTYPES}
          selected={filters.subtypes}
          onChange={(subtypes) => onChange({ ...filters, subtypes })}
        />
      </Section>

      <Section label="Class">
        <ChipRow<BuildingClass>
          options={BUILDING_CLASSES}
          selected={filters.classes}
          onChange={(classes) => onChange({ ...filters, classes })}
        />
      </Section>

      {markets.length > 0 && (
        <Section label="Market">
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto pr-1">
            {markets.map((m) => {
              const checked = filters.markets.includes(m);
              return (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? filters.markets.filter((x) => x !== m)
                        : [...filters.markets, m];
                      onChange({ ...filters, markets: next });
                    }}
                    className="size-3.5 accent-[var(--color-primary)]"
                  />
                  <span className="truncate">{m}</span>
                </label>
              );
            })}
          </div>
        </Section>
      )}

      <Section label="Lease term (mo)">
        <RangeInputs
          min={filters.termMonths.min}
          max={filters.termMonths.max}
          onChange={(min, max) => onChange({ ...filters, termMonths: { min, max } })}
        />
      </Section>

      <Section label="Base rate ($/SF)">
        <RangeInputs
          min={filters.baseRatePSF.min}
          max={filters.baseRatePSF.max}
          step="0.01"
          onChange={(min, max) => onChange({ ...filters, baseRatePSF: { min, max } })}
        />
      </Section>

      <Section label="Lease SF">
        <RangeInputs
          min={filters.leaseSF.min}
          max={filters.leaseSF.max}
          onChange={(min, max) => onChange({ ...filters, leaseSF: { min, max } })}
        />
      </Section>
    </aside>
  );
}

// --- helpers ---------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ChipRow<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const isOn = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              const next = isOn
                ? selected.filter((x) => x !== o.value)
                : [...selected, o.value];
              onChange(next);
            }}
            aria-pressed={isOn}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              isOn
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RangeInputs({
  min,
  max,
  step = "1",
  onChange,
}: {
  min: number | undefined;
  max: number | undefined;
  step?: string;
  onChange: (min: number | undefined, max: number | undefined) => void;
}) {
  const parse = (s: string): number | undefined => {
    if (s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Input
        type="number"
        step={step}
        value={min ?? ""}
        onChange={(e) => onChange(parse(e.target.value), max)}
        placeholder="Min"
        className="h-8 text-xs"
      />
      <Input
        type="number"
        step={step}
        value={max ?? ""}
        onChange={(e) => onChange(min, parse(e.target.value))}
        placeholder="Max"
        className="h-8 text-xs"
      />
    </div>
  );
}
