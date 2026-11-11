/**
 * L7. 파이프라인 간 연쇄 연동 · 프리뷰 모달 하이드레이션 · 배포 후 스모크 계약 테스트 (PT-701 ~ PT-703)
 *
 * 실전 프로덕션 경험 교훈:
 * - PT-701: ① 공개 IM/딜카드 문의 접수(`POST /api/public/im-inquiry`) → 담당 중개사 소통함(`im_inquiry_requests` + `activity_events` + 인앱 알림 `/broker/w/inbox`) 전달 검증
 *           ② 단축 뉴스레터 링크(`GET /m/[editionId]`) → 공개 매거진 뷰어(`/magazine/[brokerId]/[date]?edition=[editionId]`) 정확 리다이렉트 검증
 * - PT-702: 우측 패널 `전체화면` 모달 및 공개 뷰어(`/im-lite`, `/dc`, `/magazine`)가 `SAMEORIGIN`으로 iframe 임베딩 가능하며,
 *           공개 IM 조회(`GET /api/public/im-lite/[buildingId]`)가 `"투자설명서 로딩 중..."` 고착 없이 즉시 `BasicImDocument` 본문을 반환하는지 검증
 * - PT-703: 배포 직후 프로덕션 스모크 러너(`scripts/release/post-deploy-prod-smoke.mjs`) 존재·문법 무결성 및 자동 정리(Auto-Cleanup) 계약 검증
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../../next.config";
import {
  clearQuickImStoreForTest,
  synthesizeQuickRecordFromImItem,
} from "@/lib/im-lite/quick-generate-store";

const BROKER_UUID = "11111111-2222-4333-8444-555555555555";
const BOJEONG_ID = "982bd803-368a-49ca-9d0d-5bff92b07c60";

describe("L7 Cross-Pipeline Handoff, Modal Hydration & Post-Deploy Smoke Contracts (PT-701 ~ PT-703)", () => {
  beforeEach(() => {
    clearQuickImStoreForTest();
  });

  afterEach(() => {
    clearQuickImStoreForTest();
    vi.restoreAllMocks();
  });

  it("[PT-701] hands off public inquiry to broker Inbox (DB + activity_events + notification) and resolves /m/[editionId] shortlink with ?edition=", async () => {
    const insertedInquiries: Array<Record<string, any>> = [];
    const insertedEvents: Array<Record<string, any>> = [];
    const sentNotifications: Array<Record<string, any>> = [];

    const editionUuid = "dddddddd-4444-4444-8444-444444444444";

    const mockSupabase = {
      from(table: string) {
        if (table === "building_ssot_lite") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                id: BOJEONG_ID,
                owner_id: BROKER_UUID,
                status: "public_signal_ready",
                area_signal: "기흥구 보정동",
                asset_type: "근린생활시설",
              },
              error: null,
            }),
          };
          return chain;
        }
        if (table === "im_inquiry_requests") {
          return {
            insert(payload: Record<string, any>) {
              insertedInquiries.push(payload);
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: "eeeeeeee-5555-4555-8555-555555555555" },
                    error: null,
                  }),
                }),
              };
            },
            update: () => ({
              eq: async () => ({ data: null, error: null }),
            }),
          };
        }
        if (table === "activity_events") {
          return {
            insert: async (payload: Record<string, any>) => {
              insertedEvents.push(payload);
              return { data: payload, error: null };
            },
          };
        }
        if (table === "magazine_editions") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            order: () => chain,
            limit: async () => ({
              data: [
                {
                  id: editionUuid,
                  broker_id: BROKER_UUID,
                  edition_label: "2026-05-10-daily",
                  status: "published",
                  published_at: "2026-05-10T06:00:00.000Z",
                  created_at: "2026-05-10T05:55:00.000Z",
                  content: { issueDate: "2026-05-10", cadence: "daily" },
                },
              ],
              error: null,
            }),
          };
          return chain;
        }
        return {};
      },
    };

    vi.resetModules();
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => mockSupabase,
    }));
    vi.doMock("@/lib/notifications/in-app", () => ({
      createNotification: vi.fn(async (notif: Record<string, any>) => {
        sentNotifications.push(notif);
        return true;
      }),
    }));

    // Part A: Investor inquiry on public viewer -> lands in broker's Inbox + activity_events + notification
    const { POST: postInquiry } = await import("@/app/api/public/im-inquiry/route");
    const inqReq = new NextRequest("https://www.credeal.net/api/public/im-inquiry", {
      method: "POST",
      body: JSON.stringify({
        building_id: BOJEONG_ID,
        broker_user_id: "99999999-9999-4999-8999-999999999999", // Spoofed broker id must be overridden by server owner_id!
        requester_name: "이투자 대표",
        requester_phone: "010-5566-7788",
        requester_email: "investor@example.com",
        message: "보정동 웰빙프라자 현장 투어 및 렌트롤 원본 요청드립니다.",
        privacy_agreed: true,
      }),
    });
    const inqRes = await postInquiry(inqReq);
    const inqJson = await inqRes.json();

    expect(inqRes.status).toBe(200);
    expect(inqJson.ok).toBe(true);
    expect(insertedInquiries).toHaveLength(1);
    // Server must enforce real building owner_id, blocking broker_user_id spoofing
    expect(insertedInquiries[0].broker_user_id).toBe(BROKER_UUID);
    expect(insertedInquiries[0].requester_phone).toBe("01055667788");
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0].event_type).toBe("gate_request_created");
    expect(sentNotifications).toHaveLength(1);
    expect(sentNotifications[0].link).toBe("/broker/w/inbox");

    // Part B: Shortlink `/m/[editionUuid]` -> redirects to `/magazine/[brokerId]/2026-05-10?edition=[editionUuid]`
    const redirectedUrls: string[] = [];
    vi.doMock("next/navigation", () => ({
      redirect: (targetUrl: string) => {
        redirectedUrls.push(targetUrl);
        const err: any = new Error(`NEXT_REDIRECT:${targetUrl}`);
        err.digest = `NEXT_REDIRECT;replace;${targetUrl};307;`;
        throw err;
      },
    }));

    const { default: ShortMagazineRedirectPage } = await import(
      "@/app/(public)/m/[slug]/page"
    );
    await expect(
      ShortMagazineRedirectPage({ params: Promise.resolve({ slug: editionUuid }) })
    ).rejects.toThrow(`NEXT_REDIRECT:/magazine/${BROKER_UUID}/2026-05-10?edition=${editionUuid}`);
    expect(redirectedUrls).toEqual([
      `/magazine/${BROKER_UUID}/2026-05-10?edition=${editionUuid}`,
    ]);
  });

  it("[PT-702] guarantees fullscreen modal iframe SAMEORIGIN headers and non-empty public IM API hydration payload", async () => {
    // 1. Verify iframe embedding headers allow `/im-lite/:path*`, `/dc/:path*`, `/magazine/:path*`
    const rules = await nextConfig.headers!();
    for (const viewerSource of ["/im-lite/:path*", "/dc/:path*", "/magazine/:path*"]) {
      const rule = rules.find((r) => r.source === viewerSource);
      expect(rule, `Missing SAMEORIGIN rule for ${viewerSource}`).toBeDefined();
      const xfo = rule!.headers.find((h) => h.key === "X-Frame-Options");
      expect(xfo?.value).toBe("SAMEORIGIN");
    }

    // 2. Seed Bojeong-dong IM and invoke `GET /api/public/im-lite/[buildingId]` to verify immediate hydration payload
    synthesizeQuickRecordFromImItem(
      BOJEONG_ID,
      {
        id: "64bacb6b-1111-4222-8333-444444444444",
        buildingId: BOJEONG_ID,
        title: "보정동 웰빙프라자",
        address: "경기도 용인시 기흥구 보정동 1323-2",
        askingPriceManwon: 280000,
        gfaSqm: 1230.46,
        landAreaSqm: 440,
        rentRoll: [
          { floor: "1F", unit: "101", use: "편의점", areaSqm: 219.62, depositManwon: 10000, monthlyRentManwon: 330, status: "occupied" },
        ],
      },
      { displayName: "박상현 대표중개사", company: "크리딜부동산중개법인", phone: "02-555-8899" },
      "2026-11-11T06:30:00.000Z",
      BROKER_UUID
    );

    vi.resetModules();
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => ({
        from: () => {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            in: () => chain,
            not: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
            then: (resolve: (v: { data: never[]; error: null }) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(resolve),
          };
          return chain;
        },
      }),
    }));
    vi.doMock("@/lib/server-viewer", () => ({
      getServerViewer: async () => ({ id: BROKER_UUID, role: "broker" }),
    }));

    const { GET: getPublicIm } = await import(
      "@/app/api/public/im-lite/[buildingId]/route"
    );
    const req = new NextRequest(
      `https://www.credeal.net/api/public/im-lite/${BOJEONG_ID}`
    );
    const res = await getPublicIm(req, {
      params: Promise.resolve({ buildingId: BOJEONG_ID }),
    });
    expect(res.status).toBe(200);
    const payload = await res.json();
    const doc = payload.document || payload.data || payload;
    expect(JSON.stringify(doc)).toContain("보정동");
    expect(JSON.stringify(doc)).toContain("28");
  });

  it("[PT-703] verifies post-deploy production smoke CLI script exists and enforces HTTP/header/CORS/cleanup checks", () => {
    const scriptPath = path.resolve(
      process.cwd(),
      "scripts/release/post-deploy-prod-smoke.mjs"
    );
    expect(fs.existsSync(scriptPath)).toBe(true);

    const content = fs.readFileSync(scriptPath, "utf8");
    // Must check both apex and www CORS origins, iframe SAMEORIGIN header, public endpoints, and deterministic cleanup
    expect(content).toContain("https://www.credeal.net");
    expect(content).toContain("https://credeal.net");
    expect(content).toContain("x-frame-options");
    expect(content).toContain("SAMEORIGIN");
    expect(content).toContain("access-control-allow-origin");
    expect(content).toContain("cleanupSmokeArtifacts");
  });
});
