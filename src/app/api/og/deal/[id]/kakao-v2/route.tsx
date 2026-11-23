import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { readBuilding } from '@/domain/building/im-core/read-building';
import { m2ToPyeong } from '@/domain/building/im-core/facts/area';
import { createServiceClient } from '@/lib/supabase/service';
import { loadOgFonts } from '@/lib/magazine/og-fonts';
import {
  computeCard4Hash,
  resolveCard4AreaLabel,
  type Card4Data,
} from '@/lib/deal-card/card4-schema';
import { formatPriceRange, parseLegacyBand } from '@/lib/deal-card/price-band';
import { collectSensitiveNeedles, maskNeedles } from '@/domain/public-projection/deal-card';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import { resolveOgDealGuard } from '@/lib/og/deal-public-guard';
import {
  isBuildingStatusPublic,
  isSignalCardStatusPublic,
  PUBLIC_IM_DOC_STATUSES,
} from '@/domain/public-projection/visibility';

const PUBLIC_OG_DOC_STATUSES = new Set<string>(['published', ...PUBLIC_IM_DOC_STATUSES]);

export const runtime = 'nodejs';

const QUADRANT_TEXT_BASE_STYLE = {
  fontSize: '64px',
  fontWeight: 800,
  lineHeight: 1.15,
  wordBreak: 'keep-all' as const,
  letterSpacing: '-0.02em',
};

function getQuadrantFontSize(text: string, defaultSize: 64 | 68 = 64): string {
  const len = text.trim().length;
  if (len > 10) return '52px';
  if (len > 7) return '58px';
  return `${defaultSize}px`;
}

function extractRegion(address?: string | null): string {
  if (!address || typeof address !== 'string') return '서울시';
  const match = address.match(/([가-힣]+(?:구|군|시))\s+([가-힣0-9]+(?:동|읍|면|가))/);
  if (match) return `${match[1]} ${match[2]}`;
  const guMatch = address.match(/([가-힣]+(?:구|군|시))/);
  return guMatch ? guMatch[1] : '서울시';
}

type OgBuildingRecord = Record<string, unknown>;

interface OgQueryChain<T = OgBuildingRecord> extends PromiseLike<{ data: T[] | null }> {
  in?: (col: string, vals: string[]) => OgQueryChain<T>;
  contains?: (col: string, val: Record<string, unknown>) => OgQueryChain<T>;
  order?: (col: string, opts: { ascending: boolean }) => OgQueryChain<T>;
  limit?: (n: number) => OgQueryChain<T>;
  neq?: (col: string, val: string) => OgQueryChain<T>;
  maybeSingle?: () => Promise<{ data: T | null }>;
}

function extractUse(building: OgBuildingRecord): string {
  const purpose = building.asset_type || building.main_purpose || building.usage;
  if (!purpose || typeof purpose !== 'string') return '근린생활시설';
  if (purpose.includes('근린') || purpose.includes('근생')) return '근린생활시설';
  if (purpose.includes('업무') || purpose.includes('오피스')) return '업무시설';
  if (purpose.includes('주거') || purpose.includes('주택')) return '주거복합';
  if (purpose.includes('숙박') || purpose.includes('호텔')) return '숙박시설';
  return purpose;
}

function extractPriceBand(building: OgBuildingRecord): string {
  if (building.asking_price_krw && typeof building.asking_price_krw === 'number') {
    return formatPriceRange(building.asking_price_krw);
  }
  if (building.price_band && typeof building.price_band === 'string') {
    return parseLegacyBand(building.price_band).label;
  }
  return '가격 협의';
}

function resolveSentActivityCard4(forBuilding: OgBuildingRecord[]): {
  blocked: boolean;
  isSent: boolean;
  card4: Card4Data | undefined;
} {
  const verified = forBuilding.filter((a) => {
    const evType = String(a?.event_type || '');
    if (
      ['dealcard_upserted', 'dealcard_sent', 'dealcard_restored', 'dealcard_deleted'].includes(
        evType
      )
    ) {
      return Boolean(a?.actor_id);
    }
    return true;
  });
  if (verified.length === 0) {
    return { blocked: false, isSent: false, card4: undefined };
  }
  const latestRevoke = verified.find((a) =>
    ['link_revoked', 'link_restored'].includes(String(a?.event_type || ''))
  );
  if (latestRevoke?.event_type === 'link_revoked') {
    return { blocked: true, isSent: false, card4: undefined };
  }
  const latestTransitionIdx = verified.findIndex((a) =>
    ['dealcard_deleted', 'dealcard_restored', 'dealcard_sent'].includes(String(a?.event_type || ''))
  );
  if (latestTransitionIdx < 0) {
    return { blocked: true, isSent: false, card4: undefined };
  }
  const latestTransition = verified[latestTransitionIdx];
  if (latestTransition?.event_type !== 'dealcard_sent') {
    return { blocked: true, isSent: false, card4: undefined };
  }
  const sentMeta = (latestTransition?.metadata as Record<string, unknown> | undefined) || {};
  if (sentMeta.card4 && typeof sentMeta.card4 === 'object') {
    return { blocked: false, isSent: true, card4: sentMeta.card4 as Card4Data };
  }
  const priorSource = verified.slice(latestTransitionIdx).find((a) => {
    const meta = (a?.metadata as Record<string, unknown> | undefined) || {};
    return Boolean(meta.card4) && meta.has_unpublished_edits !== true;
  });
  const fallbackCard4 = (priorSource?.metadata as Record<string, unknown> | undefined)?.card4;
  return {
    blocked: false,
    isSent: true,
    card4: fallbackCard4 ? (fallbackCard4 as Card4Data) : undefined,
  };
}

