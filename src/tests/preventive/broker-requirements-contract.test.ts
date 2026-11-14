/**
 * @file src/tests/preventive/broker-requirements-contract.test.ts
 * @description T4 CI 계약 테스트 — 모든 중개인 요구사항(BR)이 고유 ID·합격 기준·실제 존재하는 자동 테스트 파일에 1:1 연결되어 있는지 검증합니다.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { BROKER_REQUIREMENTS_REGISTRY } from "@/lib/qa/broker-requirements-registry";
import { QA_OUTBOUND_CHANNEL_POLICY } from "@/lib/qa/build-stamp";

describe("T4 Contract: Broker Requirements Registry (BR-001~BR-012) & QA Channel Policy", () => {
  it("maps every BR entry to unique IDs, non-empty acceptance criteria, bias policy, and real test files", () => {
    expect(BROKER_REQUIREMENTS_REGISTRY.length).toBeGreaterThanOrEqual(12);

    const seenIds = new Set<string>();
    const repoRoot = process.cwd();

    for (const br of BROKER_REQUIREMENTS_REGISTRY) {
      expect(br.id).toMatch(/^BR-\d{3}$/);
      expect(seenIds.has(br.id)).toBe(false);
      seenIds.add(br.id);

      expect(br.title.trim().length).toBeGreaterThan(5);
      expect(br.acceptanceCriteria.trim().length).toBeGreaterThan(10);
      expect(br.linkedTestFiles.length).toBeGreaterThanOrEqual(1);

      if (br.biasTag === "취향") {
        expect((br.defaultPolicyNote || "").trim().length).toBeGreaterThan(5);
      }

      for (const relPath of br.linkedTestFiles) {
        const absPath = path.resolve(repoRoot, relPath);
        expect(
          fs.existsSync(absPath),
          `[${br.id}] linked test file missing: ${relPath}`
        ).toBe(true);

        const content = fs.readFileSync(absPath, "utf8");
        expect(
          /\b(it|test)\s*\(/.test(content),
          `[${br.id}] linked test file has no test cases: ${relPath}`
        ).toBe(true);
      }
    }
  });

  it("enforces confirmed outbound QA policy (email live allowed, Kakao Alimtalk held)", () => {
    expect(QA_OUTBOUND_CHANNEL_POLICY.emailLiveAllowed).toBe(true);
    expect(QA_OUTBOUND_CHANNEL_POLICY.alimtalkLiveAllowed).toBe(false);
  });
});
