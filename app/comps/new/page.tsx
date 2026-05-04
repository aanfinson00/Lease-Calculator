"use client";

import { CompForm } from "@/components/comps/comp-form";
import { Toaster } from "@/components/ui/toaster";
import { useHasHydrated } from "@/lib/store";

export default function NewCompPage() {
  const hydrated = useHasHydrated();
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    );
  }
  return (
    <>
      <CompForm />
      <Toaster />
    </>
  );
}
