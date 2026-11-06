/**
 * src/domain/magazine/issue-clustering.ts — AI 클러스터링 AXIOS형 단위 이슈 5선 & 와이드 포스트잇 카드 SSOT
 *
 * 중개인 고도화 요구사항 반영:
 *  - 일간(Daily)·주간(Weekly)·월간(Monthly) 모두 단위 이슈 5건(ISSUE_CARD_COUNT = 5) 고정 구성
 *  - 관련 기사들을 주제/채널별로 클러스터링하여 AXIOS형 제목 1줄(큰 폰트, 한 줄 표시) + 요약 브리프 2~4문장 형식으로 재구성
 *  - 각 이슈는 적절한 파스텔 색상의 박스 배경(5톤: amber, sky, mint, lavender, peach)으로 와이드 포스트잇 메모(텍스트 카드 뉴스)처럼 렌더링
 *
 * 클라이언트·서버 공용 순수 모듈 (Node 전용 import 금지).
 */

import type { AxiosUnitIssue, PostItTone } from './types';
import {
  CURATED_CHANNEL_POOL,
  NEWS_CHANNEL_MAP,
  resolveNewsChannel,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from './news-channels';

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
    titleColor: '#1E293B',
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
    titleColor: '#1E293B',
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
 * 뉴스레터 제목 및 AXIOS 이슈 제목을 깔끔한 1줄(single-line)로 정제한다.
 * - 앞쪽 `[매체명]` 제거, 줄바꿈 제거, 불필요한 따옴표·말줄임 정리
 */
export function formatSingleLineTitle(raw: unknown, maxChars = 38): string {
  if (typeof raw !== 'string') return '';
  const cleaned = decodeBasicEntities(raw)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[""'']+|[""'']+$/g, '')
    .replace(/[.。]+$/, '')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;

  // 자연스러운 어절 경계에서 절단
  const sliced = cleaned.slice(0, maxChars - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxChars * 0.6)) {
    return `${sliced.slice(0, lastSpace).replace(/[,·:：-]+$/, '').trim()}…`;
  }
  return `${sliced.trim()}…`;
}

/**
 * 텍스트를 문장 단위로 분리한다.
 */
