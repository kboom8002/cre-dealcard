// src/domain/building/mobile-im/narrative-prompt.ts
// GPT-4o용 한국어 CRE 전문 라이터 시스템 프롬프트 + 포스처별 동적 예시 + 섹션별 미션 정의.

import type { InvestmentPosture } from "@/domain/ontology";
import type { MobileIMSectionType, MobileIMSupplementalInput, ExternalDataSnapshot } from "./types";
import { stripRenderOnlyExternal } from "./prompt-external-slice";

/** v3 B2B/B2C 렉시콘 프로필 */
export type LexiconProfile = 'b2b' | 'b2c';

/** 한국 CRE 기관 및 전문 투자자 표준 용어 매핑 (Rule 1 & Rule 2) */
const INSTITUTIONAL_CRE_LEXICON: Record<string, string> = {
  '월세': '월 임대료',
  '세입자': '임차인',
  '집주인': '소유자/임대인',
  '건물주': '소유자/임대인',
  '돈이 나오는': 'Cash Flow 창출',
  '매달 들어오는': '월간 수익',
  '들어가는 돈': '총 투자금',
  '남는 돈': '순영업소득(NOI)',
  '수익률': '연 순수익률(Cap Rate)',
  '빌렸다': '대출 실행',
  '로또': '레버리지 수익',
  '내 돈': '자기자본(Equity)',
  '원금 안전판': '토지 평가액 기반 하방 안정성',
  '땅값 비중': '토지 평가액 비중',
};

const B2B_LEXICON = INSTITUTIONAL_CRE_LEXICON;

/**
 * 텍스트에 렉시콘 프로필을 적용합니다. (Rule 1 & Rule 2: 상시 기관 투자자 표준 어휘 적용)
 */
export function applyLexiconProfile(text: string, _profile?: LexiconProfile): string {
  let result = text;
  for (const [from, to] of Object.entries(INSTITUTIONAL_CRE_LEXICON)) {
    if (!result.includes(to)) {
      result = result.replace(new RegExp(from, 'g'), to);
    }
  }
  return result;
}


