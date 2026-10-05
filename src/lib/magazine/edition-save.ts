/**
 * src/lib/magazine/edition-save.ts — 에디션 저장 모델 순수 로직 (E-01, E-02)
 *
 * 클라이언트·서버 공용(노드 전용 import 금지).
 *  - 에디터 폼 ↔ magazine_editions(컬럼 + content=EditionContentV1) 변환
 *  - 변경 감지용 서명(signature), 자동저장 상수
 *  - 발행 직전 정규화(normalizeContentForPublish) + parseEditionContent 검증
 *  - 뉴스 6개 상한, 섹션 on/off, 설문 intent, 세그먼트 계약
 *
 * 임시저장은 magazine_editions 에만 쓴다. 공개 행(magazine_issues)은 발행 엔드포인트만 기록한다.
 */
import type { BrokerFieldNote } from '@/domain/magazine/types';
import { parseEditionContent } from '@/domain/magazine/edition-content.schema';

// ── 상수 ───────────────────────────────────────────────────────────
/** 입력 후 이 시간 동안 추가 입력이 없으면 저장 (debounce) */
export const AUTOSAVE_DEBOUNCE_MS = 3_000;
/** 변경분이 있을 때만 이 주기로 재시도/저장 */
export const AUTOSAVE_INTERVAL_MS = 30_000;
/** 뉴스 큐레이션 최대 선택 수 (T1-14a) */
export const MAX_NEWS_SELECTION = 6;
export const DEFAULT_THEME_COLOR = '#6366f1';
export const DEFAULT_SECTION_ORDER = [
  'ai_briefing',
  'field_note',
  'theme_of_week',
  'featured_deals',
  'poll',
  'market_data',
  'news_curation',
  'tax_clinic',
  'auction_picks',
  'sentiment_index',
  'roi_calculator',
  'referral',
] as const;

export type TargetSegment = 'all' | 'buyer' | 'seller';
export const TARGET_SEGMENTS: readonly { value: TargetSegment; label: string; help: string }[] = [
  { value: 'all', label: '전체 구독자', help: '모든 수신 동의 구독자에게 발송합니다.' },
  { value: 'buyer', label: '매수 관심', help: '매수 관심 구독자에게 발송합니다.' },
  { value: 'seller', label: '매도 관심', help: '매도 관심 구독자에게 발송합니다.' },
];

export type PollIntent = 'seller' | 'buyer' | 'neutral';
export interface PollOptionForm {
  label: string;
  intent?: PollIntent;
}

export interface EditorForm {
  headline: string;
  briefing: string;
  marketTemp: string | null;
  coverKeywords: string[];
  coverImageUrl: string | null;
  fieldNote: BrokerFieldNote;
  themeTitle: string;
  themeBodyMd: string;
  themeColor: string;
  selectedDealIds: string[];
  /** 뉴스 선택 id(순서 유지) */
  selectedNewsIds: string[];
  /** 선택된 뉴스/딜의 스냅샷(콘텐츠에 저장되는 값) */
  topNews: Array<Record<string, unknown>>;
  dealHighlights: Array<Record<string, unknown>>;
  pollQuestion: string;
  pollOptions: PollOptionForm[];
  taxQuestion: string;
  taxAnswer: string;
  taxSource: string;
  sectionOrder: string[];
  /** id → enabled (없으면 true) */
  sectionsEnabled: Record<string, boolean>;
  targetSegment: TargetSegment;
}

export const EMPTY_FIELD_NOTE: BrokerFieldNote = {
  question: '',
  buyerReaction: '',
  sellerReaction: '',
  marketJudgment: '',
  comment: '',
};

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 4;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function recArr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter(isRecord) : [];
}

