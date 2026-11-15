/**
 * Korean phone / tel input auto-hyphenation formatter.
 * Strips non-digits and formats progressively as the user types:
 * - Mobile / 070 / 050 / area codes (01x, 0xx): 3-3-4 (<=10 digits) or 3-4-4 (11 digits)
 * - Seoul (02): 2-3-4 (<=9 digits) or 2-4-4 (10 digits)
 * - National representative numbers (15xx / 16xx / 18xx): 4-4 (<=8 digits)
 */
export function formatKrPhoneInput(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("02")) {
    const capped = digits.slice(0, 10);
    if (capped.length <= 2) return capped;
    if (capped.length <= 5) return `${capped.slice(0, 2)}-${capped.slice(2)}`;
    if (capped.length <= 9) {
      return `${capped.slice(0, 2)}-${capped.slice(2, 5)}-${capped.slice(5)}`;
    }
    return `${capped.slice(0, 2)}-${capped.slice(2, 6)}-${capped.slice(6)}`;
  }

  if (/^1[568]\d*/.test(digits) && !digits.startsWith("10")) {
    const capped = digits.slice(0, 8);
    if (capped.length <= 4) return capped;
    return `${capped.slice(0, 4)}-${capped.slice(4)}`;
  }

  const capped = digits.slice(0, 11);
  if (capped.length <= 3) return capped;
  if (capped.length <= 6) return `${capped.slice(0, 3)}-${capped.slice(3)}`;
  if (capped.length <= 10) {
    return `${capped.slice(0, 3)}-${capped.slice(3, 6)}-${capped.slice(6)}`;
  }
  return `${capped.slice(0, 3)}-${capped.slice(3, 7)}-${capped.slice(7)}`;
}
