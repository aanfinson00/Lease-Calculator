"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type NumberFormat = "sf" | "currency" | "percent" | "integer";

interface Props {
  /** Numeric value from the store. Undefined renders empty (only useful with optional). */
  value: number | undefined;
  /** Fires while the user types — parsed numeric value, or undefined when cleared. */
  onChange: (value: number | undefined) => void;
  /** Display format applied when the input is NOT focused. */
  format?: NumberFormat;
  /**
   * The stored value is a fraction (0.03) but the user types/sees percent units (3.00).
   * Set this for fields like escalation, lcLLRepPercent, discountRate.
   */
  percent?: boolean;
  /** Allow clearing → undefined. Otherwise empty input is ignored. */
  optional?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Number input that shows pretty formatting (commas, $, %) when not focused
 * and raw digits when focused, so the user types as if it were a plain
 * number but reads it back with units. Stripping `,$% ` makes paste-from-
 * Excel friendly: copy-paste a "$1,234.56" cell and the parse still works.
 */
export function FormattedNumberInput({
  value,
  onChange,
  format,
  percent = false,
  optional = false,
  className,
  placeholder,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const display = focused
    ? draft
    : value == null
      ? ""
      : formatPretty(percent ? value * 100 : value, format);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onFocus={() => {
        setFocused(true);
        setDraft(value == null ? "" : (percent ? value * 100 : value).toString());
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (v.trim() === "") {
          if (optional) onChange(undefined);
          return;
        }
        const parsed = parseNumberInput(v);
        if (parsed == null) return;
        onChange(percent ? parsed / 100 : parsed);
      }}
      className={cn("h-8 px-2 text-sm", className)}
    />
  );
}

function formatPretty(value: number, format: NumberFormat | undefined): string {
  if (!Number.isFinite(value)) return "";
  switch (format) {
    case "sf":
      return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    case "currency":
      return `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${value.toFixed(2)}%`;
    case "integer":
      return Math.round(value).toLocaleString("en-US");
    default:
      return value.toString();
  }
}

function parseNumberInput(s: string): number | null {
  // Strip thousands separators + leading $ + trailing % + whitespace, so
  // pasting "$1,234.56" or "3.5%" both parse cleanly.
  const cleaned = s.replace(/[,$%\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
