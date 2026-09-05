import type { SensitiveSegment } from './types';

/**
 * Detects sensitive PII or identifiable private details in raw broker memos.
 */
export function detectSensitiveSegments(rawText: string): SensitiveSegment[] {
  const segments: SensitiveSegment[] = [];

  // 1. Phone numbers (휴대전화 / 일반전화)
  const phoneRegex = /(?:01[016789]-?\d{3,4}-?\d{4}|02-?\d{3,4}-?\d{4})/g;
  let match: RegExpExecArray | null;
  while ((match = phoneRegex.exec(rawText)) !== null) {
    segments.push({
      type: 'phone_number',
      rawText: match[0],
      position: { start: match.index, end: match.index + match[0].length },
      action: 'mask',
    });
  }

  // 2. Exact addresses (번지수, 도로명 번호 포함: e.g. "당산동 123-4", "테헤란로 152")
  const addressRegex = /([가-힣]+(?:동|로|길)\s+\d+(?:-\d+)?(?:번지)?)/g;
  while ((match = addressRegex.exec(rawText)) !== null) {
    segments.push({
      type: 'exact_address',
      rawText: match[0],
      position: { start: match.index, end: match.index + match[0].length },
      action: 'generalize',
    });
  }

  // 3. Corporate Reg No (사업자등록번호 10자리)
  const bizNoRegex = /\b\d{3}-\d{2}-\d{5}\b/g;
  while ((match = bizNoRegex.exec(rawText)) !== null) {
    segments.push({
      type: 'corporate_reg_no',
      rawText: match[0],
      position: { start: match.index, end: match.index + match[0].length },
      action: 'remove',
    });
  }

  return segments;
}
