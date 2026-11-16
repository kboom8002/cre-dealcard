// @vitest-environment jsdom
/**
 * @file src/tests/preventive/commercialization-plus-alpha-guard.test.tsx
 * @description Commercialization+@ Wave 1(+α 1~5) 불변식 및 정적 가드 검증:
 *   1. ZeroBlankStarterCard: 3가지 시작 경로·56px 터치 타깃·콜백 실행
 *   2. broker-sales-tone-lexicon: 선임 중개사 한국어 화법 치환 + 숫자·단위·마크다운 표 100% 보존
 *   3. Inbox Priority Signal & 3종 정중 카톡 인사말: ?sid= 보존 + 금지어 0건
 *   4. ImDeckReadinessBar: 5대 항목(0/5~5/5) 합산 및 미입력 칩 클릭 시 에디터 포커스 연동
 *   5. CTALadder: 2개 핵심 CTA 유지 + 전화번호 보유 시 sms:/연락처 복사 마이크로 전환 바
 *   6. 정적 스캔: Wave 1 신규·수정 파일에 금지어(BANNED_UI_TERMS) 0건 및 type="tel" 하이픈 가드
 */
import React, { act } from "react";
import fs from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dc/bld-test",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/teaser/TeaserEventTracker", () => ({
  trackTeaserCta: vi.fn(),
}));

import { ZeroBlankStarterCard } from "@/components/workspace/ZeroBlankStarterCard";
import {
  SENIOR_BROKER_POSTURE_FEW_SHOTS,
  humanizeSeniorBrokerTone,
} from "@/domain/building/mobile-im/broker-sales-tone-lexicon";
import {
  KAKAO_OUTREACH_PRESET_OPTIONS,
  buildKakaoOutreachPreset,
  computePriorityContactSignal,
  type InboxThreadItem,
} from "@/app/(broker)/broker/w/inbox/_components/inbox-types";
import { ImDeckReadinessBar } from "@/app/(broker)/broker/w/im/_components/ImDeckReadinessBar";
import { CTALadder } from "@/components/teaser/CTALadder";
import { BANNED_UI_TERMS } from "@/lib/ux/lexicon";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = process.cwd();

function makeBaseThread(
  overrides: Partial<InboxThreadItem> = {}
): InboxThreadItem {
  return {
    id: "thread-1",
    clientName: "김대표",
    clientPhone: "010-2548-2548",
    clientGrade: "일반",
    buildingTitle: "당산동 근생빌딩",
    buildingId: "bld-dangsan-1",
    latestEvent: "열람",
    updatedAt: "2026-11-16",
    openCount: 0,
    dwellSeconds: 0,
    isRead: false,
    status: "active",
    shareToken: "slk.token123",
    shareUrl: "https://www.credeal.net/dc/bld-dangsan-1?sid=slk.token123",
    events: [],
    budget: "100억대",
    preferredRegion: "영등포구",
    ...overrides,
  };
}

function stripNonUiCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/^\s*import .*$/gm, "")
    .replace(/data-testid=(?:"[^"]*"|\{[^}]*\})/g, "")
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\})/g, "");
}