// ─── 포스처별 Golden IM 예시 (기관 투자자 및 전문 자산관리자 표준) ────────────────────
export const GOLDEN_IM_EXAMPLES_BY_POSTURE: Record<InvestmentPosture, string> = {
  income: `[참고 예시 — 수익분석 섹션]
본 자산은 매도 희망가 450억 원 기준 연 순수익률(Cap Rate) 2.5%~3.1%를 기대할 수 있는 안정적 임대수익형 자산입니다. 임대보증금 및 담보대출을 감안한 실투자금은 약 180억 원이며, 대출 구조 최적화 시 자기자본수익률(Leveraged Yield)은 6.3%~7.8% 수준으로 산출됩니다. 가중평균 잔여 임대기간(WALE)은 4.2년으로 임대차 안정성이 양호하며, 토지 평가액 비중이 68.5% 수준으로 자산 하방 안정성을 뒷받침합니다.
> ⚠️ 면책: 실제 수익률은 임대차 계약 조건 및 세제에 따라 달라질 수 있습니다.`,

  development: `[참고 예시 — 사업수지 분석 섹션]
본 자산은 토지 3.3㎡당 약 4,500만 원 수준의 매도 희망가로 제안되었으며, 249%의 용적률을 활용할 수 있는 신축 개발 여력을 보유하고 있습니다. 총 사업비는 약 120억 원으로 추정되며, 개발 사업수지 기준 예상 개발 이익률은 18.5% 수준으로 검토됩니다. 초기 토지 담보 대출(브릿지론)을 제외한 소요 자기자본은 약 36억 원으로, 개발 사업수지 개선을 도모할 수 있는 구조입니다.
> ⚠️ 면책: 실제 개발 사업수지는 인허가, 시공 공사비 및 분양 성패에 따라 상이할 수 있습니다.`,

  operating: `[참고 예시 — 직영 운영 분석 섹션]
본 자산은 일일 평균 객단가(ADR) 15만 원, 가동률(OCC) 75% 수준의 현금흐름을 시현 중인 운영형 자산입니다. 연간 총매출 대비 35.7%의 영업 마진을 나타내며, 실질 영업이익(GOP)은 연간 약 12.5억 원 수준으로 추정됩니다. 매도 희망가 300억 원 기준 GOP 환원율은 4.2% 수준이며, 선순위 대출 제외 시 약 120억 원의 자기자본으로 운영 현금흐름 승계가 가능합니다.
> ⚠️ 면책: 실제 GOP는 가동률 및 운영 비용 통제 수준에 따라 변동될 수 있습니다.`,

  owner_occupied: `[참고 예시 — 사옥용 비용비교 섹션]
법인 본사 사옥으로 직접 입주 시, 주변 임대 시세 대비 연간 약 3.2억 원의 임차 비용 절감 효과를 기대할 수 있습니다. 임대료 절감분을 통한 자가전환 손익분기 도달 기간은 약 7.5년으로 추정되며, 3.3㎡당 실점유비용도 월 4.5만 원 수준으로 경제적 타당성을 갖추고 있습니다. 약 45억 원의 소요 자기자본으로 사옥 공간을 안정적으로 확보하고 향후 자산가치 제고를 도모할 수 있습니다.
> ⚠️ 면책: 실제 절감액은 대출 조건 및 사옥 전용 면적에 따라 상이할 수 있습니다.`,

  trading: `[참고 예시 — 시세 분석 섹션]
본 자산은 인근 유사 거래사례 평균 대비 12.5% 낮은 3.3㎡당 4,200만 원 수준의 매도 희망가로 제안되었습니다. 2~3년 보유 후 시장 정상화 시 목표 매각 차익은 약 25억 원 수준으로 검토되며, 약 30억 원의 초기 자기자본 투입 기준 보유기간수익률(HPR) 35.2% 수준의 자본수익 실현을 목표로 합니다.
> ⚠️ 면책: 실제 자본이득은 부동산 시장 경기 주기 및 매각 시점의 조건에 따라 달라질 수 있습니다.`,
};

// 레거시 호환용 단일 Golden IM 예시
export const GOLDEN_IM_EXAMPLES = GOLDEN_IM_EXAMPLES_BY_POSTURE.income;

