// @vitest-environment jsdom
/**
 * @file src/tests/qa/tester-261116-r3-remediation.test.tsx
 * @description Round-3 QA remediation verification covering all 10 invariants
 * from tester feedback (26-11-16 V-1.0) and production readiness gates.
 */
import React, { act } from "react";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/w/dealcards",
  useSearchParams: () => new URLSearchParams("qa=1"),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("html2canvas", () => ({
  default: vi.fn(async () => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    return c;
  }),
}));

import { FontScaleToggle } from "@/components/workspace/FontScaleToggle";
import { MonthlyGlassStatCard } from "@/components/magazine/MonthlyGlassStatCard";
import { SubscribeCard } from "@/components/magazine/SubscribeCard";
import { SubscribeFormClient } from "@/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient";
import { ContactGateModal } from "@/components/teaser/ContactGateModal";
import { InboxPreviewColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxPreviewColumn";
import { InboxListColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxListColumn";
import type { InboxThreadItem } from "@/app/(broker)/broker/w/inbox/_components/inbox-types";
import { QaFeedbackPinWidget } from "@/components/workspace/QaFeedbackPinWidget";
import { GET as getSampleKitZip } from "@/app/api/public/qa-sample-kit/route";
import {
  buildDefaultMonthlyGraphicPair,
  hydrateMonthlyChartsFromDbRows,
} from "@/domain/magazine/monthly-stats-hydration";
import {
  formatKrw,
  formatPriceRange,
  normalizePriceBandInput,
  parseLegacyBand,
  validateBlindPriceBand,
} from "@/lib/deal-card/price-band";
import { formatKrPhoneInput } from "@/lib/format/phone";
import { TERMS } from "@/lib/ux/lexicon";
import { formatListDate } from "@/lib/workspace/list-date";
import {
  sortImWorkspaceItems,
  type ImListItem,
} from "@/app/(broker)/broker/w/im/_components/im-workspace-types";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT_DIR = process.cwd();

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function walkFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const normalized = full.replace(/\\/g, "/");
      if (normalized.endsWith("/src/tests") || normalized.includes("/src/tests/")) {
        continue;
      }
      results.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function buildMockInboxThread(overrides: Partial<InboxThreadItem> = {}): InboxThreadItem {
  return {
    id: "thread-r3-1",
    clientName: "박매수 상무",
    clientPhone: "010-4120-8831",
    clientEmail: "",
    clientGrade: "VIP",
    buildingTitle: "강남구 역삼동 근생빌딩",
    buildingId: "bld-r3-1",
    latestEvent: "상세 IM 열람 신청",
    gateStatus: "pending",
    updatedAt: "2026-11-16T01:25:32.000Z",
    openCount: 2,
    isRead: false,
    status: "pending_gate",
    shareToken: "slk.mocktoken",
    events: [],
    budget: "100~150억",
    preferredRegion: "강남·서초",
    ...overrides,
  };
}

describe("Round-3 Tester Feedback Remediation (26-11-16)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("1. Enforces concentric segmented pill CSS rules and usage across workspace components", () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, "src/app/globals.css"), "utf8");
    expect(css).toContain(".ios-segmented-track");
    expect(css).toMatch(/\.ios-segmented-track[\s\S]*border-radius:\s*12px/);
    expect(css).toMatch(/\.ios-segmented-track[\s\S]*padding:\s*3px/);
    expect(css).toMatch(/\.ios-segmented-track[\s\S]*overflow:\s*hidden/);
    expect(css).toContain(".ios-segmented-pill");
    expect(css).toMatch(/\.ios-segmented-pill[\s\S]*border-radius:\s*9px/);

    const filesToCheck = [
      "src/components/workspace/FontScaleToggle.tsx",
      "src/components/workspace/list/WorkspaceList.tsx",
      "src/app/(broker)/broker/w/im/_components/ImPreviewPane.tsx",
      "src/components/workspace/WorkspaceShell.tsx",
    ];
    for (const relPath of filesToCheck) {
      const src = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
      expect(src, `${relPath} missing ios-segmented-track`).toContain("ios-segmented-track");
      expect(src, `${relPath} missing ios-segmented-pill`).toContain("ios-segmented-pill");
    }

    const html = renderToStaticMarkup(<FontScaleToggle />);
    expect(html).toContain("ios-segmented-track");
    expect(html).toContain("ios-segmented-pill");
  });

  it("2. Moves 6-month chart basis to subtitle/header without repeating '평당가 중앙' across bars", async () => {
    const sampleTxRows = [
      "2026-05-10",
      "2026-06-12",
      "2026-07-15",
      "2026-08-18",
      "2026-09-20",
      "2026-10-22",
    ].map((txDate, idx) => ({
      building_type: "일반",
      transaction_date: txDate,
      transaction_price: (80 + idx * 5) * 100_000_000,
      building_area: 1000,
      land_area: 500,
    }));

    const hydrated = hydrateMonthlyChartsFromDbRows({
      regionKey: "gangnam_seocho",
      pair: ["molit_tx_price_trend", "bok_loan_rate_cap_spread"],
      transactions: sampleTxRows,
    });

    await act(async () => {
      root.render(
        <MonthlyGlassStatCard index={0} chart={hydrated[0]} size="preview" />
      );
    });
    expect(container.textContent).toContain("만원/평");
    const hydratedBars = Array.from(
      container.querySelectorAll('[data-testid="monthly-stat-bar"]')
    );
    expect(hydratedBars.length).toBe(6);
    for (const bar of hydratedBars) {
      expect(bar.textContent || "").not.toMatch(/평당가\s*중앙/);
    }

    const legacyPair = buildDefaultMonthlyGraphicPair("gangnam_seocho");
    const legacyFixture = {
      ...legacyPair[0],
      subtitle: "기준: 연면적 평당가 중앙값(만원/평)",
      series: Array.from({ length: 6 }, (_, idx) => ({
        label: `26.0${idx + 5}`,
        primaryValue: 8000 + idx * 150,
        secondaryValue: 8400 + idx * 100,
        displayPrimary: `${(80 + idx * 2).toFixed(0)}억`,
        displaySecondary: `연면적 평당가 중앙 ${8400 + idx * 100}만`,
      })),
    };

    await act(async () => {
      root.render(
        <MonthlyGlassStatCard index={0} chart={legacyFixture} size="preview" />
      );
    });

    const legacyBars = Array.from(
      container.querySelectorAll('[data-testid="monthly-stat-bar"]')
    );
    expect(legacyBars.length).toBe(6);
    for (const bar of legacyBars) {
      expect(bar.textContent || "").not.toMatch(/평당가\s*중앙/);
      expect(bar.textContent || "").toContain("만");
    }
    expect(container.textContent).toContain("만원/평");
  });

  it("3. Formats large Korean price bands with >= 5% width, 조 unit, and comma thousand separators", () => {
    expect(formatPriceRange(200_000_000_000)).toBe("2,000~2,200억");
    expect(formatKrw(1_200_000_000_000)).toBe("1조 2,000억");
    expect(parseLegacyBand("2000억 이상").label).toBe("2,000억 이상");
    expect(normalizePriceBandInput("2000~2200억")).toBe("2,000~2,200억");
    expect(normalizePriceBandInput("2000억대")).toBe("2,000억대");
    expect(validateBlindPriceBand("2,000~2,010억").valid).toBe(false);
  });

  it("4. Ensures every type='tel' input file in src/ binds formatKrPhoneInput for auto-hyphenation", () => {
    expect(formatKrPhoneInput("01012345678")).toBe("010-1234-5678");
    expect(formatKrPhoneInput("0212345678")).toBe("02-1234-5678");

    const tsxFiles = walkFiles(path.join(ROOT_DIR, "src"), [".tsx", ".ts"]);
    const telFiles = tsxFiles.filter((filePath) => {
      const content = fs.readFileSync(filePath, "utf8");
      return /type\s*=\s*["']tel["']/.test(content);
    });

    expect(telFiles.length).toBeGreaterThanOrEqual(7);
    for (const filePath of telFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      expect(
        content,
        `${path.relative(ROOT_DIR, filePath)} has type="tel" without phone auto-hyphenation`
      ).toMatch(/formatKrPhoneInput|formatPhoneHyphen/);
    }
  });

  it("5. Uses CRE-lexicon buyer CTA and submits/echoes optional email & formatted phone in ContactGateModal", async () => {
    expect(TERMS.recipientImRequestCta).toBe("상세 제안서(IM) 요청");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <ContactGateModal
          isOpen
          buildingId="bld-gate-r3"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );
    });

    const nameEl = container.querySelector(
      '[data-testid="contact-gate-name"]'
    ) as HTMLInputElement;
    const phoneEl = container.querySelector(
      '[data-testid="contact-gate-phone"]'
    ) as HTMLInputElement;
    const emailEl = container.querySelector(
      '[data-testid="contact-gate-email"]'
    ) as HTMLInputElement;
    const consentEl = container.querySelector(
      '[data-testid="contact-gate-privacy-consent"]'
    ) as HTMLInputElement;
    const submitBtn = container.querySelector(
      '[data-testid="contact-gate-submit-btn"]'
    ) as HTMLButtonElement;

    await act(async () => {
      setNativeValue(nameEl, "이상덕");
      setNativeValue(phoneEl, "01012345678");
      setNativeValue(emailEl, "tester@credeal.net");
      if (!consentEl.checked) consentEl.click();
    });

    expect(phoneEl.value).toBe("010-1234-5678");

    await act(async () => {
      submitBtn.click();
    });

    const gateCall = fetchMock.mock.calls.find(([url]) => url === "/api/gate-requests");
    expect(gateCall).toBeDefined();
    const sentBody = JSON.parse(String((gateCall![1] as RequestInit).body));
    expect(sentBody.email).toBe("tester@credeal.net");

    const submittedBox = container.querySelector(
      '[data-testid="contact-gate-submitted"]'
    );
    expect(submittedBox).not.toBeNull();
    expect(submittedBox?.textContent).toContain("010-1234-5678");
    expect(submittedBox?.textContent).toContain("tester@credeal.net");
  });

  it("6. Simplifies Inbox free-tier outbound panel and supports mobile control drawer toggle", async () => {
    const thread = buildMockInboxThread();

    await act(async () => {
      root.render(
        <InboxPreviewColumn
          activeThread={thread}
          activeInboxUnitId={null}
          busyAction={null}
          showShareSheet={false}
          subscriptionTier="free"
          outboundEmail=""
          outboundBasis=""
          alimtalkTemplateId="TPL_INBOX_IM_APPROVED"
          copiedBundlePreview={null}
          showAlimtalkUpgradeSheet={false}
          confirmLockOpen={false}
          lockEntireBuilding={false}
          correctionNoticeOpen={false}
          correctionNoticeText=""
          onFocusEditorUnit={vi.fn()}
          onCopyActiveShareLink={vi.fn()}
          onSendMaterial={vi.fn()}
          onOutboundEmailChange={vi.fn()}
          onOutboundBasisChange={vi.fn()}
          onAlimtalkTemplateChange={vi.fn()}
          onPrepareCopyBundle={vi.fn()}
          onSendInboxEmail={vi.fn()}
          onSendInboxAlimtalk={vi.fn()}
          onCloseAlimtalkUpgradeSheet={vi.fn()}
          onToggleNewsletter={vi.fn()}
          onOpenEditCustomClient={vi.fn()}
          onRequestDeleteCustomClient={vi.fn()}
          onOpenConfirmLock={vi.fn()}
          onCancelConfirmLock={vi.fn()}
          onLockEntireBuildingChange={vi.fn()}
          onConfirmLockLink={vi.fn()}
          onUnlockLink={vi.fn()}
          onOpenCorrectionNotice={vi.fn()}
          onCancelCorrectionNotice={vi.fn()}
          onCorrectionNoticeTextChange={vi.fn()}
          onPublishCorrectionNotice={vi.fn()}
          onClearCorrectionNotice={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("자료 전달 방법");
    expect(
      container.querySelector('[data-testid="inbox-copy-bundle-btn"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-client-basis-select"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-alimtalk-early-access-hint"]')
    ).not.toBeNull();

    await act(async () => {
      root.render(
        <InboxListColumn
          threads={[thread]}
          filteredThreads={[thread]}
          pendingCount={1}
          firstPendingThread={thread}
          activeThread={thread}
          activeFilter="todo"
          searchQuery=""
          viewMode="simple"
          busyAction={null}
          onFilterChange={vi.fn()}
          onSearchChange={vi.fn()}
          onViewModeChange={vi.fn()}
          onSelectThread={vi.fn()}
          onApproveAndSendIm={vi.fn()}
          onOpenNewClientModal={vi.fn()}
          onOpenBulkImportModal={vi.fn()}
        />
      );
    });

    const toggleBtn = container.querySelector(
      '[data-testid="inbox-mobile-controls-toggle"]'
    ) as HTMLButtonElement | null;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn!.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      toggleBtn!.click();
    });
    expect(toggleBtn!.getAttribute("aria-expanded")).toBe("true");
  });

  it("7. Echoes submitted email without duplicate schedule copy and supports reset on SubscribeCard & SubscribeFormClient", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        status: "pending",
        message: "매주 목요일 오전 8시(KST) 발송됩니다. 확인 메일을 보내드렸습니다.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // 7a. SubscribeCard (variant="full")
    await act(async () => {
      root.render(<SubscribeCard brokerId="gangnam-lee" source="im" variant="full" />);
    });

    const cardEmail = container.querySelector('input[type="email"]') as HTMLInputElement;
    const cardConsent = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    const cardForm = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      setNativeValue(cardEmail, "reader@credeal.net");
      if (cardConsent && !cardConsent.checked) cardConsent.click();
    });
    await act(async () => {
      cardForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const cardAddr = container.querySelector(
      '[data-testid="subscribe-submitted-address"]'
    );
    expect(cardAddr?.textContent).toContain("reader@credeal.net");
    const cardStatusText =
      container.querySelector('[role="status"]')?.textContent ?? "";
    expect((cardStatusText.match(/매주 목요일/g) ?? []).length).toBeLessThanOrEqual(1);

    const cardReset = container.querySelector(
      '[data-testid="subscribe-reset-btn"]'
    ) as HTMLButtonElement | null;
    expect(cardReset).not.toBeNull();
    await act(async () => {
      cardReset!.click();
    });
    expect(container.querySelector('input[type="email"]')).not.toBeNull();

    // 7b. SubscribeFormClient
    await act(async () => {
      root.render(
        <SubscribeFormClient
          brokerId="gangnam-lee"
          brokerName="이상은"
          regions={[]}
          assets={[]}
          initialSource="qr_card"
          referrer={null}
          latestDate={null}
        />
      );
    });

    const clientPhone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    const clientEmail = container.querySelector('input[type="email"]') as HTMLInputElement;
    const clientConsent = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    const clientForm = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      setNativeValue(clientPhone, "01012345678");
      setNativeValue(clientEmail, "reader@credeal.net");
      if (clientConsent && !clientConsent.checked) clientConsent.click();
    });
    expect(clientPhone.value).toBe("010-1234-5678");
    await act(async () => {
      clientForm.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

    const clientAddr = container.querySelector(
      '[data-testid="subscribe-submitted-address"]'
    );
    expect(clientAddr?.textContent).toContain("reader@credeal.net");
    const clientStatusText =
      container.querySelector('[role="status"]')?.textContent ?? "";
    expect((clientStatusText.match(/매주 목요일/g) ?? []).length).toBeLessThanOrEqual(
      1
    );

    const clientReset = container.querySelector(
      '[data-testid="subscribe-reset-btn"]'
    ) as HTMLButtonElement | null;
    expect(clientReset).not.toBeNull();
    await act(async () => {
      clientReset!.click();
    });
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
  });

  it("8. Formats exact YY-MM-DD HH:mm:ss timestamps and sorts drafts -> published -> sample seeds", () => {
    expect(formatListDate(new Date(2026, 10, 16, 1, 25, 32))).toBe(
      "26-11-16 01:25:32"
    );
    expect(formatListDate("2026-11-16")).toBe("26-11-16");

    const baseItem: Omit<ImListItem, "id" | "buildingId" | "status" | "updatedAt"> = {
      title: "테스트 빌딩",
      address: "서울특별시 강남구 역삼동 100",
      grossYieldPct: 3.8,
      versionLabel: "v1",
    };

    const sampleSeed: ImListItem = {
      ...baseItem,
      id: "im-doc-seogyo",
      buildingId: "seogyo-seed",
      status: "published",
      isSample: true,
      updatedAt: "2026-11-16T05:00:00.000Z",
    };
    const publishedUserItem: ImListItem = {
      ...baseItem,
      id: "im-user-pub",
      buildingId: "bld-user-pub",
      status: "published",
      isSample: false,
      updatedAt: "2026-11-15T12:00:00.000Z",
    };
    const draftUserItem: ImListItem = {
      ...baseItem,
      id: "im-user-draft",
      buildingId: "bld-user-draft",
      status: "draft",
      isSample: false,
      updatedAt: "2026-11-14T10:00:00.000Z",
    };

    const sorted = sortImWorkspaceItems([
      sampleSeed,
      publishedUserItem,
      draftUserItem,
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      "im-user-draft",
      "im-user-pub",
      "im-doc-seogyo",
    ]);
  });

  it("9. Serves >=5 non-empty JPG photos and Excel rent roll in GET /api/public/qa-sample-kit", async () => {
    const res = await getSampleKitZip(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/zip");

    const bytes = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(bytes);

    const expectedPhotos = [
      "photos/01_exterior.jpg",
      "photos/02_aerial.jpg",
      "photos/03_entrance.jpg",
      "photos/04_lobby.jpg",
      "photos/05_parking.jpg",
    ];
    for (const photoPath of expectedPhotos) {
      const file = zip.file(photoPath);
      expect(file, `Missing ${photoPath} in sample ZIP`).not.toBeNull();
      const buf = await file!.async("uint8array");
      expect(buf.byteLength, `${photoPath} unexpectedly small`).toBeGreaterThan(
        1000
      );
    }

    const xlsxFile = zip.file("rentroll/CREDEAL_rentroll_template_v1.5.xlsx");
    expect(xlsxFile).not.toBeNull();
  });

  it("10. Supports re-capture preview, Lightbox Escape zoom, and '끄기 -> 📌 핀 켜기' dock restore in QaFeedbackPinWidget", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 Chrome/125.0"
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn(),
          strokeRect: vi.fn(),
          fillStyle: "#FFFFFF",
          strokeStyle: "#000000",
          lineWidth: 1,
          font: "14px sans-serif",
        }) as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      })
    );

    await act(async () => {
      root.render(<QaFeedbackPinWidget workspace="dealcards" />);
    });

    const fab = container.querySelector(
      '[data-testid="qa-pin-fab"]'
    ) as HTMLButtonElement | null;
    expect(fab).not.toBeNull();

    await act(async () => {
      fab!.click();
    });

    const refreshBtn = container.querySelector(
      '[data-testid="qa-pin-preview-refresh-btn"]'
    ) as HTMLButtonElement | null;
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn!.textContent).toContain("🔄 다시 캡처");

    await act(async () => {
      refreshBtn!.click();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const zoomBtn = container.querySelector(
      '[data-testid="qa-pin-preview-zoom-btn"]'
    ) as HTMLButtonElement | null;
    expect(zoomBtn).not.toBeNull();
    expect(
      container.querySelector('[data-testid="qa-pin-screenshot-preview"]')
    ).not.toBeNull();

    await act(async () => {
      zoomBtn!.click();
    });

    const modal = container.querySelector('[data-testid="qa-pin-zoom-modal"]');
    expect(modal).not.toBeNull();
    expect(modal!.getAttribute("role")).toBe("dialog");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(
      container.querySelector('[data-testid="qa-pin-zoom-modal"]')
    ).toBeNull();

    const disableBtn = container.querySelector(
      '[data-testid="qa-pin-disable-btn"]'
    ) as HTMLButtonElement | null;
    expect(disableBtn).not.toBeNull();

    await act(async () => {
      disableBtn!.click();
    });

    const reenableBtn = container.querySelector(
      '[data-testid="qa-pin-reenable-btn"]'
    ) as HTMLButtonElement | null;
    expect(reenableBtn).not.toBeNull();
    expect(reenableBtn!.textContent).toContain("📌 핀 켜기");

    await act(async () => {
      reenableBtn!.click();
    });

    expect(
      container.querySelector('[data-testid="qa-pin-panel"]')
    ).not.toBeNull();
  });
});
