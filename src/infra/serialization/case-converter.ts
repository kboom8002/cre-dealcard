/**
 * @file case-converter.ts
 * @description Serialization utility for converting between camelCase and snake_case
 * Used to bridge Supabase DB records (snake_case) and TypeScript domain entities (camelCase)
 */

/**
 * Converts a snake_case string to camelCase.
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Converts a camelCase string to snake_case.
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Deeply transforms all object keys from snake_case to camelCase.
 */
export function toCamelCase<T = any>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map(item => toCamelCase(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object' && !(input instanceof Date) && !(input instanceof RegExp)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[snakeToCamel(key)] = toCamelCase(value);
    }
    return result as T;
  }
  return input as T;
}

/**
 * Deeply transforms all object keys from camelCase to snake_case.
 */
export function toSnakeCase<T = any>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map(item => toSnakeCase(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object' && !(input instanceof Date) && !(input instanceof RegExp)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[camelToSnake(key)] = toSnakeCase(value);
    }
    return result as T;
  }
  return input as T;
}
