import { z } from "zod/v4";

function cleanEnvValue(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanUrlEnvValue(raw: string | undefined, fallback: string): string {
  const cleaned = cleanEnvValue(raw);
  if (!cleaned) return fallback;
  const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    return new URL(withProto).toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  AI_DEFAULT_MODEL: z.string().default("gpt-5.6-terra"),
  AI_MODEL_SOL: z.string().default("gpt-5.6-sol"),
  AI_MODEL_TERRA: z.string().default("gpt-5.6-terra"),
  AI_MODEL_LUNA: z.string().default("gpt-5.6-luna"),
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
  const rawSupaUrl = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const payload = {
    NEXT_PUBLIC_SUPABASE_URL:
      rawSupaUrl || (isTestOrBuild ? "http://mock-supabase.local" : undefined),
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
      (isTestOrBuild ? "mock-anon-key" : undefined),
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
    SUPABASE_SERVICE_ROLE_KEY:
      cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
      (isTestOrBuild ? "mock-service-role-key" : undefined),
    OPENAI_API_KEY:
      cleanEnvValue(process.env.OPENAI_API_KEY) ||
      cleanEnvValue(process.env.GEMINI_API_KEY) ||
      "not-configured",
    AI_DEFAULT_MODEL: cleanEnvValue(process.env.AI_DEFAULT_MODEL) || "gpt-5.6-terra",
    AI_MODEL_SOL: cleanEnvValue(process.env.AI_MODEL_SOL) || "gpt-5.6-sol",
    AI_MODEL_TERRA: cleanEnvValue(process.env.AI_MODEL_TERRA) || "gpt-5.6-terra",
    AI_MODEL_LUNA: cleanEnvValue(process.env.AI_MODEL_LUNA) || "gpt-5.6-luna",
    APP_BASE_URL: cleanUrlEnvValue(
      process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL,
      "http://localhost:3000"
    ),
    DATA_GO_KR_API_KEY: cleanEnvValue(process.env.DATA_GO_KR_API_KEY),
    MOLIT_API_KEY: cleanEnvValue(process.env.MOLIT_API_KEY),
    JUSO_CONFIRM_KEY: cleanEnvValue(process.env.JUSO_CONFIRM_KEY),
  };

  const parsed = serverEnvSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("❌ Server environment validation failed:", parsed.error.format());
    throw new Error(`Server environment validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

