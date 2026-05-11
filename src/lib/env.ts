/**
 * Environment variable access with runtime validation.
 * Server-only variables must not be imported in client components.
 */

/** Public env vars (safe for browser) */
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

/** Server-only env vars (must never reach the browser) */
export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv must not be called on the client.");
  }
  return {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL ?? "gpt-4o",
    APP_BASE_URL: process.env.APP_BASE_URL ?? "http://localhost:3000",
  };
}
