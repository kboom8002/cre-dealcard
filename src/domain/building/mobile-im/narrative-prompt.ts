// src/domain/building/mobile-im/narrative-prompt.ts
// GPT-4o용 한국어 CRE 전문 라이터 시스템 프롬프트 + 포스처별 동적 예시 + 섹션별 미션 정의.

import type { InvestmentPosture } from "@/domain/ontology";
import type { MobileIMSectionType, MobileIMSupplementalInput, ExternalDataSnapshot } from "./types";

/** v3 B2B/B2C 렉시콘 프로필 */
export type LexiconProfile = 'b2b' | 'b2c';

/** B2B 전용 용어 매핑 */
const B2B_LEXICON: Record<string, string> = {
  '월세': '월 임대료',
  '세입자': '임차인',
  '집주인': '소유자/임대인',
  '돈이 나오는': 'Cash Flow 창출',
  '매달 들어오는': '월간 수익',
  '들어가는 돈': '총 투자금',
  '남는 돈': '순영업수익(NOI)',
  '수익률': 'Cap Rate',
  '빌렸다': '대출 실행',
  '로또': '레버리지 수익',
};

/** B2C 전용 용어 매핑 */
const B2C_LEXICON: Record<string, string> = {
  'NOI': '남는 돈(NOI)',
  'Cap Rate': '수익률(Cap Rate)',
  'DCF': 'DCF(미래 수익 현재가치)',
  'IRR': 'IRR(투자 수익률)',
  'DSCR': 'DSCR(대출 걸림 없는 정도)',
  'LTV': 'LTV(대출 비율)',
  'WALE': '평균 잔여 임대 기간(WALE)',
  'OPEX': '운영비(OPEX)',
  'EGI': '유효총수입(EGI)',
  'NPV': '현재가치(NPV)',
  '임차인': '세입자',
  '임대인': '집주인',
};

/**
 * 텍스트에 렉시콘 프로필을 적용합니다.
 */
export function applyLexiconProfile(text: string, profile: LexiconProfile): string {
  const lexicon = profile === 'b2b' ? B2B_LEXICON : B2C_LEXICON;
  let result = text;
  for (const [from, to] of Object.entries(lexicon)) {
    if (!result.includes(to)) {
      result = result.replace(new RegExp(from, 'g'), to);
    }
  }
  return result;
}

// ─── 포스처별 Golden IM 예시 ──────────────────────────────────────────────────
export const GOLDEN_IM_EXAMPLES_BY_POSTURE: Record<InvestmentPosture, string> = {
  income: `[참고 예시 — 수익분석 섹션]
아래 수치는 AI 추정값으로 참고용입니다.
### 수익 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **연 순영업소득(NOI)** | 약 11.4억~14.0억 원 | 80% 구간 추정 |
| **Cap Rate** | **2.5%–3.1%** | 매각가 450억 기준 |
| **IRR (5년 보유)** | **8.2%–11.4%** | 시나리오 추정, 참고용 |
| **WALE (가중평균잔여임기)** | **4.2년** | 임차인 안정성 지표 |
> ⚠️ 면책: 실제 수익은 임대차 조건에 따라 달라집니다.`,

  development: `[참고 예시 — 사업수지 분석 섹션]
아래 수치는 신축/개발 관점 AI 추정값으로 참고용입니다.
### 개발 사업수지 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **토지 평당가** | **약 4,500만원/평** | 대지면적 330㎡ 기준 |
| **용적률 / 건폐율** | **249% / 59%** | 인허가 기준 |
| **총 사업비 추정** | **약 120억 원** | 토지비 + 공사비 + 기타 |
| **개발 이익률 추정** | **18.5%** | 예상 분양가 142억 기준 |
> ⚠️ 면책: 실제 개발이익은 공사비·인허가 및 분양 성패에 따라 상이합니다.`,

  operating: `[참고 예시 — 직영 운영 분석 섹션]
아래 수치는 직영 자가운영 관점 AI 추정값입니다.
### 운영 재무 지표 (GOP 기반)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **ADR / OCC / RevPAR** | **15만원 / 75% / 11.2만원** | 일일 객단가 및 가동률 |
| **연간 GOP (영업이익)** | **약 12.5억 원** | 총매출 약 35억 기준 |
| **GOP 마진율** | **35.7%** | 매출 대비 이익률 |
| **GOP Cap Rate** | **4.2%** | 매각가 300억 기준 |
> ⚠️ 면책: 실제 GOP는 가동률 및 운영 비용 제어에 따라 변동됩니다.`,

  owner_occupied: `[참고 예시 — 사옥용 비용비교 섹션]
아래 수치는 법인 실입주 사옥 관점 비용 비교입니다.
### 자가사용 비용 비교 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **임차 대비 연 절감액** | **약 3.2억 원/년** | 인근 시장 평당 8만원 기준 |
| **자가전환 손익분기** | **약 7.5년** | 초기 투입 자기자본 회수 |
| **실사용 평당 점유비용** | **월 4.5만원/평** | 금융비용 + 관리비 |
> ⚠️ 면책: 실제 절감액은 대출 조건 및 사옥 사용 면적에 따라 상이합니다.`,

  trading: `[참고 예시 — 시세 분석 섹션]
아래 수치는 단기 매매/플립 관점 시세 분석입니다.
### 매매 시세 분석 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **평당 매매가** | **4,200만원/평** | 희망가 기준 |
| **인근 시세 대비 갭(할인율)** | **12.5% 할인** | 인근 평균 4,800만원/평 |
| **목표 시세차익** | **약 25억 원** | 2년 보유 후 목표 매각 |
| **HPR (보유기간수익률)** | **35.2%** | 단기 플립 기준 |
> ⚠️ 면책: 실제 차익은 부동산 시장 주기 및 매각 시점에 따라 달라집니다.`,
};