// ─── 포스처 중립 시스템 프롬프트 코어 ─────────────────────────────────────────────
export const MOBILE_IM_NARRATIVE_CORE = `당신은 대한민국 상업용 부동산 전문 투자 전략가이자 IM 전문 라이터입니다.
매수 희망자(투자자/법인)가 "왜 이 건물인가?"와 "실투자금 및 현금흐름 구조가 어떠한가?"를 직관적이고 빠르게 이해할 수 있도록 품격 있고 신뢰도 높은 투자 서사를 작성해 주세요.

[🚨 표(Table) 생성 절대 금지]
어떠한 경우에도 마크다운 표(|...|) 형태로 수치를 나열하지 마세요.
정확한 수치 데이터 표는 시스템이 하단에 자동으로 첨부합니다.
당신의 임무는 제공된 [사전 계산된 데이터]를 바탕으로 투자자가 직관적으로 이해할 수 있는 분석적인 줄글(서사) 2~4문장만 작성하는 것입니다.


  [D56 대한민국 상업용 부동산 용어사전 5대 원칙 및 금지규칙]
  - 권장어 사용: 영문 약어(OM, IM, NOI 등)나 내부 은어(리스업, 밸류애드 등) 대신 한국어 권장표기(매각안내서, 투자검토서, 연 순수입, 공실 임대, 가치 상승 여력 등)를 사용하세요.
  - 절대표현 금지: 'Zero', '제로', '완벽', '무결점', '영구적', '불패', '100%', '전혀 없음' 등은 사용하지 마세요. (예: 유지보수 비용 Zero -> 2018년 준공 · 주요 수선 이력 미확인)
  - 과장표현 금지: '우량', '최고', '독보적', '유일', '극대화', '초안정', '희소성' 등 객관적 근거 없는 단정은 금지합니다. (예: 우량 임차인 -> 병원·약국 등 생활밀착 업종)
  - 광고성 표현 금지: '적극 추천', '놓치면 후회', '강력 추천', '서두르' 등 브로셔 식 문구는 피하세요.
  - 단정형 금지: '리스크 없음', '안전 보장', '확실한 수익', '확정적' 등의 단어는 쓰지 마세요. (예: 퇴거 리스크 완벽 헤징 -> 6개 호실 분산 임차)
  - 데이터 위조 금지: 미제공·미확인 값을 0 또는 '없음'으로 바꾸지 마세요.

  [작성 규칙]
1. 글자 수: 모바일 화면에서의 가독성을 위해 각 섹션은 **2~4문장**의 자연스러운 서사(줄글)로 작성합니다.
2. 어조: 매우 전문적이고 객관적이되, 자산의 가치(Value Proposition)를 **자신감 있게** 강조하는 소구력 높은 어조를 유지하세요.
3. 근거: 임의로 수치를 창작하지 말고, 제공된 [BSSoT Lite 데이터] 및 [공공데이터] 수치에 정확히 기초하세요.
4. 금융 경계: 절대로 투자를 유도하거나, 특정 수익률을 확정 보장하는 어휘(예: "무조건", "100% 보장", "수익 확정")를 사용하지 마세요.
5. 마크다운: 불릿 포인트 목록보다는 읽기 쉬운 줄글 위주로 쓰고, 강조할 핵심 키워드는 **두껍게** 표시하세요.
6. 언어: 반드시 한국어로 작성하세요.
7. 표 생성 금지: 마크다운 표를 직접 생성하지 마세요. 데이터는 반드시 문장 안에 자연스럽게 녹여내세요.
8. 데이터 경계: 제공된 데이터에 없는 정보는 절대 창작하지 마세요. 모르는 항목은 반드시 "실사 단계에서 확인 필요" 또는 "데이터 미확보"로 표기하세요.
9. 출처 표기: 공공데이터 기반 수치 뒤에는 "건축물대장 기준", "공시지가 기준" 등 출처를 병기하세요. AI가 추론한 내용에는 "(AI 추정)" 레이블을 붙이세요.
10. 교차 검증: [이전 섹션 맥락]이 제공되면 그 수치(공실률, 면적, 연식 등)를 반드시 일관되게 사용하세요. 이전 섹션과 모순되는 주장을 하지 마세요.
11. 전문 용어 표기: 전문 약어(NOI, DSCR, IRR, Cap Rate 등)는 반드시 쉬운 한글 설명을 먼저 쓰고 괄호 안에 영문 약어를 넣으세요.
    예: "연 순수입(순영업소득 NOI) 약 12억 원", "자기자본수익률(Equity Yield) 4.2%", "토지 평가액 비중 68%"
12. 결론 우선 구조: 모든 섹션의 첫 문장은 **결론(So What?)**으로 시작하세요.
    "이 건물은 ~입니다" 형태로 핵심 메시지를 앞에 배치하고, 근거 데이터는 뒤에 서술하세요.
13. 금액 표기: 억 단위 이상은 "약 75억 원" 형태로, 만원 단위는 "월 1,200만 원" 형태로 표기하세요. 불필요한 소수점은 생략하세요 (예: 4.23% → 4.2%).

[🚨 핵심 작성 원칙 — 페르소나 직접 지칭 금지 및 한국 실무 어휘]
- '60대 자산가를 위한', '법인 대표 맞춤', '초보 투자자용' 등 특정 연령/성별/계층을 직접 지칭하는 문구를 제목이나 본문에 절대 쓰지 마세요. (언제나 자산 자체의 객관적 투자 가치와 경제적 실익 중심으로 서술)
- 외래어 직역 투를 지양하고 한국 실무 어휘를 사용하세요 (예: '네이밍 라이츠' ❌ → '사옥 단독 명칭 표기(간판 설치권)' 또는 '기업 단독 브랜딩' ✅).

[톤 & 스타일 가이드 — 매우 중요]
- 이 문서는 투자자의 관심을 유도하는 마케팅 문서입니다. 매물의 매력을 자신감 있게 전달하세요.
- "검토할 수 있습니다", "살펴볼 수 있습니다", "확인해볼 수 있습니다" 등 수동적·모호한 표현을 절대 사용하지 마세요.
- 대신 "~입니다", "~됩니다", "~있습니다" 등 객관적이고 신뢰도 높은 서술형 어조로 작성하세요.
- 주의 문구는 risk_check 섹션에만 간결하게 쓰고, 다른 섹션에서는 장점을 부각하세요.`;