// ── 뉴스 선택 ──────────────────────────────────────────────────────
/** 선택 토글. 7번째 선택은 거부하고 이유를 돌려준다 (T1-14a). */
export function toggleNewsSelection(
  current: readonly string[],
  id: string,
  max: number = MAX_NEWS_SELECTION,
): { next: string[]; rejected: boolean } {
  if (current.includes(id)) return { next: current.filter((x) => x !== id), rejected: false };
  if (current.length >= max) return { next: [...current], rejected: true };
  return { next: [...current, id], rejected: false };
}

// ── 설문 ───────────────────────────────────────────────────────────
/** 유효한 선택지(비어있지 않은 라벨)만. */
export function cleanPollOptions(options: readonly PollOptionForm[]): PollOptionForm[] {
  return options
    .map((o) => ({ label: o.label.trim(), ...(o.intent ? { intent: o.intent } : {}) }))
    .filter((o) => o.label.length > 0)
    .slice(0, MAX_POLL_OPTIONS);
}

/** 저장 콘텐츠의 poll → 에디터 폼 선택지. options[] 우선, 없으면 choices[]. */
export function pollOptionsFromContent(poll: unknown): PollOptionForm[] {
  if (!isRecord(poll)) return [];
  if (Array.isArray(poll.options)) {
    return poll.options.filter(isRecord).map((o) => {
      const intent = o.intent === 'seller' || o.intent === 'buyer' || o.intent === 'neutral' ? o.intent : undefined;
      return { label: str(o.label), ...(intent ? { intent } : {}) };
    });
  }
  if (Array.isArray(poll.choices)) return poll.choices.filter((c): c is string => typeof c === 'string').map((label) => ({ label }));
  return [];
}

// ── 섹션 on/off ────────────────────────────────────────────────────
export function sectionsFromContent(content: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (Array.isArray(content.sections)) {
    for (const s of content.sections) {
      if (isRecord(s) && typeof s.id === 'string' && typeof s.enabled === 'boolean') out[s.id] = s.enabled;
    }
  }
  return out;
}

export function buildSectionToggles(
  order: readonly string[],
  enabled: Record<string, boolean>,
): Array<{ id: string; enabled: boolean }> {
  return order.map((id) => ({ id, enabled: enabled[id] !== false }));
}

/** 정규화된 section_order: 알려진 섹션 전체를 포함(누락 보충) + 알 수 없는 id 제거 */
export function normalizeSectionOrder(order: unknown): string[] {
  const known = new Set<string>(DEFAULT_SECTION_ORDER);
  const given = Array.isArray(order) ? order.filter((x): x is string => typeof x === 'string' && known.has(x)) : [];
  const seen = new Set(given);
  const rest = DEFAULT_SECTION_ORDER.filter((id) => !seen.has(id));
  return [...Array.from(new Set(given)), ...rest];
}

// ── 폼 → 컨텐츠 ────────────────────────────────────────────────────
/**
 * 에디터 폼을 base(content) 위에 얹어 저장용 content 를 만든다.
 *  - base 의 생성기 필드(broker/generation/sentiment/recentTransactions …)는 보존한다.
 *  - 비어 있는 poll/tax/news/deals 는 키 자체를 삭제한다(뷰어가 폴백 콘텐츠를 만들지 않고 섹션 숨김, T3-24).
 *  - 생성기 형태의 tax_clinic(title 보유)은 에디터가 직접 입력하지 않았다면 유지한다(섹션 숨김은 sections[].enabled 로).
 */
