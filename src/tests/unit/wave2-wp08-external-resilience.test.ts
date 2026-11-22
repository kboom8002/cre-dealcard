import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  cacheExistingRow: null as Record<string, any> | null,
  insertedRows: [] as Array<Record<string, any>>,
  updatedRows: [] as Array<{ id: string; patch: Record<string, any> }>,
  queriedTables: [] as string[],
  storageUploads: [] as Array<{ bucket: string; path: string; bytes: number; contentType?: string }>,
  sharpForceFailHeic: false,
  resendSendMock: vi.fn(async (_payload: any) => ({ data: { id: 'msg-default' }, error: null })),
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: (payload: any) => h.resendSendMock(payload),
    };
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      h.queriedTables.push(table);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        neq: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'external_data_cache') {
            return { data: h.cacheExistingRow, error: null };
          }
          if (table === 'building_ssot_lite') {
            return {
              data: {
                id: '11111111-2222-4333-8444-555555555555',
                owner_id: 'broker-owner-1',
                raw_address: '서울특별시 강남구 역삼동 742-1',
                investment_posture: 'income',
              },
              error: null,
            };
          }
          if (table === 'document_objects') {
            return {
              data: {
                id: 'doc-uuid-1',
                title: '역삼 테스트 빌딩',
                building_id: '11111111-2222-4333-8444-555555555555',
                owner_id: 'broker-owner-1',
                body: { preset: 'credeal_basic', investment_posture: 'income' },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        insert: async (rows: any) => {
          if (table === 'external_data_cache') {
            const arr = Array.isArray(rows) ? rows : [rows];
            h.insertedRows.push(...arr);
          }
          return { data: rows, error: null };
        },
        update: (patch: Record<string, any>) => ({
          eq: async (_col: string, val: string) => {
            if (table === 'external_data_cache') {
              h.updatedRows.push({ id: val, patch });
            }
            return { data: null, error: null };
          },
        }),
        upsert: async () => ({ data: null, error: null }),
      };
      return chain;
    },
    storage: {
      listBuckets: async () => ({ data: [{ name: 'building_photos' }, { name: 'building-photos' }], error: null }),
      createBucket: async () => ({ data: null, error: null }),
      from: (bucket: string) => ({
        upload: async (storagePath: string, buf: Buffer, opts?: { contentType?: string }) => {
          h.storageUploads.push({
            bucket,
            path: storagePath,
            bytes: buf.byteLength,
            contentType: opts?.contentType,
          });
          return { data: { path: storagePath }, error: null };
        },
        getPublicUrl: (storagePath: string) => ({
          data: { publicUrl: `https://storage.example.test/${bucket}/${storagePath}` },
        }),
      }),
    },
  })),
}));

import {
  isNonEmptyExternalPayload,
  enrichBuildingDataCore,
  reconstructFromCache,
} from '@/lib/external/enrich-by-pnu';
import { enrichBuildingData } from '@/lib/external/external-data-orchestrator';
import { selectPrimaryBuildingTitleRow } from '@/lib/external/building-register-api';
import { selectLatestLandPriceRecord, fetchLandPrice } from '@/lib/external/land-price-api';
import { fetchWithRetry, parseRetryAfterMs } from '@/lib/external/fetch-with-retry';
import {
  resolveAddress,
  parseJibunAddress,
  isEligibleForSeoulFallback,
} from '@/lib/external/address-resolver';
import { resolveAddressToComponents } from '@/domain/verification/address-resolver';
import {
  fetchLocationPoi,
  parseKakaoDistanceM,
  clearLocationPoiCache,
} from '@/lib/external/kakao-map-api';
import { sanitizeNaverText } from '@/lib/external/naver-search';
import { cleanNewsText } from '@/domain/external/naver-search';
import {
  runTargets,
  emptyTally,
  BATCH_CONCURRENCY,
  type RunContext,
  type PlannedTarget,
} from '@/domain/magazine/send-batch';
import { FakeDb } from '@/tests/unit/magazine/send-fake-db';

