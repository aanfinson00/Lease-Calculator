"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ScenarioBar() {
  const scenarios = useAppStore((s) => s.scenarios);
  const comparison = useAppStore((s) => s.comparison);
  const addScenario = useAppStore((s) => s.addScenario);
  const renameScenario = useAppStore((s) => s.renameScenario);
  const duplicateScenario = useAppStore((s) => s.duplicateScenario);
  const deleteScenario = useAppStore((s) => s.deleteScenario);
  const setComparisonA = useAppStore((s) => s.setComparisonA);
  const setComparisonB = useAppStore((s) => s.setComparisonB);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
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
          return (
            <div
              key={sc.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm",
                (isA || isB) && "border-[var(--color-primary)] bg-[var(--color-accent)]",
              )}
            >
              <Input
                value={sc.inputs.name}
                onChange={(e) => renameScenario(sc.id, e.target.value)}
                className="h-7 w-32 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={isA ? "default" : "ghost"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setComparisonA(sc.id)}
                >
                  A
                </Button>
                <Button
                  size="sm"
                  variant={isB ? "default" : "ghost"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setComparisonB(sc.id)}
                >
                  B
                </Button>
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
                  className="h-7 w-7 text-[var(--color-destructive)]"
                  onClick={() => deleteScenario(sc.id)}
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

export function PropertyHeader() {
  const propertyName = useAppStore((s) => s.property.name);
  const setPropertyName = useAppStore((s) => s.setPropertyName);
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="property-name" className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        Property
      </Label>
      <Input
        id="property-name"
        value={propertyName}
        onChange={(e) => setPropertyName(e.target.value)}
        placeholder="Property name"
        className="h-10 text-lg font-semibold"
      />
    </div>
  );
}
