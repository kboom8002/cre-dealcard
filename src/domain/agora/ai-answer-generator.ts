/**
 * AI Answer Generator — CRE Agora
 *
 * 질문에 대한 AI 큐레이션 답변을 생성합니다.
 * - 시세 데이터 자동 인라인 삽입
 * - 관련 딜카드 자동 매칭
 * - 법률/세무 면책 조항 자동 삽입
 */

import type { AgoraCategory, CRERegion } from "./qis-seed-generator";

export interface AIAnswerResult {
  /** AI 생성 본문 (마크다운) */
  content: string;
  /** 면책 조항 (항상 자동 삽입) */
  disclaimer: string;
  /** 데이터 인용 출처 */
  dataSources: string[];
  /** 매칭된 딜카드 ID 배열 */
  matchedDealIds: string[];
  /** 연결 시세 리포트 권역 */
  marketReportRegion: string | null;
  /** 관련 질문 IDs */
  relatedThreadIds: string[];
}

// ── 면책 조항 (항상 자동 삽입) ───────────────────────────────────────
export const CRE_DISCLAIMER =
  "⚠️ 이 답변은 DealCard AI가 공개된 시장 데이터와 일반적인 부동산 실무 지식을 바탕으로 생성한 참고 정보입니다. 실제 거래·투자·세무·법률 판단은 반드시 공인중개사, 세무사, 변호사 등 해당 분야 전문가와 상담하시기 바랍니다.";

// ── 카테고리별 답변 템플릿 ────────────────────────────────────────────
type AnswerTemplate = {
  intro: string;
  keyPoints: string[];
  dealCardHook: string;
};

const ANSWER_TEMPLATES: Record<AgoraCategory, AnswerTemplate> = {
  sale: {
    intro: "상업용 부동산 매각은 복잡한 절차와 다양한 이해관계자가 얽혀 있습니다. DealCard의 블라인드 딜카드 시스템으로 정보를 보호하면서 진지한 매수자만 선별할 수 있습니다.",
    keyPoints: [
      "매각 준비도 점검: 건물 상태, 임대 현황, 법적 하자 선제 해소",
      "블라인드 딜카드 생성: 정확한 주소·소유자 정보 비공개 상태로 매수자 탐색",
      "3단계 Gate 시스템(G1→G2→G3)으로 NDA 전후 정보 노출 단계 통제",
      "AI 매칭 엔진이 S/A/B/C 등급으로 매수자 적합도 자동 분류",
    ],
    dealCardHook: "현재 유사 조건의 블라인드 딜카드를 통해 매수 의향을 확인해 보세요.",
  },
  lease: {
    intro: "상업용 부동산 임대 시장은 권역별·면적별로 조건 차이가 큽니다. DealCard에서 블라인드 방식으로 임대 공간을 탐색할 수 있습니다.",
    keyPoints: [
      "임대료 구성: 보증금(보통 월차임 10~24개월), 월차임, 관리비 분리 확인",
      "공실 협상 레버리지: Free Rent 기간, 인테리어 지원(TI), 임대료 에스컬레이션 조항",
      "권리금 이슈: 임차인 주선 의무(상가임대차보호법 제10조의4)와 명도 절차 선이해 필수",
      "관리비 항목 정확히 파악: 전기·냉난방·청소·주차 포함 여부 계약서 명시",
    ],
    dealCardHook: "관심 권역의 블라인드 임대 공간을 조건 없이 탐색해 보세요.",
  },
  invest: {
    intro: "상업용 부동산 투자는 캡레이트(Cap Rate), NOI, IRR 등 정량 지표와 입지·임차인 질(Quality) 같은 정성 지표를 종합적으로 분석해야 합니다.",
    keyPoints: [
      "캡레이트 = NOI ÷ 매입가격. 서울 프라임 오피스 기준 현재 3.5~4.5% 수준",
      "NOI 계산: 총임대수입 - 공실손실 - 운영비용(관리비, 보험, 세금 등)",
      "실사(DD) 필수 항목: 등기, 건축물대장, 토양오염, 임대차 계약 전수 확인",
      "출구 전략(Exit Strategy): 보유 기간, 캡레이트 변동 시나리오, 리파이낸싱 계획 사전 설계",
    ],
    dealCardHook: "투자 조건에 맞는 블라인드 딜카드를 AI가 S/A/B/C 등급으로 매칭해 드립니다.",
  },
  legal: {
    intro: "상업용 부동산 거래의 세금 구조는 개인/법인 여부, 보유 기간, 용도에 따라 크게 달라집니다. 반드시 세무사·법무사와 사전 검토를 권장합니다.",
    keyPoints: [
      "양도소득세: 개인 기준 보유 1년 미만 77%, 2년 미만 66%, 2년 이상 22~45%",
      "법인세: 과세표준 2억 이하 9%, 2억~200억 19%, 200억 초과 21%",
      "부가세: 건물분 부가세(토지 제외) 별도 협의. 사업자간 거래 시 환급 가능",
      "상가임대차보호법: 임차인 계약갱신요구권(10년), 권리금 회수기회 보호",
    ],
    dealCardHook: "법률/세무 검토 후 매각을 결정하셨다면, 블라인드 딜카드로 매수자를 탐색하세요.",
  },
  market: {
    intro: "서울 상업용 부동산 시장은 권역별·자산 유형별로 다른 사이클을 보입니다. DealCard의 실시간 딜카드 데이터로 현재 시장 온도를 확인할 수 있습니다.",
    keyPoints: [
      "GBD(강남권): 공실률 2~3%대 최저 유지. 프라임 오피스 임대료 강세",
      "YBD(여의도): 금융기관 이전 리스크 vs 글로벌 IFC·파크원 프리미엄",
      "CBD(광화문): 노후 오피스 리모델링 수요. 역사지구 제한으로 공급 제한",
      "성수·홍대: MZ 소비 트렌드 집중, 임대료 상승세 지속 but 젠트리피케이션 리스크",
    ],
    dealCardHook: "권역별 최신 시세 리포트와 현재 등록된 블라인드 매물을 확인해 보세요.",
  },
  manage: {
    intro: "건물 관리 비용과 운영 효율성은 NOI에 직결되며, 자산 가치 유지의 핵심입니다. 체계적인 PM/FM 전략이 필요합니다.",
    keyPoints: [
      "PM(Property Management): 임차인 관리, 임대료 수금, 계약 갱신 담당",
      "FM(Facility Management): 설비 유지보수, 에너지 관리, 안전 점검 담당",
      "수선충당금: 건물 감가상각을 고려한 연간 적립 (통상 유효 총수입의 2~5%)",
      "친환경 인증(그린빌딩): 에너지 절감 + 임차인 ESG 요구 대응으로 임대료 프리미엄",
    ],
    dealCardHook: "관리 효율화 후 자산 가치가 높아진 매물을 딜카드로 소개해 보세요.",
  },
  finance: {
    intro: "상업용 부동산 금융은 인수금융(PF)부터 브릿지론, 리파이낸싱까지 다양한 옵션이 있습니다. 금리 사이클과 LTV 기준을 이해하고 적절한 구조를 설계해야 합니다.",
    keyPoints: [
      "인수금융(PF): LTV 50~70%, 금리 SOFR/CD금리 + 가산금리 2~4%",
      "브릿지론: 단기(6개월~2년) 고금리 자금. 장기 PF 전환 전제",
      "리파이낸싱 타이밍: 현재 대출 금리 대비 1.5%p 이상 절감 가능 시 유리",
      "메자닌 파이낸싱: 선순위 대출 + 후순위 대출 구조로 자기자본 비율 최소화",
    ],
    dealCardHook: "금융 구조 확정 후 투자 조건에 맞는 딜카드를 검색해 보세요.",
  },
};

