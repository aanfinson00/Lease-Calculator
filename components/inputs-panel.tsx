"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import type { ScenarioInputs } from "@/lib/types";

/**
 * Two-column inputs panel — Scenario A on the left, Scenario B on the right.
 * Each row renders the same field for both scenarios so it's easy to scan
 * for differences.
 */
export function InputsPanel() {
  const aId = useAppStore((s) => s.comparison.aId);
  const bId = useAppStore((s) => s.comparison.bId);
  const a = useAppStore((s) => s.scenarios.find((sc) => sc.id === aId));
  const b = useAppStore((s) => s.scenarios.find((sc) => sc.id === bId));

  if (!a || !b) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-[var(--color-muted-foreground)]">
          Select two scenarios from the bar above to compare.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Inputs
        </CardTitle>
        <div className="grid grid-cols-[1fr,1fr,1fr] gap-4 pt-2 text-sm font-semibold">
          <div className="text-[var(--color-muted-foreground)]">Field</div>
          <div>{a.inputs.name}</div>
          <div>{b.inputs.name}</div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <Section title="Square Footage">
          <Row label="Project SF" field="projectSF" a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
          <Row label="Building SF" field="buildingSF" a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
          <Row label="Lease SF" field="proposedLeaseSF" a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
        </Section>
        <Section title="Rent">
          <Row label="Base Rate ($/SF/yr)" field="baseRatePSF" step={0.01} a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
          <Row label="Annual Escalation (%)" field="escalation" step={0.1} percent a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
        </Section>
        <Section title="Concessions">
          <Row label="TI Allowance ($/SF)" field="tiAllowancePSF" step={0.5} a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
          <Row label="Free Rent (months)" field="freeRentMonths" step={1} a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
        </Section>
        <Section title="Term">
          <Row label="Lease Term (months)" field="leaseTermMonths" step={1} a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
          <Row label="Lease Commencement" field="leaseCommencement" type="date" a={a.inputs} b={b.inputs} aId={aId} bId={bId} />
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

interface RowProps {
  label: string;
  field: keyof ScenarioInputs;
  a: ScenarioInputs;
  b: ScenarioInputs;
  aId: string;
  bId: string;
  step?: number;
  type?: "number" | "date" | "text";
  /** Treat the value as a fraction in storage but render as a percent. */
  percent?: boolean;
}

function Row({ label, field, a, b, aId, bId, step = 1, type = "number", percent = false }: RowProps) {
  const updateInput = useAppStore((s) => s.updateInput);

  const renderValue = (inputs: ScenarioInputs): string => {
    const raw = inputs[field];
    if (percent && typeof raw === "number") return (raw * 100).toFixed(2);
    if (typeof raw === "number") return String(raw);
    return String(raw);
  };

  const handleChange = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (type === "date" || (typeof a[field] === "string" && !percent)) {
      updateInput(id, field as keyof ScenarioInputs, raw as never);
      return;
    }
    const num = Number(raw);
    const stored = percent ? num / 100 : num;
    updateInput(id, field as keyof ScenarioInputs, stored as never);
  };

  return (
    <div className="grid grid-cols-[1fr,1fr,1fr] items-center gap-4">
      <Label className="text-sm text-[var(--color-muted-foreground)]">{label}</Label>
      <Input type={type} step={step} value={renderValue(a)} onChange={handleChange(aId)} />
      <Input type={type} step={step} value={renderValue(b)} onChange={handleChange(bId)} />
    </div>
  );
}
