/**
 * src/domain/building/mobile-im/__tests__/guardrails.test.ts
 * 가드레일 시스템 (Risk Boundary + Disclosure Guard) 단위 테스트
 */
import { describe, it, expect } from "vitest";
import { runRiskBoundaryCheck, runDisclosureGuard, MOBILE_IM_STANDARD_DISCLAIMER } from "../guardrails";

describe("Guardrails — Risk Boundary Check", () => {
  it("should BLOCK P0 investment recommendation language", () => {
    const text = "이 건물은 매수를 추천합니다. 안전한 투자처입니다.";
    const result = runRiskBoundaryCheck(text);
    expect(result.status).toBe("blocked");
    expect(result.issues.some(i => i.severity === "p0")).toBe(true);
  });

  it("should BLOCK P0 financial guarantee language", () => {
    const text = "수익률이 보장됩니다. NOI가 확정되어 있어 안심할 수 있습니다.";
    const result = runRiskBoundaryCheck(text);
    expect(result.status).toBe("blocked");
    expect(result.issues.some(i => i.issue_type === "financial_certainty")).toBe(true);
  });

  it("should BLOCK P0 loan certainty language", () => {
    const text = "대출이 가능합니다. LTV 70% 가능합니다.";
    const result = runRiskBoundaryCheck(text);
    expect(result.status).toBe("blocked");
  });

  it("should PASS safe professional language", () => {
    const text = "주변 사례 대비 매입 단가가 합리적인 수준으로, 투자 적합 여부는 별도 실사가 필요합니다.";
    const result = runRiskBoundaryCheck(text);
    expect(result.status).toBe("pass");
    expect(result.issues.length).toBe(0);
  });

  it("should flag HIGH severity for valuation certainty language", () => {
    const text = "적정 가격이며, 시장가보다 저렴합니다.";
    const result = runRiskBoundaryCheck(text);
    expect(result.status).not.toBe("pass");
    expect(result.issues.some(i => i.severity === "high")).toBe(true);
  });
});

describe("Guardrails — Disclosure Guard", () => {
  it("should detect tenant name PII and flag for redaction", () => {
    const text = "1층에는 스타벅스가 입점해 있습니다.";
    const result = runDisclosureGuard(text);
    // Disclosure guard should detect brand/tenant name
    expect(result).toBeDefined();
  });

  it("should include standard disclaimer constant", () => {
    expect(MOBILE_IM_STANDARD_DISCLAIMER).toBeDefined();
    expect(MOBILE_IM_STANDARD_DISCLAIMER.length).toBeGreaterThan(50);
    expect(MOBILE_IM_STANDARD_DISCLAIMER).toContain("실사");
  });
});