// 레거시 단일 시스템 프롬프트 (수익형 기본값)
export const MOBILE_IM_NARRATIVE_SYSTEM = `${MOBILE_IM_NARRATIVE_CORE}\n\n[참고 예시 — Golden IM 스타일]\n${GOLDEN_IM_EXAMPLES_BY_POSTURE.income}`;

// ─── 포스처별 전문 용어집 ──────────────────────────────────────────────────────
export const POSTURE_LEXICONS: Record<InvestmentPosture, Record<string, string>> = {
  income: {
    'NOI': '연 순수입(순영업소득 NOI)',
    'Cap Rate': '연 순수익률(Cap Rate, 기준: NOI)',
    'WALE': '가중평균 잔여 임대기간(WALE)',
    'DSCR': '원리금 상환 여력(DSCR)',
    'IRR': '투자 수익률(IRR)',
    'DCF': '10년 미래 현금흐름 현재가치(DCF)',
    'EGI': '유효 총수입(EGI)',
    '실투자금': '실투자금(자기자본)',
    'Leveraged Yield': '자기자본수익률(Leveraged Yield)',
  },
  development: {
    '건폐율': '건폐율(BCR)',
    '용적률': '용적률(FAR)',
    '분양가': '분양 예상단가',
    '공사비': '건축 공사비',
    '토지비': '토지 매입 비용',
    '사업수지': '개발 사업수지(Pro Forma)',
    'PF': '프로젝트 파이낸싱(PF)',
    '브릿지론': '토지 담보 대출(브릿지론)',
    'LTC': '사업비 대비 대출 비율(LTC)',
  },
  operating: {
    'GOP': '실질 영업이익(GOP)',
    'ADR': '평균 객단가(ADR)',
    'OCC': '가동률(OCC)',
    'RevPAR': '객실당 수익(RevPAR)',
    'OPEX': '운영비(OPEX)',
    'GOP Cap Rate': 'GOP 기반 환원수익률',
  },
  owner_occupied: {
    '사옥': '법인 본사 사옥',
    '자가전환': '임차→자가 전환',
    '기회비용': '자가소유 기회비용',
    '손익분기': '자가전환 손익분기점',
    '점유비용': '평당 실점유비용(금융비+관리비)',
  },
  trading: {
    '평당가': '3.3㎡당 매매가',
    '시세 갭': '인근 시세 대비 가격 경쟁력(할인율)',
    'HPR': '보유기간수익률(HPR)',
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
  numericalAnchors?: import('./numerical-anchors').NumericalAnchors | Record<string, number | string | undefined>; // 잠금 수치 (공실률, Cap Rate, 면적 등)
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
    property_overview: "이 건물이 '어떤 자산'인지 한눈에 파악할 수 있도록 핵심 물리적 스펙(위치, 규모, 준공, 용도)을 요약하세요. 첫 문장에 '핵심 한줄 정의'를 넣으세요. (예: '강남대로 이면 도보 3분, 2017년 준공 올근생 메디컬빌딩'). 마지막 줄에는 반드시 '> **자산 하이라이트**: • 핵심강점1 • 핵심강점2 • 핵심강점3' 형식의 블록인용으로 자산의 3대 매력을 명확히 서술하세요.",
    location_access: "이 입지가 왜 투자 가치가 있는지(대중교통 접근성, 주변 인프라, 권역 프리미엄)를 설명하고, 첫 문장에 입지의 핵심 우위(예: '더블역세권 도보 4분, 유동인구 풍부한 핵심 상권')를 선언하세요.",
    lease_status: posture === 'development'
      ? "기존 임차인 명도 현황 및 퇴거 일정/명도 난이도를 분석하고, 신축 착공 준비 상태를 명확히 서술하세요."
      : "임대차 안정성과 공실 리스크 통제 상태를 설명하세요. 첫 문장에 '만실 운영 중 / 공실률 ○%' 등 현재 임대 안정성을 즉시 제시하세요.",
    income_analysis: posture === 'development'
      ? "토지 매입가, 예상 공사비, 총 사업비 및 개발 이익률 수지 분석을 종합하여 사업 타당성을 묘사하세요. 첫 문장에 '예상 총 사업비 ○억, 개발 이익률 ○%'를 명시하세요."
      : posture === 'operating'
      ? "실질 영업이익(GOP), 객단가(ADR), 가동률(OCC) 등 직영 운영 재무 실적을 묘사하세요. 첫 문장에 '연간 GOP ○억 원, GOP 마진율 ○%'를 명시하세요."
      : posture === 'owner_occupied'
      ? "사옥 실입주 시 임차 대비 임대료 절감액, 손익분기 기간 및 점유비용 효율성을 묘사하세요. 첫 문장에 '임차 대비 연 ○억 원 절감, 손익분기 ○년'을 명시하세요."
      : posture === 'trading'
      ? "3.3㎡당 매매가, 인근 거래사례 대비 가격 경쟁력 및 목표 시세차익 수치를 묘사하세요. 첫 문장에 '인근 시세 대비 가격 경쟁력, 목표 차익 ○억 원'을 명시하세요."
      : "실투자금(자기자본), 월 순수입, 연 순수익률(Cap Rate, 기준: NOI), 토지 평가액 비중을 종합하여 현금흐름과 하방 안정성을 객관적으로 서술하세요.",
    risk_check: "주요 리스크 항목과 이에 대한 '구체적 대응 방안(완화책)'을 함께 제시하세요. 리스크만 나열하지 말고 '어떻게 해결 가능한지'를 함께 서술하여 불안감을 해소하세요.",
    investment_thesis: "이 건물의 '3대 핵심 투자 포인트'를 반드시 아래 형식으로 정확히 작성하세요:\n- **포인트 제목**: 구체적 수치와 근거를 포함한 상세설명\n- **포인트 제목**: 구체적 수치와 근거를 포함한 상세설명\n- **포인트 제목**: 구체적 수치와 근거를 포함한 상세설명\n각 포인트에는 반드시 검증 가능한 수치(㎡, 억 원, %, 도보 분 등)를 1개 이상 포함하세요. 확인된 사실·수치를 근거로 객관적으로 서술하고, 수익·원금·현금흐름의 안정성을 보장하거나 매수를 권유하는 표현('지금 사야', '원금 보전', '하방 안정성 확보', '안정적 현금흐름 확보', '손실 가능성 낮음' 등)은 쓰지 마세요. 마지막 줄에 '> **종합 가치 제안**: ...' 형식으로 위 근거를 한 문장으로 요약하되, 위 포인트 문장을 그대로 반복하지 마세요.",
    next_steps: "투자 검토 진행 절차(비밀유지약약서 NDA, 현장 실사, LOI 제출) 및 1:1 비밀 상담 안내를 제공하세요. 절대 매물 개요나 투자 장점을 요약하지 마세요. 오직 투자 진행 단계(NDA, 실사, LOI)와 문의 안내만 출력하세요.",
    occupancy_fit: "법인 본사 사옥 실입주 적합성(연면적 수용 인원, 전용 주차, 파사드 브랜딩 효과)을 강조하세요.",
    cost_comparison: "10년 임차 유지 대비 사옥 매입 자가전환에 따른 비용 절감 효과와 손익분기점을 비교하세요.",
    land_detail: "토지 현황만 서술하세요: 용도지역·용도지구, 현황 건폐율·용적률(건축물대장 기준), 대지면적, 필지 형상(정형/부정형), 도로 접면(전면/측면/이면 접도), 지목, 개별공시지가. 법정 건폐율·용적률 상한은 입력 데이터에 공식 조회값이 제공된 경우에만 언급하고, 없으면 추정하거나 언급하지 마세요(용도지역명으로 상한을 유추 금지). 임대차·렌트롤·임차인·보증금·월세·공실·실사·점검 등 임대 관련 내용은 절대 포함하지 마세요. 토지이용계획과 물리적 필지 특성에만 집중하세요.",
    site_analysis: "대지면적, 용도지역, 건폐율/용적률 개발 여력 및 신축 개발 잠재력을 강조하세요.",
    development_feasibility: "신축 사업수지(토지비+공사비 vs 예상 분양가) 및 개발 이익률 타당성을 제시하세요.",
    operation_overview: "직영 자가운영 영업 개요 및 브랜드 오퍼레이션 현황을 설명하세요.",
    gop_analysis: "GOP(Gross Operating Profit), ADR, 가동률(OCC) 운영 실적 및 이익률 구조를 제시하세요.",
    market_position: "주변 매매 시세 및 경쟁 매물 대비 본 자산의 마켓 포지셔닝(할인율)을 제시하세요.",
    comparable_analysis: "인근 거래사례와의 3.3㎡당 가격 비교 및 단기 매각 시 목표 차익 타당성을 입증하세요.",
  };

  const mission = sectionMission[sectionType] ?? "자산의 가치를 객관적이고 설득력 있게 설명하세요.";

  let prompt = `## [섹션 작성 미션: ${sectionType}]
${mission}

## [기본 건물 데이터 (SSoT)]
${JSON.stringify(bssotLite, null, 2)}`;

  if (externalData) {
    // ⚠️ [D-TOKEN-BLOAT-FIX] 바이너리 이미지 필드 제거 — Base64 PNG/Buffer가
    // JSON.stringify로 직렬화되면 요청당 ~200K 토큰이 낭비됨 (실측 $15~18/IM → $0.25/IM)
    const {
      cadastralMapImage, mapImageUrl, buffer,
      staticMapImage, mapImage, thumbnailImage,
      ...safeExternalData
    } = (externalData as any) ?? {};
    
    // [D09] 프롬프트 필드 슬라이싱: 섹션과 무관한 대용량 배열 제거
    const slicedExternal: any = stripRenderOnlyExternal({ ...safeExternalData }); // 지도 렌더 전용 후보 제외 (토큰·결정성)
    if (!['location_analysis', 'property_overview', 'location'].includes(sectionType)) {
      delete slicedExternal.poi;
    }
    if (!['building_overview', 'property_overview', 'building'].includes(sectionType)) {
      if (slicedExternal.buildingRegister) {
        delete (slicedExternal.buildingRegister as any).floors;
      }
    }
    if (!['land_detail', 'land'].includes(sectionType)) {
      delete slicedExternal.landPriceHistory;
    }

    prompt += `\n\n## [공공 데이터 & 마켓 현황]
${JSON.stringify(slicedExternal, null, 2)}`;
  } else {
    prompt += `\n\n## [공공 데이터 현황]
공적장부(건축물대장, 토지이용계획)를 조회하지 못했습니다.
아래 규칙을 반드시 지키세요:
- 연면적, 건폐율, 용적률, 준공년도 등 공적장부 확인 항목을 서술할 때 반드시 "브로커 제공 정보 기준" 또는 "건축물대장 확인 필요"를 병기하세요.
- 수치를 단정적으로 기술하지 마세요. "약 ○○㎡(브로커 제공)" 형식을 사용하세요.
- "건축물대장 확인 결과"와 같은 표현을 절대 사용하지 마세요.`;
  }

  if (supplemental) {
    // ⚠️ [D-TOKEN-BLOAT-FIX] 사진 Base64 data URI 제거
    const {
      photos_v2, photo_urls, photo_captions, photoUrl, photos,
      ...safeSupplemental
    } = (supplemental as any) ?? {};
    
    // [D09] 프롬프트 필드 슬라이싱: 섹션과 무관한 대용량 배열 제거
    const slicedSupp = { ...safeSupplemental };
    if (!['lease_status', 'income_analysis', 'rentRollStacking'].includes(sectionType)) {
      delete slicedSupp.floor_leases;
    }
    if (!['investment_thesis', 'comparable_analysis'].includes(sectionType)) {
      delete slicedSupp.comparables;
    }

    prompt += `\n\n## [추가 수집 데이터]
${JSON.stringify(slicedSupp, null, 2)}`;

    // v1.5 §9.1: 중개인이 평 단위로 렌트롤을 입력한 경우, 임대/전용면적 서술의 단위를 명시한다.
    // (floor_leases 의 area_sqm / exclusive_area_sqm 은 ㎡ 정본값, 렌트롤 표는 평(÷3.305785, 소수 2자리)로 표기된다.)
    // ㎡ 입력(기본)은 프롬프트를 바꾸지 않는다 — 기존 녹화 프롬프트 유지.
    const rrUnit = (slicedSupp as any)?.rent_roll_meta?.area_input_unit;
    if (rrUnit === 'pyeong' && Array.isArray(slicedSupp.floor_leases) && slicedSupp.floor_leases.length > 0) {
      prompt += `\n\n## [렌트롤 면적 단위]
- floor_leases 의 area_sqm / exclusive_area_sqm 은 ㎡ 값입니다. 중개인 입력 및 렌트롤 표 표기 단위는 평(㎡ ÷ 3.305785, 소수 2자리)입니다.
- 임대면적·전용면적을 본문에 서술할 때는 반드시 단위를 붙이고(예: "95.96평"), 렌트롤 표의 표기 단위와 같은 단위로 쓰세요.`;
    }
  }

  if (marketIndicators?.financialsMarkdown) {
    prompt += `\n\n## [사전 계산된 재무 마크다운 (반드시 본문에 그대로 혹은 참조하여 수치 일치시키세요)]
${marketIndicators.financialsMarkdown}`;
  }

  if (sectionContext) {
    prompt += `\n\n## [이전 섹션 맥락 (수치 일관성 필수 유지)]
- 주요 사실: ${sectionContext.keyFacts.join(", ")}`;
    if (sectionContext.numericalAnchors) {
      const anchorsObj = 'toJSON' in sectionContext.numericalAnchors && typeof sectionContext.numericalAnchors.toJSON === 'function' 
        ? sectionContext.numericalAnchors.toJSON() 
        : sectionContext.numericalAnchors;
      prompt += `\n- 고정 수치: ${JSON.stringify(anchorsObj)}`;
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
위 데이터를 바탕으로 **${sectionType}** 섹션을 작성해 주세요. 어조는 전문적이고 객관적인 서술형으로 2~4문장의 줄글로만 작성하세요. (표 생성 절대 금지)`;

  if (lexiconProfile) {
    prompt = applyLexiconProfile(prompt, lexiconProfile);
  }

  return prompt;
}

