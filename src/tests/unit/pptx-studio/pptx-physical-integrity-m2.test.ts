import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { inspectPptxBinary } from '@/assurance/im-harness/observers/pptx-binary-observer';
import { HarnessEvaluator } from '@/assurance/im-harness/evaluator';
import { registerPPTXProfiles } from '@/assurance/im-harness/profiles/pptx-profile';
import type { PPTXDeckSpec } from '@/domain/building/pptx-publication/types';

describe('PPTX Physical Integrity & Compliance Harness M2', () => {
  const evaluator = new HarnessEvaluator();
  registerPPTXProfiles(evaluator);

  const createMinimalPptxBuffer = async (params: {
    spXfrm?: { x: number; y: number; cx: number; cy: number };
    picXfrm?: { x: number; y: number; cx: number; cy: number };
    graphicFrameXfrm?: { x: number; y: number; cx: number; cy: number };
    text?: string;
    includeCorruptImage?: boolean;
    include150DpiImage?: boolean;
    includeLowDpiImage?: boolean;
  }): Promise<Buffer> => {
    const zip = new JSZip();

    let spXml = '';
    if (params.spXfrm) {
      spXml = `
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="${params.spXfrm.x}" y="${params.spXfrm.y}"/>
              <a:ext cx="${params.spXfrm.cx}" cy="${params.spXfrm.cy}"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:p><a:r><a:t>${params.text ?? '정상 본문 텍스트'}</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>`;
    } else {
      spXml = `
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="1000000" y="500000"/>
              <a:ext cx="5000000" cy="2000000"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:p><a:r><a:t>${params.text ?? '정상 본문 텍스트'}</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>`;
    }

    let picXml = '';
    if (params.picXfrm) {
      picXml = `
        <p:pic>
          <p:nvPicPr><p:cNvPr name="사진1"/></p:nvPicPr>
          <p:blipFill><a:blip r:embed="rIdImg1"/></p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="${params.picXfrm.x}" y="${params.picXfrm.y}"/>
              <a:ext cx="${params.picXfrm.cx}" cy="${params.picXfrm.cy}"/>
            </a:xfrm>
          </p:spPr>
        </p:pic>`;
    }

    let gfXml = '';
    if (params.graphicFrameXfrm) {
      gfXml = `
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr name="표1"/></p:nvGraphicFramePr>
          <p:xfrm>
            <a:off x="${params.graphicFrameXfrm.x}" y="${params.graphicFrameXfrm.y}"/>
            <a:ext cx="${params.graphicFrameXfrm.cx}" cy="${params.graphicFrameXfrm.cy}"/>
          </p:xfrm>
        </p:graphicFrame>`;
    }

    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:cSld>
          <p:spTree>
            ${spXml}
            ${picXml}
            ${gfXml}
          </p:spTree>
        </p:cSld>
      </p:sld>`
    );

    if (params.includeCorruptImage) {
      zip.file('ppt/media/image1.png', Buffer.alloc(0)); // 0-byte corrupt image
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`
      );
    } else if (params.include150DpiImage || params.includeLowDpiImage) {
      // Create minimal valid 1x1 or WxH PNG
      // PNG header: 8 bytes signature + 25 bytes IHDR
      const w = params.includeLowDpiImage ? 100 : 1500; // if box is 5 inches (4572000 EMU): 1500/5 = 300 DPI, 100/5 = 20 DPI
      const h = 1000;
      const pngBuf = Buffer.alloc(33);
      pngBuf.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0);
      pngBuf.writeUInt32BE(13, 8); // IHDR length
      pngBuf.write('IHDR', 12);
      pngBuf.writeUInt32BE(w, 16);
      pngBuf.writeUInt32BE(h, 20);

      zip.file('ppt/media/image1.png', pngBuf);
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`
      );
    }

    return await zip.generateAsync({ type: 'nodebuffer' });
  };

  describe('1. 16:9 EMU Canvas Bleed Detection', () => {
    it('Positive Pair: Object exactly touching 12,192,000 x 6,858,000 EMU boundary passes', async () => {
      const buf = await createMinimalPptxBuffer({
        spXfrm: { x: 0, y: 0, cx: 12192000, cy: 6858000 },
      });
      const result = await inspectPptxBinary(buf);
      expect(result.bleedCount).toBe(0);
      expect(result.isPass).toBe(true);
    });

    it('Negative Pair: Object with negative X coordinate bleeds', async () => {
      const buf = await createMinimalPptxBuffer({
        spXfrm: { x: -50000, y: 100000, cx: 5000000, cy: 2000000 },
      });
      const result = await inspectPptxBinary(buf);
      expect(result.bleedCount).toBe(1);
      expect(result.issues[0]).toContain('지면(16:9) 이탈 객체 검출');
      expect(result.isPass).toBe(false);
    });

    it('Negative Pair: p:pic exceeding 12,192,000 EMU bleeds', async () => {
      const buf = await createMinimalPptxBuffer({
        picXfrm: { x: 10000000, y: 100000, cx: 3000000, cy: 2000000 }, // 13,000,000 > 12,192,000
      });
      const result = await inspectPptxBinary(buf);
      expect(result.bleedCount).toBe(1);
      expect(result.isPass).toBe(false);
    });

    it('Negative Pair: p:graphicFrame exceeding 6,858,000 EMU bleeds', async () => {
      const buf = await createMinimalPptxBuffer({
        graphicFrameXfrm: { x: 1000000, y: 5000000, cx: 5000000, cy: 2000000 }, // 7,000,000 > 6,858,000
      });
      const result = await inspectPptxBinary(buf);
      expect(result.bleedCount).toBe(1);
      expect(result.isPass).toBe(false);
    });
  });

  describe('2. Binary Image Integrity & 150 DPI Resolution', () => {
    it('Positive Pair: Image with 300 DPI passes binary DPI gate', async () => {
      // 5 inches box width (4572000 EMU) with 1500px image = 300 DPI
      const buf = await createMinimalPptxBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: 4572000, cy: 3000000 },
        include150DpiImage: true,
      });
      const result = await inspectPptxBinary(buf);
      expect(result.brokenImageCount).toBe(0);
      expect(result.minEffectiveDpi).toBeGreaterThanOrEqual(150);
      expect(result.isPass).toBe(true);
    });

    it('Negative Pair: 0-byte broken image is detected and failed', async () => {
      const buf = await createMinimalPptxBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: 4572000, cy: 3000000 },
        includeCorruptImage: true,
      });
      const result = await inspectPptxBinary(buf);
      expect(result.brokenImageCount).toBeGreaterThan(0);
      expect(result.isPass).toBe(false);
    });

    it('Negative Pair: Low DPI image (< 150 DPI) fails quality check', async () => {
      // 5 inches box width (4572000 EMU) with 100px image = 20 DPI < 150 DPI
      const buf = await createMinimalPptxBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: 4572000, cy: 3000000 },
        includeLowDpiImage: true,
      });
      const result = await inspectPptxBinary(buf);
      expect(result.minEffectiveDpi).toBeLessThan(150);
      expect(result.isPass).toBe(false);
    });
  });

  describe('3. Rule 1, Rule 2, and P0 Legal Compliance Scans', () => {
    it('Positive Pair: Clean CRE standard text passes text compliance', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '연 순수익률 (Cap Rate) 4.5%, 사옥 단독 명칭 표기(간판 설치권) 협의 가능',
      });
      const result = await inspectPptxBinary(buf);
      expect(result.personaViolationCount).toBe(0);
      expect(result.lexiconViolationCount).toBe(0);
      expect(result.legalRiskViolationCount).toBe(0);
      expect(result.isPass).toBe(true);
    });

    it('Negative Pair: Rule 1 Persona term in slide text is rejected', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '본 물건은 60대 자산가를 위한 핵심 투자 자산입니다.',
      });
      const result = await inspectPptxBinary(buf);
      expect(result.personaViolationCount).toBe(1);
      expect(result.isPass).toBe(false);
    });

    it('Negative Pair: Rule 2 Banned lexicon (캡레이트) in slide text is rejected', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '예상 캡레이트는 5.2% 수준입니다.',
      });
      const result = await inspectPptxBinary(buf);
      expect(result.lexiconViolationCount).toBe(1);
      expect(result.isPass).toBe(false);
    });

    it('Negative Pair: P0 Legal Risk phrase (수익률 보장) is rejected', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '연 6% 수익률 보장 상품입니다.',
      });
      const result = await inspectPptxBinary(buf);
      expect(result.legalRiskViolationCount).toBe(1);
      expect(result.isPass).toBe(false);
    });
  });

  describe('4. P-PPTX-RELEASE Evaluator Profile Integration', () => {
    it('Positive Pair: Clean PPTX deck passes full P-PPTX-RELEASE evaluation', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '연 순수익률 (Cap Rate) 4.5%, 실질 영업이익 (GOP) 안정적',
      });

      const deck: PPTXDeckSpec & { pptxBuffer: Buffer } = {
        deckId: 'deck-clean',
        bodySlideCount: 12,
        appendixSlideCount: 2,
        slides: [
          {
            slideNumber: 1,
            title: '투자 개요',
            layoutStyle: 'split',
            leftContent: { narrative: '안정적인 임대 수익을 창출하는 역세권 빌딩' },
            rightContent: { cards: [{ label: '연 순수익률 (Cap Rate)', value: '4.5%' }] },
          },
        ],
        pptxBuffer: buf,
      };

      const report = await evaluator.evaluateProfile('P-PPTX-RELEASE', 'run-clean', deck);
      expect(report.blockerCount).toBe(0);
      expect(report.results.every((r) => r.status === 'PASS')).toBe(true);
    });

    it('Negative Pair: Deck with persona violation fails P-PPTX-RELEASE', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '법인 대표 맞춤 사옥 추천',
      });

      const deck: PPTXDeckSpec & { pptxBuffer: Buffer } = {
        deckId: 'deck-persona-fail',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [{ slideNumber: 1, title: '개요', layoutStyle: 'minimal' }],
        pptxBuffer: buf,
      };

      const report = await evaluator.evaluateProfile('P-PPTX-RELEASE', 'run-persona-fail', deck);
      expect(report.blockerCount).toBeGreaterThan(0);
      const failedGates = report.results.filter((r) => r.status === 'FAIL').map((r) => r.gateId);
      expect(failedGates).toContain('GATE-PPTX-PERSONA-ISOLATION');
    });

    it('Negative Pair: Deck with banned lexicon fails P-PPTX-RELEASE', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '네이밍 라이츠 부여 물건',
      });

      const deck: PPTXDeckSpec & { pptxBuffer: Buffer } = {
        deckId: 'deck-lexicon-fail',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [{ slideNumber: 1, title: '개요', layoutStyle: 'minimal' }],
        pptxBuffer: buf,
      };

      const report = await evaluator.evaluateProfile('P-PPTX-RELEASE', 'run-lexicon-fail', deck);
      expect(report.blockerCount).toBeGreaterThan(0);
      const failedGates = report.results.filter((r) => r.status === 'FAIL').map((r) => r.gateId);
      expect(failedGates).toContain('GATE-PPTX-LEXICON-COMPLIANCE');
    });

    it('Negative Pair: Deck with illegal guarantee fails P-PPTX-RELEASE', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '원금 보장 확실한 투자 기회',
      });

      const deck: PPTXDeckSpec & { pptxBuffer: Buffer } = {
        deckId: 'deck-legal-fail',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [{ slideNumber: 1, title: '개요', layoutStyle: 'minimal' }],
        pptxBuffer: buf,
      };

      const report = await evaluator.evaluateProfile('P-PPTX-RELEASE', 'run-legal-fail', deck);
      expect(report.blockerCount).toBeGreaterThan(0);
      const failedGates = report.results.filter((r) => r.status === 'FAIL').map((r) => r.gateId);
      expect(failedGates).toContain('GATE-PPTX-LEGAL-SAFETY');
    });

    it('Negative Pair: Deck with inverted legal risk "확정 수익" fails P-PPTX-RELEASE', async () => {
      const buf = await createMinimalPptxBuffer({
        text: '연 7% 확정 수익 지급 보장 매물',
      });

      const deck: PPTXDeckSpec & { pptxBuffer: Buffer } = {
        deckId: 'deck-hakjeong-profit-fail',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [{ slideNumber: 1, title: '개요', layoutStyle: 'minimal' }],
        pptxBuffer: buf,
      };

      const report = await evaluator.evaluateProfile('P-PPTX-RELEASE', 'run-hakjeong-profit-fail', deck);
      expect(report.blockerCount).toBeGreaterThan(0);
      const failedGates = report.results.filter((r) => r.status === 'FAIL').map((r) => r.gateId);
      expect(failedGates).toContain('GATE-PPTX-LEGAL-SAFETY');
    });

    it('Negative Pair: Deck with canvas bleed fails P-PPTX-RELEASE', async () => {
      const buf = await createMinimalPptxBuffer({
        spXfrm: { x: 12000000, y: 100000, cx: 3000000, cy: 2000000 },
      });

      const deck: PPTXDeckSpec & { pptxBuffer: Buffer } = {
        deckId: 'deck-bleed-fail',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [{ slideNumber: 1, title: '개요', layoutStyle: 'minimal' }],
        pptxBuffer: buf,
      };

      const report = await evaluator.evaluateProfile('P-PPTX-RELEASE', 'run-bleed-fail', deck);
      expect(report.blockerCount).toBeGreaterThan(0);
      const failedGates = report.results.filter((r) => r.status === 'FAIL').map((r) => r.gateId);
      expect(failedGates).toContain('GATE-PPTX-BINARY-PHYSICAL');
    });
  });
});
