"use client";

import { useEffect, useState } from "react";
import { Moon, Monitor, Sun } from "lucide-react";
import {
  applyTheme,
  onSystemThemeChange,
  readTheme,
  setTheme,
  type ThemeMode,
} from "@/lib/theme";

/**
 * Tiny header button that cycles Light → Dark → System → Light…
 * Initial paint comes from the inline script in layout.tsx (no flash);
 * this component just owns the post-hydration UX.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  // Sync local state with whatever the inline script (or a previous
  // session) decided. Must run client-side; on first render we default to
  // "system" to keep SSR markup stable.
  useEffect(() => {
    setMode(readTheme());
  }, []);

  // Re-apply when OS theme changes IF currently in system mode.
  useEffect(() => {
    if (mode !== "system") return;
    return onSystemThemeChange(() => applyTheme("system"));
  }, [mode]);

  const cycle = () => {
    const next: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    setMode(next);
    setTheme(next);
  };

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const title =
    mode === "light"
      ? "Light mode (click for dark)"
      : mode === "dark"
        ? "Dark mode (click for system)"
        : "System mode (click for light)";

  return (
    <button
      type="button"
      onClick={cycle}
      title={title}
      aria-label={title}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-[var(--color-background)] text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-accent)] [&_svg]:size-4"
    >
      <Icon />
    </button>
  );
}