export function buildContentFromForm(
  base: Record<string, unknown> | null | undefined,
  form: EditorForm,
): Record<string, unknown> {
  const content: Record<string, unknown> = { ...(isRecord(base) ? base : {}) };

  content.headline = form.headline;
  content.briefing = form.briefing;
  content.ai_briefing = form.briefing;
  content.market_temp = form.marketTemp;
  content.cover_keywords = form.coverKeywords.map((k) => k.trim()).filter(Boolean);
  content.cover_image_url = form.coverImageUrl;
  content.field_note = form.fieldNote;
  content.theme_title = form.themeTitle;
  content.theme_body_md = form.themeBodyMd;
  content.theme_color = form.themeColor;
  content.themeColor = form.themeColor; // 뷰어 하위호환 별칭
  content.featured_deal_ids = [...form.selectedDealIds];
  content.selected_news_ids = [...form.selectedNewsIds];

  if (form.topNews.length > 0) content.topNews = form.topNews;
  else delete content.topNews;
  if (form.dealHighlights.length > 0) content.dealHighlights = form.dealHighlights;
  else delete content.dealHighlights;

  const options = cleanPollOptions(form.pollOptions);
  if (form.pollQuestion.trim() && options.length >= MIN_POLL_OPTIONS) {
    content.poll = {
      question: form.pollQuestion.trim(),
      choices: options.map((o) => o.label),
      options,
    };
  } else {
    delete content.poll;
  }

  if (form.taxQuestion.trim() && form.taxAnswer.trim()) {
    content.tax_clinic = {
      question: form.taxQuestion.trim(),
      answer: form.taxAnswer.trim(),
      ...(form.taxSource.trim() ? { source: form.taxSource.trim() } : {}),
    };
  } else if (isRecord(content.tax_clinic) && typeof content.tax_clinic.question === 'string') {
    // 이전에 직접 입력했던 Q/A 를 비운 경우 → 섹션 제거. (생성기 형태는 유지)
    delete content.tax_clinic;
  }

  content.section_order = normalizeSectionOrder(form.sectionOrder);
  content.sections = buildSectionToggles(content.section_order as string[], form.sectionsEnabled);
  content.target_segment = form.targetSegment;
  return content;
}

// ── 에디션 행 → 폼 ─────────────────────────────────────────────────
export interface EditionRow {
  id: string;
  broker_id?: string;
  edition_type?: string;
  edition_label?: string;
  status?: string;
  title?: string | null;
  market_temp?: string | null;
  cover_keywords?: string[] | null;
  cover_image_url?: string | null;
  field_note?: unknown;
  theme_title?: string | null;
  theme_body_md?: string | null;
  theme_color?: string | null;
  featured_deal_ids?: string[] | null;
  target_segments?: string[] | null;
  content?: unknown;
  published_at?: string | null;
  updated_at?: string | null;
}

function toSegment(v: unknown): TargetSegment {
  return v === 'buyer' || v === 'seller' || v === 'all' ? v : 'all';
}

function toFieldNote(v: unknown): BrokerFieldNote {
  if (!isRecord(v)) return { ...EMPTY_FIELD_NOTE };
  return {
    question: str(v.question),
    buyerReaction: str(v.buyerReaction),
    sellerReaction: str(v.sellerReaction),
    marketJudgment: str(v.marketJudgment),
    comment: str(v.comment),
  };
}

/**
 * 저장된 에디션을 에디터 폼으로 복원한다. 컬럼 값이 있으면 컬럼, 없으면 content 값을 쓴다(전 필드 복원, T1-09).
 */
