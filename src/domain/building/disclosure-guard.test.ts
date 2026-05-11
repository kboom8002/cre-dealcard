/**
 * Unit tests: Disclosure Guard Redaction
 *
 * Verifies that sensitive fields are detected and NOT present in blind/public output.
 * This is the most critical safety test for the MVP.
 *
 * Source: docs/11-gate-disclosure-policy.md section 6
 *         docs/14-test-plan.md section 3.2
 *         docs/18-demo-scenarios.md section 6 (Demo E)
 */
import { describe, it, expect } from "vitest";

// ─── Redaction utilities (inline — mirrors DisclosureGuardAgent logic) ────────

/** Exact patterns that must NEVER appear in blind/public output */
const FORBIDDEN_PATTERNS = {
  // Exact address indicators (Korean address patterns + lot numbers)
  exact_address: [
    /\d{1,5}-\d{1,5}/,            // lot number format: 000-00
    /성수동\s*\d/,                 // area + number
    /강남구\s*\d/,
    /마포구\s*\d/,
    /서울\s*\S+구\s*\S+동\s*\d/,  // full address
  ],
  // Tenant names (specific brand/business names after 층)
  tenant_name: [
    /\d층\s*[A-Za-z가-힣]+\s*(카페|병원|편의점|약국|식당|마트)/,
    /[A-Z가-힣]{2,8}\s*(카페|브랜드|프랜차이즈)/,
  ],
  // Unit-level rent amounts
  unit_rent: [
    /월세\s*\d+/,
    /보증금\s*\d+/,
    /임대료\s*\d+만/,
    /\d+만\s*원\s*(월세|임대)/,
  ],
  // Seller motivation
  seller_motivation: [
    /급매/,
    /빠른\s*협의/,
    /상속\s*문제/,
    /자금\s*압박/,
    /매도자.*원함/,
  ],
  // Forbidden claim types
  forbidden_claims: [
    /수익률.*상승/,
    /대출.*가능합니다/,
    /투자\s*가치가\s*높/,
    /안전한\s*투자/,
    /적정가입니다/,
    /법적\s*문제\s*없/,
  ],
};

function detectViolations(text: string): {
  violations: string[];
  safe: boolean;
} {
  const violations: string[] = [];
  for (const [category, patterns] of Object.entries(FORBIDDEN_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push(category);
        break;
      }
    }
  }
  return { violations, safe: violations.length === 0 };
}

// ─── Test data ────────────────────────────────────────────────────────────────

// Demo B/E raw memo — contains ALL sensitive fields
const RAW_BROKER_MEMO = `
성수동 000-00, 80억대 근생 건물입니다.
1층 A카페 월세 800만원, 2층 사무실 월세 450만원.
임차인 만기 2025년 8월.
매도자는 빠른 협의를 원함. 상속 문제로 급매입니다.
주소는 비공개 부탁드립니다.
`;

// Safe blind teaser output — redacted version
const SAFE_BLIND_TEASER = `
성수권역 80억대 근생형 자산입니다.
1층 F&B 업종 임차 중, 상업 수요 확인 필요.
임대차 상세는 자격 확인 후 제공됩니다.
거래 조건은 별도 협의 필요합니다.
이 딜카드는 공개 데이터와 중개사 메모를 기반으로 한 예비 자료입니다.
`;

