/**
 * @file output-invariants.ts
 * @description 산출물(뷰어 텍스트 · PPTX 슬라이드 텍스트) 공통 불변식 검사기 (Hardening H1)
 *
 * - 순수 함수: 단위 테스트 · 골든 E2E · 운영 런타임에서 동일하게 재사용한다.
 * - 입력은 "텍스트 단위(슬라이드 1장 또는 뷰어 섹션 1개)" 배열이며, 위반은 단위별로 보고한다.
 * - 규칙 근거: Rule 4(비중복) · Rule 34(목데이터 금지) · Rule 37(회피 문구 금지, 결측은 '-').
 */

export type InvariantId =
  | 'PLACEHOLDER'
  | 'EVASIVE_PHRASE'
  | 'NUMERIC_ARTIFACT'
  | 'PAIRED_EMPTY'
  | 'JSON_MARKDOWN_LEAK'
  | 'MOCK_VALUE'
  | 'DUPLICATE_SENTENCE';

export interface InvariantViolation {
  id: InvariantId;
  severity: 'error' | 'warn';
  /** 위반이 발견된 텍스트 단위 인덱스 (슬라이드 번호 - 1 등) */
  unit: number;
  /** 매칭된 문자열(최대 60자) */
  sample: string;
}

interface RegexRule {
  id: InvariantId;
  severity: 'error' | 'warn';
  pattern: RegExp;
}

/** 플레이스홀더: 대괄호 안내 토큰, 템플릿 변수, 레거시 마스킹 토큰 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[(?:담당자명?|연락처|중개법인명?|회사명|전화번호|이름|주소|건물명(?:\s*비공개)?|매물명|대표자)[^\]]*\]/,
  /\{\{[^}]*\}\}/,
  /\bTODO\b/,
  /lorem ipsum/i,
  /\[(?:미입력|입력\s*필요|TBD|N\/A)\]/i,
];

/** 회피 문구 (Rule 37). 결측값은 '-'로 표기해야 한다. */
export const EVASIVE_PHRASES: readonly string[] = [
  '본문을 참조', '별도 안내 예정', '추후 확인', '상세...별첨',
  '추후 협의', '상세 제원은 실사 자료', '향후 공지', '별도 문의',
  '확인 중입니다', '데이터 로딩', '미정입니다', '분석 대기',
  '산출 중', '산정 중', '추후 제공', '준비 중입니다',
];

/** 타 매물 / 테스트 목데이터 알려진 상수 (Rule 34) */
export const KNOWN_MOCK_VALUES: readonly string[] = [
  'NH농협캐피탈', '테헤란로 123', '테헤란로 456', '피카딜리빌딩',
];

