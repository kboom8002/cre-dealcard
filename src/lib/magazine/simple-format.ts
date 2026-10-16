/**
 * src/lib/magazine/simple-format.ts — 매거진 '간단 모드(골디락스 미니멈 포맷)' SSOT
 *
 * 사용자 결정 사항 (2026-10-16):
 *  1. 기본 모드: 전원 'simple' (단, ?mode=full, ?tab=..., 저장된 선호 'full', 또는 8탭 클릭 시 'full' 전환)
 *  2. 요약 생성 시점: 한마디 저장 시 자동 1회 생성 (+ 수동 재생성 버튼 병행, 실패 시 결정론적 폴백으로 발행 무차단)
 *  3. 투표(poll): 간단 포맷에서 제외
 *  4. 수익률 계산기(roi_calculator): 간단 포맷에 포함 (중개인 작업 0, 독자 체류 효과)
 *  5. 음성 입력: 2차 범위로 유보
 */

export type EditorMode = 'simple' | 'full';
export type EditionFormat = 'simple' | 'full';

/** 간단 모드 독자 노출 6개 핵심 섹션 (subscribe_cta, broker_profile 은 뷰어가 하단에 고정 부착) */
export const SIMPLE_SECTION_ORDER = [
  'ai_briefing',
  'field_note',
  'featured_deals',
  'market_data',
  'news_curation',
  'roi_calculator',
] as const;

/** 간단 모드에서 기본 비활성화되는 섹션 (단, 전체 모드에서 이미 작성된 데이터가 있으면 보존) */
export const SIMPLE_HIDDEN_SECTIONS = [
  'theme_of_week',
  'poll',
  'tax_clinic',
  'auction_picks',
  'reports',
  'sentiment_index',
  'referral',
] as const;

export const SIMPLE_NEWS_LIMIT = 3;
export const SIMPLE_DEAL_LIMIT = 3;
export const SIMPLE_NOTE_MIN = 10;
export const SIMPLE_NOTE_MAX = 300;

export interface StarterChip {
  id: string;
  label: string;
  template: string;
}

/** 60대 중개인이 빈 화면 앞에서 막히지 않도록 돕는 문장 시작 칩 3종 */
export const SIMPLE_STARTER_CHIPS: readonly StarterChip[] = [
  {
    id: 'inquiry_trend',
    label: '📞 이번 주 문의 분위기',
    template: '이번 주 현장에서는 실수요 매수 문의가 꾸준히 이어지고 있습니다. 특히 ',
  },
  {
    id: 'buyer_focus',
    label: '👀 요즘 매수자 관심사',
    template: '요즘 매수자분들이 가장 먼저 확인하시는 것은 안정적인 임대수익과 공실 위험입니다. ',
  },
  {
    id: 'owner_advice',
    label: '🏢 건물주분들께 한마디',
    template: '보유 건물의 임대차 재계약이나 매각 타이밍을 고민 중이시라면 편하게 연락 주시기 바랍니다. ',
  },
] as const;

export interface AutoFilledItem {
  id: string;
  icon: string;
  label: string;
  detail: string;
}

/** 중개인에게 "직접 안 써도 자동으로 들어간다"는 안심을 주는 항목 안내 */
export const SIMPLE_AUTO_FILLED_ITEMS: readonly AutoFilledItem[] = [
  {
    id: 'ai_briefing',
    icon: '✨',
    label: '이번 주 3줄 요약',
    detail: '작성하신 한마디와 매물·뉴스를 바탕으로 자동 정리됩니다.',
  },
  {
    id: 'market_data',
    icon: '📊',
    label: '시장 숫자',
    detail: '공공 실거래·임대 동향 데이터가 있을 때 자동으로 표시됩니다.',
  },
  {
    id: 'news_curation',
    icon: '📰',
    label: '이번 주 주요 뉴스 3건',
    detail: '중요도가 높은 상업용 부동산 뉴스 3건이 자동으로 실립니다.',
  },
  {
    id: 'roi_calculator',
    icon: '🧮',
    label: '수익률 계산기 & 상담 버튼',
    detail: '독자가 직접 수익률을 계산해보고 바로 전화·자료 요청을 할 수 있습니다.',
  },
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 기능 플래그: MAGAZINE_SIMPLE_MODE_ENABLED 가 명시적으로 'false' 일 때만 비활성화 (기본 true) */
export function isSimpleModeEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.MAGAZINE_SIMPLE_MODE_ENABLED === 'false') {
    return false;
  }
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MAGAZINE_SIMPLE_MODE_ENABLED === 'false') {
    return false;
  }
  return true;
}

export interface ResolveEditorModeInput {
  queryMode?: string | null;
  queryTab?: string | null;
  savedMode?: string | null;
  simpleModeEnabled?: boolean;
}

