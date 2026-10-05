/**
 * src/lib/magazine/authz.ts — 매거진 API 인증·소유권 가드 (P0-03, G1/G2)
 *
 * 공유 `auth-guard.ts`는 수정하지 않고 래핑한다(IM 창과 공유).
 * 원칙:
 *  - 서버가 브로커 정체성(slug, user uuid)을 결정한다. 클라이언트가 보낸 broker_id/slug는 신뢰하지 않는다.
 *  - 소유권 불일치는 404로 응답해 리소스 존재 여부를 노출하지 않는다.
 *  - 매거진 테이블의 broker_id 컬럼은 과도기(F-04 백필 전)에 slug/uuid가 혼재하므로 brokerKeys=[slug, userId]로 조회한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { isUuid } from './slug';

const log = createModuleLogger('magazine-authz');

export interface BrokerCtx {
  userId: string;
  email?: string;
  /** broker_profiles.slug — 아직 설정하지 않았으면 null */
  slug: string | null;
  displayName: string | null;
  /** broker_id 컬럼 조회에 쓰는 허용 키 (slug, userId) */
  brokerKeys: string[];
}

export type BrokerCtxResult =
  | { ctx: BrokerCtx; error: null }
  | { ctx: null; error: NextResponse };

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function notFoundResponse(message = '요청하신 내용을 찾을 수 없습니다.'): NextResponse {
  return jsonError('NOT_FOUND', message, 404);
}

export interface RequireBrokerContextOptions {
  /** true면 slug 미설정 시 409(SLUG_REQUIRED) */
  requireSlug?: boolean;
}

/**
 * 로그인 + broker 확인 후 서버가 slug/uuid를 결정해 컨텍스트로 반환한다.
 */
export async function requireBrokerContext(
  req: NextRequest,
  opts: RequireBrokerContextOptions = {},
): Promise<BrokerCtxResult> {
  const guard = await requireBroker(req);
  if (guard.error || !guard.user) {
    return {
      ctx: null,
      error: guard.error ?? jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401),
    };
  }
  const userId = guard.user.id;

  let slug: string | null = null;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('broker_profiles')
      .select('slug')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      log.error('broker_profiles lookup failed', { userId, error: error.message });
      return { ctx: null, error: jsonError('INTERNAL_ERROR', '프로필을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500) };
    }
    slug = (data as { slug?: string | null } | null)?.slug ?? null;
  } catch (e) {
    log.error('broker_profiles lookup threw', { userId, error: e instanceof Error ? e.message : String(e) });
    return { ctx: null, error: jsonError('INTERNAL_ERROR', '프로필을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500) };
  }

  if (opts.requireSlug && !slug) {
    return {
      ctx: null,
      error: jsonError('SLUG_REQUIRED', '매거진 주소(slug)를 먼저 설정해 주세요.', 409),
    };
  }

  const brokerKeys = [slug, userId].filter((k): k is string => !!k);
  return {
    ctx: {
      userId,
      email: guard.user.email,
      slug,
      displayName: guard.profile?.display_name ?? null,
      brokerKeys,
    },
    error: null,
  };
}

export interface AssertOwnsOptions {
  /** 소유자 키 컬럼 (기본 broker_id) */
  keyColumn?: string;
  /** 조회 select 목록 (기본 '*') */
  select?: string;
}

/**
 * 테이블 행이 ctx 브로커 소유인지 확인한다. 소유가 아니거나 없으면 null.
 * 호출부에서 null이면 notFoundResponse()를 돌려준다.
 */
export async function assertOwnsRow<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  ctx: BrokerCtx,
  opts: AssertOwnsOptions = {},
): Promise<T | null> {
  const keyColumn = opts.keyColumn ?? 'broker_id';
  if (!id || ctx.brokerKeys.length === 0) return null;
  // uuid 키 컬럼에 slug가 들어가면 22P02 → uuid 컬럼(user_id/owner_id)은 uuid 키만 사용
  const uuidColumn = keyColumn.endsWith('user_id') || keyColumn === 'owner_id' || keyColumn === 'actor_id';
  const keys = uuidColumn ? ctx.brokerKeys.filter(isUuid) : ctx.brokerKeys;
  if (keys.length === 0) return null;
  const { data, error } = await supabase
    .from(table)
    .select(opts.select ?? '*')
    .eq('id', id)
    .in(keyColumn, keys)
    .maybeSingle();
  if (error) {
    log.warn('assertOwnsRow query error', { table, error: error.message });
    return null;
  }
  return (data as T | null) ?? null;
}

/** 요청 body의 broker 식별자가 있으면 ctx와 일치하는 값만 허용 (불일치는 무시하고 ctx 사용을 권장). */
export function brokerKeyMatches(ctx: BrokerCtx, candidate: unknown): boolean {
  return typeof candidate === 'string' && ctx.brokerKeys.includes(candidate);
}
