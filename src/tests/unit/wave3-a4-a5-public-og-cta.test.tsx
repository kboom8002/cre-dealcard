// @vitest-environment jsdom
/**
 * Wave 3 (Agent 3) Public OG, Metadata, CTAs, Inquiry Schema, QA Probes & Cadence Verification Suite
 * Covers: A4-07..A4-13, A5-04/12/15, A6-03, A6-06
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

// Mock sonner + next/navigation where needed
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/ux/clipboard", () => ({
  copyText: vi.fn(async () => true),
  COPY_FAILED_MESSAGE: "복사 실패",
}));

import {
  organization,
  website,
  realEstateListing,
  realEstateAgent,
  qaPage,
  searchResultsPage,
  pulsePage,
  oiticlePage,
} from "@/lib/schema-org";
import { PollSection } from "@/components/magazine/PollSection";
import { DealInquirySheet } from "@/components/magazine/DealInquirySheet";
import { SubscribeCard } from "@/components/magazine/SubscribeCard";
import { FieldNoteSection } from "@/components/magazine/viewer-sections";
import GateRequestForm from "@/components/broker/GateRequestForm";
import { IMInquiryBottomSheet } from "@/app/(public)/im-lite/[buildingId]/components/im-inquiry-bottom-sheet";

const ROOT = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("Wave 3 Agent 3 Verification Suite", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("A4-07 & A6-03: Legacy DealCard Brand Cleanup & OG/Twitter Image Completeness", () => {
    it("schema-org helpers emit 크리딜 (CREDEAL) branding without DealCard legacy strings", () => {
      const org = organization();
      expect(org.name).toBe("크리딜 (CREDEAL)");
      expect(org.alternateName).toBe("크리딜");

      const site = website();
      expect(site.name).toBe("크리딜 (CREDEAL)");

      const listing = realEstateListing({
        id: "b1",
        area_signal: "강남구 역삼동",
        asset_type: "업무시설",
        price_band: "120억대",
      });
      expect(listing.description).toContain("크리딜");
      expect(listing.description).not.toContain("DealCard");

      const agent = realEstateAgent({ id: "u1" });
      expect(agent.name).not.toContain("DealCard");

      const qa = qaPage({
        id: "q1",
        title: "질문",
        content: "본문",
        ai_answer: "답변",
        category: "tax",
      });
      expect(JSON.stringify(qa)).not.toContain("DealCard");

      const sr = searchResultsPage("강남", 3);
      expect(sr.name).toContain("크리딜 (CREDEAL)");
      expect(sr.name).not.toContain("DealCard");

      expect(pulsePage({ region: "gbd", period: "w1", seoTitle: "t", summary: "s", createdAt: "2026-11-01" }).publisher.name).toBe("크리딜 (CREDEAL)");
      expect(oiticlePage({ title: "t", slug: "s", excerpt: "e", authorName: "a", authorType: "human", publishedAt: null }).publisher.name).toBe("크리딜 (CREDEAL)");
    });

    it("owned metadata files, UI components, and schedule ICS contain zero legacy DealCard brand strings", () => {
      const brandCleanedFiles = [
        "src/app/page.tsx",
        "src/app/(magazine)/layout.tsx",
        "src/app/(magazine)/magazine/[brokerId]/page.tsx",
        "src/app/(magazine)/magazine/[brokerId]/[date]/page.tsx",
        "src/app/(magazine)/magazine/[brokerId]/subscribe/page.tsx",
        "src/app/(public)/dc/[id]/page.tsx",
        "src/app/(public)/broker-profile/[slug]/page.tsx",
        "src/app/(public)/deal/[region]/[id]/page.tsx",
        "src/app/(public)/deal/[region]/page.tsx",
        "src/app/(public)/hub/page.tsx",
        "src/app/(public)/search/page.tsx",
        "src/app/(public)/im-pro/[grantId]/layout.tsx",
        "src/app/(public)/guide/page.tsx",
        "src/app/(public)/space/[region]/page.tsx",
        "src/app/(broker)/broker/deal-card/[id]/page.tsx",
        "src/app/(broker)/broker/leasing/[spaceId]/page.tsx",
        "src/app/(broker)/broker/buildings/page.tsx",
        "src/app/(auth)/onboarding/page.tsx",
        "src/app/(public)/expert-note/request/page.tsx",
        "src/app/qa-broker/full-loop/page.tsx",
        "src/components/feedback/SurveyProvider.tsx",
        "src/components/onboarding/OnboardingOrchestrator.tsx",
        "src/components/onboarding/StageComplete.tsx",
        "src/components/onboarding/StageReveal.tsx",
        "src/components/layout/PublicBottomNav.tsx",
        "src/components/agora/AgoraAiAnswer.tsx",
        "src/app/api/broker/schedule/export/route.ts",
      ];

      for (const rel of brandCleanedFiles) {
        const src = readSrc(rel);
        expect(src, `${rel} still contains CRE DealCard`).not.toContain("CRE DealCard");
        expect(src, `${rel} still contains CRE Deal Card`).not.toContain("CRE Deal Card");
        expect(src, `${rel} still contains DealCard Hub`).not.toContain("DealCard Hub");
        expect(src, `${rel} still contains | DealCard`).not.toContain("| DealCard");
        expect(src, `${rel} still contains DealCard AI`).not.toContain("DealCard AI");
        expect(src, `${rel} still contains DealCard Vibe`).not.toContain("DealCard Vibe");
        expect(src, `${rel} still contains 크리딜 DealCard`).not.toContain("크리딜 DealCard");
      }
    });

    it("all owned pages with openGraph metadata specify explicit openGraph.images and twitter.images", () => {
      const ogPages = [
        "src/app/page.tsx",
        "src/app/(magazine)/layout.tsx",
        "src/app/(magazine)/magazine/[brokerId]/page.tsx",
        "src/app/(magazine)/magazine/[brokerId]/subscribe/page.tsx",
        "src/app/(public)/broker-profile/[slug]/page.tsx",
        "src/app/(public)/deal/[region]/[id]/page.tsx",
        "src/app/(public)/deal/[region]/page.tsx",
        "src/app/(public)/hub/page.tsx",
        "src/app/(public)/search/page.tsx",
        "src/app/(public)/im-pro/[grantId]/layout.tsx",
        "src/app/(public)/guide/page.tsx",
        "src/app/(public)/space/[region]/page.tsx",
      ];
      for (const rel of ogPages) {
        const src = readSrc(rel);
        expect(src, `${rel} missing openGraph images`).toMatch(/openGraph\s*:\s*\{[\s\S]*images\s*:/);
        expect(src, `${rel} missing twitter images`).toMatch(/twitter\s*:\s*\{[\s\S]*images\s*:/);
      }
    });

    it("subscribe/page.tsx passes latestDate into /api/og/magazine query string", () => {
      const src = readSrc("src/app/(magazine)/magazine/[brokerId]/subscribe/page.tsx");
      expect(src).toContain("found.latestDate");
      expect(src).toContain("/api/og/magazine?brokerId=");
      expect(src).toContain("&date=${encodeURIComponent(found.latestDate)}");
    });
  });

  describe("A4-08 & A4-09: OG Image Generators & Typography Readability", () => {
    it("og/broker/[slug]/route.tsx requires resolved profile (404 otherwise), counts public deals only, and uses >=36px/56px fonts", () => {
      const src = readSrc("src/app/api/og/broker/[slug]/route.tsx");
      expect(src).toContain("if (!resolvedProfile)");
      expect(src).toContain("status: 404");
      expect(src).toContain('.eq("status", "public_signal_ready")');
      expect(src).toContain("PUBLIC_WORKSPACE_ITEM_STATUSES");
      expect(src).toContain("fontSize: 60");
      expect(src).toContain("fontSize: 36");
      expect(src).not.toMatch(/fontSize:\s*(1[0-9]|2[0-9])\b/);
    });

    it("og/deal/[id]/kakao/route.tsx uses Kakao-readable >=34px badges/tiles and 54-58px title/price", () => {
      const src = readSrc("src/app/api/og/deal/[id]/kakao/route.tsx");
      expect(src).toContain('fontSize: "54px"');
      expect(src).toContain('fontSize: "58px"');
      expect(src).toContain('fontSize: "34px"');
      expect(src).not.toMatch(/fontSize:\s*["']1[0-9]px["']/);
      expect(src).not.toMatch(/fontSize:\s*["']20px["']/);
    });

    it("og/magazine/route.tsx looks up latest issue date when brokerId is provided without date", () => {
      const src = readSrc("src/app/api/og/magazine/route.tsx");
      expect(src).toContain("resolvePublicBroker");
      expect(src).toContain("findLatestIssueDate");
    });

    it("og/broker/[slug]/route.tsx returns HTTP 404 at runtime when broker is not found", async () => {
      vi.resetModules();
      vi.doMock("@/lib/supabase/service", () => ({
        createServiceClient: vi.fn(() => ({
          from: vi.fn(() => {
            const chain: Record<string, unknown> = {};
            chain.select = vi.fn(() => chain);
            chain.eq = vi.fn(() => chain);
            chain.or = vi.fn(() => chain);
            chain.limit = vi.fn(() => chain);
            chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
            chain.single = vi.fn(async () => ({ data: null, error: null }));
            return chain;
          }),
        })),
      }));

      const { GET } = await import("@/app/api/og/broker/[slug]/route");
      const res = await GET(
        new Request("http://localhost:3000/api/og/broker/nonexistent-broker-xyz"),
        { params: Promise.resolve({ slug: "nonexistent-broker-xyz" }) }
      );
      expect(res.status).toBe(404);
      vi.doUnmock("@/lib/supabase/service");
    });
  });

  describe("A4-10..A4-13: Public Post-Submit & CTA Dead-Link Fixes", () => {
    it("PollSection (A4-10): after voting, links consult button to /broker-profile/[slug]?ref=poll-consult + shows explicit formatted phone & copy button", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({ ok: true, results: { total: 6, counts: [2, 4] } }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      );

      render(
        <PollSection
          brokerId="test-broker"
          date="2026-11-23"
          telHref="tel:01012345678"
          poll={{
            question: "향후 매수/매도 관심은?",
            options: [
              { label: "매수 검토", intent: "buyer" },
              { label: "매도 검토", intent: "seller" },
            ],
          }}
        />
      );

      fireEvent.click(screen.getByText("매도 검토"));

      await waitFor(() =>
        expect(screen.getByTestId("poll-consult-profile-link")).toBeTruthy()
      );

      const profileLink = screen.getByTestId("poll-consult-profile-link") as HTMLAnchorElement;
      expect(profileLink.getAttribute("href")).toBe("/broker-profile/test-broker?ref=poll-consult");
      expect(profileLink.textContent).toContain("매도 상담 문의하기");

      const telLink = screen.getByTestId("poll-consult-tel-link") as HTMLAnchorElement;
      expect(telLink.getAttribute("href")).toBe("tel:01012345678");
      expect(telLink.textContent).toContain("010-1234-5678");
      expect(screen.getByTestId("poll-consult-copy-phone")).toBeTruthy();
      vi.unstubAllGlobals();
      window.localStorage.clear();
    });

    it("DealInquirySheet (A4-11): replaces sms: primary CTA on non-UUID deals and omits SMS text when brokerPhone is absent", async () => {
      render(
        <div>
          <button
            type="button"
            data-testid="open-non-uuid"
            data-deal-inquiry="1"
            data-deal-id="deal-slug-1"
            data-deal-asset="꼬마빌딩"
            data-deal-address="강남구"
            data-deal-price="80억대"
          >
            열기
          </button>
          <DealInquirySheet
            brokerName="김중개"
            brokerPhone={null}
            brokerSlug="kim-cre"
          />
        </div>
      );

      fireEvent.click(screen.getByTestId("open-non-uuid"));
      await waitFor(() =>
        expect(screen.getByTestId("deal-inquiry-primary-inquiry-link")).toBeTruthy()
      );
      const primary = screen.getByTestId("deal-inquiry-primary-inquiry-link") as HTMLAnchorElement;
      expect(primary.getAttribute("href")).toContain("/expert-note/request?broker=kim-cre");
      expect(primary.getAttribute("href")).not.toMatch(/^sms:/);
      expect(document.body.textContent).not.toContain("문자로 상세 제안서(IM) 요청");
      expect(screen.getByTestId("deal-inquiry-consult-link")).toBeTruthy();
    });

    it("expert-note/request/page.tsx (A4-13): has zero dead href='/broker' link", () => {
      const src = readSrc("src/app/(public)/expert-note/request/page.tsx");
      expect(src).not.toContain('href="/broker"');
      expect(src).toContain('href="/hub"');
      expect(src).toContain("/broker-profile/");
    });
  });

  describe("A5-04: Company/Email/Name Form Fields & Migration", () => {
    it("migration 20261123000001_im_inquiry_requester_company.sql exists and adds requester_company", () => {
      const sql = readSrc("supabase/migrations/20261123000001_im_inquiry_requester_company.sql");
      expect(sql).toMatch(/ALTER TABLE IF EXISTS public\.im_inquiry_requests/i);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS requester_company text/i);
    });

    it("IMInquiryBottomSheet exposes optional company input, GateRequestForm exposes optional email input, SubscribeCard minimal exposes optional name input", () => {
      render(
        <IMInquiryBottomSheet
          buildingId="b1"
          brokerUserId="u1"
          brokerName="박중개"
          blindName="역삼동 빌딩"
          onClose={vi.fn()}
        />
      );
      expect(screen.getByLabelText("소속 · 기관명 (선택)")).toBeTruthy();
      cleanup();

      render(<GateRequestForm buildingId="b2" initialStatus="none" />);
      expect(screen.getByLabelText("이메일 (선택)")).toBeTruthy();
      cleanup();

      render(<SubscribeCard brokerId="kim-cre" source="magazine" variant="minimal" />);
      expect(screen.getByTestId("minimal-optional-name-input")).toBeTruthy();
    });

    it("qa-broker/full-loop/page.tsx uses empty loop2 default instead of Korean placeholder text", () => {
      const src = readSrc("src/app/qa-broker/full-loop/page.tsx");
      expect(src).toContain('loop2: ""');
      expect(src).not.toContain("본인 테스트 연락처 입력");
    });

    it("POST /api/public/im-inquiry persists requester_company with 42703 column-fallback to activity_events", async () => {
      vi.resetModules();
      const insertedPayloads: Array<Record<string, unknown>> = [];
      const eventMetadataList: Array<Record<string, unknown>> = [];

      vi.doMock("@/lib/rate-limiter", () => ({
        checkRateLimit: vi.fn(() => ({ allowed: true })),
      }));
      vi.doMock("@/lib/magazine/public-guard", () => ({
        getClientIp: vi.fn(() => "127.0.0.1"),
      }));
      vi.doMock("@/lib/inbox/upsert-broker-client", () => ({
        upsertBrokerClientFromInbound: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/notifications", () => ({
        createNotification: vi.fn(async () => true),
      }));
      vi.doMock("@/lib/supabase/service", () => ({
        createServiceClient: vi.fn(() => ({
          from: vi.fn((table: string) => {
            const chain: any = {
              select: vi.fn(() => chain),
              eq: vi.fn(() => chain),
              in: vi.fn(() => chain),
              is: vi.fn(() => chain),
              or: vi.fn(() => chain),
              order: vi.fn(() => chain),
              limit: vi.fn(() => chain),
              maybeSingle: vi.fn(async () => {
                if (table === "building_ssot_lite") {
                  return {
                    data: {
                      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
                      owner_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
                      area_signal: "강남구 역삼동",
                      asset_type: "업무시설",
                      status: "public_signal_ready",
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              }),
              insert: vi.fn((payload: Record<string, unknown>) => {
                if (table === "im_inquiry_requests") {
                  insertedPayloads.push(payload);
                  const hasCol = "requester_company" in payload;
                  return {
                    select: vi.fn(() => ({
                      single: vi.fn(async () =>
                        hasCol
                          ? { data: null, error: { code: "42703", message: "column requester_company does not exist" } }
                          : { data: { id: "inq-fallback-1" }, error: null }
                      ),
                    })),
                  };
                }
                if (table === "activity_events" && payload?.metadata) {
                  eventMetadataList.push(payload.metadata as Record<string, unknown>);
                }
                return Promise.resolve({ data: null, error: null });
              }),
              update: vi.fn(() => chain),
            };
            return chain;
          }),
        })),
      }));

      const { POST } = await import("@/app/api/public/im-inquiry/route");
      const res = await POST(
        new NextRequest("http://localhost:3000/api/public/im-inquiry", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            building_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            requester_name: "홍길동",
            requester_phone: "010-1234-5678",
            requesterCompany: "크리딜자산운용",
            privacy_agreed: true,
          }),
        })
      );
      expect(res.status).toBe(200);
      expect(insertedPayloads.length).toBe(2);
      expect(insertedPayloads[0].requester_company).toBe("크리딜자산운용");
      expect(insertedPayloads[1]).not.toHaveProperty("requester_company");
      expect(eventMetadataList[0]?.requester_company).toBe("크리딜자산운용");
      vi.doUnmock("@/lib/rate-limiter");
      vi.doUnmock("@/lib/magazine/public-guard");
      vi.doUnmock("@/lib/inbox/upsert-broker-client");
      vi.doUnmock("@/lib/notifications");
      vi.doUnmock("@/lib/supabase/service");
    });
  });

  describe("A5-12 & A5-15: QA Workbench Probe Accuracy, Contact Validation & URL Forms", () => {
    it("qa-workbench/route.ts validates contacts, separates inboxCheck vs subscriberCheck, supports /magazine/<slug> & /newsletter/..., resolves role, and uses callerBrokerKeys", () => {
      const src = readSrc("src/app/api/public/qa-workbench/route.ts");
      expect(src).toContain('reason: "INVALID_CONTACT"');
      expect(src).toContain("resolvePublicBroker");
      expect(src).toContain("findLatestIssueDate");
      expect(src).toMatch(/guard\.role\s*\|\|/);
      expect(src).toContain('.in("broker_id", callerBrokerKeys)');
      expect(src).toMatch(/\/newsletter/);
      expect(src).toContain('expectedLoopId === "broker-byod"');
    });

    it("qa-workbench runtime returns INVALID_CONTACT for non-contact strings and accepts /magazine/<slug>", async () => {
      vi.resetModules();
      process.env.ALLOW_PUBLIC_QA = "true";
      const { POST } = await import("@/app/api/public/qa-workbench/route");

      const res = await POST(
        new NextRequest("http://localhost:3000/api/public/qa-workbench", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: "Bearer test-token",
          },
          body: JSON.stringify({
            mode: "probe",
            expectedLoopId: "broker-byod",
            publicNewsletterUrl: "https://credeal.net/magazine/kim-cre",
            testClientContact: "본인 테스트 연락처 입력",
          }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.newsletterCheck?.validUrl).toBe(true);
      expect(data.subscriberCheck).toMatchObject({
        checked: false,
        reason: "INVALID_CONTACT",
      });
      expect(data.inboxCheck).toMatchObject({
        checked: false,
        foundInInbox: false,
        reason: "INVALID_CONTACT",
      });
    });
  });

  describe("A6-06: Cadence-Aware Copy Across Public Viewer, SubscribeCard, Distribute & Profile", () => {
    it("FieldNoteSection renders neutral '이번 호' when cadence omitted, and cadence-specific words when provided", () => {
      const note = { question: "시장 질문 내용" };
      const neutralHtml = renderToStaticMarkup(
        <FieldNoteSection fieldNote={note} brokerName="김중개" />
      );
      expect(neutralHtml).toContain("이번 호 시장");
      expect(neutralHtml).not.toContain("이번 주 시장");

      const dailyHtml = renderToStaticMarkup(
        <FieldNoteSection fieldNote={note} brokerName="김중개" cadence="daily" />
      );
      expect(dailyHtml).toContain("오늘 시장");

      const monthlyHtml = renderToStaticMarkup(
        <FieldNoteSection fieldNote={{ comment: "코멘트" }} brokerName="김중개" cadence="monthly" />
      );
      expect(monthlyHtml).toContain("이번 달 현장 코멘트");
    });

    it("SubscribeCard renders neutral '부동산 소식지' fallback and cadence-specific daily/weekly/monthly copy", () => {
      const neutralHtml = renderToStaticMarkup(
        <SubscribeCard brokerId="kim-cre" source="im" variant="full" />
      );
      expect(neutralHtml).toContain("부동산 소식지 구독하기");
      expect(neutralHtml).toContain("이메일로 신청하시면 확인 링크 클릭 즉시 자동 발송됩니다.");
      expect(neutralHtml).not.toContain("매주");

      const dailyHtml = renderToStaticMarkup(
        <SubscribeCard brokerId="kim-cre" source="im" variant="full" cadence="daily" />
      );
      expect(dailyHtml).toContain("일간 매거진 구독하기");
      expect(dailyHtml).toContain("매일 자동 발송됩니다.");

      const monthlyHtml = renderToStaticMarkup(
        <SubscribeCard brokerId="kim-cre" source="im" variant="full" cadence="monthly" />
      );
      expect(monthlyHtml).toContain("월간 매거진 구독하기");
      expect(monthlyHtml).toContain("매월 자동 발송됩니다.");
    });

    it("distribute/route.ts, magazine pages, and broker/profile/page.tsx avoid hardcoded mismatch cadence strings", () => {
      const distSrc = readSrc("src/app/api/broker/magazine/distribute/route.ts");
      expect(distSrc).toContain("일간 리포트");
      expect(distSrc).toContain("부동산 소식지");

      const profSrc = readSrc("src/app/(broker)/broker/profile/page.tsx");
      expect(profSrc).toContain("고객 소식지 하단");
      expect(profSrc).not.toContain("주간 고객 소식지 하단");

      const magIndexSrc = readSrc("src/app/(magazine)/magazine/page.tsx");
      expect(magIndexSrc).not.toContain("월간 시장 브리핑");

      const archiveSrc = readSrc("src/app/(magazine)/magazine/[brokerId]/page.tsx");
      expect(archiveSrc).not.toContain("주간 매거진 아카이브");
    });
  });
});
