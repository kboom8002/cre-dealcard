/**
 * E3 Part3 골든 결함 수정 단위 테스트
 *  ① 근거 없는 점수 숫자(NN/100) 비노출  ② cre_mag_vid 단일 출처(투표 전후 동일)  ④ 뉴스 표시 정리 · 온도 색 일치
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanNewsSummaryText,
  cleanNewsTitle,
  cleanScoreText,
  filterKeyStatsByEvidence,
  getOrCreateVisitorId,
  hasScoreEvidence,
  MARKET_TEMP_VIEW,
  pickTopNews,
  topicLabelKo,
} from '@/lib/magazine/view-helpers';
import { MARKET_TEMP_CONFIG } from '@/domain/magazine/types';
import {
  isValidVisitorId,
  resolveVisitorId,
  VISITOR_ID_STORAGE_KEY,
} from '@/lib/magazine/visitor-id';
import { sanitizeVisitorId } from '@/lib/magazine/poll-helpers';
import { topicLabel } from '@/lib/magazine/editor-labels';

const REAL_EVIDENCE = {
  generation: { model: 'gemini', isMock: false, totalTokens: 1200 },
  sentiment: { score: 62, status: '중립 이상', asOf: '2026-09-20', items: [{ keyword: '성수', score: 60 }] },
};

describe('① 점수 근거 판정 hasScoreEvidence', () => {
  it('generation + 비어 있지 않은 sentiment.items + asOf 가 모두 있을 때만 true', () => {
    expect(hasScoreEvidence(REAL_EVIDENCE)).toBe(true);
  });
  it('레거시 합성 점수(generation 없음, items=[])는 false', () => {
    expect(hasScoreEvidence({ sentiment: { score: 62, status: '중립 이상', items: [] } })).toBe(false);
    expect(hasScoreEvidence({ sentiment: { score: 62, asOf: '2026-09-20', items: [{ k: 1 }] } })).toBe(false);
  });
  it('mock 생성이거나 기준일이 없으면 false', () => {
    expect(hasScoreEvidence({ ...REAL_EVIDENCE, generation: { isMock: true } })).toBe(false);
    expect(hasScoreEvidence({ ...REAL_EVIDENCE, sentiment: { ...REAL_EVIDENCE.sentiment, asOf: '' } })).toBe(false);
    expect(hasScoreEvidence({ ...REAL_EVIDENCE, sentiment: { ...REAL_EVIDENCE.sentiment, items: undefined } })).toBe(false);
  });
  it('잘못된 형태(null/배열/문자열)에도 던지지 않는다', () => {
    expect(hasScoreEvidence({})).toBe(false);
    expect(hasScoreEvidence({ generation: [], sentiment: null })).toBe(false);
    expect(hasScoreEvidence({ generation: 'x', sentiment: 'y' })).toBe(false);
  });
});

describe('① keyStats 필터 filterKeyStatsByEvidence', () => {
  const stats = [
    { label: '투자자 심리', value: '62/100', accent: 'emerald' },
    { label: '시장 상태', value: '매수 과열' },
    { label: '실거래', value: '12건' },
  ];
  it('근거 없으면 NN/100 지표와 파생된 시장 상태를 제거하고 나머지는 유지', () => {
    expect(filterKeyStatsByEvidence(stats, false).map((s) => s.label)).toEqual(['실거래']);
  });
  it('근거 있으면 그대로', () => {
    expect(filterKeyStatsByEvidence(stats, true)).toHaveLength(3);
  });
  it('점수가 아닌 값은 건드리지 않는다 (날짜·분수)', () => {
    const ok = [{ label: '기준', value: '2026/10/05' }, { label: '공실률', value: '3.2%' }];
    expect(filterKeyStatsByEvidence(ok, false)).toHaveLength(2);
  });
});

describe('① 본문 토큰 제거 cleanScoreText', () => {
  it('문장은 유지하고 NN/100 토큰만 제거', () => {
    const out = cleanScoreText('이번 주 심리는 62/100 으로 중립 이상입니다. 거래는 관망세입니다.', false);
    expect(out).not.toMatch(/\d+\s*\/\s*100/);
    expect(out).toContain('중립 이상입니다.');
    expect(out).toContain('거래는 관망세입니다.');
  });
  it('빈 괄호·중복 공백 정리, 줄바꿈 보존', () => {
    const out = cleanScoreText('## 심리\n투자자 심리(62/100)가 상승\n\n- 항목  A', false) as string;
    expect(out).not.toContain('62');
    expect(out).not.toContain('()');
    expect(out.split('\n').length).toBe(4);
  });
  it('근거가 있으면 원문 그대로', () => {
    expect(cleanScoreText('심리 62/100', true)).toBe('심리 62/100');
  });
  it('토큰이 없으면 마크다운 들여쓰기도 그대로(불필요한 변형 없음)', () => {
    const md = '- 상위\n    - 하위  두칸';
    expect(cleanScoreText(md, false)).toBe(md);
  });
  it('null/undefined 안전, 날짜·비율은 유지', () => {
    expect(cleanScoreText(undefined, false)).toBeUndefined();
    expect(cleanScoreText(null, false)).toBeNull();
    expect(cleanScoreText('2026/10/05 에 1/1000 비율', false)).toBe('2026/10/05 에 1/1000 비율');
  });
});

describe('② cre_mag_vid 단일 출처 — 투표 전후 ID 동일', () => {
  function makeStore() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }
  afterEach(() => vi.unstubAllGlobals());

  it('열람 추적(resolveVisitorId) → 투표(getOrCreateVisitorId) → 다시 추적: 같은 ID, 저장 형식은 JSON 하나', () => {
    const store = makeStore();
    vi.stubGlobal('window', { localStorage: store });
    const tracked = resolveVisitorId(store);
    expect(tracked).not.toBeNull();
    const rawBefore = store.getItem(VISITOR_ID_STORAGE_KEY);
    const voteId = getOrCreateVisitorId();
    const rawAfter = store.getItem(VISITOR_ID_STORAGE_KEY);
    expect(voteId).toBe(tracked);
    expect(rawAfter).toBe(rawBefore); // 투표 후에도 저장값 불변
    expect(resolveVisitorId(store)).toBe(tracked);
    const parsed = JSON.parse(rawAfter as string) as { id: string; createdAt: number };
    expect(isValidVisitorId(parsed.id)).toBe(true);
  });

  it('투표가 먼저여도 열람 추적이 같은 ID 를 이어받는다', () => {
    const store = makeStore();
    vi.stubGlobal('window', { localStorage: store });
    const voteId = getOrCreateVisitorId();
    expect(resolveVisitorId(store)).toBe(voteId);
    expect(getOrCreateVisitorId()).toBe(voteId);
  });

  it('투표 API 가 받는 형식(sanitizeVisitorId)을 만족한다', () => {
    const store = makeStore();
    vi.stubGlobal('window', { localStorage: store });
    const id = getOrCreateVisitorId();
    expect(sanitizeVisitorId(id)).toBe(id);
  });

  it('저장소 접근이 막혀도 문자열을 돌려주고 cre_mag_vid 에 쓰지 않는다', () => {
    const blocked = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    vi.stubGlobal('window', { localStorage: blocked });
    const id = getOrCreateVisitorId();
    expect(typeof id).toBe('string');
    expect(sanitizeVisitorId(id)).toBe(id);
  });

  it('view-helpers 는 같은 함수를 노출할 뿐 자체 구현·키를 두지 않는다', async () => {
    const mod = await import('@/lib/magazine/visitor-id');
    expect(getOrCreateVisitorId).toBe(mod.getOrCreateVisitorId);
  });
});

describe('④ 뉴스 표시 정리', () => {
  it('제목: &quot; 엔티티 디코드 + [매체] 접두 제거', () => {
    expect(cleanNewsTitle('[한경] &quot;공실 늘었다&quot; 강남 오피스')).toBe('"공실 늘었다" 강남 오피스');
    expect(cleanNewsTitle('&amp;quot;이중&amp;quot;')).toBe('"이중"');
    expect(cleanNewsTitle(undefined)).toBe('');
  });
  it('요약: "핵심 팩트: A | 브로커 임플리케이션: B" → "A"', () => {
    expect(cleanNewsSummaryText('핵심 팩트: 임차 문의 증가 | 브로커 임플리케이션: 선별 검토 | 추천 액션: 문의')).toBe('임차 문의 증가');
    expect(cleanNewsSummaryText('핵심 팩트: &quot;금리 동결&quot;')).toBe('"금리 동결"');
    expect(cleanNewsSummaryText('일반 요약 문장입니다.')).toBe('일반 요약 문장입니다.');
    expect(cleanNewsSummaryText(null)).toBe('');
  });
  it('pickTopNews 가 표시 시점에 제목·요약을 정리한다', () => {
    const [n] = pickTopNews({
      topNews: [{ title: '&quot;매각&quot; 증가', summary: '핵심 팩트: 거래 증가 | 브로커 임플리케이션: x', source: '연합', topic: 'transaction', sentiment: 'bullish' }],
    });
    expect(n.title).toBe('"매각" 증가');
    expect(n.summary).toBe('거래 증가');
    expect(n.summary).not.toContain('|');
  });
  it('토픽 라벨: 거래/임대/시장 동향이 에디터 라벨과 동일(혼용 방지)', () => {
    for (const k of ['transaction', 'rental', 'market_trend', 'finance', 'regulation', 'development']) {
      expect(topicLabelKo(k)).toBe(topicLabel(k));
    }
    expect(topicLabelKo('transaction')).not.toBe(topicLabelKo('rental'));
    expect(topicLabelKo('희귀 토픽')).toBe('희귀 토픽'); // 알 수 없는 값은 원문 유지
  });
});

describe('④ 시장 온도 색 — 이모지 사각형 색과 일치', () => {
  const dominant = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  it('적극 매수=초록, 선별 매수=노랑, 관망=파랑, 조정 대기=주황, 위기 경계=빨강', () => {
    const g = dominant(MARKET_TEMP_VIEW['적극 매수'].color);
    expect(g.g).toBeGreaterThan(g.r);
    expect(g.g).toBeGreaterThan(g.b);
    const y = dominant(MARKET_TEMP_VIEW['선별 매수'].color);
    expect(y.r).toBeGreaterThan(200); expect(y.g).toBeGreaterThan(150); expect(y.b).toBeLessThan(80);
    const b = dominant(MARKET_TEMP_VIEW['관망'].color);
    expect(b.b).toBeGreaterThan(b.r);
    expect(b.b).toBeGreaterThan(b.g);
    const o = dominant(MARKET_TEMP_VIEW['조정 대기'].color);
    expect(o.r).toBeGreaterThan(o.g);
    expect(o.g).toBeGreaterThan(o.b);
    expect(o.g).toBeGreaterThan(80); // 빨강보다 노랑 쪽(주황)
    const r = dominant(MARKET_TEMP_VIEW['위기 경계'].color);
    expect(r.r).toBeGreaterThan(200); expect(r.g).toBeLessThan(100); expect(r.b).toBeLessThan(100);
  });
  it('뷰어·도메인 색이 같고 서로 다른 5색', () => {
    const keys = Object.keys(MARKET_TEMP_VIEW);
    for (const k of keys) expect(MARKET_TEMP_VIEW[k].color).toBe(MARKET_TEMP_CONFIG[k as keyof typeof MARKET_TEMP_CONFIG].color);
    expect(new Set(keys.map((k) => MARKET_TEMP_VIEW[k].color)).size).toBe(5);
  });
});
