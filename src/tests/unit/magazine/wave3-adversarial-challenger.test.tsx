// @vitest-environment jsdom
/**
 * @file src/tests/unit/magazine/wave3-adversarial-challenger.test.tsx
 * @description Wave 3 Adversarial Challenge & Empirical Stress Test Suite
 *
 * Verifies:
 * 1. parseKoreanManwonInput edge cases & boundary attacks:
 *    - '1천5백만원', '1.5억', '0', '0만', '-500', '', null, undefined, '1조', '십만', '백만', '삼천만'
 *    - Verify no NaN, no negative values, clean integer return (or null if invalid).
 * 2. ROI Calculator pre-filling via `cre-prefill-roi` and computeRoi mathematical resilience:
 *    - CustomEvent dispatch with extreme values (zero price, negative price, price < deposit, extreme rent,
 *      missing deposit, zero floors, negative floors)
 *    - Confirm calculation never divides by zero, never returns NaN/Infinity, and never throws.
 * 3. Server Component boundary:
 *    - Ensure `magazine-view.tsx` remains 100% compliant with server rendering (no 'use client', no hooks, no onClick).
 * 4. SubscribeCard phone-only submission:
 *    - Submit phone-only and confirm positive confirmation state renders without any NO_EMAIL_CONFIRM_CHANNEL warning box trap.
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import fs from "fs";
import path from "path";
import { parseKoreanManwonInput, RoiCalculator } from "@/components/magazine/RoiCalculator";
import { computeRoi, ROI_DEFAULTS, type RoiInputs } from "@/components/magazine/roi-calc";
import { SubscribeCard } from "@/components/magazine/SubscribeCard";
import * as subscribeApi from "@/components/magazine/subscribe-api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Wave 3 Adversarial Challenge Suite", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 1. parseKoreanManwonInput Edge Cases & Hostile Inputs
   * ────────────────────────────────────────────────────────────────────────── */
  describe("1. parseKoreanManwonInput Edge Cases & Hostile Inputs", () => {
    const testCases: Array<{ input: unknown; expected: number | null; label: string }> = [
      { input: "1천5백만원", expected: 1500, label: "복합 한글 수사 + 만원" },
      { input: "1.5억", expected: 15000, label: "소수점 억 단위" },
      { input: "0", expected: 0, label: "문자열 0" },
      { input: "0만", expected: 0, label: "문자열 0만" },
      { input: "-500", expected: null, label: "음수 문자열" },
      { input: "", expected: null, label: "빈 문자열" },
      { input: null, expected: null, label: "null" },
      { input: undefined, expected: null, label: "undefined" },
      { input: "1조", expected: null, label: "지원하지 않는 초과 단위(조)" },
      { input: "십만", expected: 10, label: "한글 수사 십만 (10만원)" },
      { input: "백만", expected: 100, label: "한글 수사 백만 (100만원)" },
      { input: "삼천만", expected: 1000, label: "아라비아 숫자 없는 수사 천 (안전 폴백 1000만원)" },
      // 추가 적대적 입력
      { input: -500, expected: null, label: "숫자 음수" },
      { input: -0, expected: 0, label: "음수 0" },
      { input: "   ", expected: null, label: "공백 문자열" },
      { input: "협의", expected: null, label: "비숫자 한글 텍스트" },
      { input: "!@#$%^&*", expected: null, label: "특수문자" },
      { input: NaN, expected: null, label: "NaN" },
      { input: Infinity, expected: null, label: "Infinity" },
      { input: -Infinity, expected: null, label: "-Infinity" },
      { input: "25,000,000", expected: 2500, label: "쉼표 포함 원 단위 문자열" },
      { input: 25_000_000, expected: 2500, label: "2500만 원 숫자" },
      { input: "3500", expected: 3500, label: "단순 3500" },
      { input: "1억", expected: 10000, label: "1억 (10,000만원)" },
      { input: "2억 5천만", expected: 25000, label: "2억 5천만" },
      { input: "5백만원", expected: 500, label: "5백만원" },
      { input: "3천5백만원", expected: 3500, label: "3천5백만원" },
    ];

    it.each(testCases)("$label: parseKoreanManwonInput($input) -> $expected", ({ input, expected }) => {
      const result = parseKoreanManwonInput(input);
      if (expected === 0) {
        expect(result === 0).toBe(true);
      } else {
        expect(result).toBe(expected);
      }

      // 불변식 검증: 결과는 null이거나 유한한 양의 정수이어야 함
      if (result !== null) {
        expect(typeof result).toBe("number");
        expect(Number.isFinite(result)).toBe(true);
        expect(Number.isNaN(result)).toBe(false);
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
      }
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 2. ROI Calculator pre-filling via cre-prefill-roi & computeRoi Resilience
   * ────────────────────────────────────────────────────────────────────────── */
  describe("2. ROI Calculator pre-filling via cre-prefill-roi & Math Resilience", () => {
    it("handles cre-prefill-roi with extreme inputs without crashing or divide-by-zero", async () => {
      await act(async () => {
        root.render(
          <RoiCalculator
            defaultPrice={5_000_000_000}
            defaultDeposit={500_000_000}
            defaultMonthlyRent={25_000_000}
            defaultTotalFloors={5}
          />
        );
      });

      // 1) 매매가 0원 전달 -> handlePrefill guard (purchasePrice > 0)로 거부되어 기본값 유지
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("cre-prefill-roi", {
            detail: { purchasePrice: 0 },
          })
        );
      });
      expect(container.textContent).toContain("Cap Rate");

      // 2) 음수 매매가 및 음수 월세 전달 -> 무시되어 크래시 없음
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("cre-prefill-roi", {
            detail: { purchasePrice: -50_000_000_000, monthlyRent: -10_000 },
          })
        );
      });
      expect(container.textContent).toContain("Cap Rate");

      // 3) 보증금이 매매가보다 큰 극단적 역전 상황
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("cre-prefill-roi", {
            detail: { purchasePrice: 1_000_000_000, deposit: 2_000_000_000 },
          })
        );
      });
      // 계산기 컴포넌트가 살아있고 정상 렌더되는지 확인
      expect(container.textContent).toContain("Cap Rate");

      // 4) 극단적 월세 (1조 원)
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("cre-prefill-roi", {
            detail: { monthlyRent: 1_000_000_000_000 },
          })
        );
      });
      expect(container.textContent).toContain("Cap Rate");

      // 5) 층수 0 또는 음수 전달 -> 무시
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("cre-prefill-roi", {
            detail: { totalFloors: 0 },
          })
        );
      });
      expect(container.textContent).toContain("Cap Rate");
    });

    it("computeRoi pure function strictly prevents divide-by-zero, NaN, and Infinity on extreme inputs", () => {
      const extremeInputs: RoiInputs[] = [
        // 매입가 0
        {
          ...ROI_DEFAULTS,
          purchasePrice: 0,
        },
        // 보증금 > 매입가
        {
          ...ROI_DEFAULTS,
          purchasePrice: 1_000_000_000,
          deposit: 2_000_000_000,
        },
        // 층수 0
        {
          ...ROI_DEFAULTS,
          totalFloors: 0,
          vacancyFloors: 0,
        },
        // 공실 > 층수
        {
          ...ROI_DEFAULTS,
          totalFloors: 3,
          vacancyFloors: 5,
        },
        // LTV 100%
        {
          ...ROI_DEFAULTS,
          ltvRatio: 100,
          interestRate: 10,
        },
        // 금리 0%
        {
          ...ROI_DEFAULTS,
          interestRate: 0,
        },
        // 월세 0
        {
          ...ROI_DEFAULTS,
          monthlyRent: 0,
        },
      ];

      for (const input of extremeInputs) {
        const res = computeRoi(input);
        expect(Number.isFinite(res.capRate)).toBe(true);
        expect(Number.isNaN(res.capRate)).toBe(false);

        expect(Number.isFinite(res.cashOnCash)).toBe(true);
        expect(Number.isNaN(res.cashOnCash)).toBe(false);

        expect(Number.isFinite(res.netYieldOnDeposit)).toBe(true);
        expect(Number.isNaN(res.netYieldOnDeposit)).toBe(false);

        expect(Number.isFinite(res.monthlyCashFlow)).toBe(true);
        expect(Number.isNaN(res.monthlyCashFlow)).toBe(false);

        expect(Number.isFinite(res.equity)).toBe(true);
        expect(res.equity).toBeGreaterThanOrEqual(1); // actualEquity minimum guard Math.max(..., 1)
      }
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 3. Server Component Boundary in magazine-view.tsx
   * ────────────────────────────────────────────────────────────────────────── */
  describe("3. Server Component Boundary Verification", () => {
    it("magazine-view.tsx adheres strictly to Server Component rules", () => {
      const filePath = path.resolve(
        process.cwd(),
        "src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx"
      );
      const content = fs.readFileSync(filePath, "utf-8");

      // 1) 'use client' 디렉티브 금지
      expect(content).not.toMatch(/^\s*['"]use client['"]/m);

      // 2) React 훅 호출 금지
      expect(content).not.toMatch(/\buse(State|Effect|Ref|Memo|Callback|Id|Context|LayoutEffect)\b\s*[(<]/);

      // 3) 인라인 이벤트 핸들러 금지 (onClick, onChange 등)
      expect(content).not.toMatch(/\bon(Click|Change|Error|Submit|Toggle)\s*=\s*\{/);

      // 4) motion/react 금지
      expect(content).not.toMatch(/from ['"]motion\/react['"]/);

      // 5) data-prefill-roi 와 data-roi-* 가 데이터 속성으로 안전하게 포함되어 있음
      expect(content).toContain('data-prefill-roi="true"');
      expect(content).toContain("data-roi-price=");
      expect(content).toContain("data-roi-rent=");
      expect(content).toContain("data-roi-deposit=");
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 4. SubscribeCard phone-only submission & positive confirmation
   * ────────────────────────────────────────────────────────────────────────── */
  describe("4. SubscribeCard Phone-Only Submission", () => {
    it("renders warm positive confirmation without any NO_EMAIL_CONFIRM_CHANNEL amber warning trap", async () => {
      // Mock postSubscribe to simulate phone-only submission resulting in NO_EMAIL_CONFIRM_CHANNEL
      const mockPostSubscribe = vi.spyOn(subscribeApi, "postSubscribe").mockResolvedValue({
        ok: true,
        status: "pending",
        pendingReason: "NO_EMAIL_CONFIRM_CHANNEL",
        message: "구독 신청이 접수되었습니다. 다만 이메일 주소가 없어 확인 링크를 보내드릴 수 없습니다.",
        notice: "확인 링크를 받을 이메일이 등록되지 않았습니다.",
      });

      await act(async () => {
        root.render(
          <SubscribeCard
            brokerId="test-broker"
            brokerPhone="010-1234-5678"
            source="magazine"
          />
        );
      });

      // 1) 초기 상태: '카카오톡으로 받기' 선택 (기본값)
      const phoneInput = container.querySelector<HTMLInputElement>('input[type="tel"]');
      expect(phoneInput).not.toBeNull();

      // 2) 전화번호 입력 및 동의 체크
      await act(async () => {
        if (phoneInput) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          )?.set;
          nativeInputValueSetter?.call(phoneInput, "010-9876-5432");
          phoneInput.dispatchEvent(new Event("input", { bubbles: true }));
          phoneInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });

      // 필수 동의 체크박스
      const consentAllCheckbox = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"][id*="sc-magazine-all"]'
      ) || container.querySelector<HTMLInputElement>('input[type="checkbox"]');
      await act(async () => {
        if (consentAllCheckbox) {
          consentAllCheckbox.click();
        }
      });

      // 3) 폼 제출
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      // 4) 긍정적 안내 상태 확인
      expect(container.textContent).toContain("🎉 구독 신청이 접수되었습니다!");
      expect(container.textContent).toContain("(이메일을 함께 남겨주시면 매주 발행 즉시 자동 발송됩니다)");

      // 5) NO_EMAIL_CONFIRM_CHANNEL 주황색(amber) 경고 박스 트랩이 없는지 확인
      expect(container.querySelector(".bg-amber-500")).toBeNull();
      expect(container.querySelector(".bg-amber-100")).toBeNull();
      expect(container.querySelector(".border-amber-400")).toBeNull();
      expect(container.querySelector(".text-amber-400")).toBeNull();

      // 6) 1-step 이메일 추가 입력 폼이 제공되는지 확인
      const followUpEmailInput = container.querySelector<HTMLInputElement>(
        'input[type="email"][placeholder*="hong@example.com"]'
      );
      expect(followUpEmailInput).not.toBeNull();

      mockPostSubscribe.mockRestore();
    });
  });
});
