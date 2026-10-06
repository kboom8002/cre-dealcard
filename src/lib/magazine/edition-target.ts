/**
 * @module edition-target
 * @description 열람 이벤트의 `edition_id` 해석 (공개 analytics 라우트 전용).
 *
 * 공개 뷰어는 아직 `magazine_issues.id`(레거시 발행본)를 edition_id 자리에 보내는 경로가 있다(`data.id = content.id ?? issue.id`).
 * 정책 (D2-25 '이벤트는 호수에 연결' 원칙과 공존):
 *   1) `magazine_editions.id` 로 존재 → 그 에디션 (draft 면 호출부가 NOT_PUBLISHED 처리)
 *   2) `magazine_issues.id` 로 존재 → 그 호의 (broker, issue_date) 로 **발행된 에디션**을 찾는다
 *      (edition_label = 날짜, 또는 published_at 의 KST 날짜 = 날짜 — 뷰어 findIssueForDate 와 같은 규칙) → 있으면 그 에디션에 정상 기록
 *   3) 에디션이 아직 없는 레거시 호 → edition_id **NULL** 로 기록하고 `metadata.legacy_issue_id`/`legacy_issue_date` 를 남긴다.
 *      집계(대시보드)는 `edition_id IN (내 에디션)` 만 읽으므로 NULL 행은 에디션 지표에 섞이지 않는다 — 버리지 않고 구분해 보존.
 *   4) 둘 다 없으면 not_found (호출부 404)
 * DB 오류는 not_found 로 위장하지 않고 error 로 돌려준다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBroker } from '@/lib/magazine/resolve-broker';

export interface EditionRef {
  id: string;
  broker_id: string;
  status: string | null;
}

export interface LegacyIssueRef {
  issueId: string;
  issueDate: string;
  brokerKey: string;
  content: Record<string, unknown> | null;
}

export type EventTarget =
  | { kind: 'edition'; edition: EditionRef; viaIssueId: string | null }
  | { kind: 'legacy_issue'; issue: LegacyIssueRef }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** magazine_issues 테이블이 없는 환경(42P01/PGRST205)은 '레거시 호 없음' 으로 본다. */
function isMissingTable(err: { code?: string } | null): boolean {
  return err?.code === '42P01' || err?.code === 'PGRST205';
}

export async function resolveEventTarget(supabase: SupabaseClient, id: string): Promise<EventTarget> {
  // 1) edition uuid 우선
  const ed = await supabase.from('magazine_editions').select('id, broker_id, status').eq('id', id).maybeSingle();
  if (ed.error) return { kind: 'error', message: `edition lookup: ${ed.error.message}` };
  if (ed.data) return { kind: 'edition', edition: ed.data as EditionRef, viaIssueId: null };

  // 2) 레거시 issue id
  const is = await supabase
    .from('magazine_issues')
    .select('id, broker_id, issue_date, content')
    .eq('id', id)
    .maybeSingle();
  if (is.error) {
    if (isMissingTable(is.error)) return { kind: 'not_found' };
    return { kind: 'error', message: `issue lookup: ${is.error.message}` };
  }
  if (!is.data) return { kind: 'not_found' };

  const issue = is.data as { id: string; broker_id: string; issue_date: string | null; content: unknown };
  const issueDate = typeof issue.issue_date === 'string' ? issue.issue_date.slice(0, 10) : '';
  const brokerRaw = String(issue.broker_id);

  if (DATE_RE.test(issueDate)) {
    const broker = await resolveBroker(supabase, brokerRaw);
    const keys = Array.from(new Set([brokerRaw, broker?.userId, broker?.slug].filter((k): k is string => !!k)));

    const byLabel = await supabase
      .from('magazine_editions')
      .select('id, broker_id, status')
      .in('broker_id', keys)
      .eq('status', 'published')
      .eq('edition_label', issueDate)
      .order('published_at', { ascending: false })
      .limit(1);
    if (byLabel.error) return { kind: 'error', message: `edition by label: ${byLabel.error.message}` };
    if (byLabel.data?.[0]) return { kind: 'edition', edition: byLabel.data[0] as EditionRef, viaIssueId: issue.id };

    const start = new Date(`${issueDate}T00:00:00+09:00`);
    if (Number.isFinite(start.getTime())) {
      const byPublished = await supabase
        .from('magazine_editions')
        .select('id, broker_id, status')
        .in('broker_id', keys)
        .eq('status', 'published')
        .gte('published_at', start.toISOString())
        .lt('published_at', new Date(start.getTime() + DAY_MS).toISOString())
        .order('published_at', { ascending: false })
        .limit(1);
      if (byPublished.error) return { kind: 'error', message: `edition by published_at: ${byPublished.error.message}` };
      if (byPublished.data?.[0]) {
        return { kind: 'edition', edition: byPublished.data[0] as EditionRef, viaIssueId: issue.id };
      }
    }
  }

  // 3) 에디션 없는 레거시 호
  return {
    kind: 'legacy_issue',
    issue: {
      issueId: issue.id,
      issueDate,
      brokerKey: brokerRaw,
      content: issue.content && typeof issue.content === 'object' ? (issue.content as Record<string, unknown>) : null,
    },
  };
}
