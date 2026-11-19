/**
 * GET /api/broker/clients — 고객 목록 조회
 * POST /api/broker/clients — 신규 고객 등록
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { isIgnorableSchemaError } from '@/lib/inbox/inbox-schema-caps';
import { escapeIlike } from "@/lib/utils/postgrest-escape";
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('broker-clients-route');

// WP-7.3E P2-10: length caps mirroring inbox-import.ts ContactImportItemSchema.
const CreateClientSchema = z.object({
  client_type: z.enum(['seller', 'buyer', 'both']),
  display_name: z.string().trim().min(1, '이름을 입력해주세요').max(100, '이름은 100자 이내로 입력해 주세요.'),
  company: z.string().trim().max(120, '회사명은 120자 이내로 입력해 주세요.').optional(),
  phone: z.string().trim().max(40, '연락처는 40자 이내로 입력해 주세요.').optional(),
  email: z.string().trim().max(254).email('올바른 이메일 주소를 입력해 주세요.').optional().or(z.literal('')),
  tier: z.enum(['vip', 'normal', 'potential', 'dormant']).default('normal'),
  tags: z.array(z.string().trim().max(50, '태그는 50자 이내로 입력해 주세요.')).max(30, '태그는 최대 30개까지 등록할 수 있습니다.').default([]),
  notes: z.string().max(1000, '메모는 1000자 이내로 입력해 주세요.').optional(),
  linked_building_ids: z.array(z.string().uuid()).max(50).default([]),
  linked_buyer_intent_ids: z.array(z.string().uuid()).max(50).default([]),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (auth.error) return auth.error;

    const supabase = createServiceClient();

    const url = new URL(req.url);
    const clientType = url.searchParams.get('client_type');
    const tier = url.searchParams.get('tier');
    const search = url.searchParams.get('search');
    const rawLimit = Number(url.searchParams.get('limit') ?? 100);
    const rawOffset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
      : 100;
    const offset = Number.isFinite(rawOffset)
      ? Math.max(Math.trunc(rawOffset), 0)
      : 0;

    let query = supabase
      .from('broker_clients')
      .select('*')
      .eq('broker_id', auth.user!.id)
      .order('created_at', { ascending: false });

    if (clientType && clientType !== 'all') {
      query = query.eq('client_type', clientType);
    }
    if (tier && tier !== 'all') {
      query = query.eq('tier', tier);
    }
    if (search) {
      query = query.or(`display_name.ilike.%${escapeIlike(search.replace(/[,()"\\]/g, ''))}%,company.ilike.%${escapeIlike(search.replace(/[,()"\\]/g, ''))}%,phone.ilike.%${escapeIlike(search.replace(/[,()"\\]/g, ''))}%`);
    }

    const { data, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      log.error('broker_clients select failed', { message: error.message });
      return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      data,
      pagination: {
        limit,
        offset,
        hasMore: Array.isArray(data) && data.length === limit,
      },
    });
  } catch (err) {
    log.error('GET /api/broker/clients failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (auth.error) return auth.error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '요청 본문 JSON 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const parsed = CreateClientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || '입력 항목을 다시 확인해 주세요.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { email: rawEmail, ...restParsed } = parsed.data;
    const normalizedEmail = rawEmail?.trim() ? rawEmail.trim().toLowerCase() : null;
    const baseInsert = {
      broker_id: auth.user!.id,
      ...restParsed,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
    };
    const extendedInsert = {
      ...baseInsert,
      is_vip: parsed.data.tier === 'vip',
      client_role: parsed.data.client_type === 'seller' ? 'seller' : 'buyer',
      consent_status: 'unconfirmed',
    };

    let { data, error } = await supabase
      .from('broker_clients')
      .insert(extendedInsert)
      .select('*')
      .single();

    if (error && isIgnorableSchemaError(error)) {
      const retry = await supabase
        .from('broker_clients')
        .insert(baseInsert)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
      if (error && isIgnorableSchemaError(error)) {
        const { email: _e, company: _c, ...minimalInsert } = baseInsert;
        void _e;
        void _c;
        const minimalRetry = await supabase
          .from('broker_clients')
          .insert(minimalInsert)
          .select('*')
          .single();
        data = minimalRetry.data;
        error = minimalRetry.error;
      }
    }

    if (error) {
      log.error('broker_clients insert failed', { message: error.message });
      return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
    }

    // Activity event (omit raw display_name PII)
    await supabase.from('activity_events').insert({
      actor_id: auth.user!.id,
      actor_role: auth.role,
      event_type: 'broker_client_created',
      entity_type: 'broker_clients',
      entity_id: data.id,
      metadata: {
        has_phone: Boolean(parsed.data.phone?.trim()),
        tier: parsed.data.tier,
      },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    log.error('POST /api/broker/clients failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
