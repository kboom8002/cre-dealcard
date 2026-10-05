/**
 * src/lib/magazine/resolve-broker.ts — 공개 매거진 broker 해석 단일 함수 (I-02, T2-06/S2-29)
 *
 * - slug 형식이면 `slug`로, uuid 형식이면 `user_id`로 **각각 별도 `.eq()` 쿼리**.
 * - `.or('slug.eq.X,user_id.eq.X')` 문자열 보간 금지(uuid 캐스팅 실패 22P02 / PostgREST 필터 주입 방지).
 * - 형식 불일치(예: `../`, `a,b`, `x)`)는 DB 호출 없이 null → 호출부가 notFound()/404 처리.
 * - DB 오류는 "없음"으로 위장하지 않고 throw한다(호출부가 500 처리).
 * - 반환 필드는 공개 가능한 것만(전화·이메일·면허번호 등 제외).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createModuleLogger } from '@/lib/logger';
import { SLUG_RE, isUuid } from './slug';

const log = createModuleLogger('magazine-resolve-broker');

export interface ResolvedBroker {
  userId: string;
  slug: string | null;
  displayName: string | null;
  photoUrl: string | null;
  company: string | null;
  tagline: string | null;
  bio: string | null;
  specialtyRegions: string[];
  specialtyAssets: string[];
  isPublic: boolean | null;
}

const BROKER_COLUMNS = 'user_id, slug, bio, specialty_regions, specialty_assets, is_public';
const PROFILE_COLUMNS = 'id, display_name, photo_url, company, tagline';

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function resolveBroker(
  supabase: SupabaseClient,
  slugOrId: string,
): Promise<ResolvedBroker | null> {
  if (typeof slugOrId !== 'string') return null;
  const param = slugOrId;
  const byUuid = isUuid(param);
  if (!byUuid && !SLUG_RE.test(param)) return null;

  const base = supabase.from('broker_profiles').select(BROKER_COLUMNS);
  const query = byUuid ? base.eq('user_id', param) : base.eq('slug', param);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`broker lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const userId = strOrNull(row.user_id);
  if (!userId) return null;

  let displayName: string | null = null;
  let photoUrl: string | null = null;
  let company: string | null = null;
  let tagline: string | null = null;
  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (profErr) {
    // 표시명 조회 실패는 브로커 존재 여부와 무관 — null로 두고(가짜 기본값 없음) 로그만 남긴다.
    log.warn('profiles lookup failed', { error: profErr.message });
  } else if (prof) {
    const p = prof as unknown as Record<string, unknown>;
    displayName = strOrNull(p.display_name);
    photoUrl = strOrNull(p.photo_url);
    company = strOrNull(p.company);
    tagline = strOrNull(p.tagline);
  }

  return {
    userId,
    slug: strOrNull(row.slug),
    displayName,
    photoUrl,
    company,
    tagline,
    bio: strOrNull(row.bio),
    specialtyRegions: strArr(row.specialty_regions),
    specialtyAssets: strArr(row.specialty_assets),
    isPublic: typeof row.is_public === 'boolean' ? row.is_public : null,
  };
}