export function formFromEdition(row: EditionRow): EditorForm {
  const content = isRecord(row.content) ? row.content : {};
  const taxRaw = isRecord(content.tax_clinic) ? content.tax_clinic : null;
  const topNews = recArr(content.topNews);
  const savedNewsIds = Array.isArray(content.selected_news_ids)
    ? content.selected_news_ids.filter((x): x is string => typeof x === 'string')
    : topNews.map((n) => (typeof n.id === 'string' ? n.id : str(n.title))).filter(Boolean);

  const fieldNoteSrc =
    isRecord(row.field_note) && Object.keys(row.field_note).length > 0 ? row.field_note : content.field_note;

  const keywords = (row.cover_keywords && row.cover_keywords.length ? row.cover_keywords : (content.cover_keywords as unknown)) as unknown;
  const kw = Array.isArray(keywords) ? keywords.filter((k): k is string => typeof k === 'string') : [];

  const dealIds =
    row.featured_deal_ids && row.featured_deal_ids.length
      ? row.featured_deal_ids
      : Array.isArray(content.featured_deal_ids)
        ? content.featured_deal_ids.filter((x): x is string => typeof x === 'string')
        : [];

  return {
    headline: str(content.headline) || str(row.title),
    briefing: str(content.briefing) || str(content.ai_briefing),
    marketTemp: strOrNull(row.market_temp) ?? strOrNull(content.market_temp),
    coverKeywords: [...kw, '', '', ''].slice(0, 3),
    coverImageUrl: strOrNull(row.cover_image_url) ?? strOrNull(content.cover_image_url),
    fieldNote: toFieldNote(fieldNoteSrc),
    themeTitle: str(row.theme_title) || str(content.theme_title),
    themeBodyMd: str(row.theme_body_md) || str(content.theme_body_md),
    themeColor: strOrNull(row.theme_color) ?? strOrNull(content.theme_color) ?? DEFAULT_THEME_COLOR,
    selectedDealIds: [...dealIds],
    selectedNewsIds: savedNewsIds,
    topNews,
    dealHighlights: recArr(content.dealHighlights),
    pollQuestion: isRecord(content.poll) ? str(content.poll.question) : '',
    pollOptions: pollOptionsFromContent(content.poll),
    taxQuestion: taxRaw ? str(taxRaw.question) : '',
    taxAnswer: taxRaw ? str(taxRaw.answer) : '',
    taxSource: taxRaw ? str(taxRaw.source) : '',
    sectionOrder: normalizeSectionOrder(content.section_order),
    sectionsEnabled: sectionsFromContent(content),
    targetSegment: toSegment(
      content.target_segment ?? (Array.isArray(row.target_segments) ? row.target_segments[0] : undefined),
    ),
  };
}

// ── 저장 payload / 변경 감지 ───────────────────────────────────────
export interface EditionPatchPayload {
  title: string;
  market_temp: string | null;
  cover_keywords: string[];
  cover_image_url: string | null;
  field_note: BrokerFieldNote;
  theme_title: string;
  theme_body_md: string;
  featured_deal_ids: string[];
  theme_color: string;
  target_segments: TargetSegment[];
  content: Record<string, unknown>;
}

export function buildPatchPayload(base: Record<string, unknown> | null | undefined, form: EditorForm): EditionPatchPayload {
  const content = buildContentFromForm(base, form);
  return {
    title: form.headline,
    market_temp: form.marketTemp,
    cover_keywords: content.cover_keywords as string[],
    cover_image_url: form.coverImageUrl,
    field_note: form.fieldNote,
    theme_title: form.themeTitle,
    theme_body_md: form.themeBodyMd,
    featured_deal_ids: [...form.selectedDealIds],
    theme_color: form.themeColor,
    target_segments: [form.targetSegment],
    content,
  };
}

/** 변경 감지 서명 — 폼의 의미 있는 값만(선택 스냅샷 포함). 같은 값이면 같은 문자열. */
export function formSignature(form: EditorForm): string {
  return JSON.stringify([
    form.headline,
    form.briefing,
    form.marketTemp,
    form.coverKeywords,
    form.coverImageUrl,
    form.fieldNote,
    form.themeTitle,
    form.themeBodyMd,
    form.themeColor,
    form.selectedDealIds,
    form.selectedNewsIds,
    form.pollQuestion,
    form.pollOptions,
    form.taxQuestion,
    form.taxAnswer,
    form.taxSource,
    form.sectionOrder,
    Object.entries(form.sectionsEnabled).sort(([a], [b]) => a.localeCompare(b)),
    form.targetSegment,
  ]);
}

// ── 저장 에러 분류 ─────────────────────────────────────────────────
export type SaveFailureKind = 'conflict' | 'locked' | 'auth' | 'invalid' | 'server' | 'network';

export function classifySaveFailure(status: number, code: string | null): SaveFailureKind {
  if (status === 0) return 'network';
  if (code === 'EDIT_CONFLICT') return 'conflict';
  if (code === 'PUBLISHED_LOCKED') return 'locked';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 422) return 'invalid';
  return 'server';
}

