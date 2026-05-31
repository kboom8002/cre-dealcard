import { z } from "zod/v4";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  AI_DEFAULT_MODEL: z.string().default("gpt-4o"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  // 공공데이터 API — optional (미설정 시 mock 폴백)
  DATA_GO_KR_API_KEY: z.string().optional(),
  MOLIT_API_KEY: z.string().optional(),
  JUSO_CONFIRM_KEY: z.string().optional(),
});

// For testing or build environments, we might have partial environment variables.
// In such cases, if we are in next build or test, we can allow fallback/mock values or handle validation gracefully.
const isTestOrBuild = 
  process.env.NODE_ENV === "test" || 
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

function validatePublicEnv() {
  const payload = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || (isTestOrBuild ? "http://mock-supabase.local" : undefined),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (isTestOrBuild ? "mock-anon-key" : undefined),
  };

  const parsed = publicEnvSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("❌ Environment validation failed:", parsed.error.format());
    throw new Error(`Environment validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const env = validatePublicEnv();

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv must not be called on the client.");
  }

  const payload = {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || (isTestOrBuild ? "mock-service-role-key" : undefined),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || (isTestOrBuild ? "mock-openai-key" : undefined),
    AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL || "gpt-4o",
    APP_BASE_URL: process.env.APP_BASE_URL || "http://localhost:3000",
  };

  const parsed = serverEnvSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("❌ Server environment validation failed:", parsed.error.format());
    throw new Error(`Server environment validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

