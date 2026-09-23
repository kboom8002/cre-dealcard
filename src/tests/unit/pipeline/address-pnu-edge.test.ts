/**
 * @file address-pnu-edge.test.ts
 * @description Unit tests for Address and PNU parsing functions
 *              Validates mountain (산) parcels, complex jibun with dong numbers, multi-PNU extraction, and padding
 *              Rule 7 (Negative Pair 의무) & Rule 57 (Real PNU Mandate) 준수
 */

import { describe, it, expect } from 'vitest';
import {
  parseJibunAddress,
  padNumber,
  extract19DigitPnus,
} from '@/lib/external/address-resolver';

describe('Address & PNU Parsing Edge Case Tests', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. 지번 주소 파싱 (parseJibunAddress)
  // ─────────────────────────────────────────────────────────────
  describe('1. parseJibunAddress Parsing', () => {
    it('[Positive] 동 번호가 포함된 복합 주소(당산동5가 11-47)에서 본번/부번을 정확히 분리해야 함', async () => {
      const parsed = parseJibunAddress('영등포구 당산동5가 11-47');
      expect(parsed).not.toBeNull();
      expect(parsed?.bun).toBe('11');
      expect(parsed?.ji).toBe('47');
      expect(parsed?.isMount).toBe(false);
    });

    it('[Positive] 산지 지번(관악구 남현동 산 1-1)에서 isMount=true 및 본번/부번을 추출해야 함', async () => {
      const parsed = parseJibunAddress('관악구 남현동 산 1-1');
      expect(parsed).not.toBeNull();
      expect(parsed?.bun).toBe('1');
      expect(parsed?.ji).toBe('1');
      expect(parsed?.isMount).toBe(true);
    });

    it('[Positive] 부번이 없는 단일 본번 지번(마포구 대흥동 12)에서 ji를 0으로 파싱해야 함', async () => {
      const parsed = parseJibunAddress('마포구 대흥동 12');
      expect(parsed).not.toBeNull();
      expect(parsed?.bun).toBe('12');
      expect(parsed?.ji).toBe('0');
      expect(parsed?.isMount).toBe(false);
    });

    it('[Positive] 산지 주소에 띄어쓰기가 변칙적인 경우(신원동 산12-3)도 정상 인식해야 함', async () => {
      const parsed = parseJibunAddress('서초구 신원동 산12-3');
      expect(parsed).not.toBeNull();
      expect(parsed?.bun).toBe('12');
      expect(parsed?.ji).toBe('3');
      expect(parsed?.isMount).toBe(true);
    });

    it('[Negative Pair] 지번 숫자가 전혀 없는 행정구역 주소는 null을 반환해야 함', async () => {
      const parsed = parseJibunAddress('서울특별시 강남구');
      expect(parsed).toBeNull();
    });

    it('[Negative Pair] 빈 문자열 입력 시 크래시 없이 null을 반환해야 함', async () => {
      expect(parseJibunAddress('')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. 4자리 숫자 패딩 (padNumber)
  // ─────────────────────────────────────────────────────────────
  describe('2. padNumber 4-digit Padding', () => {
    it('[Positive] 1~4자리 숫자를 4자리 앞 0으로 정확히 패딩해야 함', async () => {
      expect(padNumber('1')).toBe('0001');
      expect(padNumber(11)).toBe('0011');
      expect(padNumber('652')).toBe('0652');
      expect(padNumber('1338')).toBe('1338');
    });

    it('[Negative Pair] 숫자가 아닌 입력이나 NaN은 기본 0000으로 안전 폴백해야 함', async () => {
      expect(padNumber('invalid')).toBe('0000');
      expect(padNumber(NaN)).toBe('0000');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Multi-PNU 및 19자리 유효 PNU 추출 (extract19DigitPnus)
  // ─────────────────────────────────────────────────────────────
  describe('3. Multi-PNU Extraction (extract19DigitPnus)', () => {
    const PNU_1 = '1156011700100720001';
    const PNU_2 = '1156011700100720002';

    it('[Positive] 쉼표 및 공백으로 구분된 복수 PNU 문자열에서 정확히 19자리 PNU들을 추출해야 함', async () => {
      const input = `${PNU_1}, ${PNU_2}`;
      const result = extract19DigitPnus(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(PNU_1);
      expect(result[1]).toBe(PNU_2);
    });

    it('[Positive] 배열 형태로 전달된 PNU 목록도 정상 처리해야 함', async () => {
      const result = extract19DigitPnus([PNU_1, PNU_2]);
      expect(result).toHaveLength(2);
      expect(result).toEqual([PNU_1, PNU_2]);
    });

    it('[Negative Pair] 19자리가 아닌 잘못된 토큰(5자리 시군구코드, 오탈자 등)은 필터링되어야 함', async () => {
      const input = `${PNU_1}, 11560, INVALID_TOKEN, ${PNU_2}`;
      const result = extract19DigitPnus(input);
      expect(result).toHaveLength(2);
      expect(result).toEqual([PNU_1, PNU_2]);
    });

    it('[Negative Pair] 빈 문자열 또는 undefined 입력 시 빈 배열을 반환해야 함', async () => {
      expect(extract19DigitPnus('')).toEqual([]);
      expect(extract19DigitPnus(undefined)).toEqual([]);
    });
  });
});
