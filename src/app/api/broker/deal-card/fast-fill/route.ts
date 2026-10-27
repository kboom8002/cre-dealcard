import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { readBuilding } from '@/domain/building/im-core/read-building';
import { formatPriceRange, parseLegacyBand } from '@/lib/deal-card/price-band';
import { cleanBlindPoints, validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { computeCard4Hash, type Card4Data } from '@/lib/deal-card/card4-schema';
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
  const purpose = building.main_purpose || building.asset_type || building.usage;
  if (!purpose || typeof purpose !== 'string') return '근린생활시설';

  if (purpose.includes('근린') || purpose.includes('근생')) return '근린생활시설';
  if (purpose.includes('업무') || purpose.includes('오피스')) return '업무시설';
  if (purpose.includes('주거') || purpose.includes('주택')) return '주거복합';
  if (purpose.includes('숙박') || purpose.includes('호텔')) return '숙박시설';
  if (purpose.includes('의료') || purpose.includes('병원')) return '의료시설';
  return purpose;
}

function extractPriceBandFromBuilding(building: Record<string, any>): string {
  if (building.asking_price_krw && typeof building.asking_price_krw === 'number' && building.asking_price_krw > 0) {
    return formatPriceRange(building.asking_price_krw);
  }

  const layersPrice = building.layers?.financial?.asking_price_krw || building.layers?.financial?.asking_price;
  if (layersPrice && typeof layersPrice === 'number' && layersPrice > 0) {
    return formatPriceRange(layersPrice);
  }

  if (building.price_band && typeof building.price_band === 'string') {
    const parsed = parseLegacyBand(building.price_band);
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
  const landArea = building.land_area_pyung || building.layers?.land?.land_area_pyung;
  const totalArea = building.total_floor_area_pyung || building.layers?.building?.total_floor_area_pyung;

  if (landArea && totalArea) {
    points.push(`대지 약 ${Math.round(landArea)}평 연면적 약 ${Math.round(totalArea)}평`);
  } else if (totalArea) {
    points.push(`연면적 약 ${Math.round(totalArea)}평 규모의 알짜 매물`);
  } else {
    points.push('수익형 근생 최적화 건물 규모');
  }

  // Point 3: Financial yield or building age
  const capRate = building.cap_rate || building.layers?.financial?.cap_rate;
  const completionYear = building.completion_year || building.layers?.building?.completion_year;

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

  // Extract price
  let priceBand = '가격 협의';
  const priceMatch = memo.match(/(\d+)\s*억/);
  if (priceMatch) {
    const eok = parseInt(priceMatch[1], 10);
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
        const region = extractRegionFromAddress(building.address || building.road_address);
        const use = extractUseFromBuilding(building);
        const priceBand = extractPriceBandFromBuilding(building);
        const points = extractPointsFromBuilding(building);

        extracted = {
          region,
          use,
          priceBand,
          points,
          provenanceSource: 'public',
        };
      } else {
        extracted = {
          region: quickRec!.card4.region,
          use: quickRec!.card4.use,
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

    const finalPoints: [string, string, string] = [
      validation.cleanedPoints[0] || '우수 입지',
      validation.cleanedPoints[1] || '추천 매물',
      validation.cleanedPoints[2] || '안정 수익',
    ];

    const card4: Card4Data = {
      region: extracted.region,
      use: extracted.use,
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
