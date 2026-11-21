/**
 * @file src/lib/qa/ux-writing-and-content-oracle.ts
 * @description 3대 서브시스템(IM · 부동산뉴스 · 딜카드) 공용 결정론적
 *   UX 라이팅 스캐너(20점 축) & 도메인 콘텐츠 적합성 오라클(30점 축).
 *
 * 검사 범위:
 *  1) UX 라이팅: BANNED_UI_TERMS, 미해결 괄호 조사 `을(를)`/`이(가)`, 한국어 받침-조사 불일치,
 *     원시 에러/Poison 토큰(`PGRST`, `NaN`, `undefined`, `[임차인A]`), 조사 뒤 절단(`의…`, `를…`)
 *  2) 딜카드 적합성: 블라인드 지번·건물명 유출, 수치 주관적 수식어, 면적 중복, 3단 표준 제원 완결성
 *  3) 부동산뉴스 적합성: 5단 구조, `'이슈 1/2'` 번호표 배제, 다크 `#0F172A` 2×2 딜카드 썸네일, R-ONE 출처
 *  4) IM 적합성: 표지 공식, 층별 임대차 최고층→지하 정렬, Basic 스태킹 미노출, 기대수익률 통일,
 *     토지이음 출처, 16:9 가로 PDF HTML 패리티
 */

import { BANNED_UI_TERMS } from '@/lib/ux/lexicon';
import { detectSubjectiveNumericPhrases } from '@/lib/deal-card/blind-guard';

export interface UxWritingViolation {
  kind:
    | 'banned_jargon'
    | 'lazy_parenthetical_josa'
    | 'mismatched_korean_josa'
    | 'poison_or_raw_error'
    | 'awkward_truncation';
  match: string;
  suggestion: string;
}

export interface UxWritingScanResult {
  clean: boolean;
  totalViolations: number;
  bannedTermCount: number;
  josaViolationCount: number;
  poisonTokenCount: number;
  truncationViolationCount: number;
  violations: UxWritingViolation[];
}

const LAZY_PARENTHETICAL_JOSA_RE =
  /(?:을\(를\)|\(을\)를|이\(가\)|\(이\)가|은\(는\)|\(은\)는|과\(와\)|\(과\)와|으로\(로\)|\(으\)로)/g;

const POISON_OR_INTERNAL_LEAK_PATTERNS: ReadonlyArray<{ re: RegExp; suggestion: string }> = [
  { re: /PGRST\d*|relation\s+"[^"]+"\s+does not exist/g, suggestion: '친절한 한글 오류 안내문으로 변환' },
  { re: /\[object Object\]/g, suggestion: '객체 문자열 직렬화 오류 수정' },
  { re: /(?:^|[\s(>])(?:NaN|undefined)(?:%|억|만|원|평|㎡|건|층|호|[\s)<.,]|$)/gm, suggestion: '결측치 안전 포맷터(확인 중 / —) 적용' },
  { re: />(?:NaN|undefined|null)</g, suggestion: '빈 셀 안전 표기 적용' },
  { re: /\[임차인\s*[A-Z가-힣0-9]+\]/g, suggestion: '실제 상호(IM) 또는 업종 일반명(블라인드 티저) 표기' },
  { re: /(?:핵심\s*팩트\s*:|투자\s*제언\s*:)/g, suggestion: '내부 프롬프트 라벨 제거 후 자연스러운 문장 노출' },
];

const AWKWARD_PARTICLE_ELLIPSIS_RE =
  /[가-힣]+(?:의|및|을|를|은|는|과|와|에서|으로)\s*(?:…|\.\.\.)/g;

/** 받침이 반드시 있는 2음절 이상 CRE 핵심 명사 + 무받침 전용 조사(`를`, `는`, `와`) 결합 탐지 */
const BATCHIM_NOUNS = [
  '빌딩',
  '매물',
  '호실',
  '건물',
  '사옥',
  '면적',
  '연면적',
  '대지면적',
  '토지면적',
  '보증금',
  '권리금',
  '수익률',
  '공실률',
  '용적률',
  '건폐율',
  '변동률',
  '리포트',
  '사진',
  '지번',
  '권역',
  '이메일',
  '버튼',
  '파일',
  '항목',
  '고객',
  '승인일',
  '구독',
  '발송',
] as const;