describe('Wave 2 — WP-08: External Resilience, Cache Poisoning Defense, Guards & Serverless Alignment', () => {
  beforeEach(() => {
    h.cacheExistingRow = null;
    h.insertedRows = [];
    h.updatedRows = [];
    h.queriedTables = [];
    h.storageUploads = [];
    h.sharpForceFailHeic = false;
    clearLocationPoiCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (a) `{}` Empty-Object Cache Poisoning Defense
  // ───────────────────────────────────────────────────────────────────────────
  describe('(a) External cache `{}` poisoning defense', () => {
    it('isNonEmptyExternalPayload rejects `{}` and empty shells while accepting valid payloads', () => {
      expect(isNonEmptyExternalPayload('buildingRegister', null)).toBe(false);
      expect(isNonEmptyExternalPayload('buildingRegister', {})).toBe(false);
      expect(isNonEmptyExternalPayload('buildingRegister', { totalArea: 0, platArea: 0 })).toBe(false);
      expect(isNonEmptyExternalPayload('buildingRegister', { mgmBldrgstPk: '11680-1001' })).toBe(true);
      expect(isNonEmptyExternalPayload('buildingRegister', { totArea: 845.2 })).toBe(true);

      expect(isNonEmptyExternalPayload('landPrice', {})).toBe(false);
      expect(isNonEmptyExternalPayload('landPrice', { landArea: 200 })).toBe(false);
      expect(isNonEmptyExternalPayload('landPrice', { pricePerSqm: 15_200_000 })).toBe(true);
      expect(isNonEmptyExternalPayload('landPrice', { officialLandPrice: 12_000_000 })).toBe(true);
      expect(isNonEmptyExternalPayload('landPrice', { history: [{ year: '2025', pricePerSqm: 1000 }] })).toBe(true);

      expect(isNonEmptyExternalPayload('landUsePlan', {})).toBe(false);
      expect(isNonEmptyExternalPayload('landUsePlan', { zoneTypes: [], items: [] })).toBe(false);
      expect(isNonEmptyExternalPayload('landUsePlan', { zoneTypes: ['일반상업지역'] })).toBe(true);
      expect(isNonEmptyExternalPayload('landUsePlan', { zoningDistrict: '제3종일반주거지역' })).toBe(true);

      expect(isNonEmptyExternalPayload('locationPoi', {})).toBe(false);
      expect(isNonEmptyExternalPayload('locationPoi', { stations: [], pois: [] })).toBe(false);
      expect(isNonEmptyExternalPayload('locationPoi', { nearestStation: { name: '역삼역' } })).toBe(true);

      const reconstructed = reconstructFromCache({
        pnu: '1168010100107420001',
        legal_dong_code: '1168010100',
        road_address: '서울특별시 강남구 테헤란로 152',
        jibun_address: '서울특별시 강남구 역삼동 742-1',
        latitude: 37.5006,
        longitude: 127.0365,
        building_register: {},
        official_land_price: {},
        land_use_plan: {},
        location_poi: {},
        registry_data: {},
        updated_at: new Date().toISOString(),
      });
      expect(reconstructed.buildingRegister).toBeNull();
      expect(reconstructed.landPrice).toBeNull();
      expect(reconstructed.landUsePlan).toBeNull();
      expect(reconstructed.locationPoi).toBeNull();
    });

    it('treats `{}` cached objects as cache miss in orchestrator/core and never persists `{}` on API failure', async () => {
      // 1) Poisoned fresh cache row (updated_at = now, but all JSONB columns are `{}`)
      h.cacheExistingRow = {
        id: 'cache-row-poisoned',
        updated_at: new Date().toISOString(),
        pnu: '1168010100107420001',
        legal_dong_code: '1168010100',
        road_address: '서울특별시 강남구 역삼동 742-1',
        jibun_address: '서울특별시 강남구 역삼동 742-1',
        latitude: 37.5006,
        longitude: 127.0365,
        building_register: {},
        official_land_price: {},
        land_use_plan: {},
        comparable_transactions: [],
        location_poi: {},
        registry_data: {},
      };

      // Ensure external API keys are unset so live fetches return null/empty (simulating outage)
      vi.stubEnv('DATA_GO_KR_API_KEY', '');
      vi.stubEnv('PUBLIC_DATA_API_KEY', '');
      vi.stubEnv('VWORLD_API_KEY', '');
      vi.stubEnv('KAKAO_REST_API_KEY', '');
      vi.stubEnv('NEXT_PUBLIC_KAKAO_APP_KEY', '');
      vi.stubEnv('JUSO_CONFIRM_KEY', '');
      vi.stubEnv('REGISTRY_API_KEY', '');
      vi.stubEnv('SEMAS_API_KEY', '');

      const result = await enrichBuildingData('서울특별시 강남구 역삼동 742-1', 'ssot-poisoned-1');
      expect(result).not.toBeNull();
      // Must NOT return `{}` as truthy buildingRegister / landPrice / landUsePlan / locationPoi!
      expect(result?.buildingRegister).toBeNull();
      expect(result?.landPrice).toBeNull();
      expect(result?.landUsePlan).toBeNull();
      expect(result?.locationPoi).toBeNull();

      // Update patch cleans poisoned `{}` columns to `null`, NEVER `{}`
      for (const u of h.updatedRows) {
        expect(u.patch.building_register).not.toEqual({});
        expect(u.patch.official_land_price).not.toEqual({});
        expect(u.patch.land_use_plan).not.toEqual({});
        expect(u.patch.location_poi).not.toEqual({});
      }

      // 2) Brand-new building (`existing = null`) when all APIs fail -> skips DB insert completely!
      h.cacheExistingRow = null;
      h.insertedRows = [];
      await enrichBuildingDataCore(
        {
          pnu: '1168010100107420001',
          legalDongCode: '1168010100',
          sigunguCd: '11680',
          bjdongCd: '10100',
          bun: '0742',
          ji: '0001',
          roadAddress: '서울특별시 강남구 역삼동 742-1',
          jibunAddress: '서울특별시 강남구 역삼동 742-1',
          lat: null,
          lng: null,
          buildingMgtNo: '1168010100107420001000000',
        },
        '서울특별시 강남구 역삼동 742-1',
        'ssot-all-failed'
      );
      expect(h.insertedRows).toHaveLength(0);
    });

    it('selectPrimaryBuildingTitleRow picks main building (`mainAtchGbCd === "0"`, largest `totArea`) over 12㎡ annex in `items[0]`', () => {
      const items = [
        {
          mgmBldrgstPk: 'PK-ANNEX-1',
          mainAtchGbCd: '1',
          mainAtchGbCdNm: '부속건축물',
          mainPurpsCdNm: '화장실',
          totArea: '12.4',
          platArea: '620.0',
        },
        {
          mgmBldrgstPk: 'PK-MAIN-SMALL',
          mainAtchGbCd: '0',
          mainAtchGbCdNm: '주건축물',
          mainPurpsCdNm: '제2종근린생활시설',
          totArea: '380.0',
          platArea: '620.0',
        },
        {
          mgmBldrgstPk: 'PK-MAIN-LARGE',
          mainAtchGbCd: '0',
          mainAtchGbCdNm: '주건축물',
          mainPurpsCdNm: '업무시설',
          totArea: '2480.5',
          platArea: '620.0',
        },
      ];

      const selected = selectPrimaryBuildingTitleRow(items);
      expect(selected?.mgmBldrgstPk).toBe('PK-MAIN-LARGE');
      expect(Number(selected?.totArea)).toBe(2480.5);
    });

    it('selectLatestLandPriceRecord sorts descending by year/month and fetchLandPrice honors PUBLIC_DATA_API_KEY fallback', async () => {
      const latest = selectLatestLandPriceRecord([
        { stdrYear: '2023', stdrMt: '01', pblntfPclnd: '11200000' },
        { stdrYear: '2025', stdrMt: '01', pblntfPclnd: '13400000' },
        { stdrYear: '2025', stdrMt: '07', pblntfPclnd: '13950000' },
        { stdrYear: '2024', stdrMt: '07', pblntfPclnd: '12500000' },
      ]);
      expect(latest?.stdrYear).toBe('2025');
      expect(latest?.stdrMt).toBe('07');
      expect(latest?.pblntfPclnd).toBe('13950000');

      vi.stubEnv('VWORLD_API_KEY', '');
      vi.stubEnv('DATA_GO_KR_API_KEY', '');
      vi.stubEnv('PUBLIC_DATA_API_KEY', 'test-public-key');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            indvdLandPrices: {
              field: [
                { stdrYear: '2022', stdrMt: '01', pblntfPclnd: '9800000', lndcgrCodeNm: '대' },
                { stdrYear: '2025', stdrMt: '01', pblntfPclnd: '14500000', lndcgrCodeNm: '대' },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      const lp = await fetchLandPrice('1168010100107420001');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(lp?.pricePerSqm).toBe(14_500_000);
      expect(lp?.baseYear).toBe('2025');
      expect(lp?._source).toBe('data_go_kr');
    });

    it('fetchWithRetry honors Retry-After header and aborts sleep immediately on AbortSignal', async () => {
      expect(parseRetryAfterMs('1')).toBe(1000);

      let calls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('rate limited', {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const res = await fetchWithRetry('https://api.example.test/data', {
        maxRetries: 1,
        timeoutMs: 3000,
      });
      expect(res.status).toBe(200);
      expect(calls).toBe(2);

      // AbortSignal cancels retry sleep immediately (without waiting 10s Retry-After)
      const abortCtrl = new AbortController();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        setTimeout(() => abortCtrl.abort(new Error('caller-aborted')), 15);
        return new Response('unavailable', {
          status: 503,
          headers: { 'Retry-After': '10' },
        });
      });

      const started = Date.now();
      await expect(
        fetchWithRetry('https://api.example.test/slow', {
          maxRetries: 2,
          timeoutMs: 15_000,
          signal: abortCtrl.signal,
        })
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(1000);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (b) Address Resolver: Non-Seoul Guard & Mountain-Lot PNU Digit `'2'`
  // ───────────────────────────────────────────────────────────────────────────
  describe('(b) Address resolver non-Seoul fallback guard & mountain lot PNU encoding', () => {
    it('rejects non-Seoul addresses from Seoul FALLBACK_DONG_MAP in both resolvers', async () => {
      vi.stubEnv('JUSO_CONFIRM_KEY', '');
      vi.stubEnv('KAKAO_REST_API_KEY', '');
      vi.stubEnv('NEXT_PUBLIC_KAKAO_APP_KEY', '');

      expect(isEligibleForSeoulFallback('성남시 분당구 정자동 10-1')).toBe(false);
      expect(isEligibleForSeoulFallback('부산 중구 신사동 1-1')).toBe(false);
      expect(isEligibleForSeoulFallback('대전 서구 둔산동 1-1')).toBe(false);
      expect(isEligibleForSeoulFallback('서울 종로구 평창동 산 12-3')).toBe(true);

      expect(await resolveAddress('성남시 분당구 정자동 10-1')).toBeNull();
      expect(await resolveAddress('부산 중구 신사동 1-1')).toBeNull();
      expect(await resolveAddress('대전 서구 둔산동 1-1')).toBeNull();

      expect(await resolveAddressToComponents('성남시 분당구 정자동 10-1')).toBeNull();
      expect(await resolveAddressToComponents('부산 중구 신사동 1-1')).toBeNull();
      expect(await resolveAddressToComponents('대전 서구 둔산동 1-1')).toBeNull();
    });

    it('encodes mountain lots (`서울 종로구 평창동 산 12-3`, `산12`) with platGbCd="1" and PNU 11th digit "2"', async () => {
      vi.stubEnv('JUSO_CONFIRM_KEY', '');
      vi.stubEnv('KAKAO_REST_API_KEY', '');
      vi.stubEnv('NEXT_PUBLIC_KAKAO_APP_KEY', '');

      const parsedSpaced = parseJibunAddress('서울 종로구 평창동 산 12-3');
      expect(parsedSpaced).toEqual({
        bun: '12',
        ji: '3',
        isMount: true,
        platGbCd: '1',
      });

      const parsedCompact = parseJibunAddress('서울 종로구 평창동 산12');
      expect(parsedCompact).toEqual({
        bun: '12',
        ji: '0',
        isMount: true,
        platGbCd: '1',
      });

      const resolved = await resolveAddress('서울 종로구 평창동 산 12-3');
      expect(resolved).not.toBeNull();
      expect(resolved?.sigunguCd).toBe('11110');
      expect(resolved?.bjdongCd).toBe('18300');
      expect(resolved?.platGbCd).toBe('1');
      expect(resolved?.pnu).toBe('1111018300200120003');
      expect(resolved?.pnu.charAt(10)).toBe('2');

      const comp = await resolveAddressToComponents('서울 종로구 평창동 산 12-3');
      expect(comp).not.toBeNull();
      expect(comp?.sigunguCd).toBe('11110');
      expect(comp?.bjdongCd).toBe('18300');
      expect(comp?.platGbCd).toBe('1');
      expect(comp?.isMount).toBe(true);
      expect(comp?.pnu).toBe('1111018300200120003');

      const generalLot = await resolveAddress('서울 종로구 평창동 12-3');
      expect(generalLot?.platGbCd).toBe('0');
      expect(generalLot?.pnu).toBe('1111018300100120003');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (c) Kakao Local API Empty Distance Guard + Bounded TTL Cache & Naver Sanitizer
  // ───────────────────────────────────────────────────────────────────────────
  describe('(c) Kakao POI distance guard & TTL cache + Naver sanitizer', () => {
    it('treats `distance: ""` and NaN as `null` (never `0m`) and caches repeated 5-decimal coordinate lookups', async () => {
      expect(parseKakaoDistanceM('')).toBeNull();
      expect(parseKakaoDistanceM('   ')).toBeNull();
      expect(parseKakaoDistanceM('NaN')).toBeNull();
      expect(parseKakaoDistanceM(undefined)).toBeNull();
      expect(parseKakaoDistanceM('0')).toBe(0);
      expect(parseKakaoDistanceM('340')).toBe(340);

      vi.stubEnv('KAKAO_REST_API_KEY', 'kakao-test-key');

      let fetchCalls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        fetchCalls += 1;
        const url = String(input);
        if (url.includes('category_group_code=SW8')) {
          return new Response(
            JSON.stringify({
              documents: [
                {
                  place_name: '역삼역 2호선',
                  x: '127.0364',
                  y: '37.5006',
                  distance: '', // Empty distance from Kakao -> MUST be null, NEVER 0 or 500!
                  category_name: '교통,수송 > 지하철,전철 > 수도권2호선',
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ meta: { total_count: 2 }, documents: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

      const first = await fetchLocationPoi(37.500612, 127.036512);
      expect(first?.nearestStation?.name).toBe('역삼역 2호선');
      expect(first?.nearestStation?.distanceM).toBeNull();
      expect(first?.nearestStation?.walkMinutes).toBeNull();

      const callsAfterFirst = fetchCalls;
      expect(callsAfterFirst).toBeGreaterThan(0);

      // Second call within 5-decimal rounding (`37.50061`, `127.03651`) hits TTL cache without new HTTP calls
      const second = await fetchLocationPoi(37.500614, 127.036514);
      expect(fetchCalls).toBe(callsAfterFirst);
      expect(second?.nearestStation?.distanceM).toBeNull();
    });

    it('sanitizes HTML entities, highlight tags, and control characters in both naver-search modules', () => {
      const dirty = '<b>강남</b> &quot;꼬마빌딩&quot; &amp; &#39;수익률&#39;\u0000\u0007 &lt;b&gt;상승&lt;/b&gt;\r\n';
      expect(sanitizeNaverText(dirty)).toBe('강남 "꼬마빌딩" & \'수익률\' 상승');
      expect(cleanNewsText(dirty)).toBe('강남 "꼬마빌딩" & \'수익률\' 상승');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (d) Serverless `maxDuration`, `building_ssot_lite` Fix, & HEIC 415 Guard
  // ───────────────────────────────────────────────────────────────────────────
  describe('(d) pptx-studio download `building_ssot_lite` query, maxDuration alignment & HEIC 415', () => {
    it('pptx-studio/projects/[id]/download queries `building_ssot_lite` (not `buildings`) and exports maxDuration = 300', async () => {
      vi.doMock('@/domain/building/pptx-studio/studio-service', () => ({
        studioService: {
          getProject: vi.fn().mockResolvedValue({
            id: 'proj-1',
            dealId: '11111111-2222-4333-8444-555555555555',
            title: '역삼 테스트 빌딩',
            stage: 'ready',
            slides: [],
          }),
          findProjectByDealId: vi.fn().mockResolvedValue(null),
        },
      }));
      vi.doMock('@/lib/authz/studio-owner', () => ({
        assertStudioDealOwner: vi.fn().mockResolvedValue(null),
      }));
      vi.doMock('@/domain/broker/broker-contact', () => ({
        fetchBrokerContact: vi.fn().mockResolvedValue(null),
        toPptxBrokerInput: vi.fn().mockReturnValue(null),
      }));
      vi.doMock('@/domain/building/mobile-im/pptx/pptx-renderer', () => ({
        MobileImPptxRenderer: class {
          async render() {
            return {
              buffer: Buffer.from('PK-PPTX-BINARY'),
              slideCount: 10,
              fileSizeBytes: 14,
            };
          }
        },
      }));

      const pptxDownloadRoute = await import('@/app/api/broker/pptx-studio/projects/[id]/download/route');
      expect(pptxDownloadRoute.maxDuration).toBe(300);

      h.queriedTables = [];
      const req = new NextRequest('http://localhost/api/broker/pptx-studio/projects/proj-1/download', {
        headers: { 'x-test-bypass': '1' },
      });
      const res = await pptxDownloadRoute.GET(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(200);
      expect(h.queriedTables).toContain('building_ssot_lite');
      expect(h.queriedTables).not.toContain('buildings');
    });

    it('exports aligned maxDuration across all required route handlers and vercel.json', async () => {
      const distributeMod = await import('@/app/api/broker/magazine/distribute/route');
      const issuesMod = await import('@/app/api/magazine/issues/route');
      const pulseMod = await import('@/app/api/pulse/generate/route');
      const basicDownloadMod = await import('@/app/api/broker/basic-im-studio/[id]/download/route');
      const buildingUploadMod = await import('@/app/api/broker/buildings/[id]/photos/upload/route');
      const imUploadMod = await import('@/app/api/broker/im/upload-photo/route');
      const quickGenMod = await import('@/app/api/broker/im-lite/quick-generate/route');

      expect(distributeMod.maxDuration).toBe(120);
      expect(issuesMod.maxDuration).toBe(60);
      expect(pulseMod.maxDuration).toBe(300);
      expect(basicDownloadMod.maxDuration).toBe(300);
      expect(buildingUploadMod.maxDuration).toBe(60);
      expect(imUploadMod.maxDuration).toBe(60);
      expect(quickGenMod.maxDuration).toBe(120);

      const vercelJsonRaw = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');
      const vercelJson = JSON.parse(vercelJsonRaw);
      expect(vercelJson.functions['src/app/api/broker/magazine/distribute/route.ts']?.maxDuration).toBe(120);
      expect(vercelJson.functions['src/app/api/broker/buildings/[id]/photos/upload/route.ts']?.maxDuration).toBe(60);
      expect(vercelJson.functions['src/app/api/broker/im/upload-photo/route.ts']?.maxDuration).toBe(60);
      expect(vercelJson.functions['src/app/api/broker/im-lite/quick-generate/route.ts']?.maxDuration).toBe(120);
      expect(vercelJson.functions['src/app/api/magazine/issues/route.ts']?.maxDuration).toBe(60);
      expect(vercelJson.functions['src/app/api/pulse/generate/route.ts']?.maxDuration).toBe(300);
      expect(vercelJson.functions['src/app/api/broker/basic-im-studio/[id]/download/route.ts']?.maxDuration).toBe(300);
      expect(vercelJson.functions['src/app/api/broker/pptx-studio/projects/[id]/download/route.ts']?.maxDuration).toBe(300);
      expect(Array.isArray(vercelJson.crons)).toBe(true);
      expect(vercelJson.crons.length).toBeGreaterThan(0);
    });

    it('returns clear Korean 415 message on undecodable iPhone HEIC upload instead of 500', async () => {
      vi.doMock('@/lib/auth-guard', () => ({
        requireBroker: vi.fn().mockResolvedValue({
          user: { id: 'broker-owner-1' },
          role: 'broker',
          error: null,
        }),
      }));
      vi.doMock('@/lib/authz/assert-owner', () => ({
        assertBuildingOwner: vi.fn().mockResolvedValue({ ok: true }),
      }));

      vi.resetModules();
      const { POST: uploadBuildingPhotos } = await import(
        '@/app/api/broker/buildings/[id]/photos/upload/route'
      );

      // Synthetic ISO-BMFF `ftypheic` box without valid HEVC payload -> Sharp throws decode/libheif error
      const heicHeader = Buffer.alloc(32);
      heicHeader.writeUInt32BE(24, 0);
      heicHeader.write('ftyp', 4, 'ascii');
      heicHeader.write('heic', 8, 'ascii');

      const form = new FormData();
      form.append(
        'file',
        new File([new Uint8Array(heicHeader)], 'IMG_0001.HEIC', { type: 'image/heic' })
      );

      const req = new NextRequest('http://localhost/api/broker/buildings/bld_test_1/photos/upload', {
        method: 'POST',
        body: form,
      });

      const res = await uploadBuildingPhotos(req, { params: Promise.resolve({ id: 'bld_test_1' }) });
      const body = await res.json();
      expect(res.status).toBe(415);
      expect(body.message).toBe(
        '아이폰 HEIC 원본 형식은 지원되지 않습니다. 카메라 설정에서 호환성(JPG)으로 변경하거나 JPG/PNG로 업로드해주세요.'
      );
    });

    it('quick-generate offloads >32KB inline base64 photos to `building_photos` Storage bucket when !isTestEnv', async () => {
      vi.doMock('@/lib/auth-guard', () => ({
        requireBroker: vi.fn().mockResolvedValue({
          user: { id: 'broker-owner-1' },
          role: 'broker',
          error: null,
        }),
      }));
      vi.doMock('sharp', () => ({
        default: () => ({
          rotate: () => ({
            resize: () => ({
              webp: () => ({
                toBuffer: async () => Buffer.from('WEBP-COMPRESSED-BYTES'),
              }),
              jpeg: () => ({
                toBuffer: async () => Buffer.from('JPEG-COMPRESSED-BYTES'),
              }),
            }),
          }),
        }),
      }));

      vi.resetModules();
      const { POST: quickGeneratePOST } = await import(
        '@/app/api/broker/im-lite/quick-generate/route'
      );

      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', '');

      h.storageUploads = [];
      const largeBase64Payload = `data:image/jpeg;base64,${'A'.repeat(40_000)}`;
      const req = new NextRequest('http://localhost/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: '서울특별시 마포구 동교동 168-4',
          askingPriceManwon: 450000,
          rentRoll: [{ floor: '1F', unit: '101', tenantName: '카페', depositManwon: 5000, monthlyRentManwon: 350 }],
          photos: [{ url: largeBase64Payload, caption: '전면 외관' }],
        }),
      });

      const res = await quickGeneratePOST(req);
      expect([200, 201]).toContain(res.status);
      expect(h.storageUploads.length).toBe(1);
      expect(h.storageUploads[0].bucket).toBe('building_photos');
      expect(h.storageUploads[0].path).toMatch(/^broker-owner-1\/[^/]+\/[0-9a-f-]+\.webp$/i);
      expect(h.storageUploads[0].contentType).toBe('image/webp');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (e) Magazine `send-batch` Pacing & `429` Exponential Backoff Retry
  // ───────────────────────────────────────────────────────────────────────────
  describe('(e) Magazine send-batch rate-limit pacing & 429 retry', () => {
    it('paces batches with concurrency <= 4 and retries transient 429 responses cleanly', async () => {
      expect(BATCH_CONCURRENCY).toBeGreaterThanOrEqual(1);
      expect(BATCH_CONCURRENCY).toBeLessThanOrEqual(4);

      vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
      vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'false');
      vi.stubEnv('RESEND_API_KEY', 're_test_wp08_key');
      vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-unsub-secret-32-chars-minimum!!');
      vi.stubEnv('APP_BASE_URL', 'https://www.credeal.net');

      const fakeDb = new FakeDb() as any;
      let activeInFlight = 0;
      let maxObservedConcurrency = 0;
      const attemptCountByRecipient = new Map<string, number>();

      h.resendSendMock.mockImplementation(async (payload: { to: string }) => {
        const to = Array.isArray(payload.to) ? payload.to[0] : payload.to;
        activeInFlight += 1;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeInFlight);
        await new Promise((r) => setTimeout(r, 10));
        activeInFlight -= 1;

        const prev = attemptCountByRecipient.get(to) ?? 0;
        attemptCountByRecipient.set(to, prev + 1);

        // sub2: fails once with 429 -> recovered inside sendEmailProvider backoff
        if (to === 'sub2@example.com' && prev < 1) {
          return {
            data: null,
            error: { statusCode: 429, name: 'rate_limit_exceeded', message: '429 Too Many Requests: rate_limit_exceeded' },
          } as any;
        }
        // sub3: fails 3 times with 429 -> exhausts sendEmailProvider retries, then send-batch reopens ledger & succeeds on 4th attempt!
        if (to === 'sub3@example.com' && prev < 3) {
          return {
            data: null,
            error: { statusCode: 429, name: 'rate_limit_exceeded', message: '429 Too Many Requests: rate_limit_exceeded' },
          } as any;
        }

        return { data: { id: `msg-${to}-${prev + 1}` }, error: null };
      });

      const targets: PlannedTarget[] = [1, 2, 3, 4].map((n) => ({
        channel: 'email',
        sub: {
          id: `00000000-0000-4000-8000-00000000000${n}`,
          subscriber_email: `sub${n}@example.com`,
          subscriber_name: `구독자${n}`,
          channel: 'email',
          status: 'active',
          unsubscribed_at: null,
          marketing_consent_at: '2026-01-01T00:00:00Z',
          confirm_status: 'confirmed',
          night_consent: true,
        },
      }));

      const ctx: RunContext = {
        supabase: fakeDb,
        broker: {
          slug: 'gangnam-pro',
          userId: '11111111-1111-4111-8111-111111111111',
          senderName: '김대표 중개법인',
          senderContact: '02-555-1234',
        },
        kind: 'weekly',
        editionKey: 'weekly:gangnam-pro:2026-11-15',
        editionId: '22222222-2222-4222-8222-222222222222',
        baseUrl: 'https://www.credeal.net',
        edition: {
          title: '강남 주간 CRE 리포트',
          headline: '강남권 오피스 거래 회복세',
          marketTemp: '강보합',
          date: '2026-11-15',
          url: 'https://www.credeal.net/m/gangnam-pro',
        },
        kakaoTemplateId: 'TPL_MAG',
        gateDeps: {
          now: new Date('2026-11-15T02:00:00Z'), // 11:00 KST (daytime)
        },
      };

      const tally = emptyTally();
      const startedAt = Date.now();
      await runTargets(ctx, targets, tally, {
        concurrency: 2,
        paceMs: 40,
        maxRetries: 2,
        retryBaseDelayMs: 15,
      });
      const elapsedMs = Date.now() - startedAt;

      expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
      expect(elapsedMs).toBeGreaterThanOrEqual(35); // Batch pacing occurred between batch 1 and batch 2
      expect(attemptCountByRecipient.get('sub1@example.com')).toBe(1);
      expect(attemptCountByRecipient.get('sub2@example.com')).toBe(2);
      expect(attemptCountByRecipient.get('sub3@example.com')).toBe(4);
      expect(attemptCountByRecipient.get('sub4@example.com')).toBe(1);
      expect(tally.sent).toBe(4);
      expect(tally.failed).toBe(0);
    });
  });
});
