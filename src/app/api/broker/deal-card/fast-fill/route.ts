import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { readBuilding } from '@/domain/building/im-core/read-building';
import { formatPriceRange, parseLegacyBand } from '@/lib/deal-card/price-band';
import { cleanBlindPoints, validateBlindPoints } from '@/lib/deal-card/blind-guard';
import {
  computeCard4Hash,
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardPosture,
} from '@/lib/deal-card/card4-schema';
import { deriveDealCardHeadline, repairDealCardLine } from '@/lib/deal-card/copy-limits';
import { isUuid, getQuickImRecord } from '@/lib/im-lite/quick-generate-store';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('deal-card-fast-fill');

const FastFillInputSchema = z.object({
  buildingId: z.string().optional(),
  memo: z.string().optional(),
});

function extractRegionFromAddress(address?: string | null): string {
  if (!address || typeof address !== 'string') return '서울시';
  const trimmed = address.trim();

  // Pattern: "서울특별시 강남구 신사동" -> "강남구 신사동"
  const guDongMatch = trimmed.match(/([가-힣]+(?:구|군|시))\s+([가-힣0-9]+(?:동|읍|면|가))/);
  if (guDongMatch) {
    return `${guDongMatch[1]} ${guDongMatch[2]}`;
  }

  // Fallback to Gu level: "강남구"
  const guMatch = trimmed.match(/([가-힣]+(?:구|군|시))/);
  if (guMatch) {
    return guMatch[1];
  }

  return '서울시';
}

function extractUseFromBuilding(building: Record<string, any>): string {
  const purpose =
    building.main_purpose ||
    building.asset_type ||
    building.usage ||
    building.layers?.building_register?.main_purpose ||
    building.layers?.building?.main_purpose;
  if (!purpose || typeof purpose !== 'string') return '근린생활시설';

  if (purpose.includes('근린') || purpose.includes('근생')) return '근린생활시설';
  if (purpose.includes('업무') || purpose.includes('오피스')) return '업무시설';
  if (purpose.includes('주거') || purpose.includes('주택')) return '주거복합';
  if (purpose.includes('숙박') || purpose.includes('호텔')) return '숙박시설';
  if (purpose.includes('의료') || purpose.includes('병원')) return '의료시설';
  return purpose;
}

function extractPostureFromBuilding(building: Record<string, any>): DealCardPosture {
  const raw = String(
    building.investment_posture ||
      building.posture ||
      building.layers?.deal_terms?.investment_posture ||
      building.layers?.investment_posture ||
      ''
  ).toLowerCase();
  if (raw.includes('value_add') || raw.includes('development') || raw.includes('신축') || raw.includes('나대지')) {
    return 'value_add';
  }
  if (raw.includes('owner') || raw.includes('사옥')) {
    return 'owner_occupied';
  }
  return 'income';
}

function extractScaleFromBuilding(building: Record<string, any>): {
  landAreaPyung?: number;
  gfaPyung?: number;
} {
  const rawLandPyung =
    building.land_area_pyung ??
    building.layers?.land_area_pyung ??
    building.layers?.land?.land_area_pyung ??
    (building.layers?.building_register?.land_area_sqm
      ? Number(building.layers.building_register.land_area_sqm) / 3.3058
      : undefined) ??
    (building.land_area_sqm ? Number(building.land_area_sqm) / 3.3058 : undefined);

  const rawGfaPyung =
    building.total_floor_area_pyung ??
    building.gfa_pyung ??
    building.layers?.total_floor_area_pyung ??
    building.layers?.building?.total_floor_area_pyung ??
    (building.layers?.building_register?.gross_floor_area_sqm
      ? Number(building.layers.building_register.gross_floor_area_sqm) / 3.3058
      : undefined) ??
    (building.gross_floor_area_sqm ? Number(building.gross_floor_area_sqm) / 3.3058 : undefined);

  const landAreaPyung =
    typeof rawLandPyung === 'number' && Number.isFinite(rawLandPyung) && rawLandPyung > 0
      ? Math.round(rawLandPyung)
      : undefined;
  const gfaPyung =
    typeof rawGfaPyung === 'number' && Number.isFinite(rawGfaPyung) && rawGfaPyung > 0
      ? Math.round(rawGfaPyung)
      : undefined;

  return { landAreaPyung, gfaPyung };
}