/** 받침이 없는 2음절 이상 CRE 핵심 명사 + 유받침 전용 조사(`을`, `은`, `과`) 결합 탐지 */
const NO_BATCHIM_NOUNS = [
  '타워',
  '토지',
  '대지',
  '임대료',
  '관리비',
  '매매가',
  '평당가',
  '지가',
  '제안서',
  '보고서',
  '뉴스레터',
  '딜카드',
  '브리핑',
  '슬라이드',
  '발표자료',
  '주소',
  '연락처',
  '전화번호',
  '단추',
  '링크',
  '정보',
  '수치',
  '자료',
  '공시지가',
] as const;

const WRONG_JOSA_AFTER_BATCHIM_RE = new RegExp(
  `(?:${BATCHIM_NOUNS.join('|')})(?:를|는|와)(?=[\\s.,!?)"'\\]}]|$)`,
  'g',
);

const WRONG_JOSA_AFTER_NO_BATCHIM_RE = new RegExp(
  `(?:${NO_BATCHIM_NOUNS.join('|')})(?:을|은|과)(?=[\\s.,!?)"'\\]}]|$)`,
  'g',
);

const WRONG_JOSA_AFTER_UNIT_RE =
  /\d+(?:\.\d+)?(?:억|만|원|평|층|건|장|명)(?:를|와)(?=[\s.,!?)"'\]}]|$)|\d+(?:\.\d+)?(?:호|개|회|배)(?:을|과)(?=[\s.,!?)"'\]}]|$)/g;

export function hasHangulBatchim(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(char.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export function scanUxWriting(
  text: string,
  options: { skipBannedTerms?: boolean } = {},
): UxWritingScanResult {
  const violations: UxWritingViolation[] = [];
  if (!text || !text.trim()) {
    return {
      clean: true,
      totalViolations: 0,
      bannedTermCount: 0,
      josaViolationCount: 0,
      poisonTokenCount: 0,
      truncationViolationCount: 0,
      violations,
    };
  }

  let bannedTermCount = 0;
  if (!options.skipBannedTerms) {
    for (const { term, use } of BANNED_UI_TERMS) {
      const m = text.match(term);
      if (m) {
        bannedTermCount++;
        violations.push({
          kind: 'banned_jargon',
          match: m[0],
          suggestion: use,
        });
      }
    }
  }

  let josaViolationCount = 0;
  for (const m of text.matchAll(LAZY_PARENTHETICAL_JOSA_RE)) {
    josaViolationCount++;
    violations.push({
      kind: 'lazy_parenthetical_josa',
      match: m[0],
      suggestion: '앞 단어 받침에 맞는 단일 조사로 확정하거나 문장 구조 정돈',
    });
  }
  for (const m of text.matchAll(WRONG_JOSA_AFTER_BATCHIM_RE)) {
    josaViolationCount++;
    violations.push({
      kind: 'mismatched_korean_josa',
      match: m[0],
      suggestion: '받침 있는 명사 뒤 조사(을/은/과)로 교정',
    });
  }
  for (const m of text.matchAll(WRONG_JOSA_AFTER_NO_BATCHIM_RE)) {
    josaViolationCount++;
    violations.push({
      kind: 'mismatched_korean_josa',
      match: m[0],
      suggestion: '받침 없는 명사 뒤 조사(를/는/와)로 교정',
    });
  }
  for (const m of text.matchAll(WRONG_JOSA_AFTER_UNIT_RE)) {
    josaViolationCount++;
    violations.push({
      kind: 'mismatched_korean_josa',
      match: m[0],
      suggestion: '숫자 단위 받침에 맞는 조사로 교정',
    });
  }

  let poisonTokenCount = 0;
  for (const { re, suggestion } of POISON_OR_INTERNAL_LEAK_PATTERNS) {
    for (const m of text.matchAll(re)) {
      poisonTokenCount++;
      violations.push({
        kind: 'poison_or_raw_error',
        match: m[0].trim(),
        suggestion,
      });
    }
  }

  let truncationViolationCount = 0;
  for (const m of text.matchAll(AWKWARD_PARTICLE_ELLIPSIS_RE)) {
    truncationViolationCount++;
    violations.push({
      kind: 'awkward_truncation',
      match: m[0],
      suggestion: '조사 직후 말줄임 절단 금지 — 완결된 명사구/서술어로 요약',
    });
  }

  return {
    clean: violations.length === 0,
    totalViolations: violations.length,
    bannedTermCount,
    josaViolationCount,
    poisonTokenCount,
    truncationViolationCount,
    violations,
  };
}

// ── 1) DealCard Content Suitability Oracle ──────────────────────────────────

export interface DealCardSuitabilityAuditInput {
  renderedText: string;
  headline: string;
  areaBadgeText: string;
  points: readonly string[];
  posture: 'income' | 'owner_occupied' | 'value_add';
  forbiddenPublicTokens?: readonly string[];
  /** 원본 건물 제원이 존재할 때 수신자 상세 화면에 3단 제원(공통·건물·목적별)이 렌더링되었는지 검증 */
  expectThreeTierSpecsOnDetail?: boolean;
}

export interface DealCardSuitabilityAuditResult {
  passed: boolean;
  blindLeakCount: number;
  numericSpinCount: number;
  threeTierSpecMissingCount: number;
  duplicateAreaCount: number;
  postureAreaMismatch: boolean;
  totalViolations: number;
  details: string[];
}

export function auditDealCardContentSuitability(
  input: DealCardSuitabilityAuditInput,
): DealCardSuitabilityAuditResult {
  const details: string[] = [];
  let blindLeakCount = 0;

  for (const token of input.forbiddenPublicTokens ?? []) {
    const t = token.trim();
    if (t && input.renderedText.includes(t)) {
      blindLeakCount++;
      details.push(`blind_leak: "${t}" 공개 텍스트에 노출`);
    }
  }

  const spinChecks = detectSubjectiveNumericPhrases([input.headline, ...input.points]);
  const numericSpinCount = spinChecks.length;
  for (const sp of spinChecks) {
    details.push(`numeric_spin: "${sp.keyword}"`);
  }

  // 썸네일 면적 문구를 장점 3줄에서 그대로 반복했는지 점검
  let duplicateAreaCount = 0;
  const cleanAreaNum = input.areaBadgeText.replace(/\s+/g, '');
  if (cleanAreaNum && cleanAreaNum !== '—' && /\d/.test(cleanAreaNum)) {
    for (const pt of input.points) {
      if (pt.replace(/\s+/g, '') === cleanAreaNum) {
        duplicateAreaCount++;
        details.push(`duplicate_area: 썸네일 면적("${input.areaBadgeText}")과 장점 줄 완전 중복`);
      }
    }
  }

  // 신축·개발용(value_add)은 토지/대지면적 우선, 수익/사옥용은 연면적 우선 확인
  let postureAreaMismatch = false;
  if (input.areaBadgeText && input.areaBadgeText !== '—') {
    if (
      input.posture === 'value_add' &&
      /연면적/.test(input.areaBadgeText) &&
      !/토지|대지/.test(input.areaBadgeText)
    ) {
      postureAreaMismatch = true;
      details.push(`posture_area_mismatch: 신축·개발용 대표 면적에 토지/대지 대신 "${input.areaBadgeText}" 표기`);
    }
  }

  // 수신자 상세 화면 3단 표준 제원(공통: 대지면적·용도지역 / 건물: 연면적·층수·사용승인일 / 목적별 특화) 존재 확인
  let threeTierSpecMissingCount = 0;
  if (input.expectThreeTierSpecsOnDetail) {
    const hasCommonTier = /대지면적/.test(input.renderedText) && /용도지역/.test(input.renderedText);
    const hasBuildingTier =
      /연면적/.test(input.renderedText) &&
      (/층수|규모/.test(input.renderedText)) &&
      (/사용승인|준공/.test(input.renderedText));
    const hasPurposeTier =
      input.posture === 'owner_occupied'
        ? /실사용|주차|명도/.test(input.renderedText)
        : input.posture === 'value_add'
          ? /평당가|용적률|도로폭/.test(input.renderedText)
          : /보증금|월세|수익률/.test(input.renderedText);

    if (!hasCommonTier) {
      threeTierSpecMissingCount++;
      details.push('missing_tier1_common_specs: 공통 필수 제원(대지면적·용도지역) 미표시');
    }
    if (!hasBuildingTier) {
      threeTierSpecMissingCount++;
      details.push('missing_tier2_building_specs: 건물 내역 제원(연면적·층수·사용승인일) 미표시');
    }
    if (!hasPurposeTier) {
      threeTierSpecMissingCount++;
      details.push(`missing_tier3_purpose_specs: ${input.posture} 투자목적별 특화 제원 미표시`);
    }
  }

  const totalViolations =
    blindLeakCount +
    numericSpinCount +
    threeTierSpecMissingCount +
    duplicateAreaCount +
    (postureAreaMismatch ? 1 : 0);

  return {
    passed: totalViolations === 0,
    blindLeakCount,
    numericSpinCount,
    threeTierSpecMissingCount,
    duplicateAreaCount,
    postureAreaMismatch,
    totalViolations,
    details,
  };
}

// ── 2) Newsletter Content Suitability Oracle ────────────────────────────────

export interface NewsletterSuitabilityAuditInput {
  editionType: 'daily' | 'weekly' | 'monthly';
  renderedHtml: string;
  renderedText: string;
  expectedDealCount: number;
  isSubscriberMode?: boolean;
}

export interface NewsletterSuitabilityAuditResult {
  passed: boolean;
  totalViolations: number;
  details: string[];
}

export function auditNewsletterContentSuitability(
  input: NewsletterSuitabilityAuditInput,
): NewsletterSuitabilityAuditResult {
  const details: string[] = [];

  // 1) '이슈 1', '이슈 2', 'ISSUE 01' 등 번호표 라벨 노출 금지 (중개인 2차 피드백 반영)
  if (/(?:^|\s|>)이슈\s*[1-9](?:\s|<|:|\.)/m.test(input.renderedText)) {
    details.push('numbered_issue_badge: "이슈 1/2" 식 번호표 라벨 노출');
  }

  // 2) 추천 매물이 있을 때 검은 바탕(#0F172A / bg-slate-900) 2×2 딜카드 썸네일 및 /dc/ 링크 존재 확인
  if (input.expectedDealCount > 0) {
    const hasDarkThumbnail =
      /#0F172A|#0f172a|bg-\[#0F172A\]|bg-slate-900|bg-slate-950/.test(input.renderedHtml);
    const hasDcLink = /\/dc\//.test(input.renderedHtml);
    if (!hasDarkThumbnail) {
      details.push('missing_dark_2x2_deal_thumbnail: 추천 매물 다크(#0F172A) 2×2 썸네일 미확인');
    }
    if (!hasDcLink) {
      details.push('missing_dealcard_link: 추천 매물 /dc/[id] 연결 링크 누락');
    }
  }

  // 3) 월간호 통계 출처(한국부동산원 / R-ONE / 국토교통부 / 한국은행 / 오프라인 정직 기준 참고치) 표기 확인
  if (input.editionType === 'monthly') {
    if (!/한국부동산원|R-ONE|국토교통부|한국은행|기준 참고치/.test(input.renderedText)) {
      details.push('missing_monthly_public_source: 월간호 공공 통계 출처 미표기');
    }
  }

  // 4) 기구독자 모드(?sub=1)일 때 불필요한 신규 구독 입력폼 노출 대신 지인 공유 버튼 확인
  if (input.isSubscriberMode) {
    if (!/지인에게\s*부동산뉴스\s*공유하기|공유하기/.test(input.renderedText)) {
      details.push('missing_subscriber_share_cta: 기구독자 화면 지인 공유 버튼 누락');
    }
  }

  // 5) 공격적 투자권유 / 확정수익 금기어 점검
  if (/원금\s*보장|무조건\s*수익|확정\s*수익\s*보장|시세차익\s*100%/.test(input.renderedText)) {
    details.push('illegal_investment_solicitation: 원금/확정수익 보장 금기 문구 포함');
  }

  return {
    passed: details.length === 0,
    totalViolations: details.length,
    details,
  };
}

// ── 3) IM Content Suitability & Multi-Format Parity Oracle ──────────────────

export interface ImSuitabilityAuditInput {
  tier: 'basic' | 'pro';
  posture: 'income_producing' | 'owner_occupier' | 'development';
  pptxSlideXmls: readonly string[];
  slidesHtmlExport?: string;
  expectedPhotoCount: number;
}

export interface ImSuitabilityAuditResult {
  passed: boolean;
  totalViolations: number;
  details: string[];
}

export function auditImContentSuitability(
  input: ImSuitabilityAuditInput,
): ImSuitabilityAuditResult {
  const details: string[] = [];
  const allXml = input.pptxSlideXmls.join('\n');
  const plainSlides = input.pptxSlideXmls.map((xml) =>
    xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  );
  const fullPlain = plainSlides.join('\n');

  const minSlides = input.posture === 'development' ? 6 : 7;
  if (input.pptxSlideXmls.length < minSlides) {
    details.push(`insufficient_slides: 슬라이드 수 부족(${input.pptxSlideXmls.length}면 < ${minSlides}면)`);
  }

  // 1) 표지(1p) 용도 및 매매가 병기 확인
  const coverText = plainSlides[0] || '';
  if (!/\([^)]*(?:억|만|협의)[^)]*\)/.test(coverText) && !/억/.test(coverText)) {
    details.push(`cover_title_formula_mismatch: 표지 매매가/용도 병기 누락 ("${coverText.slice(0, 80)}")`);
  }

  // 2) Basic IM 스태킹 플랜 미노출 확인 (중개인 합의: Basic 6p는 렌트롤 표 단독 집중)
  if (input.tier === 'basic' && /층별\s*스태킹\s*플랜|STACKING\s*PLAN/i.test(fullPlain)) {
    details.push('basic_im_unexpected_stacking_plan: Basic IM에 스태킹 플랜 노출됨');
  }

  // 3) 렌트롤 층 정렬 확인: 지상 고층(예: 4F/3F)이 1F보다 먼저, 1F가 지하층(B1/B2)보다 먼저 등장해야 함
  for (let i = 0; i < input.pptxSlideXmls.length; i++) {
    const xml = input.pptxSlideXmls[i];
    if (!/보증금/.test(xml) || !/임대료|월세/.test(xml)) continue;
    const idxHigh = xml.search(/>(?:[2-9]|1\d)F</);
    const idx1F = xml.indexOf('>1F<');
    const idxB1 = xml.search(/>B[1-9]</);
    if (idxHigh >= 0 && idx1F >= 0 && idxHigh > idx1F) {
      details.push(`rentroll_order_inverted_above_ground: Slide ${i + 1}에서 1F가 지상 상층부보다 먼저 등장`);
    }
    if (idx1F >= 0 && idxB1 >= 0 && idx1F > idxB1) {
      details.push(`rentroll_order_inverted_basement: Slide ${i + 1}에서 지하층(B1~)이 1F보다 먼저 등장`);
    }
  }

  // 4) 단순 합산 총수익률(운영수익률 + 지가상승률 억지 합산) 문구 금지
  if (/운영수익률\s*\+\s*지가|임대수익률\s*\+\s*지가변동률\s*합산/.test(fullPlain)) {
    details.push('invalid_yield_land_naive_sum: 운영수익률과 지가상승률 단순 합산 표현 발견');
  }

  // 5) 토지/공부 슬라이드 출처 및 회피 문구 점검
  if (/추후\s*제공\s*예정|데이터\s*없음|입력된\s*정보가\s*없습니다/.test(fullPlain)) {
    details.push('evasive_placeholder_phrase: 슬라이드 내 회피성 빈칸 문구 발견');
  }

  // 6) 16:9 가로형 PDF 인쇄용 HTML 패리티 점검
  if (input.slidesHtmlExport !== undefined) {
    if (
      !/@page\s*\{\s*size:\s*(?:297mm\s+167\.0625mm|13\.333in\s+7\.5in)/i.test(
        input.slidesHtmlExport,
      )
    ) {
      details.push('pdf_landscape_16x9_missing: PDF 인쇄용 HTML에 16:9 가로 @page 규격 누락');
    }
    const pdfHigh = input.slidesHtmlExport.search(/<td>\s*(?:[2-9]|1\d)F\s*<\/td>/);
    const pdf1F = input.slidesHtmlExport.search(/<td>\s*1F\s*<\/td>/);
    const pdfB1 = input.slidesHtmlExport.search(/<td>\s*B[1-9]F?\s*<\/td>/);
    if (pdfHigh >= 0 && pdf1F >= 0 && pdfHigh > pdf1F) {
      details.push('pdf_rentroll_order_inverted_above_ground: 16:9 PDF HTML 렌트롤에서 1F가 상층부보다 먼저 등장');
    }
    if (pdf1F >= 0 && pdfB1 >= 0 && pdf1F > pdfB1) {
      details.push('pdf_rentroll_order_inverted_basement: 16:9 PDF HTML 렌트롤에서 지하층이 1F보다 먼저 등장');
    }
  }

  void allXml;

  return {
    passed: details.length === 0,
    totalViolations: details.length,
    details,
  };
}
