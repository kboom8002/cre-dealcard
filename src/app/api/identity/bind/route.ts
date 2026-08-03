import { NextResponse } from 'next/server';
import { bindViewerHistory } from '@/domain/identity/bind';
import { bindRecipientToParty } from '@/domain/identity/party-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, viewerId, partyId, recipientId } = body;

    // 익명 Viewer 단계에서 발생한 슬라이더 이벤트를 Party에 소급 바인딩
    if (type === 'viewer') {
      if (!viewerId || !partyId) {
        return NextResponse.json({ error: 'Missing viewerId or partyId' }, { status: 400 });
      }
      const result = await bindViewerHistory(viewerId, partyId);
      return NextResponse.json(result);
    } 
    
    // Recipient를 Party에 확정적으로 결합
    if (type === 'recipient') {
      if (!recipientId || !partyId) {
        return NextResponse.json({ error: 'Missing recipientId or partyId' }, { status: 400 });
      }
      await bindRecipientToParty(recipientId, partyId);
      return NextResponse.json({ bound: true });
    }

    return NextResponse.json({ error: 'Invalid type parameter. Expected "viewer" or "recipient"' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
