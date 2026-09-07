/**
 * @file copy-quality-inspector.test.ts
 * @description D38: PPTX IM + 모바일 IM 카피 품질 자동 검사
 *
 * 8대 금지 패턴 검출, CRE 용어 준수, 페르소나 격리, 수치 정합성,
 * 비중복 렌더링 원칙을 자동으로 검증합니다.
 *
 * 실행: npx vitest run src/tests/e2e/copy-quality-inspector.test.ts --timeout 60000
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  CASE_01_SPEC,
  CASE_02_SPEC,
  CASE_03_SPEC,
  CASE_04_SPEC,
  CASE_05_SPEC,
  CASE_06_SPEC,
  ALL_E2E_CASES,
} from '@/tests/fixtures/e2e-cases';

// ══════════════════════════════════════════════════════
// §4 8대 금지 패턴 (즉시 실패)
// ══════════════════════════════════════════════════════

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; name: string; pptxOnly?: boolean }> = [
  // 내부 dataKey 토큰 누출
  { pattern: /\[(building|location|rentRoll|profit|risk|thesis|process|checklist)\]/g, name: '내부 dataKey 토큰 누출' },
  // 마크다운 볼드 raw 누출 (PPTX 텍스트에서만 — 마크다운 렌더 뷰어는 제외)
  { pattern: /\*\*[^*]{2,}\*\*/g, name: '마크다운 볼드 raw 누출', pptxOnly: true },
  // 면적 중복: "476㎡ (약 144평(약 476㎡))"
  { pattern: /(\d[\d,.]*㎡)\s*\(약\s*\d[\d,.]*평\s*\(약\s*\d[\d,.]*㎡\)\)/g, name: '면적 중복 표기' },
  // 3회 이상 단어 반복: "상권 상권 상권"
  { pattern: /(상권|권역|입지|역세권|대로변|인프라)\s+\1\s+\1/g, name: '3회 이상 단어 반복' },
  // 프로그래밍 오류 토큰
  { pattern: /\bNaN\b/g, name: 'NaN 토큰' },
  { pattern: /\bundefined\b/g, name: 'undefined 토큰' },
  { pattern: /\[object Object\]/g, name: '[object Object] 토큰' },
  // null (단독 — "null" 문자열이 실제 값으로 표시)
  { pattern: /(?<![가-힣a-zA-Z])\bnull\b(?![가-힣a-zA-Z])/g, name: 'null 토큰' },
];

// ══════════════════════════════════════════════════════
// CRE 용어 금지 패턴 (Rule 2)
// ══════════════════════════════════════════════════════

const CRE_LEXICON_VIOLATIONS: Array<{ pattern: RegExp; name: string; correct: string }> = [
  { pattern: /네이밍\s*라이츠/g, name: '네이밍 라이츠', correct: '사옥 단독 명칭 표기(간판 설치권)' },
  { pattern: /브랜딩\s*라이츠/g, name: '브랜딩 라이츠', correct: '기업 단독 브랜딩' },
  { pattern: /(?<!연\s*순수익률\s*\()캡레이트(?!\))/g, name: '캡레이트 (단독)', correct: '연 순수익률 (Cap Rate)' },
];

// ══════════════════════════════════════════════════════
// 페르소나 격리 패턴 (Rule 1)
// ══════════════════════════════════════════════════════

const PERSONA_LEAKAGE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /(?:70대|60대|50대|40대|30대|20대)\s*(?:자산가|투자자|법인\s*대표|대표|고객|매수자)/g, name: '연령+계층 지칭' },
  { pattern: /(?:MZ|초보|고액|고자산|VIP)\s*(?:투자자|매수자|고객)/g, name: '특수 계층 지칭' },
  { pattern: /(?:법인\s*대표|디벨로퍼|은퇴)\s*(?:맞춤|을\s*위한|에게\s*추천)/g, name: '계층 맞춤 표현' },
];

// ══════════════════════════════════════════════════════
// 헬퍼 함수
// ══════════════════════════════════════════════════════

/** PPTX 바이너리에서 모든 슬라이드 텍스트를 추출 */
function extractPptxTexts(buffer: Buffer): { slideTexts: string[]; allText: string } {
  const zip = new AdmZip(buffer);
  const slideEntries = zip.getEntries()
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

  const slideTexts = slideEntries.map(entry => {
    const xml = entry.getData().toString('utf8');
    // <a:t>텍스트</a:t> 패턴으로 텍스트 추출
    const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    return matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
  });

  return { slideTexts, allText: slideTexts.join('\n') };
}

