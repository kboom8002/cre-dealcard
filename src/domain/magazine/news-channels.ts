/**
 * src/domain/magazine/news-channels.ts — 매수자(건물주·자산가) 관심 다채널 뉴스 큐레이션 SSOT
 *
 * 60대 상업용 부동산 중개인이 50~70대 꼬마빌딩 매수자·건물주에게 매주 발송할 때,
 * 단순 부동산 기사만 나열하면 독자 피로도가 높아지므로
 * [부동산·빌딩] + [경제·금리·금융] + [절세·상속·자산관리] + [문화·예술·라이프] + [상권·트렌드·교양]
 * 5대 관심 채널에서 최신 콘텐츠를 수집·분류·검색·황금배합 큐레이션할 수 있도록 지원한다.
 *
 * 클라이언트·서버 공용 순수 모듈 (Node 전용 import 금지).
 */

export type NewsChannelId =
  | "all"
  | "real_estate"
  | "economy_finance"
  | "tax_wealth"
  | "culture_lifestyle"
  | "commercial_trend";

export type SpecificNewsChannelId = Exclude<NewsChannelId, "all">;

export interface NewsChannelMeta {
  id: NewsChannelId;
  label: string;
  shortLabel: string;
  emoji: string;
  badgeClass: string;
  description: string;
  buyerAppeal: string;
  sampleKeywords: readonly string[];
  sourcesLabel: string;
}

export const NEWS_CHANNELS: readonly NewsChannelMeta[] = [
  {
    id: "all",
    label: "전체 채널",
    shortLabel: "전체",
    emoji: "🗂️",
    badgeClass: "text-slate-200 bg-slate-700/60 border-slate-500/40",
    description: "부동산·경제·절세·문화·상권 5대 채널의 전체 최신 큐레이션 후보",
    buyerAppeal: "매수자·건물주가 관심 갖는 전 분야 핵심 소식을 한눈에 비교합니다.",
    sampleKeywords: ["꼬마빌딩", "기준금리", "상속·증여", "미술품·전시", "성수·강남 상권"],
    sourcesLabel: "5대 채널 통합 (경제지·문화·세무·상권 피드)",
  },
  {
    id: "real_estate",
    label: "부동산·빌딩",
    shortLabel: "부동산·빌딩",
    emoji: "🏢",
    badgeClass: "text-indigo-200 bg-indigo-500/15 border-indigo-400/35",
    description: "꼬마빌딩 매매·실거래, 오피스·근생 공실·임대, 역세권 도시계획·경공매",
    buyerAppeal: "실수요 사옥 매수자와 수익형 빌딩 투자자가 가장 먼저 확인하는 시장 본류 소식입니다.",
    sampleKeywords: ["꼬마빌딩 거래", "오피스 공실률", "역세권 지구단위계획", "근생 리모델링", "빌딩 경매"],
    sourcesLabel: "한경·매경·서경·이데일리·머니투데이·조선비즈 부동산",
  },
  {
    id: "economy_finance",
    label: "경제·금리·금융",
    shortLabel: "경제·금리",
    emoji: "📈",
    badgeClass: "text-sky-200 bg-sky-500/15 border-sky-400/35",
    description: "한국은행·연준 기준금리, 빌딩 담보대출·신탁금융, 환율·채권·거시경제 흐름",
    buyerAppeal: "레버리지(대출 금리)와 자금 조달 타이밍을 고민하는 매수자에게 결정적 근거를 제공합니다.",
    sampleKeywords: ["한국은행 기준금리", "빌딩 담보대출 금리", "환율·채권 동향", "자산가 포트폴리오"],
    sourcesLabel: "한경·매경·연합·서경 경제·금융·증권",
  },
  {
    id: "tax_wealth",
    label: "절세·상속·자산관리",
    shortLabel: "절세·상속",
    emoji: "⚖️",
    badgeClass: "text-amber-200 bg-amber-500/15 border-amber-400/35",
    description: "꼬마빌딩 증여·상속·가업승계, 양도세·종부세 절세, 가족법인·부동산 신탁",
    buyerAppeal: "50~70대 건물주·자산가가 가장 민감하게 반응하고 자녀 세대 증여 상담으로 이어지는 핵심 주제입니다.",
    sampleKeywords: ["빌딩 증여·상속세", "양도세 장기보유공제", "가족법인 절세", "감정평가 절세"],
    sourcesLabel: "경제지 세무·재테크 · 국세·세법 브리핑 · PB 자산관리",
  },
  {
    id: "culture_lifestyle",
    label: "문화·예술·라이프",
    shortLabel: "문화·라이프",
    emoji: "🎨",
    badgeClass: "text-rose-200 bg-rose-500/15 border-rose-400/35",
    description: "미술품 경매·아트테크, 건축·공간 디자인, 전시·클래식·공연, 시니어 웰니스·골프·미식",
    buyerAppeal: "딱딱한 부동산 숫자 사이에 품격 있는 문화·예술·건강 읽을거리를 더해 매거진 열람률을 높입니다.",
    sampleKeywords: ["미술품 경매·전시", "건축 디자인 트렌드", "클래식·박물관", "시니어 웰니스·골프"],
    sourcesLabel: "한경 아르떼(Arte) · 매경·서경 문화·라이프 · 건축·디자인",
  },
  {
    id: "commercial_trend",
    label: "상권·트렌드·교양",
    shortLabel: "상권·트렌드",
    emoji: "☕",
    badgeClass: "text-emerald-200 bg-emerald-500/15 border-emerald-400/35",
    description: "성수·한남·강남·도산 핫플레이스 상권, 우량 임차인(병의원·카페·사옥) 입점, 소비·테크 트렌드",
    buyerAppeal: "내 건물 1층과 기준층에 어떤 우량 임차인을 들일지 고민하는 건물주·매수자의 눈을 사로잡습니다.",
    sampleKeywords: ["성수·한남 팝업 상권", "병의원·메디컬 임차", "프랜차이즈 카페 입점", "시니어 비즈니스 트렌드"],
    sourcesLabel: "유통·리테일·F&B 상권 분석 · 핫플레이스·테크 트렌드",
  },
] as const;

