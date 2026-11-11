// @vitest-environment jsdom
/**
 * L2. 작업공간 상태 · URL 쿼리 · 좌측 목록 네비게이션 경계 예방 테스트 (PT-201 ~ PT-204)
 *
 * 실전 테스터 및 프로덕션 경험 교훈:
 * - PT-201: 4대 작업공간(IM · 딜카드 · 뉴스레터 · 소통함) 딥링크(`?buildingId=`) 진입 후 좌측 카드 클릭 시
 *           양방향 URL 동기화 및 스냅백 잠금(Snap-Back Lock) 차단 계약 검증
 * - PT-202: WorkspaceShell 부모 버블링 핸들러가 자식의 쿼리 갱신을 덮어쓰지 않는지 검증
 * - PT-203: `useWorkspaceAutosave`에서 900ms 디바운스 만료 전에 다른 카드로 고속 전환 시 이전 카드 수정분이 즉시 Flush되는지 검증
 * - PT-204: 딜카드 메모-퍼스트 페어링 상태 분류(`ai_memo` / `unconverted_memo` / `manual`) 및 원문 메모 요약 불변식 검증
 */
import fs from "node:fs";
import path from "node:path";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import {
  classifyDealCardOriginGroup,
  isDealCandidateMemo,
  parseMemoIntoCard4,
  summarizeMemoOneLine,
} from "@/lib/deal-card/memo-pairing";

describe("L2 Workspace State, URL Sync & List Navigation Preventive Suite (PT-201 ~ PT-204)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("[PT-201] all 4 workspace pages enforce bidirectional URL query sync to prevent Snap-Back Lock on left-list click", () => {
    const imCode = fs.readFileSync(
      path.join(process.cwd(), "src/app/(broker)/broker/w/im/page.tsx"),
      "utf-8"
    );
    expect(imCode).toContain("selectImItem");
    expect(imCode).toContain("inFlightSelfUrlIdsRef");

    const dcCode = fs.readFileSync(
      path.join(process.cwd(), "src/app/(broker)/broker/w/dealcards/page.tsx"),
      "utf-8"
    );
    expect(dcCode).toContain("lastSyncedQueryIdRef");
    expect(dcCode).toContain("/broker/w/dealcards?buildingId=");

    const inboxCode = fs.readFileSync(
      path.join(process.cwd(), "src/app/(broker)/broker/w/inbox/page.tsx"),
      "utf-8"
    );
    expect(inboxCode).toContain("selectThread");

    const nlCode = fs.readFileSync(
      path.join(process.cwd(), "src/app/(broker)/broker/magazine-editor/page.tsx"),
      "utf-8"
    );
    expect(nlCode).toContain('qs.set("edition"');
  });

  it("[PT-202] WorkspaceShell mobile/tablet list wrapper does not clobber child router.replace query updates", () => {
    const shellCode = fs.readFileSync(
      path.join(process.cwd(), "src/components/workspace/WorkspaceShell.tsx"),
      "utf-8"
    );
    // Must read live window.location.search rather than stale closure searchParams when switching tab
    expect(shellCode).toContain("window.location.search");
    expect(shellCode).not.toContain("\\'원\\'");
  });

  it("[PT-203] useWorkspaceAutosave flushes pending edits for Item A immediately when switching to Item B within < 900ms debounce", async () => {
    const savedCalls: Array<{ id: string; data: { askingPrice: number; title: string } }> = [];
    const onSave = vi.fn(
      async (params: { id: string; data: { askingPrice: number; title: string } }) => {
        savedCalls.push({ id: params.id, data: params.data });
        return { version: 2 };
      }
    );

    const { rerender } = renderHook(
      ({ id, data }) =>
        useWorkspaceAutosave({
          id,
          data,
          debounceMs: 900,
          onSave,
        }),
      {
        initialProps: {
          id: "deal-A",
          data: { askingPrice: 280000, title: "보정동 A매물 초기값" },
        },
      }
    );

    // Edit Deal A
    await act(async () => {
      rerender({
        id: "deal-A",
        data: { askingPrice: 300000, title: "보정동 A매물 30억으로 수정" },
      });
    });

    // Advance only 150ms (< 900ms debounce) and immediately click Deal B in left list!
    await act(async () => {
      vi.advanceTimersByTime(150);
      rerender({
        id: "deal-B",
        data: { askingPrice: 770000, title: "동교동 B매물" },
      });
    });

    // Allow microtasks from background flush of Deal A to settle
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(savedCalls.length).toBeGreaterThanOrEqual(1);
    expect(savedCalls[0]).toEqual({
      id: "deal-A",
      data: { askingPrice: 300000, title: "보정동 A매물 30억으로 수정" },
    });
    // Deal B was not modified, so Deal B should NOT be spuriously saved with Deal A's data
    expect(savedCalls.some((c) => c.id === "deal-B" && c.data.askingPrice === 300000)).toBe(false);
  });

  it("[PT-204] Memo-First DealCard pairing classifies ai_memo / unconverted_memo / manual cleanly and preserves memo preview", () => {
    expect(isDealCandidateMemo("new_deal")).toBe(true);
    expect(isDealCandidateMemo("buyer_condition")).toBe(false);
    expect(isDealCandidateMemo("schedule_event")).toBe(false);
    expect(isDealCandidateMemo("buyer_condition", true)).toBe(true);

    const rawMemo =
      "경기도 용인시 기흥구 보정동 1323-2 웰빙프라자 매각 28억, 대지 133평 연면적 372평, 보증금 2억7,950만 월세 809만, 분당선 보정역 도보 7분";
    const parsed = parseMemoIntoCard4(rawMemo, { pairedMemoId: "memo-bojeong-1" });

    expect(
      classifyDealCardOriginGroup({
        card4: parsed,
        generationSource: parsed.generationSource,
        pairedMemoId: parsed.pairedMemoId,
      })
    ).toBe("ai_memo");

    expect(
      classifyDealCardOriginGroup({
        card4: { region: "강남구 역삼동", use: "근생빌딩", priceBand: "100~120억", points: ["", "", ""] } as any,
        generationSource: "manual",
      })
    ).toBe("manual");

    const previewLine = summarizeMemoOneLine(rawMemo, 36);
    expect(previewLine.endsWith("…")).toBe(true);
    expect(previewLine.length).toBeLessThanOrEqual(37);
  });
});
