/**
 * QIS Seed Generator — CRE Domain
 *
 * QIS Goldilocks Triad 모델 적용:
 *   1. AI-Agent 페르소나 시뮬레이션 (4종 페르소나)
 *   2. CRE 도메인 엔티티 매칭 (7카테고리 × 8권역)
 *   3. 부동산 중개법/세무 컴플라이언스 필터
 *
 * 생성된 질문의 작성자는 페르소나 이름으로 표시됩니다.
 * (예: "GBD투자자", "성수임차인", "판교건물주")
 */

export type AgoraCategory =
  | "sale"    // 매매
  | "lease"   // 임대
  | "invest"  // 투자
  | "legal"   // 법률/세무
  | "market"  // 시장동향
  | "manage"  // 건물관리
  | "finance"; // 금융

export type CRERegion =
  | "gbd" | "ybd" | "cbd"
  | "seongsu" | "pangyo" | "mapo" | "jongno" | "hongdae";

export type PersonaType = "seller" | "investor" | "tenant" | "broker";

export interface QISSeedQuestion {
  title: string;
  content: string;
  category: AgoraCategory;
  region: CRERegion | null;
  personaType: PersonaType;
  /** 작성자 표시명: 페르소나 이름 (예: "GBD투자자") */
  authorName: string;
  tags: string[];
  is_seed: true;
}

