/**
 * Part3 골든 결함 수정 회귀: (2) 이미지 요약에 '62/100' 점수 토큰 유입, (3) 스토리 매물 행 중복
 * ('양평동 · 양평동' / '매각가 · 매각가') + 공용 stripSyntheticScore 규칙.
 */
import { describe, it, expect } from 'vitest';
import { buildImageModel, normalizeDeal } from '@/lib/magazine/og-image-data';
import { dealRowText } from '@/lib/magazine/og-image-render';
import { hasSyntheticScore, stripSyntheticScore } from '@/lib/magazine/strip-synthetic-score';

const base = { headline: '2026년 9월 시장 점검' };

describe('stripSyntheticScore (공용 규칙)', () => {
  it('NN/100 변형 제거', () => {
    expect(stripSyntheticScore('투자자 심리 62/100 으로 과열')).toBe('투자자 심리 으로 과열');
    expect(stripSyntheticScore('점수 62 / 100점 입니다')).toBe('점수 입니다');
    expect(stripSyntheticScore('심리(62/100)가 높다')).toBe('심리가 높다');
    expect(stripSyntheticScore('62.5/100')).toBe('');
  });
  it('날짜·비율·다른 분수는 보존', () => {
    expect(stripSyntheticScore('2026/10/05 기준')).toBe('2026/10/05 기준');
    expect(stripSyntheticScore('1/1000 비율, 3/100m 거리')).toBe('1/1000 비율, 3/100m 거리');
    expect(stripSyntheticScore('공실률 9.4%')).toBe('공실률 9.4%');
  });
  it('hasSyntheticScore 감지 · 줄바꿈 보존 · 반복 호출 안전', () => {
    expect(hasSyntheticScore('x 62/100')).toBe(true);
    expect(hasSyntheticScore('x 62/100')).toBe(true);
    expect(hasSyntheticScore('2026/10/05')).toBe(false);
    expect(stripSyntheticScore('첫 줄 62/100\n둘째 줄')).toBe('첫 줄\n둘째 줄');
  });
});

describe('buildImageModel — 브리핑에서 점수 토큰 제거 (Part3 ②)', () => {
  it('ai_briefing 속 62/100 이 이미지 요약에 남지 않는다', () => {
    const m = buildImageModel(
      { ...base, ai_briefing: '이번 주 투자자 심리는 62/100 으로 중립 이상 구간이며 거래는 관망세입니다.' },
      null,
      '2026-10-05',
    );
    expect(m?.briefing).toBeTruthy();
    expect(m?.briefing).not.toMatch(/62\s*\/\s*100/);
    expect(m?.briefing).toContain('중립 이상 구간');
  });
  it('점수 토큰만 있는 줄은 요약에서 사라진다', () => {
    const m = buildImageModel(
      { ...base, ai_briefing: '심리 점수 62/100\n관망세가 이어지며 거래량은 줄었습니다.' },
      null,
      '2026-10-05',
    );
    expect(m?.briefing).not.toMatch(/\d+\s*\/\s*100/);
    expect(m?.briefing).toContain('관망세');
  });
});

describe('매물 행 중복 제거 (Part3 ③)', () => {
  it('제목 없이 주소만 있으면 title 은 비고 한 번만 표시', () => {
    const m = buildImageModel(
      { ...base, dealHighlights: [{ address: '서울 마포구 양평동 123-4', price: '50억대' }] },
      null,
      '2026-10-05',
    );
    expect(m?.deals).toEqual([{ title: '', address: '서울 마포구 양평동' }]);
    expect(dealRowText(m!.deals[0].title, m!.deals[0].address)).toBe('서울 마포구 양평동');
  });
  it('제목=주소(공백 차이 무시)면 한 번만', () => {
    expect(normalizeDeal('양평동', '양평동')).toEqual({ title: '', address: '양평동' });
    expect(normalizeDeal('서울 양평동', '서울양평동')?.title).toBe('');
    expect(dealRowText('양평동', '양평동')).toBe('양평동');
  });
  it("라벨만 들어온 '매각가 · 매각가' 행은 버린다", () => {
    expect(normalizeDeal('매각가', '매각가')).toBeNull();
    const m = buildImageModel(
      { ...base, dealHighlights: [{ title: '매각가', address: '매각가' }, { title: '역삼 꼬마빌딩', address: '서울 강남구 역삼동 1-2' }] },
      null,
      '2026-10-05',
    );
    expect(m?.deals).toEqual([{ title: '역삼 꼬마빌딩', address: '서울 강남구 역삼동' }]);
  });
  it('제목+주소가 다르면 기존대로 "제목 · 주소"', () => {
    expect(dealRowText('역삼 꼬마빌딩', '서울 강남구 역삼동')).toBe('역삼 꼬마빌딩 · 서울 강남구 역삼동');
  });
});