export function splitKoreanSentences(text: string): string[] {
  const normalized = decodeBasicEntities(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const rawParts = normalized
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return rawParts.map((s) => (/[.!?。]$/.test(s) ? s : `${s}.`));
}

/**
 * 원문 뉴스 요약(파이프 `|` 구분자 구조 포함)과 클러스터링된 보조 기사 요약을 결합해
 * AXIOS 스타일의 2~4문장 해설 브리프(brief)로 재구성한다.
 * - 내부 라벨(`핵심 팩트:`, `브로커 임플리케이션:`, `추천 액션:`) 및 파이프(`|`) 노출 완전 제거
 * - 최소 2문장, 최대 4문장 보장
 */
export function formatAxiosBrief(
  rawSummary: unknown,
  opts: {
    secondarySummary?: string;
    title?: string;
    channel?: SpecificNewsChannelId;
  } = {},
): string {
  const raw = typeof rawSummary === 'string' ? decodeBasicEntities(rawSummary).trim() : '';
  const sentences: string[] = [];

  const INTERNAL_LABEL_RE =
    /(?:핵심\s*팩트|브로커\s*임플리케이션|추천\s*액션|시장\s*시사점|매수자\s*포인트)\s*[:：]\s*/gi;

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
        if (sentences.length < 4 && !sentences.includes(s)) {
          sentences.push(s);
        }
      }
    }
  } else if (raw) {
    const cleaned = raw
      .replace(INTERNAL_LABEL_RE, '')
      .replace(/\s+/g, ' ')
      .trim();
    for (const s of splitKoreanSentences(cleaned)) {
      if (sentences.length < 4 && !sentences.includes(s)) {
        sentences.push(s);
      }
    }
  }

  // 클러스터 내 보조 기사가 있으면 핵심 문장 1개를 추가해 입체적 클러스터링 브리프 구성
  if (opts.secondarySummary && sentences.length < 4) {
    const secRaw = decodeBasicEntities(opts.secondarySummary)
      .split('|')[0]
      ?.replace(INTERNAL_LABEL_RE, '')
      .trim();
    if (secRaw) {
      const secSentences = splitKoreanSentences(secRaw);
      if (secSentences[0] && !sentences.includes(secSentences[0])) {
        sentences.push(secSentences[0]);
      }
    }
  }

  // 문장이 1개 이하일 때 채널별 매수자 시사점 문장을 보강하여 2~4문장 규격 충족
  if (sentences.length < 2) {
    const channelFallbacks: Record<SpecificNewsChannelId, string[]> = {
      real_estate: [
        '역세권 및 우량 임차인이 확보된 중소형 빌딩을 중심으로 실수요 법인과 개인 자산가의 선별 매수세가 이어지고 있습니다.',
        '매수 검토 시 표면 수익률뿐 아니라 대지 지분 가치와 리모델링 밸류애드 여력을 함께 점검하는 것이 유리합니다.',
      ],
      economy_finance: [
        '시중은행의 기업시설자금 대출 금리와 통화정책 방향성이 빌딩 매수자의 자기자본수익률(CoC)을 결정짓는 핵심 변수로 작용하고 있습니다.',
        '자금 조달 구조와 금리 스프레드를 사전에 점검하면 협상력과 실질 현금흐름을 동시에 높일 수 있습니다.',
      ],
      tax_wealth: [
        '상업용 부동산 취득·보유·양도 및 증여 단계별 세무 구조에 따라 실질 세후 수익률 격차가 크게 벌어지고 있습니다.',
        '사전 감정평가와 임대차 특약 정비를 통해 절세 효과를 극대화하는 전략적 접근이 필요합니다.',
      ],
      culture_lifestyle: [
        '건물의 공간 기획과 건축·문화 콘텐츠 결합 여부가 임차인 집객력과 자산 가치를 좌우하는 핵심 트렌드로 자리잡았습니다.',
        '우량 테넌트 유치를 위해 외관 디자인과 저층부 공간 구성을 차별화하는 건물주가 늘고 있습니다.',
      ],
      commercial_trend: [
        '핵심 상권의 유동인구와 우량 임차 업종(병의원·카페·쇼룸) 유입 흐름이 인근 중소형 빌딩의 임대료를 견인하고 있습니다.',
        '공실 위험을 낮추고 임대 수익을 안정화하기 위해 상권별 소비 트렌드 변화를 면밀히 주시해야 합니다.',
      ],
    };
    const channelKey = opts.channel ?? 'real_estate';
    const extras = channelFallbacks[channelKey] ?? channelFallbacks.real_estate;
    for (const ex of extras) {
      if (sentences.length < 2 && !sentences.includes(ex)) {
        sentences.push(ex);
      }
    }
  }

  return sentences.slice(0, 4).join(' ');
}

/**
 * 다수의 뉴스 기사 후보를 주제·채널 유사도 기반으로 클러스터링하여
 * 정확히 5건(ISSUE_CARD_COUNT = 5)의 AXIOS형 와이드 포스트잇 단위 이슈로 재구성한다.
 */
