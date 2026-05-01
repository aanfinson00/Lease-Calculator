/**
 * Tiny toast queue. No deps, no React state in the producer, no portals.
 * The queue is module-scoped; consumers subscribe via `useToasts()` and the
 * <Toaster/> component renders the active list.
 *
 * API: `toast(message, type)`. Auto-dismiss after `defaultDurationMs`.
 *
 * Why module-scoped: the producer (e.g. `dealPicker.apply()`) shouldn't
 * have to be a hook or thread a context — calling `toast(...)` from
 * anywhere just works.
 */

"use client";

import { useEffect, useState } from "react";

export type ToastType = "info" | "success" | "error";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const defaultDurationMs = 3000;

let nextId = 1;
let queue: Toast[] = [];
const subscribers = new Set<(q: Toast[]) => void>();

function emit() {
  for (const s of subscribers) s([...queue]);
}

export function toast(message: string, type: ToastType = "info"): void {
  if (typeof window === "undefined") return;
  const id = nextId++;
  queue = [...queue, { id, type, message }];
  emit();
  window.setTimeout(() => dismiss(id), defaultDurationMs);
}

export function dismiss(id: number): void {
  queue = queue.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(queue);
  useEffect(() => {
    subscribers.add(setList);
    setList([...queue]);
    return () => {
      subscribers.delete(setList);
    };
  }, []);
  return list;
}
