import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { readBuilding } from '@/domain/building/im-core/read-building';
import { createServiceClient } from '@/lib/supabase/service';
import { loadOgFonts } from '@/lib/magazine/og-fonts';
import {
  computeCard4Hash,
  resolveCard4AreaLabel,
  type Card4Data,
} from '@/lib/deal-card/card4-schema';
import { formatPriceRange, parseLegacyBand } from '@/lib/deal-card/price-band';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import {
  getInboxState,
  getQuickImRecord,
  isDealCardDeleted,
  isUuid,
  updateQuickImCard4,
} from '@/lib/im-lite/quick-generate-store';
import { isBuildingShareLinkRevoked } from '@/lib/security/share-link-tokens';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('og-kakao-v2');

export const runtime = 'nodejs';

function extractRegion(address?: string | null): string {
  if (!address || typeof address !== 'string') return '서울시';
  const match = address.match(/([가-힣]+(?:구|군|시))\s+([가-힣0-9]+(?:동|읍|면|가))/);
  if (match) return `${match[1]} ${match[2]}`;
  const guMatch = address.match(/([가-힣]+(?:구|군|시))/);
  return guMatch ? guMatch[1] : '서울시';
}

function extractUse(building: Record<string, any>): string {
  const purpose = building.asset_type || building.main_purpose || building.usage;
  if (!purpose || typeof purpose !== 'string') return '근린생활시설';
  if (purpose.includes('근린') || purpose.includes('근생')) return '근린생활시설';
  if (purpose.includes('업무') || purpose.includes('오피스')) return '업무시설';
  if (purpose.includes('주거') || purpose.includes('주택')) return '주거복합';
  if (purpose.includes('숙박') || purpose.includes('호텔')) return '숙박시설';
  return purpose;
}

function extractPriceBand(building: Record<string, any>): string {
  if (building.asking_price_krw && typeof building.asking_price_krw === 'number') {
    return formatPriceRange(building.asking_price_krw);
  }
  if (building.price_band && typeof building.price_band === 'string') {
    return parseLegacyBand(building.price_band).label;
  }
  return '가격 협의';
}