// A teaser that accidentally leaked sensitive fields
const LEAKY_TEASER = `
성수동 000-00 소재 80억대 근생.
1층 A카페 월세 800만원 임차 중.
매도자는 빠른 협의를 원함.
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Disclosure Guard — Raw Memo Detection", () => {
  it("raw broker memo contains exact address pattern", () => {
    expect(/\d{1,5}-\d{1,5}/.test(RAW_BROKER_MEMO)).toBe(true);
  });

  it("raw broker memo contains tenant name pattern", () => {
    expect(/A카페/.test(RAW_BROKER_MEMO)).toBe(true);
  });

  it("raw broker memo contains unit rent pattern", () => {
    expect(/월세\s*\d+/.test(RAW_BROKER_MEMO)).toBe(true);
  });

  it("raw broker memo contains seller motivation pattern", () => {
    expect(/빠른\s*협의/.test(RAW_BROKER_MEMO)).toBe(true);
    expect(/급매/.test(RAW_BROKER_MEMO)).toBe(true);
  });
});

describe("Disclosure Guard — Safe Blind Teaser Passes", () => {
  it("safe blind teaser has no exact address violations", () => {
    const { violations } = detectViolations(SAFE_BLIND_TEASER);
    expect(violations).not.toContain("exact_address");
  });

  it("safe blind teaser has no tenant name violations", () => {
    const { violations } = detectViolations(SAFE_BLIND_TEASER);
    expect(violations).not.toContain("tenant_name");
  });

  it("safe blind teaser has no unit rent violations", () => {
    const { violations } = detectViolations(SAFE_BLIND_TEASER);
    expect(violations).not.toContain("unit_rent");
  });

  it("safe blind teaser has no seller motivation violations", () => {
    const { violations } = detectViolations(SAFE_BLIND_TEASER);
    expect(violations).not.toContain("seller_motivation");
  });

  it("safe blind teaser is disclosure-safe", () => {
    const { safe } = detectViolations(SAFE_BLIND_TEASER);
    expect(safe).toBe(true);
  });
});

describe("Disclosure Guard — Leaky Teaser is Detected", () => {
  it("leaky teaser fails with exact_address violation", () => {
    const { violations } = detectViolations(LEAKY_TEASER);
    expect(violations).toContain("exact_address");
  });

  it("leaky teaser fails with tenant_name violation", () => {
    const { violations } = detectViolations(LEAKY_TEASER);
    expect(violations).toContain("tenant_name");
  });

  it("leaky teaser fails with unit_rent violation", () => {
    const { violations } = detectViolations(LEAKY_TEASER);
    expect(violations).toContain("unit_rent");
  });

  it("leaky teaser is NOT disclosure-safe", () => {
    const { safe } = detectViolations(LEAKY_TEASER);
    expect(safe).toBe(false);
  });
});

describe("Disclosure Guard — Forbidden Claim Detection", () => {
  const UNSAFE_CLAIMS = [
    "이 건물은 수익률 상승이 가능합니다.",
    "대출 60% 가능합니다.",
    "투자 가치가 높습니다.",
    "안전한 투자처입니다.",
    "법적 문제 없습니다.",
  ];

  const SAFE_CLAIMS = [
    "임대수익 구조 확인 필요합니다.",
    "실제 대출 조건은 금융기관 정책에 따라 달라질 수 있습니다.",
    "조건에 부합할 수 있는 부분과 추가 확인이 필요한 부분을 검토하는 것이 좋습니다.",
    "이 리포트는 예비 검토 자료입니다.",
  ];

  for (const claim of UNSAFE_CLAIMS) {
    it(`detects forbidden claim: "${claim.slice(0, 20)}..."`, () => {
      const { violations } = detectViolations(claim);
      expect(violations).toContain("forbidden_claims");
    });
  }

  for (const claim of SAFE_CLAIMS) {
    it(`passes safe rewrite: "${claim.slice(0, 30)}..."`, () => {
      const { violations } = detectViolations(claim);
      expect(violations).not.toContain("forbidden_claims");
    });
  }
});

describe("Disclosure Guard — Field-Level Policy Matrix (docs/11 Table §5)", () => {
  it("exact_address is blocked in public_blind output", () => {
    // Per disclosure matrix: exact_address at G0 = blocked
    const { violations } = detectViolations("성수동 123-45");
    expect(violations).toContain("exact_address");
  });

  it("area_signal is allowed in public_blind output", () => {
    // Per disclosure matrix: area_signal at G0 = allowed
    const { violations } = detectViolations("성수권역 80억대");
    expect(violations).not.toContain("exact_address");
  });

  it("price_band is allowed in public_blind output", () => {
    // Per disclosure matrix: price_band at G0 = allowed as band
    const text = "80억대 근생형 자산";
    const { violations } = detectViolations(text);
    expect(violations).not.toContain("unit_rent");
  });
});
