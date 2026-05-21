"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Check, ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { DealPicker } from "@/components/deal-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { scenarioToComp } from "@/lib/comps";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function ScenarioBar() {
  const router = useRouter();
  const scenarios = useAppStore((s) => s.scenarios);
  const comparison = useAppStore((s) => s.comparison);
  const globals = useAppStore((s) => s.globals);
  const addScenario = useAppStore((s) => s.addScenario);
  const renameScenario = useAppStore((s) => s.renameScenario);
  const duplicateScenario = useAppStore((s) => s.duplicateScenario);
  const deleteScenario = useAppStore((s) => s.deleteScenario);
  const setComparisonA = useAppStore((s) => s.setComparisonA);
  const setComparisonB = useAppStore((s) => s.setComparisonB);
  const setCompDraft = useAppStore((s) => s.setCompDraft);

  const saveAsComp = (scenarioId: string) => {
    const sc = scenarios.find((s) => s.id === scenarioId);
    if (!sc) return;
    setCompDraft(scenarioToComp(sc.inputs, globals));
    toast(`Drafting comp from "${sc.inputs.name}"`, "info");
    router.push("/comps/new");
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          Scenarios
        </h2>
        <Button size="sm" variant="outline" onClick={() => addScenario("Scenario")}>
          <Plus /> Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {scenarios.map((sc) => {
          const isA = comparison.aId === sc.id;
          const isB = comparison.bId === sc.id;
          const active = isA || isB;
          return (
            <div
              key={sc.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors",
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-card)]",
              )}
            >
              <Input
                value={sc.inputs.name}
                onChange={(e) => renameScenario(sc.id, e.target.value)}
                aria-label={`Scenario name: ${sc.inputs.name}`}
                className="h-7 w-32 border-0 bg-transparent px-1 font-medium shadow-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/60"
              />
              <div className="flex items-center gap-0.5">
                <Button
                  size="sm"
                  variant={isA ? "default" : "ghost"}
                  className="h-7 px-2 text-xs font-semibold"
                  onClick={() => setComparisonA(sc.id)}
                  aria-label={`Use ${sc.inputs.name} as Scenario A`}
                  aria-pressed={isA}
                >
                  A
                </Button>
                <Button
                  size="sm"
                  variant={isB ? "default" : "ghost"}
                  className="h-7 px-2 text-xs font-semibold"
                  onClick={() => setComparisonB(sc.id)}
                  aria-label={`Use ${sc.inputs.name} as Scenario B`}
                  aria-pressed={isB}
                >
                  B
                </Button>
                <DealPicker scenarioId={sc.id} align="right" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => duplicateScenario(sc.id)}
                  aria-label="Duplicate"
                >
                  <Copy />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => saveAsComp(sc.id)}
                  aria-label={`Save ${sc.inputs.name} as a comp`}
                  title="Save as comp"
                >
                  <BookmarkPlus />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  onClick={() => {
                    if (window.confirm(`Delete scenario "${sc.inputs.name}"? This can't be undone.`)) {
                      deleteScenario(sc.id);
                    }
                  }}
                  aria-label="Delete"
                  disabled={scenarios.length <= 1}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Property header — editable name for the active property and a tiny
 * popover switcher for picking between properties in the registry or
 * adding a new one. Comps can be tagged to properties via the comps
 * intake form, so renaming/adding here is foundational to that flow.
 */
export function PropertyHeader() {
  const properties = useAppStore((s) => s.properties);
  const activeId = useAppStore((s) => s.activePropertyId);
  const updateProperty = useAppStore((s) => s.updateProperty);
  const setActive = useAppStore((s) => s.setActivePropertyId);
  const addProperty = useAppStore((s) => s.addProperty);
  const removeProperty = useAppStore((s) => s.removeProperty);

  const active = properties.find((p) => p.id === activeId) ?? properties[0];

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative flex flex-col gap-0.5">
      <Label
        htmlFor="property-name"
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]"
      >
        Property
      </Label>
      <div className="flex items-center gap-1">
        <Input
          id="property-name"
          value={active?.name ?? ""}
          onChange={(e) => active && updateProperty(active.id, { name: e.target.value })}
          placeholder="Untitled property"
          className="h-9 border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/60"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Switch property"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-popover)] p-1 text-sm shadow-md">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActive(p.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--color-accent)]"
            >
              <span className="truncate">{p.name || "Untitled property"}</span>
              {p.id === active?.id && <Check className="size-4 text-[var(--color-primary)]" />}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            onClick={() => {
              addProperty();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--color-accent)]"
          >
            <Plus className="size-4" />
            <span>Add property</span>
          </button>
          {properties.length > 1 && active && (
            <button
              type="button"
              onClick={() => {
                removeProperty(active.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[var(--color-destructive)] hover:bg-[var(--color-accent)]"
            >
              <Trash2 className="size-4" />
              <span>Remove “{active.name || "Untitled property"}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