export const NEWS_CHANNEL_MAP: Readonly<Record<NewsChannelId, NewsChannelMeta>> = Object.fromEntries(
  NEWS_CHANNELS.map((c) => [c.id, c]),
) as Record<NewsChannelId, NewsChannelMeta>;

export const SPECIFIC_NEWS_CHANNELS: readonly (NewsChannelMeta & { id: SpecificNewsChannelId })[] =
  NEWS_CHANNELS.filter(
    (c): c is NewsChannelMeta & { id: SpecificNewsChannelId } => c.id !== "all",
  );

export function isSpecificNewsChannelId(value: unknown): value is SpecificNewsChannelId {
  return (
    value === "real_estate" ||
    value === "economy_finance" ||
    value === "tax_wealth" ||
    value === "culture_lifestyle" ||
    value === "commercial_trend"
  );
}

const NON_CRE_GOSSIP_RE =
  /여가수|연예인|아이돌|걸그룹|보이그룹|가수\s*[가-힣A-Za-z]|배우\s*[가-힣A-Za-z]|탤런트|개그맨|개그우먼|아나운서|방송인|유튜버|인플루언서|톱스타|셀럽|소속사|예능|드라마\s*출연|열애|결별|이혼\s*소송|불륜|스캔들|사생활|마약|폭행|성폭행|살인|구속\s*기소|구속영장|음주운전|도박|프로야구|프로축구|올림픽\s*메달|손흥민|오타니|탄핵|특검|계엄|공천|대선\s*후보|총선\s*출마/i;

const CELEBRITY_HOME_GOSSIP_RE =
  /(?:여가수|연예인|아이돌|걸그룹|보이그룹|가수|배우|탤런트|개그맨|개그우먼|아나운서|방송인|유명인|톱스타|셀럽)[\s\S]*(?:집|자택|빌라|아파트|저택|펜트하우스|경매|공매|낙찰)|(?:집|자택|빌라|아파트|저택|펜트하우스|경매|공매|낙찰)[\s\S]*(?:여가수|연예인|아이돌|걸그룹|보이그룹|가수|배우|탤런트|개그맨|개그우먼|아나운서|방송인|유명인|톱스타|셀럽)/i;

/**
 * 상업용 부동산(CRE) 및 자산가 뉴스레터 품격에 맞지 않는 연예·가십·사건사고 노이즈 기사를 차단한다.
 * (예: "유명 여가수 200억짜리 집 경매 나왔다" 등 가십성 경매/사생활 기사 차단)
 */
export function isCreRelevantArticle(item: {
  title?: string | null;
  summary?: string | null;
  topic?: string | null;
}): boolean {
  const title = String(item.title ?? "").trim();
  const summary = String(item.summary ?? "").trim();
  const combined = `${title} ${summary}`.trim();
  if (!title) return false;

  if (CELEBRITY_HOME_GOSSIP_RE.test(combined)) {
    return false;
  }
  if (NON_CRE_GOSSIP_RE.test(combined)) {
    return false;
  }
  return true;
}

