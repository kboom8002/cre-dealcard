/**
 * src/lib/magazine/poll-helpers.ts — 매거진 설문 순수 함수 (P0-05 T3-01, T3-SEC-2, T3-12)
 * 클라이언트·서버 공용 (node 전용 모듈 import 금지).
 */

/** 결과 노출 최소 응답 수. 이보다 적으면 서버가 집계를 돌려주지 않는다(소표본 노출·가짜 인상 방지). */
export const MIN_POLL_RESULTS = 5;

/** DB check (choice between 0 and 5) 와 동일한 범위. */
export const MAX_POLL_CHOICE_INDEX = 5;

export interface PollResults {
  total: number;
  counts: Record<number, number>;
}

/** choice 는 0..5 의 정수만 허용. 문자열 "1" 등은 거부(신뢰 경계). */
export function parsePollChoice(raw: unknown, optionCount?: number): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw > MAX_POLL_CHOICE_INDEX) return null;
  if (typeof optionCount === 'number' && optionCount > 0 && raw >= optionCount) return null;
  return raw;
}

/** visitor_id sanitize: 영숫자/-/_ 8~64자만. 아니면 null. */
export function sanitizeVisitorId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

interface PollLike {
  choices?: unknown;
  options?: unknown;
}

/** poll 의 선택지 개수 (options[] 우선, 없으면 choices[]). 알 수 없으면 0. */
export function pollOptionCount(poll: PollLike | null | undefined): number {
  if (!poll) return 0;
  if (Array.isArray(poll.options)) return poll.options.length;
  if (Array.isArray(poll.choices)) return poll.choices.length;
  return 0;
}

/**
 * 'seller' 판정은 선택지 index 가 아니라 poll.options[idx].intent 메타로 한다.
 * 메타가 없으면 항상 false (선택지 순서를 바꿔도 판정 불변).
 */
export function isSellerChoice(poll: PollLike | null | undefined, choice: number): boolean {
  if (!poll || !Array.isArray(poll.options)) return false;
  const opt = poll.options[choice] as { intent?: unknown } | undefined;
  return !!opt && opt.intent === 'seller';
}

/** 서버가 돌려준 집계를 화면에 표시해도 되는지 (실제 집계 + 최소 표본). */
export function shouldShowPollResults(results: PollResults | null | undefined): results is PollResults {
  return !!results && Number.isFinite(results.total) && results.total >= MIN_POLL_RESULTS;
}

/** 화면 표시용 퍼센트. 표시 불가한 집계면 null. */
export function pollPercent(results: PollResults | null | undefined, idx: number): number | null {
  if (!shouldShowPollResults(results)) return null;
  const n = results.counts[idx] ?? 0;
  return Math.round((n / results.total) * 100);
}

/** 테이블 미적용/스키마 불일치 에러 코드 (PostgREST/Postgres). */
export function isMissingRelationError(err: { code?: string | null } | null | undefined): boolean {
  const c = err?.code ?? '';
  return c === '42P01' || c === 'PGRST205' || c === '42703' || c === 'PGRST204';
}

/** unique 위반 (이미 투표함). */
export function isUniqueViolation(err: { code?: string | null } | null | undefined): boolean {
  return (err?.code ?? '') === '23505';
}

// ─────────────────────────────────────────────────────────────
// 뷰어용 설문 정규화 (E-03: 기본 설문 하드코딩 금지 · intent 메타 분류)
// ─────────────────────────────────────────────────────────────

/** DB check(choice 0..5) 와 같은 최대 선택지 수. */
export const MAX_POLL_OPTIONS = MAX_POLL_CHOICE_INDEX + 1;

export type PollIntent = 'seller' | 'buyer' | 'neutral';

export interface PollOptionView {
  label: string;
  /** 선택지 메타. 없으면 null (순서·문구로 추정하지 않는다). */
  intent: PollIntent | null;
}

export interface PollView {
  question: string;
  options: PollOptionView[];
}

function toIntent(v: unknown): PollIntent | null {
  return v === 'seller' || v === 'buyer' || v === 'neutral' ? v : null;
}

/**
 * 에디션 `poll` → 화면용. 질문이 없거나 선택지가 2개 미만이면 null(섹션 숨김, 폴백 설문 생성 금지 T1-19/T3-24).
 * `options[]`(label/intent) 우선, 없으면 `choices[]`(문자열). 선택지는 최대 6개.
 */
export function normalizePoll(poll: unknown): PollView | null {
  if (!poll || typeof poll !== 'object') return null;
  const p = poll as { question?: unknown; options?: unknown; choices?: unknown };
  const question = typeof p.question === 'string' ? p.question.trim() : '';
  if (!question) return null;

  let options: PollOptionView[] = [];
  if (Array.isArray(p.options)) {
    options = p.options
      .map((o): PollOptionView | null => {
        if (typeof o === 'string') return o.trim() ? { label: o.trim(), intent: null } : null;
        if (o && typeof o === 'object') {
          const label = String((o as { label?: unknown }).label ?? '').trim();
          return label ? { label, intent: toIntent((o as { intent?: unknown }).intent) } : null;
        }
        return null;
      })
      .filter((o): o is PollOptionView => o !== null);
  } else if (Array.isArray(p.choices)) {
    options = p.choices
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .map((label) => ({ label, intent: null }));
  }
  options = options.slice(0, MAX_POLL_OPTIONS);
  if (options.length < 2) return null;
  return { question, options };
}

/** localStorage 에 저장된 내 선택 복원: 정수이고 선택지 범위 안(또는 -1=이미 응답)일 때만. */
export function parseStoredPollChoice(stored: string | null, optionCount: number): number | null {
  if (stored === null || stored.trim() === '') return null;
  const n = Number(stored);
  if (!Number.isInteger(n)) return null;
  if (n === -1) return -1;
  return n >= 0 && n < optionCount ? n : null;
}

export function pollStorageKey(brokerId: string, date: string): string {
  return `cre_poll_${brokerId}_${date}`;
}
