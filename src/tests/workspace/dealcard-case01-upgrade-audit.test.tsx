// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { parseMemoIntoCard4, extractMemoExactAddressAndPrice } from "@/lib/deal-card/memo-pairing";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";
import {
  deriveDealCardHeadlineCandidates,
  pickFreshDealCardHeadline,
} from "@/lib/deal-card/copy-limits";
import { computeCard4Hash, type Card4Data } from "@/lib/deal-card/card4-schema";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { KakaoBubblePreview } from "@/components/broker/deal-card/KakaoBubblePreview";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { MemoImportModal } from "@/components/broker/deal-card/MemoImportModal";
import { hydrateItem } from "@/app/(broker)/broker/w/dealcards/_components/dealcards-types";
import { buildImItemFromDealCardRecord } from "@/app/(broker)/broker/w/im/_components/im-workspace-types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CASE_MEMOS = [
  {
    id: "CASE-01",
    memo: "서울특별시 마포구 동교동 189-6 더파크빌딩 근생빌딩 매각 희망가 77억, 대지 41.5평 / 연면적 128.9평(지하2층~지상4층, 2019년 신축급), 현 보증금 2억 1,000만 / 월세 1,820만(안정화 시 월 2,310만·수익률 3.73%), 홍대입구역 도보 6분 경의선숲길 공원 전면, 인근 블루보틀 상권 유동인구 풍부, 전층 만실 성업중 (박대표님 직통 010-9123-4567)",
    posture: "income",
    region: "마포구 동교동",
    area: "연면적 129평",
    priceBand: "70~80억",
    forbidden: ["189-6", "더파크빌딩", "블루보틀", "010-9123-4567", "박대표"],
  },
  {
    id: "CASE-02",
    memo: "서울특별시 서초구 서초동 1364-28 FM빌딩 사옥용 오피스 매각 230억, 대지 180.3평 / 연면적 636.7평(B1~6F), 자주식 주차 20대 완비, 양재역 3호선·신분당선 도보 4분 코너 각지, 상층 4~6층(약 274평) 잔금 즉시 사옥 입주 가능하며 저층부 월세 3,200만 안정 수취, 전층 임대 전환 시 월 6,500만 기대 (최상무 010-3344-8899)",
    posture: "owner_occupied",
    region: "서초구 서초동",
    area: "연면적 637평",
    priceBand: "220~240억",
    forbidden: ["1364-28", "FM빌딩", "010-3344-8899", "최상무"],
  },
  {
    id: "CASE-03",
    memo: "서울특별시 서초구 잠원동 26-14, 26-16 두원빌딩 신축·리모델링 부지 매각 242억 2,680만 원(평당 1.3억), 2필지 합산 대지 186.4평 / 연면적 614.9평(1990년 준공, 기득권 용적률 325.6%), 신사역 3호선·신분당선 도보 3분 코너 각지, 대수선 밸류애드 완료 시 월세 8,000만·기대수익률 4.14% 메디컬 타워 최적 (임사장님 02-544-8784)",
    posture: "value_add",
    region: "서초구 잠원동",
    area: "토지 186평",
    priceBand: "240~260억",
    forbidden: ["26-14", "26-16", "두원빌딩", "02-544-8784", "임사장"],
  },
  {
    id: "CASE-04",
    memo: "서울특별시 영등포구 당산동5가 11-47 근생빌딩 매각 희망가 115억, 대지 153.3평 / 연면적 436.0평(B1~5F, 준공업지역), 현 보증금 6억 6,000만 / 월세 2,480만(전세 월세전환·공실해소 안정화 시 월 3,480만·수익률 3.83%), 2·9호선 당산역 도보 4분 래미안 대단지 정문 코너, 고은약국·로뎀나무내과·카페 장기 성업중 (김원장 010-2255-7711)",
    posture: "income",
    region: "영등포구 당산동",
    area: "연면적 436평",
    priceBand: "100~120억",
    forbidden: ["11-47", "고은약국", "로뎀나무내과", "010-2255-7711", "김원장"],
  },
  {
    id: "CASE-05",
    memo: "서울특별시 영등포구 양평동4가 117, 134, 125-2 더레드빌딩 오피스빌딩 매각 250억, 3필지 대지 156.9평 / 연면적 753.5평(B1~10F, 2018년 신축급, 주차 23대), 현 보증금 6억 8,000만 / 월세 5,150만(8층·지하1층 공실 리스업 시 월 6,800만·관리비 별도), 9호선 급행 선유도역 도보 3분 사거리 코너, 1층 기아자동차 전시장 장기 성업중 (정전무 010-7788-9900)",
    posture: "income",
    region: "영등포구 양평동",
    area: "연면적 754평",
    priceBand: "240~260억",
    forbidden: ["117", "134", "125-2", "더레드빌딩", "기아자동차", "010-7788-9900", "정전무"],
  },
] as const;

