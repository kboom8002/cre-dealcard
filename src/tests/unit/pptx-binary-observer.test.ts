import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  inspectPptxBinary,
  POISON_TOKEN_REGEX,
  EVASIVE_PHRASES_PATTERN,
  MOCK_LEAK_PATTERN,
} from '@/assurance/im-harness/observers/pptx-binary-observer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
  verifyMathematicalConsistency,
} from '@/assurance/im-harness/golden-test-utils';

/**
 * Builds an in-memory PPTX buffer for testing binary inspection gates.
 */
async function buildTestPptx(
  slideContents: Array<{ text: string; xmlInject?: string }>
): Promise<Buffer> {
  const zip = new JSZip();

  // Create valid 200 DPI PNG dummy image (1600x1200 px at 6.0"x4.0" box = 266.7 DPI)
  const validPng = Buffer.alloc(33);
  validPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  validPng.writeUInt32BE(13, 8);
  validPng.write('IHDR', 12);
  validPng.writeUInt32BE(1600, 16);
  validPng.writeUInt32BE(1200, 20);
  zip.file('ppt/media/image1.png', validPng);

  slideContents.forEach((sc, idx) => {
    const slideNum = idx + 1;
    const shapeXml =
      sc.xmlInject ??
      `
      <p:sp>
        <p:nvSpPr><p:cNvPr id="${slideNum * 10}" name="Shape${slideNum}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="1000000" y="500000"/>
            <a:ext cx="5000000" cy="2000000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${sc.text}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>`;

    const picXml = `
      <p:pic>
        <p:nvPicPr><p:cNvPr id="${slideNum * 10 + 1}" name="Pic${slideNum}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rIdImg1"/></p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="1000000" y="3000000"/>
            <a:ext cx="5486400" cy="3657600"/>
          </a:xfrm>
        </p:spPr>
      </p:pic>`;

    zip.file(
      `ppt/slides/slide${slideNum}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:cSld>
          <p:spTree>
            ${shapeXml}
            ${picXml}
          </p:spTree>
        </p:cSld>
      </p:sld>`
    );

    zip.file(
      `ppt/slides/_rels/slide${slideNum}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
      </Relationships>`
    );
  });

  return await zip.generateAsync({ type: 'nodebuffer' });
}

