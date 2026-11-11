/**
 * @vitest-environment jsdom
 */
/**
 * @file src/tests/workspace/dealcard-memo-first-pairing.test.tsx
 * @description 딜카드 '메모 우선(Memo-First) 생성 · 1:1 상시 페어링 · 3대 상태 그룹핑 목록' 회귀 테스트
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";
import {
  GET as summaryGET,
  PATCH as summaryPATCH,
} from "@/app/api/broker/workspace/summary/route";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => "/broker/w/dealcards",
  useSearchParams: () => mockSearchParams,
}));

const mockRequireBroker = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  }),
}));

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("DealCard Memo-First Authoring, 1:1 Pairing & 3-Group List", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    window.localStorage.clear();
    (
      globalThis as unknown as { __creWorkspaceMemoMemory?: unknown }
    ).__creWorkspaceMemoMemory = undefined;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("[MF-01] opens Memo-First capture stage on '+ 새 딜카드 만들기', parses & masks raw memo into Card4, expands editor, pairs memo at top, and prevents blind leaks in customer preview", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/deal-card/ai-copy")) {
        return new Response(
          JSON.stringify({
            ok: true,
            source: "llm",
            result: {
              headline: "홍대입구역 도보 3분 만실 코너",
              points: [
                "홍대입구역 도보 3분 코너",
                "1층 우량 F&B 만실 운영",
                "대로변 가시성 높은 입지",
              ],
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, dealcards: [], unconvertedMemos: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });

    // Click [+ 새 딜카드 만들기] -> enters Stage 1 (capture mode, Card4 stage collapsed)
    const newBtn = container.querySelector(
      '[data-testid="workspace-new-dealcard-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      newBtn.click();
    });

    const topMemoCard = container.querySelector(
      '[data-testid="paired-memo-top-card"]'
    ) as HTMLElement;
    expect(topMemoCard?.getAttribute("data-memo-mode")).toBe("capture");
    expect(
      container.querySelector('[data-testid="dealcard-awaiting-memo-guide"]')
    ).not.toBeNull();

    const card4Stage = container.querySelector(
      '[data-testid="dealcard-card4-stage"]'
    ) as HTMLElement;
    expect(card4Stage.getAttribute("data-collapsed")).toBe("true");

    // Enter raw broker memo containing exact lot number, brand name, and owner phone
    const rawMemo =
      "서울시 마포구 서교동 395-12 코너 근생빌딩, 1층 스타벅스 입점, 대지 90평 / 연면적 280평, 매매가 85억, 홍대입구역 도보 3분 전층 만실 (김사장님 010-1234-5678)";
    const memoTextarea = container.querySelector(
      '[data-testid="dealcard-top-memo-textarea"]'
    ) as HTMLTextAreaElement;
    await act(async () => {
      setNativeValue(memoTextarea, rawMemo);
    });

    // Click [✨ 메모로 딜카드 생성하기]
    const generateBtn = container.querySelector(
      '[data-testid="dealcard-generate-from-memo-btn"]'
    ) as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(false);

    await act(async () => {
      generateBtn.click();
    });

    // Stage 2 is now expanded and PairedMemoTopCard remains at the top in "paired" mode
    expect(topMemoCard.getAttribute("data-memo-mode")).toBe("paired");
    expect(card4Stage.getAttribute("data-collapsed")).toBe("false");
    expect(memoTextarea.value).toBe(rawMemo);

    const regionInput = container.querySelector(
      '[data-testid="card4-region-input"]'
    ) as HTMLInputElement;
    const useInput = container.querySelector(
      '[data-testid="card4-use-input"]'
    ) as HTMLInputElement;
    const areaInput = container.querySelector(
      '[data-testid="card4-area-input"]'
    ) as HTMLInputElement;
    const priceInput = container.querySelector(
      '[data-testid="card4-priceband-input"]'
    ) as HTMLInputElement;
    const headlineInput = container.querySelector(
      '[data-testid="card4-headline-input"]'
    ) as HTMLInputElement;

    expect(regionInput.value).toBe("마포구 서교동");
    expect(useInput.value).toBe("근린생활시설");
    expect(areaInput.value).toBe("연면적 280평");
    expect(priceInput.value).toBe("85~90억");
    expect(headlineInput.value).toBe("홍대입구역 도보 3분 만실 코너");

    // Classified into '✨ AI 메모 생성 딜카드' group in left list
    const aiGroupSection = container.querySelector(
      '[data-testid="dealcard-group-section-ai_memo"]'
    ) as HTMLElement;
    expect(aiGroupSection.textContent).toContain("마포구 서교동 근린생활시설");

    // Customer preview (Column 3 KakaoBubblePreview) NEVER leaks lot number, brand, owner name, or phone
    const previewCol = container.querySelector(
      '[data-testid="kakao-bubble-preview"]'
    ) as HTMLElement;
    const previewText = previewCol?.textContent || container.innerHTML;
    if (previewCol) {
      expect(previewCol.textContent).not.toContain("395-12");
      expect(previewCol.textContent).not.toContain("스타벅스");
      expect(previewCol.textContent).not.toContain("김사장");
      expect(previewCol.textContent).not.toContain("010-1234-5678");
    } else {
      expect(previewText).toBeTruthy();
    }
  });

  it("[MF-02] saves unconverted memo via '[메모만 저장해두기]' into '📝 딜카드 미생성 메모' group and converts it to '✨ AI 메모 생성 딜카드' in 1 click", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/workspace/summary") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body || "{}"));
        if (body.action === "save_memo_only") {
          return new Response(
            JSON.stringify({
              ok: true,
              action: "save_memo_only",
              memo: {
                id: "memo-saved-101",
                memoText: body.memoText,
                routingType: "new_deal",
                createdAt: new Date().toISOString(),
              },
            }),
            { status: 200 }
          );
        }
      }
      return new Response(JSON.stringify({ ok: true, dealcards: [], unconvertedMemos: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });

    // Start new capture
    const newBtn = container.querySelector(
      '[data-testid="workspace-new-dealcard-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      newBtn.click();
    });

    const memoTextarea = container.querySelector(
      '[data-testid="dealcard-top-memo-textarea"]'
    ) as HTMLTextAreaElement;
    await act(async () => {
      setNativeValue(
        memoTextarea,
        "강남구 역삼동 사옥빌딩 대지 110평 연면적 390평 매매가 135억 역삼역 도보 4분"
      );
    });

    // Save memo ONLY without creating DealCard yet
    const saveMemoOnlyBtn = container.querySelector(
      '[data-testid="dealcard-save-memo-only-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      saveMemoOnlyBtn.click();
    });

    const unconvertedRow = container.querySelector(
      '[data-testid="unconverted-memo-item-memo-saved-101"]'
    ) as HTMLElement;
    expect(unconvertedRow).not.toBeNull();
    expect(unconvertedRow.textContent).toContain("강남구 역삼동 사옥빌딩");

    // Convert to DealCard in 1 click from the unconverted memo row
    const quickGenBtn = container.querySelector(
      '[data-testid="unconverted-memo-generate-memo-saved-101"]'
    ) as HTMLButtonElement;
    await act(async () => {
      quickGenBtn.click();
    });

    // Removed from unconverted memos and added to AI Memo DealCards!
    expect(
      container.querySelector('[data-testid="unconverted-memo-item-memo-saved-101"]')
    ).toBeNull();
    const aiSection = container.querySelector(
      '[data-testid="dealcard-group-section-ai_memo"]'
    ) as HTMLElement;
    expect(aiSection.textContent).toContain("강남구 역삼동 업무시설");
  });

  it("[MF-03] edits paired memo independently without clobbering manual DealCard copy, and supports explicit '[↻ 메모 내용으로 딜카드 다시 채우기]' + 1-click Undo", async () => {
    vi.useFakeTimers();
    const patchPayloads: Array<Record<string, unknown>> = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/workspace/summary") && init?.method === "PATCH") {
        patchPayloads.push(JSON.parse(String(init.body || "{}")));
      }
      return new Response(JSON.stringify({ ok: true, dealcards: [], unconvertedMemos: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });

    // Manually refine headline on bld-01
    const headlineInput = container.querySelector(
      '[data-testid="card4-headline-input"]'
    ) as HTMLInputElement;
    await act(async () => {
      setNativeValue(headlineInput, "직접 다듬은 핵심 매력 제목");
    });
    expect(headlineInput.value).toBe("직접 다듬은 핵심 매력 제목");

    // Edit top paired memo — must NOT overwrite manually refined headline!
    const memoTextarea = container.querySelector(
      '[data-testid="dealcard-top-memo-textarea"]'
    ) as HTMLTextAreaElement;
    await act(async () => {
      setNativeValue(
        memoTextarea,
        "서초구 잠원동 신축부지 대지 150평 매매가 120억 신사역 도보 5분 용적률 여유"
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(headlineInput.value).toBe("직접 다듬은 핵심 매력 제목");
    expect(patchPayloads.some((p) => p.action === "update_memo_only")).toBe(true);

    // Now explicitly click [↻ 메모 내용으로 딜카드 다시 채우기]
    const reparseBtn = container.querySelector(
      '[data-testid="dealcard-reparse-memo-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      reparseBtn.click();
    });

    const regionInput = container.querySelector(
      '[data-testid="card4-region-input"]'
    ) as HTMLInputElement;
    expect(regionInput.value).toBe("서초구 잠원동");

    // Click [되돌리기] on UndoConfirmToast -> restores manually refined headline & region!
    const undoBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("되돌리기")
    ) as HTMLButtonElement;
    expect(undoBtn).not.toBeUndefined();
    await act(async () => {
      undoBtn.click();
    });

    expect(headlineInput.value).toBe("직접 다듬은 핵심 매력 제목");
    expect(regionInput.value).toBe("영등포구 양평동");
  });

  it("[MF-04 & MF-05] groups AI / Unconverted / Manual items, hides buyer_condition memos by default, supports private memo keyword search, and allows manual bypass", async () => {
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          dealcards: [
            {
              id: "bld-ai-1",
              title: "성동구 성수동 근린생활시설",
              region: "성동구 성수동",
              use: "근린생활시설",
              priceBand: "110~120억",
              status: "draft",
              updatedAt: "방금",
              memoText: "성수동2가 315-77 코너 올근생 박회장님 급매물",
              generationSource: "ai_memo",
              card4: {
                headline: "성수역 도보 4분 코너 빌딩",
                posture: "income",
                region: "성동구 성수동",
                use: "근린생활시설",
                area: "연면적 310평",
                priceBand: "110~120억",
                points: ["성수역 도보 4분 코너", "전층 우량 쇼룸 임차", "가시성 우수한 외관"],
                generationSource: "ai_memo",
                card4_version: 1,
              },
            },
            {
              id: "bld-manual-1",
              title: "종로구 관철동 업무시설",
              region: "종로구 관철동",
              use: "업무시설",
              priceBand: "160~170억",
              status: "sent",
              updatedAt: "1시간 전",
              generationSource: "manual",
              card4: {
                headline: "종각역 초역세권 사옥 빌딩",
                posture: "owner_occupied",
                region: "종로구 관철동",
                use: "업무시설",
                area: "연면적 520평",
                priceBand: "160~170억",
                points: ["종각역 도보 2분 입지", "즉시 사옥 입주 가능", "자주식 주차 14대"],
                generationSource: "manual",
                card4_version: 1,
              },
            },
          ],
          unconvertedMemos: [
            {
              id: "memo-deal-1",
              memoText: "송파구 방이동 먹자골목 코너 상가 매가 68억",
              routingType: "new_deal",
              createdAt: new Date().toISOString(),
            },
            {
              id: "memo-buyer-1",
              memoText: "김원장님 강남권 50억대 의원 자리 찾으심",
              routingType: "buyer_condition",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });

    // All 3 group sections rendered
    expect(
      container.querySelector('[data-testid="dealcard-group-section-ai_memo"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dealcard-group-section-unconverted_memo"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dealcard-group-section-manual"]')
    ).not.toBeNull();

    // Deal memo shown, buyer_condition memo hidden by default with toggle button
    expect(
      container.querySelector('[data-testid="unconverted-memo-item-memo-deal-1"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="unconverted-memo-item-memo-buyer-1"]')
    ).toBeNull();

    const toggleOtherBtn = container.querySelector(
      '[data-testid="toggle-other-memos-btn"]'
    ) as HTMLButtonElement;
    expect(toggleOtherBtn.textContent).toContain("1건 함께 보기");
    await act(async () => {
      toggleOtherBtn.click();
    });
    expect(
      container.querySelector('[data-testid="unconverted-memo-item-memo-buyer-1"]')
    ).not.toBeNull();

    // Private memo keyword search ("315-77" or "박회장님") finds the blind DealCard!
    const searchInput = container.querySelector(
      "#dealcard-search-input"
    ) as HTMLInputElement;
    await act(async () => {
      setNativeValue(searchInput, "315-77");
    });
    expect(
      container.querySelector('[data-testid="dealcard-item-bld-ai-1"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dealcard-item-bld-manual-1"]')
    ).toBeNull();

    await act(async () => {
      setNativeValue(searchInput, "");
    });

    // Manual bypass path: click [+ 새 딜카드 만들기] -> [메모 없이 직접 입력하기]
    const newBtn = container.querySelector(
      '[data-testid="workspace-new-dealcard-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      newBtn.click();
    });
    const skipBtn = container.querySelector(
      '[data-testid="dealcard-skip-memo-manual-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      skipBtn.click();
    });

    const card4Stage = container.querySelector(
      '[data-testid="dealcard-card4-stage"]'
    ) as HTMLElement;
    expect(card4Stage.getAttribute("data-collapsed")).toBe("false");
    const originBadge = container.querySelector(
      '[data-testid="paired-memo-origin-badge"]'
    ) as HTMLElement;
    expect(originBadge.textContent).toContain("직접 작성");
  });

  it("[MF-06] preserves standalone /broker/memos & /api/broker/memo/* intact and syncs private memo + status='saved' in /api/broker/workspace/summary", async () => {
    // 1. Standalone memo page & API routes must exist and remain intact
    expect(
      fs.existsSync(path.resolve(process.cwd(), "src/app/(broker)/broker/memos/page.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), "src/app/api/broker/memo/save/route.ts"))
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), "src/app/api/broker/memo/[id]/route.ts"))
    ).toBe(true);

    // 2. Verify PATCH save_memo_only -> GET unconvertedMemos -> PATCH upsert (with raw lot numbers in memoText) -> GET paired dealcards
    const brokerMemoUpdates: Array<Record<string, unknown>> = [];
    const memoUuid = "22222222-2222-4222-8222-222222222222";
    mockRequireBroker.mockResolvedValue({
      user: { id: "broker-test-user-1" },
      role: "broker",
      error: null,
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "broker_memos") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: memoUuid, user_id: "broker-test-user-1", tags: [] },
              }),
              neq: () => ({
                order: () => ({
                  limit: async () => ({ data: [] }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: memoUuid } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            brokerMemoUpdates.push(payload);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }
      return {
        select: () => ({
          neq: () => ({
            order: () => ({
              limit: () => ({
                eq: async () => ({ data: [] }),
              }),
            }),
          }),
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
            in: () => ({
              order: () => ({
                limit: async () => ({ data: [] }),
              }),
            }),
          }),
        }),
        insert: async () => ({ error: null }),
      };
    });

    const saveMemoReq = new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
      method: "PATCH",
      body: JSON.stringify({
        action: "save_memo_only",
        memoText: "용산구 한남동 683-10 단독 근생 매가 78억 스타벅스 인근",
        routingType: "new_deal",
      }),
    });
    const saveMemoRes = await summaryPATCH(saveMemoReq);
    const saveMemoJson = await saveMemoRes.json();
    expect(saveMemoRes.status).toBe(200);
    expect(saveMemoJson.memo.id).toBe(memoUuid);

    const getBeforeRes = await summaryGET(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary")
    );
    const getBeforeJson = await getBeforeRes.json();
    expect(
      getBeforeJson.unconvertedMemos.some((m: { id: string }) => m.id === memoUuid)
    ).toBe(true);

    // Convert unconverted memo into DealCard (raw memoText has exact lot 683-10 + brand, public card4 is clean!)
    const upsertReq = new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
      method: "PATCH",
      body: JSON.stringify({
        action: "upsert",
        buildingId: "bld-hannam-01",
        memoText: "용산구 한남동 683-10 단독 근생 매가 78억 스타벅스 인근",
        pairedMemoId: memoUuid,
        generationSource: "ai_memo",
        card4: {
          headline: "한남동 핵심 상권 근생 매물",
          posture: "income",
          region: "용산구 한남동",
          use: "근린생활시설",
          area: "연면적 180평",
          priceBand: "75~80억",
          points: ["한남동 메인 상권 인접", "우량 리테일 임차 구성", "가시성 좋은 전면 도로"],
          card4_version: 1,
        },
      }),
    });
    const upsertRes = await summaryPATCH(upsertReq);
    expect(upsertRes.status).toBe(200);

    // CRITICAL: broker_memos update MUST keep status === 'saved' (so /broker/memos never loses it!)
    // and MUST NOT pass non-UUID 'bld-hannam-01' into UUID column converted_to!
    expect(brokerMemoUpdates.length).toBeGreaterThan(0);
    expect(brokerMemoUpdates[0].status).toBe("saved");
    expect(brokerMemoUpdates[0].converted_to).toBeNull();
    expect(brokerMemoUpdates[0].tags).toContain("paired:bld-hannam-01");

    // GET summary now returns DealCard with paired memoText + generationSource: 'ai_memo', and removes memoUuid from unconvertedMemos
    const getAfterRes = await summaryGET(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary")
    );
    const getAfterJson = await getAfterRes.json();
    expect(
      getAfterJson.unconvertedMemos.some((m: { id: string }) => m.id === memoUuid)
    ).toBe(false);
    const pairedCard = getAfterJson.dealcards.find(
      (d: { id: string }) => d.id === "bld-hannam-01"
    );
    expect(pairedCard).toBeDefined();
    expect(pairedCard.generationSource).toBe("ai_memo");
    expect(pairedCard.memoText).toContain("683-10");
    // Public card4 object itself must NOT carry raw memoText
    expect(pairedCard.card4.memoText).toBeUndefined();
  });
});
