import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

/**
 * WP-7.3D P2-2: this route proxies the server-side Kakao REST key. It used to be an open proxy
 * (any origin, any coordinates, unlimited). Now:
 *  - only same-origin / first-party requests (Referer/Origin host allowlist, or
 *    `Sec-Fetch-Site: same-origin|same-site`) may use it — the IM viewer <img> and the PPTX
 *    renderer (which sends the first-party Referer) keep working;
 *  - coordinates must fall inside the Korean peninsula bounding box;
 *  - per-IP rate limit.
 */
const KOREA_BOUNDS = { latMin: 33.0, latMax: 38.7, lngMin: 124.5, lngMax: 132.0 } as const;
const MAP_RATE_LIMIT_PER_MINUTE = 60;

function hostOf(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim().replace(/^["']|["']$/g, '');
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const add = (h: string | null) => {
    if (h) hosts.add(h.toLowerCase());
  };
  add(req.headers.get('host'));
  add(req.headers.get('x-forwarded-host'));
  add(req.nextUrl?.host || null);
  add(hostOf(process.env.NEXT_PUBLIC_SITE_URL));
  add(hostOf(process.env.NEXT_PUBLIC_APP_URL));
  add(hostOf(process.env.VWORLD_REFERER));
  add(process.env.VERCEL_URL ? String(process.env.VERCEL_URL).toLowerCase() : null);
  hosts.add('credeal.net');
  hosts.add('www.credeal.net');
  return hosts;
}

function isFirstPartyMapRequest(req: NextRequest): boolean {
  const secFetchSite = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true;
  const hosts = allowedHosts(req);
  const refererHost = hostOf(req.headers.get('referer'));
  if (refererHost && hosts.has(refererHost)) return true;
  const originHost = hostOf(req.headers.get('origin'));
  if (originHost && hosts.has(originHost)) return true;
  return false;
}

function isWithinKoreaBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KOREA_BOUNDS.latMin &&
    lat <= KOREA_BOUNDS.latMax &&
    lng >= KOREA_BOUNDS.lngMin &&
    lng <= KOREA_BOUNDS.lngMax
  );
}

function clientIp(req: NextRequest): string {
  return (
    (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const wStr = searchParams.get('w') || '768';
  const hStr = searchParams.get('h') || '320';
  const levelStr = searchParams.get('level') || '3';

  const lat = parseFloat(latStr || '');
  const lng = parseFloat(lngStr || '');
  const width = Math.min(Math.max(parseInt(wStr, 10) || 768, 100), 1280);
  const height = Math.min(Math.max(parseInt(hStr, 10) || 320, 100), 960);
  const level = Math.min(Math.max(parseInt(levelStr, 10) || 3, 1), 14);

  if (!isFirstPartyMapRequest(req)) {
    return createSvgPlaceholder(width, height, '지도 표시 권한이 없습니다', 403);
  }

  const allowed = await checkRateLimit(clientIp(req), 'public_map_static', MAP_RATE_LIMIT_PER_MINUTE, 60_000);
  if (!allowed) {
    return createSvgPlaceholder(width, height, '잠시 후 다시 시도해 주세요', 429);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return createSvgPlaceholder(width, height, '위치 좌표 확인 필요');
  }

  if (!isWithinKoreaBounds(lat, lng)) {
    return createSvgPlaceholder(width, height, '위치 좌표 확인 필요', 400);
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return createSvgPlaceholder(width, height, '지도 서비스 준비 중');
  }

  try {
    const kakaoUrl = `https://dapi.kakao.com/v2/maps/staticmap?center=${lng},${lat}&size=${width}x${height}&level=${level}&markers=type:d|size:medium|${lng},${lat}`;
    const kakaoRes = await fetch(kakaoUrl, {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (kakaoRes.ok) {
      const buffer = await kakaoRes.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        },
      });
    }

    // markers 파라미터 제외하고 재시도
    const simpleUrl = `https://dapi.kakao.com/v2/maps/staticmap?center=${lng},${lat}&size=${width}x${height}&level=${level}`;
    const retryRes = await fetch(simpleUrl, {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (retryRes.ok) {
      const buffer = await retryRes.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        },
      });
    }
  } catch (err) {
    console.error('[map/static] Failed to fetch static map:', err);
  }

  return createSvgPlaceholder(width, height, '지도 로드 중 오류 발생');
}

function createSvgPlaceholder(width: number, height: number, message: string, status = 200): NextResponse {
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
      <circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2 - 20)}" r="24" fill="#2563EB" fill-opacity="0.12"/>
      <path d="M${Math.round(width / 2)} ${Math.round(height / 2 - 32)} C${Math.round(width / 2 - 10)} ${Math.round(height / 2 - 32)}, ${Math.round(width / 2 - 10)} ${Math.round(height / 2 - 16)}, ${Math.round(width / 2)} ${Math.round(height / 2 - 4)} C${Math.round(width / 2 + 10)} ${Math.round(height / 2 - 16)}, ${Math.round(width / 2 + 10)} ${Math.round(height / 2 - 32)}, ${Math.round(width / 2)} ${Math.round(height / 2 - 32)} Z" fill="#2563EB"/>
      <circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2 - 22)}" r="4" fill="#FFFFFF"/>
      <text x="50%" y="${Math.round(height / 2 + 25)}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#334155" text-anchor="middle">${message}</text>
      <text x="50%" y="${Math.round(height / 2 + 47)}" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#64748B" text-anchor="middle">MAP</text>
    </svg>
  `.trim();

  return new NextResponse(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
