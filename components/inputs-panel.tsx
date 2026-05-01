"use client";

import { TriangleAlert, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedNumberInput, type NumberFormat } from "@/components/ui/formatted-number-input";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppStore } from "@/lib/store";
import type { ScenarioInputs } from "@/lib/types";
import { validateScenario, type Warning } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface FieldDef {
  /** Required for editable fields; omitted for derived (computed) fields. */
  field?: keyof ScenarioInputs;
  label: string;
  type?: "number" | "date" | "text";
  /** Stored as a fraction (0.03), rendered as a percent (3.00). */
  percent?: boolean;
  /** Optional fields render empty when undefined and clearing → undefined. */
  optional?: boolean;
  /** Display format when the cell isn't focused (commas / $ / %). */
  format?: NumberFormat;
  /** When set, the cell renders as a read-only computed value. */
  compute?: (inputs: ScenarioInputs) => number;
  /** How to render the computed value. */
  computeFormat?: "percent" | "currency" | "number";
  /** When set, the cell renders a horizontal radio group with these options. */
  radio?: { value: string; label: string }[];
  /** Optional help bubble rendered next to the column label. */
  help?: React.ReactNode;
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: "Square Footage",
    fields: [
      { field: "projectSF", label: "Project SF", format: "sf" },
      { field: "buildingSF", label: "Building SF", format: "sf" },
      { field: "proposedLeaseSF", label: "Lease SF", format: "sf" },
    ],
  },
  {
    title: "Rent",
    fields: [
      { field: "baseRatePSF", label: "Base Rate ($/SF)", format: "currency" },
      { field: "escalation", label: "Escalation (%)", percent: true, format: "percent" },
    ],
  },
  {
    title: "Concessions",
    fields: [
      { field: "tiAllowancePSF", label: "TI Allowance ($/SF)", format: "currency" },
      { field: "tiDurationMonths", label: "TI Duration (mo)", format: "integer" },
      { field: "freeRentMonths", label: "Free Rent (mo)", format: "integer" },
    ],
  },
  {
    title: "Leasing Commissions",
    fields: [
      { field: "lcLLRepPercent", label: "Landlord Rep (%)", percent: true, format: "percent" },
      { field: "lcTenantRepPercent", label: "Tenant Rep (%)", percent: true, format: "percent" },
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
        help: (
          <>
            <p className="mb-1 font-semibold">How the LC total is calculated against contracted rent.</p>
            <p className="mb-1">
              <span className="font-medium">Tiered:</span> full % on the first 60 paying months
              of contracted rent + half % on month 61 onward. Industrial standard.
            </p>
            <p>
              <span className="font-medium">Flat:</span> full % on every paying month, no tier
              break. Simpler but yields a higher LC total on long leases.
            </p>
          </>
        ),
      },
      {
        field: "lcStructure",
        label: "Payment",
        radio: [
          { value: "split50", label: "50/50" },
          { value: "upfront", label: "Upfront" },
        ],
        help: (
          <>
            <p className="mb-1 font-semibold">When the LC dollars actually hit cash flow.</p>
            <p className="mb-1">
              <span className="font-medium">50/50:</span> half at lease execution, half at lease
              commencement. Free rent does not delay the second half. If execution and
              commencement are the same date, both halves collapse to that day.
            </p>
            <p>
              <span className="font-medium">Upfront:</span> 100% at lease execution. Larger
              early outflow, no second payment.
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: "Term",
    fields: [
      { field: "leaseTermMonths", label: "Term (mo)", format: "integer" },
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

  // Warnings per scenario, used both for inline cell icons and the
  // consolidated strip below the sections.
  const warningsByScenario: Record<string, Warning[]> = {
    [aId]: validateScenario(a.inputs),
    [bId]: validateScenario(b.inputs),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inputs</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <DealAssumptions />
        {SECTIONS.map((section) => (
          <Section
            key={section.title}
            section={section}
            scenarios={scenarios}
            warningsByScenario={warningsByScenario}
          />
        ))}
        <WarningStrip scenarios={scenarios} warningsByScenario={warningsByScenario} />
      </CardContent>
    </Card>
  );
}

function WarningStrip({
  scenarios,
  warningsByScenario,
}: {
  scenarios: Array<{ id: string; name: string }>;
  warningsByScenario: Record<string, Warning[]>;
}) {
  const items = scenarios.flatMap((sc) =>
    warningsByScenario[sc.id]!.map((w) => ({ scenarioName: sc.name, w })),
  );
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 py-3 last:pb-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        Notices
      </div>
      <ul className="flex flex-col gap-1">
        {items.map(({ scenarioName, w }, i) => (
          <li
            key={`${scenarioName}-${w.field}-${i}`}
            className={cn(
              "flex items-start gap-1.5 text-xs",
              w.severity === "warn"
                ? "text-[var(--color-cost)]"
                : "text-[var(--color-muted-foreground)]",
            )}
          >
            {w.severity === "warn" ? (
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <Info className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>
              <span className="font-medium">{scenarioName}:</span> {w.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
          <FormattedNumberInput
            value={globals.shellCostPSF}
            onChange={(v) => update({ shellCostPSF: v ?? 0 })}
            format="currency"
          />
        </Stack>
        <Stack label="Discount (%)">
          <FormattedNumberInput
            value={globals.discountRate}
            onChange={(v) => update({ discountRate: v ?? 0 })}
            format="percent"
            percent
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
  warningsByScenario: Record<string, Warning[]>;
}

function Section({ section, scenarios, warningsByScenario }: SectionProps) {
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
            className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]"
          >
            <span>{f.label}</span>
            {f.help && <HelpTooltip>{f.help}</HelpTooltip>}
          </div>
        ))}
      </div>

      {/* One row per scenario */}
      {scenarios.map((sc) => {
        const scenarioWarnings = warningsByScenario[sc.id] ?? [];
        return (
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
                warning={f.field ? scenarioWarnings.find((w) => w.field === f.field) : undefined}
              />
            ))}
          </div>
        );
      })}
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
  warning?: Warning;
}

function Cell({ field, scenarioId, inputs, warning }: CellProps) {
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

  // Date field — plain text input, no formatting.
  if (field.type === "date") {
    return (
      <CellWrapper warning={warning}>
        <Input
          type="date"
          value={String(inputs[key] ?? "")}
          onChange={(e) => updateInput(scenarioId, key, e.target.value as never)}
          className="h-8 px-2 text-sm"
        />
      </CellWrapper>
    );
  }

  // Numeric input with focus-aware formatting.
  const raw = inputs[key];
  return (
    <CellWrapper warning={warning}>
      <FormattedNumberInput
        value={typeof raw === "number" ? raw : undefined}
        onChange={(v) => updateInput(scenarioId, key, (v as unknown) as never)}
        format={field.format}
        percent={field.percent ?? false}
        optional={field.optional ?? false}
        placeholder={field.optional ? "—" : undefined}
      />
    </CellWrapper>
  );
}

/**
 * Wraps an input with a small `!` indicator when the field has a warning.
 * The icon hovers (focus too) to reveal the message via HelpTooltip.
 */
function CellWrapper({
  warning,
  children,
}: {
  warning: Warning | undefined;
  children: React.ReactNode;
}) {
  if (!warning) return <>{children}</>;
  const isWarn = warning.severity === "warn";
  const Icon = isWarn ? TriangleAlert : Info;
  const colorClass = isWarn ? "text-[var(--color-cost)]" : "text-[var(--color-muted-foreground)]";
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1">{children}</div>
      <span className="group/help relative inline-flex items-center">
        <button
          type="button"
          tabIndex={0}
          aria-label={warning.message}
          className={cn(
            "inline-flex size-3.5 items-center justify-center rounded-full focus:outline-none",
            colorClass,
          )}
        >
          <Icon className="size-3.5" />
        </button>
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none invisible absolute right-0 top-full z-30 mt-1 w-64 rounded-md border bg-[var(--color-card)] p-2 text-[11px] leading-tight text-[var(--color-foreground)] shadow-md opacity-0 transition-opacity",
            "group-hover/help:visible group-hover/help:opacity-100",
            "group-focus-within/help:visible group-focus-within/help:opacity-100",
          )}
        >
          {warning.message}
        </span>
      </span>
    </div>
  );
}
