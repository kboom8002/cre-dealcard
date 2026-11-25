// @vitest-environment jsdom
/**
 * @file src/tests/workspace/inbox-3col-cockpit-redesign.test.tsx
 * @description 고객 소통함 3열 CRM Cockpit 재균형 및 익명 열람 스레드 소유권 검증 스위트
 *
 * 1. 3열 제목 직관화 (`① 고객 목록` | `② 고객 응대 · 자료 발송` | `③ 고객 정보 · 상담 기록`)
 * 2. 1열 상단 모순 제거 (pending=0 숨김, `🔥 관심 높음만 보기 (M)` 카운터 일치, 통합 `+ 고객 등록` 모달, 행 오클릭 아이콘 제거)
 * 3. 2열 원스톱 자료·메시지 발송 허브 & 3열 상시 상담 메모·통합 타임라인·접이식 링크 관리
 * 4. 익명 열람자(`view_*`) 매물 우선 표기 + 정식 고객 전환 모달 프리필 + `verifyBrokerOwnership` 소유권 검증
 * 5. <14px 폰트·금지어·방향성 문구 0건 가드
 */

import React, { act } from "react";
import fs from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { ownershipDbState } = vi.hoisted(() => ({
  ownershipDbState: {
    editions: [] as Array<{ id: string; broker_id: string }>,
    profiles: [] as Array<{ user_id: string; slug: string }>,
    activityEvents: [] as Array<{
      id: string;
      actor_id?: string | null;
      entity_id?: string | null;
      event_type: string;
      metadata?: Record<string, unknown>;
    }>,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/broker/w/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push((row) => {
            if (col.includes("->>")) {
              const [parent, key] = col.split("->>");
              const nested = row[parent] as Record<string, unknown> | undefined;
              return String(nested?.[key] ?? "") === String(val);
            }
            return String(row[col] ?? "") === String(val);
          });
          return chain;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((row) => vals.includes(row[col]));
          return chain;
        },
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const rows =
            table === "magazine_editions"
              ? ownershipDbState.editions
              : table === "broker_profiles"
              ? ownershipDbState.profiles
              : [];
          const hit = rows.find((r) =>
            filters.every((fn) => fn(r as Record<string, unknown>))
          );
          return { data: hit ?? null, error: null };
        },
        then: (resolve: (val: unknown) => void) => {
          const rows =
            table === "activity_events"
              ? ownershipDbState.activityEvents
              : table === "magazine_editions"
              ? ownershipDbState.editions
              : [];
          const matched = rows.filter((r) =>
            filters.every((fn) => fn(r as Record<string, unknown>))
          );
          return Promise.resolve({ data: matched, error: null }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));

import InboxWorkspacePage, {
  type InboxThreadItem,
} from "@/app/(broker)/broker/w/inbox/page";
import { verifyBrokerOwnership } from "@/lib/inbox/inbox-ownership";
import { BANNED_UI_TERMS } from "@/lib/ux/lexicon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const EDITION_UUID_OWN = "11111111-1111-4111-8111-111111111111";
const EDITION_UUID_OTHER = "22222222-2222-4222-8222-222222222222";
const EDITION_UUID_UNKNOWN = "33333333-3333-4333-8333-333333333333";

const TEST_THREADS: InboxThreadItem[] = [
  {
    id: "custom_cust_1",
    clientName: "정현우 대표",
    clientPhone: "010-4912-8831",
    clientEmail: "hw.jung@miraetf.co.kr",
    clientCompany: "미래사옥TF",
    clientGrade: "VIP",
    isVip: true,
    clientRole: "buyer",
    buildingId: "bld-yangjae",
    buildingTitle: "양재역 대로변 사옥용 빌딩",
    latestEvent: "딜카드 2회 열람",
    cleanMessage: "임대 현황표 부탁드립니다.",
    gateStatus: "approved",
    updatedAt: "2026-11-25T11:19:00Z",
    openCount: 2,
    dwellSeconds: 120,
    isRead: true,
    status: "high_interest",
    shareToken: "tok-yangjae",
    shareUrl: "/im-lite/bld-yangjae?token=tok-yangjae",
    budget: "120억",
    preferredRegion: "강남·서초",
    events: [
      {
        id: "ev-note-1",
        eventType: "dwell",
        description: "통화 기록: 다음 주 화요일 현장 답사 희망",
        timestamp: "10분 전",
      },
    ],
    dispatchHistory: [],
  },
  {
    id: "custom_cust_2",
    clientName: "박서연 실장",
    clientPhone: "010-7782-1940",
    clientEmail: "sy.park@example.kr",
    clientCompany: "디벨롭파트너스",
    clientGrade: "일반",
    clientRole: "buyer",
    buildingId: "bld-seonyudo",
    buildingTitle: "선유도역 급행 3분 코너입지",
    latestEvent: "직접 등록한 고객입니다.",
    cleanMessage: "직접 등록한 고객입니다.",
    gateStatus: "none",
    updatedAt: "2026-11-25T10:00:00Z",
    openCount: 0,
    dwellSeconds: 0,
    isRead: true,
    status: "active",
    shareToken: "",
    shareUrl: "",
    budget: "70억대",
    preferredRegion: "영등포구",
    events: [],
    dispatchHistory: [],
  },
  {
    id: `view_${EDITION_UUID_OWN}_anon_fp99`,
    clientName: "익명 열람객",
    clientPhone: "",
    clientEmail: "",
    clientGrade: "일반",
    clientRole: "buyer",
    buildingId: "bld-yangpyeong",
    buildingTitle: "영등포구 양평동4가 업무시설",
    latestEvent: "딜카드 3회 열람",
    cleanMessage: "상세 자료를 열람했습니다",
    gateStatus: "none",
    updatedAt: "2026-11-25T09:15:00Z",
    openCount: 3,
    dwellSeconds: 95,
    isRead: true,
    status: "high_interest",
    shareToken: "",
    shareUrl: "",
    budget: "",
    preferredRegion: "",
    events: [
      {
        id: "ev-anon-1",
        eventType: "open",
        description: "딜카드 3회 열람",
        timestamp: "1시간 전",
      },
    ],
    dispatchHistory: [],
  },
];

describe("고객 소통함 3열 CRM Cockpit 재균형 & 익명 스레드 소유권", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    ownershipDbState.editions = [
      { id: EDITION_UUID_OWN, broker_id: "broker-owner-1" },
      { id: EDITION_UUID_OTHER, broker_id: "broker-other-2" },
    ];
    ownershipDbState.profiles = [{ user_id: "broker-owner-1", slug: "owner-slug" }];
    ownershipDbState.activityEvents = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, threads: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("3열 역할을 재균형하고(2열 원스톱 발송 / 3열 상시 상담·기록 + 접이식 링크 관리), pending=0일 때 모순 배너를 숨긴다", async () => {
    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={TEST_THREADS} />);
    });

    // 3열 헤더가 소통함 문맥으로 표기됨
    const shellText = container.querySelector('[data-testid="workspace-shell"]')?.textContent || "";
    expect(shellText).toContain("① 고객 목록");
    expect(shellText).toContain("② 고객 응대 · 자료 발송");
    expect(shellText).toContain("③ 고객 정보 · 상담 기록");

    // 1열: pendingCount === 0 이므로 "지금 할 일 0건" 배너 미노출, 관심 높음만 보기(2)는 정확한 건수와 일치
    expect(container.querySelector('[data-testid="inbox-todo-summary-card"]')).toBeNull();
    const hotChip = container.querySelector('[data-testid="inbox-hot-only-chip"]') as HTMLButtonElement;
    expect(hotChip.textContent).toContain("관심 높음만 보기 (2)");
    expect(container.querySelector('[data-testid="inbox-list-visible-count"]')?.textContent).toBe("표시 3건");

    await act(async () => {
      hotChip.click();
    });
    expect(container.querySelector('[data-testid="inbox-list-visible-count"]')?.textContent).toBe("표시 2건");
    expect(container.querySelector('[data-testid="inbox-thread-row-custom_cust_2"]')).toBeNull();
    await act(async () => {
      hotChip.click();
    });

    // 행 오클릭 방지: 목록 행에 삭제/보관 아이콘 버튼이 없어야 함
    expect(container.querySelector('[data-testid="inbox-row-delete-custom_cust_1"]')).toBeNull();
    expect(container.querySelector('[data-testid="inbox-row-edit-custom_cust_1"]')).toBeNull();

    // 2열(EditorSlot): 원스톱 발송 허브 + 카톡 복사 + 이메일 발송이 탭 전환 없이 바로 배치됨
    const editorSlot = container.querySelector('[data-testid="inbox-editor-slot"]') as HTMLElement;
    expect(editorSlot.querySelector('[data-testid="inbox-outbound-channel-bar"]')).not.toBeNull();
    expect(editorSlot.querySelector('[data-testid="inbox-copy-bundle-btn"]')).not.toBeNull();
    expect(editorSlot.querySelector('[data-testid="inbox-send-email-btn"]')).not.toBeNull();
    expect(editorSlot.querySelector('[data-testid="inbox-editor-primary-tabs"]')).toBeNull();

    // 3열(PreviewSlot): 고객 요약 + 통화 메모/타임라인 상시 노출 + 접이식 링크 관리 기본 닫힘
    const previewSlot = container.querySelector('[data-testid="inbox-preview-slot"]') as HTMLElement;
    expect(previewSlot.querySelector('[data-testid="inbox-outbound-channel-bar"]')).toBeNull();
    expect(previewSlot.querySelector('[data-testid="inbox-tab-panel-history"]')).not.toBeNull();
    expect(previewSlot.textContent).toContain("통화 기록: 다음 주 화요일 현장 답사 희망");
    const govDisclosure = previewSlot.querySelector(
      '[data-testid="inbox-link-governance-disclosure"]'
    ) as HTMLDetailsElement;
    expect(govDisclosure).not.toBeNull();
    expect(govDisclosure.open).toBe(false);
  });

  it("익명 열람자(view_*) 목록은 매물명을 1순위로 표기하고, 전환 버튼 클릭 시 매물명이 채워진 정식 고객 등록 모달을 연다", async () => {
    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={TEST_THREADS} />);
    });

    const anonRow = container.querySelector(
      `[data-testid="inbox-thread-row-view_${EDITION_UUID_OWN}_anon_fp99"]`
    ) as HTMLElement;
    expect(anonRow).not.toBeNull();
    expect(anonRow.textContent).toContain("영등포구 양평동4가 업무시설");
    expect(anonRow.textContent).toContain("미등록 열람자");

    await act(async () => {
      anonRow.click();
    });

    const convertCard = container.querySelector('[data-testid="inbox-anon-convert-card"]');
    expect(convertCard).not.toBeNull();
    const convertBtn = container.querySelector('[data-testid="inbox-convert-anon-btn"]') as HTMLButtonElement;
    await act(async () => {
      convertBtn.click();
    });

    const dialog = document.body.querySelector('[data-testid="inbox-new-client-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("익명 열람자를 정식 고객으로 등록");
    const buildingInput = dialog?.querySelector("#new-client-building") as HTMLInputElement;
    expect(buildingInput.value).toBe("영등포구 양평동4가 업무시설");
  });

  it("통합 [+ 고객 등록] 모달 안의 [엑셀·명단 대량 등록] 탭 전환과 3열 타임라인 필터를 지원한다", async () => {
    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={TEST_THREADS} />);
    });

    // 타임라인 필터 동작 (메모만 보기 vs 발송만 보기)
    const memoFilterBtn = container.querySelector('[data-testid="inbox-timeline-filter-memo"]') as HTMLButtonElement;
    await act(async () => {
      memoFilterBtn.click();
    });
    expect(container.querySelector('[data-testid="inbox-dispatch-audit-timeline"]')).toBeNull();
    expect(container.querySelector('[data-testid="inbox-tab-panel-history"]')?.textContent).toContain(
      "통화 기록: 다음 주 화요일 현장 답사 희망"
    );

    // 단일 [+ 고객 등록] -> 모달 내부 대량 등록 탭 전환
    const addBtn = container.querySelector('[data-testid="open-new-client-modal-btn"]') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });
    const bulkTabBtn = document.body.querySelector('[data-testid="inbox-open-bulk-import-btn"]') as HTMLButtonElement;
    expect(bulkTabBtn).not.toBeNull();
    await act(async () => {
      bulkTabBtn.click();
    });
    expect(document.body.querySelector('[data-testid="contact-bulk-import-modal"]')).not.toBeNull();
  });

  it("verifyBrokerOwnership은 view_<editionId>_* 익명 열람 스레드에서 본인 발행 매거진은 허용하고 타인/미존재는 차단한다", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const prevVitest = process.env.VITEST;
    delete process.env.VITEST;
    try {
      const ownRes = await verifyBrokerOwnership({
        userId: "broker-owner-1",
        isAdmin: false,
        buildingId: "",
        threadId: `view_${EDITION_UUID_OWN}_anon_fp99`,
        action: "archive_thread",
      });
      expect(ownRes.allowed).toBe(true);

      const otherRes = await verifyBrokerOwnership({
        userId: "broker-owner-1",
        isAdmin: false,
        buildingId: "",
        threadId: `view_${EDITION_UUID_OTHER}_anon_fp99`,
        action: "archive_thread",
      });
      expect(otherRes.allowed).toBe(false);
      expect(otherRes.status).toBe(403);

      const missingRes = await verifyBrokerOwnership({
        userId: "broker-owner-1",
        isAdmin: false,
        buildingId: "",
        threadId: `view_${EDITION_UUID_UNKNOWN}_anon_fp99`,
        action: "archive_thread",
      });
      expect(missingRes.allowed).toBe(false);
      expect(missingRes.status).toBe(404);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
      if (prevVitest !== undefined) process.env.VITEST = prevVitest;
    }
  });

  it("수정된 소통함 전 컴포넌트에 <14px 폰트, 금지어, 좌/우 방향 지시 문구가 없다", () => {
    const files = [
      "src/app/(broker)/broker/w/inbox/page.tsx",
      "src/app/(broker)/broker/w/inbox/_components/InboxListColumn.tsx",
      "src/app/(broker)/broker/w/inbox/_components/InboxEditorColumn.tsx",
      "src/app/(broker)/broker/w/inbox/_components/InboxPreviewColumn.tsx",
      "src/app/(broker)/broker/w/inbox/_components/InboxDispatchTimeline.tsx",
      "src/app/(broker)/broker/w/inbox/_components/InboxClientModals.tsx",
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(text, `${rel} contains <14px class`).not.toMatch(
        /\btext-(?:xs|\[(?:[0-9]|1[0-3])px\])\b/
      );
      expect(text, `${rel} contains directional copy`).not.toMatch(/좌측|우측|오른쪽|왼쪽/);
      const banned = BANNED_UI_TERMS.filter((b) => b.term.test(text)).map((b) => b.term.source);
      expect(banned, `${rel} contains banned lexicon`).toEqual([]);
    }
  });
});
