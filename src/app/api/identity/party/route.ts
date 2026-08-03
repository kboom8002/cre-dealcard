import { NextResponse } from 'next/server';
import { findOrCreateParty, deleteParty } from '@/domain/identity/party-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const party = await findOrCreateParty(body);
    return NextResponse.json(party);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Missing party id parameter' }, { status: 400 });
    }
    
    await deleteParty(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
