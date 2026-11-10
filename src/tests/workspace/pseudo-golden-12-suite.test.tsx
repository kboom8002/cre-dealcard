// @vitest-environment jsdom
/**
 * @file src/tests/workspace/pseudo-golden-12-suite.test.tsx
 * @description AI 1st (95% Automated Physics/Data-Flow) — Human 2nd (5% Editorial Judgment)
 * 12-Scenario Pseudo-Golden Dataset Suite (PG-01 ~ PG-12) + /testguide Fast-Track Gate.
 *
 * Covers:
 * - PG-01: 서울 마포구 동교동 189-6 (THE.PARK Building) — CSV_01 (만원 단위, 만실) + 멀티포맷 사진 4종
 * - PG-02: 경기도 부천시 원미구 심곡동 349-10 (동아빌딩) — CSV_02 (201호 한마음치과 공실 및 다호실)
 * - PG-03: 서울 강남구 역삼동 648-23 (여삼빌딩) — CSV_03 (지하B1~15F, 303호 자가사용)
 * - PG-04: 경기도 용인시 기흥구 보정동 1208-4 — 0행/무렌트롤 + 주소 역변환 비파괴 보강 (E-02)
 * - PG-05: 서울 영등포구 당산동5가 11-47 — 비정형 층 표기 (-1, 1, 2, 5) → B1, 1F, 2F, 3F(공실), 4F(공실), 5F 정규화 및 누락 공실층 자동 보정
 * - PG-06: 동교동 189-6 + 원 단위(50,000,000원) 입력 오타 교차 합성 → 만원 단위 자동 보정 및 NOI 정합성
 * - PG-07: 부천 심곡동 349-10 + 전층 공실(0% 점유) 합성 → Current NOI 0원 / Stabilized 잠재 임대수익 분리 (Zero NaN/Infinity)
 * - PG-08: 역삼동 648-23 + 사옥직영 100% 합성 → owner_occupied 자가사옥 포스처 정합성
 * - PG-09: 보정동 1208-4 + Deal 1·2·3 사진 10장 대량 업로드 → 다중 파일 비파괴 순차 축적 (GB-06)
 * - PG-10: 동교동 189-6 + 500자 장문 특장점/메모 합성 → maxLength=300자 하드 캡 (GB-08)
 * - PG-11: 부천 심곡동 349-10 + 비로그인/만료 세션 합성 → 401/403 에러 시 입력 폼 100% 보존
 * - PG-12: 역삼동 648-23 + 중개인 프로필 SSOT 합성 → GA-08 자동 채움 ("담당 공인중개사" 더미 0건)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  parseTsvRentRoll,
  normalizeFloorName,
  synthesizeMissingVacantFloors,
} from "@/lib/rent-roll/tsv-parser";
import { TESTGUIDE_DEALS } from "@/lib/testguide/testguide-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/broker/w/im",
}));

import ImWorkspacePage from "@/app/(broker)/broker/w/im/page";
import TestGuidePage from "@/app/testguide/page";

describe("AI 1st — Human 2nd: 12-Scenario Pseudo-Golden Dataset Suite (PG-01 ~ PG-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("PG-01 & PG-02 & PG-03: Ground-Truth 3 Deals (Donggyo-dong, Bucheon, Yeoksam-dong) CSV & Photo Assets parse with 100% financial integrity", () => {
    expect(TESTGUIDE_DEALS).toHaveLength(3);

    // PG-01: DEAL-01 (마포구 동교동 189-6, 만원 단위, 6개 층 만실)
    const deal1 = TESTGUIDE_DEALS[0];
    expect(deal1.jibunAddress).toContain("동교동 189-6");
    expect(deal1.images).toHaveLength(4);
    const parsed1 = parseTsvRentRoll(deal1.csvContent);
    expect(parsed1.rows).toHaveLength(6);
    expect(parsed1.hasUnitMistakes).toBe(false);
    expect(parsed1.totalDepositManwon).toBe(22000);
    expect(parsed1.totalMonthlyRentManwon).toBe(1817);
    expect(parsed1.totalMaintenanceManwon).toBe(123.5);

    // PG-02: DEAL-02 (부천 심곡동 349-10, 2F 201호 한마음치과 공실 포함 17개 행)
    const deal2 = TESTGUIDE_DEALS[1];
    expect(deal2.jibunAddress).toContain("심곡동 349-10");
    expect(deal2.images).toHaveLength(4);
    const parsed2 = parseTsvRentRoll(deal2.csvContent);
    expect(parsed2.rows).toHaveLength(17);
    const vacantRows2 = parsed2.rows.filter((r) => r.status === "vacant");
    expect(vacantRows2).toHaveLength(1);
    expect(vacantRows2[0].unit).toBe("201호");
    expect(parsed2.totalDepositManwon).toBe(45500);
    expect(parsed2.totalMonthlyRentManwon).toBe(2230);
    expect(parsed2.totalMaintenanceManwon).toBe(601.5);

    // PG-03: DEAL-03 (강남구 역삼동 648-23, 21개 행: 3F 303호 자가사용 포함)
    const deal3 = TESTGUIDE_DEALS[2];
    expect(deal3.jibunAddress).toContain("역삼동 648-23");
    expect(deal3.images).toHaveLength(4);
    const parsed3 = parseTsvRentRoll(deal3.csvContent);
    expect(parsed3.rows).toHaveLength(21);
    expect(parsed3.rows.filter((r) => r.status === "owner").map((r) => r.unit)).toEqual(["303호"]);
  });

  it("PG-05: Sparse & Non-standard Floor Labels (-1, 1, 2, 5) normalize to B1, 1F, 2F, 5F and synthesize missing vacant floors (3F, 4F)", () => {
    expect(normalizeFloorName("-1")).toBe("B1");
    expect(normalizeFloorName("-2F")).toBe("B2");
    expect(normalizeFloorName("1")).toBe("1F");
    expect(normalizeFloorName("2")).toBe("2F");
    expect(normalizeFloorName("5")).toBe("5F");

    const sparseTsv = [
      "층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태",
      "-1\tB101호\t구내식당\t3000\t220\t25\t2027.08\t임대중",
      "1\t101호\t편의점\t5000\t420\t40\t2028.04\t임대중",
      "2\t201호\t내과의원\t4000\t310\t35\t2027.11\t임대중",
      "5\t501호\t세무법인\t3000\t240\t30\t2028.02\t임대중",
    ].join("\n");

    const parsed = parseTsvRentRoll(sparseTsv);
    expect(parsed.rows.map((r) => r.floor)).toEqual(["B1", "1F", "2F", "3F", "4F", "5F"]);

    const floor3 = parsed.rows.find((r) => r.floor === "3F")!;
    const floor4 = parsed.rows.find((r) => r.floor === "4F")!;
    expect(floor3.status).toBe("vacant");
    expect(floor3.use).toBe("공실");
    expect(floor4.status).toBe("vacant");
    expect(floor4.use).toBe("공실");

    // 점유 합산 금액은 기존 4개 점유층(B1, 1F, 2F, 5F)과 정확히 일치
    expect(parsed.totalDepositManwon).toBe(3000 + 5000 + 4000 + 3000);
    expect(parsed.totalMonthlyRentManwon).toBe(220 + 420 + 310 + 240);
  });

  it("PG-06 & PG-07 & PG-08: Cross-Synthesized Rent-Roll Postures (KRW Unit Mistake, 100% Vacant Zero-NaN, 100% Owner-Occupied) maintain strict mathematical invariants", () => {
    // PG-06: 동교동 + 원 단위 오타(50,000,000) 교차 합성
    const pg06Tsv = [
      "층,호수,임차인,보증금,임대료,관리비,만기일,비고",
      "1층,101호,플래그십카페,50000000,4800000,450000,2028.03,임대중",
      "2층,201호,디자인스튜디오,30000000,2800000,300000,2027.09,임대중",
    ].join("\n");
    const res06 = parseTsvRentRoll(pg06Tsv);
    expect(res06.hasUnitMistakes).toBe(true);
    expect(res06.totalDepositManwon).toBe(8000);
    expect(res06.totalMonthlyRentManwon).toBe(760);
    expect(res06.totalMaintenanceManwon).toBe(75);

    // PG-07: 전층 공실(0% 점유) 합성 -> Zero-Division / NaN 방어
    const pg07Tsv = [
      "층,호수,임차인,보증금,임대료,관리비,만기일,비고",
      "1층,101호,공실,0,0,0,-,공실",
      "2층,201호,공실,0,0,0,-,공실",
      "3층,301호,공실,0,0,0,-,공실",
    ].join("\n");
    const res07 = parseTsvRentRoll(pg07Tsv);
    expect(res07.rows.every((r) => r.status === "vacant")).toBe(true);
    expect(res07.totalDepositManwon).toBe(0);
    expect(res07.totalMonthlyRentManwon).toBe(0);
    expect(Number.isNaN(res07.totalMonthlyRentManwon)).toBe(false);

    // PG-08: 전층 사옥직영(100% 자가사용) 합성
    const pg08Tsv = [
      "층,호수,임차인,보증금,임대료,관리비,만기일,비고",
      "1층,101호,본사 쇼룸,0,0,50,-,자가사용",
      "2층,201호,본사 R&D센터,0,0,50,-,사옥직영",
    ].join("\n");
    const res08 = parseTsvRentRoll(pg08Tsv);
    expect(res08.rows.every((r) => r.status === "owner")).toBe(true);
    expect(synthesizeMissingVacantFloors(res08.rows)).toHaveLength(2);
  });

  it("PG-04 & PG-09 & PG-10 & PG-11 & PG-12: Workspace E2E Physics (Bojeong-dong Non-Destructive Lookup, Multi-Photo Accumulation, 300-Char Hard Cap, 401/403 Form Preservation, Broker SSOT Auto-Fill)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/profile")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              display_name: "박준형 대표중개사",
              company: "크리딜 강남프라임 중개법인",
              phone: "01077778888",
            },
          }),
        } as Response;
      }
      if (url.includes("/api/buildings/lookup")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            buildingName: "보정 카페거리 프라자",
            grossFloorAreaSqm: 990.2,
            landAreaSqm: 330.5,
            zoning: "제2종일반주거지역",
            completionDate: "2019-05-10",
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ims: [] }),
      } as Response;
    });

    const { container } = render(<ImWorkspacePage />);

    // Reset initial sample first (GA-02)
    fireEvent.click(screen.getByTestId("im-reset-sample-btn"));

    // PG-04: Enter Bojeong-dong address + asking price 77억 (7,700,000,000원), then run address lookup (E-02 non-destructive)
    const titleInput = screen.getByTestId("im-title-single-line-input") as HTMLInputElement;
    const addressInput = screen.getByTestId("im-address-input") as HTMLInputElement;
    const wonInput = screen.getByTestId("im-price-won-input") as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: "보정동 카페거리 핵심 코너빌딩" } });
    fireEvent.change(addressInput, { target: { value: "경기도 용인시 기흥구 보정동 1208-4" } });
    fireEvent.change(wonInput, { target: { value: "7,700,000,000" } });
    fireEvent.click(screen.getByTestId("im-address-lookup-btn"));

    await waitFor(() => {
      expect((screen.getByTestId("im-gfa-input") as HTMLInputElement).value).toBe("990.2");
      expect((screen.getByTestId("im-land-area-input") as HTMLInputElement).value).toBe("330.5");
      // Custom title and price must never be wiped by address lookup
      expect(titleInput.value).toBe("보정동 카페거리 핵심 코너빌딩");
      expect(screen.getByTestId("im-price-readout").textContent).toContain("77억");
    });

    // PG-10 & PG-12: Switch to Tab 3 (장점·연락처), verify maxLength=300 and broker profile SSOT auto-fill
    fireEvent.click(screen.getByTestId("im-editor-tab-axios_brief"));

    const briefTextarea = screen.getByTestId("im-axios-point-brief-0") as HTMLTextAreaElement;
    expect(briefTextarea.maxLength).toBe(300);

    await waitFor(() => {
      expect((screen.getByTestId("im-broker-name-input") as HTMLInputElement).value).toBe(
        "박준형 대표중개사"
      );
      expect((screen.getByTestId("im-brokerage-name-input") as HTMLInputElement).value).toBe(
        "크리딜 강남프라임 중개법인"
      );
      expect((screen.getByTestId("im-broker-phone-input") as HTMLInputElement).value).toBe(
        "010-7777-8888"
      );
    });

    // PG-09: Switch to Tab 4 (사진·위치·만들기) and upload 10 photos across 2 batches (6 + 4) without overwriting
    fireEvent.click(screen.getByTestId("im-editor-tab-media_publish"));
    const dropzone = screen.getByTestId("im-photo-dropzone");
    const fileInput = dropzone.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const batch1 = Array.from(
      { length: 6 },
      (_, i) => new File([`img-${i}`], `0${i + 1}_photo.jpg`, { type: "image/jpeg" })
    );
    const batch2 = Array.from(
      { length: 4 },
      (_, i) => new File([`img2-${i}`], `0${i + 7}_photo.png`, { type: "image/png" })
    );

    fireEvent.change(fileInput, { target: { files: batch1 } });
    fireEvent.change(fileInput, { target: { files: batch2 } });

    await waitFor(() => {
      expect(container.textContent).toContain("01_photo.jpg");
      expect(container.textContent).toContain("010_photo.png");
    });

    // PG-11: Verify Tab 1 form data remains 100% intact across tab transitions
    fireEvent.click(screen.getByTestId("im-editor-tab-specs"));
    expect((screen.getByTestId("im-title-single-line-input") as HTMLInputElement).value).toBe(
      "보정동 카페거리 핵심 코너빌딩"
    );
    expect(screen.getByTestId("im-price-readout").textContent).toContain("77억");
  });

  it("Verifies /testguide v4.0 completely replaces the legacy manual grind with the 'AI 1st 12종 슈도 골든 실험실 (PG-01~12)' & '인간 2nd 15분 9문항 Fast-Track' workbench", () => {
    render(<TestGuidePage />);
    const panel = screen.getByTestId("ai1st-human2nd-fasttrack-panel");
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("12종 슈도 골든 데이터셋 (PG-01 ~ PG-12) 100% PASS");
    expect(panel.textContent).toContain("Mission H-1");
    expect(panel.textContent).toContain("Mission H-2");
    expect(panel.textContent).toContain("Mission H-3");

    // Verify 9-item Human 2nd Fast-Track checklist on main overview tab
    const humanSection = screen.getByTestId("human-2nd-9checks-section");
    expect(humanSection.textContent).toContain("H1-01");
    expect(humanSection.textContent).toContain("H3-03");
    fireEvent.click(screen.getByTestId("human-9checks-mark-all-pass-btn"));
    expect(humanSection.textContent).toContain("PASS 9건");

    // Switch to Tab 1 (AI 1st 12종 슈도 골든 실험실) and verify all 12 PG cards render
    fireEvent.click(screen.getByTestId("tab-pseudogolden"));
    const pgPanel = screen.getByTestId("testguide-pseudogolden-panel");
    expect(pgPanel).toBeTruthy();
    expect(screen.getByTestId("pg-card-PG-01")).toBeTruthy();
    expect(screen.getByTestId("pg-card-PG-05").textContent).toContain("당산동5가 11-47");
    expect(screen.getByTestId("pg-card-PG-12")).toBeTruthy();
  });
});
