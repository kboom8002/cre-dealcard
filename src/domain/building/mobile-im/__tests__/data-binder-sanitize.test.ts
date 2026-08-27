import { describe, test, expect } from 'vitest';
import { sanitizePersona, stripMarkdown } from '../pptx/data-binder';

describe('data-binder sanitize', () => {
  describe('sanitizePersona', () => {
    test('연령대 기반 타겟팅(60대, 70대, MZ 등)을 제거한다', () => {
      const input = '이 물건은 60대 자산가를 위한 최고의 투자처입니다.';
      const result = sanitizePersona(input);
      expect(result).toBe('이 물건은 최고의 투자처입니다.');
      
      const input2 = 'MZ세대 투자자 맞춤형 빌딩입니다.';
      const result2 = sanitizePersona(input2);
      expect(result2).toBe('MZ세대 빌딩입니다.'); // "투자자 맞춤형" gets caught by "투자자 맞춤"
    });

    test('역할 기반 타겟팅(자산가, 법인대표, 디벨로퍼 등)을 제거한다', () => {
      const input = '법인 대표에게 추천하는 오피스입니다.';
      const result = sanitizePersona(input);
      expect(result).toBe('오피스입니다.');

      const input2 = '시행사 맞춤 부지입니다.';
      const result2 = sanitizePersona(input2);
      expect(result2).toBe('부지입니다.');
    });

    test('새로운 표현(novel expressions)에 대해 범용 캐치올 패턴이 작동한다', () => {
      const input = '자산가 전용 꼬마빌딩입니다.';
      const result = sanitizePersona(input);
      expect(result).toBe('꼬마빌딩입니다.');

      const input2 = '외국인 맞춤형 매물입니다.';
      const result2 = sanitizePersona(input2);
      expect(result2).toBe('매물입니다.');
    });
  });

  describe('stripMarkdown (CRE Lexicon Replacements)', () => {
    test('측레이트(캡 레이트) → 연 순수익률(Cap Rate)로 대체한다', () => {
      const input = '이 건물의 캡 레이트는 4.5%입니다.';
      const result = stripMarkdown(input);
      expect(result).toBe('이 건물의 연 순수익률(Cap Rate)는 4.5%입니다.');
    });

    test('네이밍 라이츠 → 사옥 단독 명칭 표기(간판 설치권)로 대체한다', () => {
      const input = '네이밍 라이츠 확보가 가능합니다.';
      const result = stripMarkdown(input);
      expect(result).toBe('사옥 단독 명칭 표기(간판 설치권) 확보가 가능합니다.');
    });

    test('테넌트 인센티브 → 인테리어 지원금(TI)로 대체한다', () => {
      const input = '테넌트 인센티브를 제공합니다.';
      const result = stripMarkdown(input);
      expect(result).toBe('인테리어 지원금(TI)를 제공합니다.');
    });

    test('정상적인 텍스트는 수정 없이 통과시킨다', () => {
      const input = '강남역 도보 3분 거리에 위치한 초역세권 빌딩입니다.';
      const result = stripMarkdown(input);
      expect(result).toBe('강남역 도보 3분 거리에 위치한 초역세권 빌딩입니다.');
    });
  });
});
