import { NextRequest, NextResponse } from 'next/server';
import { fetchCadastralMapImage } from '@/lib/external/vworld-wms-cadastral';
import {
  getVWorldApiKey,
  getVWorldDomain,
  getVWorldReferer,
} from '@/lib/external/vworld-config';
import { checkRateLimit } from '@/lib/rate-limiter';
import { clientIp, isFirstPartyMapRequest } from '@/lib/security/public-map-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const MAP_RATE_LIMIT_PER_MINUTE = 60;

const PNU_RE = /^\d{19}$/;

function isValidKoreanCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 33 &&
    lat <= 43 &&
    lng >= 124 &&
    lng <= 132
  );
}

/**
 * Resolve WGS84 centroid for a 19-digit PNU via V-World Data API when lat/lng
 * query parameters are omitted.
 */
async function resolveCentroidByPnu(
  pnu: string,
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = getVWorldApiKey();
  if (!apiKey) return null;

  const isBonbun = pnu.slice(15) === '0000';
  const layerOrder = isBonbun
    ? ['LP_PA_CBND_BONBUN', 'LP_PA_CBND_BUBUN']
    : ['LP_PA_CBND_BUBUN', 'LP_PA_CBND_BONBUN'];
  const domain = getVWorldDomain();
  const referer = getVWorldReferer();

  for (const layer of layerOrder) {
    try {
      const url =
        `https://api.vworld.kr/req/data?service=data&request=GetFeature` +
        `&data=${layer}&key=${apiKey}&domain=${encodeURIComponent(domain)}` +
        `&format=json&geometry=true&attribute=true&crs=EPSG:4326` +
        `&attrFilter=pnu:=:${pnu}`;
      const res = await fetch(url, {
        headers: { Referer: referer },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const features = json?.response?.result?.featureCollection?.features;
      if (!Array.isArray(features) || features.length === 0) continue;

      let sumLng = 0;
      let sumLat = 0;
      let count = 0;
      for (const feat of features) {
        const geom = feat?.geometry;
        const ring: unknown =
          geom?.type === 'Polygon'
            ? geom.coordinates?.[0]
            : geom?.type === 'MultiPolygon'
              ? geom.coordinates?.[0]?.[0]
              : null;
        if (!Array.isArray(ring)) continue;
        for (const pt of ring) {
          if (
            Array.isArray(pt) &&
            Number.isFinite(pt[0]) &&
            Number.isFinite(pt[1])
          ) {
            sumLng += Number(pt[0]);
            sumLat += Number(pt[1]);
            count += 1;
          }
        }
      }
      if (count > 0) {
        const lat = sumLat / count;
        const lng = sumLng / count;
        if (isValidKoreanCoord(lat, lng)) {
          return { lat, lng };
        }
      }
    } catch {
      // ignore and fall through to next layer
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    if (!isFirstPartyMapRequest(request)) {
      return NextResponse.json(
        { ok: false, error: '지도 표시 권한이 없습니다.' },
        { status: 403 },
      );
    }

    const allowed = await checkRateLimit(
      clientIp(request),
      'public_map_cadastral',
      MAP_RATE_LIMIT_PER_MINUTE,
      60_000,
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: '잠시 후 다시 시도해 주세요.' },
        { status: 429 },
      );
    }

    const sp = request.nextUrl.searchParams;
    const rawPnu = (sp.get('pnu') || '').trim();
    if (!PNU_RE.test(rawPnu)) {
      return NextResponse.json(
        { ok: false, error: '유효하지 않은 PNU입니다 (19자리 숫자 필요).' },
        { status: 400 },
      );
    }

    const rawPnusParam = (sp.get('pnus') || '').trim();
    const additionalPnus = rawPnusParam
      ? Array.from(
          new Set(
            rawPnusParam
              .split(',')
              .map((s) => s.trim())
              .filter((s) => PNU_RE.test(s) && s !== rawPnu),
          ),
        ).slice(0, 5)
      : [];

    const rawLat = sp.get('lat');
    const rawLng = sp.get('lng');
    const parsedLat = rawLat !== null && rawLat.trim() !== '' ? Number(rawLat) : NaN;
    const parsedLng = rawLng !== null && rawLng.trim() !== '' ? Number(rawLng) : NaN;

    let coords: { lat: number; lng: number } | null = isValidKoreanCoord(
      parsedLat,
      parsedLng,
    )
      ? { lat: parsedLat, lng: parsedLng }
      : null;

    if (!coords) {
      coords = await resolveCentroidByPnu(rawPnu);
    }

    if (!coords) {
      return NextResponse.json(
        { ok: false, error: '지적도 좌표를 확인할 수 없습니다.' },
        { status: 404 },
      );
    }

    const result = await fetchCadastralMapImage(
      coords.lat,
      coords.lng,
      800,
      600,
      150,
      rawPnu,
      additionalPnus,
    );

    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'V-World 지적도를 불러올 수 없습니다.' },
        { status: 404 },
      );
    }

    const pngBuffer = Buffer.isBuffer(result.buffer)
      ? result.buffer
      : typeof result.base64 === 'string' && result.base64.includes('base64,')
        ? Buffer.from(result.base64.split('base64,')[1], 'base64')
        : null;

    if (!pngBuffer || pngBuffer.length === 0) {
      return NextResponse.json(
        { ok: false, error: '지적도 이미지 생성에 실패했습니다.' },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: '지적도 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
