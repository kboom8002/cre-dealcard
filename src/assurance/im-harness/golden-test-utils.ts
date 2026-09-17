import JSZip from 'jszip';
import {
  inspectPptxBinary,
  type PptxPhysicalInspectionResult,
  POISON_TOKEN_REGEX,
  EVASIVE_PHRASES_PATTERN,
  MOCK_LEAK_PATTERN,
} from './observers/pptx-binary-observer';

// Re-export inspectPptxBinary and related types/patterns
export {
  inspectPptxBinary,
  type PptxPhysicalInspectionResult,
  POISON_TOKEN_REGEX,
  EVASIVE_PHRASES_PATTERN,
  MOCK_LEAK_PATTERN,
};

/**
 * Slide text extraction result with slide number, concatenated text, and raw XML.
 */
export interface SlideTextExtraction {
  slideNumber: number;
  text: string;
  xml: string;
}

/**
 * Extracts text and raw XML for all slides in a PPTX buffer.
 * Framework-agnostic (Node/Vitest, non-Playwright).
 */
export async function extractSlideTexts(
  pptxBuffer: Buffer
): Promise<SlideTextExtraction[]> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const slideFiles = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f)
  );

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
    const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
    return numA - numB;
  });

  const results: SlideTextExtraction[] = [];

  for (const slidePath of slideFiles) {
    const slideNumber = parseInt(
      slidePath.match(/slide(\d+)\.xml/)?.[1] ?? '0',
      10
    );
    const xml = await zip.files[slidePath].async('string');
    const textMatches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? [];
    const text = textMatches.map((m) => m.replace(/<[^>]+>/g, '').trim()).join(' ');
    results.push({ slideNumber, text, xml });
  }

  return results;
}

/**
 * Asserts that the PPTX binary contains zero poison tokens (NaN, undefined, null, [object Object], {{...}}).
 * Throws a descriptive Error if any poison tokens are detected.
 */
export async function assertZeroPoisonTokens(pptxBuffer: Buffer): Promise<void> {
  const result = await inspectPptxBinary(pptxBuffer);
  if (result.poisonTokenViolationCount > 0 || result.placeholderResidueCount > 0) {
    const poisonIssues = result.issues.filter(
      (i) => i.includes('포이즌 토큰') || i.includes('미치환 자리표시자')
    );
    throw new Error(
      `Poison token or unresolved placeholder violation detected (${result.poisonTokenViolationCount} token(s), ${result.placeholderResidueCount} residue(s)):\n${poisonIssues.join('\n')}`
    );
  }
}

/**
 * Asserts that the PPTX binary contains zero evasive phrases ('추후 확인 필요', '미정', '상세 불명', etc.).
 * Throws a descriptive Error if any evasive phrases are detected.
 */
export async function assertZeroEvasivePhrases(pptxBuffer: Buffer): Promise<void> {
  const result = await inspectPptxBinary(pptxBuffer);
  if (result.evasivePhraseViolationCount > 0) {
    const evasiveIssues = result.issues.filter((i) => i.includes('회피성 문구 위반'));
    throw new Error(
      `Evasive phrase violation detected (${result.evasivePhraseViolationCount} occurrence(s)):\n${evasiveIssues.join('\n')}`
    );
  }
}

/**
 * Asserts that the PPTX binary contains zero mock data leaks ('NH농협캐피탈', '피카딜리빌딩', etc.).
 * Throws a descriptive Error if any mock data leaks are detected.
 */
export async function assertZeroMockLeaks(pptxBuffer: Buffer): Promise<void> {
  const result = await inspectPptxBinary(pptxBuffer);
  if (result.mockLeakViolationCount > 0) {
    const mockIssues = result.issues.filter((i) => i.includes('모의 데이터 누출 위반'));
    throw new Error(
      `Mock data leak violation detected (${result.mockLeakViolationCount} occurrence(s)):\n${mockIssues.join('\n')}`
    );
  }
}

/**
 * Asserts that all physical binary gates pass (isPass === true).
 * Otherwise throws a detailed error listing all detected issues.
 */
export async function assertAllPhysicalBinaryGates(
  pptxBuffer: Buffer
): Promise<PptxPhysicalInspectionResult> {
  const result = await inspectPptxBinary(pptxBuffer);
  if (!result.isPass) {
    throw new Error(
      `Physical binary gate assertion failed with ${result.issues.length} issue(s):\n${result.issues.join('\n')}`
    );
  }
  return result;
}

/**
 * Verifies mathematical consistency between executive summary metrics and detail schedules.
 * Checks:
 * 1. NOI consistency (Executive NOI vs Detail Year 1 NOI)
 * 2. Asking Price consistency (Executive Asking Price vs Detail Gross Sale Price)
 * 3. Initial Cap Rate formula consistency: Initial Cap Rate % === (NOI / Asking Price) * 100
 */
export function verifyMathematicalConsistency(
  summary: { noi?: number; askingPrice?: number; initialCapRatePct?: number },
  detail: { year1Noi?: number; grossSalePrice?: number }
): { isConsistent: boolean; discrepancies: string[] } {
  const discrepancies: string[] = [];

  // 1. NOI Consistency
  if (summary.noi !== undefined && detail.year1Noi !== undefined) {
    const diff = Math.abs(summary.noi - detail.year1Noi);
    const denom = Math.abs(summary.noi);
    const diffPct = denom > 0 ? (diff / denom) * 100 : 0;
    if (diff > 1 && diffPct > 0.01) {
      discrepancies.push(
        `NOI mismatch: executive summary (${summary.noi.toLocaleString()} KRW) vs detail schedule (${detail.year1Noi.toLocaleString()} KRW), diff: ${diff.toLocaleString()} KRW (${diffPct.toFixed(2)}%)`
      );
    }
  }

  // 2. Asking Price / Gross Sale Price Consistency
  if (summary.askingPrice !== undefined && detail.grossSalePrice !== undefined) {
    const diff = Math.abs(summary.askingPrice - detail.grossSalePrice);
    const denom = Math.abs(summary.askingPrice);
    const diffPct = denom > 0 ? (diff / denom) * 100 : 0;
    if (diff > 1 && diffPct > 0.01) {
      discrepancies.push(
        `Price mismatch: executive asking price (${summary.askingPrice.toLocaleString()} KRW) vs detail gross sale price (${detail.grossSalePrice.toLocaleString()} KRW), diff: ${diff.toLocaleString()} KRW (${diffPct.toFixed(2)}%)`
      );
    }
  }

  // 3. Initial Cap Rate Formula Consistency (tolerance: 0.05%p)
  const effectiveNoi = summary.noi ?? detail.year1Noi;
  const effectivePrice = summary.askingPrice ?? detail.grossSalePrice;
  if (
    summary.initialCapRatePct !== undefined &&
    effectiveNoi !== undefined &&
    effectivePrice !== undefined &&
    effectivePrice > 0
  ) {
    const derivedCapRatePct = (effectiveNoi / effectivePrice) * 100;
    const diffPp = Math.abs(summary.initialCapRatePct - derivedCapRatePct);
    if (diffPp > 0.05) {
      discrepancies.push(
        `Cap Rate formula mismatch: executive initial cap rate (${summary.initialCapRatePct}%) vs derived formula (${derivedCapRatePct.toFixed(2)}%), diff: ${diffPp.toFixed(4)}%p`
      );
    }
  }

  return {
    isConsistent: discrepancies.length === 0,
    discrepancies,
  };
}