export function clusterArticlesIntoFiveIssues(
  articles: readonly NewsPoolItem[] = [],
  opts: {
    cadence?: 'daily' | 'weekly' | 'monthly' | 'special';
    preferredIds?: readonly string[];
  } = {},
): AxiosUnitIssue[] {
  // 1. 입력 기사 + 부족분 보충용 기본 풀 준비
  const pool: NewsPoolItem[] = [];
  const seenKey = new Set<string>();

  const pushItem = (item: NewsPoolItem) => {
    const title = formatSingleLineTitle(item.title, 80);
    if (!title) return;
    const key = String(item.id ?? title).trim();
    if (seenKey.has(key)) return;
    seenKey.add(key);
    pool.push(item);
  };

  // 사용자가 우선 선택한 기사가 있으면 최우선 배치
  if (Array.isArray(opts.preferredIds) && opts.preferredIds.length > 0) {
    const byId = new Map(articles.map((a) => [String(a.id ?? a.title), a]));
    for (const pid of opts.preferredIds) {
      const found = byId.get(pid);
      if (found) pushItem(found);
    }
  }

  for (const a of articles) {
    pushItem(a);
  }
  for (const c of CURATED_CHANNEL_POOL) {
    pushItem(c);
  }

  // 2. 채널/토픽 그룹별 클러스터 버킷 구성 (5대 채널 균형 배분 + 유사 기사 병합)
  const channelOrder: SpecificNewsChannelId[] = [
    'real_estate',
    'economy_finance',
    'commercial_trend',
    'tax_wealth',
    'culture_lifestyle',
  ];

  const buckets = new Map<SpecificNewsChannelId, NewsPoolItem[]>();
  for (const ch of channelOrder) buckets.set(ch, []);

  for (const item of pool) {
    const ch = resolveNewsChannel(item);
    const list = buckets.get(ch) ?? buckets.get('real_estate')!;
    list.push(item);
  }

  const clusters: Array<{ primary: NewsPoolItem; related: NewsPoolItem[]; channel: SpecificNewsChannelId }> = [];
  const usedIds = new Set<string>();

  // 각 채널 버킷에서 대표 기사 + 연관 기사 1~2건을 묶어 클러스터 생성
  for (const ch of channelOrder) {
    const list = (buckets.get(ch) ?? []).filter((x) => !usedIds.has(String(x.id ?? x.title)));
    if (list.length === 0) continue;
    const primary = list[0];
    usedIds.add(String(primary.id ?? primary.title));

    // 동일 토픽 또는 같은 채널의 차순위 기사를 연관 기사로 클러스터링
    const related: NewsPoolItem[] = [];
    for (let i = 1; i < list.length && related.length < 2; i++) {
      const cand = list[i];
      if (cand.topic === primary.topic || list.length <= 3) {
        related.push(cand);
        usedIds.add(String(cand.id ?? cand.title));
      }
    }
    clusters.push({ primary, related, channel: ch });
    if (clusters.length >= ISSUE_CARD_COUNT) break;
  }

  // 만약 5개 미만이면 남은 기사들로 채움
  for (const item of pool) {
    if (clusters.length >= ISSUE_CARD_COUNT) break;
    const key = String(item.id ?? item.title);
    if (usedIds.has(key)) continue;
    usedIds.add(key);
    const ch = resolveNewsChannel(item);
    clusters.push({ primary: item, related: [], channel: ch });
  }

  // 3. 각 클러스터를 AXIOS형 제목 1줄 + 2~4문장 브리프 + 포스트잇 5톤으로 변환
  return clusters.slice(0, ISSUE_CARD_COUNT).map((cluster, idx) => {
    const { primary, related, channel } = cluster;
    const memoTone = POST_IT_TONES[idx % POST_IT_TONES.length];
    const title = formatSingleLineTitle(primary.title, 38) || `핵심 상업용 부동산 이슈 #${idx + 1}`;
    const brief = formatAxiosBrief(primary.summary, {
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
      const title = formatSingleLineTitle(r.title, 44);
      if (!title) continue;
      const channel = resolveNewsChannel({
        title,
        summary: typeof r.brief === 'string' ? r.brief : '',
        topic: typeof r.topic === 'string' ? r.topic : '',
        channel: typeof r.channel === 'string' ? r.channel : '',
      });
      const brief = formatAxiosBrief(r.brief ?? r.summary, { title, channel });
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
          typeof r.articleCount === 'number' && r.articleCount >= 1 ? r.articleCount : Math.max(1, sources.length),
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
    const title = formatSingleLineTitle(r.title, 44);
    if (!title) continue;
    const channel = resolveNewsChannel({
      title,
      summary: typeof r.summary === 'string' ? r.summary : '',
      topic: typeof r.topic === 'string' ? r.topic : '',
      channel: typeof r.channel === 'string' ? r.channel : '',
    });
    const brief = formatAxiosBrief(r.summary, { title, channel });
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
