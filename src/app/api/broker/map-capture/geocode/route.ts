import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/broker/map-capture/geocode
 * 주소 텍스트 → 카카오 Local API로 좌표 변환
 */
export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { address } = await req.json();
  if (!address || typeof address !== 'string' || address.trim().length < 2) {
    return NextResponse.json({ error: '주소를 입력해주세요.' }, { status: 400 });
  }

  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (!kakaoKey) {
    return NextResponse.json({ error: '카카오 API 키가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    // 1차: 주소 검색
    const addressRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address.trim())}`,
      { headers: { Authorization: `KakaoAK ${kakaoKey}` }, signal: AbortSignal.timeout(5000) }
    );
    const addressData = await addressRes.json();

    if (addressData.documents?.length > 0) {
      const doc = addressData.documents[0];
      return NextResponse.json({
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        address: doc.address_name || address.trim(),
        roadAddress: doc.road_address?.address_name || null,
      });
    }

    // 2차: 키워드 검색 (건물명 등)
    const keywordRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address.trim())}`,
      { headers: { Authorization: `KakaoAK ${kakaoKey}` }, signal: AbortSignal.timeout(5000) }
    );
    const keywordData = await keywordRes.json();

    if (keywordData.documents?.length > 0) {
      const doc = keywordData.documents[0];
      return NextResponse.json({
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        address: doc.address_name || doc.place_name || address.trim(),
        roadAddress: doc.road_address_name || null,
      });
    }

    return NextResponse.json({ error: `'${address}' 주소를 찾을 수 없습니다.` }, { status: 404 });
  } catch (err: any) {
    console.error('[map-capture/geocode] error:', err);
    return NextResponse.json({ error: '주소 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
