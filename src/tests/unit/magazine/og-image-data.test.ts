import { describe, it, expect } from 'vitest';
import {
  IMAGE_CACHE_CONTROL,
  IMAGE_SIZES,
  NEUTRAL_CACHE_CONTROL,
  buildImageModel,
  isSuspectStatValue,
  parseImageFormat,
  validateImageParams,
} from '@/lib/magazine/og-image-data';
import { latinSafe } from '@/lib/magazine/og-fonts';
import { clip } from '@/lib/magazine/og-image-render';

describe('og-image-data: 파라미터 검증 (M2-25, S2-24)', () => {
  const NOW = new Date('2026-10-05T03:00:00Z'); // KST 2026-10-05 12:00

  it('format: 기본값, 허용값, 비허용값(null)', () => {
    expect(parseImageFormat(undefined, 'story')).toBe('story');
    expect(parseImageFormat('', 'og')).toBe('og');
    expect(parseImageFormat('card', 'story')).toBe('card');
    expect(parseImageFormat('og', 'story')).toBe('og');
    expect(parseImageFormat('png', 'story')).toBeNull();
    expect(parseImageFormat('../etc', 'story')).toBeNull();
  });

  it('brokerId: slug/uuid 허용, 경로 조작·특수문자 거부', () => {
    expect(validateImageParams('test-broker-kim', '2026-10-05', NOW)).toEqual({
      ok: true,
      brokerId: 'test-broker-kim',
      date: '2026-10-05',
    });
    expect(validateImageParams('0b9b6c1e-6a2f-4c75-9f1b-3d2c5e7a8b90', '2026-10-05', NOW).ok).toBe(true);
    for (const bad of ['../x', 'a,b', 'x)', '', null, undefined, 'A B', 'a/b', '%2e%2e']) {
      const r = validateImageParams(bad as string, '2026-10-05', NOW);
      expect(r).toEqual({ ok: false, reason: 'broker' });
    }
  });

  it('date: 누락 시 오늘(KST), 형식오류·비실존·미래 거부', () => {
    expect(validateImageParams('test-broker-kim', undefined, NOW)).toMatchObject({ ok: true, date: '2026-10-05' });
    // UTC 로는 10-04 지만 KST 로는 10-05 인 시각 (KST 단일 유틸 사용 확인)
    const lateUtc = new Date('2026-10-04T22:00:00Z');
    expect(validateImageParams('test-broker-kim', undefined, lateUtc)).toMatchObject({ ok: true, date: '2026-10-05' });
    for (const bad of ['abc.undefined', '2026-13-01', '2026-02-30', '20261005', '2026-10-06']) {
      expect(validateImageParams('test-broker-kim', bad, NOW)).toEqual({ ok: false, reason: 'date' });
    }
  });
});

describe('og-image-data: 캐시·크기 정책 (함정 #14, 실측 회귀 보호)', () => {
  it('발행본 이미지는 1년 immutable 이 아니다', () => {
    expect(IMAGE_CACHE_CONTROL).toBe('public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    expect(IMAGE_CACHE_CONTROL).not.toMatch(/immutable|31536000/);
    expect(NEUTRAL_CACHE_CONTROL).not.toMatch(/immutable|31536000/);
  });
  it('이미지 크기: og 1200×630 / story 1080×1920 / card 1080×1080', () => {
    expect(IMAGE_SIZES.og).toEqual({ width: 1200, height: 630 });
    expect(IMAGE_SIZES.story).toEqual({ width: 1080, height: 1920 });
    expect(IMAGE_SIZES.card).toEqual({ width: 1080, height: 1080 });
  });
});

describe('buildImageModel: 가짜 폴백 없음 + 지번 마스킹 (P0-05, M2-02)', () => {
  const base = { headline: '10월 첫째 주 시장 브리핑' };

  it('제목이 없는 발행본은 null (플레이스홀더로 채우지 않음)', () => {
    expect(buildImageModel({}, null, '2026-10-05')).toBeNull();
    expect(buildImageModel({ headline: '  ' }, null, '2026-10-05')).toBeNull();
  });

  it('브로커 정보가 없으면 이름/전화는 null — 가짜 브로커를 만들지 않는다', () => {
    const m = buildImageModel(base, null, '2026-10-05')!;
    expect(m.brokerName).toBeNull();
    expect(m.company).toBeNull();
    expect(m.phone).toBeNull();
    expect(JSON.stringify(m)).not.toMatch(/JS 부동산|010-0000-0000|47/);
  });

  it('정확한 지번은 동 단위로 마스킹', () => {
    const m = buildImageModel(
      { ...base, dealHighlights: [{ title: '역삼 꼬마빌딩', address: '서울 강남구 역삼동 123-45' }] },
      null,
      '2026-10-05',
    )!;
    expect(m.deals).toHaveLength(1);
    expect(m.deals[0].address).toBe('서울 강남구 역삼동');
    expect(JSON.stringify(m)).not.toMatch(/123-45/);
  });

  it('알려진 가짜 수치(62/100) 지표는 제외, 나머지 지표는 유지', () => {
    expect(isSuspectStatValue('62/100')).toBe(true);
    expect(isSuspectStatValue('62 / 100 매수 과열')).toBe(true);
    expect(isSuspectStatValue('3건')).toBe(false);
    const m = buildImageModel(
      {
        ...base,
        keyStats: [
          { label: '투자자 심리', value: '62/100', accent: 'emerald' },
          { label: '활성 매물', value: '3건', accent: 'indigo' },
        ],
      },
      null,
      '2026-10-05',
    )!;
    expect(m.stats).toEqual([{ label: '활성 매물', value: '3건', accent: 'indigo' }]);
  });

  it('알 수 없는 market_temp 는 표시하지 않고, 알려진 값은 유지', () => {
    expect(buildImageModel({ ...base, market_temp: '이상한값' }, null, '2026-10-05')!.marketTemp).toBeNull();
    expect(buildImageModel({ ...base, market_temp: '관망' }, null, '2026-10-05')!.marketTemp).toBe('관망');
  });

  it('브리핑은 마크다운 기호 제거, 날짜 라벨은 입력 날짜 기준', () => {
    const m = buildImageModel(
      { ...base, ai_briefing: '## 제목\n이번 주 서울 상업용 부동산 거래가 **소폭 증가**했습니다.' },
      null,
      '2026-10-05',
    )!;
    expect(m.briefing).toBe('이번 주 서울 상업용 부동산 거래가 소폭 증가했습니다.');
    expect(m.dateLabel).toBe('2026.10.05');
  });
});

describe('한글 폰트 부재 시 안전 처리 (latinSafe)', () => {
  it('폰트가 있으면 원문 그대로', () => {
    expect(latinSafe('시장 온도: 관망', true)).toBe('시장 온도: 관망');
  });
  it('폰트가 없으면 한글을 제거해 □ 대신 영문/숫자만 남긴다', () => {
    expect(latinSafe('2026년 10월 CRE 브리핑', false)).toBe('2026 10 CRE');
  });
  it('영숫자가 남지 않으면 폴백 문구 사용', () => {
    expect(latinSafe('시장 온도: 관망', false, 'Market')).toBe('Market');
    expect(latinSafe('관망', false)).toBe('');
  });
});

describe('clip', () => {
  it('길이 초과 시 말줄임, 이하이면 원문', () => {
    expect(clip('가나다라마', 5)).toBe('가나다라마');
    expect(clip('가나다라마바', 5)).toBe('가나다라…');
  });
});