const DEMO_OG_BUILDINGS: Record<string, OgBuildingRecord> = {
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return new Response('Missing Deal ID', { status: 400 });
  }

  const supabase = createServiceClient();
  const ogGuard = await resolveOgDealGuard(id, supabase);
  if (ogGuard.blocked) {
    return new Response('Building Not Found', { status: 404 });
  }

  const quickRec = ogGuard.quickRec;

  // Pure read: zero DB mutations
  let building: OgBuildingRecord | null = null;
  let bodyCard4: Card4Data | undefined =
    (ogGuard.snapshotCard4 as Card4Data | undefined) || quickRec?.card4;

  if (!isUuid(id)) {
    let hasNonUuidSentEvent = false;
    building = (await readBuilding(id) as OgBuildingRecord | null) || (ogGuard.demoAllowed ? DEMO_OG_BUILDINGS[id] : null) || null;
    if (building && !isBuildingStatusPublic(building.status as string | null | undefined)) {
      return new Response('Building Not Found', { status: 404 });
    }
    if (!ogGuard.snapshotCard4) {
      try {
        let actQuery = supabase
          .from('activity_events')
          .select('actor_id, event_type, metadata, created_at') as unknown as OgQueryChain;
        if (typeof actQuery.in === 'function') {
          actQuery = actQuery.in('event_type', [
            'dealcard_upserted',
            'dealcard_sent',
            'dealcard_restored',
            'dealcard_deleted',
            'link_revoked',
            'link_restored',
          ]);
        }
        if (typeof actQuery.contains === 'function') {
          actQuery = actQuery.contains('metadata', { building_id: id });
        }
        if (typeof actQuery.order === 'function') {
          actQuery = actQuery.order('created_at', { ascending: false });
        }
        if (typeof actQuery.limit === 'function') {
          actQuery = actQuery.limit(50);
        }
        const { data: acts } = await actQuery;
        const forBuilding = (acts || []).filter(
          (a) => String((a?.metadata as Record<string, unknown> | undefined)?.building_id || '').trim() === id
        );
        const actResolved = resolveSentActivityCard4(forBuilding);
        if (actResolved.blocked) {
          return new Response('Building Not Found', { status: 404 });
        }
        hasNonUuidSentEvent = actResolved.isSent;
        if (actResolved.card4) {
          const actCard4 = actResolved.card4;
          const actVer = typeof actCard4.card4_version === 'number' ? actCard4.card4_version : 0;
          const memVer = typeof bodyCard4?.card4_version === 'number' ? bodyCard4.card4_version : 0;
          if (!bodyCard4 || !quickRec?.ownerId || actVer >= memVer) {
            bodyCard4 = actCard4;
          }
        }
      } catch {
        // ignore if activity_events unavailable
      }
    }
    if (
      String(building?.status || '') === 'draft' &&
      !ogGuard.snapshotCard4 &&
      !quickRec &&
      !hasNonUuidSentEvent
    ) {
      return new Response('Building Not Found', { status: 404 });
    }
    if (!building && !quickRec && !bodyCard4) {
      return new Response('Building Not Found', { status: 404 });
    }
  } else {
    let ssotStatus: string | null = null;
    let signalCardStatus: string | null = null;
    let hasVerifiedSentEvent = false;
    // Check building_ssot_lite status (.neq('status', 'archived')) when supported by client
    let ssotQuery = supabase
      .from('building_ssot_lite')
      .select('id, status')
      .eq('id', id) as unknown as OgQueryChain;
    if (typeof ssotQuery.maybeSingle === 'function') {
      const { data: ssotRow } = await ssotQuery.maybeSingle();
      ssotStatus = ssotRow?.status ? String(ssotRow.status) : null;
      if (ssotRow && !isBuildingStatusPublic(ssotRow.status as string | null | undefined)) {
        return new Response('Building Not Found', { status: 404 });
      }
    }

    // Pre-cutover signal card visibility/archive guard
    try {
      let sigQuery = supabase
        .from('building_signal_cards')
        .select('status, visibility')
        .eq('building_id', id) as unknown as OgQueryChain;
      if (typeof sigQuery?.order === 'function') {
        sigQuery = sigQuery.order('created_at', { ascending: false });
      }
      if (typeof sigQuery?.limit === 'function') {
        sigQuery = sigQuery.limit(1);
      }
      if (typeof sigQuery?.maybeSingle === 'function') {
        const { data: sigRow } = await sigQuery.maybeSingle();
        signalCardStatus = sigRow?.status ? String(sigRow.status) : null;
        if (sigRow?.visibility === 'internal_only' || sigRow?.status === 'archived') {
          return new Response('Building Not Found', { status: 404 });
        }
      }
    } catch {
      // Ignore on minimal mock clients without single-eq order/limit chain
    }

    building = (await readBuilding(id) as OgBuildingRecord | null) || (ogGuard.demoAllowed ? DEMO_OG_BUILDINGS[id] : null) || null;
    if (building && !isBuildingStatusPublic(building.status as string | null | undefined)) {
      return new Response('Building Not Found', { status: 404 });
    }

    // Fetch Card4 from published blind_teaser document if already created
    let teaserQuery = supabase
      .from('document_objects')
      .select('body, status, visibility')
      .eq('building_id', id)
      .eq('document_type', 'blind_teaser') as unknown as OgQueryChain;
    if (typeof teaserQuery.neq === 'function') {
      teaserQuery = teaserQuery.neq('status', 'archived');
    }
    const orderedTeaser = teaserQuery.order ? teaserQuery.order('created_at', { ascending: false }) : teaserQuery;
    const limitedTeaser = orderedTeaser.limit ? orderedTeaser.limit(1) : orderedTeaser;
    const { data: teaserDoc } = limitedTeaser.maybeSingle ? await limitedTeaser.maybeSingle() : { data: null };

    if (teaserDoc?.status === 'archived') {
      return new Response('Building Not Found', { status: 404 });
    }

    const teaserBody = (teaserDoc?.body as Record<string, unknown> | undefined) || undefined;
    if (teaserBody?.is_revoked === true) {
      return new Response('Building Not Found', { status: 404 });
    }

    const isTeaserDocPublic =
      Boolean(teaserDoc) &&
      teaserDoc?.visibility !== 'internal_only' &&
      PUBLIC_OG_DOC_STATUSES.has(String(teaserDoc?.status || ''));

    if (teaserDoc && !isTeaserDocPublic && !ogGuard.snapshotCard4 && !quickRec) {
      return new Response('Building Not Found', { status: 404 });
    }

    // Never allow a draft document_objects row to overwrite published ogGuard.snapshotCard4
    const dbCard4 = isTeaserDocPublic ? (teaserBody?.card4 as Card4Data | undefined) : undefined;
    if (!ogGuard.snapshotCard4 && dbCard4) {
      const dbVer = typeof dbCard4.card4_version === 'number' ? dbCard4.card4_version : 0;
      const memVer = typeof bodyCard4?.card4_version === 'number' ? bodyCard4.card4_version : 0;
      if (!bodyCard4 || dbVer >= memVer) {
        bodyCard4 = dbCard4;
      }
    }

    if (!ogGuard.snapshotCard4 && !bodyCard4) {
      try {
        let actQuery = supabase
          .from('activity_events')
          .select('actor_id, event_type, metadata, created_at') as unknown as OgQueryChain;
        if (typeof actQuery.in === 'function') {
          actQuery = actQuery.in('event_type', [
            'dealcard_upserted',
            'dealcard_sent',
            'dealcard_restored',
            'dealcard_deleted',
            'link_revoked',
            'link_restored',
          ]);
        }
        if (typeof actQuery.contains === 'function') {
          actQuery = actQuery.contains('metadata', { building_id: id });
        }
        if (typeof actQuery.order === 'function') {
          actQuery = actQuery.order('created_at', { ascending: false });
        }
        if (typeof actQuery.limit === 'function') {
          actQuery = actQuery.limit(50);
        }
        const { data: acts } = await actQuery;
        const forBuilding = (acts || []).filter(
          (a) => String((a?.metadata as Record<string, unknown> | undefined)?.building_id || '').trim() === id
        );
        const actResolved = resolveSentActivityCard4(forBuilding);
        if (actResolved.blocked) {
          return new Response('Building Not Found', { status: 404 });
        }
        hasVerifiedSentEvent = actResolved.isSent;
        if (actResolved.card4) {
          bodyCard4 = actResolved.card4;
        }
      } catch {
        // ignore if activity_events unavailable
      }
    }

    if (
      String(ssotStatus || building?.status || '') === 'draft' &&
      !ogGuard.snapshotCard4 &&
      !quickRec &&
      !isTeaserDocPublic &&
      !isSignalCardStatusPublic(signalCardStatus) &&
      !hasVerifiedSentEvent
    ) {
      return new Response('Building Not Found', { status: 404 });
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
        posture: bodyCard4.posture,
        region,
        use,
        priceBand,
        points,
        area: bodyCard4.area,
        headline: bodyCard4.headline,
      });
  } else {
    region = String(safeBuilding.area_signal || extractRegion(String(safeBuilding.address || safeBuilding.road_address || '')));
    use = extractUse(safeBuilding);
    priceBand = extractPriceBand(safeBuilding);

    // Default points from building facts
    const rawPoints = [
      safeBuilding.road_contact ? '대로변 위치 접근성 우수' : '역세권 상권 중심지',
      typeof safeBuilding.total_floor_area_pyung === 'number' && safeBuilding.total_floor_area_pyung > 0
        ? `연면적 약 ${Math.round(safeBuilding.total_floor_area_pyung)}평 규모`
        : '수익형 근생 알짜 매물',
      safeBuilding.completion_year
        ? `${String(safeBuilding.completion_year)}년 준공 관리 상태 양호`
        : '안정적 임차 수요 확보',
    ];
    points = cleanBlindPoints(rawPoints) as [string, string, string];
    const explicitFallbackPosture =
      safeBuilding.investment_posture === 'development' ||
      safeBuilding.investment_posture === 'value_add'
        ? 'value_add'
        : safeBuilding.investment_posture === 'owner_occupied'
        ? 'owner_occupied'
        : safeBuilding.investment_posture
        ? 'income'
        : undefined;
    card4Hash = computeCard4Hash({
      ...(explicitFallbackPosture ? { posture: explicitFallbackPosture } : {}),
      region,
      use,
      priceBand,
      points,
    });
  }

  const fallbackGfaPyung =
    typeof safeBuilding.total_floor_area_pyung === 'number'
      ? safeBuilding.total_floor_area_pyung
      : typeof safeBuilding.gross_floor_area_sqm === 'number'
      ? Math.round(m2ToPyeong(safeBuilding.gross_floor_area_sqm))
      : undefined;
  const fallbackLandPyung =
    typeof safeBuilding.land_area_pyung === 'number'
      ? safeBuilding.land_area_pyung
      : typeof safeBuilding.land_area_sqm === 'number'
      ? Math.round(m2ToPyeong(safeBuilding.land_area_sqm))
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

  // WP-14 & DealCard P1-4: Zero-redirect 200 ImageResponse with short 5-minute CDN TTL so revoked/deleted cards expire promptly
  const cacheControl = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

  // Load local bundled font (zero remote CDN fetch during render)
  const fontData = await loadOgFonts();
  const ogFonts = fontData.fonts.map((f) => ({
    name: f.name,
    data: f.data,
    weight: f.weight,
    style: f.style,
  }));
  const safeText = (text: string, fallback = '-') => {
    if (!fontData.glyphs) return text || fallback;
    let out = '';
    for (const ch of text) {
      if (/\s/.test(ch) || fontData.glyphs.has(ch.codePointAt(0)!)) out += ch;
    }
    return out.replace(/\s+/g, ' ').trim() || fallback;
  };

  const needles = collectSensitiveNeedles(safeBuilding);
  const sanitizeV2Text = (text: string, fallback = '-'): string => {
    const masked = maskNeedles(String(text || ''), needles);
    return safeText(cleanBlindPoints([masked])[0] || fallback, fallback);
  };

  const displayRegion = sanitizeV2Text(region, '-');
  const displayUse = sanitizeV2Text(use, '-');
  const displayArea = sanitizeV2Text(areaLabel, '-');
  const displayPriceBand = sanitizeV2Text(priceBand, '-');

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
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                ...QUADRANT_TEXT_BASE_STYLE,
                fontSize: getQuadrantFontSize(displayRegion, 64),
                color: '#F8FAFC',
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
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                ...QUADRANT_TEXT_BASE_STYLE,
                fontSize: getQuadrantFontSize(displayUse, 64),
                color: '#38BDF8',
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
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                ...QUADRANT_TEXT_BASE_STYLE,
                fontSize: getQuadrantFontSize(displayArea, 64),
                color: '#E2E8F0',
              }}
            >
              {displayArea}
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
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                ...QUADRANT_TEXT_BASE_STYLE,
                fontSize: getQuadrantFontSize(displayPriceBand, 68),
                color: '#FBBF24',
              }}
            >
              {displayPriceBand}
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
        'Cache-Control': cacheControl,
        'X-Card4-Hash': card4Hash,
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