// ── Region Labels ──────────────────────────────────────────────────
const REGION_LABELS: Record<CRERegion, string> = {
  gbd: "GBD(강남권역)", ybd: "YBD(여의도)", cbd: "CBD(종로/광화문)",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

// ── Persona Name Generator ─────────────────────────────────────────
function makePersonaName(personaType: PersonaType, region: CRERegion | null): string {
  const regionLabel = region ? REGION_LABELS[region].split("(")[0] : "전국";
  const roleLabel: Record<PersonaType, string> = {
    seller:   "건물주",
    investor: "투자자",
    tenant:   "임차인",
    broker:   "중개인",
  };
  return `${regionLabel}${roleLabel[personaType]}`;
}

// ── Seed Question Bank ─────────────────────────────────────────────
type SeedSpec = {
  title: string;
  content: string;
  category: AgoraCategory;
  region: CRERegion | null;
  personaType: PersonaType;
  tags: string[];
};

const SEED_SPECS: SeedSpec[] = [
  // ── 매매 (sale) ──────────────────────────────────────────────────
  {
    title: "강남 오피스 빌딩 매각 시 적정 캡레이트(Cap Rate)는 얼마인가요?",
    content: "강남권역(GBD) 오피스 빌딩 매각을 검토 중입니다. 최근 캡레이트 시세가 어느 정도인지, 그리고 캡레이트가 매각가 협상에 어떤 영향을 미치는지 알고 싶습니다.",
    category: "sale", region: "gbd", personaType: "seller",
    tags: ["캡레이트", "오피스", "강남", "매각"],
  },
  {
    title: "여의도 빌딩 매각 절차를 단계별로 알려주세요.",
    content: "여의도(YBD)에 오피스 빌딩을 소유하고 있습니다. 매각 결정부터 계약 완료까지 전체 절차와 소요 기간이 궁금합니다.",
    category: "sale", region: "ybd", personaType: "seller",
    tags: ["매각절차", "여의도", "빌딩", "계약"],
  },
  {
    title: "성수 상가 매각 시 권리금은 어떻게 처리해야 하나요?",
    content: "성수동 1층 상가를 매각 예정인데, 현재 임차인이 권리금 문제를 제기하고 있습니다. 법적으로 어떻게 처리해야 하는지, 매각가에 영향을 미치는지 궁금합니다.",
    category: "sale", region: "seongsu", personaType: "seller",
    tags: ["권리금", "성수", "상가", "임차인"],
  },
  {
    title: "판교 오피스 매각 시 임차인 계약 이전 여부가 매각가에 영향을 미치나요?",
    content: "판교에 IT 임차인이 있는 오피스를 매각하려 합니다. 장기 임대차 계약이 남아 있는 상태로 매각하는 것이 유리한지, 임차인 계약 만료 후 매각이 유리한지 비교가 필요합니다.",
    category: "sale", region: "pangyo", personaType: "seller",
    tags: ["임차인", "판교", "오피스", "매각전략"],
  },
  {
    title: "CBD 종로 오피스텔 매각 vs 보유, 지금 어떤 선택이 유리한가요?",
    content: "종로에 오피스텔 2채를 보유 중인데, 금리 인상 국면에서 매각하는 것이 나은지, 장기 보유가 나은지 판단이 어렵습니다. 현재 시장 상황을 고려한 의견이 필요합니다.",
    category: "sale", region: "cbd", personaType: "seller",
    tags: ["오피스텔", "종로", "보유vs매각", "금리"],
  },

  // ── 임대 (lease) ─────────────────────────────────────────────────
  {
    title: "성수동 200평 오피스 임대료 시세는 어느 수준인가요?",
    content: "성수동 트렌드 지역에서 200평 규모 오피스를 임차하려 합니다. 현재 보증금/월차임 시세가 어느 정도인지, 그리고 인근 유사 공간과 비교해 적정 조건을 알고 싶습니다.",
    category: "lease", region: "seongsu", personaType: "tenant",
    tags: ["임대료", "성수", "오피스", "시세"],
  },
  {
    title: "판교 IT단지 스타트업용 소형 사무실 임대 조건 팁이 있을까요?",
    content: "시리즈A 스타트업으로 판교에서 30~50평 오피스를 알아보고 있습니다. 인기 지역이라 공실이 적다고 하는데, 좋은 조건으로 계약하기 위한 협상 팁이 궁금합니다.",
    category: "lease", region: "pangyo", personaType: "tenant",
    tags: ["스타트업", "판교", "소형사무실", "협상"],
  },
  {
    title: "마포 홍대 F&B 공간 임차 시 핵심 체크리스트는?",
    content: "홍대·연남 인근에서 카페 창업을 위해 1층 상가를 임차하려 합니다. 권리금, 임대 조건, 용도 제한 등에서 반드시 확인해야 할 사항들을 알고 싶습니다.",
    category: "lease", region: "mapo", personaType: "tenant",
    tags: ["F&B", "홍대", "카페창업", "임차체크리스트"],
  },
  {
    title: "GBD 강남 빌딩 공실 관리 전략은 무엇인가요?",
    content: "강남 오피스 빌딩 공실률이 15%를 넘었습니다. 임차인 유치를 위한 효과적인 전략과, 임대조건 조정(Free Rent, 인테리어 지원 등) 활용 방안이 궁금합니다.",
    category: "lease", region: "gbd", personaType: "seller",
    tags: ["공실관리", "강남", "빌딩관리", "임차인유치"],
  },

  // ── 투자 (invest) ─────────────────────────────────────────────────
  {
    title: "2026년 상반기 서울 상업용 부동산 투자 유망 권역은 어디인가요?",
    content: "상업용 부동산 포트폴리오를 다각화하려 합니다. 2026년 현재 투자 수익률과 가격 상승 가능성을 고려했을 때 GBD·YBD·CBD·성수 중 어느 권역이 가장 유망한가요?",
    category: "invest", region: null, personaType: "investor",
    tags: ["투자전략", "권역분석", "2026", "포트폴리오"],
  },
  {
    title: "상업용 부동산 실사(Due Diligence) 체크리스트를 공유해 주세요.",
    content: "오피스 빌딩 매수를 앞두고 실사를 진행하려 합니다. 등기, 건축물대장, 토양오염, 임대차 검토 등 법적/물리적 실사 항목 전체 리스트가 필요합니다.",
    category: "invest", region: null, personaType: "investor",
    tags: ["실사", "DD", "체크리스트", "매수"],
  },
  {
    title: "여의도 오피스 빌딩 NOI 계산 방법을 알려주세요.",
    content: "여의도 오피스 투자를 검토 중입니다. 순운영수익(NOI) 계산 시 포함해야 할 항목과 제외해야 할 비용이 무엇인지, 실제 사례 기반으로 설명해 주세요.",
    category: "invest", region: "ybd", personaType: "investor",
    tags: ["NOI", "순운영수익", "여의도", "오피스투자"],
  },
  {
    title: "상업용 부동산 REIT 투자 vs 직접 매입, 어떤 차이가 있나요?",
    content: "상업용 부동산에 투자하려 하는데, 직접 빌딩을 매입하는 것과 상업용 부동산 리츠(REIT)에 투자하는 것의 장단점을 비교하고 싶습니다.",
    category: "invest", region: null, personaType: "investor",
    tags: ["REIT", "직접투자", "비교", "장단점"],
  },

  // ── 법률/세무 (legal) ─────────────────────────────────────────────
  {
    title: "오피스 빌딩 매각 시 양도소득세 절세 전략이 있나요?",
    content: "법인이 아닌 개인 명의로 오피스 빌딩을 10년 보유 후 매각하려 합니다. 양도소득세 과세표준과 세율 구조, 그리고 절세 가능한 합법적 방법이 궁금합니다.",
    category: "legal", region: null, personaType: "seller",
    tags: ["양도소득세", "절세", "개인매각", "세무"],
  },
  {
    title: "법인이 상업용 부동산 매각 시 세금 구조는 어떻게 되나요?",
    content: "법인 명의로 GBD 오피스 빌딩을 보유 중입니다. 매각 시 법인세, 부가세, 주주 배당세까지 고려하면 실질 세부담이 어느 정도인지 전체 구조를 이해하고 싶습니다.",
    category: "legal", region: "gbd", personaType: "seller",
    tags: ["법인세", "부가세", "법인매각", "세금구조"],
  },
  {
    title: "상가건물 임대차보호법 적용 범위와 임차인 보호 범위는?",
    content: "빌딩 매각을 앞두고 기존 임차인과의 관계 정리가 필요합니다. 상가건물 임대차보호법에서 임차인에게 보장되는 권리와 건물주가 합법적으로 임대 종료를 요청할 수 있는 조건이 궁금합니다.",
    category: "legal", region: null, personaType: "seller",
    tags: ["임대차보호법", "임차인권리", "상가", "임대종료"],
  },

  // ── 시장동향 (market) ─────────────────────────────────────────────
  {
    title: "2026년 상반기 GBD 오피스 공실률과 임대료 트렌드는?",
    content: "강남권역(GBD) 오피스 시장의 최근 동향이 궁금합니다. 공실률 추이, 평균 임대료 변화, 신규 공급 예정 물량이 향후 시세에 미칠 영향을 알고 싶습니다.",
    category: "market", region: "gbd", personaType: "investor",
    tags: ["공실률", "임대료트렌드", "GBD", "2026"],
  },
  {
    title: "성수동 상업용 부동산 가격이 계속 오를 수 있을까요?",
    content: "성수동 트렌드 지역의 상가 가격이 많이 올랐습니다. 젠트리피케이션 이후 조정 가능성과, 지속 성장 요인이 무엇인지 시장 전문가 관점의 의견이 필요합니다.",
    category: "market", region: "seongsu", personaType: "investor",
    tags: ["성수", "젠트리피케이션", "상가가격", "전망"],
  },
  {
    title: "금리 인하가 상업용 부동산 시장에 미치는 영향은?",
    content: "2026년 금리 인하 사이클이 시작되면서 상업용 부동산 시장이 어떻게 변화할지 궁금합니다. 캡레이트 압축, 거래량 회복, 가격 반등 시그널이 어떻게 나타나는지 알고 싶습니다.",
    category: "market", region: null, personaType: "investor",
    tags: ["금리인하", "캡레이트", "거래량", "시장전망"],
  },

  // ── 건물관리 (manage) ─────────────────────────────────────────────
  {
    title: "오피스 빌딩 PM(Property Management) 계약 시 핵심 조건은 무엇인가요?",
    content: "오피스 빌딩 자산관리를 PM사에 위탁하려 합니다. 수수료 구조, 업무 범위, 성과 KPI, 계약 해지 조건 등 협상 시 반드시 확인해야 할 조항이 궁금합니다.",
    category: "manage", region: null, personaType: "seller",
    tags: ["PM", "자산관리", "위탁관리", "계약조건"],
  },
  {
    title: "노후 오피스 빌딩 리모델링 vs 재건축, 어떤 기준으로 결정하나요?",
    content: "20년 이상 된 GBD 오피스 빌딩을 보유 중입니다. 리모델링으로 가치를 높일지, 재건축을 추진할지 판단하는 기준과 투자 대비 수익성 분석 방법이 궁금합니다.",
    category: "manage", region: "gbd", personaType: "seller",
    tags: ["리모델링", "재건축", "노후빌딩", "가치향상"],
  },

  // ── 금융 (finance) ────────────────────────────────────────────────
  {
    title: "오피스 빌딩 인수금융(PF 대출) 조건과 절차는 어떻게 되나요?",
    content: "여의도 오피스 빌딩 매수를 위해 PF 대출을 알아보고 있습니다. LTV 한도, 금리 수준, 심사 기간, 필요 서류 등 인수금융 전반적인 내용이 궁금합니다.",
    category: "finance", region: "ybd", personaType: "investor",
    tags: ["PF대출", "인수금융", "LTV", "여의도"],
  },
  {
    title: "상업용 부동산 리파이낸싱 적절한 시점과 절차는?",
    content: "현재 높은 금리로 대출을 받아 오피스를 보유 중입니다. 금리가 낮아지면 리파이낸싱을 고려하려 하는데, 적절한 시점 판단 기준과 진행 절차가 궁금합니다.",
    category: "finance", region: null, personaType: "seller",
    tags: ["리파이낸싱", "금리", "대출전환", "타이밍"],
  },
];

// ── Public API ─────────────────────────────────────────────────────

/**
 * QIS Probe 기반 시드 질문 생성
 * 모든 생성 질문의 authorName은 페르소나 이름으로 설정됩니다.
 */
export function generateSeedQuestions(): QISSeedQuestion[] {
  return SEED_SPECS.map((spec) => ({
    ...spec,
    authorName: makePersonaName(spec.personaType, spec.region),
    is_seed: true as const,
  }));
}

/**
 * 카테고리별 시드 질문 필터
 */
export function getSeedsByCategory(category: AgoraCategory): QISSeedQuestion[] {
  return generateSeedQuestions().filter((q) => q.category === category);
}

/**
 * 권역별 시드 질문 필터
 */
export function getSeedsByRegion(region: CRERegion): QISSeedQuestion[] {
  return generateSeedQuestions().filter((q) => q.region === region || q.region === null);
}

/**
 * 카테고리 메타데이터
 */
export const CATEGORY_META: Record<AgoraCategory, { label: string; emoji: string; desc: string }> = {
  sale:    { label: "매매",     emoji: "💰", desc: "매각 절차, 매각가, 세금, 협상 전략" },
  lease:   { label: "임대",     emoji: "🏢", desc: "임대료, 공실 관리, 임차인 유치" },
  invest:  { label: "투자",     emoji: "📈", desc: "수익률, 실사, 포트폴리오 전략" },
  legal:   { label: "법률/세무", emoji: "⚖️", desc: "양도세, 취득세, 임대차보호법" },
  market:  { label: "시장동향",  emoji: "📊", desc: "권역별 시세, 공실률, 금리 영향" },
  manage:  { label: "건물관리",  emoji: "🔧", desc: "PM/FM, 리모델링, 에너지 효율" },
  finance: { label: "금융",     emoji: "🏦", desc: "PF 대출, 브릿지론, 리파이낸싱" },
};
