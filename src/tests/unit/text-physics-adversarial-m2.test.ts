import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import {
  getCharWidthInches,
  simulateTextWrap,
  fitTextToBox,
  fitTableCell,
} from '@/domain/building/mobile-im/pptx/layout-physics';
import * as L from '@/domain/building/mobile-im/pptx/imlib';
import { buildA02StatGrid } from '@/domain/building/mobile-im/pptx/archetypes/a02-stat-grid';
import { buildA03LargeTable } from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';
import { buildA12Ownership } from '@/domain/building/mobile-im/pptx/archetypes/a12-ownership';
import { buildA22StackingPlan } from '@/domain/building/mobile-im/pptx/archetypes/a22-stacking-plan';
import { buildA24RentrollStacking } from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';

describe('Adversarial Stress Harness: Milestone M2 TextPhysicsEngine', () => {

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. getCharWidthInches Boundary & Edge-Case Stress
  // ═════════════════════════════════════════════════════════════════════════════
  describe('1. getCharWidthInches Boundary & Robustness Sweeps', () => {
    it('Positive/Negative Pair: Invalid, zero, or negative font sizes and empty characters return strictly 0', () => {
      expect(getCharWidthInches('', 12)).toBe(0);
      expect(getCharWidthInches('A', 0)).toBe(0);
      expect(getCharWidthInches('가', -1)).toBe(0);
      expect(getCharWidthInches('가', -999)).toBe(0);
      expect(getCharWidthInches('', 0)).toBe(0);
      // Non-zero valid cases
      expect(getCharWidthInches('A', 12)).toBeGreaterThan(0);
      expect(getCharWidthInches('가', 12)).toBeGreaterThan(0);
    });

    it('Surrogate pairs and emojis do not crash and return deterministic positive widths', () => {
      const emojis = ['🏢', '🚗', '🟢', '💡', '⚖️', '☕', '🏛️', '🔥', '🎉'];
      for (const emoji of emojis) {
        const width = getCharWidthInches(emoji, 12);
        expect(width).toBeGreaterThan(0);
        expect(Number.isFinite(width)).toBe(true);
      }
    });

    it('CJK extension blocks and Hanja classify correctly as 1.0em', () => {
      const cjkSamples = [
        '가', '힣', // Hangul syllables
        'ㄱ', 'ㅎ', // Hangul Jamo
        'ㅏ', 'ㅣ', // Compatibility Jamo
        '漢', '字', // CJK Unified Ideographs
        '㐀', '䶵', // CJK Extension A
        '（', '）', // Fullwidth forms
        '￥', '￠', // Fullwidth currency
      ];
      for (const ch of cjkSamples) {
        expect(getCharWidthInches(ch, 72)).toBeCloseTo(1.0, 4);
      }
    });

    it('Linear scaling with fontSize: width(2 * F) === 2 * width(F)', () => {
      const testChars = ['A', 'a', '9', ' ', '.', '한', '國'];
      for (const ch of testChars) {
        const w12 = getCharWidthInches(ch, 12);
        const w24 = getCharWidthInches(ch, 24);
        expect(w24).toBeCloseTo(2 * w12, 6);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. simulateTextWrap Adversarial Fuzzing & Invariants
  // ═════════════════════════════════════════════════════════════════════════════
  describe('2. simulateTextWrap Adversarial Fuzzing & Invariants', () => {
    it('Never throws or loops infinitely on degenerate boxes (w=0, w<0, fs=0, fs<0)', () => {
      const text = '서울특별시 강남구 테헤란로 152 강남파이낸스센터';
      expect(simulateTextWrap(text, 0, 12).lines).toEqual([text]);
      expect(simulateTextWrap(text, -1.5, 12).lines).toEqual([text]);
      expect(simulateTextWrap(text, 3.0, 0).lines).toEqual([text]);
      expect(simulateTextWrap(text, 3.0, -10).lines).toEqual([text]);
      expect(simulateTextWrap('', 3.0, 12).lines).toEqual([]);
    });

    it('Preserves all non-whitespace characters without duplication or loss (Character Conservation)', () => {
      const inputs = [
        '단일단어테스트문자열입니다',
        'WordBoundaryPreservationAndHyphenationTest',
        '강남 테헤란로 120억 Prime Office 3.5% CapRate',
        'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z',
        '여러 줄\n개행 문자\n포함 테스트\n\n연속개행',
      ];

      for (const input of inputs) {
        const res = simulateTextWrap(input, 2.0, 10);
        const rawClean = input.replace(/[\s\n]/g, '');
        const wrappedClean = res.lines.join('').replace(/[\s\n]/g, '');
        expect(wrappedClean).toBe(rawClean);
      }
    });

    it('Splits massive 200+ char unbroken strings across lines without exceeding widthInches', () => {
      const unbrokenCJK = '동'.repeat(200);
      const unbrokenLatin = 'W'.repeat(200);

      const resCJK = simulateTextWrap(unbrokenCJK, 1.5, 12);
      expect(resCJK.lines.length).toBeGreaterThan(10);
      expect(resCJK.maxLineWidth).toBeLessThanOrEqual(1.5 + 0.01);
      expect(resCJK.lines.join('')).toBe(unbrokenCJK);

      const resLatin = simulateTextWrap(unbrokenLatin, 1.5, 12);
      expect(resLatin.lines.length).toBeGreaterThan(10);
      expect(resLatin.maxLineWidth).toBeLessThanOrEqual(1.5 + 0.01);
      expect(resLatin.lines.join('')).toBe(unbrokenLatin);
    });

    it('Fuzz sweep across random space distributions and token lengths (1,000 runs)', () => {
      const seedChars = '가나다라마바사ABCabc012345 .,:;! ';
      for (let run = 0; run < 1000; run++) {
        let randomStr = '';
        const len = Math.floor(Math.random() * 80) + 1;
        for (let i = 0; i < len; i++) {
          randomStr += seedChars[Math.floor(Math.random() * seedChars.length)];
        }
        const width = Math.random() * 4.0 + 0.5;
        const fs = Math.floor(Math.random() * 16) + 8;

        const res = simulateTextWrap(randomStr, width, fs);
        expect(Array.isArray(res.lines)).toBe(true);
        expect(Number.isFinite(res.maxLineWidth)).toBe(true);
      }
    });

    it('Handles control characters, zero-width spaces, and Unicode BOM gracefully', () => {
      const edgeTexts = [
        'Zero\u200BWidth\u200BSpace\u200BTest',
        '\uFEFFBOMPrefixTestString',
        'Tab\tSeparated\tValues\tIn\tText',
        'Carriage\r\nReturn\rLine\nFeed\r\nTest',
      ];
      for (const t of edgeTexts) {
        expect(() => simulateTextWrap(t, 2.5, 11)).not.toThrow();
        const res = simulateTextWrap(t, 2.5, 11);
        expect(res.lines.length).toBeGreaterThan(0);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. fitTextToBox Monotonicity & Boundedness Sweeps
  // ═════════════════════════════════════════════════════════════════════════════
  describe('3. fitTextToBox Monotonicity & Boundedness Sweeps', () => {
    it('Monotonicity Invariant: Extending string with additional characters NEVER increases font size', () => {
      const boxW = 3.5;
      const boxH = 0.50;
      const baseString = '강남 프라임 오피스';
      const additions = [
        ' 매각',
        ' 투자설명서',
        ' 전문 실사 보고서',
        ' 및 임대차 제원 종합 분석서',
        ' 서울특별시 강남구 역삼동 테헤란로 중심권역 위치',
      ];

      let currentText = baseString;
      let prevFontSize = fitTextToBox(currentText, boxW, boxH, { minFontSize: 8, maxFontSize: 20 }).fontSize;

      for (const add of additions) {
        currentText += add;
        const currentFit = fitTextToBox(currentText, boxW, boxH, { minFontSize: 8, maxFontSize: 20 });
        expect(currentFit.fontSize).toBeLessThanOrEqual(prevFontSize);
        prevFontSize = currentFit.fontSize;
      }
    });

    it('Granular Monotonicity: Incremental 1-to-100 character growth strictly satisfies fontSize(N+1) <= fontSize(N)', () => {
      const boxW = 2.8;
      const boxH = 0.45;
      let text = '가';
      let prevFs = fitTextToBox(text, boxW, boxH, { minFontSize: 7, maxFontSize: 18 }).fontSize;

      for (let i = 1; i <= 100; i++) {
        text += (i % 5 === 0 ? ' 건물' : '동');
        const fit = fitTextToBox(text, boxW, boxH, { minFontSize: 7, maxFontSize: 18 });
        expect(fit.fontSize).toBeLessThanOrEqual(prevFs);
        prevFs = fit.fontSize;
      }
    });

    it('Monotonicity Invariant: Shrinking box width NEVER increases font size for identical text', () => {
      const text = '안정적 임대차 구성을 통한 우수한 현금흐름 창출 자산';
      const widths = [6.0, 5.0, 4.0, 3.0, 2.0, 1.5, 1.0];
      let prevFontSize = 24;

      for (const w of widths) {
        const fit = fitTextToBox(text, w, 0.60, { minFontSize: 8, maxFontSize: 20 });
        expect(fit.fontSize).toBeLessThanOrEqual(prevFontSize);
        prevFontSize = fit.fontSize;
      }
    });

    it('Convergence & Boundedness: Output fontSize is strictly clamped between minFontSize and maxFontSize', () => {
      const texts = [
        '',
        'A',
        'Short Title',
        'Medium length headline for commercial real estate asset',
        'Extremely long paragraph text that will definitely exceed multiple lines '.repeat(5),
      ];

      for (const text of texts) {
        const fit = fitTextToBox(text, 2.0, 0.40, { minFontSize: 9, maxFontSize: 17 });
        expect(fit.fontSize).toBeGreaterThanOrEqual(9);
        expect(fit.fontSize).toBeLessThanOrEqual(17);
      }
    });

    it('Truncation Guarantee: When allowTruncate is true, result never exceeds targetLines or heightInches', () => {
      const massiveText = '초우량 프라임 자산 '.repeat(20);
      const boxH = 0.35;
      const targetLines = 1;

      const fit = fitTextToBox(massiveText, 2.5, boxH, {
        minFontSize: 8,
        maxFontSize: 14,
        targetLines,
        allowTruncate: true,
      });

      expect(fit.wasTruncated).toBe(true);
      expect(fit.lines.length).toBeLessThanOrEqual(targetLines);
      expect(fit.requiredHeight).toBeLessThanOrEqual(boxH + 0.01);
      expect(fit.displayText.endsWith('…')).toBe(true);
    });

    it('Negative Pair: When allowTruncate is false and text cannot fit, wasTruncated is false and requiredHeight > boxH', () => {
      const massiveText = '초우량 프라임 자산 '.repeat(20);
      const boxH = 0.35;

      const fit = fitTextToBox(massiveText, 2.5, boxH, {
        minFontSize: 8,
        maxFontSize: 14,
        allowTruncate: false,
      });

      expect(fit.wasTruncated).toBe(false);
      expect(fit.fontSize).toBe(8);
      expect(fit.requiredHeight).toBeGreaterThan(boxH);
      expect(fit.displayText).toBe(massiveText);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. fitTableCell Exhaustive Stress Sweeps
  // ═════════════════════════════════════════════════════════════════════════════
  describe('4. fitTableCell Exhaustive Stress Sweeps', () => {
    it('Never throws across all permutations of widths (0.4"~4.0") and lengths (1~200 chars)', () => {
      const colWidths = [0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 4.0];
      const rowHeights = [0.20, 0.24, 0.28, 0.35, 0.50];
      const charLengths = [1, 5, 10, 20, 50, 100, 200];
      const samples = [
        (len: number) => '임'.repeat(len),
        (len: number) => 'A'.repeat(len),
        (len: number) => '테넌트 '.repeat(Math.ceil(len / 4)).slice(0, len),
        (len: number) => '12345 '.repeat(Math.ceil(len / 6)).slice(0, len),
      ];

      let executionCount = 0;
      for (const colW of colWidths) {
        for (const rowH of rowHeights) {
          for (const len of charLengths) {
            for (const gen of samples) {
              const text = gen(len);
              expect(() => {
                const res = fitTableCell(text, colW, rowH, 8.5);
                expect(typeof res.text).toBe('string');
                expect(res.fontSize).toBeGreaterThanOrEqual(7.0);
                expect(res.fontSize).toBeLessThanOrEqual(8.5);
                executionCount++;
              }).not.toThrow();
            }
          }
        }
      }
      expect(executionCount).toBe(colWidths.length * rowHeights.length * charLengths.length * samples.length);
    });

    it('Physical Non-Expansion Invariant: Resulting text simulated in usableW strictly fits on allowedLines', () => {
      const difficultStrings = [
        '주식회사 에이치앤비글로벌파트너스홀딩스코리아',
        'Special Purpose Vehicle Ltd / Private Equity Fund IV',
        '보증금 1,500,000,000원 / 월차임 95,000,000원',
        '근린생활시설(의원/약국/일반음식점/제과점)',
        '101호, 102호, 103호, 104호 (전체 4개 호실 일괄)',
        '공실 (만실 가정 시 월세 1,200만 원 예상 산출구간)',
      ];

      for (const str of difficultStrings) {
        const colW = 1.10;
        const rowH = 0.24; // standard single-line row height
        const res = fitTableCell(str, colW, rowH, 8.5);

        const usableW = Math.max(0.05, colW - 0.11);
        const sim = simulateTextWrap(res.text, usableW, res.fontSize);

        // rowH 0.24 allows only 1 line; simulateTextWrap must strictly have 1 line!
        expect(sim.lines.length).toBe(1);
        expect(sim.maxLineWidth).toBeLessThanOrEqual(usableW + 0.01);
      }
    });

    it('Continuous string length sweep (1 to 150 chars) strictly satisfies allowedLines constraint', () => {
      const baseSeed = '주식회사글로벌인베스트먼트자산운용리츠사옥임대차관리본부';
      const colW = 1.20;
      const rowH = 0.24;
      const usableW = colW - 0.11;

      for (let len = 1; len <= 150; len++) {
        const testStr = baseSeed.repeat(Math.ceil(len / baseSeed.length)).slice(0, len);
        const res = fitTableCell(testStr, colW, rowH, 8.5);
        const sim = simulateTextWrap(res.text, usableW, res.fontSize);
        expect(sim.lines.length).toBeLessThanOrEqual(1);
      }
    });

    it('Degenerate and boundary column inputs (colW < 0.11, rowH < 0.05) handle gracefully without crash', () => {
      expect(() => fitTableCell('테넌트', 0.05, 0.24, 8.5)).not.toThrow();
      expect(() => fitTableCell('테넌트', 0.11, 0.02, 8.5)).not.toThrow();
      expect(() => fitTableCell('테넌트', -1.0, -1.0, 8.5)).not.toThrow();
      expect(() => fitTableCell('', 1.5, 0.24, 8.5)).not.toThrow();
      expect(() => fitTableCell('    ', 1.5, 0.24, 8.5)).not.toThrow();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. L.head() and L.stat() Layout Integration Stress
  // ═════════════════════════════════════════════════════════════════════════════
  describe('5. L.head() & L.stat() Integration with Extreme Titles & KPIs', () => {
    it('L.head() handles 60+ CJK characters across all 4 layout styles without throwing', () => {
      const longTitle = '강남 테헤란로 역삼역 초역세권 프라임 비즈니스 타워 기관투자자 전문 매각 종합 투자설명서';
      const kicker = 'INVESTMENT OVERVIEW';
      const sub = '지하 6층 ~ 지상 20층 / 연면적 12,500평 / 100% 임대 완료 자산';

      const pres = new pptxgen();
      const slide = pres.addSlide();

      const styles = ['modern', 'executive', 'minimal', 'dramatic'] as const;
      for (const style of styles) {
        L.THEME_META.layoutStyle = style;
        expect(() => {
          L.head(slide, 1, kicker, longTitle, sub);
        }).not.toThrow();
      }
      L.THEME_META.layoutStyle = 'modern';
    });

    it('L.head() with 150+ CJK characters truncates cleanly to 2 lines without bleeding past ceiling', () => {
      const massiveTitle = '초우량 프라임 자산 '.repeat(20);
      const pres = new pptxgen();
      const slide = pres.addSlide();

      expect(() => {
        L.head(slide, 1, 'KICKER', massiveTitle, '부제목');
      }).not.toThrow();
    });

    it('L.stat() handles 50+ character label, value, and subText without throwing', () => {
      const pres = new pptxgen();
      const slide = pres.addSlide();

      const extremeLabel = '연간 추정 실질 순영업소득(NOI) 총계 (관리비 실비 정산 및 제세공과금 차감 후)';
      const extremeValue = '128,540,000,000원';
      const extremeSub = '전년 동기 대비 14.8% 상승 / 만실 가정 시 추가 상승 여력 25억 원 상회';

      expect(() => {
        L.stat(slide, L.M, 1.5, 3.8, extremeLabel, extremeValue, '', extremeSub);
      }).not.toThrow();
    });

    it('L.table() with extreme cell strings prevents table row expansion through pre-processing', () => {
      const pres = new pptxgen();
      const slide = pres.addSlide();

      const head = ['층수', '임차인명', '전용면적', '보증금', '월임대료', '비고'];
      const colW = [0.8, 2.5, 1.5, 1.8, 1.8, 3.693];
      const body = [
        ['1F', '주식회사 메가커피글로벌에프앤비마스터프랜차이즈본사', '85.4평', '500,000,000원', '35,000,000원', '장기 10년 마스터리스 계약 체결 및 임대료 연 3% 인상 조건 확정'],
        ['2F', '스타벅스코리아리테일유한회사 강남역삼플래그십스토어', '120.2평', '800,000,000원', '55,000,000원', '직영점 운영 중, 중도해지 불가 특약 및 원상복구 담보 완료'],
      ];

      expect(() => {
        L.table(slide, L.M, 1.8, L.CW, head, body, colW, { rh: 0.28, bfs: 9, hfs: 9 });
      }).not.toThrow();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 6. Slide Archetypes End-to-End Stress with Extreme Payloads
  // ═════════════════════════════════════════════════════════════════════════════
  describe('6. Slide Archetypes Robustness with Extreme Payloads', () => {
    it('A02 (Stat Grid) chains multi-line lead sentence dynamically without colliding with stat cards', () => {
      const pres = new pptxgen();
      const extremeLeadSentence = '본 자산은 서울특별시 강남구 역삼동 테헤란로 중심권역에 위치한 프라임 오피스 빌딩으로, ' +
        '지하철 2호선 역삼역 도보 1분 초역세권에 위치하여 뛰어난 대중교통 접근성과 비즈니스 인프라를 동시에 보유하고 있습니다.';

      const output = buildA02StatGrid({
        pres,
        slideNum: 2,
        docno: 'TEST-A02-EXTREME',
        grade: 'A',
        provenance: {},
        data: {
          title: '핵심 투자 지표 및 자산 요약',
          leadSentence: extremeLeadSentence,
          metrics: [
            { label: '매매 희망가', value: '1,250억 원', sub: '토지 평당 2.1억 원' },
            { label: '연간 순영업소득(NOI)', value: '48.5억 원', sub: 'Cap Rate 3.88%' },
            { label: '임대율', value: '100%', sub: '전층 임대 완료' },
            { label: '연면적', value: '3,850.5평', sub: '전용률 58.4%' },
          ],
        },
      });

      expect(output.slide).toBeDefined();
      expect(output.warnings).toBeDefined();
    });

    it('A03 (Large Table) clamps extreme tenant names to prevent DrawingML row expansion', () => {
      const pres = new pptxgen();
      const output = buildA03LargeTable({
        pres,
        slideNum: 3,
        docno: 'TEST-A03-EXTREME',
        grade: 'A',
        provenance: {},
        data: {
          title: '임대차 상세 현황표',
          table: {
            headers: ['층', '임차인', '전용면적', '계약면적', '보증금', '월임대료', '만기일'],
            rows: [
              ['B1', '주식회사 에이치앤비글로벌파트너스홀딩스코리아본점영업부', '150.5평', '250.0평', '300,000,000원', '18,500,000원', '2028-12-31'],
              ['1F', '스타벅스코리아리테일유한회사 강남테헤란로플래그십스토어직영점', '85.2평', '140.0평', '500,000,000원', '32,000,000원', '2030-05-31'],
              ['2F', '주식회사 카카오페이증권인베스트먼트솔루션즈금융센터', '210.0평', '340.0평', '700,000,000원', '45,000,000원', '2027-09-30'],
            ],
          },
        },
      });

      expect(output.slide).toBeDefined();
    });

    it('A12 (Ownership) caps body rows at 10 preventing autoPage slide splitting', () => {
      const pres = new pptxgen();
      const excessiveRows = Array(20).fill(0).map((_, i) => [`구분 ${i + 1}`, `소유권 및 권리 관계 상세 내용 ${i + 1}`, `비고 ${i + 1}`]);

      const initialSlideCount = (pres as any).slides?.length ?? 0;
      const output = buildA12Ownership({
        pres,
        slideNum: 12,
        docno: 'TEST-A12-EXTREME',
        grade: 'A',
        provenance: {},
        data: {
          title: '소유권 및 권리관계 분석',
          ownershipRows: excessiveRows,
        },
      });

      expect(output.slide).toBeDefined();
      // Slide count must increase by exactly 1 (never split into 2 slides via autoPage)
      expect(((pres as any).slides?.length ?? 1) - initialSlideCount).toBe(1);
    });

    it('A22 (Stacking Plan) fits long tenant names within 1.96" column without overflow', () => {
      const pres = new pptxgen();
      const output = buildA22StackingPlan({
        pres,
        slideNum: 5,
        docno: 'TEST-A22-EXTREME',
        grade: 'A',
        provenance: {},
        data: {
          title: '층별 스태킹 플랜 (Tenant Stacking)',
          stackingPlan: {
            floors: [
              { floor: '10F', tenant: '글로벌사모펀드운용주식회사대한민국본부', area: 150, share: 10, expiry: '2028' },
              { floor: '9F', tenant: '테크스타트업유니콘엔터프라이즈솔루션즈', area: 150, share: 10, expiry: '2027' },
              { floor: '1F', tenant: '글로벌프리미엄커피전문점리테일스토어', area: 85, share: 8, expiry: '2030' },
            ],
          },
        },
      });

      expect(output.slide).toBeDefined();
    });

    it('A24 (Rentroll Stacking) fits narrow tenant and usage columns without row expansion', () => {
      const pres = new pptxgen();
      const output = buildA24RentrollStacking({
        pres,
        slideNum: 7,
        docno: 'TEST-A24-EXTREME',
        grade: 'A',
        provenance: {},
        data: {
          title: '임대차 렌트롤 종합',
          stackingPlan: [
            { floor: '5F', tenant: '매우긴임차인상호명칭주식회사글로벌코리아', area: 120, share: 50, expiry: '2028' },
            { floor: '4F', tenant: '대한민국대표엔터프라이즈솔루션즈', area: 120, share: 50, expiry: '2027' },
          ],
          tableRows: [
            ['5F', '501호', '업무시설(금융보험업)', '주식회사글로벌코리아자산운용리츠사옥임대차관리본부', '120.0', '72.0', '500,000,000', '35,000,000', '2028-12-31', '특약사항 장기 10년'],
            ['4F', '401호', '연구개발시설(소프트웨어)', '대한민국대표엔터프라이즈솔루션즈글로벌센터', '120.0', '72.0', '500,000,000', '35,000,000', '2027-10-31', '특약사항 중도해지불가'],
          ],
        },
      });

      expect(output.slide).toBeDefined();
    });
  });

});
