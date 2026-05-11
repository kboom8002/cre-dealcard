/**
 * Utility function for conditionally joining classNames.
 * shadcn/ui-style cn() helper.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
