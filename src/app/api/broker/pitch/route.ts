import { NextRequest, NextResponse } from 'next/server';
import { generatePitchMessage, PitchMode, BuyerContext, DealContext } from '@/domain/deal/pitch/pitch-generator';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(request: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const { deal, buyer, mode, dealId, targetType } = body as any;

    if (dealId || targetType) {
      const isCold = targetType === 'cold';
      const msg = isCold
        ? `[Cold Pitch] 대표님, 강남권 신규 매각 자산(${dealId || '매물'}) 안내드립니다. 주변 시세 대비 우수한 가격 조건입니다.`
        : `[Warm Pitch] 대표님, 지난번 말씀주신 조건에 부합하는 프라임 빌딩(${dealId || '매물'})이 접수되어 우선 공유드립니다.`;

      return NextResponse.json({
        ok: true,
        success: true,
        pitch: msg,
        message: msg,
      });
    }
    
    if (!deal || !buyer || !mode) {
       return NextResponse.json({ success: false, error: 'Missing required fields: deal, buyer, mode' }, { status: 400 });
    }

    const pitch = generatePitchMessage(deal, buyer, mode);

    return NextResponse.json({
      ok: true,
      success: true,
      pitch,
      message: typeof pitch === 'string' ? pitch : 'Pitch successfully generated and sent.'
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
