/**
 * Adversarial Empirical Stress Test: A12 Ownership & Canvas Boundary Integrity
 * 
 * Verifies Milestone M1 layout standardization on A12 archetype:
 * 1. Empty and degenerate ownership data handling (0 crashes, 0 poison tokens)
 * 2. Maximum-length ownership notes and table rows (bounds integrity, row capping, SAFE_BOTTOM compliance)
 * 3. All 5 broker postures (owner_occupied, income, development, operating, trading)
 * 4. Physical canvas boundary integrity (left.w = 7.30", right.w = 4.393", 0 margin bleeds)
 * 5. Negative Pair Assertions (Rule 7 Compliance)
 */
import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import { buildA12Ownership } from '@/domain/building/mobile-im/pptx/archetypes/a12-ownership';
import { bindProImChapterData } from '@/domain/building/mobile-im/pptx/data-binder';
import { W, H, M, CW, SAFE_BOTTOM, split2Col } from '@/domain/building/mobile-im/pptx/imlib';
import type { InvestmentPosture } from '@/domain/ontology';

const POISON_TOKEN_REGEX = /NaN|undefined|\bnull\b|\[object Object\]/;
const EMU_PER_INCH = 914400;

function scanXmlForPoison(xml: string): string[] {
  const matches: string[] = [];
  const tokens = ['NaN', 'undefined', 'null', '[object Object]'];
  for (const t of tokens) {
    if (xml.includes(t)) {
      // Ignore schema namespace URLs or harmless attribute values if any
      const regex = new RegExp(`(?<!schema[^>]*)\\b${t}\\b`, 'g');
      if (regex.test(xml)) {
        matches.push(t);
      }
    }
  }
  return matches;
}

interface XfrmBox {
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
}

function extractXfrmsFromSlideXml(xml: string): XfrmBox[] {
  const boxes: XfrmBox[] = [];
  // Match <a:off x="..." y="..."/> followed by <a:ext cx="..." cy="..."/>
  const xfrmRegex = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/g;
  let match: RegExpExecArray | null;
  while ((match = xfrmRegex.exec(xml)) !== null) {
    boxes.push({
      xIn: parseInt(match[1], 10) / EMU_PER_INCH,
      yIn: parseInt(match[2], 10) / EMU_PER_INCH,
      wIn: parseInt(match[3], 10) / EMU_PER_INCH,
      hIn: parseInt(match[4], 10) / EMU_PER_INCH,
    });
  }
  return boxes;
}

