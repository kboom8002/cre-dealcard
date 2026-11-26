import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Hermetic by default: only load .env.local when explicitly opted into live env
if (process.env.VITEST_USE_LIVE_ENV === "1") {
  if (fs.existsSync(".env.local")) {
    const envContent = fs.readFileSync(".env.local", "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const equalsIdx = trimmed.indexOf("=");
        if (equalsIdx !== -1) {
          const key = trimmed.slice(0, equalsIdx).trim();
          const value = trimmed.slice(equalsIdx + 1).trim();
          process.env[key] = value;
        }
      }
    }
  }
} else {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://mock.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "mock-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "mock-service-role-key";
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  process.env.SHARE_LINK_SECRET ??= "ci-test-share-link-secret-minimum-32-chars-ok";
  process.env.UNSUBSCRIBE_SECRET ??= "ci-test-unsub-secret-minimum-32-chars-ok";
  process.env.CRON_SECRET ??= "ci-test-cron-secret-minimum-32-chars-ok";
  process.env.APP_BASE_URL ??= "http://localhost:3000";
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ["src/tests/setup/magazine-env-guard.ts"],
    include: ["src/**/*.test.{ts,tsx}", "__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    coverage: {
      reporter: ["text", "json-summary"],
      include: ["src/proxy.ts", "src/domain/**", "src/ai/**", "src/lib/**", "src/services/**"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/types/**"],
      thresholds: {
        lines: 45,
        functions: 40,
        branches: 35,
        statements: 45,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});


