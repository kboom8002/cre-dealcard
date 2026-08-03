import { NextResponse } from 'next/server';
import { insertCondition, getLatestCondition, getConditionHistory } from '@/domain/identity/condition-engine';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const condition = await insertCondition(body);
    return NextResponse.json(condition);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const partyId = url.searchParams.get('partyId');
    const history = url.searchParams.get('history') === 'true';
    
    if (!partyId) {
      return NextResponse.json({ error: 'Missing partyId parameter' }, { status: 400 });
    }
    
    if (history) {
      const result = await getConditionHistory(partyId);
      return NextResponse.json(result);
    } else {
      const result = await getLatestCondition(partyId);
      return NextResponse.json(result);
    }
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
