import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { resolveAddress } from '@/lib/external/address-resolver';
import {
  fetchComparableTransactions,
  filterWholeBuildingTransactions,
  type ComparableTransaction,
} from '@/lib/external/real-transaction-api';
import { SQM_RATIO } from '@/lib/utils/area-conversion';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('nearby-comps');

export interface NearbyCompOption {
  id: string;
  location: string;
  dealDate: string;
  price_eok: number;
  land_area_pyeong?: number;
  gfa_pyeong?: number;
  land_price_per_pyeong_manwon?: number;
  building_use: string;
  note: string;
}

function extractDongToken(addr: string): string {
  const m = addr.match(/([가-힣0-9]+(?:동|가|읍|면))(?:\s|$|\d)/);
  return m ? m[1] : '';
}

function toNearbyCompOption(t: ComparableTransaction, idx: number): NearbyCompOption {
  const dealDate = `${t.dealYear}-${String(t.dealMonth).padStart(2, '0')}`;
  const priceEok = Math.round((t.dealAmount / 100_000_000) * 10) / 10;
  const gfaPyeong = t.area > 0 ? Math.round((t.area / SQM_RATIO) * 10) / 10 : undefined;
  const landPyeong =
    t.landAreaSqm && t.landAreaSqm > 0
      ? Math.round((t.landAreaSqm / SQM_RATIO) * 10) / 10
      : undefined;
  const landPricePerPyeongManwon =
    t.landPricePerPyeongManwon && t.landPricePerPyeongManwon > 0
      ? Math.round(t.landPricePerPyeongManwon)
      : landPyeong && landPyeong > 0 && t.dealAmount > 0
        ? Math.round(t.dealAmount / 10_000 / landPyeong)
        : undefined;

  return {
    id: `comp-${dealDate}-${t.address}-${t.dealAmount}-${idx}`,
    location: t.address,
    dealDate,
    price_eok: priceEok,
    ...(landPyeong ? { land_area_pyeong: landPyeong } : {}),
    ...(gfaPyeong ? { gfa_pyeong: gfaPyeong } : {}),
    ...(landPricePerPyeongManwon ? { land_price_per_pyeong_manwon: landPricePerPyeongManwon } : {}),
    building_use: t.buildingUse || '근린생활',
    note: `${t.buildingUse || '근린생활'}${t.floors > 0 ? ` · ${t.floors}층` : ''} (${dealDate})`,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { searchParams } = new URL(req.url);
  const rawPnu = (searchParams.get('pnu') || '').trim();
  const rawAddress = (searchParams.get('address') || '').trim();

  let sigunguCd = /^\d{5}/.test(rawPnu) ? rawPnu.slice(0, 5) : '';
  let dongToken = extractDongToken(rawAddress);

  if (!sigunguCd && rawAddress) {
    try {
      const resolved = await resolveAddress(rawAddress);
      if (resolved?.sigunguCd && /^\d{5}$/.test(resolved.sigunguCd)) {
        sigunguCd = resolved.sigunguCd;
      }
      if (!dongToken && resolved?.jibunAddress) {
        dongToken = extractDongToken(resolved.jibunAddress);
      }
    } catch (err) {
      log.warn({ err }, '[nearby-comps] resolveAddress skipped');
    }
  }

  if (!sigunguCd) {
    return NextResponse.json({
      ok: true,
      items: [],
      message: '주소를 먼저 조회하거나 시군구 정보를 입력하면 인근 실거래를 불러올 수 있습니다.',
    });
  }

  try {
    const rawItems = await fetchComparableTransactions(sigunguCd);
    const wholeBuildings = filterWholeBuildingTransactions(rawItems);
    const sorted = [...wholeBuildings].sort((a, b) => {
      if (dongToken) {
        const aSame = a.address.includes(dongToken) ? 1 : 0;
        const bSame = b.address.includes(dongToken) ? 1 : 0;
        if (aSame !== bSame) return bSame - aSame;
      }
      return b.dealYear * 100 + b.dealMonth - (a.dealYear * 100 + a.dealMonth);
    });

    const items = sorted.slice(0, 12).map(toNearbyCompOption);
    return NextResponse.json({
      ok: true,
      sigunguCd,
      items,
      ...(items.length === 0
        ? { message: '최근 3개월 내 통건물 상업·업무용 실거래 신고 내역이 없습니다.' }
        : {}),
    });
  } catch (err) {
    log.warn({ err }, '[nearby-comps] fetchComparableTransactions failed');
    return NextResponse.json({
      ok: true,
      items: [],
      message: '공공 실거래 API를 일시적으로 불러오지 못했습니다. 아래 직접 추가를 이용해 주세요.',
    });
  }
}