describe('Milestone 3: Quality Assurance & Poison Prevention Binary Gates Suite', () => {
  // ── Test 1: Positive Case ──
  it('Test 1 (Positive): Clean valid slide XML passes all gates (isPass === true)', async () => {
    const cleanBuf = await buildTestPptx([
      { text: '강남구 역삼동 프라임 오피스 투자설명서 — 정상 자산 개요' },
      { text: '연간 실질 임대료 5.2억원, 안정적인 임차인 구성' },
    ]);

    const result = await inspectPptxBinary(cleanBuf);
    expect(result.isPass).toBe(true);
    expect(result.poisonTokenViolationCount).toBe(0);
    expect(result.evasivePhraseViolationCount).toBe(0);
    expect(result.mockLeakViolationCount).toBe(0);
    expect(result.placeholderResidueCount).toBe(0);
    expect(result.bleedCount).toBe(0);
    expect(result.brokenImageCount).toBe(0);
    expect(result.issues).toEqual([]);
  });

  // ── Test 2: Negative Pair - NaN Injection ──
  it('Test 2 (Negative Pair): Injected NaN inline or in tag is detected (poisonTokenViolationCount > 0, isPass === false)', async () => {
    // 2a. Inline NaN text
    const nanTextBuf = await buildTestPptx([
      { text: '예상 Cap Rate: NaN%' },
    ]);
    const nanTextRes = await inspectPptxBinary(nanTextBuf);
    expect(nanTextRes.poisonTokenViolationCount).toBeGreaterThanOrEqual(1);
    expect(nanTextRes.placeholderResidueCount).toBeGreaterThanOrEqual(1);
    expect(nanTextRes.isPass).toBe(false);
    expect(
      nanTextRes.issues.some(
        (i) => i.includes('[포이즌 토큰]') && i.includes('NaN')
      )
    ).toBe(true);

    // 2b. Tag-injected >NaN<
    const nanTagBuf = await buildTestPptx([
      {
        text: '정상 텍스트',
        xmlInject:
          '<p:sp><p:txBody><a:p><a:r><a:t>>NaN<</a:t></a:r></a:p></p:txBody></p:sp>',
      },
    ]);
    const nanTagRes = await inspectPptxBinary(nanTagBuf);
    expect(nanTagRes.poisonTokenViolationCount).toBeGreaterThanOrEqual(1);
    expect(nanTagRes.placeholderResidueCount).toBeGreaterThanOrEqual(1);
    expect(nanTagRes.isPass).toBe(false);
  });

  // ── Test 3: Negative Pair - undefined% Injection ──
  it('Test 3 (Negative Pair): Injected undefined% is detected (poisonTokenViolationCount > 0, isPass === false)', async () => {
    const undefinedBuf = await buildTestPptx([
      { text: 'LTV 시나리오 분석: LTV undefined% 적용 기준' },
    ]);
    const res = await inspectPptxBinary(undefinedBuf);
    expect(res.poisonTokenViolationCount).toBeGreaterThanOrEqual(1);
    expect(res.placeholderResidueCount).toBeGreaterThanOrEqual(1);
    expect(res.isPass).toBe(false);
    expect(
      res.issues.some(
        (i) => i.includes('[포이즌 토큰]') && i.includes('undefined')
      )
    ).toBe(true);
  });

  // ── Test 4: Negative Pair - [object Object] Injection ──
  it('Test 4 (Negative Pair): Injected [object Object] is detected (poisonTokenViolationCount > 0, isPass === false)', async () => {
    const objBuf = await buildTestPptx([
      { text: '소유권 및 저당권 현황: [object Object]' },
    ]);
    const res = await inspectPptxBinary(objBuf);
    expect(res.poisonTokenViolationCount).toBeGreaterThanOrEqual(1);
    expect(res.placeholderResidueCount).toBeGreaterThanOrEqual(1);
    expect(res.isPass).toBe(false);
    expect(
      res.issues.some(
        (i) => i.includes('[포이즌 토큰]') && i.includes('[object Object]')
      )
    ).toBe(true);
  });

  // ── Test 5: Negative Pair - Evasive Phrase Detection ──
  it('Test 5 (Negative Pair): Injected evasive phrase is detected (evasivePhraseViolationCount > 0, isPass === false)', async () => {
    const evasivePhrases = [
      '추후 확인 필요',
      '미정',
      '상세 불명',
      '확인 불가',
      '자료 없음',
    ];

    for (const phrase of evasivePhrases) {
      const buf = await buildTestPptx([
        { text: `주요 임대차 계약 조건: ${phrase}` },
      ]);
      const res = await inspectPptxBinary(buf);
      expect(res.evasivePhraseViolationCount).toBeGreaterThanOrEqual(1);
      expect(res.isPass).toBe(false);
      expect(
        res.issues.some((i) => i.includes('[회피성 문구 위반]'))
      ).toBe(true);
    }
  });

  // ── Test 6: Negative Pair - Mock Data Leak Detection ──
  it('Test 6 (Negative Pair): Injected mock name is detected (mockLeakViolationCount > 0, isPass === false)', async () => {
    const mockNames = [
      'NH농협캐피탈',
      'NH Capital',
      '피카딜리빌딩',
      '모의 건물',
      '모의 테넌트',
    ];

    for (const name of mockNames) {
      const buf = await buildTestPptx([
        { text: `주요 임차인 정보: ${name} 입주 완료` },
      ]);
      const res = await inspectPptxBinary(buf);
      expect(res.mockLeakViolationCount).toBeGreaterThanOrEqual(1);
      expect(res.isPass).toBe(false);
      expect(
        res.issues.some((i) => i.includes('[모의 데이터 누출 위반]'))
      ).toBe(true);
    }
  });

  // ── Test 7: Golden Test Utils Helper Assertions ──
  it('Test 7 (Helper assertions): golden-test-utils assertions throw descriptive errors on defects and succeed when clean', async () => {
    // 7a. Clean PPTX buffer passes all assertion helpers
    const cleanBuf = await buildTestPptx([
      { text: '정상 오피스 투자설명서 1면' },
    ]);

    await expect(assertZeroPoisonTokens(cleanBuf)).resolves.toBeUndefined();
    await expect(assertZeroEvasivePhrases(cleanBuf)).resolves.toBeUndefined();
    await expect(assertZeroMockLeaks(cleanBuf)).resolves.toBeUndefined();
    const cleanResult = await assertAllPhysicalBinaryGates(cleanBuf);
    expect(cleanResult.isPass).toBe(true);

    // 7b. Poison buffer rejects assertZeroPoisonTokens & assertAllPhysicalBinaryGates
    const poisonBuf = await buildTestPptx([{ text: '수익률: NaN%' }]);
    await expect(assertZeroPoisonTokens(poisonBuf)).rejects.toThrowError(
      /Poison token or unresolved placeholder violation detected/
    );
    await expect(assertAllPhysicalBinaryGates(poisonBuf)).rejects.toThrowError(
      /Physical binary gate assertion failed/
    );

    // 7c. Evasive buffer rejects assertZeroEvasivePhrases & assertAllPhysicalBinaryGates
    const evasiveBuf = await buildTestPptx([
      { text: '임대차 조건: 추후 확인 필요' },
    ]);
    await expect(assertZeroEvasivePhrases(evasiveBuf)).rejects.toThrowError(
      /Evasive phrase violation detected/
    );
    await expect(assertAllPhysicalBinaryGates(evasiveBuf)).rejects.toThrowError(
      /Physical binary gate assertion failed/
    );

    // 7d. Mock buffer rejects assertZeroMockLeaks & assertAllPhysicalBinaryGates
    const mockBuf = await buildTestPptx([
      { text: '임차인: NH농협캐피탈' },
    ]);
    await expect(assertZeroMockLeaks(mockBuf)).rejects.toThrowError(
      /Mock data leak violation detected/
    );
    await expect(assertAllPhysicalBinaryGates(mockBuf)).rejects.toThrowError(
      /Physical binary gate assertion failed/
    );
  });

  // ── Test 8: extractSlideTexts Extraction ──
  it('Test 8: extractSlideTexts correctly parses slide numbers, text content, and raw XML', async () => {
    const multiBuf = await buildTestPptx([
      { text: '첫 번째 슬라이드 개요 텍스트' },
      { text: '두 번째 슬라이드 재무 모델 스케줄' },
    ]);

    const extracted = await extractSlideTexts(multiBuf);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].slideNumber).toBe(1);
    expect(extracted[0].text).toContain('첫 번째 슬라이드 개요 텍스트');
    expect(extracted[0].xml).toContain('p:sld');
    expect(extracted[1].slideNumber).toBe(2);
    expect(extracted[1].text).toContain('두 번째 슬라이드 재무 모델 스케줄');
    expect(extracted[1].xml).toContain('p:sld');
  });

  // ── Test 9: verifyMathematicalConsistency SSoT Validation ──
  it('Test 9: verifyMathematicalConsistency enforces SSoT mathematical equality', () => {
    // 9a. Consistent inputs
    const consistent = verifyMathematicalConsistency(
      {
        noi: 500_000_000,
        askingPrice: 10_000_000_000,
        initialCapRatePct: 5.0,
      },
      {
        year1Noi: 500_000_000,
        grossSalePrice: 10_000_000_000,
      }
    );
    expect(consistent.isConsistent).toBe(true);
    expect(consistent.discrepancies).toHaveLength(0);

    // 9b. NOI mismatch
    const noiMismatch = verifyMathematicalConsistency(
      {
        noi: 500_000_000,
        askingPrice: 10_000_000_000,
        initialCapRatePct: 5.0,
      },
      {
        year1Noi: 450_000_000,
        grossSalePrice: 10_000_000_000,
      }
    );
    expect(noiMismatch.isConsistent).toBe(false);
    expect(
      noiMismatch.discrepancies.some((d) => d.includes('NOI mismatch'))
    ).toBe(true);

    // 9c. Asking Price mismatch
    const priceMismatch = verifyMathematicalConsistency(
      {
        noi: 500_000_000,
        askingPrice: 10_000_000_000,
        initialCapRatePct: 5.0,
      },
      {
        year1Noi: 500_000_000,
        grossSalePrice: 12_000_000_000,
      }
    );
    expect(priceMismatch.isConsistent).toBe(false);
    expect(
      priceMismatch.discrepancies.some((d) => d.includes('Price mismatch'))
    ).toBe(true);

    // 9d. Cap Rate formula discrepancy
    const capRateMismatch = verifyMathematicalConsistency(
      {
        noi: 500_000_000,
        askingPrice: 10_000_000_000,
        initialCapRatePct: 7.2, // Actual: 5.0%
      },
      {
        year1Noi: 500_000_000,
        grossSalePrice: 10_000_000_000,
      }
    );
    expect(capRateMismatch.isConsistent).toBe(false);
    expect(
      capRateMismatch.discrepancies.some((d) =>
        d.includes('Cap Rate formula mismatch')
      )
    ).toBe(true);
  });
});
