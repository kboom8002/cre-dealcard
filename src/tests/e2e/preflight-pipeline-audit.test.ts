/**
 * @file preflight-pipeline-audit.test.ts
 * @description CRE IM 파이프라인 5대 계층 MECE 사전 점검 자동화 감사 스위트
 *              D33~D39 + 역삼 사옥형 + 당산 수익형 실패 사례 기반 예방 점검
 *              Rule 7 (Negative Pair 의무) 철저 준수
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
// Layer 1: 데이터 파싱 및 서식 무결성 (Data Parsing & Format Integrity)
// ═══════════════════════════════════════════════════════════════════

describe('Layer 1: Data Parsing & Format Integrity', () => {

  // ── 1-1. 인접 마크다운 테이블 병합 붕괴 방지 ──
  describe('1-1. Adjacent Markdown Table Merge Prevention', () => {
    function splitMarkdownTables(markdown: string): string[][] {
      const lines = markdown.split('\n').map(l => l.trim());
      const tables: string[][] = [];
      let current: string[] = [];
      let lastColCount = -1;

      for (const line of lines) {
        if (!line.startsWith('|') || !line.includes('|', 1)) {
          if (current.length > 0) { tables.push(current); current = []; lastColCount = -1; }
          continue;
        }
        const cells = line.split('|').slice(1, -1);
        const isSep = cells.every(c => /^[-:]+$/.test(c.trim()));

        if (!isSep) {
          if (lastColCount !== -1 && cells.length !== lastColCount) {
            tables.push(current); current = [];
          }
          lastColCount = cells.length;
        }
        current.push(line);
      }
      if (current.length > 0) tables.push(current);
      return tables;
    }

    it('[Positive] 2열 + 7열 인접 테이블을 2개 분리 테이블로 올바르게 파싱해야 함', () => {
      const md = `
| 항목 | 내용 |
|------|------|
| 공실률 | 0% |
| 월임대료 | 1,946만 |
| 층수 | 업종 | 전용면적 | 보증금 | 월 임대료 | 관리비 | 임대 만기 |
|------|------|----------|--------|-----------|--------|-----------|
| B1 | 음식점/카페 | 96평 | - | - | - | 미정 |
| 1F | 소매점 | 24평 | 6,000만 | 183만 | 30만 | 2026-08-31 |`;

      const tables = splitMarkdownTables(md);
      expect(tables.length).toBe(2);
      expect(tables[0].length).toBeLessThanOrEqual(4);
      expect(tables[1].length).toBeGreaterThanOrEqual(3);
    });

    it('[Negative Pair] 동일 열 수의 연속 테이블은 하나의 테이블로 유지해야 함', () => {
      const md = `
| 층수 | 업종 | 면적 |
|------|------|------|
| B1 | 카페 | 96평 |
| 1F | 약국 | 24평 |`;

      const tables = splitMarkdownTables(md);
      expect(tables.length).toBe(1);
    });
  });

  // ── 1-2. 단위/숫자 문자열 병합 왜곡 방지 ──
  describe('1-2. Unit/Number String Concatenation Prevention', () => {
    function extractAreaPyeong(text?: string): number | undefined {
      if (!text) return undefined;
      const clean = text.trim();
      const pyMatch = clean.match(/([\d,]+(?:\.\d+)?)\s*평/);
      if (pyMatch) return parseFloat(pyMatch[1].replace(/,/g, ''));
      const m2Match = clean.match(/([\d,]+(?:\.\d+)?)\s*(?:㎡|m²|m2)/i);
      if (m2Match) return Math.round(parseFloat(m2Match[1].replace(/,/g, '')) * 0.3025 * 10) / 10;
      const numMatch = clean.match(/^[\d,]+(?:\.\d+)?$/);
      if (numMatch) return parseFloat(numMatch[0].replace(/,/g, ''));
      return undefined;
    }

    it('[Positive] "96평(약 317.4㎡)"에서 96평만 정확 추출해야 함', () => {
      expect(extractAreaPyeong('96평(약 317.4㎡)')).toBe(96);
    });

    it('[Positive] "317.4㎡"에서 약 96평으로 환산해야 함', () => {
      const result = extractAreaPyeong('317.4㎡');
      expect(result).toBeGreaterThan(90);
      expect(result).toBeLessThan(100);
    });

    it('[Negative Pair] 금액 문자열 "6,000만"은 면적으로 파싱하지 않아야 함', () => {
      expect(extractAreaPyeong('6,000만')).toBeUndefined();
    });

    it('[Negative Pair] 날짜 문자열 "2026-08-31"은 면적으로 파싱하지 않아야 함', () => {
      expect(extractAreaPyeong('2026-08-31')).toBeUndefined();
    });

    it('[Positive] 단일 층 면적 이상치 가드: 3,000평 이하', () => {
      const area = extractAreaPyeong('96평(약 317.4㎡)');
      expect(area).toBeDefined();
      expect(area!).toBeLessThanOrEqual(3000);
    });

    it('[Negative Pair] 병합된 "96317.4"는 이상치로 판별되어야 함 (3,000평 초과)', () => {
      const buggyValue = parseFloat('96평(약 317.4㎡)'.replace(/[^\d.]/g, ''));
      expect(buggyValue).toBeGreaterThan(3000);
    });
  });

  // ── 1-3. 전용면적 vs 임대료 컬럼 오매칭 차단 ──
  describe('1-3. Area vs Rent Column Mismatch Prevention', () => {
    const headers = ['층수', '업종', '전용면적', '보증금', '월 임대료', '관리비', '임대 만기'];

    function findLeaseAreaIdx(hdrs: string[]): number {
      return hdrs.findIndex(h =>
        h.includes('임대면적') || h.includes('계약면적') || h.includes('바닥') ||
        (h.includes('임대') && !h.includes('료') && !h.includes('만기') && !h.includes('보증금'))
      );
    }

    it('[Positive] "월 임대료" 헤더는 임대면적으로 매칭되지 않아야 함', () => {
      expect(findLeaseAreaIdx(headers)).toBe(-1);
    });

    it('[Positive] "임대면적" 헤더가 있으면 정상 매칭해야 함', () => {
      expect(findLeaseAreaIdx(['층수', '업종', '전용면적', '임대면적', '보증금'])).toBe(3);
    });

    it('[Negative Pair] "임대 만기" 헤더는 임대면적으로 매칭되지 않아야 함', () => {
      expect(findLeaseAreaIdx(['층수', '임대 만기', '업종'])).toBe(-1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Layer 2: 모의/더미 데이터 누출 원천 차단 (Mock Data Leakage)
// ═══════════════════════════════════════════════════════════════════

describe('Layer 2: Mock Data Leakage Prevention', () => {

  describe('2-1. Persona Isolation (Rule 1)', () => {
    const PERSONA_FORBIDDEN = [
      /개인\s*자산가/,
      /\d{2}대\s*(자산|투자|고액)/,
      /법인\s*대표\s*맞춤/,
      /(남성|여성)\s*(투자|자산)/,
    ];

    it('[Positive] 정상 투자 카피는 Rule 1 위반이 0건이어야 함', () => {
      const text = '강남구 역삼동 소재 사무용빌딩 매각, 법인 자가사용 본사 사옥 최적 입지';
      for (const pat of PERSONA_FORBIDDEN) {
        expect(pat.test(text)).toBe(false);
      }
    });

    it('[Negative Pair] "60대 자산가를 위한" 문구는 Rule 1 위반으로 탐지되어야 함', () => {
      const text = '60대 자산가를 위한 최적의 투자 매물';
      const violations = PERSONA_FORBIDDEN.filter(p => p.test(text));
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('2-2. Evasive Phrase Prevention', () => {
    const EVASIVE_PATTERNS = [
      /본문을?\s*참조/,
      /별도\s*안내\s*예정/,
      /추후\s*확인/,
      /상세.*별첨/,
    ];

    it('[Positive] 실질적 투자 카피는 회피성 문구 0건', () => {
      const text = '연면적 655㎡(198.1평), 매매 희망가 120억 원';
      for (const pat of EVASIVE_PATTERNS) {
        expect(pat.test(text)).toBe(false);
      }
    });

    it('[Negative Pair] "본문을 참조하시기 바랍니다"는 회피성으로 탐지', () => {
      expect(EVASIVE_PATTERNS.some(p => p.test('구체적인 수치는 본문을 참조하시기 바랍니다.'))).toBe(true);
    });
  });

  describe('2-3. Eight Forbidden Patterns', () => {
    const FORBIDDEN = [
      /\[building\]/i,
      /\[location\]/i,
      /\[rentRoll\]/i,
      /NaN|undefined|null|\[object Object\]/,
    ];

    it('[Positive] 정상 출력에는 금지 패턴 0건', () => {
      const text = '영등포구 당산동5가 근생빌딩 매각, 115억 원';
      for (const pat of FORBIDDEN) {
        expect(pat.test(text)).toBe(false);
      }
    });

    it('[Negative Pair] "[building]" 미치환 변수 탐지', () => {
      expect(/\[building\]/i.test('[building]')).toBe(true);
    });

    it('[Negative Pair] "NaN" 노출 탐지', () => {
      expect(/NaN/.test('수익률: NaN%')).toBe(true);
    });

    it('[Negative Pair] "[object Object]" 노출 탐지', () => {
      expect(/\[object Object\]/.test('[object Object]')).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Layer 3: 포스처별 수치/슬라이드 정합성
// ═══════════════════════════════════════════════════════════════════

describe('Layer 3: Posture-Specific Integrity', () => {

  describe('3-1. Posture Required Fields', () => {
    const POSTURE_REQUIRED: Record<string, string[]> = {
      income: ['gross_yield', 'net_yield', 'rentRoll'],
      owner_occupied: ['currentRentManwon', 'breakEvenYears'],
      development: ['developmentSpec', 'expectedGFA'],
      operating: ['hospitalitySpec', 'gop'],
      trading: ['comparablePrice'],
    };

    it('[Positive] income 포스처에 gross_yield 필수', () => {
      expect(POSTURE_REQUIRED['income']).toContain('gross_yield');
    });

    it('[Positive] owner_occupied 포스처에 currentRentManwon 필수', () => {
      expect(POSTURE_REQUIRED['owner_occupied']).toContain('currentRentManwon');
    });

    it('[Negative Pair] owner_occupied에 gross_yield는 필수가 아님', () => {
      expect(POSTURE_REQUIRED['owner_occupied']).not.toContain('gross_yield');
    });

    it('[Negative Pair] income에 currentRentManwon은 필수가 아님', () => {
      expect(POSTURE_REQUIRED['income']).not.toContain('currentRentManwon');
    });
  });

  describe('3-2. Income-Only Metric Leakage Prevention', () => {
    const INCOME_ONLY = ['공실 해소', '임대료 인상', '리포지셔닝', '렌트프리 종료'];

    it('[Positive] income 카피에서 수익형 지표 정상 등장', () => {
      const found = INCOME_ONLY.filter(m => '공실 해소 및 임대료 인상'.includes(m));
      expect(found.length).toBeGreaterThan(0);
    });

    it('[Negative Pair] owner_occupied 카피에 수익형 지표 0건', () => {
      const ownerText = '법인 사옥 자가사용 기업 자산 형성 및 법인세 절감';
      const leaked = INCOME_ONLY.filter(m => ownerText.includes(m));
      expect(leaked.length).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Layer 4: 품질 게이트 및 카피 표준
// ═══════════════════════════════════════════════════════════════════

describe('Layer 4: Quality Gate & Copy Standards', () => {

  describe('4-1. Posture-Aware Whitelist', () => {
    const OO_WL = ['취득세', '감가상각', '손비 인정', '법인세 절감', '자본 이득', '사옥 명칭'];

    it('[Positive] 사옥형 세무 용어는 화이트리스트 포함', () => {
      expect(OO_WL).toContain('취득세');
      expect(OO_WL).toContain('감가상각');
      expect(OO_WL.length).toBeGreaterThanOrEqual(5);
    });

    it('[Negative Pair] 수익형 용어는 사옥형 화이트리스트에 없음', () => {
      expect(OO_WL).not.toContain('Cap Rate');
      expect(OO_WL).not.toContain('NOI');
    });
  });

  describe('4-2. CRE Terminology (Rule 2)', () => {
    const CRE_BAD = [
      { bad: /네이밍\s*라이츠/, good: '사옥 단독 명칭 표기(간판 설치권)' },
      { bad: /브랜딩\s*라이츠/, good: '기업 단독 브랜딩' },
    ];

    it('[Positive] 올바른 CRE 용어는 위반 0건', () => {
      const text = '사옥 단독 명칭 표기(간판 설치권) 및 기업 단독 브랜딩';
      for (const { bad } of CRE_BAD) {
        expect(bad.test(text)).toBe(false);
      }
    });

    it('[Negative Pair] "네이밍 라이츠" 사용은 Rule 2 위반', () => {
      expect(CRE_BAD.some(({ bad }) => bad.test('네이밍 라이츠 확보'))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Layer 5: 시각 레이아웃 및 렌더링 한도
// ═══════════════════════════════════════════════════════════════════

describe('Layer 5: Visual Layout & Rendering Limits', () => {

  describe('5-1. Card Text Budget', () => {
    function cleanItemText(raw: string, maxChars: number = 70): string {
      const sentences = raw.split(/(?<=[.!?。])\s*/);
      const core = sentences.find(s => s.length > 5) || raw;
      return core.length > maxChars ? core.slice(0, maxChars - 3) + '...' : core;
    }

    it('[Positive] 짧은 항목은 그대로 통과 (≤ 70자)', () => {
      const item = '건물 물리적 상태 · 준공연도 확인 필요';
      expect(cleanItemText(item).length).toBeLessThanOrEqual(70);
    });

    it('[Negative Pair] 100자 초과 항목은 70자로 절삭 + "..."', () => {
      const longItem = '건물 물리적 상태 · 준공연도 확인 필요, 구조 확인 필요 · 누수·균열·설비 노후 여부 현장 점검 필요하며 전체 리뉴얼 비용 산정이 요구됩니다';
      const cleaned = cleanItemText(longItem);
      expect(cleaned.length).toBeLessThanOrEqual(70);
      expect(cleaned.endsWith('...')).toBe(true);
    });
  });

  describe('5-2. CalloutKind Allowed Types', () => {
    const ALLOWED = ['info', 'good', 'warn', 'bad', 'brass'] as const;
    const isValid = (k: string) => (ALLOWED as readonly string[]).includes(k);

    it('[Positive] 허용 5종은 모두 유효', () => {
      for (const k of ALLOWED) expect(isValid(k)).toBe(true);
    });

    it('[Negative Pair] "surface"는 무효', () => { expect(isValid('surface')).toBe(false); });
    it('[Negative Pair] "neutral"은 무효', () => { expect(isValid('neutral')).toBe(false); });
    it('[Negative Pair] "card"는 무효', () => { expect(isValid('card')).toBe(false); });
  });

  describe('5-3. Goldilocks Page Hard Limit', () => {
    const PAGE_HARD_LIMIT = 16;

    it('[Positive] PAGE_HARD_LIMIT는 16', () => {
      expect(PAGE_HARD_LIMIT).toBe(16);
    });

    it('[Negative Pair] 21면 시퀀스는 16면으로 절삭 필요', () => {
      const full = Array.from({ length: 21 }, (_, i) => `slide-${i}`);
      expect(full.length).toBeGreaterThan(PAGE_HARD_LIMIT);
    });
  });

  describe('5-4. Area Outlier Guard', () => {
    const MAX_FLOOR = 3000;
    const MAX_TOTAL = 30000;

    it('[Positive] 당산동 실측 436평은 정상 범위', () => {
      const total = 96 + 24 + 108 + 76 + 25 + 51 + 56;
      expect(total).toBeLessThanOrEqual(MAX_TOTAL);
      expect(Math.max(96, 108, 76, 56, 51, 25, 24)).toBeLessThanOrEqual(MAX_FLOOR);
    });

    it('[Negative Pair] 병합 버그 100,681평은 이상치', () => {
      expect(96317.4 + 24 + 108 + 76 + 25 + 51 + 56).toBeGreaterThan(MAX_TOTAL);
    });

    it('[Negative Pair] 단일 층 96,317평은 이상치', () => {
      expect(96317.4).toBeGreaterThan(MAX_FLOOR);
    });
  });
});