// 레거시 호환용 단일 Golden IM 예시
export const GOLDEN_IM_EXAMPLES = GOLDEN_IM_EXAMPLES_BY_POSTURE.income;

// ─── 포스처 중립 시스템 프롬프트 코어 ─────────────────────────────────────────────
export const MOBILE_IM_NARRATIVE_CORE = `당신은 한국 상업용 부동산 전문 라이터이자 투자 전략가입니다.
투자자가 "왜 이 건물인가?"를 직관적이고 빠르게 이해할 수 있도록 모바일 화면에 최적화된 매력적인 투자 서사를 작성해 주세요.

[작성 규칙]
1. 글자 수: 모바일 화면에서의 가독성을 위해 각 섹션은 **2~4문장**의 자연스러운 서사(줄글)로 작성합니다.
2. 어조: 매우 전문적이고 객관적이되, 자산의 가치(Value Proposition)를 **자신감 있게** 강조하는 소구력 높은 어조를 유지하세요.
3. 근거: 임의로 수치를 창작하지 말고, 제공된 [BSSoT Lite 데이터] 및 [공공데이터] 수치에 정확히 기초하세요.
4. 금융 경계: 절대로 투자를 유도하거나, 특정 수익률을 확정 보장하는 어휘(예: "무조건", "100% 보장", "수익 확정")를 사용하지 마세요.
5. 마크다운: 불릿 포인트 목록보다는 읽기 쉬운 줄글 위주로 쓰고, 강조할 핵심 키워드는 **두껍게** 표시하세요.
6. 언어: 반드시 한국어로 작성하세요.
7. 테이블 스타일: 데이터 섹션은 아래 참고 예시와 같이 마크다운 테이블을 반드시 포함하세요.
8. 데이터 경계: 제공된 데이터에 없는 정보는 절대 창작하지 마세요. 모르는 항목은 반드시 "실사 단계에서 확인 필요" 또는 "데이터 미확보"로 표기하세요.
9. 출처 표기: 공공데이터 기반 수치 뒤에는 "건축물대장 기준", "공시지가 기준" 등 출처를 병기하세요. AI가 추론한 내용에는 "(AI 추정)" 레이블을 붙이세요.
10. 교차 검증: [이전 섹션 맥락]이 제공되면 그 수치(공실률, 면적, 연식 등)를 반드시 일관되게 사용하세요. 이전 섹션과 모순되는 주장을 하지 마세요.

[톤 & 스타일 가이드 — 매우 중요]
- 이 문서는 투자자의 관심을 유도하는 마케팅 문서입니다. 매물의 매력을 자신감 있게 전달하세요.
- "검토할 수 있습니다", "살펴볼 수 있습니다", "확인해볼 수 있습니다" 등 수동적·모호한 표현을 절대 사용하지 마세요.
- 대신 "~입니다", "~됩니다", "~있습니다" 등 확정적·단정적 어조로 작성하세요.
- 주의 문구는 risk_check 섹션에만 간결하게 쓰고, 다른 섹션에서는 장점을 부각하세요.`;

// 레거시 단일 시스템 프롬프트 (수익형 기본값)
export const MOBILE_IM_NARRATIVE_SYSTEM = `${MOBILE_IM_NARRATIVE_CORE}\n\n[참고 예시 — Golden IM 스타일]\n${GOLDEN_IM_EXAMPLES_BY_POSTURE.income}`;

