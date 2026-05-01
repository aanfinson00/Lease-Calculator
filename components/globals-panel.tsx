"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppStore } from "@/lib/store";
import type { LCStructure } from "@/lib/types";

/**
 * Inputs that are SHARED across scenarios — they live on the Globals slice.
 * Putting them in their own panel makes it visually clear that changing
 * the discount rate (or shell cost) affects every scenario at once.
 */
export function GlobalsPanel() {
  const globals = useAppStore((s) => s.globals);
  const update = useAppStore((s) => s.updateGlobals);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Globals · shared across scenarios</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Building Shell Cost ($/SF)">
          <Input
            type="number"
            step={0.01}
            value={globals.shellCostPSF}
            onChange={(e) => update({ shellCostPSF: Number(e.target.value) })}
          />
        </Field>
        <Field label="Discount Rate (%)">
          <Input
            type="number"
            step={0.1}
            value={(globals.discountRate * 100).toFixed(2)}
            onChange={(e) => update({ discountRate: Number(e.target.value) / 100 })}
          />
        </Field>
        <Field label="LC Rate (%)">
          <Input
            type="number"
            step={0.1}
            value={(globals.lcPercent * 100).toFixed(2)}
            onChange={(e) => update({ lcPercent: Number(e.target.value) / 100 })}
          />
        </Field>
        <Field label="LC Payment Structure">
          <RadioGroup
            value={globals.lcStructure}
            onValueChange={(v) => update({ lcStructure: v as LCStructure })}
            className="flex gap-4 pt-2"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="split50" /> 50/50 split
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="upfront" /> 100% upfront
            </label>
          </RadioGroup>
        </Field>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </Label>
      {children}
    </div>
  );
}
