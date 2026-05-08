"use client";

import { RotateCcw } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";

export function ResetButton() {
  const resetAll = useAppStore((s) => s.resetAll);
  const dealCount = useAppStore((s) => s.deals.length);
  const scenarioCount = useAppStore((s) => s.scenarios.length);

  const onClick = () => {
    const ok = window.confirm(
      `Reset everything in this browser?\n\n` +
        `This permanently clears ${dealCount} deal${dealCount === 1 ? "" : "s"}, ` +
        `${scenarioCount} scenario${scenarioCount === 1 ? "" : "s"}, ` +
        `and all saved settings. The page will reload with fresh defaults.`,
    );
    if (!ok) return;
    resetAll();
    toast("All data cleared", "info");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title="Reset all data (deals, scenarios, settings)"
      aria-label="Reset all data"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)] [&_svg]:size-4"
    >
      <RotateCcw />
    </button>
  );
}
