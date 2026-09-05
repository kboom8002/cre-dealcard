import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  inspectPptxBinary,
  FORBIDDEN_PERSONA_PATTERN,
  FORBIDDEN_LEXICON_PATTERN,
  FORBIDDEN_LEGAL_RISK_PATTERN,
} from '@/assurance/im-harness/observers/pptx-binary-observer';
import { HarnessEvaluator } from '@/assurance/im-harness/evaluator';
import { registerPPTXProfiles } from '@/assurance/im-harness/profiles/pptx-profile';
import type { PPTXDeckSpec } from '@/domain/building/pptx-publication/types';

describe('Adversarial Challenger M12-2: Physical Integrity & Regulatory Compliance', () => {
  const evaluator = new HarnessEvaluator();
  registerPPTXProfiles(evaluator);

  // Helper to construct mock PPTX buffers with arbitrary shapes, images, and text
  const buildChallengerDeckBuffer = async (options: {
    spXfrm?: { x: number; y: number; cx: number; cy: number };
    picXfrm?: { x: number; y: number; cx: number; cy: number };
    graphicFrameXfrm?: { x: number; y: number; cx: number; cy: number };
    grpSpXfrm?: { x: number; y: number; cx: number; cy: number };
    text?: string;
    imageType?: 'none' | 'corrupt-0byte' | 'corrupt-header' | 'missing-file' | 'png-high' | 'png-low' | 'png-boundary' | 'jpg-high' | 'jpg-low';
  }): Promise<Buffer> => {
    const zip = new JSZip();

    let spXml = '';
    if (options.spXfrm) {
      spXml = `
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="${options.spXfrm.x}" y="${options.spXfrm.y}"/>
              <a:ext cx="${options.spXfrm.cx}" cy="${options.spXfrm.cy}"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:p><a:r><a:t>${options.text ?? '테스트 텍스트'}</a:t></a:r></a:p>
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
            <a:p><a:r><a:t>${options.text ?? '정상 본문 텍스트'}</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>`;
    }

    let picXml = '';
    if (options.picXfrm) {
      picXml = `
        <p:pic>
          <p:nvPicPr><p:cNvPr name="사진1"/></p:nvPicPr>
          <p:blipFill><a:blip r:embed="rIdImg1"/></p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="${options.picXfrm.x}" y="${options.picXfrm.y}"/>
              <a:ext cx="${options.picXfrm.cx}" cy="${options.picXfrm.cy}"/>
            </a:xfrm>
          </p:spPr>
        </p:pic>`;
    }

    let gfXml = '';
    if (options.graphicFrameXfrm) {
      gfXml = `
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr name="표1"/></p:nvGraphicFramePr>
          <p:xfrm>
            <a:off x="${options.graphicFrameXfrm.x}" y="${options.graphicFrameXfrm.y}"/>
            <a:ext cx="${options.graphicFrameXfrm.cx}" cy="${options.graphicFrameXfrm.cy}"/>
          </p:xfrm>
        </p:graphicFrame>`;
    }

    let grpXml = '';
    if (options.grpSpXfrm) {
      grpXml = `
        <p:grpSp>
          <p:grpSpPr>
            <a:xfrm>
              <a:off x="${options.grpSpXfrm.x}" y="${options.grpSpXfrm.y}"/>
              <a:ext cx="${options.grpSpXfrm.cx}" cy="${options.grpSpXfrm.cy}"/>
            </a:xfrm>
          </p:grpSpPr>
        </p:grpSp>`;
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
            ${grpXml}
          </p:spTree>
        </p:cSld>
      </p:sld>`
    );

    const imageType = options.imageType ?? 'none';
    if (imageType === 'corrupt-0byte') {
      zip.file('ppt/media/image1.png', Buffer.alloc(0));
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`
      );
    } else if (imageType === 'corrupt-header') {
      zip.file('ppt/media/image1.png', Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]));
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`
      );
    } else if (imageType === 'missing-file') {
      // Points to non-existent image
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/nonexistent.png"/>
        </Relationships>`
      );
    } else if (imageType.startsWith('png-')) {
      let w = 1500;
      if (imageType === 'png-low') w = 600; // 600px / 5 in = 120 DPI (< 150)
      if (imageType === 'png-boundary') w = 750; // 750px / 5 in = 150 DPI (exact boundary)

      const pngBuf = Buffer.alloc(33);
      pngBuf.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0);
      pngBuf.writeUInt32BE(13, 8);
      pngBuf.write('IHDR', 12);
      pngBuf.writeUInt32BE(w, 16);
      pngBuf.writeUInt32BE(1000, 20);

      zip.file('ppt/media/image1.png', pngBuf);
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`
      );
    } else if (imageType.startsWith('jpg-')) {
      let w = 1500;
      if (imageType === 'jpg-low') w = 500; // 500px / 5 in = 100 DPI (< 150)
      const h = 800;

      // Construct minimal valid JPEG SOI + SOF0 (baseline DCT)
      // FF D8 (SOI)
      // FF C0 (SOF0) length: 17 bytes (0x00, 0x11)
      // precision: 8, height (2 bytes), width (2 bytes), components: 3
      const jpgBuf = Buffer.alloc(20);
      jpgBuf[0] = 0xFF; jpgBuf[1] = 0xD8; // SOI
      jpgBuf[2] = 0xFF; jpgBuf[3] = 0xC0; // SOF0
      jpgBuf.writeUInt16BE(15, 4); // segment length
      jpgBuf[6] = 8; // precision
      jpgBuf.writeUInt16BE(h, 7); // height
      jpgBuf.writeUInt16BE(w, 9); // width
      jpgBuf[11] = 3; // 3 color components

      zip.file('ppt/media/image1.jpg', jpgBuf);
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpg"/>
        </Relationships>`
      );
    }

    return await zip.generateAsync({ type: 'nodebuffer' });
  };

  describe('1. 16:9 Boundary Stress Testing (12,192,000 x 6,858,000 EMU with 10,000 EMU tolerance)', () => {
    it('Passes when element is exactly at (0, 0) and extends to (12,192,000, 6,858,000)', async () => {
      const buf = await buildChallengerDeckBuffer({
        spXfrm: { x: 0, y: 0, cx: 12192000, cy: 6858000 },
      });
      const res = await inspectPptxBinary(buf);
      expect(res.bleedCount).toBe(0);
      expect(res.isPass).toBe(true);
    });

    it('Passes when element is at boundary within 10,000 EMU rounding tolerance', async () => {
      const buf = await buildChallengerDeckBuffer({
        spXfrm: { x: -10000, y: -10000, cx: 12212000, cy: 6878000 },
      });
      // x: -10000 (== -BLEED_TOLERANCE_EMU) -> ok
      // x+cx: -10000 + 12212000 = 12202000 (== 12192000 + 10000) -> ok
      // y: -10000 (== -BLEED_TOLERANCE_EMU) -> ok
      // y+cy: -10000 + 6878000 = 6868000 (== 6858000 + 10000) -> ok
      const res = await inspectPptxBinary(buf);
      expect(res.bleedCount).toBe(0);
      expect(res.isPass).toBe(true);
    });

    it('Catches left edge bleed past -10,000 EMU (e.g. -10,001 EMU)', async () => {
      const buf = await buildChallengerDeckBuffer({
        spXfrm: { x: -10001, y: 100000, cx: 5000000, cy: 2000000 },
      });
      const res = await inspectPptxBinary(buf);
      expect(res.bleedCount).toBe(1);
      expect(res.issues.some((i) => i.includes('지면(16:9) 이탈'))).toBe(true);
      expect(res.isPass).toBe(false);
    });

    it('Catches top edge bleed past -10,000 EMU (e.g. -10,001 EMU)', async () => {
      const buf = await buildChallengerDeckBuffer({
        spXfrm: { x: 100000, y: -10001, cx: 5000000, cy: 2000000 },
      });
      const res = await inspectPptxBinary(buf);
      expect(res.bleedCount).toBe(1);
      expect(res.issues.some((i) => i.includes('지면(16:9) 이탈'))).toBe(true);
      expect(res.isPass).toBe(false);
    });

    it('Catches right edge bleed past 12,192,000 + 10,000 EMU (e.g. 12,202,001 EMU)', async () => {
      const buf = await buildChallengerDeckBuffer({
        spXfrm: { x: 10000000, y: 100000, cx: 2202001, cy: 2000000 },
      });
      const res = await inspectPptxBinary(buf);
      expect(res.bleedCount).toBe(1);
      expect(res.issues.some((i) => i.includes('지면(16:9) 이탈'))).toBe(true);
      expect(res.isPass).toBe(false);
    });

    it('Catches bottom edge bleed past 6,858,000 + 10,000 EMU (e.g. 6,868,001 EMU)', async () => {
      const buf = await buildChallengerDeckBuffer({
        spXfrm: { x: 1000000, y: 5000000, cx: 4000000, cy: 1868001 },
      });
      const res = await inspectPptxBinary(buf);
      expect(res.bleedCount).toBe(1);
      expect(res.issues.some((i) => i.includes('지면(16:9) 이탈'))).toBe(true);
      expect(res.isPass).toBe(false);
    });

    it('Catches group shape (p:grpSp) bleeding off the canvas', async () => {
      const buf = await buildChallengerDeckBuffer({
        grpSpXfrm: { x: 11000000, y: 5000000, cx: 3000000, cy: 3000000 },
      });
      const res = await inspectPptxBinary(buf);
      expect(res.bleedCount).toBe(1);
      expect(res.issues.some((i) => i.includes('그룹도형 지면(16:9) 이탈'))).toBe(true);
      expect(res.isPass).toBe(false);
    });
  });

  describe('2. 150 DPI Image Resolution & Broken Asset Verification', () => {
    const BOX_5_INCHES_EMU = 4572000; // 5 inches * 914400 EMU

    it('Passes exact 150 DPI boundary (750px / 5 in = 150 DPI)', async () => {
      const buf = await buildChallengerDeckBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: BOX_5_INCHES_EMU, cy: 3000000 },
        imageType: 'png-boundary',
      });
      const res = await inspectPptxBinary(buf);
      expect(res.minEffectiveDpi).toBe(150);
      expect(res.brokenImageCount).toBe(0);
      expect(res.isPass).toBe(true);
    });

    it('Fails low-resolution PNG image (< 150 DPI, 600px / 5 in = 120 DPI)', async () => {
      const buf = await buildChallengerDeckBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: BOX_5_INCHES_EMU, cy: 3000000 },
        imageType: 'png-low',
      });
      const res = await inspectPptxBinary(buf);
      expect(res.minEffectiveDpi).toBe(120);
      expect(res.isPass).toBe(false);
      expect(res.issues.some((i) => i.includes('실효 DPI 부족 (120 DPI < 150 DPI)'))).toBe(true);
    });

    it('Passes valid high-resolution JPEG (1500px / 5 in = 300 DPI)', async () => {
      const buf = await buildChallengerDeckBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: BOX_5_INCHES_EMU, cy: 3000000 },
        imageType: 'jpg-high',
      });
      const res = await inspectPptxBinary(buf);
      expect(res.minEffectiveDpi).toBe(300);
      expect(res.brokenImageCount).toBe(0);
      expect(res.isPass).toBe(true);
    });

    it('Fails low-resolution JPEG (< 150 DPI, 500px / 5 in = 100 DPI)', async () => {
      const buf = await buildChallengerDeckBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: BOX_5_INCHES_EMU, cy: 3000000 },
        imageType: 'jpg-low',
      });
      const res = await inspectPptxBinary(buf);
      expect(res.minEffectiveDpi).toBe(100);
      expect(res.isPass).toBe(false);
      expect(res.issues.some((i) => i.includes('실효 DPI 부족'))).toBe(true);
    });

    it('Fails 0-byte corrupt image binary', async () => {
      const buf = await buildChallengerDeckBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: BOX_5_INCHES_EMU, cy: 3000000 },
        imageType: 'corrupt-0byte',
      });
      const res = await inspectPptxBinary(buf);
      expect(res.brokenImageCount).toBeGreaterThan(0);
      expect(res.issues.some((i) => i.includes('0바이트 손상된 이미지 파일'))).toBe(true);
      expect(res.isPass).toBe(false);
    });

    it('Fails corrupted image header with unreadable dimensions', async () => {
      const buf = await buildChallengerDeckBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: BOX_5_INCHES_EMU, cy: 3000000 },
        imageType: 'corrupt-header',
      });
      const res = await inspectPptxBinary(buf);
      expect(res.brokenImageCount).toBeGreaterThan(0);
      expect(res.issues.some((i) => i.includes('이미지 헤더 손상'))).toBe(true);
      expect(res.isPass).toBe(false);
    });

    it('Fails relationship pointing to non-existent image file', async () => {
      const buf = await buildChallengerDeckBuffer({
        picXfrm: { x: 1000000, y: 1000000, cx: BOX_5_INCHES_EMU, cy: 3000000 },
        imageType: 'missing-file',
      });
      const res = await inspectPptxBinary(buf);
      expect(res.brokenImageCount).toBeGreaterThan(0);
      expect(res.issues.some((i) => i.includes('참조된 이미지 파일 부재'))).toBe(true);
      expect(res.isPass).toBe(false);
    });
  });

  describe('3. Rule 1 Persona Isolation Stress Testing', () => {
    const personaCases = [
      { text: '60대 자산가를 위한 프리미엄 자산', match: '60대 자산가' },
      { text: '60대자산가 추천 매물', match: '60대자산가' },
      { text: '법인 대표 맞춤 사옥 이전 솔루션', match: '법인 대표' },
      { text: '70대 자산가 상속 절세 전략', match: '70대 자산가' },
      { text: '30대 투자자 맞춤 수익형 꼬마빌딩', match: '30대 투자자' },
      { text: '초보 투자자 진입 가이드', match: '초보 투자자' },
      { text: '고액 자산가 전용 프라이빗 딜', match: '고액 자산가' },
      { text: 'VIP 고객 특별 배정 물건', match: 'VIP 고객' },
      { text: '디벨로퍼 매수자를 위한 신축 부지', match: '디벨로퍼 매수자' },
      { text: '기관 운용사 블라인드 펀드 타깃', match: '기관 운용사' },
    ];

    for (const { text, match } of personaCases) {
      it(`Catches persona term "${match}" in slide text`, async () => {
        expect(FORBIDDEN_PERSONA_PATTERN.test(text)).toBe(true);
        const buf = await buildChallengerDeckBuffer({ text });
        const res = await inspectPptxBinary(buf);
        expect(res.personaViolationCount).toBe(1);
        expect(res.issues.some((i) => i.includes('Rule 1 페르소나 위반'))).toBe(true);
        expect(res.isPass).toBe(false);
      });
    }

    it('Allows objective property narrative with zero persona references', async () => {
      const cleanText = '강남대로 이면 코너에 위치한 근린생활시설로, 전층 우량 임차인이 입주해 안정적인 현금흐름을 창출합니다.';
      expect(FORBIDDEN_PERSONA_PATTERN.test(cleanText)).toBe(false);
      const buf = await buildChallengerDeckBuffer({ text: cleanText });
      const res = await inspectPptxBinary(buf);
      expect(res.personaViolationCount).toBe(0);
      expect(res.isPass).toBe(true);
    });
  });

  describe('4. Rule 2 Korean CRE Lexicon Compliance Stress Testing', () => {
    const prohibitedTerms = [
      { text: '당 빌딩의 캡레이트는 4.8%로 추산됩니다.', term: '캡레이트' },
      { text: '입주사 대상 네이밍 라이츠 협의 가능', term: '네이밍 라이츠' },
      { text: '사옥 브랜딩 라이츠 부여 조건', term: '브랜딩 라이츠' },
      { text: '네이밍라이츠 및 옥상 광고탑 설치권', term: '네이밍라이츠' },
      { text: '브랜딩라이츠 패키지 제공', term: '브랜딩라이츠' },
      { text: '호텔 운영을 통한 GOP 개선 여력', term: 'GOP (bare)' },
      { text: '연간 예상 GOP 마진 28%', term: 'GOP (bare with prefix)' },
    ];

    for (const { text, term } of prohibitedTerms) {
      it(`Rejects prohibited transliteration "${term}"`, async () => {
        expect(FORBIDDEN_LEXICON_PATTERN.test(text)).toBe(true);
        const buf = await buildChallengerDeckBuffer({ text });
        const res = await inspectPptxBinary(buf);
        expect(res.lexiconViolationCount).toBe(1);
        expect(res.issues.some((i) => i.includes('Rule 2 CRE 표준용어 위반'))).toBe(true);
        expect(res.isPass).toBe(false);
      });
    }

    const permittedStandardTerms = [
      { text: '연 순수익률 (Cap Rate) 4.5% 기준 밸류에이션', desc: '연 순수익률 (Cap Rate)' },
      { text: '연 순수익률(Cap Rate) 4.2% 안정적 달성', desc: '연 순수익률(Cap Rate) no space' },
      { text: '실질 영업이익 (GOP) 520백만원 수준', desc: '실질 영업이익 (GOP)' },
      { text: '실질영업이익(GOP) 기준 현금흐름 분석', desc: '실질영업이익(GOP) no space' },
      { text: '실질 영업이익 GOP 4.5억원 예상', desc: '실질 영업이익 GOP without parens' },
      { text: '사옥 단독 명칭 표기(간판 설치권) 협의 가능', desc: '표준 간판 설치권' },
      { text: '기업 단독 브랜딩 적용 가능', desc: '기업 단독 브랜딩' },
      { text: '인테리어 지원금(TI) 및 렌트프리(무상임대) 조건 협의', desc: '인테리어 지원금/렌트프리' },
    ];

    for (const { text, desc } of permittedStandardTerms) {
      it(`Permits standardized CRE term: "${desc}"`, async () => {
        expect(FORBIDDEN_LEXICON_PATTERN.test(text)).toBe(false);
        const buf = await buildChallengerDeckBuffer({ text });
        const res = await inspectPptxBinary(buf);
        expect(res.lexiconViolationCount).toBe(0);
        expect(res.isPass).toBe(true);
      });
    }
  });

  describe('5. P0 Broker Legal Safety & Guaranteed Return Claims Stress Testing', () => {
    it('Catches "원금 보장" (Principal Guarantee)', async () => {
      const text = '원금 보장 확실한 우량 담보 투자 물건';
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text)).toBe(true);
      const buf = await buildChallengerDeckBuffer({ text });
      const res = await inspectPptxBinary(buf);
      expect(res.legalRiskViolationCount).toBe(1);
      expect(res.isPass).toBe(false);
    });

    it('Catches "원금보장" (without space)', async () => {
      const text = '원금보장형 안전 배당 자산';
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text)).toBe(true);
      const buf = await buildChallengerDeckBuffer({ text });
      const res = await inspectPptxBinary(buf);
      expect(res.legalRiskViolationCount).toBe(1);
      expect(res.isPass).toBe(false);
    });

    it('Catches "수익률 보장" and "수익률 확정"', async () => {
      const text1 = '연 6% 수익률 보장 상품';
      const text2 = '연 순수익률 5% 수익률 확정 조건';
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text1)).toBe(true);
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text2)).toBe(true);
    });

    it('Catches "현금흐름 보장" and "배당 확정"', async () => {
      const text1 = '월세 1,200만원 현금흐름 보장 매물';
      const text2 = '분기별 배당 확정 우량 리츠';
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text1)).toBe(true);
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text2)).toBe(true);
    });

    it('Catches "매수 추천" and "대출 확정"', async () => {
      const text1 = '전문가 강력 매수 추천 매물';
      const text2 = '시중은행 LTV 80% 대출 확정 조건';
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text1)).toBe(true);
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test(text2)).toBe(true);
    });

    // CRITICAL ADVERSARIAL CHALLENGE: "확정 수익" vs FORBIDDEN_LEGAL_RISK_PATTERN
    it('ADVERSARIAL CHALLENGE REMEDIATION: FORBIDDEN_LEGAL_RISK_PATTERN catches "확정 수익" / "확정수익" bidirectionally', async () => {
      const text1 = '연 7% 확정 수익 지급 보장';
      const text2 = '확정수익 지급 확약서 제공';
      const text3 = '확정 수익률 연 5.5%';
      const text4 = '연 6% 보장 수익 지급 계약';

      const matchesText1 = FORBIDDEN_LEGAL_RISK_PATTERN.test(text1);
      const matchesText2 = FORBIDDEN_LEGAL_RISK_PATTERN.test(text2);
      const matchesText3 = FORBIDDEN_LEGAL_RISK_PATTERN.test(text3);
      const matchesText4 = FORBIDDEN_LEGAL_RISK_PATTERN.test(text4);

      expect(matchesText1).toBe(true);
      expect(matchesText2).toBe(true);
      expect(matchesText3).toBe(true);
      expect(matchesText4).toBe(true);

      // Negative pair: Standard compliant expressions must not trigger false positives
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test('예상 수익률 연 5.5%')).toBe(false);
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test('실질 영업이익 (GOP)')).toBe(false);
      expect(FORBIDDEN_LEGAL_RISK_PATTERN.test('임대 수익 현황 분석')).toBe(false);

      const buf = await buildChallengerDeckBuffer({ text: '연 7% 확정 수익 지급' });
      const res = await inspectPptxBinary(buf);
      expect(res.legalRiskViolationCount).toBeGreaterThan(0);

      // Test via HarnessEvaluator P-PPTX-RELEASE profile
      const deck: PPTXDeckSpec & { pptxBuffer: Buffer } = {
        deckId: 'deck-hakjeong-profit-leak',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [
          {
            slideNumber: 1,
            title: '확정 수익 제안',
            layoutStyle: 'split',
            leftContent: { narrative: '매월 연 7% 확정 수익을 보장합니다.' },
            rightContent: { cards: [{ label: '예상수익', value: '확정수익 7%' }] },
          },
        ],
        pptxBuffer: buf,
      };

      const report = await evaluator.evaluateProfile('P-PPTX-RELEASE', 'run-hakjeong-leak', deck);
      const legalGate = report.results.find((r) => r.gateId === 'GATE-PPTX-LEGAL-SAFETY');
      expect(legalGate?.status).toBe('FAIL');
    });
  });
});
