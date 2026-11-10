/**
 * src/domain/magazine/issue-clustering.ts — AI 클러스터링 AXIOS형 단위 이슈 5선 & 와이드 포스트잇 카드 SSOT
 *
 * 중개인 고도화 요구사항 반영:
 *  - 일간(Daily)·주간(Weekly)·월간(Monthly) 모두 단위 이슈 5건(ISSUE_CARD_COUNT = 5) 고정 구성
 *  - 중개인 개인 설정(권역 preferredRegions, 뉴스 큐레이션 분야 preferredChannels) 기반 가중치 클러스터링 및 비부동산 가십 차단
 *  - AXIOS 카드뉴스형 제목(최대 2줄 대형 헤드라인) + 해설 브리프(2줄 부제형 핵심 요약, 2문장)
 *  - 각 이슈는 적절한 파스텔 색상의 박스 배경(5톤: amber, sky, mint, lavender, peach)으로 와이드 포스트잇 메모(카드뉴스)처럼 렌더링
 *
 * 클라이언트·서버 공용 순수 모듈 (Node 전용 import 금지).
 */

import type { AxiosUnitIssue, PostItTone } from './types';
import {
  CURATED_CHANNEL_POOL,
  NEWS_CHANNEL_MAP,
  isCreRelevantArticle,
  isSpecificNewsChannelId,
  resolveNewsChannel,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from './news-channels';
import { expandRegionKeywords } from './broker-preferences';

export const ISSUE_CARD_COUNT = 5;

export const POST_IT_TONES: readonly PostItTone[] = [
  'amber',
  'sky',
  'mint',
  'lavender',
  'peach',
] as const;

export interface PostItToneMeta {
  tone: PostItTone;
  label: string;
  emoji: string;
  /** 카드 배경색 (라이트 웜 페이퍼/포스트잇 톤) */
  cardBg: string;
  /** 카드 테두리색 */
  cardBorder: string;
  /** 좌측 포인트 스트립 색 */
  accentBar: string;
  /** 상단 배지 배경/텍스트 */
  badgeBg: string;
  badgeText: string;
  /** 본문 제목/해설 텍스트 색 */
  titleColor: string;
  bodyColor: string;
  metaColor: string;
}

export const POST_IT_TONE_META: Readonly<Record<PostItTone, PostItToneMeta>> = {
  amber: {
    tone: 'amber',
    label: '옐로우 포스트잇',
    emoji: '🟨',
    cardBg: '#FEF9C3',
    cardBorder: '#FDE047',
    accentBar: '#CA8A04',
    badgeBg: '#FEF08A',
    badgeText: '#854D0E',
    titleColor: '#0F172A',
    bodyColor: '#334155',
    metaColor: '#713F12',
  },
  sky: {
    tone: 'sky',
    label: '스카이 포스트잇',
    emoji: '🟦',
    cardBg: '#E0F2FE',
    cardBorder: '#7DD3FC',
    accentBar: '#0284C7',
    badgeBg: '#BAE6FD',
    badgeText: '#075985',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#0369A1',
  },
  mint: {
    tone: 'mint',
    label: '민트 포스트잇',
    emoji: '🟩',
    cardBg: '#DCFCE7',
    cardBorder: '#86EFAC',
    accentBar: '#16A34A',
    badgeBg: '#BBF7D0',
    badgeText: '#166534',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#15803D',
  },
  lavender: {
    tone: 'lavender',
    label: '라벤더 포스트잇',
    emoji: '🟪',
    cardBg: '#F3E8FF',
    cardBorder: '#D8B4FE',
    accentBar: '#9333EA',
    badgeBg: '#E9D5FF',
    badgeText: '#6B21A8',
    titleColor: '#1E1B4B',
    bodyColor: '#312E81',
    metaColor: '#6B21A8',
  },
  peach: {
    tone: 'peach',
    label: '피치 포스트잇',
    emoji: '🟧',
    cardBg: '#FFE4E6',
    cardBorder: '#FDA4AF',
    accentBar: '#E11D48',
    badgeBg: '#FECDD3',
    badgeText: '#9F1239',
    titleColor: '#0F172A',
    bodyColor: '#334155',
    metaColor: '#BE123C',
  },
};

function decodeBasicEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * 뉴스레터 표지 제목 등을 깔끔한 1줄(single-line)로 정제한다.
 * - 앞쪽 `[매체명]` 제거, 줄바꿈 제거, 불필요한 따옴표·말줄임 정리 (말줄임표 `…`/`...` 절대 미부착)
 */
export function formatSingleLineTitle(raw: unknown, maxChars = 38): string {
  if (typeof raw !== 'string') return '';
  const cleaned = decodeBasicEntities(raw)
    .replace(/[\r\n]+/g, ' ')
    .replace(/…|\.{2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,+/g, ',')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[""'']+|[""'']+$/g, '')
    .replace(/[.。,·:：-]+$/, '')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;

  const sliced = cleaned.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  const candidate =
    lastSpace >= Math.floor(maxChars * 0.55) ? sliced.slice(0, lastSpace) : sliced;
  return candidate
    .replace(/[,·:：…-]+$/, '')
    .replace(/\s+(?:및|과|와|의|에|을|를|은|는|이|가|로|으로)$/, '')
    .trim();
}

/**
 * 카드뉴스형 포스트잇 뷰를 위한 AXIOS 2줄 헤드라인 정제기 (최대 52자)
 * - 1줄 강제 말줄임(38자)으로 문맥이 잘리는 문제를 방지하고,
 *   모바일/데스크톱 포스트잇 카드에서 큼직한 2줄(line-clamp-2)로 완결성 있게 읽히도록 정제한다.
 */
export function formatAxiosCardTitle(raw: unknown, maxChars = 52): string {
  return formatSingleLineTitle(raw, maxChars);
}

/**
 * 텍스트를 문장 단위로 분리한다.
 */
export function splitKoreanSentences(text: string): string[] {
  const normalized = decodeBasicEntities(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/…|\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const rawParts = normalized
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return rawParts.map((s) => (/[.!?。]$/.test(s) ? s : `${s}.`));
}

const DANGLING_KO_ENDING_RE =
  /(?:\s+(?:및|또한|그리고|통해|통한|위한|따른|인한|대한|관한|중심으로|바탕으로|가운데|속에서|높일|낮출|늘릴|줄일)|\s+\S+(?:하고|하며|하는|되는|있는|없는|위한|따른|통한|높일|낮출|늘릴|줄일|의|에|을|를|은|는|이|가|과|와|로|으로|에서|부터|까지))$/;

function ensureCompleteKoreanPredicate(clause: string): string {
  let base = clause
    .replace(/[,·:：….-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';

  // 완결 종결어미로 이미 끝나는 경우 마침표만 부착
  if (/(?:다|요|음|됨|함|임|세요|십시오)$/.test(base)) {
    return `${base}.`;
  }

  // 뒤에 불완전한 수식어/조사 어절이 매달려 있으면 최대 2회 제거 후 서술어 보강
  for (let i = 0; i < 2; i++) {
    if (DANGLING_KO_ENDING_RE.test(base)) {
      const stripped = base.replace(DANGLING_KO_ENDING_RE, '').trim();
      if (stripped.length >= 10) {
        base = stripped;
      }
    }
  }

  base = base.replace(/(?:의|에|을|를|은|는|이|가|과|와|로|으로|에서|부터|까지)$/, '').trim();
  if (/(?:다|요|음|됨|함|임|세요|십시오)$/.test(base)) {
    return `${base}.`;
  }
  return `${base}입니다.`;
}

function condenseSentence(sentence: string, maxLen = 52): string {
  const cleaned = sentence
    .replace(/…|\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:특히|또한|아울러|한편|이에\s*따라|이와\s*함께)\s*,?\s*/g, '')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) {
    const withoutDot = cleaned.replace(/[.!?。]+$/, '').trim();
    if (DANGLING_KO_ENDING_RE.test(withoutDot)) {
      return ensureCompleteKoreanPredicate(withoutDot);
    }
    return /[.!?。]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  }

  // 쉼표나 연결어미 기준으로 앞부분 핵심 절을 우선 보존하되 완결된 한국어 서술어로 마감
  const cut = cleaned.slice(0, Math.max(16, maxLen - 4));
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace >= Math.floor(cut.length * 0.6) ? cut.slice(0, lastSpace) : cut)
    .replace(/[,·:：…-]+$/, '')
    .trim();
  return ensureCompleteKoreanPredicate(base);
}

const INTERNAL_LABEL_RE =
  /(?:핵심\s*팩트|브로커\s*임플리케이션|추천\s*액션|시장\s*시사점|매수자\s*포인트|Why\s*it\s*matters)\s*[:：]\s*/gi;

const CONCISE_CHANNEL_FALLBACKS: Readonly<Record<SpecificNewsChannelId, readonly [string, string]>> = {
  real_estate: [
    '역세권 우량 빌딩을 중심으로 법인과 자산가의 선별 매수세가 이어집니다.',
    '표면 수익률과 함께 대지 지분·리모델링 여력을 함께 점검할 시점입니다.',
  ],
  economy_finance: [
    '기업대출 금리와 통화정책이 빌딩 매수자의 자기자본수익률을 좌우합니다.',
    '조달 금리 스프레드를 사전 점검하면 협상력과 현금흐름이 개선됩니다.',
  ],
  tax_wealth: [
    '빌딩의 취득·보유·증여 세무 구조에 따라 세후 수익률 격차가 벌어집니다.',
    '사전 감정평가와 부담부증여·법인 활용 유불리를 미리 점검해야 합니다.',
  ],
  culture_lifestyle: [
    '외관 리노베이션과 문화 콘텐츠 결합이 임차인 집객력과 가치를 높입니다.',
    '우량 임차인 유치를 위해 저층 공간 기획을 차별화하는 사례가 늘었습니다.',
  ],
  commercial_trend: [
    '핵심 상권의 메디컬·대형 카페 유입이 중소형 빌딩 임대료를 견인합니다.',
    '공실 위험을 낮추려면 층별 업종 구성과 소비 트렌드를 살펴야 합니다.',
  ],
};

/**
 * AXIOS 카드뉴스형 2줄 부제(Subtitle/Deck) 포맷터
 * - 원문 뉴스 요약(파이프 `|` 구분자 구조 포함)에서 핵심 팩트 1문장 + 매수자 시사점 1문장(총 2문장, 약 50~98자)으로 압축
 * - 내부 라벨(`핵심 팩트:`, `브로커 임플리케이션:`, `추천 액션:`) 및 파이프(`|`) 노출 100% 제거
 * - 최소 2문장, 최대 2문장(레거시 호환 2~4문장 범위 내)으로 고정해 포스트잇 2줄(line-clamp-2) 서피스에 최적화
 */
export function formatAxiosTwoLineBrief(
  rawSummary: unknown,
  opts: {
    secondarySummary?: string;
    title?: string;
    channel?: SpecificNewsChannelId;
    maxTotalChars?: number;
  } = {},
): string {
  const maxTotalChars = opts.maxTotalChars ?? 98;
  const raw = typeof rawSummary === 'string' ? decodeBasicEntities(rawSummary).trim() : '';
  const sentences: string[] = [];

  if (raw.includes('|')) {
    const segments = raw
      .split('|')
      .map((seg) =>
        seg
          .replace(INTERNAL_LABEL_RE, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);

    for (const seg of segments) {
      for (const s of splitKoreanSentences(seg)) {
        const condensed = condenseSentence(s, 54);
        if (sentences.length < 2 && !sentences.includes(condensed)) {
          sentences.push(condensed);
        }
      }
    }
  } else if (raw) {
    const cleaned = raw
      .replace(INTERNAL_LABEL_RE, '')
      .replace(/\s+/g, ' ')
      .trim();
    for (const s of splitKoreanSentences(cleaned)) {
      const condensed = condenseSentence(s, 54);
      if (sentences.length < 2 && !sentences.includes(condensed)) {
        sentences.push(condensed);
      }
    }
  }

  if (opts.secondarySummary && sentences.length < 2) {
    const secRaw = decodeBasicEntities(opts.secondarySummary)
      .split('|')[0]
      ?.replace(INTERNAL_LABEL_RE, '')
      .trim();
    if (secRaw) {
      const secSentences = splitKoreanSentences(secRaw);
      if (secSentences[0]) {
        const condensed = condenseSentence(secSentences[0], 50);
        if (!sentences.includes(condensed)) {
          sentences.push(condensed);
        }
      }
    }
  }

  if (sentences.length < 2) {
    const channelKey = opts.channel ?? 'real_estate';
    const extras = CONCISE_CHANNEL_FALLBACKS[channelKey] ?? CONCISE_CHANNEL_FALLBACKS.real_estate;
    for (const ex of extras) {
      if (sentences.length < 2 && !sentences.includes(ex)) {
        sentences.push(condenseSentence(ex, 52));
      }
    }
  }

  let joined = sentences.slice(0, 2).join(' ');
  if (joined.length > maxTotalChars && sentences.length === 2) {
    const s1 = condenseSentence(sentences[0], Math.floor(maxTotalChars * 0.52));
    const s2 = condenseSentence(sentences[1], Math.floor(maxTotalChars * 0.46));
    joined = `${s1} ${s2}`;
  }
  return joined;
}

/**
 * 하위호환 및 AXIOS 브리프 표준 함수 (2줄 부제형 2문장 요약 반환)
 */
export function formatAxiosBrief(
  rawSummary: unknown,
  opts: {
    secondarySummary?: string;
    title?: string;
    channel?: SpecificNewsChannelId;
  } = {},
): string {
  return formatAxiosTwoLineBrief(rawSummary, opts);
}

export interface ClusterIssuesOptions {
  cadence?: 'daily' | 'weekly' | 'monthly' | 'special';
  preferredIds?: readonly string[];
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealKeywords?: readonly string[];
}

/**
 * 다수의 뉴스 기사 후보를 중개인 설정(권역·관심 채널·보유 매물 키워드) 기반으로 가중치 클러스터링하여
 * 정확히 5건(ISSUE_CARD_COUNT = 5)의 AXIOS형 카드뉴스 포스트잇 단위 이슈로 재구성한다.
 */
export function clusterArticlesIntoFiveIssues(
  articles: readonly NewsPoolItem[] = [],
  opts: ClusterIssuesOptions = {},
): AxiosUnitIssue[] {
  const expandedRegions = expandRegionKeywords(opts.preferredRegions ?? []);
  const dealKeywords = (opts.dealKeywords ?? [])
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);
  const activeChannels: SpecificNewsChannelId[] =
    Array.isArray(opts.preferredChannels) && opts.preferredChannels.length > 0
      ? opts.preferredChannels.filter(isSpecificNewsChannelId)
      : [
          'real_estate',
          'economy_finance',
          'commercial_trend',
          'tax_wealth',
          'culture_lifestyle',
        ];

  const preferredChannelSet = new Set<SpecificNewsChannelId>(activeChannels);
  const preferredIdSet = new Set<string>((opts.preferredIds ?? []).map((id) => String(id).trim()));

  // 1. 입력 기사(비부동산 가십 필터링 적용) + 부족분 보충용 기본 풀 준비
  const pool: Array<{ item: NewsPoolItem; score: number; channel: SpecificNewsChannelId }> = [];
  const seenKey = new Set<string>();

  const computeScore = (
    item: NewsPoolItem,
    ch: SpecificNewsChannelId,
    isUserProvided: boolean,
  ): number => {
    const id = String(item.id ?? item.title ?? '').trim();
    const text = `${item.title ?? ''} ${item.summary ?? ''}`;
    let score = typeof item.importance_score === 'number' ? item.importance_score : 6;

    if (isUserProvided) score += 10;
    if (preferredIdSet.has(id)) score += 100;
    if (preferredChannelSet.has(ch)) score += 15;

    let regionMatches = 0;
    for (const rk of expandedRegions) {
      if (rk.length >= 2 && text.includes(rk)) {
        regionMatches += 1;
        if (regionMatches >= 4) break;
      }
    }
    score += regionMatches * 8;

    for (const dk of dealKeywords) {
      if (dk.length >= 2 && text.includes(dk)) {
        score += 8;
        break;
      }
    }

    return score;
  };

  const pushItem = (item: NewsPoolItem, isUserProvided = false) => {
    if (!isCreRelevantArticle(item)) return;
    const title = formatAxiosCardTitle(item.title, 80);
    if (!title) return;
    const key = String(item.id ?? title).trim();
    const normTitle = title.replace(/\s+/g, '');
    if (seenKey.has(key) || seenKey.has(normTitle)) return;
    seenKey.add(key);
    seenKey.add(normTitle);
    const channel = resolveNewsChannel(item);
    const score = computeScore(item, channel, isUserProvided);
    pool.push({ item, score, channel });
  };

  if (preferredIdSet.size > 0) {
    const byId = new Map(articles.map((a) => [String(a.id ?? a.title).trim(), a]));
    for (const pid of preferredIdSet) {
      const found = byId.get(pid);
      if (found) pushItem(found, true);
    }
  }

  for (const a of articles) {
    pushItem(a, true);
  }
  for (const c of CURATED_CHANNEL_POOL) {
    pushItem(c, false);
  }

  // 점수 내림차순 정렬
  pool.sort((a, b) => b.score - a.score);

  // 2. 선호 채널 우선 버킷 구성
  const allChannels: SpecificNewsChannelId[] = [
    ...activeChannels,
    ...(
      [
        'real_estate',
        'economy_finance',
        'commercial_trend',
        'tax_wealth',
        'culture_lifestyle',
      ] as const
    ).filter((ch) => !preferredChannelSet.has(ch)),
  ];

  const buckets = new Map<SpecificNewsChannelId, NewsPoolItem[]>();
  for (const ch of allChannels) buckets.set(ch, []);
  for (const entry of pool) {
    const list = buckets.get(entry.channel) ?? buckets.get('real_estate')!;
    list.push(entry.item);
  }

  const totalPreferredCandidates = activeChannels.reduce(
    (acc, ch) => acc + (buckets.get(ch)?.length ?? 0),
    0,
  );

  const clusters: Array<{
    primary: NewsPoolItem;
    related: NewsPoolItem[];
    channel: SpecificNewsChannelId;
  }> = [];
  const usedIds = new Set<string>();

  // 라운드로빈으로 선호 채널에서 먼저 5개 이슈를 채운다
  let pass = 0;
  while (clusters.length < ISSUE_CARD_COUNT && pass < ISSUE_CARD_COUNT) {
    let addedInPass = false;
    for (const ch of activeChannels) {
      if (clusters.length >= ISSUE_CARD_COUNT) break;
      const list = (buckets.get(ch) ?? []).filter(
        (x) => !usedIds.has(String(x.id ?? x.title)),
      );
      if (list.length === 0) continue;

      const primary = list[0];
      usedIds.add(String(primary.id ?? primary.title));

      const related: NewsPoolItem[] = [];
      // 후보 기사가 충분할 때만 동일 토픽 보조 기사를 클러스터로 병합
      const canMergeRelated = totalPreferredCandidates - usedIds.size >= ISSUE_CARD_COUNT - clusters.length;
      if (canMergeRelated) {
        for (let i = 1; i < list.length && related.length < 2; i++) {
          const cand = list[i];
          if (cand.topic && cand.topic === primary.topic) {
            related.push(cand);
            usedIds.add(String(cand.id ?? cand.title));
          }
        }
      }

      clusters.push({ primary, related, channel: ch });
      addedInPass = true;
    }
    if (!addedInPass) break;
    pass += 1;
  }

  // 선호 채널만으로 5개가 안 채워졌을 경우 전체 풀에서 점수순 보충
  for (const entry of pool) {
    if (clusters.length >= ISSUE_CARD_COUNT) break;
    const key = String(entry.item.id ?? entry.item.title);
    if (usedIds.has(key)) continue;
    usedIds.add(key);
    clusters.push({ primary: entry.item, related: [], channel: entry.channel });
  }

  // 3. 각 클러스터를 AXIOS 카드뉴스형 2줄 헤드라인 + 2줄 부제 브리프 + 포스트잇 5톤으로 변환
  return clusters.slice(0, ISSUE_CARD_COUNT).map((cluster, idx) => {
    const { primary, related, channel } = cluster;
    const memoTone = POST_IT_TONES[idx % POST_IT_TONES.length];
    const title =
      formatAxiosCardTitle(primary.title, 52) || `핵심 상업용 부동산 이슈 #${idx + 1}`;
    const brief = formatAxiosTwoLineBrief(primary.summary, {
      secondarySummary: related[0]?.summary,
      title,
      channel,
    });

    const rawSources = [primary.source, ...related.map((r) => r.source)]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    const uniqueSources = Array.from(new Set(rawSources)).slice(0, 3);
    if (uniqueSources.length === 0) {
      uniqueSources.push(NEWS_CHANNEL_MAP[channel]?.shortLabel ?? '시장 브리핑');
    }

    const sentiment =
      primary.sentiment === 'bullish' || primary.sentiment === 'bearish'
        ? primary.sentiment
        : 'neutral';

    return {
      id: String(primary.id ?? `issue-${idx + 1}`),
      title,
      brief,
      memoTone,
      channel,
      topic: primary.topic || channel,
      sentiment,
      sources: uniqueSources,
      ...(typeof primary.url === 'string' && /^https?:\/\//i.test(primary.url.trim())
        ? { url: primary.url.trim() }
        : {}),
      articleCount: 1 + related.length,
    };
  });
}

/**
 * 저장된 에디션 데이터(unitIssues 또는 레거시 topNews/news_curation)에서
 * 독자 뷰어 및 에디터가 사용할 AXIOS 포스트잇 단위 이슈 목록(최대 5건)을 추출한다.
 */
export function resolveUnitIssuesFromData(
  data: Record<string, unknown>,
  opts: { max?: number; fallbackFromTopNews?: boolean } = {},
): AxiosUnitIssue[] {
  const max = opts.max ?? ISSUE_CARD_COUNT;
  const fallbackFromTopNews = opts.fallbackFromTopNews ?? true;

  if (Array.isArray(data.unitIssues) && data.unitIssues.length > 0) {
    const valid: AxiosUnitIssue[] = [];
    for (let i = 0; i < data.unitIssues.length && valid.length < max; i++) {
      const raw = data.unitIssues[i];
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const title = formatAxiosCardTitle(r.title, 52);
      if (!title) continue;
      if (!isCreRelevantArticle({ title, summary: typeof r.brief === 'string' ? r.brief : '' })) {
        continue;
      }
      const channel = resolveNewsChannel({
        title,
        summary: typeof r.brief === 'string' ? r.brief : '',
        topic: typeof r.topic === 'string' ? r.topic : '',
        channel: typeof r.channel === 'string' ? r.channel : '',
      });
      const brief = formatAxiosTwoLineBrief(r.brief ?? r.summary, { title, channel });
      const toneRaw = typeof r.memoTone === 'string' ? r.memoTone : '';
      const memoTone: PostItTone = (POST_IT_TONES as readonly string[]).includes(toneRaw)
        ? (toneRaw as PostItTone)
        : POST_IT_TONES[valid.length % POST_IT_TONES.length];
      const sentiment =
        r.sentiment === 'bullish' || r.sentiment === 'bearish' ? r.sentiment : 'neutral';
      const sources = Array.isArray(r.sources)
        ? r.sources.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : typeof r.source === 'string' && r.source.trim()
          ? [r.source.trim()]
          : [];

      valid.push({
        id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `issue-${valid.length + 1}`,
        title,
        brief,
        memoTone,
        channel,
        topic: typeof r.topic === 'string' ? r.topic : channel,
        sentiment,
        sources,
        ...(typeof r.url === 'string' && /^https?:\/\//i.test(r.url.trim())
          ? { url: r.url.trim() }
          : {}),
        articleCount:
          typeof r.articleCount === 'number' && r.articleCount >= 1
            ? r.articleCount
            : Math.max(1, sources.length),
      });
    }
    if (valid.length > 0) return valid;
  }

  if (!fallbackFromTopNews) return [];

  const rawNews = Array.isArray(data.topNews)
    ? data.topNews
    : Array.isArray(data.news_curation)
      ? data.news_curation
      : [];
  if (rawNews.length === 0) return [];

  const out: AxiosUnitIssue[] = [];
  for (let i = 0; i < rawNews.length && out.length < max; i++) {
    const n = rawNews[i];
    if (!n || typeof n !== 'object') continue;
    const r = n as Record<string, unknown>;
    const title = formatAxiosCardTitle(r.title, 52);
    if (!title) continue;
    if (!isCreRelevantArticle({ title, summary: typeof r.summary === 'string' ? r.summary : '' })) {
      continue;
    }
    const channel = resolveNewsChannel({
      title,
      summary: typeof r.summary === 'string' ? r.summary : '',
      topic: typeof r.topic === 'string' ? r.topic : '',
      channel: typeof r.channel === 'string' ? r.channel : '',
    });
    const brief = formatAxiosTwoLineBrief(r.summary, { title, channel });
    const memoTone = POST_IT_TONES[out.length % POST_IT_TONES.length];
    const sentiment =
      r.sentiment === 'bullish' || r.sentiment === 'bearish' ? r.sentiment : 'neutral';
    const source = typeof r.source === 'string' && r.source.trim() ? [r.source.trim()] : [];

    out.push({
      id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `news-issue-${out.length + 1}`,
      title,
      brief,
      memoTone,
      channel,
      topic: typeof r.topic === 'string' ? r.topic : channel,
      sentiment,
      sources: source,
      ...(typeof r.url === 'string' && /^https?:\/\//i.test(r.url.trim())
        ? { url: r.url.trim() }
        : {}),
      articleCount: 1,
    });
  }
  return out;
}