function extractPriceBandFromBuilding(building: Record<string, any>): string {
  if (building.asking_price_krw && typeof building.asking_price_krw === 'number' && building.asking_price_krw > 0) {
    return formatPriceRange(building.asking_price_krw);
  }

  const layersPriceKrw =
    building.layers?.financial?.asking_price_krw ||
    building.layers?.financial?.asking_price ||
    building.layers?.finance?.asking_price_krw ||
    building.layers?.finance?.asking_price ||
    building.layers?.deal_terms?.asking_price_krw;
  if (layersPriceKrw && typeof layersPriceKrw === 'number' && layersPriceKrw > 0) {
    return formatPriceRange(layersPriceKrw);
  }

  const askingManwon = Number(
    building.asking_price_manwon ??
      building.layers?.deal_terms?.asking_price_manwon ??
      building.layers?.finance?.asking_price_manwon ??
      building.layers?.financial?.asking_price_manwon ??
      0
  );
  if (Number.isFinite(askingManwon) && askingManwon > 0) {
    return formatPriceRange(askingManwon * 10_000);
  }

  const rawBand =
    building.price_band ||
    building.layers?.deal_terms?.price_band ||
    building.layers?.price_band;
  if (rawBand && typeof rawBand === 'string') {
    const parsed = parseLegacyBand(rawBand);
    if (parsed.label) return parsed.label;
  }

  return '가격 협의';
}

function extractPointsFromBuilding(building: Record<string, any>): [string, string, string] {
  const points: string[] = [];

  // Point 1: Location & Road contact
  const roadContact = building.layers?.location?.road_contact || building.road_contact;
  if (roadContact && typeof roadContact === 'string') {
    if (roadContact.includes('CORNER') || roadContact.includes('각지')) {
      points.push('대로변 코너 각지 시인성 우수');
    } else if (roadContact.includes('WIDE') || roadContact.includes('대로')) {
      points.push('광대로변 접근성 및 광고효과 우수');
    } else {
      points.push('접근성 우수한 상권 중심 입지');
    }
  } else {
    points.push('역세권 중심 상업지역 입지 우수');
  }

  // Point 2: Scale & Floor Area
  const { landAreaPyung: landArea, gfaPyung: totalArea } = extractScaleFromBuilding(building);

  if (landArea && totalArea) {
    points.push(`대지 약 ${Math.round(landArea)}평 연면적 약 ${Math.round(totalArea)}평`);
  } else if (totalArea) {
    points.push(`연면적 약 ${Math.round(totalArea)}평 규모의 알짜 매물`);
  } else if (landArea) {
    points.push(`대지 약 ${Math.round(landArea)}평 규모의 알짜 매물`);
  } else {
    points.push('수익형 근생 최적화 건물 규모');
  }

  // Point 3: Financial yield or building age
  const capRate =
    building.cap_rate ||
    building.layers?.financial?.cap_rate ||
    building.layers?.finance?.cap_rate ||
    building.layers?.deal_terms?.cap_rate;
  const rawCompletionDate =
    building.layers?.building_register?.completion_date ||
    building.completion_date;
  const parsedCompletionYear =
    typeof rawCompletionDate === 'string' && /^\d{4}/.test(rawCompletionDate)
      ? parseInt(rawCompletionDate.slice(0, 4), 10)
      : undefined;
  const completionYear =
    building.completion_year ||
    building.layers?.building?.completion_year ||
    building.layers?.building_register?.completion_year ||
    parsedCompletionYear;

  if (capRate && typeof capRate === 'number' && capRate > 0) {
    points.push(`안정적 임대수익률 연 ${capRate.toFixed(1)}% 수준`);
  } else if (completionYear && typeof completionYear === 'number' && completionYear > 1900) {
    points.push(`${completionYear}년 준공 관리 상태 우수`);
  } else {
    points.push('공실 리스크 낮은 안정적 임차 구성');
  }

  const cleaned = cleanBlindPoints(points);
  return [cleaned[0] || '우수 입지', cleaned[1] || '근생 매물', cleaned[2] || '안정 수익'];
}