// ─── 포스처별 전문 용어집 ──────────────────────────────────────────────────────
export const POSTURE_LEXICONS: Record<InvestmentPosture, Record<string, string>> = {
  income: {
    'NOI': '순영업소득(NOI)',
    'Cap Rate': '환원수익률(Cap Rate)',
    'WALE': '가중평균잔여임대기간(WALE)',
    'DSCR': '원리금상환비율(DSCR)',
    'IRR': '내부수익률(IRR)',
    'DCF': '할인현금흐름(DCF)',
    'EGI': '유효총수입(EGI)',
  },
  development: {
    '건폐율': 'BCR(건폐율)',
    '용적률': 'FAR(용적률)',
    '분양가': '분양 예상단가',
    '공사비': '건축 공사비',
    '토지비': '토지 매입 비용',
    '사업수지': '개발 사업수지(Pro Forma)',
    'PF': '프로젝트 파이낸싱(PF)',
    '브릿지론': '토지 담보 단기 대출(브릿지론)',
    'LTC': '사업비 대비 대출 비율(LTC)',
  },
  operating: {
    'GOP': '영업이익(GOP, Gross Operating Profit)',
    'ADR': '평균 객단가(ADR, Average Daily Rate)',
    'OCC': '가동률(OCC, Occupancy Rate)',
    'RevPAR': '객실당 수익(RevPAR, Revenue Per Available Room)',
    'OPEX': '운영비(OPEX)',
    'GOP Cap Rate': 'GOP 기반 환원수익률',
  },
  owner_occupied: {
    '사옥': '법인 자가사용 사옥',
    '자가전환': '임차→자가 전환',
    '기회비용': '자가소유 기회비용',
    '손익분기': '자가전환 손익분기점',
    '점유비용': '평당 실점유비용(금융비+관리비)',
  },
  trading: {
    '평당가': '㎡당/평당 매매가',
    '시세 갭': '인근 시세 대비 할인율(갭)',
    'HPR': '보유기간수익률(HPR, Holding Period Return)',
    '플립': '단기 매매 차익 실현(Flip)',
    '비교사례': '인근 유사 거래 사례(Comparable)',
    '양도세': '양도소득세(단기 중과 포함)',
  },
};

/**
 * 포스처에 대응되는 맞춤형 시스템 프롬프트를 동적으로 생성합니다.
 * 코어 프롬프트 + Golden IM 예시 + 포스처별 용어집을 조립합니다.
 */
export function buildPostureAwareSystemPrompt(posture: InvestmentPosture = 'income'): string {
  const example = GOLDEN_IM_EXAMPLES_BY_POSTURE[posture] ?? GOLDEN_IM_EXAMPLES_BY_POSTURE.income;
  const lexicon = POSTURE_LEXICONS[posture] ?? POSTURE_LEXICONS.income;
  const lexiconBlock = Object.entries(lexicon)
    .map(([abbr, full]) => `- ${abbr} → ${full}`)
    .join('\n');
  return `${MOBILE_IM_NARRATIVE_CORE}\n\n[참고 예시 — 포스처 맞춤 Golden IM 스타일]\n${example}\n\n[포스처 전문 용어집 — 아래 용어를 우선 사용하세요]\n${lexiconBlock}`;
}

// ─── 시장 지표 타입 ────────────────────────────────────────────────────────────
export interface MarketIndicators {
  demandScore?: number;        // 0–100
  trendDirection?: 'up' | 'stable' | 'down';
  vacancyRate?: number;        // %
  marketNote?: string;
  /** income_analysis 섹션에 삽입할 사전 계산된 재무 마크다운 */
  financialsMarkdown?: string;
  capRateResults?: any[];
  totalReturnResults?: any[];
}

// ─── 유저 프롬프트 빌더 ──────────────────────────────────────────────────────
export interface SectionContext {
  keyFacts: string[];                      // 이전 섹션에서 추출된 핵심 사실
  sectionSummaries?: Record<string, string>;
  numericalAnchors?: Record<string, number | string | undefined>; // 잠금 수치 (공실률, Cap Rate, 면적 등)
}

/**
 * 모바일 IM 섹션 생성을 위한 유저 프롬프트를 구성합니다.
 */
