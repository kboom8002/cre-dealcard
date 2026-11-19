/**
 * src/lib/magazine/opt-in-sender.ts — 구독 확인(DOI) 메일의 발신자 표시 정보 (WP-7.3B P2-6)
 *
 * 공개 구독(`/api/public/magazine/subscribe`)과 같은 규칙으로 broker 표시명·연락처를 만든다:
 *  - brokerName   : profiles.display_name (없으면 null — 가짜 기본값 금지)
 *  - brokerContact: [profiles.company, profiles.phone] 를 ' · ' 로 결합 (없으면 null)
 * 조회 실패는 DOI 발송을 막지 않는다(표시 정보만 비움).
 */
import { createModuleLogger } from '@/lib/logger';
import { isUuid } from './slug';

const log = createModuleLogger('magazine-opt-in-sender');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from: (table: string) => any };

export interface OptInSenderIdentity {
  brokerName: string | null;
  brokerContact: string | null;
}

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

export async function loadOptInSenderIdentity(
  supabase: DbClient,
  brokerUserId: string | null | undefined,
  fallbackName?: string | null,
): Promise<OptInSenderIdentity> {
  const fallback = { brokerName: clean(fallbackName), brokerContact: null };
  if (!brokerUserId || !isUuid(brokerUserId)) return fallback;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, company, phone')
      .eq('id', brokerUserId)
      .maybeSingle();
    if (error) {
      log.warn('opt-in sender profile lookup failed', { code: (error as { code?: string }).code });
      return fallback;
    }
    const row = (data ?? null) as { display_name?: unknown; company?: unknown; phone?: unknown } | null;
    const parts = [clean(row?.company), clean(row?.phone)].filter((x): x is string => !!x);
    return {
      brokerName: clean(row?.display_name) ?? fallback.brokerName,
      brokerContact: parts.length > 0 ? parts.join(' · ') : null,
    };
  } catch (err) {
    log.warn('opt-in sender profile lookup threw', { error: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
}