// ── Region-specific market data snippets ─────────────────────────────
const REGION_MARKET_SNIPPETS: Record<string, string> = {
  gbd: "[DealCard 데이터] GBD 오피스 공실률 약 2.1% (서울 최저), 평균 임대료 3.3~4.5만 원/평",
  ybd: "[DealCard 데이터] YBD 오피스 공실률 약 5.8%, IFC·파크원 프리미엄 임대료 형성",
  cbd: "[DealCard 데이터] CBD 오피스 공실률 약 7.2%, 노후화로 리모델링 수요 증가",
  seongsu: "[DealCard 데이터] 성수 상업지 거래 활발, 상가 평균 보증금 3~5천만 원/평당 월세 30만 원+",
  pangyo: "[DealCard 데이터] 판교 IT오피스 공실 희소, 스타트업·빅테크 임대 수요 지속",
  mapo: "[DealCard 데이터] 마포 F&B 상권 임대료 홍대 중심 상승세, 연남동 안정적",
  jongno: "[DealCard 데이터] 종로 역사지구 개발 제한, 노후 상업지 리모델링 투자 기회",
  hongdae: "[DealCard 데이터] 홍대·연남 F&B·리테일 권리금 시장 활성, 공실률 낮음",
};

// ── Main Generator ────────────────────────────────────────────────────

export interface AnswerGeneratorOptions {
  questionTitle: string;
  questionContent: string;
  category: AgoraCategory;
  region: CRERegion | null;
  matchedDealIds?: string[];
  relatedThreadIds?: string[];
}

/**
 * AI 큐레이션 답변 생성
 * 면책 조항은 항상 자동으로 삽입됩니다.
 */
export function generateAIAnswer(opts: AnswerGeneratorOptions): AIAnswerResult {
  const template = ANSWER_TEMPLATES[opts.category];
  const regionSnippet = opts.region ? REGION_MARKET_SNIPPETS[opts.region] : null;

  const dataSources: string[] = ["DealCard 블라인드 딜카드 DB"];
  if (regionSnippet) dataSources.push(`${opts.region?.toUpperCase()} 권역 시세 데이터`);

  // ── 답변 본문 조립 ─────────────────────────────────────────────
  const lines: string[] = [];

  // 인트로
  lines.push(template.intro);
  lines.push("");

  // 시세 데이터 (권역 있는 경우)
  if (regionSnippet) {
    lines.push(`📊 **현재 시장 데이터**`);
    lines.push(regionSnippet);
    lines.push("");
  }

  // 핵심 포인트
  lines.push("**핵심 포인트**");
  template.keyPoints.forEach((point, i) => {
    lines.push(`${i + 1}. ${point}`);
  });
  lines.push("");

  // 딜카드 연결 훅
  lines.push(`💡 **DealCard와 연결하기**`);
  lines.push(template.dealCardHook);

  const content = lines.join("\n");

  return {
    content,
    disclaimer: CRE_DISCLAIMER,
    dataSources,
    matchedDealIds: opts.matchedDealIds ?? [],
    marketReportRegion: opts.region ?? null,
    relatedThreadIds: opts.relatedThreadIds ?? [],
  };
}

/**
 * 카테고리에서 답변 템플릿 인트로만 반환 (preview용)
 */
export function getAnswerPreview(category: AgoraCategory): string {
  return ANSWER_TEMPLATES[category].intro;
}