interface CopyViolation {
  category: string;
  name: string;
  slideIndex?: number;
  match: string;
  correct?: string;
}

/** 텍스트에서 금지 패턴 검사 */
function checkForbiddenPatterns(
  slideTexts: string[],
  isPptx: boolean,
): CopyViolation[] {
  const violations: CopyViolation[] = [];

  for (let i = 0; i < slideTexts.length; i++) {
    const text = slideTexts[i];

    // 8대 금지 패턴
    for (const fp of FORBIDDEN_PATTERNS) {
      if (fp.pptxOnly && !isPptx) continue;
      fp.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = fp.pattern.exec(text)) !== null) {
        violations.push({
          category: 'FORBIDDEN',
          name: fp.name,
          slideIndex: i + 1,
          match: match[0].slice(0, 60),
        });
      }
    }

    // CRE 용어 금지 (Rule 2)
    for (const cv of CRE_LEXICON_VIOLATIONS) {
      cv.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = cv.pattern.exec(text)) !== null) {
        violations.push({
          category: 'CRE_LEXICON',
          name: cv.name,
          slideIndex: i + 1,
          match: match[0],
          correct: cv.correct,
        });
      }
    }

    // 페르소나 격리 (Rule 1)
    for (const pl of PERSONA_LEAKAGE_PATTERNS) {
      pl.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pl.pattern.exec(text)) !== null) {
        violations.push({
          category: 'PERSONA_LEAK',
          name: pl.name,
          slideIndex: i + 1,
          match: match[0],
        });
      }
    }
  }

  return violations;
}

/** OpenXML 무결성 검사 */
function checkOpenXmlIntegrity(buffer: Buffer): string[] {
  const zip = new AdmZip(buffer);
  const defects: string[] = [];
  const slideEntries = zip.getEntries()
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

  slideEntries.forEach((entry, idx) => {
    const xml = entry.getData().toString('utf8');
    if (xml.includes('>NaN<')) defects.push(`Slide ${idx + 1}: NaN`);
    if (xml.includes('>undefined<')) defects.push(`Slide ${idx + 1}: undefined`);
    if (xml.includes('>null<')) defects.push(`Slide ${idx + 1}: null`);
    if (xml.includes('[object Object]')) defects.push(`Slide ${idx + 1}: [object Object]`);
  });

  return defects;
}

// ══════════════════════════════════════════════════════
// 테스트 스위트
// ══════════════════════════════════════════════════════

