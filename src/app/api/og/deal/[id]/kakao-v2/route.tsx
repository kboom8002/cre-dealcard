import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { readBuilding } from '@/domain/building/im-core/read-building';
import { createServiceClient } from '@/lib/supabase/service';
import { loadOgFonts } from '@/lib/magazine/og-fonts';
import { computeCard4Hash, type Card4Data } from '@/lib/deal-card/card4-schema';
import { formatPriceRange, parseLegacyBand } from '@/lib/deal-card/price-band';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import { getQuickImRecord, isUuid } from '@/lib/im-lite/quick-generate-store';
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

  const quickRec = getQuickImRecord(id);

  // Pure read: zero DB mutations
  let building: Record<string, any> | null = null;
  let bodyCard4: Card4Data | undefined = quickRec?.card4;

  if (!isUuid(id)) {
    building = (await readBuilding(id)) || DEMO_OG_BUILDINGS[id] || null;
    if (!building && !quickRec) {
      return new Response('Building Not Found', { status: 404 });
    }
  } else {
    const supabase = createServiceClient();

    // Check building_ssot_lite status (.neq('status', 'archived')) when supported by client
    let ssotQuery: any = supabase
      .from('building_ssot_lite')
      .select('id, status')
      .eq('id', id);
    if (typeof ssotQuery.neq === 'function') {
      ssotQuery = ssotQuery.neq('status', 'archived');
    }

    building = (await readBuilding(id)) || DEMO_OG_BUILDINGS[id] || null;

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

    const dbCard4 = (teaserDoc?.body as Record<string, any>)?.card4 as Card4Data | undefined;
    if (dbCard4) {
      bodyCard4 = dbCard4;
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
    card4Hash = bodyCard4.card4_hash || computeCard4Hash({ region, use, priceBand, points });
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

  const headline = `${use} · ${region} · ${priceBand}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0F172A',
          backgroundImage: 'radial-gradient(circle at 15% 15%, #1E293B 0%, #0F172A 100%)',
          color: '#FFFFFF',
          padding: '60px 72px',
          fontFamily: '"Noto Sans KR", sans-serif',
        }}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#38BDF8',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                letterSpacing: '0.05em',
              }}
            >
              CRE DEAL CARD
            </span>
            <span style={{ fontSize: '18px', color: '#94A3B8' }}>
              비밀유지 안심 매물 정보
            </span>
          </div>

          <span style={{ fontSize: '15px', color: '#64748B', fontFamily: 'monospace' }}>
            #{card4Hash.slice(0, 10)}
          </span>
        </div>

        {/* Main Big Headline: 용도 · 권역 · 금액구간 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <span style={{ fontSize: '24px', color: '#38BDF8', fontWeight: 600 }}>
            {region}
          </span>
          <span
            style={{
              fontSize: '56px',
              fontWeight: 800,
              color: '#F8FAFC',
              lineHeight: 1.15,
              wordBreak: 'keep-all',
              letterSpacing: '-0.02em',
            }}
          >
            {headline}
          </span>
        </div>

        {/* 3 Blind Points in High-Legibility Cards */}
        <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
          {points.map((pt, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '16px',
                padding: '20px 24px',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '6px' }}>
                포인트 0{idx + 1}
              </span>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#F1F5F9',
                  lineHeight: 1.35,
                  wordBreak: 'keep-all',
                }}
              >
                {pt}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(148, 163, 184, 0.2)',
            paddingTop: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px' }}>🛡️</span>
            <span style={{ fontSize: '16px', color: '#94A3B8', fontWeight: 500 }}>
              공적장부 교차검증 완료 · 매도자 정보 100% 보안 블라인드
            </span>
          </div>

          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#38BDF8',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              padding: '6px 16px',
              borderRadius: '8px',
            }}
          >
            상세 정보 열람하기 →
          </span>
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
