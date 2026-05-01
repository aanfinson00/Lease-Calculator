"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppStore } from "@/lib/store";
import type { ScenarioInputs } from "@/lib/types";

interface FieldDef {
  /** Required for editable fields; omitted for derived (computed) fields. */
  field?: keyof ScenarioInputs;
  label: string;
  step?: number;
  type?: "number" | "date" | "text";
  /** Stored as a fraction (0.03), rendered as a percent (3.00). */
  percent?: boolean;
  /** Optional fields render empty when undefined and clearing → undefined. */
  optional?: boolean;
  /** When set, the cell renders as a read-only computed value. */
  compute?: (inputs: ScenarioInputs) => number;
  /** How to render the computed value. */
  computeFormat?: "percent" | "currency" | "number";
  /** When set, the cell renders a horizontal radio group with these options. */
  radio?: { value: string; label: string }[];
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: "Square Footage",
    fields: [
      { field: "projectSF", label: "Project SF" },
      { field: "buildingSF", label: "Building SF" },
      { field: "proposedLeaseSF", label: "Lease SF" },
    ],
  },
  {
    title: "Rent",
    fields: [
      { field: "baseRatePSF", label: "Base Rate ($/SF)", step: 0.01 },
      { field: "escalation", label: "Escalation (%)", step: 0.1, percent: true },
    ],
  },
  {
    title: "Concessions",
    fields: [
      { field: "tiAllowancePSF", label: "TI Allowance ($/SF)", step: 0.5 },
      { field: "tiDurationMonths", label: "TI Duration (mo)", step: 1 },
      { field: "freeRentMonths", label: "Free Rent (mo)", step: 1 },
      { field: "freeRentStartMonth", label: "Free Rent Start (mo from commencement)", step: 1, optional: true },
    ],
  },
  {
    title: "Leasing Commissions",
    fields: [
      { field: "lcLLRepPercent", label: "Landlord Rep (%)", step: 0.01, percent: true },
      { field: "lcTenantRepPercent", label: "Tenant Rep (%)", step: 0.01, percent: true },
      {
        label: "Combined (%)",
        compute: (i) => (i.lcLLRepPercent + i.lcTenantRepPercent) * 100,
        computeFormat: "percent",
      },
      {
        field: "lcCalculation",
        label: "Calc",
        radio: [
          { value: "tiered", label: "Tiered" },
          { value: "flat", label: "Flat" },
        ],
      },
      {
        field: "lcStructure",
        label: "Payment",
        radio: [
          { value: "split50", label: "50/50" },
          { value: "upfront", label: "Upfront" },
        ],
      },
    ],
  },
  {
    title: "Term",
    fields: [
      { field: "leaseTermMonths", label: "Term (mo)", step: 1 },
      { field: "leaseExecutionDate", label: "Execution", type: "date" },
      { field: "leaseCommencement", label: "Commencement", type: "date" },
    ],
  },
];