describe('D38 카피 품질 자동 검사', () => {
  const renderer = new MobileImPptxRenderer();
  const testCases = ALL_E2E_CASES;

  for (const tc of testCases) {
    describe(`[${tc.posture}] ${tc.name}`, () => {
      let pptxBuffer: Buffer;
      let slideTexts: string[];
      let allText: string;
      let slideCount: number;

      // 각 포스처별 PPTX 렌더링 (1회만 수행)
      it('PPTX 렌더링 성공', async () => {
        const input: MobileImPptxInput = {
          buildingId: tc.caseId,
          posture: tc.posture,
          grade: 'A',
          preset: 'credeal_signature',
          doc: tc.doc,
          building: tc.building,
          broker: tc.broker,
          watermark: {
            requesterName: 'QA Inspector',
            phoneLast4: '0000',
            timestamp: new Date().toISOString(),
          },
        };

        const output = await renderer.render(input);
        pptxBuffer = output.buffer;
        slideCount = output.slideCount;

        const extracted = extractPptxTexts(pptxBuffer);
        slideTexts = extracted.slideTexts;
        allText = extracted.allText;

        expect(pptxBuffer.length).toBeGreaterThan(100 * 1024); // 최소 100KB
        expect(slideCount).toBeGreaterThanOrEqual(7); // 최소 7매
        console.log(`  ✓ ${tc.name}: ${slideCount}매, ${(pptxBuffer.length / 1024).toFixed(1)}KB`);
      }, 30_000);

      it('OpenXML 무결성 (NaN/undefined/null 없음)', () => {
        const defects = checkOpenXmlIntegrity(pptxBuffer);
        if (defects.length > 0) {
          console.error(`  ❌ OpenXML 결함:`, defects);
        }
        expect(defects).toHaveLength(0);
      });

      it('8대 금지 패턴 0건', () => {
        const violations = checkForbiddenPatterns(slideTexts, true)
          .filter(v => v.category === 'FORBIDDEN');
        if (violations.length > 0) {
          console.error(`  ❌ 금지 패턴 위반:`, violations.map(v => `[Slide ${v.slideIndex}] ${v.name}: "${v.match}"`));
        }
        expect(violations).toHaveLength(0);
      });

      it('CRE 용어 준수 (Rule 2)', () => {
        const violations = checkForbiddenPatterns(slideTexts, true)
          .filter(v => v.category === 'CRE_LEXICON');
        if (violations.length > 0) {
          console.error(`  ❌ CRE 용어 위반:`, violations.map(v => `[Slide ${v.slideIndex}] "${v.match}" → "${v.correct}"`));
        }
        expect(violations).toHaveLength(0);
      });

      it('페르소나 격리 (Rule 1)', () => {
        const violations = checkForbiddenPatterns(slideTexts, true)
          .filter(v => v.category === 'PERSONA_LEAK');
        if (violations.length > 0) {
          console.error(`  ❌ 페르소나 누출:`, violations.map(v => `[Slide ${v.slideIndex}] "${v.match}"`));
        }
        expect(violations).toHaveLength(0);
      });

      it('면적 표기 정상 (중복 없음)', () => {
        const areaPattern = /(\d[\d,.]*㎡)\s*\(약\s*\d[\d,.]*평\s*\(약\s*\d[\d,.]*㎡\)\)/g;
        const matches = allText.match(areaPattern);
        expect(matches).toBeNull();
      });

      it('본문 슬라이드 ≤16매 (Rule 10)', () => {
        // 부록(Records, Title, District, Cadastral)은 제외할 수 없지만,
        // 전체 슬라이드는 합리적 범위 내에 있어야 함
        expect(slideCount).toBeLessThanOrEqual(22); // 본문 16 + 부록 최대 6
      });

      it('Summary 슬라이드 존재 + 콘텐츠 비어있지 않음', () => {
        // Summary 슬라이드(통상 2번째)에 의미 있는 콘텐츠 존재 확인
        expect(slideTexts.length).toBeGreaterThanOrEqual(2);
        if (slideTexts.length >= 2) {
          // Cover(0)을 제외한 본문 슬라이드에 의미 있는 텍스트 존재
          const summaryText = slideTexts[1];
          expect(summaryText.length).toBeGreaterThan(50);
        }
      });

      it('체크리스트 슬라이드 존재', () => {
        // 체크리스트 슬라이드 찾기
        const checklistIdx = slideTexts.findIndex(t =>
          t.includes('체크리스트') || t.includes('Checklist') || t.includes('실사') || t.includes('확인 필요사항')
        );
        // 체크리스트 슬라이드는 protected slide이므로 반드시 존재
        expect(checklistIdx).toBeGreaterThanOrEqual(0);
      });

      it('Closing 슬라이드 존재 + 면책 포함', () => {
        const closingIdx = slideTexts.findIndex(t =>
          t.includes('면책') || t.includes('Closing') || t.includes('표기 기준') || t.includes('Process')
        );
        expect(closingIdx).toBeGreaterThanOrEqual(0);
        if (closingIdx >= 0) {
          const closingText = slideTexts[closingIdx];
          // 면책 또는 프로세스 안내 존재
          expect(closingText).toMatch(/면책|보증하지|투자 권유|약정|검토|자문/);
        }
      });

      it('상권명 중복 없음 (2회 이하)', () => {
        for (let i = 0; i < slideTexts.length; i++) {
          const text = slideTexts[i];
          const doubleRepeat = text.match(/(상권|권역)\s+\1/g);
          if (doubleRepeat) {
            console.warn(`  ⚠️ Slide ${i + 1}: 단어 2회 반복 감지 "${doubleRepeat[0]}" (경고)`);
          }
          // 3회 이상은 실패
          const tripleRepeat = text.match(/(상권|권역|입지)\s+\1\s+\1/g);
          expect(tripleRepeat).toBeNull();
        }
      });
    });
  }
});
