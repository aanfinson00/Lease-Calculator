"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { dismiss, useToasts, type ToastType } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Mounted once at the root; renders the active toast queue top-right. */
export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-md border p-2.5 text-sm shadow-md",
            "bg-[var(--color-card)] text-[var(--color-foreground)]",
            t.type === "success" && "border-l-4 border-l-[var(--color-success)]",
            t.type === "error" && "border-l-4 border-l-[var(--color-destructive)]",
            t.type === "info" && "border-l-4 border-l-[var(--color-primary)]",
          )}
        >
          <ToastIcon type={t.type} />
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ToastIcon({ type }: { type: ToastType }) {
  const Icon =
    type === "success" ? CheckCircle2 : type === "error" ? TriangleAlert : Info;
  const color =
    type === "success"
      ? "text-[var(--color-success)]"
      : type === "error"
        ? "text-[var(--color-destructive)]"
        : "text-[var(--color-primary)]";
  return <Icon className={cn("mt-0.5 size-4 shrink-0", color)} />;
}