const REGEX_RULES: RegexRule[] = [
  // 수치 잔재
  { id: 'NUMERIC_ARTIFACT', severity: 'error', pattern: /(?:^|[\s(>:])(?:NaN|Infinity|-Infinity|undefined|null)(?=$|[\s)<,.%원억만평㎡대])/ },
  { id: 'NUMERIC_ARTIFACT', severity: 'error', pattern: /\[object Object\]/ },
  { id: 'NUMERIC_ARTIFACT', severity: 'error', pattern: /NaN\s*(?:%|원|억|만원|㎡|평|대)/ },
  // 짝 값 전체 결측: "-대 / -대", "-% / -%", "- / -"
  { id: 'PAIRED_EMPTY', severity: 'error', pattern: /(?:^|[\s(])-\s*(?:대|%|원|㎡|평|층|개)?\s*\/\s*-\s*(?:대|%|원|㎡|평|층|개)?(?=$|[\s),.])/ },
  // JSON / 마크다운 유출
  { id: 'JSON_MARKDOWN_LEAK', severity: 'error', pattern: /\{\s*"[A-Za-z_][A-Za-z0-9_]*"\s*:/ },
  { id: 'JSON_MARKDOWN_LEAK', severity: 'error', pattern: /\|\s*:?-{3,}:?\s*\|/ },
  { id: 'JSON_MARKDOWN_LEAK', severity: 'error', pattern: /\*\*[^*\n]{1,80}\*\*/ },
  { id: 'JSON_MARKDOWN_LEAK', severity: 'error', pattern: /(?:^|\n)\s{0,3}#{1,6}\s+\S/ },
  { id: 'JSON_MARKDOWN_LEAK', severity: 'error', pattern: /```/ },
];

function snippet(text: string, index: number, length: number): string {
  const s = text.slice(Math.max(0, index - 10), index + Math.min(length, 50));
  return s.replace(/\s+/g, ' ').slice(0, 60);
}

/** 문장 단위 분해 (Rule 4 중복 검사용). 15자 미만 조각은 무시한다. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 15);
}

export interface InvariantOptions {
  /** 중복 문장 검사를 끌 때 사용 (표 헤더 등 반복이 자연스러운 단위) */
  skipDuplicateSentence?: boolean;
  /** 추가 목데이터 상수 */
  extraMockValues?: readonly string[];
}

/**
 * 텍스트 단위 배열에 대해 모든 불변식을 검사한다.
 * @param units 슬라이드별 / 섹션별 텍스트
 */
export function checkOutputInvariants(
  units: readonly string[],
  options: InvariantOptions = {},
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const mocks = [...KNOWN_MOCK_VALUES, ...(options.extraMockValues ?? [])];

  units.forEach((raw, unit) => {
    const text = raw ?? '';

    for (const pattern of PLACEHOLDER_PATTERNS) {
      const m = pattern.exec(text);
      if (m) violations.push({ id: 'PLACEHOLDER', severity: 'error', unit, sample: snippet(text, m.index, m[0].length) });
    }

    for (const phrase of EVASIVE_PHRASES) {
      const idx = text.indexOf(phrase);
      if (idx >= 0) violations.push({ id: 'EVASIVE_PHRASE', severity: 'error', unit, sample: snippet(text, idx, phrase.length) });
    }

    for (const mock of mocks) {
      const idx = text.indexOf(mock);
      if (idx >= 0) violations.push({ id: 'MOCK_VALUE', severity: 'error', unit, sample: snippet(text, idx, mock.length) });
    }

    for (const rule of REGEX_RULES) {
      const m = rule.pattern.exec(text);
      if (m) violations.push({ id: rule.id, severity: rule.severity, unit, sample: snippet(text, m.index, m[0].length) });
    }

    if (!options.skipDuplicateSentence) {
      const seen = new Map<string, number>();
      for (const s of splitSentences(text)) seen.set(s, (seen.get(s) ?? 0) + 1);
      for (const [s, n] of seen) {
        if (n > 1) violations.push({ id: 'DUPLICATE_SENTENCE', severity: 'warn', unit, sample: s.slice(0, 60) });
      }
    }
  });

  return violations;
}

/** error 수준 위반만 추려 반환 */
export function errorsOf(violations: readonly InvariantViolation[]): InvariantViolation[] {
  return violations.filter(v => v.severity === 'error');
}

/** 사람이 읽을 수 있는 요약 (테스트 실패 메시지 · 텔레메트리용) */
export function formatViolations(violations: readonly InvariantViolation[]): string {
  if (violations.length === 0) return 'OK';
  return violations
    .map(v => `[${v.severity}] ${v.id} @unit#${v.unit + 1}: "${v.sample}"`)
    .join('\n');
}

/** PPTX 슬라이드 XML → 텍스트 (a:t 런을 이어 붙이고 문단 경계는 개행) */
export function extractSlideXmlText(slideXml: string): string {
  return slideXml
    .replace(/<\/a:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// 교차 일치 검사 (뷰어 ↔ PPTX · 슬라이드 ↔ 슬라이드)
// ─────────────────────────────────────────────────────────────

export interface ParityMismatch {
  key: string;
  a: string;
  b: string;
}

/** 값 비교용 정규화: 공백/쉼표/단위 표기 차이를 흡수한다. */
export function normalizeMetric(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\s,]/g, '').replace(/원$/, '').trim();
}

/**
 * 같은 키의 지표가 두 출처에서 동일한지 검사한다.
 * 한쪽에만 존재하거나 '-'(결측)인 키는 비교에서 제외한다.
 */
export function checkMetricParity(
  a: Readonly<Record<string, string | number | null | undefined>>,
  b: Readonly<Record<string, string | number | null | undefined>>,
): ParityMismatch[] {
  const out: ParityMismatch[] = [];
  for (const key of Object.keys(a)) {
    if (!(key in b)) continue;
    const na = normalizeMetric(a[key]);
    const nb = normalizeMetric(b[key]);
    if (!na || !nb || na === '-' || nb === '-') continue;
    if (na !== nb) out.push({ key, a: String(a[key]), b: String(b[key]) });
  }
  return out;
}