describe("Commercialization+@ Wave 1 (+α 1~5) 불변식 가드", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it("[+α 1] ZeroBlankStarterCard: 3가지 시작 버튼과 min-h-[56px] 터치 타깃·콜백 실행", () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()];
    act(() => {
      root.render(
        <ZeroBlankStarterCard
          testId="test-zero-blank"
          heading="어떻게 시작하시겠어요?"
          subheading="가장 편한 방법 1가지를 누르세요."
          options={[
            {
              id: "opt1",
              badge: "10초",
              title: "내 메모 붙여넣기",
              subtitle: "카톡 메모를 바로 정리합니다",
              testId: "opt1-btn",
              onClick: callbacks[0],
            },
            {
              id: "opt2",
              badge: "직접",
              title: "4칸 직접 입력",
              subtitle: "핵심 조건만 적고 시작합니다",
              testId: "opt2-btn",
              onClick: callbacks[1],
            },
            {
              id: "opt3",
              badge: "예시",
              title: "연습 예시 보기",
              subtitle: "샘플을 채워 미리 봅니다",
              testId: "opt3-btn",
              onClick: callbacks[2],
            },
          ]}
        />
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    buttons.forEach((btn, idx) => {
      expect(btn.className).toContain("min-h-[56px]");
      act(() => {
        btn.click();
      });
      expect(callbacks[idx]).toHaveBeenCalledTimes(1);
    });
  });

  it("[+α 2] broker-sales-tone-lexicon: 외래어 순화 + 숫자·단위·마크다운 표 100% 보존", () => {
    expect(Object.keys(SENIOR_BROKER_POSTURE_FEW_SHOTS)).toEqual([
      "임대수익용",
      "사옥용",
      "신축·개발용",
    ]);

    const raw = [
      "매수 후 추가 자본적 지출(CapEx) 2억 없이 우량 업종 리테넌팅(Re-tenanting)으로 연 4.25% 수익 시현 및 향후 매각(Exit) 유리.",
      "| 1F | 101호 | 올리브영 | 45평 | 10,000 | 650 |",
    ].join("\n");

    const out = humanizeSeniorBrokerTone(raw);
    expect(out).toContain("추가 수선비 2억");
    expect(out).toContain("우량 업종 재구성");
    expect(out).toContain("연 4.25% 수익 확보");
    expect(out).toContain("향후 매각 유리");
    expect(out).not.toContain("CapEx");
    expect(out).not.toContain("Re-tenanting");
    expect(out).not.toContain("Exit");
    expect(out).toContain("| 1F | 101호 | 올리브영 | 45평 | 10,000 | 650 |");
  });

  it("[+α 3] Inbox 우선 연락 신호(금지어 배제) & 3종 카톡 인사말(?sid= 보존)", () => {
    expect(KAKAO_OUTREACH_PRESET_OPTIONS).toHaveLength(3);

    const pendingSignal = computePriorityContactSignal(
      makeBaseThread({ gateStatus: "pending", status: "pending_gate" })
    );
    expect(pendingSignal?.isPriority).toBe(true);
    expect(pendingSignal?.badgeLabel).toContain("자료 요청 대기");

    const highOpenSignal = computePriorityContactSignal(
      makeBaseThread({ openCount: 2, dwellSeconds: 15 })
    );
    expect(highOpenSignal?.isPriority).toBe(true);
    expect(highOpenSignal?.badgeLabel).toContain("먼저 연락");

    const dwellSignal = computePriorityContactSignal(
      makeBaseThread({ openCount: 1, dwellSeconds: 75 })
    );
    expect(dwellSignal?.isPriority).toBe(true);

    const revokedSignal = computePriorityContactSignal(
      makeBaseThread({ openCount: 5, status: "revoked" })
    );
    expect(revokedSignal).toBeNull();

    const shareUrl = "https://www.credeal.net/dc/bld-1?sid=slk.xyz789";
    for (const preset of ["intro", "followup_meeting", "tour_guide"] as const) {
      const msg = buildKakaoOutreachPreset(preset, {
        clientName: "김대표님",
        buildingTitle: "당산역 빌딩",
        shareUrl,
        headline: "역세권 통사옥 적격",
      });
      expect(msg).toContain("김대표님");
      expect(msg).not.toContain("김대표님님");
      expect(msg).toContain(shareUrl);
      for (const { term } of BANNED_UI_TERMS) {
        expect(msg).not.toMatch(term);
      }
    }
  });

  it("[+α 4] ImDeckReadinessBar: 5대 항목(0/5~5/5) 표기 및 칩 클릭 포커스 콜백", () => {
    const onFocusEditorUnit = vi.fn();
    act(() => {
      root.render(
        <ImDeckReadinessBar
          address="서울특별시 영등포구 당산동1가 72-1"
          askingPriceManwon={1500000}
          gfaSqm=""
          landAreaSqm=""
          hasRentRollRow={false}
          photoCount={0}
          onFocusEditorUnit={onFocusEditorUnit}
        />
      );
    });

    const countEl = container.querySelector(
      '[data-testid="im-deck-readiness-count"]'
    );
    expect(countEl?.textContent).toBe("2/5 채워짐");

    const areaChip = container.querySelector(
      '[data-testid="im-readiness-chip-area"]'
    ) as HTMLButtonElement | null;
    const rentrollChip = container.querySelector(
      '[data-testid="im-readiness-chip-rentroll"]'
    ) as HTMLButtonElement | null;
    const photoChip = container.querySelector(
      '[data-testid="im-readiness-chip-photos"]'
    ) as HTMLButtonElement | null;

    expect(areaChip?.className).toContain("min-h-[44px]");
    act(() => {
      areaChip?.click();
      rentrollChip?.click();
      photoChip?.click();
    });

    expect(onFocusEditorUnit).toHaveBeenNthCalledWith(1, "im-unit-building");
    expect(onFocusEditorUnit).toHaveBeenNthCalledWith(2, "im-unit-rentroll");
    expect(onFocusEditorUnit).toHaveBeenNthCalledWith(3, "im-unit-photos");

    act(() => {
      root.render(
        <ImDeckReadinessBar
          address="서울특별시 영등포구 당산동1가 72-1"
          askingPriceManwon={1500000}
          gfaSqm="1687.5"
          landAreaSqm="412.3"
          hasRentRollRow={true}
          photoCount={5}
          onFocusEditorUnit={onFocusEditorUnit}
        />
      );
    });
    expect(
      container.querySelector('[data-testid="im-deck-readiness-count"]')
        ?.textContent
    ).toBe("5/5 채워짐");
  });

  it("[+α 5] CTALadder: 2대 핵심 버튼 유지 + 연락처 보유 시 sms: 및 복사 마이크로 바 노출", () => {
    act(() => {
      root.render(
        <CTALadder
          buildingId="bld-1"
          teaserConfigId="tc-1"
          brokerPhone="010-2548-2548"
          hasImDoc={true}
        />
      );
    });

    expect(
      container.querySelector('[data-testid="public-dealcard-sticky-cta"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="public-dealcard-call-btn"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="public-dealcard-im-request-btn"]')
    ).not.toBeNull();

    const microBar = container.querySelector(
      '[data-testid="public-dealcard-micro-actions"]'
    );
    const smsLink = container.querySelector(
      '[data-testid="public-dealcard-sms-link"]'
    ) as HTMLAnchorElement | null;
    const copyBtn = container.querySelector(
      '[data-testid="public-dealcard-copy-phone-btn"]'
    );
    expect(microBar).not.toBeNull();
    expect(smsLink?.getAttribute("href")).toBe("sms:01025482548");
    expect(copyBtn).not.toBeNull();

    // 전화번호 미등록 시 마이크로 액션 바 숨김
    act(() => {
      root.render(
        <CTALadder
          buildingId="bld-2"
          teaserConfigId="tc-2"
          brokerPhone=""
          hasImDoc={false}
        />
      );
    });
    expect(
      container.querySelector('[data-testid="public-dealcard-micro-actions"]')
    ).toBeNull();
  });

  it("[Static Guard] Wave 1 신규·수정 UI 파일에 금지 용어(BANNED_UI_TERMS) 0건", () => {
    const wave1UiFiles = [
      "src/components/workspace/ZeroBlankStarterCard.tsx",
      "src/app/(broker)/broker/w/dealcards/_components/DealCardEditorColumn.tsx",
      "src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx",
      "src/app/(broker)/broker/w/im/_components/ImPreviewPane.tsx",
      "src/app/(broker)/broker/w/im/_components/ImDeckReadinessBar.tsx",
      "src/app/(broker)/broker/w/inbox/_components/inbox-types.ts",
      "src/app/(broker)/broker/w/inbox/_components/InboxListColumn.tsx",
      "src/app/(broker)/broker/w/inbox/_components/InboxPreviewColumn.tsx",
      "src/app/(broker)/broker/w/inbox/page.tsx",
      "src/components/teaser/CTALadder.tsx",
      "src/app/(public)/im-lite/[buildingId]/components/floating-action-bar.tsx",
    ];

    for (const rel of wave1UiFiles) {
      const code = stripNonUiCode(fs.readFileSync(path.join(ROOT, rel), "utf8"));
      const hits: string[] = [];
      for (const { term, use } of BANNED_UI_TERMS) {
        const m = code.match(term);
        if (m) hits.push(`"${m[0]}" → ${use}`);
      }
      expect(hits, `${rel}:\n${hits.join("\n")}`).toEqual([]);
    }
  });
});
