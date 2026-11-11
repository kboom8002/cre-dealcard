/**
 * L4. 데이터베이스 제약조건 · 다중 변형 · Cold-Start 복원 · 캐시 일관성 예방 테스트 (PT-401 ~ PT-404)
 *
 * 실전 프로덕션 경험 교훈:
 * - PT-401: 동일 중개사·동일 필지(PNU 4146311800113230002) 다중 IM(수기 vs .xlsx vs 사옥용) 저장 시
 *           Postgres GENERATED 컬럼(`428C9`) 및 `(owner_id, pnu)` 유니크 제약(`23505`) 우회 재시도 검증
 * - PT-402: 동일 일자 복수 뉴스레터(주간호 vs 일간 브리핑 vs 호외) 발행 시 `?edition=<uuid>` 격리 및
 *           레거시 UUID → 정규 slug 308 리다이렉트 시 `?edition=` 쿼리 보존 검증
 * - PT-403: Vercel 서버리스 Cold-Start(인메모리 스토어 초기화) 직후 `resolveOrSynthesizeQuickImRecord`가
 *           DB `activity_events` + `document_objects`만으로 매매가·면적·실사진 8장을 100% 복원하는지 검증
 * - PT-404: 매매가 수정(`28억 → 30억`) 후 Warm 인스턴스 인메모리 캐시가 오래된 값을 반환하지 않고
 *           최신 타임스탬프 기준으로 즉시 덮어쓰는지 검증
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  clearQuickImStoreForTest,
  getQuickImRecord,
  resolveOrSynthesizeQuickImRecord,
  synthesizeQuickRecordFromImItem,
} from "@/lib/im-lite/quick-generate-store";
import { findIssueForDate } from "@/lib/magazine/public-page-data";

const BOJEONG_PNU = "4146311800113230002";
const BROKER_UUID = "11111111-2222-4333-8444-555555555555";

describe("L4 DB Constraints, Multi-Variant Isolation, Cold-Start & Cache Consistency (PT-401 ~ PT-404)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearQuickImStoreForTest();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    clearQuickImStoreForTest();
    vi.restoreAllMocks();
  });

  it("[PT-401] persists 3 IM variants for the same owner & PNU without 428C9 generated-column or 23505 unique-index failure", async () => {
    const ssotRows = new Map<string, Record<string, any>>();
    const docRows = new Map<string, Record<string, any>>();
    const eventRows: Array<Record<string, any>> = [];
    let uniqueCollisionCount = 0;

    // Stateful mock enforcing real Postgres constraints on building_ssot_lite & document_objects
    const mockSupabase = {
      from(table: string) {
        if (table === "building_ssot_lite") {
          return {
            select() {
              const chain: any = {
                eq: () => chain,
                ilike: () => chain,
                order: () => chain,
                limit: async () => ({ data: Array.from(ssotRows.values()), error: null }),
                maybeSingle: async () => ({ data: null, error: null }),
              };
              return chain;
            },
            async upsert(payload: Record<string, any>) {
              // Constraint 1: Postgres GENERATED ALWAYS column `pnu` rejects top-level `pnu` key (SQLSTATE 428C9)
              if (Object.prototype.hasOwnProperty.call(payload, "pnu")) {
                return {
                  data: null,
                  error: {
                    code: "428C9",
                    message: 'cannot insert a non-DEFAULT value into column "pnu"',
                  },
                };
              }
              // Constraint 2: Unique index on (owner_id, layers->location->>pnu) where pnu IS NOT NULL (SQLSTATE 23505)
              const generatedPnu = payload?.layers?.location?.pnu ?? null;
              if (generatedPnu && payload.owner_id) {
                for (const existing of ssotRows.values()) {
                  const existingPnu = existing?.layers?.location?.pnu ?? null;
                  if (
                    existing.id !== payload.id &&
                    existing.owner_id === payload.owner_id &&
                    existingPnu === generatedPnu
                  ) {
                    uniqueCollisionCount += 1;
                    return {
                      data: null,
                      error: {
                        code: "23505",
                        message:
                          'duplicate key value violates unique constraint "idx_building_ssot_lite_owner_pnu"',
                      },
                    };
                  }
                }
              }
              ssotRows.set(payload.id, structuredClone(payload));
              return { data: payload, error: null };
            },
          };
        }

        if (table === "document_objects") {
          return {
            select() {
              const chain: any = {
                eq: () => chain,
                in: () => chain,
                order: () => chain,
                limit: async () => ({ data: Array.from(docRows.values()), error: null }),
              };
              return chain;
            },
            async insert(payload: Record<string, any>) {
              // Constraint 3: FK document_objects.building_id -> building_ssot_lite.id (SQLSTATE 23503)
              if (!ssotRows.has(payload.building_id)) {
                return {
                  data: null,
                  error: {
                    code: "23503",
                    message: `insert or update on table "document_objects" violates foreign key constraint "document_objects_building_id_fkey"`,
                  },
                };
              }
              docRows.set(payload.id, structuredClone(payload));
              return { data: payload, error: null };
            },
          };
        }

        if (table === "activity_events") {
          return {
            async insert(payload: Record<string, any>) {
              eventRows.push(structuredClone(payload));
              return { data: payload, error: null };
            },
            select() {
              const chain: any = {
                eq: () => chain,
                in: () => chain,
                order: () => chain,
                limit: async () => ({ data: eventRows, error: null }),
              };
              return chain;
            },
          };
        }

        return {
          select() {
            const chain: any = {
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: async () => ({ data: [], error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return chain;
          },
          upsert: async () => ({ data: null, error: null }),
          insert: async () => ({ data: null, error: null }),
        };
      },
    };

    vi.resetModules();
    vi.doMock("@/lib/auth-guard", () => ({
      requireBroker: vi.fn().mockResolvedValue({
        user: { id: BROKER_UUID, email: "broker@credeal.net" },
        error: null,
      }),
    }));
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => mockSupabase,
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => mockSupabase,
    }));

    // Enable DB persistence branch inside quick-generate route
    process.env.VITEST = "";
    (process.env as Record<string, string>).NODE_ENV = "production";

    const { POST } = await import("@/app/api/broker/im-lite/quick-generate/route");

    const variants = [
      {
        buildingId: "982bd803-368a-49ca-9d0d-5bff92b07c60",
        buildingName: "보정동 웰빙프라자 (수기 입력)",
        posture: "income",
        askingPriceManwon: 280000,
      },
      {
        buildingId: "aed927f6-9bd2-4b13-b8f9-8d9f5240ac6a",
        buildingName: "보정동 웰빙프라자 (엑셀 업로드)",
        posture: "income",
        askingPriceManwon: 280000,
      },
      {
        buildingId: "c3499912-77aa-4ef0-9123-1990ccbbaa11",
        buildingName: "보정동 웰빙프라자 (사옥 검토)",
        posture: "owner_use",
        askingPriceManwon: 285000,
      },
    ];

    for (const v of variants) {
      const req = new NextRequest("https://www.credeal.net/api/broker/im-lite/quick-generate", {
        method: "POST",
        body: JSON.stringify({
          buildingId: v.buildingId,
          address: "경기도 용인시 기흥구 보정동 1323-2",
          buildingName: v.buildingName,
          askingPriceManwon: v.askingPriceManwon,
          posture: v.posture,
          gfaSqm: 1230.46,
          landAreaSqm: 440,
          zoning: "제1종일반주거지역",
          floorsAbove: 3,
          floorsBelow: 1,
          bcrPct: 49.91,
          farPct: 209.24,
          rentRoll: [
            { floor: "1F", unit: "101호", use: "편의점", areaSqm: 219.62, depositManwon: 10000, monthlyRentManwon: 330, status: "occupied" },
            { floor: "2F", unit: "201호", use: "학원", areaSqm: 219.62, depositManwon: 5000, monthlyRentManwon: 230, status: "occupied" },
          ],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
    }

    // All 3 building_ssot_lite rows and all 3 document_objects rows must succeed!
    expect(ssotRows.size).toBe(3);
    expect(docRows.size).toBe(3);
    // Variant 2 and Variant 3 hit 23505 on first attempt and automatically retried with canonical_pnu
    expect(uniqueCollisionCount).toBe(2);

    const firstRow = ssotRows.get(variants[0].buildingId)!;
    const secondRow = ssotRows.get(variants[1].buildingId)!;
    const thirdRow = ssotRows.get(variants[2].buildingId)!;

    expect(firstRow.layers.location.pnu).toBe(BOJEONG_PNU);
    expect(secondRow.layers.location.pnu).toBeUndefined();
    expect(secondRow.layers.location.canonical_pnu).toBe(BOJEONG_PNU);
    expect(thirdRow.layers.location.pnu).toBeUndefined();
    expect(thirdRow.layers.location.canonical_pnu).toBe(BOJEONG_PNU);
  });

  it("[PT-402] isolates same-day newsletter editions via ?edition=<uuid> and preserves ?edition across UUID-to-slug redirects", async () => {
    const weeklyId = "aaaaaaaa-1111-4111-8111-111111111111";
    const dailyId = "bbbbbbbb-2222-4222-8222-222222222222";
    const dateStr = "2026-05-10"; // Past KST date so classifyIssueDate returns 'ok'

    const editionsDb = [
      {
        id: weeklyId,
        broker_id: BROKER_UUID,
        status: "published",
        edition_type: "regular",
        edition_label: dateStr,
        title: "5월 2주차 주간 시장 리포트",
        market_temp: "보합",
        content: { headline: "5월 2주차 주간 시장 리포트", status: "published" },
        published_at: "2026-05-10T01:00:00.000Z",
      },
      {
        id: dailyId,
        broker_id: BROKER_UUID,
        status: "published",
        edition_type: "daily",
        edition_label: `${dateStr}-daily`,
        title: "보정동·죽전 상권 일간 브리핑",
        market_temp: "강세",
        content: { headline: "보정동·죽전 상권 일간 브리핑", cadence: "daily", status: "published" },
        published_at: "2026-05-10T05:30:00.000Z",
      },
    ];

    const mockMagDb = {
      from(table: string) {
        if (table === "magazine_editions") {
          let filtered = [...editionsDb];
          const chain: any = {
            select: () => chain,
            in: (_col: string, vals: string[]) => {
              filtered = filtered.filter((r) => vals.includes(r.broker_id));
              return chain;
            },
            eq: (col: string, val: string) => {
              filtered = filtered.filter((r: any) => r[col] === val);
              return chain;
            },
            gte: () => chain,
            lt: () => chain,
            order: () => chain,
            limit: async (n: number) => ({ data: filtered.slice(0, n), error: null }),
          };
          return chain;
        }
        if (table === "magazine_issues") {
          const chain: any = {
            select: () => chain,
            in: () => chain,
            eq: () => chain,
            order: () => chain,
            limit: async () => ({
              data: [
                {
                  id: weeklyId,
                  content: { headline: "5월 2주차 주간 시장 리포트", status: "published" },
                  updated_at: "2026-05-10T01:00:00.000Z",
                },
              ],
              error: null,
            }),
          };
          return chain;
        }
        if (table === "broker_profiles") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: { user_id: BROKER_UUID, slug: "gold-partner", name: "김중개 대표" },
              error: null,
            }),
          };
          return chain;
        }
        return {};
      },
    };

    // 1. Without editionId -> resolves default issue (Weekly)
    const defaultIssue = await findIssueForDate(
      mockMagDb,
      { user_id: BROKER_UUID, slug: "gold-partner" },
      dateStr
    );
    expect(defaultIssue?.headline).toBe("5월 2주차 주간 시장 리포트");

    // 2. With ?edition=<dailyId> -> resolves exact Daily briefing even when magazine_issues has Weekly!
    const dailyIssue = await findIssueForDate(
      mockMagDb,
      { user_id: BROKER_UUID, slug: "gold-partner" },
      dateStr,
      dailyId
    );
    expect(dailyIssue?.id).toBe(dailyId);
    expect(dailyIssue?.headline).toBe("보정동·죽전 상권 일간 브리핑");
    expect(dailyIssue?.cadence).toBe("daily");

    // 3. Verify MagazinePage preserves ?edition=<dailyId>&target=vip on 308 redirect from UUID -> slug
    const redirectCalls: string[] = [];
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
      },
      permanentRedirect: (url: string) => {
        redirectCalls.push(url);
        throw new Error(`REDIRECT:${url}`);
      },
    }));
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => mockMagDb,
    }));

    const { default: MagazinePage } = await import(
      "@/app/(magazine)/magazine/[brokerId]/[date]/page"
    );

    await expect(
      MagazinePage({
        params: Promise.resolve({ brokerId: BROKER_UUID, date: dateStr }),
        searchParams: Promise.resolve({ edition: dailyId, target: "vip" }),
      })
    ).rejects.toThrow(`REDIRECT:/magazine/gold-partner/${dateStr}?edition=${dailyId}&target=vip`);

    expect(redirectCalls).toEqual([
      `/magazine/gold-partner/${dateStr}?edition=${dailyId}&target=vip`,
    ]);
  });

  it("[PT-403] reconstructs full Bojeong-dong IM + 8 real Storage photos after Serverless Cold-Start memory wipe", async () => {
    const bojeongId = "982bd803-368a-49ca-9d0d-5bff92b07c60";
    clearQuickImStoreForTest();
    expect(getQuickImRecord(bojeongId)).toBeNull();

    const storagePhotos = Array.from({ length: 8 }, (_, idx) => ({
      url: `https://proj.supabase.co/storage/v1/object/public/building_photos/${bojeongId}/im-photos/0${idx + 1}_bojeong.jpg`,
      category: idx === 0 ? "exterior" : idx === 7 ? "parking" : "interior",
      caption: `보정동 현장실사 ${idx + 1}`,
    }));

    const mockColdStartDb = {
      from(table: string) {
        if (table === "activity_events") {
          const chain: any = {
            select: () => chain,
            in: () => chain,
            order: () => chain,
            limit: async () => ({
              data: [
                {
                  actor_id: BROKER_UUID,
                  entity_id: bojeongId,
                  event_type: "im_upserted",
                  created_at: "2026-11-11T06:20:00.000Z",
                  metadata: {
                    building_id: bojeongId,
                    im_item: {
                      id: "64bacb6b-1111-4222-8333-444444444444",
                      buildingId: bojeongId,
                      title: "보정동 웰빙프라자",
                      address: "경기도 용인시 기흥구 보정동 1323-2",
                      askingPriceManwon: 280000,
                      gfaSqm: 1230.46,
                      landAreaSqm: 440,
                      bcrPct: 49.91,
                      farPct: 209.24,
                      zoning: "제1종일반주거지역",
                      floorsAbove: 3,
                      floorsBelow: 1,
                      parkingTotal: 10,
                      elevatorCount: 1,
                      rentRoll: [
                        { floor: "B1", unit: "B101", use: "스크린골프", areaSqm: 309.76, depositManwon: 5000, monthlyRentManwon: 180, status: "occupied" },
                        { floor: "1F", unit: "101", use: "편의점·베이커리", areaSqm: 219.62, depositManwon: 10000, monthlyRentManwon: 330, status: "occupied" },
                        { floor: "2F", unit: "201", use: "영어학원", areaSqm: 219.62, depositManwon: 5000, monthlyRentManwon: 230, status: "occupied" },
                        { floor: "3F", unit: "301", use: "필라테스", areaSqm: 219.62, depositManwon: 3000, monthlyRentManwon: 159, status: "occupied" },
                      ],
                    },
                    broker_profile: {
                      displayName: "박상현 대표중개사",
                      company: "크리딜부동산중개법인",
                      phone: "02-555-8899",
                      registrationNo: "41463-2023-00088",
                    },
                  },
                },
              ],
              error: null,
            }),
          };
          return chain;
        }
        if (table === "document_objects") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            in: () => chain,
            order: () => chain,
            limit: async () => ({
              data: [
                {
                  id: "64bacb6b-1111-4222-8333-444444444444",
                  status: "published",
                  photos_v2: storagePhotos,
                  photos: storagePhotos,
                  photo_urls: storagePhotos.map((p) => p.url),
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

    const recovered = await resolveOrSynthesizeQuickImRecord(bojeongId, mockColdStartDb);
    expect(recovered).not.toBeNull();
    expect(recovered!.askingPriceManwon).toBe(280000);
    expect(recovered!.pnu).toBe(BOJEONG_PNU);
    expect(recovered!.specs?.gfaSqm).toBeCloseTo(1230.46, 2);
    expect(recovered!.specs?.landAreaSqm).toBe(440);
    expect(recovered!.specs?.bcrPct).toBeCloseTo(49.91, 2);
    expect(recovered!.specs?.farPct).toBeCloseTo(209.24, 2);

    const recoveredPhotos = recovered!.fullDocBody?.photos_v2 ?? [];
    expect(recoveredPhotos).toHaveLength(8);
    expect(
      recoveredPhotos.every((p: any) =>
        String(p.url).startsWith("https://proj.supabase.co/storage/v1/object/public/building_photos/")
      )
    ).toBe(true);
  });

  it("[PT-404] overrides stale warm-cache price (28억) when newer DB update (30억) exists", async () => {
    const targetBldId = "aed927f6-9bd2-4b13-b8f9-8d9f5240ac6a";

    // 1. Seed warm in-memory cache with older 28억 (280,000만원) at 05:00Z
    const warmOld = synthesizeQuickRecordFromImItem(
      targetBldId,
      {
        id: "fa35cb9c-1111-4222-8333-444444444444",
        buildingId: targetBldId,
        title: "보정동 웰빙프라자",
        address: "경기도 용인시 기흥구 보정동 1323-2",
        askingPriceManwon: 280000,
        gfaSqm: 1230.46,
        landAreaSqm: 440,
        rentRoll: [{ floor: "1F", use: "편의점", areaSqm: 219.62, depositManwon: 10000, monthlyRentManwon: 330, status: "occupied" }],
      },
      { displayName: "박상현 대표중개사", company: "크리딜부동산중개법인" },
      "2026-11-11T05:00:00.000Z",
      BROKER_UUID
    );
    expect(warmOld.askingPriceManwon).toBe(280000);
    expect(getQuickImRecord(targetBldId)?.askingPriceManwon).toBe(280000);

    // 2. Another serverless instance saved an updated 30억 (300,000만원) at 06:30Z into DB
    const mockNewerDb = {
      from(table: string) {
        if (table === "activity_events") {
          const chain: any = {
            select: () => chain,
            in: () => chain,
            order: () => chain,
            limit: async () => ({
              data: [
                {
                  actor_id: BROKER_UUID,
                  entity_id: targetBldId,
                  event_type: "im_upserted",
                  created_at: "2026-11-11T06:30:00.000Z",
                  metadata: {
                    building_id: targetBldId,
                    im_item: {
                      id: "fa35cb9c-1111-4222-8333-444444444444",
                      buildingId: targetBldId,
                      title: "보정동 웰빙프라자",
                      address: "경기도 용인시 기흥구 보정동 1323-2",
                      askingPriceManwon: 300000,
                      gfaSqm: 1230.46,
                      landAreaSqm: 440,
                      rentRoll: [
                        { floor: "1F", use: "편의점", areaSqm: 219.62, depositManwon: 10000, monthlyRentManwon: 330, status: "occupied" },
                      ],
                    },
                  },
                },
              ],
              error: null,
            }),
          };
          return chain;
        }
        if (table === "document_objects") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            in: () => chain,
            order: () => chain,
            limit: async () => ({ data: [], error: null }),
          };
          return chain;
        }
        return {};
      },
    };

    const refreshed = await resolveOrSynthesizeQuickImRecord(targetBldId, mockNewerDb);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.askingPriceManwon).toBe(300000);
    expect(refreshed!.updatedAt).toBe("2026-11-11T06:30:00.000Z");
    expect(refreshed!.basicImDoc.facts.transaction.askingPriceKrw).toBe(3_000_000_000);
    expect(refreshed!.fullDocBody?.heroCard?.askingPriceBil).toBe(30);
    // Warm cache itself must now hold the updated 30억 record
    expect(getQuickImRecord(targetBldId)?.askingPriceManwon).toBe(300000);
  });
});