function parseMemoFast(memo: string): {
  region: string;
  use: string;
  posture: DealCardPosture;
  gfaPyung?: number;
  landAreaPyung?: number;
  priceBand: string;
  points: [string, string, string];
} {
  // Extract region: Gu + Dong, or standalone Dong, or Gu
  let region = '서울시';
  const guDongMatch = memo.match(/([가-힣]+(?:구|시))\s+([가-힣0-9]+(?:동|가|읍|면))/);
  if (guDongMatch) {
    region = `${guDongMatch[1]} ${guDongMatch[2]}`;
  } else {
    const dongMatch = memo.match(/([가-힣0-9]{2,6}(?:동(?:\d+가)?|가|읍|면))/);
    if (dongMatch) {
      region = dongMatch[1];
    } else {
      const guMatch = memo.match(/([가-힣]{2,4}(?:구|시))/);
      if (guMatch) region = guMatch[1];
    }
  }

  // Extract usage
  let use = '근린생활시설';
  if (/오피스|사옥|업무/.test(memo)) use = '업무시설';
  else if (/호텔|모텔|숙박/.test(memo)) use = '숙박시설';
  else if (/주거|주택|다가구/.test(memo)) use = '주거복합';
  else if (/메디컬|병원/.test(memo)) use = '의료시설';

  // Extract posture
  let posture: DealCardPosture = 'income';
  if (/신축|재건축|나대지|개발|리모델링/.test(memo)) posture = 'value_add';
  else if (/사옥|자가사용/.test(memo)) posture = 'owner_occupied';

  // Extract scale (평)
  const landMatch = memo.match(/(?:대지|토지)(?:면적)?\s*(?:약\s*)?(\d+(?:\.\d+)?)\s*평/);
  const gfaMatch = memo.match(/연면적\s*(?:약\s*)?(\d+(?:\.\d+)?)\s*평/);
  const landAreaPyung = landMatch ? Math.round(parseFloat(landMatch[1])) : undefined;
  const gfaPyung = gfaMatch ? Math.round(parseFloat(gfaMatch[1])) : undefined;

  // Extract price
  let priceBand = '가격 협의';
  const priceMatch = memo.match(/(\d+(?:\.\d+)?)\s*억/);
  if (priceMatch) {
    const eok = parseFloat(priceMatch[1]);
    priceBand = formatPriceRange(eok * 1_0000_0000);
  }

  // Extract candidate bullet points from memo sentences
  const sentences = memo
    .split(/[\n,.]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && s.length <= 40);

  const rawPoints = sentences.slice(0, 3);
  while (rawPoints.length < 3) {
    if (rawPoints.length === 0) rawPoints.push('역세권 중심지 입지 우수');
    else if (rawPoints.length === 1) rawPoints.push('안정적 임차 수요 확보');
    else rawPoints.push('추천 수익형 근생 빌딩');
  }

  const cleaned = cleanBlindPoints(rawPoints);
  return {
    region,
    use,
    posture,
    gfaPyung,
    landAreaPyung,
    priceBand,
    points: [cleaned[0], cleaned[1], cleaned[2]],
  };
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const body = await req.json();
    const input = FastFillInputSchema.parse(body);

    const supabase = createServiceClient();

    let extracted: {
      region: string;
      use: string;
      posture: DealCardPosture;
      area?: string;
      gfaPyung?: number;
      landAreaPyung?: number;
      priceBand: string;
      points: [string, string, string];
      provenanceSource: 'public' | 'broker';
    };

    if (input.buildingId) {
      // 1. Verify ownership only when buildingId is a valid UUID (skip DB query for local/demo draft IDs)
      if (isUuid(input.buildingId)) {
        const ownership = await assertBuildingOwner(supabase, input.buildingId, guard.user!.id, {
          allowAdmin: true,
          role: guard.role,
        });
        if (!ownership.ok) return ownership.response;
      }

      // 2. Pure read of building facts (or fallback to quick-generate store for non-UUID local drafts)
      const building = await readBuilding(input.buildingId);
      const quickRec = !building ? getQuickImRecord(input.buildingId) : null;
      if (!building && !quickRec) {
        return NextResponse.json({ error: 'Building not found' }, { status: 404 });
      }

      if (building) {
        const region =
          extractRegionFromAddress(
            building.address ||
              building.road_address ||
              building.layers?.asset_identity?.address ||
              building.area_signal
          );
        const use = extractUseFromBuilding(building);
        const posture = extractPostureFromBuilding(building);
        const { landAreaPyung, gfaPyung } = extractScaleFromBuilding(building);
        const priceBand = extractPriceBandFromBuilding(building);
        const points = extractPointsFromBuilding(building);

        extracted = {
          region,
          use,
          posture,
          gfaPyung,
          landAreaPyung,
          priceBand,
          points,
          provenanceSource: 'public',
        };
      } else {
        extracted = {
          region: quickRec!.card4.region,
          use: quickRec!.card4.use,
          posture: quickRec!.card4.posture || 'income',
          area: quickRec!.card4.area,
          gfaPyung: quickRec!.card4.gfaPyung,
          landAreaPyung: quickRec!.card4.landAreaPyung,
          priceBand: quickRec!.card4.priceBand,
          points: quickRec!.card4.points,
          provenanceSource: 'public',
        };
      }
    } else if (input.memo) {
      const parsed = parseMemoFast(input.memo);
      extracted = {
        ...parsed,
        provenanceSource: 'broker',
      };
    } else {
      return NextResponse.json(
        { error: 'Either buildingId or memo must be provided' },
        { status: 400 },
      );
    }

    // Blind-guard check & auto-cleaning
    const validation = validateBlindPoints(extracted.points, {
      region: extracted.region,
      assetType: extracted.use,
    });

    // 18자 SSOT: 블라인드 정리 후 어절 경계 교정 (하드 절단·말줄임 금지)
    const finalPoints: [string, string, string] = [
      repairDealCardLine(validation.cleanedPoints[0], { fallback: '우수 입지' }) || '우수 입지',
      repairDealCardLine(validation.cleanedPoints[1], { fallback: '추천 매물' }) || '추천 매물',
      repairDealCardLine(validation.cleanedPoints[2], { fallback: '안정 수익' }) || '안정 수익',
    ];
    const posture: DealCardPosture = extracted.posture || 'income';
    const area = resolveCard4AreaLabel(
      {
        posture,
        area: extracted.area,
        gfaPyung: extracted.gfaPyung,
        landAreaPyung: extracted.landAreaPyung,
      },
      {
        gfaPyung: extracted.gfaPyung,
        landAreaPyung: extracted.landAreaPyung,
      }
    );
    // 한 줄 제목은 편집기 입력과 같은 필드(card4.headline)에 채워 내려준다 (근거 기반 파생).
    const headline = deriveDealCardHeadline({ posture, points: finalPoints });

    const card4: Card4Data = {
      headline,
      posture,
      region: extracted.region,
      use: extracted.use,
      ...(area ? { area } : {}),
      ...(extracted.gfaPyung ? { gfaPyung: extracted.gfaPyung } : {}),
      ...(extracted.landAreaPyung ? { landAreaPyung: extracted.landAreaPyung } : {}),
      priceBand: extracted.priceBand,
      points: finalPoints,
      provenance: {
        points: [
          extracted.provenanceSource,
          extracted.provenanceSource,
          extracted.provenanceSource,
        ],
      },
      card4_version: 1,
      card4_hash: computeCard4Hash({
        region: extracted.region,
        use: extracted.use,
        priceBand: extracted.priceBand,
        points: finalPoints,
        area,
        headline,
      }),
    };

    return NextResponse.json({
      success: true,
      card4,
      validation: {
        isValid: validation.isValid,
        violations: validation.violations,
        requiresDongToGuFallback: validation.requiresDongToGuFallback,
        fallbackRegionNotice: validation.fallbackRegionNotice,
        suggestedRegion: validation.suggestedRegion,
      },
    });
  } catch (err: any) {
    log.error('Fast-fill failed:', err);
    return NextResponse.json({ error: err.message || 'Fast-fill failed' }, { status: 400 });
  }
}
