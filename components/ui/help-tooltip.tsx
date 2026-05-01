"use client";

import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small `?` icon with a hover/focus-revealed tooltip bubble. Pairs nicely
 * with column headers / form labels that need a one-line definition.
 *
 * Usage:
 *   <HelpTooltip>
 *     <p><b>Tiered:</b> full % on first 60 paying months…</p>
 *     <p><b>Flat:</b> full % every paying month.</p>
 *   </HelpTooltip>
 */
export function HelpTooltip({
  children,
  side = "bottom",
  align = "left",
  className,
}: {
  children: React.ReactNode;
  side?: "bottom" | "top";
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const sideClass =
    side === "top" ? "bottom-full mb-1" : "top-full mt-1";
  const alignClass =
    align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0";

  return (
    <span className={cn("group/help relative inline-flex items-center", className)}>
      <button
        type="button"
        tabIndex={0}
        aria-label="More info"
        className="inline-flex size-3.5 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] focus:outline-none focus-visible:text-[var(--color-foreground)]"
      >
        <CircleHelp className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute z-30 w-64 rounded-md border bg-[var(--color-card)] p-2 text-[11px] leading-tight text-[var(--color-foreground)] shadow-md opacity-0 transition-opacity",
          "group-hover/help:visible group-hover/help:opacity-100 group-hover/help:pointer-events-auto",
          "group-focus-within/help:visible group-focus-within/help:opacity-100 group-focus-within/help:pointer-events-auto",
          sideClass,
          alignClass,
        )}
      >
        {children}
      </span>
    </span>
  );
}
