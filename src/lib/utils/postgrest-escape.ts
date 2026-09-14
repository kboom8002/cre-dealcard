/**
 * Escapes characters that have special meaning in PostgREST `.ilike()` and `.like()` queries.
 *
 * PostgREST uses `%` (match any number of characters) and `_` (match exactly one character)
 * as wildcards. To match these literally, they must be escaped with a backslash `\`.
 * The backslash itself must also be escaped.
 */
export function escapeIlike(val: string): string {
  if (!val) return "";
  return val.replace(/[\\%_]/g, "\\$&");
}
