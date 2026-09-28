import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return createSvgPlaceholder(width, height, '위치 좌표 확인 필요');
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

function createSvgPlaceholder(width: number, height: number, message: string): NextResponse {
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1a1a2e"/>
      <circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2 - 20)}" r="24" fill="#3b82f6" fill-opacity="0.2"/>
      <path d="M${Math.round(width / 2)} ${Math.round(height / 2 - 32)} C${Math.round(width / 2 - 10)} ${Math.round(height / 2 - 32)}, ${Math.round(width / 2 - 10)} ${Math.round(height / 2 - 16)}, ${Math.round(width / 2)} ${Math.round(height / 2 - 4)} C${Math.round(width / 2 + 10)} ${Math.round(height / 2 - 16)}, ${Math.round(width / 2 + 10)} ${Math.round(height / 2 - 32)}, ${Math.round(width / 2)} ${Math.round(height / 2 - 32)} Z" fill="#3b82f6"/>
      <circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2 - 22)}" r="4" fill="#ffffff"/>
      <text x="50%" y="${Math.round(height / 2 + 25)}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" text-anchor="middle">${message}</text>
      <text x="50%" y="${Math.round(height / 2 + 45)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">카카오 지도 연동</text>
    </svg>
  `.trim();

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