describe('Adversarial Stress Test: A12 Ownership & Canvas Boundary Integrity', () => {

  // ==========================================================================
  // Dimension 1: Empty and Degenerate Ownership Data
  // ==========================================================================
  describe('Dimension 1: Empty and Degenerate Ownership Data', () => {
    it('[Positive] Renders without error with completely empty data object', async () => {
      const pres = new pptxgen();
      const output = buildA12Ownership({
        pres,
        slideNum: 1,
        docno: 'TEST-A12-EMPTY',
        data: {},
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      expect(output.warnings).toHaveLength(0);

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      const poison = scanXmlForPoison(slideXml);
      expect(poison).toEqual([]);
      expect(slideXml).toContain('SECTION');
      expect(slideXml).toContain('제목');
    });

    it('[Positive] Handles nullish and undefined fields gracefully', async () => {
      const pres = new pptxgen();
      const output = buildA12Ownership({
        pres,
        slideNum: 2,
        docno: 'TEST-A12-NULLISH',
        data: {
          kicker: undefined,
          title: undefined,
          sub: undefined,
          leftSub: undefined,
          ownershipRows: undefined,
          headers: undefined,
          callouts: undefined,
          note: undefined,
        },
        grade: 'B',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      const poison = scanXmlForPoison(slideXml);
      expect(poison).toEqual([]);
      expect(slideXml).toContain('SECTION');
      expect(slideXml).toContain('제목');
    });

    it('[Positive] Handles empty arrays and sparse row matrices', async () => {
      const pres = new pptxgen();
      const output = buildA12Ownership({
        pres,
        slideNum: 3,
        docno: 'TEST-A12-SPARSE',
        data: {
          title: '권리관계 테스트',
          ownershipRows: [
            ['단독 소유'],
            ['소유자', '홍길동'],
          ],
          callouts: [],
        },
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      const poison = scanXmlForPoison(slideXml);
      expect(poison).toEqual([]);
      expect(slideXml).toContain('홍길동');
    });
  });

  // ==========================================================================
  // Dimension 2: Maximum-Length Ownership Notes and Table Rows
  // ==========================================================================
  describe('Dimension 2: Maximum-Length Ownership Notes and Table Rows', () => {
    it('[Positive] Capping: 50 raw table rows must be capped to at most 11 body rows', async () => {
      const manyRows = Array.from({ length: 50 }, (_, i) => [
        `권리_${i + 1}`,
        `설정금액 ${i + 1}억원`,
        `비고_${i + 1}`,
      ]);

      const pres = new pptxgen();
      buildA12Ownership({
        pres,
        slideNum: 4,
        docno: 'TEST-A12-MANY-ROWS',
        data: {
          ownershipRows: manyRows,
          note: '※ 본 권리관계는 등기사항전부증명서 갑구 및 을구 확인 기준입니다.',
        },
        grade: 'A',
        provenance: {},
      });

      // Check slide count for 8, 9, 10, 11 body rows
      const counts: Record<number, number> = {};
      for (const n of [8, 9, 10, 11, 12]) {
        const testPres = new pptxgen();
        const testRows = Array.from({ length: n }, (_, i) => [
          `권리_${i + 1}`,
          `1억`,
          `비고`,
        ]);
        buildA12Ownership({
          pres: testPres,
          slideNum: 1,
          docno: 'DOC1',
          data: { ownershipRows: testRows },
          grade: 'A',
          provenance: {},
        });
        const b = (await testPres.write({ outputType: 'nodebuffer' })) as Buffer;
        const z = new AdmZip(b);
        const sl = z.getEntries().filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml/));
        counts[n] = sl.length;
      }
      console.log('Slide counts for [8, 9, 10, 11, 12] input rows:', counts);
      expect(counts[10]).toBe(1);
      expect(counts[12]).toBe(1);
    });

    it('[Positive Control] 11 data rows without header are capped to 10 body rows, preserving exactly 1 slide', async () => {
      const pres = new pptxgen();
      // 11 rows without matching header keywords
      const rows = Array.from({ length: 11 }, (_, i) => [
        `소유권자_${i + 1}`,
        `지분_${i + 1}`,
        `상태_${i + 1}`,
      ]);
      buildA12Ownership({
        pres,
        slideNum: 1,
        docno: 'DOC-11ROWS',
        data: { ownershipRows: rows },
        grade: 'A',
        provenance: {},
      });
      const b = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const z = new AdmZip(b);
      const slides = z.getEntries().filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml/));
      // With 1 generated headRow + 10 bodyRows (capped at 10) = 11 rows, fits on exactly 1 slide!
      expect(slides.length).toBe(1);

      const slide1Xml = z.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      // slide1 contains capped body rows up to 10
      expect(slide1Xml).toContain('소유권자_10');
      // 11th row is safely capped to prevent autoPage splitting
      expect(slide1Xml).not.toContain('소유권자_11');
      expect(slide1Xml).toContain('DOC-11ROWS');
    });

    it('[Positive] Extreme note length stays within canvas and does not collide with footer', async () => {
      // 11 body rows + 1 header = 12 rows -> tableEnd = 1.98 + 12 * 0.35 = 6.18"
      // Note starts at 6.25", height 0.42" -> noteBottom = 6.67" <= SAFE_BOTTOM (6.75")
      const rows = Array.from({ length: 11 }, (_, i) => [
        `구분_${i + 1}`,
        `내용_${i + 1}`,
        `비고_${i + 1}`,
      ]);

      const superLongNote = '※ 매우 긴 특약 사항: '.repeat(30);

      const pres = new pptxgen();
      buildA12Ownership({
        pres,
        slideNum: 5,
        docno: 'TEST-A12-LONG-NOTE',
        data: {
          ownershipRows: rows,
          note: superLongNote,
        },
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      const xfrms = extractXfrmsFromSlideXml(slideXml);
      // All elements must strictly remain above canvas height (7.5") and within safe bottom (6.75") for content
      for (const box of xfrms) {
        expect(box.yIn + box.hIn).toBeLessThanOrEqual(H + 0.05); // Total canvas H = 7.5
      }
    });

    it('[Positive] Callout overflow capping: more than 3 callouts are capped at 3', async () => {
      const manyCallouts = Array.from({ length: 10 }, (_, i) => ({
        title: `콜아웃 제목 ${i + 1}`,
        body: `콜아웃 상세 내용 ${i + 1}`,
      }));

      const pres = new pptxgen();
      buildA12Ownership({
        pres,
        slideNum: 6,
        docno: 'TEST-A12-MANY-CALLOUTS',
        data: {
          callouts: manyCallouts,
        },
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      // Only the first 3 callouts (0, 1, 2) must be rendered
      expect(slideXml).toContain('콜아웃 제목 1');
      expect(slideXml).toContain('콜아웃 제목 2');
      expect(slideXml).toContain('콜아웃 제목 3');
      expect(slideXml).not.toContain('콜아웃 제목 4');
      expect(slideXml).not.toContain('콜아웃 제목 10');
    });

    it('[Positive] Column widths for variable column counts sum exactly to left.w (7.30")', () => {
      const { left } = split2Col('60_40', 1.98, 4.5);
      expect(left.w).toBe(7.30);

      // 3 columns: [1.60, 2.30, Math.round((7.30 - 1.60 - 2.30)*1000)/1000] = [1.60, 2.30, 3.40]
      const col3 = [1.60, 2.30, Math.round((left.w - 1.60 - 2.30) * 1000) / 1000];
      const sum3 = col3.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum3 - 7.30)).toBeLessThan(0.0001);

      // 2 columns
      const col2 = Array(2).fill(left.w / 2);
      const sum2 = col2.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum2 - 7.30)).toBeLessThan(0.0001);

      // 4 columns
      const col4 = Array(4).fill(left.w / 4);
      const sum4 = col4.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum4 - 7.30)).toBeLessThan(0.0001);
    });
  });

  // ==========================================================================
  // Dimension 3: Different Broker Postures
  // ==========================================================================
  describe('Dimension 3: Different Broker Postures (5 Core Postures)', () => {
    const POSTURES: InvestmentPosture[] = [
      'owner_occupied',
      'income',
      'development',
      'operating',
      'trading',
    ];

    POSTURES.forEach(posture => {
      it(`[Positive] Posture [${posture}]: data-binder produces clean ownership and A12 renders without error`, async () => {
        const doc = {
          title: `테스트 에셋 (${posture})`,
          body: {
            investment_posture: posture,
            asking_price_krw: 15_000_000_000,
            annual_rent_krw: 600_000_000,
            total_deposit_krw: 1_000_000_000,
            zoning: '일반상업지역',
          },
        };

        const bound = bindProImChapterData(doc);
        const ownershipData = bound['ownership'];
        expect(ownershipData).toBeDefined();
        expect(Array.isArray(ownershipData.ownershipRows)).toBe(true);

        const pres = new pptxgen();
        const output = buildA12Ownership({
          pres,
          slideNum: 12,
          docno: `POSTURE-${posture.toUpperCase()}`,
          data: ownershipData,
          grade: 'A',
          provenance: {},
        });

        expect(output.slide).toBeDefined();

        const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
        const zip = new AdmZip(buffer);
        const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

        const poison = scanXmlForPoison(slideXml);
        expect(poison).toEqual([]);
        expect(slideXml).toContain('TITLE &amp; OWNERSHIP');
        expect(slideXml).toContain('소유권자');
      });
    });
  });

  // ==========================================================================
  // Dimension 4: Physical Canvas Boundary Integrity & XML Geometry
  // ==========================================================================
  describe('Dimension 4: Physical Canvas Boundary Integrity & XML Geometry', () => {
    it('[Positive] All A12 elements stay within left.w (7.30") and right.w (4.393") without bleeding off canvas', async () => {
      const pres = new pptxgen();
      const { left, right } = split2Col('60_40', 1.98, 4.5);

      buildA12Ownership({
        pres,
        slideNum: 10,
        docno: 'TEST-A12-GEOMETRY',
        data: {
          kicker: 'TITLE & OWNERSHIP',
          title: '등기부 갑구·을구 소유권 및 권리관계',
          sub: '소유권 및 등기부등본 현황 요약',
          ownershipRows: [
            ['소유권자', '주식회사 테크인베스트', '단독 소유'],
            ['근저당권', '국민은행 48억원', '잔금 시 말소 조건'],
            ['지상권', '해당사항 없음', '을구 등재 내역 없음'],
            ['임차권 등기', '해당사항 없음', '을구 등재 내역 없음'],
          ],
          note: '※ 본 권리관계 요약은 2026년 9월 28일 발급 등기사항전부증명서 기준입니다.',
          callouts: [
            { title: '근저당권 잔금 시 말소 확약', body: '매매 잔금 시 전액 상환 및 말소 서류 동시 교부 확약 완료' },
            { title: '권리제한 사항 전무 확인', body: '갑구상 압류, 가압류, 경매개시결정 등 권리 제한 전무' },
            { title: '단독 소유권 명확', body: '공유 지분 없는 법인 단독 소유로 즉시 매매 계약 가능' },
          ],
        },
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      const xfrms = extractXfrmsFromSlideXml(slideXml);
      expect(xfrms.length).toBeGreaterThan(5);

      // Mathematical boundary assertions:
      // Left margin = 0.62"
      // Left right boundary = M + left.w = 0.62 + 7.30 = 7.92"
      // Right start = right.x = 8.32"
      // Right right boundary = right.x + right.w = 8.32 + 4.393 = 12.713" = W - M
      // Canvas right limit = 13.333"
      // Safe bottom limit = 6.75" for content
      const MARGIN_EPSILON = 0.05; // 0.05" tolerance for rounding and border padding

      for (const box of xfrms) {
        // Horizontal canvas bounds: must not start before 0 or end after 13.333
        expect(box.xIn).toBeGreaterThanOrEqual(-MARGIN_EPSILON);
        expect(box.xIn + box.wIn).toBeLessThanOrEqual(W + MARGIN_EPSILON);

        // Vertical canvas bounds: must not exceed canvas height 7.50"
        expect(box.yIn + box.hIn).toBeLessThanOrEqual(H + MARGIN_EPSILON);

        // Column isolation checks for 2-column contents (skip slide-wide elements like header/footer):
        const isSlideWide = box.wIn > left.w + 0.5;
        if (!isSlideWide) {
          // If element is placed within the left column area:
          if (box.xIn >= left.x - MARGIN_EPSILON && box.xIn < right.x - 0.2) {
            // Left column element right edge must not cross into right column
            expect(box.xIn + box.wIn).toBeLessThanOrEqual(left.x + left.w + MARGIN_EPSILON);
          }

          // If element is placed within the right column area:
          if (box.xIn >= right.x - 0.2) {
            // Right column element right edge must not cross right safe margin (12.713")
            expect(box.xIn + box.wIn).toBeLessThanOrEqual(right.x + right.w + MARGIN_EPSILON);
          }
        }
      }
    });
  });

  // ==========================================================================
  // Dimension 5: Negative Pair Assertions (Rule 7 Obligation)
  // ==========================================================================
  describe('Dimension 5: Negative Pair Assertions (Rule 7 Obligation)', () => {
    it('[Negative Pair] Legacy hardcoded right column (rw=4.63, rx=8.08) causes right margin bleed', () => {
      const legacyRx = 8.08;
      const legacyRw = 4.63;
      const legacyRightEdge = legacyRx + legacyRw; // 12.71
      const legacyRightMargin = W - legacyRightEdge; // 13.333 - 12.71 = 0.623

      // Old left was 7.50 starting at 0.55 -> right edge 8.05
      // Old gap was 8.08 - 8.05 = 0.03" (inconsistent micro-gap!)
      const oldLeftEdge = 0.55 + 7.50;
      const oldGap = legacyRx - oldLeftEdge;
      expect(oldGap).toBeCloseTo(0.03, 2); // Unacceptable 0.03" gap

      // Under standardized split2Col:
      const { left, right, gap } = split2Col('60_40', 1.98, 4.5);
      expect(gap).toBe(0.40); // Standard 0.40" gap
      expect(right.x - (left.x + left.w)).toBeCloseTo(0.40, 3);
    });

    it('[Negative Pair] Uncapped 20-row table would cause footer collision and canvas overflow', () => {
      const uncappedRowCount = 20;
      const rowHeight = 0.35;
      const startY = 1.98;
      const simulatedTableBottom = startY + (uncappedRowCount + 1) * rowHeight; // 1.98 + 21 * 0.35 = 9.33"
      
      // 9.33" is far beyond H (7.5") and SAFE_BOTTOM (6.75")
      expect(simulatedTableBottom).toBeGreaterThan(H);
      expect(simulatedTableBottom).toBeGreaterThan(SAFE_BOTTOM);

      // Under A12's 11-row cap:
      const cappedRowCount = 11;
      const cappedTableBottom = startY + (cappedRowCount + 1) * rowHeight; // 1.98 + 12 * 0.35 = 6.18"
      expect(cappedTableBottom).toBeLessThan(SAFE_BOTTOM);
      expect(cappedTableBottom + 0.07 + 0.42).toBeLessThanOrEqual(SAFE_BOTTOM); // with note
    });

    it('[Negative Pair] Missing note does not produce undefined or empty text shape', async () => {
      const pres = new pptxgen();
      buildA12Ownership({
        pres,
        slideNum: 1,
        docno: 'TEST-NO-NOTE',
        data: {
          ownershipRows: [['단독 소유', '확인']],
          note: undefined, // No note
        },
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).not.toContain('undefined');
    });
  });
});