/**
 * Inputs panel — Deal Assumptions strip at top (shared across scenarios),
 * then a section grid for per-scenario inputs (fields run across as columns,
 * scenarios run down as rows). Spreadsheet-y: read a column to compare
 * scenarios on one field; read a row to see one scenario's section.
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

  const scenarios = [
    { id: aId, name: a.inputs.name, inputs: a.inputs },
    { id: bId, name: b.inputs.name, inputs: b.inputs },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inputs</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <DealAssumptions />
        {SECTIONS.map((section) => (
          <Section key={section.title} section={section} scenarios={scenarios} />
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Deal Assumptions (shared globals: shell cost, discount, LC settings)
// ---------------------------------------------------------------------------

function DealAssumptions() {
  const globals = useAppStore((s) => s.globals);
  const update = useAppStore((s) => s.updateGlobals);

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        Deal Assumptions · shared
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stack label="Shell ($/SF)">
          <Input
            type="number"
            step={0.01}
            className="h-8 px-2 text-sm"
            value={globals.shellCostPSF}
            onChange={(e) => update({ shellCostPSF: Number(e.target.value) })}
          />
        </Stack>
        <Stack label="Discount (%)">
          <Input
            type="number"
            step={0.1}
            className="h-8 px-2 text-sm"
            value={(globals.discountRate * 100).toFixed(2)}
            onChange={(e) => update({ discountRate: Number(e.target.value) / 100 })}
          />
        </Stack>
      </div>
    </div>
  );
}

function Stack({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-[var(--color-muted-foreground)]">{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-scenario sections
// ---------------------------------------------------------------------------

interface SectionProps {
  section: SectionDef;
  scenarios: Array<{ id: string; name: string; inputs: ScenarioInputs }>;
}

function Section({ section, scenarios }: SectionProps) {
  // 1 label column + N field columns. Inline style because Tailwind can't
  // produce a class for an arbitrary repeat count at build time.
  const cols = section.fields.length;
  const gridStyle = { gridTemplateColumns: `7.5rem repeat(${cols}, minmax(0, 1fr))` };

  return (
    <div className="flex flex-col gap-1.5 py-3 last:pb-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        {section.title}
      </div>

      {/* Header row — field labels */}
      <div className="grid items-end gap-2" style={gridStyle}>
        <div />
        {section.fields.map((f, idx) => (
          <div
            key={fieldKey(f, idx)}
            className="text-[11px] text-[var(--color-muted-foreground)]"
          >
            {f.label}
          </div>
        ))}
      </div>

      {/* One row per scenario */}
      {scenarios.map((sc) => (
        <div key={sc.id} className="grid items-center gap-2" style={gridStyle}>
          <div className="truncate text-sm font-medium" title={sc.name}>
            {sc.name}
          </div>
          {section.fields.map((f, idx) => (
            <Cell
              key={fieldKey(f, idx)}
              field={f}
              scenarioId={sc.id}
              inputs={sc.inputs}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function fieldKey(f: FieldDef, idx: number): string {
  return f.field ? (f.field as string) : `derived-${idx}-${f.label}`;
}

interface CellProps {
  field: FieldDef;
  scenarioId: string;
  inputs: ScenarioInputs;
}

function Cell({ field, scenarioId, inputs }: CellProps) {
  const updateInput = useAppStore((s) => s.updateInput);

  // Derived/read-only cell — computed from current inputs, can't be edited.
  if (field.compute) {
    const v = field.compute(inputs);
    let text: string;
    if (field.computeFormat === "percent") {
      text = `${v.toFixed(2)}%`;
    } else if (field.computeFormat === "currency") {
      text = `$${v.toFixed(2)}`;
    } else {
      text = String(v);
    }
    return (
      <div className="flex h-8 items-center px-2 text-sm tabular-nums text-[var(--color-muted-foreground)]">
        {text}
      </div>
    );
  }

  // Radio group cell — horizontal options, e.g. Tiered/Flat.
  if (field.radio && field.field) {
    const key = field.field;
    const current = String(inputs[key] ?? "");
    return (
      <RadioGroup
        value={current}
        onValueChange={(v) => updateInput(scenarioId, key, v as never)}
        className="flex h-8 items-center gap-3"
      >
        {field.radio.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1 text-xs">
            <RadioGroupItem value={opt.value} /> {opt.label}
          </label>
        ))}
      </RadioGroup>
    );
  }

  const key = field.field;
  if (!key) return null; // unreachable: editable field requires `field` set
  const { type = "number", step = 1, percent = false, optional = false } = field;

  const renderValue = (): string => {
    const raw = inputs[key];
    if (raw == null) return "";
    if (percent && typeof raw === "number") return (raw * 100).toFixed(2);
    if (typeof raw === "number") return String(raw);
    return String(raw);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (optional && raw === "") {
      updateInput(scenarioId, key, undefined as never);
      return;
    }
    if (type === "date" || (typeof inputs[key] === "string" && !percent)) {
      updateInput(scenarioId, key, raw as never);
      return;
    }
    const num = Number(raw);
    const stored = percent ? num / 100 : num;
    updateInput(scenarioId, key, stored as never);
  };

  return (
    <Input
      type={type}
      step={step}
      value={renderValue()}
      onChange={handleChange}
      placeholder={optional ? "—" : undefined}
      className="h-8 px-2 text-sm"
    />
  );
}