/**
 * 에디터 진입 모드 결정 순서:
 *  0. 기능 플래그가 꺼져 있으면 'full'
 *  1. URL ?mode=simple|full
 *  2. URL ?tab=... 이 명시된 경우(예: ?tab=outreach, ?tab=analytics) 해당 탭을 바로 열기 위해 'full'
 *  3. 저장된 사용자 선호(magazine_settings.editor_mode 또는 localStorage)
 *  4. 기본값: 전원 'simple' (사용자 결정 #1)
 */
export function resolveEditorMode(input: ResolveEditorModeInput = {}): EditorMode {
  const enabled = input.simpleModeEnabled ?? isSimpleModeEnabled();
  if (!enabled) return 'full';

  const qm = str(input.queryMode).trim().toLowerCase();
  if (qm === 'full') return 'full';
  if (qm === 'simple') return 'simple';

  const qt = str(input.queryTab).trim().toLowerCase();
  if (qt.length > 0) return 'full';

  const sm = str(input.savedMode).trim().toLowerCase();
  if (sm === 'full') return 'full';
  if (sm === 'simple') return 'simple';

  return 'simple';
}

/** 에디션 content 가 간단 포맷('simple')인지 판별 */
export function isSimpleEdition(content: unknown): boolean {
  return isRecord(content) && content.format === 'simple';
}

/**
 * field_note 에 comment('이번 주 한마디')만 채워져 있고 나머지 4개 질문이 비어 있는지 판별.
 * true 이면 독자 뷰어에서 Q&A 5칸 대신 큰 글씨 인용 카드("중개사의 한마디")로 렌더링한다.
 */
export function isSingleCommentFieldNote(fieldNote: unknown): boolean {
  if (!isRecord(fieldNote)) return false;
  const comment = str(fieldNote.comment).trim();
  if (!comment) return false;
  const others = [
    str(fieldNote.question).trim(),
    str(fieldNote.buyerReaction).trim(),
    str(fieldNote.sellerReaction).trim(),
    str(fieldNote.marketJudgment).trim(),
  ];
  return others.every((x) => x.length === 0);
}

/**
 * LLM 요약이 아직 없거나 실패했을 때 중개인의 '이번 주 한마디'에서 결정론적으로 헤드라인을 추출한다.
 * - 첫 문장(마침표·물음표·느낌표·줄바꿈 기준)을 가져오되 42자 이내로 다듬는다.
 * - 한마디가 비어 있으면 중개사 이름을 포함한 기본 제목을 돌려준다.
 */
export function deriveFallbackHeadline(comment: unknown, brokerName?: string | null): string {
  const raw = str(comment).replace(/\s+/g, ' ').trim();
  const cleanBroker = str(brokerName).trim();
  const fallback = cleanBroker ? `${cleanBroker} 중개사의 이번 주 빌딩 시장 브리핑` : '이번 주 빌딩·상업용 부동산 핵심 브리핑';
  if (!raw) return fallback;

  // 첫 문장 분리
  const firstSentenceMatch = raw.match(/^(.+?)(?:[.!?。]\s+|\n|$)/);
  const candidate = (firstSentenceMatch ? firstSentenceMatch[1] : raw)
    .replace(/[.!?。]+$/, '')
    .trim();

  if (candidate.length < 4) return fallback;
  if (candidate.length <= 42) return candidate;
  return `${candidate.slice(0, 40).trim()}…`;
}

/**
 * LLM 요약이 실패했거나 오프라인일 때 중개인 한마디·매물 수·뉴스 제목만으로 결정론적 3줄 요약을 만든다.
 * 입력에 없는 수치나 사실을 절대 지어내지 않는다.
 */
export function deriveFallbackBriefing(input: {
  comment: string;
  dealCount?: number;
  newsTitles?: string[];
  marketTemp?: string | null;
}): string {
  const lines: string[] = [];
  const cleanComment = str(input.comment).replace(/\s+/g, ' ').trim();
  if (cleanComment) {
    lines.push(cleanComment);
  }
  const temp = str(input.marketTemp).trim();
  const deals = typeof input.dealCount === 'number' && input.dealCount > 0 ? input.dealCount : 0;
  if (temp && deals > 0) {
    lines.push(`현재 현장 시장 온도는 '${temp}' 흐름이며, 이번 호에서는 주목할 만한 추천 매물 ${deals}건을 함께 소개합니다.`);
  } else if (deals > 0) {
    lines.push(`이번 호에서는 현장에서 엄선한 주목 매물 ${deals}건의 핵심 정보를 확인하실 수 있습니다.`);
  } else if (temp) {
    lines.push(`현재 현장 시장 온도는 '${temp}' 흐름을 보이고 있습니다.`);
  }

  const news = Array.isArray(input.newsTitles)
    ? input.newsTitles.map((t) => str(t).trim()).filter(Boolean).slice(0, 2)
    : [];
  if (news.length > 0) {
    lines.push(`주요 시장 소식으로는 "${news[0]}" 등 ${news.length}건의 핵심 뉴스를 함께 정리했습니다.`);
  }

  return lines.join('\n\n');
}