export const SAVE_FAILURE_MESSAGES: Record<SaveFailureKind, string> = {
  conflict: '다른 탭이나 기기에서 이 매거진이 수정되었습니다. 새로고침하거나 내 변경으로 덮어쓸 수 있습니다.',
  locked: '이미 발행된 호수입니다. 수정하려면 정정 발행을 이용해 주세요.',
  auth: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  invalid: '입력값을 확인해 주세요. 저장되지 않았습니다.',
  server: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  network: '네트워크 연결을 확인해 주세요. 저장되지 않았습니다.',
};

// ── 발행: 정규화 + 검증 ────────────────────────────────────────────
export interface PublishBrokerIdentity {
  name: string;
  slug: string;
  company: string;
  phone: string;
  photoUrl: string | null;
  tagline: string;
  specialtyRegions: string[];
  specialtyAssets: string[];
}

export interface NormalizeForPublishInput {
  content: unknown;
  broker: PublishBrokerIdentity;
  kind: 'weekly' | 'special' | 'daily';
  issueDate: string;
  weekLabel?: string;
  nowIso: string;
  themeColor?: string | null;
}

export type NormalizeForPublishResult =
  | { ok: true; content: Record<string, unknown> }
  | { ok: false; code: 'EMPTY_HEADLINE' | 'EMPTY_BODY' | 'MOCK_CONTENT' | 'INVALID_CONTENT'; issues: string[] };

const MARKET_TEMPS = ['적극 매수', '선별 매수', '관망', '조정 대기', '위기 경계'];

/**
 * 발행 직전 content 를 EditionContentV1 로 정규화한다.
 * - broker 는 항상 서버(프로필) 값으로 덮는다. 클라이언트 값 불신.
 * - 필수 필드의 빈 기본값만 채운다(가짜 수치 생성 없음). Mock 생성물은 거부.
 */
export function normalizeContentForPublish(input: NormalizeForPublishInput): NormalizeForPublishResult {
  const src = isRecord(input.content) ? input.content : {};

  const gen = isRecord(src.generation) ? src.generation : null;
  if (gen && gen.isMock === true) {
    return { ok: false, code: 'MOCK_CONTENT', issues: ['Mock(모의) 생성 콘텐츠는 발행할 수 없습니다.'] };
  }

  const headline = str(src.headline).trim();
  if (!headline) return { ok: false, code: 'EMPTY_HEADLINE', issues: ['헤드라인을 입력해 주세요.'] };
  const briefing = str(src.briefing).trim() || str(src.ai_briefing).trim();
  const fn = isRecord(src.field_note) ? Object.values(src.field_note).some((v) => typeof v === 'string' && v.trim()) : false;
  if (!briefing && !str(src.theme_body_md).trim() && !fn) {
    return { ok: false, code: 'EMPTY_BODY', issues: ['브리핑·필드노트·테마 중 하나 이상의 본문을 작성해 주세요.'] };
  }

  const prevBroker = isRecord(src.broker) ? src.broker : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const normalized: Record<string, unknown> = {
    ...src,
    schemaVersion: 1,
    kind: input.kind,
    issueDate: input.issueDate,
    ...(input.weekLabel ? { weekLabel: input.weekLabel } : {}),
    headline,
    briefing,
    ai_briefing: briefing,
    broker: {
      ...input.broker,
      totalDeals: num(prevBroker.totalDeals),
      activeDeals: num(prevBroker.activeDeals),
    },
    market_temp: typeof src.market_temp === 'string' && MARKET_TEMPS.includes(src.market_temp) ? src.market_temp : null,
    cover_keywords: Array.isArray(src.cover_keywords) ? src.cover_keywords.filter((k) => typeof k === 'string') : [],
    cover_image_url: strOrNull(src.cover_image_url),
    theme_title: str(src.theme_title),
    theme_body_md: str(src.theme_body_md),
    theme_asset_types: Array.isArray(src.theme_asset_types) ? src.theme_asset_types.filter((k) => typeof k === 'string') : [],
    featured_deal_ids: Array.isArray(src.featured_deal_ids) ? src.featured_deal_ids.filter((k) => typeof k === 'string') : [],
    theme_color: strOrNull(src.theme_color) ?? input.themeColor ?? DEFAULT_THEME_COLOR,
    generation:
      gen && typeof gen.generatedAt === 'string'
        ? gen
        : {
            model: null,
            isMock: false,
            totalTokens: 0,
            llmCalls: 0,
            generatedAt: input.nowIso,
            qualityGate: null,
            sources: {},
            sourceErrors: [],
          },
  };

  const parsed = parseEditionContent(normalized);
  if (!parsed.ok) {
    return { ok: false, code: 'INVALID_CONTENT', issues: parsed.issues.slice(0, 8) };
  }
  // 파싱된(알 수 없는 키 보존) 결과를 반환
  return { ok: true, content: parsed.data as unknown as Record<string, unknown> };
}

