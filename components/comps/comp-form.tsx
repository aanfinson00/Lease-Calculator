"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUILDING_CLASSES,
  DATA_SOURCES,
  LEASE_STATUSES,
  LEASE_STRUCTURES,
  PROPERTY_SUBTYPES,
  computeCompSnapshot,
  defaultComp,
  validateComp,
  type BuildingClass,
  type Comp,
  type DataSource,
  type LeaseStatus,
  type LeaseStructure,
  type PropertySubtype,
} from "@/lib/comps";
import { fmtCurrency, fmtPercent } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Props {
  /** Existing comp for edit mode; omit for create mode. */
  initial?: Comp;
}

/**
 * Shared form for creating + editing a comp. Renders a four-section form
 * on the left and a live NER preview on the right. Validation runs
 * inline; Save is disabled until blocking errors are clear.
 */
export function CompForm({ initial }: Props) {
  const router = useRouter();
  const globals = useAppStore((s) => s.globals);
  const addComp = useAppStore((s) => s.addComp);
  const updateComp = useAppStore((s) => s.updateComp);

  const isEdit = !!initial;
  const [comp, setComp] = useState<Comp>(initial ?? defaultComp());
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateComp(comp), [comp]);
  const errorByField = useMemo(() => {
    const m = new Map<keyof Comp, string>();
    for (const e of errors) m.set(e.field, e.message);
    return m;
  }, [errors]);

  const snapshot = useMemo(() => computeCompSnapshot(comp, globals), [comp, globals]);

  const set = <K extends keyof Comp>(key: K, value: Comp[K]) => {
    setComp((c) => ({ ...c, [key]: value }));
  };

  const save = (mode: "save" | "saveAndNew"): boolean => {
    if (errors.length > 0) {
      setShowErrors(true);
      toast(`Fix ${errors.length} field${errors.length === 1 ? "" : "s"} before saving.`, "error");
      return false;
    }
    const stamped: Comp = {
      ...comp,
      ner: { ...snapshot },
      modifiedAt: new Date().toISOString(),
    };
    if (isEdit) {
      updateComp(comp.id, stamped);
      toast(`Saved ${comp.code}`, "success");
      if (mode === "save") router.push("/comps");
    } else {
      addComp(stamped);
      toast(`Added ${comp.code} to comp index`, "success");
      if (mode === "save") {
        router.push("/comps");
      } else {
        // Reset form to a fresh blank comp; keep market/submarket/source
        // since users typically batch-enter comps from the same submarket
        // or broker.
        const blank = defaultComp();
        setComp({
          ...blank,
          market: comp.market,
          submarket: comp.submarket,
          dataSource: comp.dataSource,
          brokerName: comp.brokerName,
        });
        setShowErrors(false);
      }
    }
    return true;
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-6 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/comps")}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <h1 className="text-xl font-semibold">
            {isEdit ? `Edit ${comp.code || "comp"}` : "New comp"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/comps")}>
            Cancel
          </Button>
          {!isEdit && (
            <Button variant="outline" size="sm" onClick={() => save("saveAndNew")}>
              Save & New
            </Button>
          )}
          <Button size="sm" onClick={() => save("save")}>
            {isEdit ? "Save changes" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr),300px]">
        <div className="flex flex-col gap-5">
          <Section title="Identification">
            <Field label="Code" required error={showErrors ? errorByField.get("code") : undefined}>
              <Input
                value={comp.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="DA-25-014"
              />
            </Field>
            <Field label="Deal name" required error={showErrors ? errorByField.get("dealName") : undefined}>
              <Input
                value={comp.dealName}
                onChange={(e) => set("dealName", e.target.value)}
                placeholder="Building A · Suite 200"
              />
            </Field>
            <Field label="Tenant name" required error={showErrors ? errorByField.get("tenantName") : undefined}>
              <Input
                value={comp.tenantName}
                onChange={(e) => set("tenantName", e.target.value)}
                placeholder="Acme Logistics"
              />
            </Field>
            <Field label="Tenant industry">
              <Input
                value={comp.tenantIndustry ?? ""}
                onChange={(e) => set("tenantIndustry", e.target.value || undefined)}
                placeholder="3PL / e-commerce / cold storage…"
              />
            </Field>
            <Field label="Status" required>
              <SelectEnum<LeaseStatus>
                value={comp.status}
                options={LEASE_STATUSES}
                onChange={(v) => v && set("status", v)}
              />
            </Field>
            <Field label="Signed date" error={showErrors ? errorByField.get("signedDate") : undefined}>
              <Input
                type="date"
                value={comp.signedDate ?? ""}
                onChange={(e) => set("signedDate", e.target.value || undefined)}
              />
            </Field>
            <Field label="Commencement date" required error={showErrors ? errorByField.get("commencementDate") : undefined}>
              <Input
                type="date"
                value={comp.commencementDate}
                onChange={(e) => set("commencementDate", e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Property">
            <Field label="Property name">
              <Input
                value={comp.propertyName ?? ""}
                onChange={(e) => set("propertyName", e.target.value || undefined)}
                placeholder="Eastvale Logistics Center"
              />
            </Field>
            <Field label="Market">
              <Input
                value={comp.market ?? ""}
                onChange={(e) => set("market", e.target.value || undefined)}
                placeholder="Inland Empire West"
              />
            </Field>
            <Field label="Submarket">
              <Input
                value={comp.submarket ?? ""}
                onChange={(e) => set("submarket", e.target.value || undefined)}
                placeholder="Eastvale"
              />
            </Field>
            <Field label="Property subtype">
              <SelectEnum<PropertySubtype>
                value={comp.propertySubtype}
                options={PROPERTY_SUBTYPES}
                onChange={(v) => set("propertySubtype", v)}
                placeholder="Choose…"
              />
            </Field>
            <Field label="Building class">
              <SelectEnum<BuildingClass>
                value={comp.buildingClass}
                options={BUILDING_CLASSES}
                onChange={(v) => set("buildingClass", v)}
                placeholder="Choose…"
              />
            </Field>
            <Field label="Clear height (ft)">
              <FormattedNumberInput
                value={comp.clearHeightFt}
                onChange={(v) => set("clearHeightFt", v ?? undefined)}
                format="integer"
                optional
              />
            </Field>
            <Field label="Year built">
              <FormattedNumberInput
                value={comp.yearBuilt}
                onChange={(v) => set("yearBuilt", v ?? undefined)}
                format="integer"
                optional
              />
            </Field>
            <Field label="Project SF" required error={showErrors ? errorByField.get("projectSF") : undefined}>
              <FormattedNumberInput
                value={comp.projectSF}
                onChange={(v) => set("projectSF", v ?? 0)}
                format="sf"
              />
            </Field>
            <Field label="Building SF" required error={showErrors ? errorByField.get("buildingSF") : undefined}>
              <FormattedNumberInput
                value={comp.buildingSF}
                onChange={(v) => set("buildingSF", v ?? 0)}
                format="sf"
              />
            </Field>
            <Field label="Lease SF" required error={showErrors ? errorByField.get("leaseSF") : undefined}>
              <FormattedNumberInput
                value={comp.leaseSF}
                onChange={(v) => set("leaseSF", v ?? 0)}
                format="sf"
              />
            </Field>
          </Section>

          <Section title="Economics">
            <Field label="Base rate ($/SF)" required error={showErrors ? errorByField.get("baseRatePSF") : undefined}>
              <FormattedNumberInput
                value={comp.baseRatePSF}
                onChange={(v) => set("baseRatePSF", v ?? 0)}
                format="currency"
              />
            </Field>
            <Field label="Escalation (%)" required>
              <FormattedNumberInput
                value={comp.escalation}
                onChange={(v) => set("escalation", v ?? 0)}
                format="percent"
                percent
              />
            </Field>
            <Field label="Lease term (mo)" required error={showErrors ? errorByField.get("leaseTermMonths") : undefined}>
              <FormattedNumberInput
                value={comp.leaseTermMonths}
                onChange={(v) => set("leaseTermMonths", v ?? 0)}
                format="integer"
              />
            </Field>
            <Field label="Free rent (mo)" required error={showErrors ? errorByField.get("freeRentMonths") : undefined}>
              <FormattedNumberInput
                value={comp.freeRentMonths}
                onChange={(v) => set("freeRentMonths", v ?? 0)}
                format="integer"
              />
            </Field>
            <Field label="TI allowance ($/SF)" required error={showErrors ? errorByField.get("tiAllowancePSF") : undefined}>
              <FormattedNumberInput
                value={comp.tiAllowancePSF}
                onChange={(v) => set("tiAllowancePSF", v ?? 0)}
                format="currency"
              />
            </Field>
            <Field label="TI duration (mo)">
              <FormattedNumberInput
                value={comp.tiDurationMonths ?? 1}
                onChange={(v) => set("tiDurationMonths", v ?? 1)}
                format="integer"
              />
            </Field>
            <Field label="LL Rep LC (%)" required error={showErrors ? errorByField.get("lcLLRepPercent") : undefined}>
              <FormattedNumberInput
                value={comp.lcLLRepPercent}
                onChange={(v) => set("lcLLRepPercent", v ?? 0)}
                format="percent"
                percent
              />
            </Field>
            <Field label="Tenant Rep LC (%)" required error={showErrors ? errorByField.get("lcTenantRepPercent") : undefined}>
              <FormattedNumberInput
                value={comp.lcTenantRepPercent}
                onChange={(v) => set("lcTenantRepPercent", v ?? 0)}
                format="percent"
                percent
              />
            </Field>
            <Field label="Lease structure" required>
              <SelectEnum<LeaseStructure>
                value={comp.leaseStructure}
                options={LEASE_STRUCTURES}
                onChange={(v) => v && set("leaseStructure", v)}
              />
            </Field>
          </Section>

          <Section title="Provenance">
            <Field label="Data source">
              <SelectEnum<DataSource>
                value={comp.dataSource}
                options={DATA_SOURCES}
                onChange={(v) => set("dataSource", v)}
                placeholder="Choose…"
              />
            </Field>
            <Field label="Broker name">
              <Input
                value={comp.brokerName ?? ""}
                onChange={(e) => set("brokerName", e.target.value || undefined)}
                placeholder="Broker / brokerage"
              />
            </Field>
            <Field label="Notes" wide>
              <textarea
                value={comp.notes ?? ""}
                onChange={(e) => set("notes", e.target.value || undefined)}
                rows={4}
                className="min-h-[5rem] w-full rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/60"
                placeholder="Anything that would matter for comp interpretation later — concession structure, OPEX peculiarities, options, exclusions."
              />
            </Field>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] tracking-[0.14em] text-[var(--color-foreground)]">
                Live preview · NER
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <PreviewRow label="Discounted NER" value={fmtCurrency(snapshot.discounted, 2)} unit="$/SF" />
              <PreviewRow label="Undiscounted NER" value={fmtCurrency(snapshot.undiscounted, 2)} unit="$/SF" />
              <PreviewRow label="Total Basis" value={fmtCurrency(snapshot.totalBasisPSF, 2)} unit="$/SF" />
              <div className="border-t pt-2 text-[11px] text-[var(--color-muted-foreground)]">
                Combined LC{" "}
                <span className="tabular-nums">{fmtPercent((comp.lcLLRepPercent + comp.lcTenantRepPercent) * 100, 2)}</span>
              </div>
              {showErrors && errors.length > 0 && (
                <div className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-2 text-[11px] text-[var(--color-destructive)]">
                  {errors.length} field{errors.length === 1 ? "" : "s"} need fixing before save.
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny form primitives (kept local — only used here)
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  error,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <Label className="text-[11px] text-[var(--color-muted-foreground)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-destructive)]">*</span>}
      </Label>
      {children}
      {error && <span className="text-[11px] text-[var(--color-destructive)]">{error}</span>}
    </div>
  );
}

function SelectEnum<T extends string>({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T | undefined) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? undefined : (v as T));
      }}
      className="h-9 rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PreviewRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
        {label}
        {unit && <span className="ml-1 text-[var(--color-muted-foreground)]/70">{unit}</span>}
      </span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}