describe("DealCard CASE-01 Upgrade & 5-Case Golden Audit", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("[E-03] parses CASE-01..05 memos cleanly with exact posture/region/area/priceBand and zero blind leaks or split parens", () => {
    for (const tc of CASE_MEMOS) {
      const card4 = parseMemoIntoCard4(tc.memo);
      expect(card4.posture, `${tc.id} posture`).toBe(tc.posture);
      expect(card4.region, `${tc.id} region`).toBe(tc.region);
      expect(card4.area, `${tc.id} area`).toBe(tc.area);
      expect(card4.priceBand, `${tc.id} priceBand`).toBe(tc.priceBand);

      const serialized = [card4.headline, card4.region, card4.use, card4.area, card4.priceBand, ...card4.points].join(" ");
      for (const token of tc.forbidden) {
        expect(serialized, `${tc.id} should mask ${token}`).not.toContain(token);
      }

      for (const pt of card4.points) {
        const openCount = (pt.match(/\(/g) || []).length;
        const closeCount = (pt.match(/\)/g) || []).length;
        expect(openCount, `${tc.id} balanced parens in "${pt}"`).toBe(closeCount);
      }

      const blindCheck = validateBlindPoints(card4.points, {
        region: card4.region,
        assetType: card4.use,
      });
      expect(blindCheck.isValid, `${tc.id} blind-guard violations: ${JSON.stringify(blindCheck.violations)}`).toBe(true);
    }
  });

  it("[Slide 3] generates varied non-repeating headlines and excludes '밸류업' / '검토'", () => {
    for (const posture of ["income", "owner_occupied", "value_add"] as const) {
      const candidates = deriveDealCardHeadlineCandidates({
        posture,
        points: ["역세권 도보 5분 내", "전 층 만실 안정 임차", "코너 입지 가시성"],
      });
      expect(candidates.length).toBeGreaterThanOrEqual(4);
      for (const c of candidates) {
        expect(c).not.toMatch(/밸류업|검토/);
      }
      const first = pickFreshDealCardHeadline({ posture, points: [] }, []);
      const second = pickFreshDealCardHeadline({ posture, points: [], headline: first }, [first]);
      const third = pickFreshDealCardHeadline(
        { posture, points: [], headline: second },
        [first, second]
      );
      expect(first).not.toBe(second);
      expect(second).not.toBe(third);
      expect(first).not.toMatch(/밸류업|검토/);
      expect(second).not.toMatch(/밸류업|검토/);
    }
  });

  it("[Slide 4 + E-05 + E-08] renders chips BELOW point inputs, replaces focused cursor slot, converts single price, and hides elevator chip when absent", async () => {
    let latest: Card4Data = {
      headline: "안정 임대수익 매물",
      posture: "income",
      region: "마포구 동교동",
      use: "근린생활시설",
      area: "연면적 129평",
      priceBand: "77억",
      points: ["기존 장점 1", "기존 장점 2", "기존 장점 3"],
      provenance: { points: ["broker", "broker", "broker"] },
      card4_version: 1,
    };

    const Harness = () => {
      const [state, setState] = React.useState<Card4Data>(latest);
      return (
        <Card4ConfirmCard
          card4={state}
          memoText="서울특별시 마포구 동교동 189-6 승강기 0대 경의선숲길 공원 전면"
          onChange={(next) => {
            latest = next;
            setState(next);
          }}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    // E-08: 승강기 0대 -> 승강기 완비 건물 칩 숨김 & 공원·숲길 전면 입지 노출
    expect(container.querySelector('[data-testid="dealcard-strength-chip-cond_elev"]')).toBeNull();
    expect(container.querySelector('[data-testid="dealcard-strength-chip-loc_park"]')).not.toBeNull();

    // Slide 4 layout: chips BELOW 장점 3 input
    const thirdInput = container.querySelector('[data-testid="card4-point-input-2"]')!;
    const chipBox = container.querySelector('[data-testid="dealcard-strength-tag-chips"]')!;
    expect(
      Boolean(thirdInput.compareDocumentPosition(chipBox) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);

    // Cursor-first replacement: focus 장점 1 -> click chip -> replaces points[0] NOT points[2]
    const firstInput = container.querySelector('[data-testid="card4-point-input-0"]') as HTMLInputElement;
    await act(async () => {
      firstInput.focus();
    });
    expect(
      container.querySelector('[data-testid="dealcard-strength-tag-caption"]')?.textContent
    ).toContain("장점 1 선택됨");

    await act(async () => {
      (container.querySelector('[data-testid="dealcard-strength-chip-loc_corner"]') as HTMLButtonElement).click();
    });
    expect(latest.points[0]).toBe("코너 입지 가시성");
    expect(latest.points[2]).toBe("기존 장점 3");

    // E-05: inline price band warning + 1-click converter
    expect(container.querySelector('[data-testid="card4-priceband-warning"]')).not.toBeNull();
    const convertBtn = container.querySelector('[data-testid="card4-priceband-convert-btn"]') as HTMLButtonElement;
    expect(convertBtn.textContent).toContain("70~80억");
    await act(async () => {
      convertBtn.click();
    });
    expect(latest.priceBand).toBe("70~80억");
    expect(container.querySelector('[data-testid="card4-priceband-warning"]')).toBeNull();
  });

  it("[Slide 1] ConfirmDeleteModal enforces exact trimmed match when requireMatchText is set and 1-click when omitted", async () => {
    const onConfirm = vi.fn();
    await act(async () => {
      root.render(
        <ConfirmDeleteModal
          isOpen
          portal={false}
          title="삭제 확인"
          description="테스트 설명"
          requireMatchText="동교동 더파크빌딩"
          onCancel={() => {}}
          onConfirm={onConfirm}
        />
      );
    });

    const confirmBtn = container.querySelector('[data-testid="confirm-delete-confirm-btn"]') as HTMLButtonElement;
    const matchInput = container.querySelector('[data-testid="confirm-delete-match-input"]') as HTMLInputElement;
    expect(confirmBtn.disabled).toBe(true);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(matchInput, "  동교동 더파크빌딩 ");
      matchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirmBtn.disabled).toBe(false);
    await act(async () => {
      confirmBtn.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Without requireMatchText -> 1-click confirm
    onConfirm.mockClear();
    await act(async () => {
      root.render(
        <ConfirmDeleteModal
          isOpen
          portal={false}
          title="샘플 삭제"
          description="1클릭"
          onCancel={() => {}}
          onConfirm={onConfirm}
        />
      );
    });
    const simpleBtn = container.querySelector('[data-testid="confirm-delete-confirm-btn"]') as HTMLButtonElement;
    expect(container.querySelector('[data-testid="confirm-delete-match-input"]')).toBeNull();
    expect(simpleBtn.disabled).toBe(false);
  });

  it("[Slide 2] MemoImportModal supports sort controls, explicit load, and 2-step delete", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: [
          {
            id: "memo-old",
            memo_text: "가나다 서초구 사옥 230억",
            routing_type: "new_deal",
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "memo-new",
            memo_text: "하남 물류센터 120억",
            routing_type: "new_deal",
            created_at: "2026-11-20T00:00:00.000Z",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const onSelect = vi.fn();
    const onDelete = vi.fn();

    await act(async () => {
      root.render(
        <MemoImportModal
          isOpen
          onClose={() => {}}
          onSelectMemo={onSelect}
          onDeleteMemo={onDelete}
        />
      );
    });
    await act(async () => {});

    expect(document.body.querySelector('[data-testid="memo-import-sort-newest"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="memo-import-sort-oldest"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="memo-import-sort-pinned"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="memo-import-sort-alphabetical"]')).not.toBeNull();

    // Sort controls work (alphabetical moves '가나다' before '하남')
    await act(async () => {
      (document.body.querySelector('[data-testid="memo-import-sort-alphabetical"]') as HTMLButtonElement).click();
    });
    const loadBtns = Array.from(document.body.querySelectorAll('[data-testid^="memo-import-item-"]'));
    expect(loadBtns[0]?.getAttribute("data-testid")).toBe("memo-import-item-memo-old");

    // Delete 2-step
    await act(async () => {
      (document.body.querySelector('[data-testid="memo-import-delete-memo-old"]') as HTMLButtonElement).click();
    });
    expect(document.body.querySelector('[data-testid="memo-import-delete-confirm-memo-old"]')).not.toBeNull();
    await act(async () => {
      (document.body.querySelector('[data-testid="memo-import-delete-confirm-memo-old"]') as HTMLButtonElement).click();
    });
    expect(onDelete).toHaveBeenCalledWith("memo-old");

    // Load
    await act(async () => {
      (document.body.querySelector('[data-testid="memo-import-item-memo-new"]') as HTMLButtonElement).click();
    });
    expect(onSelect).toHaveBeenCalledWith("하남 물류센터 120억");
  });

  it("[Slide 5] KakaoBubblePreview omits 매물 주요 제원 section", async () => {
    await act(async () => {
      root.render(
        <KakaoBubblePreview
          card4={{
            headline: "연 3.7% 만실 근생 매물",
            posture: "income",
            region: "마포구 동교동",
            use: "근린생활시설",
            area: "연면적 129평",
            priceBand: "70~80억",
            points: ["현 보증금 2억 1,000만", "월세 1,820만 임대수익", "홍대입구역 도보 6분"],
            provenance: { points: ["ai", "ai", "ai"] },
            card4_version: 1,
          }}
        />
      );
    });
    expect(container.querySelector('[data-testid="preview-dealcard-3tier-specs"]')).toBeNull();
    expect(container.textContent).not.toContain("매물 주요 제원");
  });

  it("[E-04 + E-07 + E-09] IM handoff preserves exact CASE-01 specs, hydrateItem recovers area from memo, and hash tracks posture", () => {
    const exact = extractMemoExactAddressAndPrice(CASE_MEMOS[0].memo);
    expect(exact.exactAddress).toBe("서울특별시 마포구 동교동 189-6");
    expect(exact.askingPriceManwon).toBe(770000);
    expect(exact.floorsAbove).toBe(4);
    expect(exact.floorsBelow).toBe(2);

    const card4 = parseMemoIntoCard4(CASE_MEMOS[0].memo);
    const imItem = buildImItemFromDealCardRecord({
      id: "dc-case01",
      title: "마포구 동교동",
      memoText: CASE_MEMOS[0].memo,
      card4,
    });
    expect(imItem).not.toBeNull();
    expect(imItem?.address).toBe("서울특별시 마포구 동교동 189-6");
    expect(imItem?.askingPriceManwon).toBe(770000);
    expect(imItem?.completionDate).toBe("2019-01-01");
    expect(imItem?.floorsAbove).toBe(4);
    expect(imItem?.floorsBelow).toBe(2);
    expect(imItem?.axiosHighlights?.map((h) => h.headline)).toEqual(card4.points);

    // E-07: hydrateItem recovers area from memoText
    const legacyCard4: Card4Data = {
      headline: "연 3.8% 수익형 근생",
      posture: "income",
      region: "영등포구 당산동",
      use: "근린생활시설",
      priceBand: "100~120억",
      points: ["전층 임대 운영 중", "당산역 도보 4분", "코너 입지"],
      provenance: { points: ["ai", "ai", "ai"] },
      card4_version: 1,
    };
    const hydrated = hydrateItem({
      memoText: CASE_MEMOS[3].memo,
      card4: legacyCard4,
    });
    expect(hydrated.card4.area).toBe("연면적 436평");

    // E-09: posture affects computeCard4Hash while omitting posture keeps legacy hash identical
    const legacyA = computeCard4Hash({
      region: "마포구 동교동",
      use: "근린생활시설",
      priceBand: "70~80억",
      points: ["A", "B", "C"],
    });
    const legacyB = computeCard4Hash({
      region: "마포구 동교동",
      use: "근린생활시설",
      priceBand: "70~80억",
      points: ["A", "B", "C"],
    });
    expect(legacyA).toBe(legacyB);

    const incomeHash = computeCard4Hash({
      posture: "income",
      region: "마포구 동교동",
      use: "근린생활시설",
      priceBand: "70~80억",
      points: ["A", "B", "C"],
    });
    const valueHash = computeCard4Hash({
      posture: "value_add",
      region: "마포구 동교동",
      use: "근린생활시설",
      priceBand: "70~80억",
      points: ["A", "B", "C"],
    });
    expect(incomeHash).not.toBe(valueHash);
  });
});
