"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CompForm } from "@/components/comps/comp-form";
import { Toaster } from "@/components/ui/toaster";
import { useAppStore, useHasHydrated } from "@/lib/store";

/**
 * Query-param edit route (`/comps/edit?id=xxx`). Lives under a flat
 * route instead of `[id]/` so the static export build doesn't need a
 * `generateStaticParams()` for user-generated IDs.
 */
export default function EditCompPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-xs text-[var(--color-muted-foreground)]">
          Loading…
        </div>
      }
    >
      <EditCompInner />
    </Suspense>
  );
}

function EditCompInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const hydrated = useHasHydrated();
  const comp = useAppStore((s) => s.deals.find((c) => c.id === id));

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    );
  }

  if (!comp) {
    return (
      <div className="mx-auto max-w-[600px] px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">Comp not found</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          The comp may have been deleted, or the link is from a different
          browser.
        </p>
        <Link
          href="/comps"
          className="mt-4 inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-[var(--color-accent)]"
        >
          Back to Comp Index
        </Link>
      </div>
    );
  }

  return (
    <>
      <CompForm initial={comp} />
      <Toaster />
    </>
  );
}
