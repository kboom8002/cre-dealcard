import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Load .env.local
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

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    restoreMocks: true,
    clearMocks: true,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    coverage: {
      reporter: ["text", "json-summary"],
      include: ["src/domain/**", "src/ai/schemas/**", "src/lib/**", "src/services/**"],
      exclude: ["src/**/*.test.ts"],
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


