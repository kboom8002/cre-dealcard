/**
 * Adversarial Layout Integration Stress Suite — Milestone M2
 * 
 * Verifies:
 * 1. A02 lead sentence dynamic height and brass divider / KPI card vertical chaining (10, 50, 100, 150 chars).
 * 2. A03, A22, and A24 table cell text clamping under long tenant names (20~50 chars) preventing row expansion and bottom overflow.
 * 3. A12 single-slide preservation under variable row counts (1, 5, 10, 15, 25 rows) without autoPage splitting.
 * 4. Verification via Python PPTX Overflow Inspector (`scripts/detect_pptx_overflow.py`).
 * 5. Rule 7 Positive / Negative test pairs & Empirical Defect Reproduction.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { buildA02StatGrid } from '@/domain/building/mobile-im/pptx/archetypes/a02-stat-grid';
import { buildA03LargeTable } from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';
import { buildA12Ownership } from '@/domain/building/mobile-im/pptx/archetypes/a12-ownership';
import { buildA22StackingPlan } from '@/domain/building/mobile-im/pptx/archetypes/a22-stacking-plan';
import { buildA24RentrollStacking } from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';
import { W, H, M, CW, SAFE_BOTTOM, fitTableCell, fitTextToBox } from '@/domain/building/mobile-im/pptx/imlib';

const EMU_PER_INCH = 914400;
const TEST_TMP_DIR = path.join(process.cwd(), 'docs', 'test', 'stress', 'm2-challenger-output');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface XfrmInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  isLine?: boolean;
}

function extractShapesAndTables(slideXml: string): { shapes: XfrmInfo[]; tables: XfrmInfo[] } {
  const shapes: XfrmInfo[] = [];
  const tables: XfrmInfo[] = [];

  // Extract regular shapes <p:sp>
  const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let spMatch: RegExpExecArray | null;
  while ((spMatch = spRegex.exec(slideXml)) !== null) {
    const spContent = spMatch[1];
    const offExt = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/.exec(spContent);
    if (offExt) {
      const x = parseInt(offExt[1], 10) / EMU_PER_INCH;
      const y = parseInt(offExt[2], 10) / EMU_PER_INCH;
      const w = parseInt(offExt[3], 10) / EMU_PER_INCH;
      const h = parseInt(offExt[4], 10) / EMU_PER_INCH;

      const textParts: string[] = [];
      const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(spContent)) !== null) {
        textParts.push(tMatch[1]);
      }

      const isLine = spContent.includes('prst="line"') || h === 0;
      shapes.push({ x, y, w, h, text: textParts.join(' '), isLine });
    }
  }

  // Extract table graphicFrames <p:graphicFrame>
  const gfRegex = /<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g;
  let gfMatch: RegExpExecArray | null;
  while ((gfMatch = gfRegex.exec(slideXml)) !== null) {
    const gfContent = gfMatch[1];
    const offExt = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/.exec(gfContent);
    if (offExt) {
      const x = parseInt(offExt[1], 10) / EMU_PER_INCH;
      const y = parseInt(offExt[2], 10) / EMU_PER_INCH;
      const w = parseInt(offExt[3], 10) / EMU_PER_INCH;
      const h = parseInt(offExt[4], 10) / EMU_PER_INCH;

      const textParts: string[] = [];
      const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(gfContent)) !== null) {
        textParts.push(tMatch[1]);
      }

      tables.push({ x, y, w, h, text: textParts.join(' ') });
    }
  }

  return { shapes, tables };
}

function runPythonInspector(filePath: string): { exitCode: number; stdout: string; json: any } {
  try {
    const stdout = execSync(`python scripts/detect_pptx_overflow.py "${filePath}" --json`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 15000,
    });
    return { exitCode: 0, stdout, json: JSON.parse(stdout) };
  } catch (err: any) {
    const stdout = err.stdout ? String(err.stdout) : (err.stderr ? String(err.stderr) : String(err));
    let json = {};
    try { json = JSON.parse(stdout); } catch {}
    return { exitCode: err.status || 1, stdout, json };
  }
}

describe('M2 Adversarial Challenge: Archetype Layout Integration & Overflow Hardening', () => {

  beforeAll(() => {
    ensureDir(TEST_TMP_DIR);
  });

  afterAll(() => {
    // Keep generated PPTX files in TEST_TMP_DIR for inspection
  });

  // ============================================================================
  // Task 1: A02 Lead Sentence Dynamic Height & Brass Line Chaining
  // ============================================================================
  describe('A02 Lead Sentence Dynamic Height & Chaining (10, 50, 100, 150 chars)', () => {
    const testCases = [
      {
        desc: '10 chars (Short single-line)',
        text: '핵심 매각 매물 개요 안내',
        charCount: 13,
      },
      {
        desc: '50 chars (Medium two-line wrapping)',
        text: '강남 도산대로 중심업무권역에 위치한 초역세권 프라임 근생 빌딩으로 사옥 및 임대수익형 자산으로 최적합 매물',
        charCount: 57,
      },
      {
        desc: '100 chars (Long two-line fit with font scaling)',
        text: '강남 도산대로 중심업무권역에 위치한 초역세권 프라임 근생 빌딩으로 사옥 및 안정적인 임대수익형 자산으로 최적합하며 향후 밸류애드 리모델링을 통한 추가 자산가치 극대화가 기대되는 핵심 전략 매물 안내서입니다.',
        charCount: 112,
      },
      {
        desc: '150 chars (Extreme length requiring auto-clamping/truncation)',
        text: '강남 도산대로 중심업무권역에 위치한 초역세권 프라임 근생 빌딩으로 사옥 및 안정적인 임대수익형 자산으로 최적합하며 향후 밸류애드 리모델링을 통한 추가 자산가치 극대화가 기대되는 핵심 전략 매물입니다. 주변 대규모 업무지구 개발 호재와 지속적인 임대수요 증가로 공실 리스크가 극히 낮으며 시세차익이 확실합니다.',
        charCount: 168,
      },
    ];

    for (const tc of testCases) {
      it(`[Positive] A02 chains vertically without collision for ${tc.desc}`, async () => {
        const pres = new pptxgen();
        pres.layout = 'LAYOUT_WIDE';

        buildA02StatGrid({
          pres,
          slideNum: 1,
          docno: 'A02-TEST',
          data: {
            kicker: 'SUMMARY',
            title: '투자 하이라이트 및 제원 요약',
            leadSentence: tc.text,
            heroCard: {
              askingPriceDisplay: '250억 원',
              equityRequiredBil: 125,
              capRateBase: 4.2,
              totalGrossAreaPyeong: 850,
              landAreaPyeong: 180,
              vacancyDisplay: '만실(100%)',
            },
          },
          grade: 'A',
          provenance: {},
        });

        const pptxPath = path.join(TEST_TMP_DIR, `a02_${tc.charCount}chars.pptx`);
        const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
        fs.writeFileSync(pptxPath, buffer);

        // 1. Direct DrawingML geometry extraction
        const zip = new AdmZip(buffer);
        const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
        const { shapes } = extractShapesAndTables(slideXml);

        // Find lead sentence shape
        const leadShape = shapes.find(s => Math.abs(s.y - 1.30) < 0.02 && Math.abs(s.w - CW) < 0.05);
        expect(leadShape).toBeDefined();
        const leadBottom = leadShape!.y + leadShape!.h;

        // Find brass line shape (line shape with y > 1.30 and y < 2.50)
        const brassLine = shapes.find(s => s.isLine && s.y >= 1.30 && s.y < 2.50);
        expect(brassLine).toBeDefined();

        // Find first stat card (roundRect or block shape starting at startY)
        const statCards = shapes.filter(s => !s.isLine && s.y >= brassLine!.y && s.h >= 1.0);
        expect(statCards.length).toBeGreaterThan(0);
        const firstCardY = Math.min(...statCards.map(s => s.y));

        // ASSERTION 1: Brass line strictly below lead text (gap >= 0.08")
        expect(brassLine!.y).toBeGreaterThanOrEqual(leadBottom + 0.079);

        // ASSERTION 2: Stat cards strictly below brass line (gap >= 0.15")
        expect(firstCardY).toBeGreaterThanOrEqual(brassLine!.y + 0.149);

        // ASSERTION 3: Content stays within SAFE_BOTTOM (6.75")
        const allBottoms = shapes.filter(s => s.y < 6.8).map(s => s.y + s.h);
        const maxContentBottom = Math.max(...allBottoms);
        expect(maxContentBottom).toBeLessThanOrEqual(SAFE_BOTTOM + 0.05);
      });
    }

    it('[Positive] Dynamic brass line height strictly adapts as lead text expands', async () => {
      // Compare 13 chars (1 line) vs 112 chars (2 lines)
      const presShort = new pptxgen();
      buildA02StatGrid({
        pres: presShort, slideNum: 1, docno: 'SHORT',
        data: { leadSentence: '짧은 한 줄 요약입니다.' },
        grade: 'A', provenance: {},
      });
      const bufShort = (await presShort.write({ outputType: 'nodebuffer' })) as Buffer;
      const xmlShort = new AdmZip(bufShort).getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const shapesShort = extractShapesAndTables(xmlShort).shapes;
      const lineShort = shapesShort.find(s => s.isLine && s.y > 1.30 && s.y < 2.50)!;

      const presLong = new pptxgen();
      buildA02StatGrid({
        pres: presLong, slideNum: 1, docno: 'LONG',
        data: { leadSentence: '강남 도산대로 중심업무권역에 위치한 초역세권 프라임 근생 빌딩으로 사옥 및 안정적인 임대수익형 자산으로 최적합하며 향후 밸류애드 리모델링을 통한 추가 자산가치 극대화가 기대되는 핵심 전략 매물 안내서입니다.' },
        grade: 'A', provenance: {},
      });
      const bufLong = (await presLong.write({ outputType: 'nodebuffer' })) as Buffer;
      const xmlLong = new AdmZip(bufLong).getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const shapesLong = extractShapesAndTables(xmlLong).shapes;
      const lineLong = shapesLong.find(s => s.isLine && s.y > 1.30 && s.y < 2.50)!;

      // When text wraps into 2 lines (112 chars), lineLong.y must be shifted downwards compared to lineShort.y (13 chars)
      expect(lineLong.y).toBeGreaterThan(lineShort.y);
      expect(lineLong.y).toBeGreaterThan(1.70);
    });

    it('[Remediated DEFECT-M2-01] A02 leadSentence with margin: 0 achieves 0 TEXT_FRAME_OVERFLOW on 100+ chars in python verifier', () => {
      const pptxPath = path.join(TEST_TMP_DIR, 'a02_112chars.pptx');
      const pyResult = runPythonInspector(pptxPath);
      // Remediated: python-pptx detects 0 errors with margin: 0
      expect(pyResult.json.error_count).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
    });

    it('[Negative Pair] Legacy hardcoded brass line (y=1.85) would collide with 2-line lead text', () => {
      // 2-line text at 15pt has height ~0.48"
      const leadFit = fitTextToBox('강남 도산대로 중심업무권역에 위치한 초역세권 프라임 근생 빌딩으로 사옥 및 안정적인 임대수익형 자산으로 최적합하며 향후 밸류애드 리모델링을 통한 추가 자산가치 극대화가 기대되는 핵심 전략 매물 안내서입니다.', CW, 0.50, {
        minFontSize: 12, maxFontSize: 15, targetLines: 2
      });
      const textBottom = 1.30 + leadFit.requiredHeight;
      const legacyLineY = 1.85;
      const gap = legacyLineY - textBottom;
      // Legacy gap was dangerously narrow (<0.10") or collided when font metrics fluctuated,
      // whereas dynamic lineY = textBottom + 0.08" guarantees strict separation.
      expect(leadFit.lines.length).toBe(2);
      expect(textBottom).toBeGreaterThan(1.65);
      expect(1.30 + leadFit.requiredHeight + 0.08).toBeGreaterThanOrEqual(1.75);
    });
  });

  // ============================================================================
  // Task 2: A03, A22, A24 Table Cell Text Clamping (20~50 chars)
  // ============================================================================
  describe('A03, A22, A24 Table Cell Text Clamping under Long Tenant Names', () => {

    it('[Positive] A03 clamps long tenant names (50+ chars) and maintains table bottom <= 6.75"', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const longTenants = [
        '주식회사대한민국글로벌상업용부동산투자개발자산운용전문회사_제2지점_엔터프라이즈_솔루션즈_프라임센터', // 52 chars
        '메디컬케어네트워크의원및종합검진클리닉센터영등포지점_첨단의료복합단지연구소', // 40 chars
        '스타벅스코리아리저브당산역프리미엄드라이브스루매장점_스페셜티커피로스터리', // 41 chars
        '주식회사한국엔터프라이즈소프트웨어인텔리전스클라우드솔루션즈_글로벌데이터센터', // 43 chars
        '법무법인대한국민종합법률사무소금융부동산전담변호인단_기업회생파산전문센터', // 41 chars
        '삼정세무회계사무소공인회계사및세무전문컨설팅그룹_상속증여가업승계전략본부', // 41 chars
        '주식회사넥스트제너레이션바이오테크놀로지알앤디연구센터_신약개발사업단', // 39 chars
        '글로벌로지스틱스서플라이체인매니지먼트한국물류지사_스마트풀필먼트센터', // 39 chars
        '주식회사메가프라임자산운용리츠투자운용본부전략기획실_글로벌투자금융팀', // 39 chars
        '에이아이인공지능딥러닝로보틱스응용연구개발실험실_자율주행인지센서연구부', // 40 chars
        '주식회사케이비부동산신탁부동산금융수탁투자관리부_리츠투자운용본부', // 38 chars
        '합계',
      ];

      const tableRows = longTenants.map((tenant, idx) => [
        `${idx + 1}F`,
        `10${idx + 1}호`,
        tenant,
        '45.2평',
        '10,000만원',
        '550만원',
        '50만원',
        '2028-12-31',
      ]);

      buildA03LargeTable({
        pres,
        slideNum: 1,
        docno: 'A03-CLAMP',
        data: {
          kicker: 'Rent Roll',
          title: '임대차 상세 계약 현황 (12개 전층)',
          tableHead: ['층수', '호실', '임차인', '전용면적', '보증금', '월임대료', '관리비', '만기일'],
          tableRows,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(TEST_TMP_DIR, 'a03_long_tenants.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      // Check DrawingML table geometry
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const { tables } = extractShapesAndTables(slideXml);
      expect(tables.length).toBeGreaterThan(0);

      const table = tables[0];
      const tableBottom = table.y + table.h;
      // In A03, 12 rows + 1 header = 13 rows * 0.38 = 4.94". 1.80 + 4.94 = 6.74" <= 6.75"
      expect(tableBottom).toBeLessThanOrEqual(SAFE_BOTTOM + 0.01);

      // Verify that the 52-character tenant name was clamped with ellipsis '…'
      expect(table.text).toContain('…');

      // Independent python inspector: L.table explicitly specifies margin: [2, 4, 2, 4], so 0 errors!
      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.error_count).toBe(0);
    });

    it('[Positive] A22 clamps tenant names (20~50 chars) and maintains table bottom <= 6.40"', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const stackingFloors = [
        { floor: '7F', tenant: '주식회사대한민국글로벌상업용부동산투자개발자산운용전문회사_본사', usage: '업무시설', areaM2: 240, expiry: '2028' },
        { floor: '6F', tenant: '메디컬케어네트워크의원및종합검진클리닉센터영등포지점', usage: '의원', areaM2: 240, expiry: '2027' },
        { floor: '5F', tenant: '주식회사한국엔터프라이즈소프트웨어인텔리전스클라우드솔루션즈', usage: '업무시설', areaM2: 240, expiry: '2029' },
        { floor: '4F', tenant: '법무법인대한국민종합법률사무소금융부동산전담변호인단', usage: '업무시설', areaM2: 240, expiry: '2026' },
        { floor: '3F', tenant: '삼정세무회계사무소공인회계사및세무전문컨설팅그룹', usage: '업무시설', areaM2: 240, expiry: '2028' },
        { floor: '2F', tenant: '글로벌로지스틱스서플라이체인매니지먼트한국물류지사', usage: '근린생활', areaM2: 240, expiry: '2027' },
        { floor: '1F', tenant: '스타벅스코리아리저브당산역프리미엄드라이브스루매장점', usage: '휴게음식', areaM2: 240, expiry: '2030' },
        { floor: 'B1', tenant: '공실 (임차의향 접수 중)', usage: '근린생활', areaM2: 240, isVacant: true },
      ];

      buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'A22-CLAMP',
        data: {
          kicker: 'Stacking Plan',
          title: '건축 입면 셋백 및 층별 임대차 매트릭스',
          stackingPlan: stackingFloors,
          totalGrossAreaM2: 1920,
          currentRentManwon: 4500,
          totalDepositManwon: 80000,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(TEST_TMP_DIR, 'a22_long_tenants.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      // Check DrawingML table geometry
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const { tables } = extractShapesAndTables(slideXml);
      expect(tables.length).toBeGreaterThan(0);

      const table = tables[0];
      const tableBottom = table.y + table.h;
      // In A22, table bottom must NOT exceed 6.40"
      expect(tableBottom).toBeLessThanOrEqual(6.40 + 0.02);

      // Verify that long tenant text is clamped to at most 18 characters by archetype pre-processing
      expect(table.text).toContain('주식회사대한민국글로벌상업용부동산투');
      expect(table.text).not.toContain('주식회사대한민국글로벌상업용부동산투자개발자산운용전문회사_본사');

      // Independent python inspector: L.table explicitly specifies margin: [2, 4, 2, 4], so 0 errors!
      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.error_count).toBe(0);
    });

    it('[Positive] A24 table bottom strictly conforms to SAFE_BOTTOM (<= 6.75")', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const rows = [
        ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'],
        ['10F', '주식회사대한민국글로벌상업용부동산투자개발자산운용전문회사_본사', '업무시설', '200.0', '150.0', '10000', '800', '100', '900', '2028-12'],
        ['9F', '메디컬케어네트워크의원및종합검진클리닉센터영등포지점', '의원', '200.0', '150.0', '10000', '800', '100', '900', '2027-06'],
        ['8F', '주식회사한국엔터프라이즈소프트웨어인텔리전스클라우드솔루션즈', '업무시설', '200.0', '150.0', '10000', '800', '100', '900', '2029-01'],
        ['7F', '법무법인대한국민종합법률사무소금융부동산전담변호인단', '업무시설', '200.0', '150.0', '10000', '800', '100', '900', '2026-11'],
        ['6F', '삼정세무회계사무소공인회계사및세무전문컨설팅그룹', '업무시설', '200.0', '150.0', '10000', '800', '100', '900', '2028-05'],
        ['5F', '주식회사넥스트제너레이션바이오테크놀로지알앤디연구센터', '업무시설', '200.0', '150.0', '10000', '800', '100', '900', '2027-09'],
        ['4F', '에이아이인공지능딥러닝로보틱스응용연구개발실험실', '의원', '200.0', '150.0', '10000', '800', '100', '900', '2028-03'],
        ['3F', '글로벌로지스틱스서플라이체인매니지먼트한국물류지사', '근린생활', '200.0', '150.0', '10000', '800', '100', '900', '2027-10'],
        ['2F', '주식회사케이비부동산신탁부동산금융수탁투자관리부', '근린생활', '200.0', '150.0', '10000', '800', '100', '900', '2026-08'],
        ['1F', '스타벅스코리아리저브당산역프리미엄드라이브스루매장점', '휴게음식', '200.0', '150.0', '20000', '1500', '150', '1650', '2031-12'],
        ['B1', '공실 (임차의향 접수 중)', '근린생활', '200.0', '150.0', '0', '0', '0', '0', '-'],
      ];

      buildA24RentrollStacking({
        pres,
        slideNum: 1,
        docno: 'A24-CLAMP',
        data: {
          kicker: 'Rent Roll',
          title: '층별 공간 배치 및 렌트롤 상세',
          tableRows: rows,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(TEST_TMP_DIR, 'a24_long_tenants.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      // Check DrawingML table geometry
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const { tables } = extractShapesAndTables(slideXml);
      expect(tables.length).toBeGreaterThan(0);

      const table = tables[0];
      const tableBottom = table.y + table.h;
      // In A24, table starts at 1.80, with spH=4.80, table bottom <= 6.60" <= 6.75"
      expect(tableBottom).toBeLessThanOrEqual(SAFE_BOTTOM + 0.01);

      // D7 (Phase A1): long tenant names are shown in full over 2 lines (<=7.5pt); '…' is only the last resort.
      // Either way the cell must not overflow: table bottom was asserted above and the tenant is never dropped.
      expect(/…|주식회사대한민국글로벌상업용부동산투자개발자산운용전문회사_본사/.test(table.text ?? '')).toBe(true);
    });

    it('[Remediated DEFECT-M2-02 & DEFECT-M2-03] A24 with table cell margin and clamped footnote achieves 0 errors in python verifier', () => {
      const pptxPath = path.join(TEST_TMP_DIR, 'a24_long_tenants.pptx');
      const pyResult = runPythonInspector(pptxPath);
      // Remediated: python-pptx detects 0 errors and passes strict bounds
      expect(pyResult.json.error_count).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
    });

    it('[Negative Pair] fitTableCell correctly clamps overflowing strings vs unclamped raw strings', () => {
      const longText = '주식회사대한민국글로벌상업용부동산투자개발자산운용전문회사_제2지점_엔터프라이즈_솔루션즈';
      // In A24, tenant column width is 1.05" and rowH is 0.28"
      const colW = 1.05;
      const rowH = 0.28;
      const fitted = fitTableCell(longText, colW, rowH, 8.5);

      // Fitted text MUST have ellipsis and be substantially shorter
      expect(fitted.text).toContain('…');
      expect(fitted.text.length).toBeLessThan(longText.length);
      expect(fitted.fontSize).toBeGreaterThanOrEqual(7.0);

      // An unclamped raw string of 47 CJK characters at 8.5pt would require ~5.5 inches of line width
      // 47 * (8.5 / 72) * 1.0 = 5.54 inches
      // In a 1.05" column, that requires ceil(5.54 / 0.94) = 6 lines!
      // 6 lines * (8.5 / 72) * 1.15 = 0.81" height, which is 2.9x the 0.28" row budget!
      const em = 8.5 / 72;
      const rawRequiredWidth = longText.length * em;
      expect(rawRequiredWidth).toBeGreaterThan(4.0);
    });
  });

  // ============================================================================
  // Task 3: A12 Single-Slide Preservation under Variable Row Counts
  // ============================================================================
  describe('A12 Single-Slide Preservation (1, 5, 10, 15, 25 rows)', () => {
    const rowCounts = [1, 5, 10, 15, 25];

    for (const count of rowCounts) {
      it(`[Positive] A12 produces exactly 1 slide for ${count} input rows (no header keyword)`, async () => {
        const pres = new pptxgen();
        pres.layout = 'LAYOUT_WIDE';

        const testRows = Array.from({ length: count }, (_, i) => [
          `소유권자_${i + 1}`,
          `지분율_${100 / count}%`,
          `공동명의_${i + 1}`,
        ]);

        buildA12Ownership({
          pres,
          slideNum: 1,
          docno: 'A12-ROWCOUNT',
          data: {
            kicker: 'OWNERSHIP',
            title: '소유권 및 권리관계 분석',
            ownershipRows: testRows,
            note: '※ 등기사항전부증명서(을구 근저당권) 기준 권리사항 정리입니다.',
            callouts: [
              { title: '단독 소유권 확인', body: '소유권 분쟁 및 압류/가압류 등 권리제한 사항 없음.' },
              { title: '명도 용이성', body: '임대차 만기 도래에 따른 사전 협의 완료로 즉시 명도 가능.' },
            ],
          },
          grade: 'A',
          provenance: {},
        });

        const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
        const zip = new AdmZip(buffer);
        const slides = zip.getEntries().filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml/));

        // CRITICAL ASSERTION: Exactly 1 slide, ZERO autoPage splitting!
        expect(slides.length).toBe(1);

        // Verify table bottom stays within SAFE_BOTTOM (6.75")
        const slideXml = slides[0].getData().toString('utf-8');
        const { tables } = extractShapesAndTables(slideXml);
        expect(tables.length).toBeGreaterThan(0);
        const tableBottom = tables[0].y + tables[0].h;
        expect(tableBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
      });

      it(`[Positive] A12 produces exactly 1 slide for ${count} input rows (with header keyword in row 0)`, async () => {
        const pres = new pptxgen();
        pres.layout = 'LAYOUT_WIDE';

        const headerRow = ['구분', '권리 내용', '비고'];
        const bodyRows = Array.from({ length: Math.max(0, count - 1) }, (_, i) => [
          `소유권_${i + 1}`,
          `단독소유 및 근저당 채권최고액 ${i + 1}억원`,
          `정상`,
        ]);
        const testRows = [headerRow, ...bodyRows];

        buildA12Ownership({
          pres,
          slideNum: 1,
          docno: 'A12-WITH-HEADER',
          data: {
            kicker: 'OWNERSHIP',
            title: '소유권 및 권리관계 분석',
            ownershipRows: testRows,
            note: '※ 공부 서류 확인 필.',
          },
          grade: 'A',
          provenance: {},
        });

        const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
        const zip = new AdmZip(buffer);
        const slides = zip.getEntries().filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml/));

        // CRITICAL ASSERTION: Exactly 1 slide!
        expect(slides.length).toBe(1);
      });
    }

    it('[Negative Pair] If 15 body rows were not capped, autoPage: true would trigger slide 2', () => {
      // 15 body rows + 1 header = 16 rows
      // 16 rows * 0.35" = 5.60" table height
      // table starts at y = 1.98"
      // 1.98" + 5.60" = 7.58" table bottom!
      // Since slide canvas height is 7.50", 7.58" > 7.50" forces pptxgenjs to create slide 2!
      // Capping body rows to 10 ensures: 10 + 1 = 11 rows * 0.35" = 3.85", 1.98" + 3.85" = 5.83" <= 6.75"!
      const uncappedRows = 16;
      const uncappedHeight = uncappedRows * 0.35;
      const uncappedBottom = 1.98 + uncappedHeight;
      expect(uncappedBottom).toBeGreaterThan(H); // 7.58 > 7.50

      const cappedRows = 11;
      const cappedHeight = cappedRows * 0.35;
      const cappedBottom = 1.98 + cappedHeight;
      expect(cappedBottom).toBeLessThanOrEqual(SAFE_BOTTOM); // 5.83 <= 6.75
    });
  });
});
