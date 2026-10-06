/**
 * src/lib/magazine/get-published-issue.ts — 공개 매거진 발행본 조회 (읽기 전용, D2-01/D2-05)
 *
 * GET /api/magazine/[brokerId] 가 사용한다. 조회만 하며 LLM 호출·insert·upsert 를 절대 하지 않는다.
 * - broker 형식 오류/미존재 → broker_not_found (DB 오류는 throw → 호출부 500)
 * - 날짜 형식/실존 오류 → invalid_date, 오늘(KST) 이후 → future_date
 * - 정확한 날짜의 발행본만 반환. 없으면 not_published (최신본으로 폴백하지 않음, T3-08)
 * - 발행본: magazine_issues(공개 행) 또는 magazine_editions(status=published). draft/needs_review 콘텐츠는 노출하지 않는다.
 * - 정확한 지번이 있는 address 필드는 응답 직전에 마스킹한다(DB 원본 보존).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isFutureDateKst, parseIssueDate } from '@/lib/magazine/kst';
import { resolveBroker, type ResolvedBroker } from '@/lib/magazine/resolve-broker';
import {
  findIssueForDate, isUnpublishedContent, maskPublicAddresses, type MagazineContent,
} from '@/lib/magazine/public-page-data';

export type PublishedIssueResult =
  | { kind: 'ok'; date: string; broker: ResolvedBroker; data: MagazineContent }
  | { kind: 'invalid_date' }
  | { kind: 'future_date' }
  | { kind: 'broker_not_found' }
  | { kind: 'not_published' };

/** content 가 초안/검수대기로 표시되어 있으면 true — 공개하지 않는다. (구현은 public-page-data 의 단일 판정) */
export { isUnpublishedContent };

/** 공개 응답용 정제 — 지번 마스킹(복사본 반환). */
export function maskIssueForPublic(content: MagazineContent): MagazineContent {
  return maskPublicAddresses(content);
}

export async function getPublishedIssue(
  supabase: SupabaseClient,
  brokerParam: string,
  date: string,
  now: Date = new Date(),
): Promise<PublishedIssueResult> {
  if (!parseIssueDate(date)) return { kind: 'invalid_date' };
  if (isFutureDateKst(date, now)) return { kind: 'future_date' };

  const broker = await resolveBroker(supabase, brokerParam);
  if (!broker) return { kind: 'broker_not_found' };

  const content = await findIssueForDate(supabase, { user_id: broker.userId, slug: broker.slug }, date);
  if (!content || isUnpublishedContent(content)) return { kind: 'not_published' };

  return { kind: 'ok', date, broker, data: maskIssueForPublic(content) };
}
