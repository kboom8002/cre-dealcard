import { NextRequest, NextResponse } from 'next/server';
import { generatePitchMessage, PitchMode, BuyerContext, DealContext } from '@/domain/deal/pitch/pitch-generator';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(request: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { deal, buyer, mode } = body as { deal: DealContext, buyer: BuyerContext, mode: PitchMode };
    
    if (!deal || !buyer || !mode) {
       return NextResponse.json({ success: false, error: 'Missing required fields: deal, buyer, mode' }, { status: 400 });
    }

    const pitch = generatePitchMessage(deal, buyer, mode);

    // Simulated action of sending the pitch (e.g., via email, SMS, or internal message)
    // await notificationService.send(pitch);

    return NextResponse.json({
      success: true,
      pitch,
      message: 'Pitch successfully generated and sent.'
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