export interface CuratedChannelNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url?: string;
  sentiment: "bullish" | "bearish" | "neutral";
  importance_score: number;
  topic: string;
  channel: SpecificNewsChannelId;
  created_at?: string;
  /** 카드뉴스 포스트잇 전용 편집 제목 (36자 이내, 완결된 명사구) */
  cardTitle?: string;
  /** 카드뉴스 포스트잇 전용 편집 해설 (48자 이내, 완결된 1문장) */
  cardBrief?: string;
}

export type NewsPoolItem = {
  id?: string;
  title: string;
  /** 카드뉴스 포스트잇 전용 편집 제목 (36자 이내) — 있으면 title 대신 우선 사용 */
  cardTitle?: string;
  /** 카드뉴스 포스트잇 전용 편집 해설 (48자 이내) — 있으면 summary 대신 우선 사용 */
  cardBrief?: string;
  summary?: string;
  source?: string;
  url?: string;
  sentiment?: string;
  importance_score?: number;
  topic?: string;
  channel?: string;
};

/**
 * 다채널 RSS 피드 정의 (서버 수집기·온디맨드 채널 새로고침 공용)
 */
export interface ChannelRssFeedSpec {
  name: string;
  url: string;
  channel: SpecificNewsChannelId;
  defaultTopic: string;
  baseScore: number;
}

export const MULTI_CHANNEL_RSS_FEEDS: readonly ChannelRssFeedSpec[] = [
  // 1. 부동산·빌딩
  { name: "한국경제 부동산", url: "https://www.hankyung.com/feed/realestate", channel: "real_estate", defaultTopic: "market_trend", baseScore: 8 },
  { name: "매일경제 부동산", url: "https://www.mk.co.kr/rss/50300009/", channel: "real_estate", defaultTopic: "market_trend", baseScore: 8 },
  { name: "서울경제 부동산", url: "https://www.sedaily.com/RSS/RealEstate", channel: "real_estate", defaultTopic: "transaction", baseScore: 8 },
  // 2. 경제·금리·금융
  { name: "한국경제 경제·금융", url: "https://www.hankyung.com/feed/economy", channel: "economy_finance", defaultTopic: "economy", baseScore: 8 },
  { name: "매일경제 경제", url: "https://www.mk.co.kr/rss/30100041/", channel: "economy_finance", defaultTopic: "finance", baseScore: 8 },
  { name: "서울경제 경제·금융", url: "https://www.sedaily.com/RSS/Economy", channel: "economy_finance", defaultTopic: "finance", baseScore: 7 },
  // 3. 문화·예술·라이프
  { name: "한국경제 문화·아르떼", url: "https://www.hankyung.com/feed/life", channel: "culture_lifestyle", defaultTopic: "culture", baseScore: 8 },
  { name: "매일경제 문화·라이프", url: "https://www.mk.co.kr/rss/30000023/", channel: "culture_lifestyle", defaultTopic: "lifestyle", baseScore: 7 },
  { name: "서울경제 문화·라이프", url: "https://www.sedaily.com/RSS/Culture", channel: "culture_lifestyle", defaultTopic: "culture", baseScore: 7 },
] as const;

/**
 * 채널별 네이버/구글 뉴스 실시간 검색 키워드 프리셋
 */
export const CHANNEL_SEARCH_QUERIES: Readonly<Record<SpecificNewsChannelId, readonly { query: string; topic: string; score: number }[]>> = {
  real_estate: [
    { query: "꼬마빌딩 매매 실거래", topic: "transaction", score: 9 },
    { query: "상업용부동산 오피스 임대 공실", topic: "rental", score: 8 },
    { query: "서울 역세권 지구단위계획 개발", topic: "development", score: 8 },
  ],
  economy_finance: [
    { query: "한국은행 기준금리 부동산 대출", topic: "finance", score: 9 },
    { query: "시중은행 기업대출 담보대출 금리", topic: "rate", score: 8 },
    { query: "거시경제 환율 금리 자산시장 전망", topic: "economy", score: 8 },
  ],
  tax_wealth: [
    { query: "꼬마빌딩 증여 상속세 절세", topic: "tax", score: 9 },
    { query: "상업용부동산 양도소득세 장기보유특별공제", topic: "wealth", score: 8 },
    { query: "부동산 가족법인 가업승계 세무", topic: "inheritance", score: 8 },
  ],
  culture_lifestyle: [
    { query: "미술품 경매 전시회 아트테크", topic: "art", score: 8 },
    { query: "건축 디자인 공간 리모델링 트렌드", topic: "architecture", score: 8 },
    { query: "프리미엄 라이프스타일 클래식 웰니스 골프", topic: "culture", score: 7 },
  ],
  commercial_trend: [
    { query: "성수 한남 강남 상권 팝업스토어 리테일", topic: "commercial_trend", score: 8 },
    { query: "꼬마빌딩 우량 임차인 병의원 프랜차이즈 입점", topic: "retail", score: 8 },
    { query: "F&B 카페 베이커리 공간 트렌드", topic: "fnb", score: 7 },
  ],
};

