import { describe, it, expect } from 'vitest';
import { sanitizePersonaInGoldenIM } from '../persona-sanitizer';

describe('Persona Sanitizer (Implicit Persona Principle)', () => {
  it('strips "60대 자산가를 위한" pattern', () => {
    const input = '60대 자산가를 위한 수익형 빌딩 투자 가이드';
    expect(sanitizePersonaInGoldenIM(input)).toBe('수익형 빌딩 투자 가이드');
  });

  it('strips "법인 대표 맞춤" pattern', () => {
    const input = '법인 대표 맞춤 사옥 이전 검토 보고서';
    expect(sanitizePersonaInGoldenIM(input)).toBe('사옥 이전 검토 보고서');
  });

  it('strips "VIP 고객용" pattern', () => {
    const input = 'VIP 고객용 강남 오피스 자산 분석';
    expect(sanitizePersonaInGoldenIM(input)).toBe('강남 오피스 자산 분석');
  });

  it('strips "초보 투자자에게 추천하는" pattern', () => {
    const input = '초보 투자자에게 추천하는 소형 근생 빌딩';
    expect(sanitizePersonaInGoldenIM(input)).toBe('소형 근생 빌딩');
  });

  it('strips "30대 매수자의 관점" pattern', () => {
    const input = '30대 매수자의 관점 밸류애드 리모델링 전략';
    expect(sanitizePersonaInGoldenIM(input)).toBe('밸류애드 리모델링 전략');
  });

  it('preserves clean text without persona phrases intact', () => {
    const clean = '역삼역 도보 3분 초역세권 신축급 오피스 빌딩';
    expect(sanitizePersonaInGoldenIM(clean)).toBe(clean);
  });
});
