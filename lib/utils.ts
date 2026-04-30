import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class strings with clsx semantics + tailwind-merge dedup.
 * Use this anywhere you'd normally template-literal classNames.
 *
 *   cn("p-2", isActive && "bg-blue-500", "p-4")  // → "bg-blue-500 p-4"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