/** 품질 게이트 불합격 여부(생성물). 에디터 직접 작성물은 qualityGate 가 없으므로 false. */
export function needsQualityReview(content: unknown, status: string | null | undefined): boolean {
  if (status === 'needs_review') return true;
  const gen = isRecord(content) && isRecord(content.generation) ? content.generation : null;
  const qg = gen && isRecord(gen.qualityGate) ? gen.qualityGate : null;
  return !!qg && qg.passed === false;
}

// ── 발행 요약(확인 모달) ───────────────────────────────────────────
export interface PublishSummaryInput {
  issueDate: string;
  targetSegment: TargetSegment;
  subscriberCount: number | null;
  sendEnabled: boolean | null;
  correction: boolean;
}

export interface PublishSummary {
  dateLabel: string;
  segmentLabel: string;
  recipientText: string;
  sendText: string;
  title: string;
}

export function buildPublishSummary(i: PublishSummaryInput): PublishSummary {
  const seg = TARGET_SEGMENTS.find((s) => s.value === i.targetSegment) ?? TARGET_SEGMENTS[0];
  const recipientText =
    i.subscriberCount === null
      ? '확인 중'
      : i.targetSegment === 'all'
        ? `${i.subscriberCount}명`
        : `전체 ${i.subscriberCount}명 중 ${seg.label} 구독자`;
  const sendText =
    i.sendEnabled === null
      ? '확인 중'
      : i.sendEnabled
        ? '발행 직후 구독자에게 발송됩니다'
        : '발행만 되고 구독자 발송은 중지 상태입니다(관리자 설정)';
  return {
    dateLabel: i.issueDate,
    segmentLabel: seg.label,
    recipientText,
    sendText,
    title: i.correction ? '정정 발행 확인' : '발행 확인',
  };
}

/** 발송 응답({success:false, blocked:'SEND_DISABLED'}) → 정직한 안내 문구 */
export function describeDistributeOutcome(res: unknown): { kind: 'sent' | 'blocked' | 'failed'; message: string } {
  if (!isRecord(res)) return { kind: 'failed', message: '발행은 완료되었지만 발송 결과를 확인하지 못했습니다.' };
  if (res.success === false && typeof res.blocked === 'string') {
    if (res.blocked === 'SEND_DISABLED') {
      return { kind: 'blocked', message: '발행은 완료되었습니다. 발송은 중지 상태입니다(관리자 설정).' };
    }
    return { kind: 'blocked', message: `발행은 완료되었습니다. 발송은 차단되었습니다(${res.blocked}).` };
  }
  if (res.success === false) {
    return { kind: 'failed', message: '발행은 완료되었지만 발송 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  const sent = isRecord(res.result) && typeof res.result.sentCount === 'number' ? res.result.sentCount : null;
  return { kind: 'sent', message: sent === null ? '발행 및 발송 요청이 완료되었습니다.' : `발행 완료 · ${sent}명에게 발송했습니다.` };
}
