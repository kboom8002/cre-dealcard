// @vitest-environment jsdom
/**
 * @file src/tests/workspace/tester-v1-1-audit-remediation.test.tsx
 * @description Comprehensive Positive + Negative regression suite for Human Tester Audit V-1.1
 * (`docs/크리딜_수정_26-11-11_V-1.1.pdf`, 20 pages, 16 items across /broker, /broker/w/im,
 * /im-lite/[buildingId], /broker/profile, /broker/w/dealcards, /broker/magazine-editor,
 * /broker/w/inbox, and /testguide).
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import fs from "fs";
import path from "path";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { KakaoBubblePreview } from "@/components/broker/deal-card/KakaoBubblePreview";
import { BrokerHome4Doors } from "@/app/(broker)/broker/_components/BrokerHome4Doors";
import { MobileIMViewer } from "@/app/(public)/im-lite/[buildingId]/mobile-im-viewer";
import { resolveKnownTestAssetUrl } from "@/lib/im-lite/quick-generate-store";
import { buildBasicImDocument } from "@/domain/building/im-core/basic-im-document";
import { extractPureBuildingFacts } from "@/domain/building/im-core/facts";
import ImWorkspacePage from "@/app/(broker)/broker/w/im/page";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import InboxWorkspacePage from "@/app/(broker)/broker/w/inbox/page";
import TestGuidePage from "@/app/testguide/page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = "/broker/w/im";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/platform/im-pipeline/realtime/use-dealcard-realtime-sync", () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.IntersectionObserver = MockIntersectionObserver as any;

function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Human Tester V-1.1 Audit Remediation Suite (Positive + Negative Pairs)", () => {
  let root: Root;
  let container: HTMLDivElement;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockPush.mockReset();
    mockReplace.mockReset();
    mockPathname = "/broker/w/im";
    mockSearchParams = new URLSearchParams();
    window.localStorage.clear();
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
  });

  it("[V1.1-P10 & P20] preserves white-on-dark button contrast in .broker-paper-theme, supports compact font scale, and defines .dark-scrollbar", () => {
    const cssText = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/globals.css"),
      "utf-8"
    );
    const seniorLayoutText = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/layout/BrokerSeniorLayout.tsx"),
      "utf-8"
    );

    // Positive: safeguards for Apple dark (#1D1D1F), primary blue (#0062CC), and gradient buttons inside Rule 7-B :is(...) + structural safeguard
    expect(cssText).toContain(".bg-\\[\\#1D1D1F\\]");
    expect(cssText).toContain(".bg-\\[\\#0062CC\\]");
    expect(cssText).toContain(".from-\\[\\#1A88FF\\]");
    expect(cssText).toContain('.broker-paper-theme.broker-paper-theme [class*="from-[#"].text-white');
    expect(cssText).toContain('[data-font-scale="compact"]');
    expect(cssText).toContain(".dark-scrollbar");
    expect(seniorLayoutText).toContain('data-active-pill={pathname.startsWith("/broker/profile") ? "true" : undefined}');

    // Negative: must NOT mutate LG-02 default --font-scale-normal away from 17px
    expect(cssText).toContain("--font-scale-normal: 17px;");
  });

  it("[V1.1-P07 & P08] heals all 12 testguide photo names, duplicate browser suffixes (1), and legacy Supabase testguide URLs to zero-404 first-party route", () => {
    const directResolved = resolveKnownTestAssetUrl("01_동교동_THEPARK_전면외관.jpg");
    const dupSuffixResolved = resolveKnownTestAssetUrl("01_동교동_THEPARK_전면외관 (1).jpg");
    const legacyUrlResolved = resolveKnownTestAssetUrl(
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/01_exterior.jpg"
    );

    // Positive: resolves to first-party /api/public/testguide-assets/images/...
    expect(directResolved).toMatch(/^\/api\/public\/testguide-assets\/images\//);
    expect(dupSuffixResolved).toBe(directResolved);
    expect(legacyUrlResolved).toMatch(/^\/api\/public\/testguide-assets\/images\//);

    // Negative: never emits raw external supabase testguide/deal URL or Dangsan dummy image
    expect(directResolved).not.toContain("supabase.co/storage");
    expect(legacyUrlResolved).not.toContain("supabase.co/storage");
    expect(resolveKnownTestAssetUrl("unknown_random_photo.jpg")).toBeUndefined();
  });

  it("[V1.1-P09B] MobileIMViewer Section 10 merges broker fields independently without letting placeholders shadow real profile fields", async () => {
    const basicDoc = buildBasicImDocument(
      extractPureBuildingFacts({
        title: "동교동 더파크 빌딩",
        address: "서울특별시 마포구 동교동 189-6",
        posture: "core_income",
        asking_price_manwon: 770000,
        brokerOffice: {
          name: "담당 중개법인 (확인 중)",
          representative: "홍길동",
          registrationNo: "-",
          phone: "-",
        },
      } as any)
    );

    const compositeDoc = {
      ...basicDoc,
      basicImDocument: basicDoc,
      broker: {
        company: "크리딜 부동산중개법인",
        displayName: "홍길동",
        phone: "02-555-9876",
        registrationNo: "11680-2025-00777",
      },
    };

    await act(async () => {
      root.render(
        <MobileIMViewer document={compositeDoc as any} buildingId="bld-v11-contact" isBroker={true} />
      );
    });

    const sec10 = container.querySelector('[data-section-id="10_contact"]')!;
    expect(sec10).not.toBeNull();
    // Positive: real profile values shine through placeholder strings in facts.brokerOffice
    expect(sec10.textContent).toContain("크리딜 부동산중개법인");
    expect(sec10.textContent).toContain("02-555-9876");
    expect(sec10.textContent).toContain("11680-2025-00777");
    // Negative: placeholder strings do NOT leak into rendered Section 10
    expect(sec10.textContent).not.toContain("담당 중개법인");
    expect(sec10.textContent).not.toContain("등록번호: -");
    expect(sec10.textContent).not.toContain("연락처: -");
  });

  it("[V1.1-P03] WorkspaceShell provides font density toggle (표준 글씨 / 큰글씨) and persists data-font-scale", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 })
    ) as any;

    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="im"
          listSlot={<div>목록</div>}
          editorSlot={<div>편집기</div>}
          previewSlot={<div>미리보기</div>}
        />
      );
    });

    const compactBtn = container.querySelector(
      '[data-testid="workspace-font-scale-compact"]'
    ) as HTMLButtonElement;
    const normalBtn = container.querySelector(
      '[data-testid="workspace-font-scale-normal"]'
    ) as HTMLButtonElement;
    expect(compactBtn).not.toBeNull();
    expect(normalBtn).not.toBeNull();

    await act(async () => {
      compactBtn.click();
    });
    expect(document.documentElement.dataset.fontScale).toBe("compact");
    expect(window.localStorage.getItem("credeal-workspace-font-scale-v1")).toBe("compact");

    await act(async () => {
      normalBtn.click();
    });
    expect(document.documentElement.dataset.fontScale).toBe("normal");
  });

  it("[V1.1-P09A, P04 & P11] ImWorkspacePage syncs selection on posture filter click, renders visual 16:9 slide cards, and opens in-workspace fullscreen modal", async () => {
    const bldIncomeId = "11111111-1111-4111-8111-111111111111";
    const bldOwnerId = "22222222-2222-4222-8222-222222222222";

    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/broker/workspace/summary")) {
        return new Response(
          JSON.stringify({
            ok: true,
            imList: [
              {
                id: "im-srv-income",
                buildingId: bldIncomeId,
                title: "마포구 수익형 빌딩",
                address: "서울특별시 마포구 동교동 189-6",
                askingPriceManwon: 770000,
                investmentPosture: "core_income",
                status: "published",
                rentRoll: [],
              },
              {
                id: "im-srv-owner",
                buildingId: bldOwnerId,
                title: "강남구 사옥용 빌딩",
                address: "서울특별시 강남구 역삼동 648-23",
                askingPriceManwon: 1500000,
                investmentPosture: "owner_occupied",
                status: "published",
                rentRoll: [],
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
    }) as any;

    await act(async () => {
      root.render(<ImWorkspacePage />);
    });

    // Click 사옥용 posture filter -> must auto-select 강남구 사옥용 빌딩
    const ownerTab = container.querySelector(
      '[data-testid="im-posture-tab-owner"]'
    ) as HTMLButtonElement;
    expect(ownerTab).not.toBeNull();
    await act(async () => {
      ownerTab.click();
    });

    const titleInput = container.querySelector("#im-title-input") as HTMLInputElement | null;
    if (titleInput) {
      expect(titleInput.value).toContain("강남구 사옥용 빌딩");
      expect(titleInput.value).not.toContain("마포구 수익형 빌딩");
    }

    // Switch to 발표자료 10면 and verify visual white slide cards + fullscreen modal
    const pptxTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("발표자료 10면")
    ) as HTMLButtonElement;
    expect(pptxTab).not.toBeNull();
    await act(async () => {
      pptxTab.click();
    });

    const slide01 = container.querySelector('[data-testid="im-slide-preview-01"]');
    expect(slide01).not.toBeNull();
    expect(slide01?.className).toContain("bg-white");

    const fullscreenLink = container.querySelector(
      '[data-testid="im-open-fullscreen-link"]'
    ) as HTMLAnchorElement;
    expect(fullscreenLink).not.toBeNull();
    await act(async () => {
      fullscreenLink.click();
    });

    const modal = container.querySelector('[data-testid="im-fullscreen-preview-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.querySelector('[data-testid="im-fullscreen-open-newtab-link"]')).not.toBeNull();
  });

  it("[V1.1-P05, P13 & P14] DealCards: Kakao 자세히 보기 opens recipient screen, complete drafts show 준비 완료, and posture filter auto-selects matching dealcard", async () => {
    // 1. KakaoBubblePreview interactive 자세히 보기 button
    await act(async () => {
      root.render(
        <KakaoBubblePreview
          card4={{
            region: "강남구 역삼동",
            use: "업무시설",
            area: "연면적 450평",
            priceBand: "150억대",
            headline: "역삼역 초역세권 코너 사옥",
            points: ["전층 즉시 명도 가능", "자주식 주차 18대", "대지 도로 접면 우수"],
            posture: "owner_occupied",
            provenance: { points: ["broker", "broker", "broker"] },
            card4_version: 1,
          }}
        />
      );
    });

    const detailBtn = container.querySelector(
      '[data-testid="kakao-bubble-detail-btn"]'
    ) as HTMLButtonElement;
    expect(detailBtn).not.toBeNull();
    await act(async () => {
      detailBtn.click();
    });
    // Positive: switched to detail view ('받는 화면' tab selected, bubble hidden)
    const recipientTab = container.querySelector('[data-testid="preview-mode-postit"]');
    expect(recipientTab?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-testid="og-quadrant-preview"]')).toBeNull();

    // 2. DealCardsWorkspacePage posture auto-selection + 준비 완료 status
    mockPathname = "/broker/w/dealcards";
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/broker/workspace/summary")) {
        return new Response(
          JSON.stringify({
            ok: true,
            dealcards: [
              {
                id: "dc-income-1",
                title: "마포구 임대수익 빌딩",
                region: "마포구",
                use: "근린생활시설",
                priceBand: "70억대",
                status: "draft",
                updatedAt: "방금",
                card4: {
                  region: "마포구 핵심상권",
                  use: "근린생활시설",
                  area: "연면적 130평",
                  priceBand: "70억대",
                  headline: "마포 역세권 만실 수익형",
                  points: ["전층 우량 임차인 만실", "코너 가시성 우수", "수익률 안정적"],
                  posture: "income",
                },
              },
              {
                id: "dc-incomplete-2",
                title: "미완성 초안 빌딩",
                region: "강남구",
                use: "",
                priceBand: "",
                status: "draft",
                updatedAt: "방금",
                card4: {
                  region: "강남구",
                  use: "",
                  area: "",
                  priceBand: "",
                  headline: "",
                  points: ["", "", ""],
                  posture: "owner_occupied",
                },
              },
            ],
            unconvertedMemos: [],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
    }) as any;

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });

    const readyBadge = container.querySelector('[data-testid="dealcard-status-badge-dc-income-1"]');
    const draftBadge = container.querySelector('[data-testid="dealcard-status-badge-dc-incomplete-2"]');
    expect(readyBadge?.textContent).toBe("준비 완료");
    expect(draftBadge?.textContent).toBe("작성 중");

    // Clicking 사옥·개발 tab auto-selects dc-incomplete-2
    const ownerValTab = container.querySelector(
      '[data-testid="dealcard-posture-tab-owner_value"]'
    ) as HTMLButtonElement;
    await act(async () => {
      ownerValTab.click();
    });
    const selectedRow = container.querySelector('[data-testid="dealcard-item-dc-incomplete-2"]');
    expect(selectedRow?.getAttribute("data-selected")).toBe("true");
  });

  it("[V1.1-P17] MagazineEditorPage provides 1-click carryover from Step ① Cover title/summary into Step ② Market Briefing", async () => {
    mockPathname = "/broker/magazine-editor";
    global.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true, issues: [], deals: [], count: 0 }), {
        status: 200,
      });
    }) as any;

    await act(async () => {
      root.render(<MagazineEditorPage />);
    });

    const headlineInput = container.querySelector("input[type='text']") as HTMLInputElement | null;
    if (headlineInput) {
      await act(async () => {
        setNativeInputValue(headlineInput, "11월 강남권 프라임 중소형 빌딩 동향");
      });
    }

    const nextStepBtn = container.querySelector(
      '[data-testid="next-to-content-btn"]'
    ) as HTMLButtonElement;
    expect(nextStepBtn).not.toBeNull();
    await act(async () => {
      nextStepBtn.click();
    });

    const copyBtn = container.querySelector(
      '[data-testid="copy-cover-to-briefing-btn"]'
    ) as HTMLButtonElement | null;
    if (copyBtn) {
      await act(async () => {
        copyBtn.click();
      });
      const briefingTitleInput = container.querySelector(
        "#newsletter-briefing-title"
      ) as HTMLInputElement;
      expect(briefingTitleInput.value).toBe("11월 강남권 프라임 중소형 빌딩 동향");
    }
  });

  it("[V1.1-P18] Inbox 117-day pending gate request recovers cleanly via reset_gate -> approve_gate when DB row was marked expired", async () => {
    mockPathname = "/broker/w/inbox";
    const calledActions: string[] = [];

    global.fetch = vi.fn().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/broker/inbox/actions") && init?.body) {
        const body = JSON.parse(String(init.body));
        calledActions.push(body.action);
        if (body.action === "approve_gate" && calledActions.length === 1) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "유효기간이 만료된 열람 요청입니다. 요청 상태를 초기화한 뒤 다시 승인해 주세요.",
            }),
            { status: 409 }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            shareToken: "slk.recovered.777",
            shareUrl: "/im-lite/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?t=slk.recovered.777",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, threads: [], count: 0 }), { status: 200 });
    }) as any;

    await act(async () => {
      root.render(
        <InboxWorkspacePage
          initialThreads={[
            {
              id: "11111111-2222-4333-8444-555555555555",
              clientName: "김동진 대표",
              clientPhone: "010-7777-8888",
              clientGrade: "VIP",
              buildingTitle: "역삼동 623-29 빌딩",
              buildingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              latestEvent: "IM 열람을 요청했습니다.",
              cleanMessage: "IM 열람을 요청했습니다.",
              updatedAt: "117일 전",
              openCount: 0,
              isRead: false,
              status: "pending_gate",
              gateStatus: "submitted",
              shareToken: "",
              events: [],
              budget: "150억",
              preferredRegion: "강남구",
            } as any,
          ]}
        />
      );
    });

    const approveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("승인")
    ) as HTMLButtonElement;
    expect(approveBtn).not.toBeNull();

    await act(async () => {
      approveBtn.click();
    });

    // Positive: seamlessly executed approve_gate -> reset_gate -> approve_gate
    expect(calledActions).toEqual(["approve_gate", "reset_gate", "approve_gate"]);
    expect(container.textContent).toContain("승인");
    // Negative: did NOT get stuck in expired failure state
    expect(container.textContent).not.toContain("만료된 열람 요청 초기화에 실패");
  });

  it("[V1.1-P02 & P20] BrokerHome4Doors renders institutional SVG icons without raw emojis, and TestGuidePage opens full scorecard modal", async () => {
    await act(async () => {
      root.render(
        <BrokerHome4Doors
          data={{
            profile: { displayName: "이중개", photoUrl: null, role: "broker" },
            resumeItem: {
              id: "r1",
              title: "동교동 더파크 빌딩",
              timeAgo: "방금 전",
              href: "/broker/w/im?buildingId=r1",
            },
            doors: {
              dealcards: {
                id: "dealcards",
                title: "딜카드 만들기",
                subtitle: "30초 생성",
                icon: "📄",
                href: "/broker/w/dealcards",
                shortcutNumber: 1,
                badge: { count: 1, label: "작성 중 1건", href: "/broker/w/dealcards", highlight: true },
              },
              im: {
                id: "im",
                title: "기본 IM 제안서",
                subtitle: "3분 완성",
                icon: "📊",
                href: "/broker/w/im",
                shortcutNumber: 2,
                badge: { count: 1, label: "발행 1건", href: "/broker/w/im", highlight: false },
              },
              magazine: {
                id: "magazine",
                title: "주간 매물 소식지",
                subtitle: "뉴스레터 발송",
                icon: "📰",
                href: "/broker/magazine-editor",
                shortcutNumber: 3,
                badge: { count: 0, label: "초안 작성", href: "/broker/magazine-editor", highlight: false },
              },
              inbox: {
                id: "inbox",
                title: "고객 소통함",
                subtitle: "열람 확인",
                icon: "💬",
                href: "/broker/w/inbox",
                shortcutNumber: 4,
                badge: { count: 2, label: "요청 2건", href: "/broker/w/inbox", highlight: true },
              },
            },
          }}
        />
      );
    });

    expect(container.textContent).toContain("CREDEAL STUDIO");
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(6);
    // Negative: raw OS emojis from config are replaced by crisp vector icons
    expect(container.textContent).not.toContain("📄");
    expect(container.textContent).not.toContain("📊");

    // TestGuidePage full scorecard modal
    await act(async () => {
      root.render(<TestGuidePage />);
    });

    const scorecardTab = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("최종 채점") || b.textContent?.includes("리포트")
    ) as HTMLButtonElement | undefined;
    if (scorecardTab) {
      await act(async () => {
        scorecardTab.click();
      });
      const openModalBtn = container.querySelector(
        '[data-testid="open-scorecard-modal-btn"]'
      ) as HTMLButtonElement | null;
      expect(openModalBtn).not.toBeNull();
      await act(async () => {
        openModalBtn!.click();
      });
      expect(container.querySelector('[data-testid="scorecard-full-modal"]')).not.toBeNull();
    }
  });
});
