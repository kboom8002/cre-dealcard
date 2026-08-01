import { NextResponse } from 'next/server';
import { simulateReidentification } from '@/domain/deal/teaser/photo-safety';
import { dealService, Deal } from '@/domain/deal/deal-service';
import { DealStage } from '@/domain/deal/deal-transition';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { photoUrl = '', title = '', currentStage = 'im_draft' } = body;

    // 1. Safety check
    const safetyResult = simulateReidentification(photoUrl, title);

    if (!safetyResult.isSafe) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Photo rejected due to high re-identification risk', 
          details: safetyResult.detectedRiskFactors 
        },
        { status: 400 }
      );
    }

    // 2. Transition Deal Stage (e.g. im_draft -> im_published)
    const deal: Deal = {
      id,
      stage: currentStage as DealStage,
      updatedAt: new Date().toISOString()
    };

    const transition = await dealService.transitionDealStage(deal, 'im_published', 'broker_user_id');

    if (!transition.allowed) {
      return NextResponse.json(
        { success: false, error: transition.reason },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      safetyResult,
      transition
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
