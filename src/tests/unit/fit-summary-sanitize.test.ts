import { describe, it, expect } from 'vitest';
import { sanitizeFitSummary, sanitizeFitSummaryKeepNull } from '@/domain/building/mobile-im/fit-summary-sanitize';

describe('sanitizeFitSummary', () => {
  it('누적된 라벨 접두어를 모두 제거', () => {
    const accumulated = '운영 자산 브랜드: 운영 자산 브랜드: 운영 자산 브랜드: 입지 가치 및 접근성: 역세권 대로변 입지입니다.';
    expect(sanitizeFitSummary(accumulated)).toBe('역세권 대로변 입지입니다.');
  });
  it('bold 라벨/불릿 형태도 제거', () => {
    expect(sanitizeFitSummary('• **사옥 브랜드 가치**: 우량 사옥')).toBe('우량 사옥');
  });
  it('본문 문장·숫자 포함 문장은 유지', () => {
    expect(sanitizeFitSummary('서울 영등포구 소재 오피스로, 역세권입니다.')).toBe('서울 영등포구 소재 오피스로, 역세권입니다.');
    expect(sanitizeFitSummary('매각 희망가 100억: 협의 가능')).toBe('매각 희망가 100억: 협의 가능');
  });
  it('멱등: 두 번 적용해도 동일', () => {
    const once = sanitizeFitSummary('운영 자산 브랜드: 운영 자산 브랜드: 입지 우수');
    expect(sanitizeFitSummary(once)).toBe(once);
  });
  it('재생성 시뮬레이션: 라벨 부착→역동기화 반복해도 안정', () => {
    let fit = '입지 우수';
    for (let i = 0; i < 5; i++) {
      const bullet = `**운영 자산 브랜드**: ${sanitizeFitSummary(fit)}`; // template
      fit = sanitizeFitSummary(bullet); // approve 역동기화
    }
    expect(fit).toBe('입지 우수');
  });
  it('null/비문자열 처리', () => {
    expect(sanitizeFitSummary(null)).toBe('');
    expect(sanitizeFitSummaryKeepNull(null)).toBeNull();
  });
});