/**
 * 기본 제공되는 5대 채널 엄선 큐레이션 풀 (오프라인·초기 진입·채널 보강용)
 * - 원문에 없는 허구 통계 수치를 배제하고, 실제 시장 원리·제도·트렌드 팩트와 중개인 시사점으로 구성
 */
export const CURATED_CHANNEL_POOL: readonly CuratedChannelNewsItem[] = [
  // ── 🏢 부동산·빌딩 ──
  {
    id: "curated-re-1",
    title: "역세권 중소형 빌딩, 회사 사옥이나 안정적 임대용으로 찾는 매수자 늘어",
    cardTitle: "역세권 알짜 빌딩, 실사용과 안정 임대 찾는 매수자 늘어",
    cardBrief: "단순 월세 수익률보다 세입자 계약 상태와 건물 수리 여건을 따져 고르면 가치가 오래갑니다.",
    summary:
      "강남·성수·마포 역세권 빌딩에 법인 사옥 겸 임대용 매수 문의가 모이고 있습니다. 당장의 단순 월세 수익률보다 기존 세입자 계약 조건과 건물 수리 여건을 함께 챙기시면 좋습니다.",
    source: "한경 부동산·CRE 리포트",
    url: "https://www.hankyung.com/realestate",
    sentiment: "bullish",
    importance_score: 9,
    topic: "transaction",
    channel: "real_estate",
  },
  {
    id: "curated-re-2",
    title: "역세권 개발 규제가 풀리며 중소형 빌딩 증축·신축 기대감 커져",
    cardTitle: "역세권 건축 규제 완화, 노후 빌딩 증축 기대감 커져",
    cardBrief: "모퉁이에 접한 넓은 땅의 건물은 나중에 건물을 새로 짓거나 증축할 때 값을 더 받기 쉽습니다.",
    summary:
      "노후 상업지역의 건축 기준이 유연해지면서 오래된 빌딩을 새로 짓거나 고쳐 쓰려는 검토가 활발합니다. 특히 모퉁이 대지 지분이 넓은 건물은 향후 재건축 가치가 커집니다.",
    source: "매일경제 부동산",
    url: "https://www.mk.co.kr/news/realestate/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "development",
    channel: "real_estate",
  },
  {
    id: "curated-re-3",
    title: "오피스·상가 빌딩 임대 시장, 튼튼한 세입자 장기 계약 여부가 건물 가치 갈라",
    cardTitle: "빌딩 월세 시장, 튼튼한 세입자의 장기 계약이 가치 결정",
    cardBrief: "역과 가깝고 엘리베이터가 잘 갖춰진 건물일수록 우량 세입자가 오래 남아 공실 걱정이 적습니다.",
    summary:
      "관리비 부담이 늘면서 입지가 좋고 승강기 등 설비가 편한 건물로 세입자가 모이고 있습니다. 세입자 업종이 탄탄하고 계약 기간이 넉넉한지 확인하시면 매수 후 공실 걱정이 줄어듭니다.",
    source: "서울경제 부동산",
    url: "https://www.sedaily.com/NewsList/GB01",
    sentiment: "neutral",
    importance_score: 8,
    topic: "rental",
    channel: "real_estate",
  },

  // ── 📈 경제·금리·금융 ──
  {
    id: "curated-eco-1",
    title: "기준금리 인하 논의 속 시중은행 빌딩 담보대출 이자 조건 점차 완화",
    cardTitle: "시중은행 빌딩 담보대출 금리 완화, 매수 이자 부담 줄어드나",
    cardBrief: "대출 이자가 내려가면 내 돈 대비 실제 남는 수익이 커져 매수를 결정하기가 한결 수월해집니다.",
    summary:
      "기준금리 인하 기대와 함께 우량 빌딩의 은행 담보대출 조건이 점차 나아지고 있습니다. 대출 이자 부담이 줄면 매달 들어오는 월세 중 실제로 남는 수익이 그만큼 커집니다.",
    source: "한국경제 금융·거시",
    url: "https://www.hankyung.com/economy",
    sentiment: "bullish",
    importance_score: 9,
    topic: "finance",
    channel: "economy_finance",
  },
  {
    id: "curated-eco-2",
    title: "주식·금융 시장 흔들릴수록 자산가들은 도심 월세 나오는 빌딩 선호",
    cardTitle: "금융시장 출렁일수록 도심 알짜 빌딩으로 모이는 시중 자금",
    cardBrief: "주가 변동과 달리 도심 실물 건물은 물가를 따라가며 매달 꾸준한 월세 수입을 기대할 수 있습니다.",
    summary:
      "주식이나 채권 시장의 등락이 커지면서 자산가들이 서울 도심 중소형 빌딩에 다시 관심을 두고 있습니다. 실물 자산은 인플레이션을 방어하며 안정적인 현금 흐름을 지켜 줍니다.",
    source: "매경 이코노미·금융",
    url: "https://www.mk.co.kr/news/economy/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "economy",
    channel: "economy_finance",
  },
  {
    id: "curated-eco-3",
    title: "은행 한도 부족할 때 담보신탁·대출 갈아타기로 빌딩 매수 자금 마련",
    cardTitle: "대출 갈아타기와 담보신탁, 빌딩 매수 자금 마련 길 넓어져",
    cardBrief: "내 자금 사정에 맞춰 무리 없는 대출 비중을 정해 두면 이자 부담을 줄이고 매수 협상도 유리해집니다.",
    summary:
      "단순 담보대출 한도를 보완하기 위해 신탁 활용이나 기존 대출 갈아타기 상담이 늘고 있습니다. 내 현금 여력에 맞는 안전한 대출 비율을 먼저 잡아 두시는 것이 중요합니다.",
    source: "서울경제 금융",
    url: "https://www.sedaily.com/NewsList/GC01",
    sentiment: "neutral",
    importance_score: 7,
    topic: "finance",
    channel: "economy_finance",
  },

  // ── ⚖️ 절세·상속·자산관리 ──
  {
    id: "curated-tax-1",
    title: "꼬마빌딩 자녀 증여·상속 시 국세청 감정평가 확대에 따른 사전 점검 필수",
    cardTitle: "빌딩 자녀 증여·상속 전, 감정평가 먼저 꼭 따져봐야 할 때",
    cardBrief: "실거래 시세 기준으로 세금을 매기는 경우가 늘어 대출을 함께 넘기는 증여 방식과 비교해야 합니다.",
    summary:
      "상가·빌딩 상속이나 증여 시 국세청이 시가 기준으로 감정평가해 세금을 매기는 사례가 늘었습니다. 보증금과 대출을 함께 넘기는 방식과 매각 후 증여 중 유리한 쪽을 먼저 비교해 보세요.",
    source: "한경 자산관리·세무",
    url: "https://www.hankyung.com/economy",
    sentiment: "neutral",
    importance_score: 9,
    topic: "tax",
    channel: "tax_wealth",
  },
  {
    id: "curated-tax-2",
    title: "개인 명의 vs 가족법인 명의 빌딩 매수, 세금 부담 차이 꼼꼼히 따져봐야",
    cardTitle: "내 이름 vs 가족법인 빌딩 매수, 어떤 쪽 세금이 더 유리할까",
    cardBrief: "보유 중 월세 소득세와 나중에 팔 때 세금, 자녀 승계까지 전체 세금 차이를 먼저 계산해야 합니다.",
    summary:
      "월세 소득이 높거나 자녀에게 천천히 물려주려는 분들이 가족법인으로 빌딩을 사는 방법을 검토합니다. 지역에 따라 취득세 중과 예외 여부가 다르므로 계약 전 세무사 확인이 좋습니다.",
    source: "매경 세무·PB 칼럼",
    url: "https://www.mk.co.kr/news/economy/",
    sentiment: "neutral",
    importance_score: 8,
    topic: "wealth",
    channel: "tax_wealth",
  },
  {
    id: "curated-tax-3",
    title: "상가·주택 함께 있는 겸용주택 빌딩, 용도변경 전 양도세 기준 확인 중요",
    cardTitle: "상가·주택 겸용 빌딩, 고치거나 팔 때 양도세 먼저 살핀다",
    cardBrief: "서류상 용도와 실제 쓰는 모습이 다르면 세금이 크게 달라지니 옛 공사비 영수증도 꼭 챙겨야 합니다.",
    summary:
      "상가와 주택이 섞인 건물은 등기부상 용도와 실제 사용 현황에 따라 양도소득세가 달라집니다. 예전에 건물 고치며 쓴 세금계산서를 잘 모아 두셔야 나중에 양도세를 아낄 수 있습니다.",
    source: "국세·자산관리 브리핑",
    url: "https://www.sedaily.com/NewsList/GB01",
    sentiment: "neutral",
    importance_score: 8,
    topic: "inheritance",
    channel: "tax_wealth",
  },

  // ── 🎨 문화·예술·라이프 ──
  {
    id: "curated-cul-1",
    title: "도심 빌딩 로비에 미술품 전시, 건물 품격 높이고 세금 혜택도 챙겨",
    cardTitle: "빌딩 로비에 미술품 전시하면 건물 품격과 절세 모두 챙긴다",
    cardBrief: "출입구 로비를 갤러리처럼 깔끔하게 꾸미면 우량 세입자 선호도가 높아지고 비용 처리 혜택도 큽니다.",
    summary:
      "도심 빌딩 로비에 미술 작품을 전시해 건물 품격을 높이는 건물주가 늘고 있습니다. 방문객 인상이 좋아질 뿐 아니라 법인·사업자 비용 처리 혜택까지 함께 챙길 수 있습니다.",
    source: "한경 아르떼(Arte)·문화",
    url: "https://www.hankyung.com/life",
    sentiment: "bullish",
    importance_score: 8,
    topic: "art",
    channel: "culture_lifestyle",
  },
  {
    id: "curated-cul-2",
    title: "붉은 벽돌과 햇볕 드는 마당, 오래된 골목 건물을 명소로 바꾸는 외관 수리",
    cardTitle: "벽돌 외관과 마당 손본 오래된 건물, 골목 명소로 값어치 껑충",
    cardBrief: "큰 신축 비용을 들이지 않고 외관과 1층 출입구만 감각적으로 고쳐도 월세 수준이 눈에 띄게 올라갑니다.",
    summary:
      "낡은 외벽을 붉은 벽돌과 큰 창으로 손보고 채광을 살린 골목 건물이 큰 인기를 끌고 있습니다. 큰돈 들여 새로 짓지 않고 외관만 잘 다듬어도 이면도로 건물 임대료가 올라갑니다.",
    source: "문화·건축 디자인 저널",
    url: "https://www.mk.co.kr/news/culture/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "architecture",
    channel: "culture_lifestyle",
  },
  {
    id: "curated-cul-3",
    title: "여유 있는 어르신 자산가의 건강한 일상, 정기 건강관리·클래식 공연·미식 인기",
    cardTitle: "여유 있는 건물주 자산가, 건강관리·공연·미식 여가 관심 높아져",
    cardBrief: "건물 임대 관리는 번거롭지 않게 맡기고 건강한 일상과 문화생활을 누리려는 자산가가 늘고 있습니다.",
    summary:
      "활동적인 시니어 자산가들 사이에서 정기 건강검진과 클래식 공연, 계절 미식 기행에 대한 관심이 높습니다. 번거로운 관리 부담이 적은 알짜 빌딩이 여가 시간을 지켜 줍니다.",
    source: "서경 라이프·웰니스",
    url: "https://www.sedaily.com/NewsList/GH01",
    sentiment: "neutral",
    importance_score: 7,
    topic: "lifestyle",
    channel: "culture_lifestyle",
  },

  // ── ☕ 상권·트렌드·교양 ──
  {
    id: "curated-trd-1",
    title: "성수·한남·청담 골목 상권, 유명 브랜드 체험 매장이 단독 건물 통째로 빌려",
    cardTitle: "성수·한남 골목 상권, 유명 브랜드가 건물 통째로 빌리는 흐름",
    cardBrief: "천장이 높고 바깥에서 잘 보이는 1~2층 상가 건물은 행사 대관과 장기 임대 수요가 꾸준히 높습니다.",
    summary:
      "유명 패션·화장품 브랜드들이 골목 상권 단독 건물을 통째로 빌려 체험 매장으로 꾸미고 있습니다. 천장이 높고 전면 노출이 좋은 1~2층 건물은 안정적인 고수익 임대가 유리합니다.",
    source: "매경 유통·상권 트렌드",
    url: "https://www.mk.co.kr/news/business/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "commercial_trend",
    channel: "commercial_trend",
  },
  {
    id: "curated-trd-2",
    title: "건물주가 가장 반기는 불황 없는 세입자, 병의원·치과와 대형 베이커리 카페",
    cardTitle: "경기 덜 타는 최고 인기 세입자, 동네 병의원과 대형 카페",
    cardBrief: "건강 관리 수요로 역세권 건물의 병원·약국 임차는 한 번 들어오면 오래 남아 월세가 밀리지 않습니다.",
    summary:
      "고령화와 건강 관심 증가로 역세권 빌딩에 피부과·치과·약국이 오래 자리 잡는 경우가 많습니다. 근린생활시설 용도와 넓은 엘리베이터가 갖춰진 건물의 가치가 특히 높습니다.",
    source: "한경 상권·리테일 분석",
    url: "https://www.hankyung.com/economy",
    sentiment: "bullish",
    importance_score: 8,
    topic: "retail",
    channel: "commercial_trend",
  },
  {
    id: "curated-trd-3",
    title: "모바일로 실거래가와 월세 수지를 한눈에 보는 똑똑한 빌딩 관리 시대",
    cardTitle: "복잡한 건물 관리, 이제 휴대폰으로 시세와 월세 바로 확인",
    cardBrief: "어려운 서류를 일일이 뒤지지 않아도 모바일로 주변 거래 시세와 내 건물 수익을 바로 살필 수 있습니다.",
    summary:
      "주변 실거래 시세와 월세 수지 계산을 모바일 화면으로 바로 받아보는 서비스가 자리 잡고 있습니다. 정기 소식지로 내 빌딩의 적정 시세와 주변 흐름을 편하게 챙기실 수 있습니다.",
    source: "테크·비즈니스 인사이트",
    url: "https://www.sedaily.com/NewsList/GD01",
    sentiment: "neutral",
    importance_score: 7,
    topic: "tech",
    channel: "commercial_trend",
  },
] as const;