/**
 * 전체 모드에서 작성된 고급 항목(테마, 투표, 세무, 필드노트 추가 4칸)이 있는지 센다.
 * 간단 모드로 전환했을 때 기존 데이터를 지우지 않고 "고급 항목 N개 유지 중" 안내를 띄우기 위함.
 */
export function countPreservedAdvancedItems(form: {
  themeTitle?: string;
  themeBodyMd?: string;
  pollQuestion?: string;
  taxQuestion?: string;
  taxAnswer?: string;
  fieldNote?: {
    question?: string;
    buyerReaction?: string;
    sellerReaction?: string;
    marketJudgment?: string;
  };
}): { count: number; labels: string[] } {
  const labels: string[] = [];
  if (str(form.themeTitle).trim() || str(form.themeBodyMd).trim()) {
    labels.push('이번 주 테마');
  }
  if (str(form.pollQuestion).trim()) {
    labels.push('1-Click 투표');
  }
  if (str(form.taxQuestion).trim() || str(form.taxAnswer).trim()) {
    labels.push('세무·법률 클리닉');
  }
  const fn = form.fieldNote;
  if (
    fn &&
    (str(fn.question).trim() ||
      str(fn.buyerReaction).trim() ||
      str(fn.sellerReaction).trim() ||
      str(fn.marketJudgment).trim())
  ) {
    labels.push('현장 Q&A 상세 항목');
  }
  return { count: labels.length, labels };
}

/**
 * 간단 모드 에디션 저장/발행 시 프리셋 적용:
 *  - format = 'simple' 기록
 *  - 헤드라인이 비어 있고 field_note.comment 가 있으면 결정론적 헤드라인 자동 보충
 *  - 뉴스/매물 개수를 최대 3건으로 제한
 *  - 작성된 데이터가 없는 고급 섹션(theme_of_week, poll, tax_clinic 등)은 sections[].enabled = false 로 설정하되,
 *    이미 데이터가 있는 고급 섹션은 보존한다(데이터 손실 0).
 */
export function applySimplePreset(
  rawContent: Record<string, unknown>,
  opts: { brokerName?: string | null } = {},
): Record<string, unknown> {
  const content: Record<string, unknown> = { ...rawContent, format: 'simple' };

  const fn = isRecord(content.field_note) ? content.field_note : {};
  const comment = str(fn.comment).trim();
  const curHeadline = str(content.headline).trim();
  if (!curHeadline && comment) {
    content.headline = deriveFallbackHeadline(comment, opts.brokerName);
  }

  // 뉴스 최대 3건
  if (Array.isArray(content.selected_news_ids) && content.selected_news_ids.length > SIMPLE_NEWS_LIMIT) {
    content.selected_news_ids = content.selected_news_ids.slice(0, SIMPLE_NEWS_LIMIT);
  }
  if (Array.isArray(content.topNews) && content.topNews.length > SIMPLE_NEWS_LIMIT) {
    content.topNews = content.topNews.slice(0, SIMPLE_NEWS_LIMIT);
  }

  // 매물 최대 3건
  if (Array.isArray(content.featured_deal_ids) && content.featured_deal_ids.length > SIMPLE_DEAL_LIMIT) {
    content.featured_deal_ids = content.featured_deal_ids.slice(0, SIMPLE_DEAL_LIMIT);
  }
  if (Array.isArray(content.dealHighlights) && content.dealHighlights.length > SIMPLE_DEAL_LIMIT) {
    content.dealHighlights = content.dealHighlights.slice(0, SIMPLE_DEAL_LIMIT);
  }

  // 고급 섹션 보존 여부 판단
  const hasTheme = Boolean(str(content.theme_title).trim() && str(content.theme_body_md).trim());
  const hasPoll = isRecord(content.poll) && Boolean(str(content.poll.question).trim());
  const hasTax =
    isRecord(content.tax_clinic) &&
    Boolean(str(content.tax_clinic.question).trim() || str(content.tax_clinic.title).trim());

  const enabledMap: Record<string, boolean> = {};
  for (const id of SIMPLE_SECTION_ORDER) {
    enabledMap[id] = true;
  }
  for (const id of SIMPLE_HIDDEN_SECTIONS) {
    if (id === 'theme_of_week' && hasTheme) enabledMap[id] = true;
    else if (id === 'poll' && hasPoll) enabledMap[id] = true;
    else if (id === 'tax_clinic' && hasTax) enabledMap[id] = true;
    else enabledMap[id] = false;
  }

  const orderedIds: string[] = [
    ...SIMPLE_SECTION_ORDER,
    ...SIMPLE_HIDDEN_SECTIONS.filter((id) => !SIMPLE_SECTION_ORDER.includes(id as never)),
  ];

  content.section_order = orderedIds;
  content.sections = orderedIds.map((id) => ({ id, enabled: enabledMap[id] !== false }));

  return content;
}