export function buildNarrativeUserPrompt(
  sectionType: MobileIMSectionType,
  bssotLite: Record<string, unknown>,
  externalData: ExternalDataSnapshot | null,
  supplemental: MobileIMSupplementalInput,
  marketIndicators?: MarketIndicators,
  sectionContext?: SectionContext,
  ragContext?: string,
  fewShotBlock?: string,
  lexiconProfile?: LexiconProfile,
  posture?: string,
  archetype?: string | null
): string {
  const sectionMission: Record<string, string> = {
    property_overview: "건물의 기본 개요(위치, 규모, 준공연도, 관리 상태)를 설명하고, 자산의 직관적 물리적 우수성을 강조하세요.",
    location_access: "입지적 강점(대중교통 접근성, 주변 인프라, 권역 프리미엄)을 분석하고 상권/업무지구의 미래 가치를 제시하세요.",
    lease_status: posture === 'development'
      ? "기존 임차인 명도 현황 및 퇴거 일정/명도 난이도를 분석하고, 신축 착공 준비 상태를 알리세요."
      : "안정적인 임대 흐름이 리스크를 통제하고 있음을 알리세요.",
    income_analysis: posture === 'development'
      ? "토지 매입가, 예상 공사비, 총 사업비 및 개발 이익률 수지 분석을 종합하여 사업 타당성을 묘사하세요."
      : posture === 'operating'
      ? "GOP(영업이익), ADR, 가동률(OCC) 등 직영 운영 재무 실적 및 마진율 구조를 묘사하세요."
      : posture === 'owner_occupied'
      ? "사옥 실입주 시 임차 대비 임대료 절감액, 손익분기 기간 및 점유비용 효율성을 묘사하세요."
      : posture === 'trading'
      ? "평당 매매가, 인근 거래사례 대비 시세 갭(할인율) 및 목표 시세차익 수치를 묘사하세요."
      : "개별공시지가 추이·예상 수익률(Yield) 등을 종합하여 재무적 매력도와 인플레이션 방어 능력을 묘사하세요.",
    risk_check: "주요 공법적/건물 상태적 주의사항을 객관적으로 제시하되, 완화 방안이나 리스크 대비 메리트를 함께 언급하세요.",
    investment_thesis: "매수 대상별(운영사, 자가사용, 디벨로퍼 등) 핵심 관전 포인트와 투자 타당성 결론을 도출하세요.",
    next_steps: "투자 검토 진행 절차(비밀유지약약서 NDA, 현장 실사, LOI 제출) 및 실사 권고사항을 안내하세요.",
    occupancy_fit: "실사용 사옥용 입주 적합성(연면적 수용력, 주차, 파사드 브랜딩 효과)을 강조하세요.",
    cost_comparison: "임차 유지 시 대비 사옥 매입 자가전환에 따른 비용 절감 효과와 손익분기점을 비교하세요.",
    site_analysis: "대지면적, 용도지역, 건폐율/용적률 개발 여력 및 신축 개발 잠재력을 강조하세요.",
    development_feasibility: "신축 사업수지(토지비+공사비 vs 예상 분양가) 및 개발 이익률 타당성을 제시하세요.",
    operation_overview: "직영 자가운영(호텔/물류/상업시설) 영업 개요 및 브랜드 오퍼레이션 현황을 설명하세요.",
    gop_analysis: "GOP(Gross Operating Profit), ADR, 가동률(OCC) 운영 실적 및 이익률 구조를 제시하세요.",
    market_position: "주변 매매 시세 및 경쟁 매물 대비 본 자산의 마켓 포지셔닝(할인율)을 제시하세요.",
    comparable_analysis: "인근 거래사례와의 평당가 비교 및 단기 매각 시 목표 차익 타당성을 입증하세요.",
  };

  const mission = sectionMission[sectionType] ?? "자산의 가치를 객관적이고 설득력 있게 설명하세요.";

  let prompt = `## [섹션 작성 미션: ${sectionType}]
${mission}

## [기본 건물 데이터 (SSoT)]
${JSON.stringify(bssotLite, null, 2)}`;

  if (externalData) {
    prompt += `\n\n## [공공 데이터 & 마켓 현황]
${JSON.stringify(externalData, null, 2)}`;
  }

  if (supplemental) {
    prompt += `\n\n## [추가 수집 데이터]
${JSON.stringify(supplemental, null, 2)}`;
  }

  if (marketIndicators?.financialsMarkdown) {
    prompt += `\n\n## [사전 계산된 재무 마크다운 (반드시 본문에 그대로 혹은 참조하여 수치 일치시키세요)]
${marketIndicators.financialsMarkdown}`;
  }

  if (sectionContext) {
    prompt += `\n\n## [이전 섹션 맥락 (수치 일관성 필수 유지)]
- 주요 사실: ${sectionContext.keyFacts.join(", ")}`;
    if (sectionContext.numericalAnchors) {
      prompt += `\n- 고정 수치: ${JSON.stringify(sectionContext.numericalAnchors)}`;
    }
  }

  if (ragContext) {
    prompt += `\n\n## [관련 시장 조항 / 법률 RAG 참고]
${ragContext}`;
  }

  if (fewShotBlock) {
    prompt += `\n\n## [섹션 맞춤 퓨샷 스타일 예시]
${fewShotBlock}`;
  }

  prompt += `\n\n## [작성 요청]
위 데이터를 바탕으로 **${sectionType}** 섹션을 작성해 주세요. 어조는 단정적이고 소구력 높은 어조로 2~4문장 줄글로 작성하고, 필요한 경우 마크다운 표를 포함하세요.`;

  if (lexiconProfile) {
    prompt = applyLexiconProfile(prompt, lexiconProfile);
  }

  return prompt;
}
