/**
 * GET /api/broker/clients/[id]/contacts — 연락 이력 조회
 * POST /api/broker/clients/[id]/contacts — 연락 기록 추가
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('broker-clients-contacts-route');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateContactSchema = z.object({
  contact_type: z.enum(['phone', 'kakao', 'sms', 'email', 'meeting', 'site_visit', 'note']),
  summary: z.string().trim().min(1, '내용을 입력해주세요').max(5000, '내용은 5000자 이내로 입력해 주세요.'),
  scheduled_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireBroker(req);
    if (auth.error) return auth.error;
    const isAdmin = auth.role === 'admin' || auth.profile?.role === 'admin';

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 });
    }

    const supabase = createServiceClient();

    let clientQuery = supabase
      .from('broker_clients')
      .select('id, broker_id')
      .eq('id', id);
    if (!isAdmin) {
      clientQuery = clientQuery.eq('broker_id', auth.user!.id);
    }
    const { data: client } = await clientQuery.maybeSingle();

    if (!client) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
    }

    let contactsQuery = supabase
      .from('contact_history')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!isAdmin) {
      contactsQuery = contactsQuery.eq('broker_id', auth.user!.id);
    }

    const { data, error } = await contactsQuery;

    if (error) {
      log.error('contact_history select failed', { message: error.message });
      return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    log.error('GET /api/broker/clients/[id]/contacts failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireBroker(req);
    if (auth.error) return auth.error;
    const isAdmin = auth.role === 'admin' || auth.profile?.role === 'admin';

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const parsed = CreateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || '입력 항목을 확인해주세요.' },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Verify client belongs to broker
    let clientQuery = supabase
      .from('broker_clients')
      .select('id, broker_id')
      .eq('id', id);
    if (!isAdmin) {
      clientQuery = clientQuery.eq('broker_id', auth.user!.id);
    }
    const { data: client } = await clientQuery.maybeSingle();

    if (!client) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('contact_history')
      .insert({
        broker_id: client.broker_id || auth.user!.id,
        client_id: id,
        ...parsed.data,
      })
      .select('*')
      .single();

    if (error) {
      log.error('contact_history insert failed', { message: error.message });
      return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    log.error('POST /api/broker/clients/[id]/contacts failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
