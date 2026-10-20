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
}

export type NewsPoolItem = {
  id?: string;
  title: string;
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
    title: "역세권 꼬마빌딩, 수익률보다 '사옥 실수요·리모델링 밸류애드' 중심으로 매수세 재편",
    summary:
      "핵심 팩트: 강남·성수·마포 등 주요 업무권역 인근 이면도로 빌딩에 IT·메디컬·전문직 법인의 사옥 겸 임대 목적 매수 문의가 집중되고 있습니다. | 브로커 임플리케이션: 단순 표면 임대수익률보다 명도 가능 여부와 외관·엘리베이터 신설을 통한 가치 상승 여력이 거래 성사를 좌우합니다. | 추천 액션: 노후 근생 건물 매도 시 리모델링 전후 예상 평면과 사옥 활용 포인트를 함께 제시하세요.",
    source: "한경 부동산·CRE 리포트",
    url: "https://www.hankyung.com/realestate",
    sentiment: "bullish",
    importance_score: 9,
    topic: "transaction",
    channel: "real_estate",
  },
  {
    id: "curated-re-2",
    title: "서울시 지구단위계획 및 역세권 활성화 사업 확대로 중소형 빌딩 용적률 상향 기대감",
    summary:
      "핵심 팩트: 노후 상업·준주거지역 및 주요 간선도로변의 도시계획 유연화 기조에 따라 대지 활용도를 높이는 신축·증축 검토가 활발해졌습니다. | 브로커 임플리케이션: 토지 지분 가치가 높은 저층 건물이나 코너 필지는 개발 포스처 매수자에게 프리미엄 소구가 가능합니다. | 추천 액션: 보유 매물의 용도지역과 전면 도로 폭을 재점검하여 개발 잠재력 브리핑을 준비하세요.",
    source: "매일경제 부동산",
    url: "https://www.mk.co.kr/news/realestate/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "development",
    channel: "real_estate",
  },
  {
    id: "curated-re-3",
    title: "중소형 오피스·근생 임대 시장, '우량 임차인 장기 계약' 여부에 따른 건물 가치 양극화",
    summary:
      "핵심 팩트: 임차인의 관리비 부담과 인테리어 초기 비용이 커지면서 입지·주차·승강기 여건이 우수한 건물로 임차 수요가 빠르게 쏠리고 있습니다. | 브로커 임플리케이션: 공실 리스크를 줄이려면 렌트롤의 임차인 업종 건전성과 잔여 계약기간(WALE) 관리가 필수적입니다. | 추천 액션: 매수 고객에게 층별 임차인 구성과 주변 동종 건물 대비 임대 경쟁력을 명확히 설명하세요.",
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
    title: "통화정책 전환기 진입에 따른 시중은행 기업·빌딩 담보대출 금리 스프레드 점검",
    summary:
      "핵심 팩트: 국내외 기준금리 인하 사이클 논의가 본격화되면서 우량 담보물건에 대한 금융권의 기업시설자금 대출 취급 조건이 점진적으로 완화되는 추세입니다. | 브로커 임플리케이션: 조달 금리가 낮아지면 자기자본수익률(CoC)이 즉각 개선되어 관망하던 매수 대기자의 의사결정이 빨라집니다. | 추천 액션: 매수 희망 고객에게 금리 변동에 따른 월 이자 부담 변화를 수지분석 계산기로 시뮬레이션해 드리세요.",
    source: "한국경제 금융·거시",
    url: "https://www.hankyung.com/economy",
    sentiment: "bullish",
    importance_score: 9,
    topic: "finance",
    channel: "economy_finance",
  },
  {
    id: "curated-eco-2",
    title: "글로벌 자산시장 변동성 확대 속 고액자산가의 '도심 실물 수익형 부동산' 선호 지속",
    summary:
      "핵심 팩트: 금융시장의 단기 변동성이 커질수록 프라이빗뱅킹(PB) 센터 고객들은 현금흐름이 발생하는 서울 핵심지 중소형 빌딩을 안전자산 축으로 편입하고 있습니다. | 브로커 임플리케이션: 주식·채권 대비 실물 빌딩의 인플레이션 헤지 기능과 안정적인 임대 배당 매력이 다시 부각되고 있습니다. | 추천 액션: 금융자산 비중이 높은 고객에게 도심 우량 입지 빌딩의 장기 가치 보존 사례를 안내하세요.",
    source: "매경 이코노미·금융",
    url: "https://www.mk.co.kr/news/economy/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "economy",
    channel: "economy_finance",
  },
  {
    id: "curated-eco-3",
    title: "신탁 방식 및 프로젝트 리파이낸싱 활용, 중소형 빌딩 매수·개발 자금 조달 해법 부상",
    summary:
      "핵심 팩트: 단순 담보대출 한도를 보완하기 위해 담보신탁·관리형 토지신탁 및 법인 크레딧을 결합한 구조화 금융 상담이 늘고 있습니다. | 브로커 임플리케이션: 매수자의 자기자본 규모에 맞춰 최적의 레버리지 비율을 안내하면 거래 성사 가능성을 크게 높일 수 있습니다. | 추천 액션: 제1금융권 기업금융 지점 및 신탁사 조건을 사전 파악해 매수자 브리핑에 활용하세요.",
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
    title: "꼬마빌딩 증여·상속 시 국세청 감정평가 사업 확대… '사전 감정평가와 부담부증여' 비교 필수",
    summary:
      "핵심 팩트: 비주거용 부동산(꼬마빌딩·상가)의 상속·증여 시 기준시가 대신 시가(감정평가액) 과세 원칙이 강화되면서 사전 감정평가 전략이 핵심 화두로 떠올랐습니다. | 브로커 임플리케이션: 건물주 고객에게 단순 매각뿐 아니라 임대보증금·대출을 승계하는 부담부증여와 매각 후 현금 증여의 실익 비교가 좋은 상담 물꼬가 됩니다. | 추천 액션: 장기 보유 건물주에게 세대 전환(증여·매각) 체크포인트를 안부 인사와 함께 전해 보세요.",
    source: "한경 자산관리·세무",
    url: "https://www.hankyung.com/economy",
    sentiment: "neutral",
    importance_score: 9,
    topic: "tax",
    channel: "tax_wealth",
  },
  {
    id: "curated-tax-2",
    title: "개인 명의 vs 가족법인 명의 빌딩 매수, 취득·보유·양도 단계별 세무 유불리 핵심 점검",
    summary:
      "핵심 팩트: 소득세 최고세율 구간에 있는 전문직·CEO 매수자들은 임대소득 분산과 향후 지분 승계를 고려해 가족법인 설립 및 법인 매수를 적극 검토하고 있습니다. | 브로커 임플리케이션: 과밀억제권역 중과세 예외 업종이나 신축·임대 조건 등을 미리 안내하면 중개사의 전문성 신뢰도가 크게 올라갑니다. | 추천 액션: 법인 매수 검토 고객에게는 계약 전 세무사 사전 검토 체크리스트를 함께 안내하세요.",
    source: "매경 세무·PB 칼럼",
    url: "https://www.mk.co.kr/news/economy/",
    sentiment: "neutral",
    importance_score: 8,
    topic: "wealth",
    channel: "tax_wealth",
  },
  {
    id: "curated-tax-3",
    title: "상가·겸용주택 리모델링 및 용도변경 시 양도소득세·부가가치세 절세 체크포인트",
    summary:
      "핵심 팩트: 상가와 주택이 혼합된 근생 건물을 매매하거나 용도변경할 때는 공부상 용도와 실제 사용 현황에 따라 양도세 비과세 및 장기보유특별공제 적용이 달라집니다. | 브로커 임플리케이션: 잔금 전 용도변경 특약이나 자본적 지출(엘리베이터·외벽 공사) 증빙 보관이 매도자의 실수령액을 크게 좌우합니다. | 추천 액션: 매도 의뢰 건물주에게 공사 세금계산서 보관 여부와 층별 실제 용도를 미리 확인해 두세요.",
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
    title: "도심 빌딩 로비와 갤러리의 만남… 자산가들이 주목하는 '아트테크·프라이빗 전시' 트렌드",
    summary:
      "핵심 팩트: 국내 주요 미술품 경매와 아트페어에 기업인·건물주 컬렉터의 참여가 늘면서, 중소형 사옥 1층이나 라운지에 미술품을 전시해 건물 품격을 높이는 사례가 확산되고 있습니다. | 브로커 임플리케이션: 법인 문화접대비·업무용 미술품 손금산입 혜택과 공간 브랜딩이 결합되어 사옥 매수 고객과의 품격 있는 대화 주제가 됩니다. | 추천 액션: 이번 주말 둘러보기 좋은 도심 미술관·갤러리 전시 소식을 고객 안부 메시지에 함께 담아 보세요.",
    source: "한경 아르떼(Arte)·문화",
    url: "https://www.hankyung.com/life",
    sentiment: "bullish",
    importance_score: 8,
    topic: "art",
    channel: "culture_lifestyle",
  },
  {
    id: "curated-cul-2",
    title: "'붉은 벽돌과 중정(中庭)의 미학'… 오래된 골목 건물을 명소로 바꾸는 건축·공간 디자인",
    summary:
      "핵심 팩트: 획일적인 유리 커튼월 대신 기존 건물의 시간성을 살린 벽돌 리노베이션, 테라스 조경, 자연 채광 설계가 임차인과 방문객 모두에게 큰 호응을 얻고 있습니다. | 브로커 임플리케이션: 건축가와 협업한 감각적인 외관 리모델링은 이면도로 노후 건물의 임대료를 간선도로 수준으로 끌어올리는 핵심 열쇠입니다. | 추천 액션: 리모델링 예정 매물을 소개할 때 최근 주목받는 우수 건축 리노베이션 트렌드를 함께 언급해 보세요.",
    source: "문화·건축 디자인 저널",
    url: "https://www.mk.co.kr/news/culture/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "architecture",
    channel: "culture_lifestyle",
  },
  {
    id: "curated-cul-3",
    title: "시니어 자산가의 웰니스 라이프… 프라이빗 건강관리·클래식 공연·계절 미식 기행 인기",
    summary:
      "핵심 팩트: 은퇴 후에도 왕성하게 사회·투자 활동을 이어가는 액티브 시니어 층에서 예방 의학 기반 웰니스 케어와 클래식 음악회, 제철 미식 다이닝에 대한 관심이 높습니다. | 브로커 임플리케이션: 매물 이야기만 앞세우기보다 고객의 건강과 문화적 취향을 배려하는 한 줄 인사가 장기적인 전속 중개 관계를 만듭니다. | 추천 액션: 매거진 '이번 주 한마디'에 환절기 건강 인사와 함께 문화 칼럼 기사를 1건 배치해 보세요.",
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
    title: "성수·한남·도산공원 상권, 글로벌 플래그십과 팝업스토어가 이끄는 리테일 지형 변화",
    summary:
      "핵심 팩트: 패션·뷰티·라이프스타일 브랜드들이 백화점 입점 대신 개성 있는 골목 상권의 단독 건물을 통임차해 체험형 공간으로 꾸미는 흐름이 뚜렷합니다. | 브로커 임플리케이션: 층고가 높고 전면 노출도가 좋은 저층 근생 빌딩은 팝업 및 플래그십 대관 수익으로 일반 임대 대비 높은 수익 창출이 가능합니다. | 추천 액션: 상권 내 유동인구 변화와 신규 앵커 브랜드 입점 소식을 매수 고객에게 발 빠르게 공유하세요.",
    source: "매경 유통·상권 트렌드",
    url: "https://www.mk.co.kr/news/business/",
    sentiment: "bullish",
    importance_score: 8,
    topic: "commercial_trend",
    channel: "commercial_trend",
  },
  {
    id: "curated-trd-2",
    title: "건물주가 가장 선호하는 '불황 무풍' 우량 임차인… 피부과·치과·메디컬 & 대형 베이커리 카페",
    summary:
      "핵심 팩트: 고령화와 뷰티·헬스케어 수요 증가로 역세권 중소형 빌딩에 병의원·약국·체형교정 센터 등 장기 계약을 선호하는 메디컬 임차 수요가 탄탄하게 유지되고 있습니다. | 브로커 임플리케이션: 병의원 입점이 가능한 제1종·제2종 근린생활시설 용도와 침대용/장애인 엘리베이터 스펙 여부가 건물 몸값을 결정합니다. | 추천 액션: 공실 층이 있는 건물주에게 메디컬·프랜차이즈 임차인 유치 조건을 맞춤형으로 제안해 보세요.",
    source: "한경 상권·리테일 분석",
    url: "https://www.hankyung.com/economy",
    sentiment: "bullish",
    importance_score: 8,
    topic: "retail",
    channel: "commercial_trend",
  },
  {
    id: "curated-trd-3",
    title: "AI·디지털 자산관리 도구의 진화… 빌딩 경영과 임대차 관리를 바꾸는 프롭테크 트렌드",
    summary:
      "핵심 팩트: 건축물대장·실거래가 자동 분석부터 스마트 원격 검침, 모바일 소식지 발행까지 기술이 결합되면서 중소형 빌딩 자산관리의 효율성이 크게 높아졌습니다. | 브로커 임플리케이션: 데이터에 기반한 투명한 수지분석과 정기 모바일 브리핑을 제공하는 중개사가 고액자산가 고객의 두터운 신뢰를 얻습니다. | 추천 액션: 고객에게 매거진 내 대화형 수익률 계산기와 맞춤형 딜카드 열람 기능을 안내해 보세요.",
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