const DEMO_OG_BUILDINGS: Record<string, Record<string, any>> = {
  'bld-01': {
    id: 'bld-01',
    address: '서울특별시 영등포구 당산동1가 72-1',
    area_signal: '영등포구 당산동',
    asset_type: '업무·근린생활시설',
    price_band: '110~120억',
    asking_price_krw: 115 * 1_0000_0000,
    total_floor_area_pyung: 499,
    road_contact: 'WIDE_ONE',
    completion_year: 2019,
  },
  'bld-02': {
    id: 'bld-02',
    address: '서울특별시 강남구 신사동 540-1',
    area_signal: '강남구 신사동',
    asset_type: '업무·근린생활시설',
    price_band: '140~160억',
    asking_price_krw: 150 * 1_0000_0000,
    total_floor_area_pyung: 520,
    road_contact: 'WIDE_ONE',
    completion_year: 2020,
  },
  'bld-03': {
    id: 'bld-03',
    address: '서울특별시 마포구 연남동 220-1',
    area_signal: '마포구 연남동',
    asset_type: '상가주택',
    price_band: '60~70억',
    asking_price_krw: 65 * 1_0000_0000,
    total_floor_area_pyung: 180,
    road_contact: 'CORNER',
    completion_year: 2018,
  },
  'f1111111-1111-1111-1111-111111111111': {
    id: 'f1111111-1111-1111-1111-111111111111',
    address: '서울특별시 강남구 역삼동 823-1',
    area_signal: '강남구 역삼동',
    asset_type: '업무시설',
    price_band: '180~200억',
    asking_price_krw: 185 * 1_0000_0000,
    total_floor_area_pyung: 850,
    road_contact: 'WIDE_ONE',
    completion_year: 2021,
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return new Response('Missing Deal ID', { status: 400 });
  }

  if (
    isDealCardDeleted(id) ||
    getInboxState().revokedBuildings[id]?.revoked ||
    isBuildingShareLinkRevoked(id)
  ) {
    return new Response('Building Not Found', { status: 404 });
  }

  const quickRec = getQuickImRecord(id);
  if (quickRec?.isRevoked) {
    return new Response('Building Not Found', { status: 404 });
  }

  // Pure read: zero DB mutations
  let building: Record<string, any> | null = null;
  let bodyCard4: Card4Data | undefined = quickRec?.card4;

  if (!isUuid(id)) {
    building = (await readBuilding(id)) || DEMO_OG_BUILDINGS[id] || null;
    if (building?.status === 'archived') {
      return new Response('Building Not Found', { status: 404 });
    }
    if (!bodyCard4 || !quickRec?.ownerId) {
      try {
        const supabase = createServiceClient();
        let actQuery: any = supabase
          .from('activity_events')
          .select('actor_id, event_type, metadata, created_at');
        if (typeof actQuery.in === 'function') {
          actQuery = actQuery.in('event_type', [
            'dealcard_upserted',
            'dealcard_restored',
            'dealcard_deleted',
            'link_revoked',
            'link_restored',
          ]);
        }
        if (typeof actQuery.order === 'function') {
          actQuery = actQuery.order('created_at', { ascending: false });
        }
        if (typeof actQuery.limit === 'function') {
          actQuery = actQuery.limit(50);
        }
        const { data: acts } = await actQuery;
        const forBuilding = (acts || []).filter(
          (a: any) => String(a?.metadata?.building_id || '').trim() === id
        );
        const latestLifecycle = forBuilding.find((a: any) =>
          [
            'dealcard_deleted',
            'dealcard_restored',
            'dealcard_upserted',
            'link_revoked',
            'link_restored',
          ].includes(String(a?.event_type || ''))
        );
        if (
          latestLifecycle?.event_type === 'dealcard_deleted' ||
          latestLifecycle?.event_type === 'link_revoked'
        ) {
          return new Response('Building Not Found', { status: 404 });
        }
        const matched = forBuilding.find((a: any) => a?.metadata?.card4);
        if (matched?.metadata?.card4) {
          const actCard4 = matched.metadata.card4 as Card4Data;
          const actVer = typeof actCard4.card4_version === 'number' ? actCard4.card4_version : 0;
          const memVer = typeof bodyCard4?.card4_version === 'number' ? bodyCard4.card4_version : 0;
          if (!bodyCard4 || !quickRec?.ownerId || actVer >= memVer) {
            bodyCard4 = actCard4;
            updateQuickImCard4(id, bodyCard4, {
              ownerId: matched.actor_id,
              brokerProfile: matched.metadata.broker_profile,
            });
          }
        }
      } catch {
        // ignore if activity_events unavailable
      }
    }
    if (!building && !quickRec && !bodyCard4) {
      return new Response('Building Not Found', { status: 404 });
    }
  } else {
    const supabase = createServiceClient();

    // Check building_ssot_lite status (.neq('status', 'archived')) when supported by client
    let ssotQuery: any = supabase
      .from('building_ssot_lite')
      .select('id, status')
      .eq('id', id);
    if (typeof ssotQuery.maybeSingle === 'function') {
      const { data: ssotRow } = await ssotQuery.maybeSingle();
      if (ssotRow?.status === 'archived') {
        return new Response('Building Not Found', { status: 404 });
      }
    }
    if (typeof ssotQuery.neq === 'function') {
      ssotQuery = ssotQuery.neq('status', 'archived');
    }

    building = (await readBuilding(id)) || DEMO_OG_BUILDINGS[id] || null;
    if (building?.status === 'archived') {
      return new Response('Building Not Found', { status: 404 });
    }

    // Fetch Card4 from blind_teaser document if already created
    let teaserQuery: any = supabase
      .from('document_objects')
      .select('body')
      .eq('building_id', id)
      .eq('document_type', 'blind_teaser');
    if (typeof teaserQuery.neq === 'function') {
      teaserQuery = teaserQuery.neq('status', 'archived');
    }
    const { data: teaserDoc } = await teaserQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const teaserBody = (teaserDoc?.body as Record<string, any>) || undefined;
    if (teaserBody?.is_revoked === true) {
      return new Response('Building Not Found', { status: 404 });
    }

    const dbCard4 = teaserBody?.card4 as Card4Data | undefined;
    if (dbCard4) {
      const dbVer = typeof dbCard4.card4_version === 'number' ? dbCard4.card4_version : 0;
      const memVer = typeof bodyCard4?.card4_version === 'number' ? bodyCard4.card4_version : 0;
      if (!bodyCard4 || dbVer >= memVer) {
        bodyCard4 = dbCard4;
      }
    }

    if (!bodyCard4) {
      try {
        let actQuery: any = supabase
          .from('activity_events')
          .select('actor_id, event_type, metadata, created_at');
        if (typeof actQuery.in === 'function') {
          actQuery = actQuery.in('event_type', [
            'dealcard_upserted',
            'dealcard_restored',
            'dealcard_deleted',
            'link_revoked',
            'link_restored',
          ]);
        }
        if (typeof actQuery.order === 'function') {
          actQuery = actQuery.order('created_at', { ascending: false });
        }
        if (typeof actQuery.limit === 'function') {
          actQuery = actQuery.limit(50);
        }
        const { data: acts } = await actQuery;
        const forBuilding = (acts || []).filter(
          (a: any) => String(a?.metadata?.building_id || '').trim() === id
        );
        const latestLifecycle = forBuilding.find((a: any) =>
          [
            'dealcard_deleted',
            'dealcard_restored',
            'dealcard_upserted',
            'link_revoked',
            'link_restored',
          ].includes(String(a?.event_type || ''))
        );
        if (
          latestLifecycle?.event_type === 'dealcard_deleted' ||
          latestLifecycle?.event_type === 'link_revoked'
        ) {
          return new Response('Building Not Found', { status: 404 });
        }
        const matched = forBuilding.find((a: any) => a?.metadata?.card4);
        if (matched?.metadata?.card4) {
          bodyCard4 = matched.metadata.card4 as Card4Data;
          updateQuickImCard4(id, bodyCard4, {
            ownerId: matched.actor_id,
            brokerProfile: matched.metadata.broker_profile,
          });
        }
      } catch {
        // ignore if activity_events unavailable
      }
    }

    if (!building && !bodyCard4) {
      return new Response('Building Not Found', { status: 404 });
    }
  }

  const safeBuilding = building || {};

  let region: string;
  let use: string;
  let priceBand: string;
  let points: [string, string, string];
  let card4Hash: string;

  if (bodyCard4?.region && bodyCard4?.use && bodyCard4?.priceBand && bodyCard4?.points) {
    region = bodyCard4.region;
    use = bodyCard4.use;
    priceBand = bodyCard4.priceBand;
    points = cleanBlindPoints(bodyCard4.points) as [string, string, string];
    card4Hash =
      bodyCard4.card4_hash ||
      computeCard4Hash({
        region,
        use,
        priceBand,
        points,
        area: bodyCard4.area,
        headline: bodyCard4.headline,
      });
  } else {
    region = safeBuilding.area_signal || extractRegion(safeBuilding.address || safeBuilding.road_address);
    use = extractUse(safeBuilding);
    priceBand = extractPriceBand(safeBuilding);

    // Default points from building facts
    const rawPoints = [
      safeBuilding.road_contact ? '대로변 위치 접근성 우수' : '역세권 상권 중심지',
      safeBuilding.total_floor_area_pyung
        ? `연면적 약 ${Math.round(safeBuilding.total_floor_area_pyung)}평 규모`
        : '수익형 근생 알짜 매물',
      safeBuilding.completion_year
        ? `${safeBuilding.completion_year}년 준공 관리 상태 양호`
        : '안정적 임차 수요 확보',
    ];
    points = cleanBlindPoints(rawPoints) as [string, string, string];
    card4Hash = computeCard4Hash({ region, use, priceBand, points });
  }

  const fallbackGfaPyung =
    typeof safeBuilding.total_floor_area_pyung === 'number'
      ? safeBuilding.total_floor_area_pyung
      : typeof safeBuilding.gross_floor_area_sqm === 'number'
      ? Math.round(safeBuilding.gross_floor_area_sqm / 3.3058)
      : undefined;
  const fallbackLandPyung =
    typeof safeBuilding.land_area_pyung === 'number'
      ? safeBuilding.land_area_pyung
      : typeof safeBuilding.land_area_sqm === 'number'
      ? Math.round(safeBuilding.land_area_sqm / 3.3058)
      : undefined;

  const areaLabel = resolveCard4AreaLabel(
    bodyCard4 || {
      posture:
        safeBuilding.investment_posture === 'development' ||
        safeBuilding.investment_posture === 'value_add'
          ? 'value_add'
          : safeBuilding.investment_posture === 'owner_occupied'
          ? 'owner_occupied'
          : 'income',
    },
    {
      gfaPyung: fallbackGfaPyung,
      landAreaPyung: fallbackLandPyung,
    }
  );

  // WP-P1-07: OG v2 cache versioning check (?v=card4_hash)
  const url = new URL(request.url);
  const versionParam = url.searchParams.get('v');

  // If ?v is missing or mismatched, 302 redirect to current version
  if (!versionParam || versionParam !== card4Hash) {
    const redirectUrl = new URL(request.url);
    redirectUrl.searchParams.set('v', card4Hash);
    return NextResponse.redirect(redirectUrl.toString(), 302);
  }

  // Load local bundled font (zero remote CDN fetch during render)
  const fontData = await loadOgFonts();
  const ogFonts = fontData.fonts.map((f) => ({
    name: f.name,
    data: f.data,
    weight: f.weight,
    style: f.style,
  }));

  const displayRegion = cleanBlindPoints([region])[0] || '—';
  const displayUse = cleanBlindPoints([use])[0] || '—';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0F172A',
          backgroundImage: 'radial-gradient(circle at 20% 20%, #1E293B 0%, #0F172A 100%)',
          color: '#FFFFFF',
          fontFamily: '"Noto Sans KR", sans-serif',
        }}
      >
        {/* Top Row: Q1 (권역) | Q2 (용도) */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            width: '100%',
            borderBottom: '3px solid rgba(148, 163, 184, 0.28)',
          }}
        >
          {/* Quadrant 1: 권역 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 36px',
              borderRight: '3px solid rgba(148, 163, 184, 0.28)',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: '64px',
                fontWeight: 800,
                color: '#F8FAFC',
                lineHeight: 1.15,
                wordBreak: 'keep-all',
                letterSpacing: '-0.02em',
              }}
            >
              {displayRegion}
            </span>
          </div>

          {/* Quadrant 2: 용도 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 36px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: '64px',
                fontWeight: 800,
                color: '#38BDF8',
                lineHeight: 1.15,
                wordBreak: 'keep-all',
                letterSpacing: '-0.02em',
              }}
            >
              {displayUse}
            </span>
          </div>
        </div>

        {/* Bottom Row: Q3 (면적: 연면적/토지면적) | Q4 (금액구간) */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            width: '100%',
          }}
        >
          {/* Quadrant 3: 면적 (포스처별 연면적 or 토지면적) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 36px',
              borderRight: '3px solid rgba(148, 163, 184, 0.28)',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: '64px',
                fontWeight: 800,
                color: '#E2E8F0',
                lineHeight: 1.15,
                wordBreak: 'keep-all',
                letterSpacing: '-0.02em',
              }}
            >
              {areaLabel || '—'}
            </span>
          </div>

          {/* Quadrant 4: 금액구간 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 36px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: '68px',
                fontWeight: 800,
                color: '#FBBF24',
                lineHeight: 1.15,
                wordBreak: 'keep-all',
                letterSpacing: '-0.02em',
              }}
            >
              {priceBand || '—'}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: ogFonts.length > 0 ? ogFonts : undefined,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
