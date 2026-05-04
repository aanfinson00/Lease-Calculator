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
      {
        field: "baseRatePSF",
        label: "Base Rate ($/SF)",
        format: "currency",
        help: "Year-1 contracted base rent per SF (annual). Subsequent years escalate per the Escalation field unless overridden in the Rent Schedule.",
      },
      {
        field: "escalation",
        label: "Escalation (%)",
        percent: true,
        format: "percent",
        help: "Annual rent escalation, compounded yearly: rate(year) = Base × (1 + Esc)^(year − 1).",
      },
    ],
  },
  {
    title: "Concessions",
    fields: [
      {
        field: "tiAllowancePSF",
        label: "TI Allowance ($/SF)",
        format: "currency",
        help: "Tenant improvement dollars per SF the landlord funds. Paid out evenly across the TI Duration window starting at lease execution.",
      },
      {
        field: "tiDurationMonths",
        label: "TI Duration (mo)",
        format: "integer",
        help: "How many months the TI dollars are spread over, starting at lease execution. 1 = single lump-sum draw on day 1 (default — calc clamps 0 to 1).",
      },
      {
        field: "freeRentMonths",
        label: "Free Rent (mo)",
        format: "integer",
        help: "Months of full base-rent abatement, always front-loaded (months 1..N from commencement). Does not extend the lease term.",
      },
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
        help: "Sum of Landlord Rep + Tenant Rep. This is the rate applied to contracted rent under both the Tiered and Flat calc methods.",
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
              <span className="font-medium">Tiered:</span> full % on the first 60 PAYING months
              (free-rent months don't count toward the tier), then half % on paying month 61
              onward. Industrial standard.
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
              commencement (the rent-start date — the first paying month for the tenant). The
              second half is paid in cash even though no rent is collected during the free-rent
              period. If execution and commencement are the same date, both halves collapse to
              that day.
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
      {
        field: "leaseTermMonths",
        label: "Term (mo)",
        format: "integer",
        help: "Total lease term in months, INCLUDING any free-rent period. A 130-mo lease with 6 mo free has 124 paying months.",
      },
      {
        field: "leaseExecutionDate",
        label: "Execution",
        type: "date",
        help: (
          <>
            <p className="mb-1 font-semibold">Lease signing date.</p>
            <p>Triggers the start of TI work and the first 50% of LC payment (when LC Payment is set to 50/50). Should be on or before commencement.</p>
          </>
        ),
      },
      {
        field: "leaseCommencement",
        label: "Commencement",
        type: "date",
        help: (
          <>
            <p className="mb-1 font-semibold">Rent commencement date.</p>
            <p>Free rent (if any) starts here. The second 50% of LC under the 50/50 structure pays here. Must be on or after the execution date.</p>
          </>
        ),
      },
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
        <CardContent className="flex items-center gap-3 bg-[var(--color-muted)]/30 p-6 text-sm text-[var(--color-muted-foreground)]">
          <Info className="size-4 shrink-0" aria-hidden />
          <span>Select two scenarios from the bar above to compare.</span>
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
    <div className="flex flex-col gap-1.5 py-3 last:pb-0">
      <div className="flex flex-col gap-0.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          Notices
        </div>
        <div className="text-[10px] text-[var(--color-muted-foreground)]/80">
          Hover the ! icons in the cells above for details.
        </div>
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
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0" />
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
        <Stack
          label="Current Basis ($/SF)"
          help="Your current project basis per SF before this deal's TI and LC. Whatever combination of land, shell, and soft costs you carry — entered as one rolled-up number. The headline Total Basis adds the scenario's TI + LC on top."
        >
          <FormattedNumberInput
            value={globals.projectBasisPSF}
            onChange={(v) => update({ projectBasisPSF: v ?? 0 })}
            format="currency"
          />
        </Stack>
        <Stack
          label="Discount (%)"
          help="Annual discount rate for present-value calc. Compounded monthly in the discounted-NER formula."
        >
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

function Stack({
  label,
  help,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
        <span>{label}</span>
        {help && <HelpTooltip>{help}</HelpTooltip>}
      </Label>
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

/**
 * Per-field direction of "better for the landlord" — drives directional
 * diff highlighting (green = best across scenarios, red = worst).
 *
 * Fields not listed here get neutral diff treatment when values differ
 * (radios, dates, SF facts, derived cells). Higher rent + escalation +
 * term = more contracted income; lower TI/free-rent/LC = less LL outflow.
 */
const BETTER_DIRECTION: Partial<Record<keyof ScenarioInputs, "higher" | "lower">> = {
  baseRatePSF: "higher",
  escalation: "higher",
  leaseTermMonths: "higher",
  tiAllowancePSF: "lower",
  freeRentMonths: "lower",
  lcLLRepPercent: "lower",
  lcTenantRepPercent: "lower",
};

type DiffStatus = "best" | "worst" | "neutral";

function Section({ section, scenarios, warningsByScenario }: SectionProps) {
  // 1 label column + N field columns. Inline style because Tailwind can't
  // produce a class for an arbitrary repeat count at build time.
  const cols = section.fields.length;
  const gridStyle = { gridTemplateColumns: `7.5rem repeat(${cols}, minmax(0, 1fr))` };

  // Diff map: per-(scenarioId, field) → "best" / "worst" / "neutral".
  // "best" and "worst" only apply when the field has a defined direction
  // and the values across scenarios differ; otherwise we fall back to
  // "neutral" for differing values and skip highlighting for matches.
  const diffByScenarioField = new Map<string, Map<keyof ScenarioInputs, DiffStatus>>();
  for (const sc of scenarios) {
    diffByScenarioField.set(sc.id, new Map());
  }
  for (const f of section.fields) {
    if (!f.field) continue;
    const key = f.field;
    const valuesByScenario = scenarios.map((sc) => ({ id: sc.id, value: sc.inputs[key] }));
    const uniqueRendered = new Set(valuesByScenario.map((v) => String(v.value ?? "")));
    if (uniqueRendered.size <= 1) continue; // all the same — no highlight

    const direction = BETTER_DIRECTION[key];
    const numericValues = valuesByScenario
      .map((v) => (typeof v.value === "number" ? v.value : Number.NaN))
      .filter((n) => Number.isFinite(n));

    if (!direction || numericValues.length !== valuesByScenario.length) {
      // No direction or non-numeric → neutral (just "differs").
      for (const v of valuesByScenario) {
        diffByScenarioField.get(v.id)!.set(key, "neutral");
      }
      continue;
    }

    const bestValue = direction === "higher" ? Math.max(...numericValues) : Math.min(...numericValues);
    const worstValue = direction === "higher" ? Math.min(...numericValues) : Math.max(...numericValues);
    for (const v of valuesByScenario) {
      const n = v.value as number;
      const status: DiffStatus =
        n === bestValue && n !== worstValue
          ? "best"
          : n === worstValue && n !== bestValue
            ? "worst"
            : "neutral";
      diffByScenarioField.get(v.id)!.set(key, status);
    }
  }

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
        const diffByField = diffByScenarioField.get(sc.id)!;
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
                diffStatus={f.field ? diffByField.get(f.field) : undefined}
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
  diffStatus?: DiffStatus;
}

function Cell({ field, scenarioId, inputs, warning, diffStatus }: CellProps) {
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
      <CellWrapper diffStatus={diffStatus}>
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
      </CellWrapper>
    );
  }

  const key = field.field;
  if (!key) return null; // unreachable: editable field requires `field` set

  // Date field — plain text input, no formatting.
  if (field.type === "date") {
    return (
      <CellWrapper warning={warning} diffStatus={diffStatus}>
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
    <CellWrapper warning={warning} diffStatus={diffStatus}>
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
 * Wraps an input with optional treatments: a `!` indicator when the field
 * has a warning, and a directional left-border accent when this field's
 * value differs across the compared scenarios — green = best for the
 * landlord, red = worst, primary = differs but no clear "better" direction
 * (radios, dates, SF facts).
 */
function CellWrapper({
  warning,
  diffStatus,
  children,
}: {
  warning?: Warning;
  diffStatus?: DiffStatus;
  children: React.ReactNode;
}) {
  const accentColor =
    diffStatus === "best"
      ? "border-[var(--color-success)]"
      : diffStatus === "worst"
        ? "border-[var(--color-cost)]"
        : diffStatus === "neutral"
          ? "border-[var(--color-primary)]"
          : undefined;
  // Negative left margin pulls the bordered cell back into its column so
  // the input's content (numbers etc.) stays in the same horizontal
  // position whether or not a diff border is drawn. Without this, every
  // diff'd cell would slide right by `border-width + padding`, breaking
  // column alignment within the inputs grid.
  const accent = accentColor
    ? cn("-ml-[3px] border-l-2 pl-[1px]", accentColor)
    : undefined;

  if (!warning) {
    if (!accent) return <>{children}</>;
    return <div className={cn("flex items-center", accent)}>{children}</div>;
  }

  const isWarn = warning.severity === "warn";
  const Icon = isWarn ? TriangleAlert : Info;
  const colorClass = isWarn ? "text-[var(--color-cost)]" : "text-[var(--color-muted-foreground)]";
  return (
    <div className={cn("flex items-center gap-1", accent)}>
      <div className="flex-1">{children}</div>
      <span className="group/help relative inline-flex items-center">
        <button
          type="button"
          tabIndex={0}
          aria-label={warning.message}
          className={cn(
            "inline-flex size-4 items-center justify-center rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/60",
            colorClass,
          )}
        >
          <Icon className="size-4" />
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
