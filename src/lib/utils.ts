/**
 * Utility function for conditionally joining classNames.
 * Uses clsx + tailwind-merge for robust Tailwind class merging.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