const TOPIC_TO_CHANNEL: Readonly<Record<string, SpecificNewsChannelId>> = {
  // 부동산·빌딩
  transaction: "real_estate",
  market_trend: "real_estate",
  rental: "real_estate",
  development: "real_estate",
  regulation: "real_estate",
  policy: "real_estate",
  auction: "real_estate",
  deal: "real_estate",
  rent: "real_estate",
  vacancy: "real_estate",
  price: "real_estate",
  supply: "real_estate",
  redevelopment: "real_estate",
  office: "real_estate",
  logistics: "real_estate",
  hotel: "real_estate",
  land: "real_estate",
  // 경제·금리·금융
  finance: "economy_finance",
  economy: "economy_finance",
  macro: "economy_finance",
  rate: "economy_finance",
  rates: "economy_finance",
  interest_rate: "economy_finance",
  loan: "economy_finance",
  investment: "economy_finance",
  // 절세·상속·자산관리
  tax: "tax_wealth",
  inheritance: "tax_wealth",
  wealth: "tax_wealth",
  gift_tax: "tax_wealth",
  legal: "tax_wealth",
  // 문화·예술·라이프
  culture: "culture_lifestyle",
  lifestyle: "culture_lifestyle",
  art: "culture_lifestyle",
  architecture: "culture_lifestyle",
  wellness: "culture_lifestyle",
  golf: "culture_lifestyle",
  // 상권·트렌드·교양
  commercial_trend: "commercial_trend",
  retail: "commercial_trend",
  fnb: "commercial_trend",
  brand: "commercial_trend",
  tech: "commercial_trend",
};

