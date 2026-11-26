import { z } from "zod/v4";
import * as loggerModule from "@/lib/logger";

function getEnvLogger() {
  try {
    if (typeof loggerModule.createModuleLogger === "function") {
      return loggerModule.createModuleLogger("env");
    }
  } catch {
    // Fallback if logger module is partially mocked in unit tests
  }
  return null;
}

function cleanEnvValue(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

const PLACEHOLDER_SECRETS = new Set([
  "not-configured",
  "mock_key",
  "mock-key",
  "mock-service-role-key",
  "mock-anon-key",
  "your-api-key",
  "changeme",
  "placeholder",
]);

function isRealSecretValue(raw: string | undefined): boolean {
  const cleaned = cleanEnvValue(raw);
  if (!cleaned) return false;
  return !PLACEHOLDER_SECRETS.has(cleaned.toLowerCase());
}

function isMockSupabaseUrl(raw: string | undefined): boolean {
  const cleaned = cleanEnvValue(raw);
  if (!cleaned) return true;
  if (/mock\.supabase\.co|mock-supabase/i.test(cleaned)) return true;
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol !== "https:" && parsed.protocol !== "http:";
  } catch {
    return true;
  }
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
  SHARE_LINK_SECRET: z.string().min(32).optional(),
  AI_DEFAULT_MODEL: z.string().default("gpt-6.1-terra"),
  AI_MODEL_SOL: z.string().default("gpt-5.6-sol"),
  AI_MODEL_TERRA: z.string().default("gpt-6.1-terra"),
  AI_MODEL_LUNA: z.string().default("gpt-5.6-luna"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  // 공공데이터 API — optional (미설정 시 mock 폴백)
  DATA_GO_KR_API_KEY: z.string().optional(),
  MOLIT_API_KEY: z.string().optional(),
  JUSO_CONFIRM_KEY: z.string().optional(),
});

export { serverEnvSchema as serverSchema };

export function isRealProductionRuntime(): boolean {
  const notBuild =
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.NEXT_PHASE !== "phase-export";
  const notMockUrl = !String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes(
    "mock.supabase.co"
  );
  if (process.env.VERCEL_ENV === "production") {
    return notBuild && notMockUrl;
  }
  return process.env.NODE_ENV === "production" && !process.env.CI && notMockUrl && notBuild;
}

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
    getEnvLogger()?.error(
      { issues: parsed.error.format() },
      "Environment validation failed",
    );
    throw new Error(`Environment validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const env = validatePublicEnv();

let loggedProdWarnings = false;

export function isAiProviderConfigured(): boolean {
  return (
    isRealSecretValue(process.env.OPENAI_API_KEY) ||
    isRealSecretValue(process.env.GEMINI_API_KEY) ||
    isRealSecretValue(process.env.ANTHROPIC_API_KEY)
  );
}

export function assertProductionSecretsReady(): void {
  const notBuild =
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.NEXT_PHASE !== "phase-export";
  const shouldEnforce =
    isRealProductionRuntime() || (process.env.VERCEL_ENV === "production" && notBuild);

  if (!shouldEnforce) {
    return;
  }

  const missingOrMock: string[] = [];

  if (isMockSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    missingOrMock.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!isRealSecretValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    missingOrMock.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!isRealSecretValue(process.env.CRON_SECRET)) {
    missingOrMock.push("CRON_SECRET");
  }
  if (!isRealSecretValue(process.env.SHARE_LINK_SECRET)) {
    missingOrMock.push("SHARE_LINK_SECRET");
  }

  if (missingOrMock.length > 0) {
    getEnvLogger()?.error(
      { missingCount: missingOrMock.length },
      "Critical production secrets missing or mock-configured",
    );
    throw new Error(
      `Critical production secrets missing or invalid: ${missingOrMock.join(", ")}`,
    );
  }
}

export function getProductionReadinessWarnings(): string[] {
  const warnings: string[] = [];
  if (!cleanEnvValue(process.env.RESEND_API_KEY)) {
    warnings.push("RESEND_API_KEY is not configured (outbound emails cannot be sent)");
  }
  if (cleanEnvValue(process.env.MAGAZINE_SEND_ENABLED) !== "true") {
    warnings.push('MAGAZINE_SEND_ENABLED is not "true" (magazine sending is disabled)');
  }
  if (cleanEnvValue(process.env.MAGAZINE_SEND_DRY_RUN) !== "false") {
    warnings.push('MAGAZINE_SEND_DRY_RUN is not "false" (magazine sending is in dry-run mode)');
  }
  if (!cleanEnvValue(process.env.UNSUBSCRIBE_SECRET)) {
    warnings.push("UNSUBSCRIBE_SECRET is not configured");
  }
  if (!cleanEnvValue(process.env.CRON_SECRET)) {
    warnings.push("CRON_SECRET is not configured");
  }
  const baseUrl = cleanEnvValue(
    process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL,
  );
  if (!baseUrl || /localhost/i.test(baseUrl)) {
    warnings.push("APP_BASE_URL is missing or points to localhost");
  }
  if (!cleanEnvValue(process.env.VWORLD_API_KEY)) {
    warnings.push("VWORLD_API_KEY is not configured");
  }
  if (!isAiProviderConfigured()) {
    warnings.push("OPENAI_API_KEY is not configured");
  }
  return warnings;
}

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv must not be called on the client.");
  }

  if (isRealProductionRuntime() && !loggedProdWarnings) {
    loggedProdWarnings = true;
    const warnings = getProductionReadinessWarnings();
    if (warnings.length > 0) {
      getEnvLogger()?.warn(
        { warningCount: warnings.length, warnings },
        "Production readiness warnings detected",
      );
    }
  }

  const payload = {
    SUPABASE_SERVICE_ROLE_KEY:
      cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
      (isTestOrBuild ? "mock-service-role-key" : undefined),
    OPENAI_API_KEY:
      cleanEnvValue(process.env.OPENAI_API_KEY) ||
      cleanEnvValue(process.env.GEMINI_API_KEY) ||
      "not-configured",
    SHARE_LINK_SECRET: cleanEnvValue(process.env.SHARE_LINK_SECRET),
    AI_DEFAULT_MODEL: cleanEnvValue(process.env.AI_DEFAULT_MODEL) || "gpt-6.1-terra",
    AI_MODEL_SOL: cleanEnvValue(process.env.AI_MODEL_SOL) || "gpt-5.6-sol",
    AI_MODEL_TERRA: cleanEnvValue(process.env.AI_MODEL_TERRA) || "gpt-6.1-terra",
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
    getEnvLogger()?.error(
      { issues: parsed.error.format() },
      "Server environment validation failed",
    );
    throw new Error(`Server environment validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

