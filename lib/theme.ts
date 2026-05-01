/**
 * Theme management — reads/writes the user's preference and applies the
 * `dark` class on `<html>`. Three modes:
 *   - "light"  — force light
 *   - "dark"   — force dark
 *   - "system" — follow OS-level prefers-color-scheme; flips live if the
 *                user changes their OS theme while the tab is open
 *
 * Persistence is its own localStorage key (separate from the zustand
 * persist key) so theme isn't tangled up in the data migrations.
 *
 * The actual class-toggle on first paint is done by an inline script in
 * app/layout.tsx — that prevents a FOUC. This module is then for the
 * ongoing toggle UX (clicking the button, reacting to system changes).
 */

"use client";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "lease-calculator/theme";

export function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage may throw in private mode; fall through */
  }
  return "system";
}

export function setTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* swallow — best-effort persistence */
  }
  applyTheme(mode);
}

/** Toggle the `dark` class on `<html>` to match the chosen mode. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Subscribe to OS-level theme changes. Only meaningful when the chosen
 * mode is "system" — otherwise the user's explicit choice wins.
 * Returns an unsubscribe fn.
 */
export function onSystemThemeChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