const CULTURE_RE = /미술|전시|갤러리|박물관|경매.*작품|아트|아르떼|건축\s*디자인|클래식|공연|오페라|콘서트|와인|미식|골프|웰니스|건강|여행|인문|라이프/;
const TAX_RE = /세무|절세|상속|증여|양도세|양도소득|종부세|종합부동산세|취득세|가업승계|가족법인|감정평가.*과세|부담부증여|세법/;
const COMMERCIAL_RE = /상권|팝업|플래그십|핫플레이스|리테일|F&B|프랜차이즈|카페|베이커리|병의원|메디컬\s*임차|성수동.*브랜드|한남동.*브랜드|유통|프롭테크/;
const ECONOMY_RE = /기준금리|한국은행|금통위|연준|Fed|환율|채권|국채|물가|인플레이션|GDP|거시경제|담보대출\s*금리|금융시장|자산배분/;

/**
 * 개별 뉴스 아이템의 채널 분류 판별 (명시적 channel → 키워드 정밀 매칭 → topic 매핑 → 기본 real_estate)
 */
export function resolveNewsChannel(item: {
  channel?: string | null;
  topic?: string | null;
  title?: string | null;
  summary?: string | null;
  source?: string | null;
}): SpecificNewsChannelId {
  const rawChannel = (item.channel ?? "").trim() as SpecificNewsChannelId;
  if (
    rawChannel === "real_estate" ||
    rawChannel === "economy_finance" ||
    rawChannel === "tax_wealth" ||
    rawChannel === "culture_lifestyle" ||
    rawChannel === "commercial_trend"
  ) {
    return rawChannel;
  }

  const rawTopic = (item.topic ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const text = `${item.title ?? ""} ${item.summary ?? ""} ${item.source ?? ""}`;

  // 텍스트에 명확한 비부동산(문화·세무·상권·거시경제) 시그널이 있으면 우선 분류
  if (CULTURE_RE.test(text)) return "culture_lifestyle";
  if (TAX_RE.test(text)) return "tax_wealth";
  if (COMMERCIAL_RE.test(text) && rawTopic !== "transaction") return "commercial_trend";

  if (rawTopic && TOPIC_TO_CHANNEL[rawTopic]) {
    // 단, market_trend 나 general 처럼 포괄적인 토픽인데 금리/거시경제 키워드가 강하면 economy_finance 로 분류
    if ((rawTopic === "market_trend" || rawTopic === "general") && ECONOMY_RE.test(text)) {
      return "economy_finance";
    }
    return TOPIC_TO_CHANNEL[rawTopic];
  }

  if (ECONOMY_RE.test(text)) return "economy_finance";
  return "real_estate";
}

export function getChannelMeta(channelId: string | null | undefined): NewsChannelMeta {
  const key = (channelId ?? "real_estate") as NewsChannelId;
  return NEWS_CHANNEL_MAP[key] ?? NEWS_CHANNEL_MAP.real_estate;
}

/**
 * 기존 후보 목록(DB + 저장 스냅샷)에 5대 채널 기본 큐레이션 풀을 병합하여
 * 어느 채널 탭을 눌러도 최소 3건 이상의 고품질 최신/엄선 기사가 노출되도록 보장한다.
 */
export function enrichNewsPoolWithChannels<
  T extends { id?: string; title: string } = CuratedChannelNewsItem
>(
  existingNews: readonly T[],
  includeCuratedFallback = true,
): Array<(T | CuratedChannelNewsItem) & { channel: SpecificNewsChannelId }> {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const out: Array<(T | CuratedChannelNewsItem) & { channel: SpecificNewsChannelId }> = [];

  for (const item of existingNews) {
    const id = String(item.id ?? item.title ?? "").trim();
    const normTitle = String(item.title ?? "").replace(/^\[.*?\]\s*/, "").trim();
    if (!id || !normTitle) continue;
    if (!isCreRelevantArticle(item as { title?: string; summary?: string; topic?: string })) continue;
    if (seenIds.has(id) || seenTitles.has(normTitle)) continue;
    seenIds.add(id);
    seenTitles.add(normTitle);
    const channel = resolveNewsChannel(item as Record<string, unknown>);
    out.push({ ...item, channel });
  }

  if (includeCuratedFallback) {
    for (const curated of CURATED_CHANNEL_POOL) {
      const normTitle = curated.title.replace(/^\[.*?\]\s*/, "").trim();
      if (seenIds.has(curated.id) || seenTitles.has(normTitle)) continue;
      seenIds.add(curated.id);
      seenTitles.add(normTitle);
      out.push({ ...curated, channel: curated.channel });
    }
  }

  return out;
}

/**
 * 매수자 관심 황금배합 자동 선별
 * - maxCount === 6 (상세 모드 기본): 부동산 2 + 경제·금리 1 + 절세·상속 1 + 문화·라이프 1 + 상권·트렌드 1
 * - maxCount === 3 (간단 모드 기본): 부동산 1 + 경제/절세 1 + 문화/상권 1
 */
export function recommendBalancedNewsMix(
  items: readonly { id?: string; title: string; channel?: string | null; topic?: string | null; summary?: string | null; importance_score?: number }[],
  maxCount = 6,
): string[] {
  if (items.length === 0 || maxCount <= 0) return [];

  const buckets: Record<SpecificNewsChannelId, string[]> = {
    real_estate: [],
    economy_finance: [],
    tax_wealth: [],
    culture_lifestyle: [],
    commercial_trend: [],
  };

  const sorted = [...items].sort((a, b) => (b.importance_score ?? 5) - (a.importance_score ?? 5));
  for (const item of sorted) {
    const id = String(item.id ?? item.title ?? "").trim();
    if (!id) continue;
    const ch = resolveNewsChannel(item);
    buckets[ch].push(id);
  }

  const picked: string[] = [];
  const pickedSet = new Set<string>();
  const tryPick = (ch: SpecificNewsChannelId) => {
    const list = buckets[ch];
    while (list.length > 0) {
      const next = list.shift()!;
      if (!pickedSet.has(next)) {
        pickedSet.add(next);
        picked.push(next);
        return true;
      }
    }
    return false;
  };

  const targetOrder: SpecificNewsChannelId[] =
    maxCount <= 3
      ? ["real_estate", "economy_finance", "culture_lifestyle", "tax_wealth", "commercial_trend"]
      : [
          "real_estate",
          "economy_finance",
          "tax_wealth",
          "culture_lifestyle",
          "commercial_trend",
          "real_estate",
        ];

  for (const ch of targetOrder) {
    if (picked.length >= maxCount) break;
    tryPick(ch);
  }

  // 아직 부족하면 중요도 순으로 나머지 채움
  for (const item of sorted) {
    if (picked.length >= maxCount) break;
    const id = String(item.id ?? item.title ?? "").trim();
    if (id && !pickedSet.has(id)) {
      pickedSet.add(id);
      picked.push(id);
    }
  }

  return picked;
}
