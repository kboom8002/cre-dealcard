/**
 * Mobile IM Lite — 7-Section Demo Data
 *
 * Based on im-ai-methodology.md §2 Mobile IM spec:
 * 섹션 1: 물건 개요    (SSoT asset_identity 자동)
 * 섹션 2: 입지·상권   (AI 위치 분석)
 * 섹션 3: 임대 현황   (SSoT + 보충 / 데이터 없으면 잠금)
 * 섹션 4: 수익 분석   (AI 추정 + 면책 자동첨부)
 * 섹션 5: 확인 필요   (AI 리스크 자동 도출)
 * 섹션 6: 투자 포인트 (AI 매수자 적합성 분석)
 * 섹션 7: 다음 단계   (정적 CTA)
 *
 * 3 demo buildings (from migration 00040_vibe_card_demo_seed.sql):
 * - f1111111-1111-1111-1111-111111111111 (홍길동 / 테헤란로 랜드마크 오피스)
 * - f2222222-2222-2222-2222-111111111111 (김철수 / 여의도 국제금융로 프라임)
 * - f3333333-3333-3333-3333-111111111111 (이영희 / 종로 지식산업센터)
 */

export interface MobileIMSection {
  /** e.g. "01_overview" */
  sectionId: string;
  title: string;
  icon: string;
  /** Markdown content (empty string when locked) */
  content: string;
  /** im-ai-methodology.md data source label */
  dataSource: string;
  aiRole: "auto" | "ai_generated" | "static";
  confidence?: "confirmed" | "inferred" | "needs_check";
  /** Whether this section is locked due to missing data */
  locked: boolean;
  /** Short reason shown on locked sections */
  lockedReason?: string;
  /** Per-section boundary note (attached to financial estimates) */
  boundaryNote?: string;
}

export interface MobileIMBroker {
  userId: string;
  displayName: string;
  company: string;
  phone: string;
  tagline: string;
  photoUrl: string;
  slug: string;
  vibeTemplateId: string;
  /** Vibe & professional data for VibeCardHero */
  specialtyRegions?: string[];
  specialtyAssets?: string[];
  bio?: string | null;
  vibeVector?: Record<string, number> | null;
  vibeVti?: string | null;
  vibeComplement?: Record<string, number> | null;
  vibeValence?: number | null;
  vibeTrust?: number | null;
  vibeAnalyzedAt?: string | null;
  /** Logo overlay URLs */
  logoCompanyUrl?: string | null;
  logoPartnerUrl?: string | null;
  /** Latest magazine (for card back face) */
  latestMagazine?: {
    date: string;
    headline: string;
    url: string;
    marketTemp?: string;
  } | null;
}

export interface MobileIMDocument {
  buildingId: string;
  /** 한국어 블라인드 명칭 (주소 비공개) */
  blindName: string;
  /** 실제 매물명 (브로커가 직접 공개 결정 시 사용) */
  fullName: string;
  areaSignal: string;
  assetType: string;
  priceBand: string;
  sizeSignal: string;
  completenessScore: number;
  broker: MobileIMBroker;
  sections: MobileIMSection[];
  generatedAt: string;
  status: string;
  approvedAt?: string;
  /** HANDOFF_REDACTION_RULES.always_remove 적용된 필드 목록 */
  protectedFieldsRemoved: string[];
  disclaimer: string;
  fullImUpgradeCta: {
    enabled: boolean;
    label: string;
    description: string;
  };
  /** 대표 이미지 URL (건물 외관, 항공뷰, 또는 Static Map) */
  heroImageUrl?: string;
  /** 건물 사진 갤러리 */
  photos?: Array<{
    url: string;
    type: 'exterior' | 'aerial' | 'interior' | 'lobby' | 'floor_plan' | 'map'
        | 'rooftop' | 'parking' | 'entrance' | 'corridor' | 'mechanical'
        | 'signage' | 'surroundings' | 'tenant_space';
    label: string;
    caption?: string;
    order?: number;
  }>;
  /** 건물 좌표 (Static Map 폴백용) */
  coordinates?: { lat: number; lng: number };
  /** 공공데이터 출처 목록 */
  publicDataSources?: string[];
  /** 데이터 충실도 뱃지 */
  dataQualityBadge?: {
    tier: 'verified' | 'partial' | 'reference' | 'draft';
    label: string;
    emoji: string;
    score: number;
  };
  /** [C1] Hero Card 핵심 투자 지표 */
  heroCard?: import("@/domain/building/mobile-im/types").HeroCardData;
  /** [C2] DCF 10년 민감도 분석 */
  dcf10Year?: import("@/domain/building/mobile-im/dcf-sensitivity").DCFOutputs;
  /** [C4] 자금 구조 (레버리지) */
  financials?: {
    equityRequiredBil: number | null;
    totalDepositBil: number | null;
    loanAmountBil: number | null;
    leveragedYieldPct: number | null;
    waccPct: number | null;
  };
  logistics?: {
    ceiling_height_m?: number;
    dock_count?: number;
    dock_leveler_count?: number;
    max_vehicle_ton?: number;
    floor_load_ton_m2?: number;
    cold_storage_area_pyeong?: number;
    cold_storage_type?: 'frozen' | 'chilled' | 'both' | 'none';
    loading_area_pyeong?: number;
    vehicle_access_type?: 'ramp' | 'dock' | 'both';
    fire_rating?: string;
    sprinkler?: boolean;
    column_span_m?: string;
    power_capacity_kw?: number;
    has_office_space?: boolean;
    office_area_pyeong?: number;
    distance_to_ic_km?: number;
    ic_name?: string;
  };
}

// ─── Demo Building 1: 테헤란로 랜드마크 오피스 (홍길동) ──────────────────

const HONG_GILDONG_DEMO: MobileIMDocument = {
  status: "published",
  buildingId: "f1111111-1111-1111-1111-111111111111",
  blindName: "강남구 GBD *** 오피스 빌딩",
  fullName: "테헤란로 랜드마크 오피스 빌딩",
  areaSignal: "강남구 GBD",
  assetType: "오피스 빌딩",
  priceBand: "450억",
  sizeSignal: "연면적 약 8,500㎡",
  completenessScore: 92,
  coordinates: { lat: 37.5074, lng: 127.0592 },
  photos: [
    { url: 'https://map.kakao.com/link/map/GBD오피스,37.5074,127.0592', type: 'map' as const, label: '위치 지도' },
  ],
  broker: {
    userId: "e1a12345-1234-1234-1234-123456789abc",
    displayName: "홍길동",
    company: "한국상업부동산중개",
    phone: "010-1234-5678",
    tagline: "성공적인 빌딩 매매를 위한 최적의 파트너",
    photoUrl:
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/hong-gildong.png",
    slug: "hong-gildong",
    vibeTemplateId: "CC-01",
  },
  sections: [
    {
      sectionId: "01_overview",
      title: "물건 개요",
      icon: "🏢",
      dataSource: "asset_identity",
      aiRole: "auto",
      locked: false,
      content: `**강남구 테헤란로** 소재 A급 프라임 오피스 빌딩입니다.

| 항목 | 내용 |
|------|------|
| **소재지** | 서울특별시 강남구 테헤란로 일대 (GBD) |
| **용도** | 업무시설 (오피스) |
| **연면적** | 약 8,500㎡ (약 2,571평) |
| **층수** | 지하 3층 / 지상 15층 |
| **준공연도** | 2007년 |
| **구조** | 철골철근콘크리트조 |
| **주차** | 전용주차 120대 (법정기준 충족) |
| **승강기** | 승객용 4대, 화물용 1대 |
| **매각가** | 약 450억 원 (VAT 별도) |

> 본 매물은 강남 비즈니스 지구(GBD) 핵심 입지에 위치한 완전임대 상태의 안정적 수익형 자산입니다.`,
    },
    {
      sectionId: "02_location",
      title: "입지·상권",
      icon: "📍",
      dataSource: "market_location.location_analysis",
      aiRole: "ai_generated",
      locked: false,
      content: `**강남 비즈니스 지구(GBD)** 핵심에 위치하며, 서울 3대 업무권역 중 임대 수요가 가장 활발한 지역입니다.

### 교통 접근성
- **지하철 2호선** 강남역 도보 5분 (350m)
- **지하철 9호선** 신논현역 도보 7분 (500m)
- **강남대로·테헤란로** 간선도로 인접, 주요 IC 접근 우수

### 주변 인프라
- 반경 500m 내 5성급 호텔 2개, 대형 상업시설 집중
- 주요 대기업 본사 (삼성, 현대, SK 계열사) 밀집 지역
- 강남 스타트업 생태계 중심 (GBD 오피스 수요 지속 증가)

### 시장 현황
- GBD 오피스 공실률: **3.2%** (서울 평균 7.1% 대비 현저히 낮음)
- 테헤란로 프라임 오피스 평균 실질임대료: **3.2만원/3.3㎡/월** (전년比 +4.1%)
- 인근 신규 공급 예정: 2027년까지 제한적 (공급 부족 지속 전망)`,
    },
    {
      sectionId: "03_lease",
      title: "임대 현황",
      icon: "📋",
      dataSource: "supplemental.monthly_rent + vacancy_signal",
      aiRole: "auto",
      locked: false,
      content: `현재 **완전임대(Full Occupancy)** 상태입니다.

### 임대 구성 요약
| 항목 | 내용 |
|------|------|
| **공실률** | 0% (완전임대) |
| **임차인 수** | 6개사 (기업 임차인) |
| **임대 유형** | 전층 분할임대 |
| **월 임대료 합계** | 약 1.1억 원/월 (추정) |
| **평균 임대기간** | 4.2년 |
| **WALT** | 잔여 평균 2.8년 |

### 임차인 구성 (블라인드 처리)
- 2F–5F: 국내 상장 IT 기업 (계약 잔여 3.2년)
- 6F–9F: 외국계 금융사 (계약 잔여 1.8년)
- 10F–13F: 국내 대형 법무법인 (계약 잔여 4.1년)
- 기타 (소규모): 3F, 14F

> ⚠️ 임차인명 및 호실별 임대료는 공개 제한 사항으로 실사 단계에서 공개됩니다.`,
      boundaryNote:
        "임대 현황은 제공받은 자료 기준이며, 실사 시 확인이 필요합니다.",
    },
    {
      sectionId: "04_financials",
      title: "수익 분석",
      icon: "💰",
      dataSource: "추정 (AI 계산 + 면책 자동첨부)",
      aiRole: "ai_generated",
      locked: false,
      content: `아래 수치는 **AI 추정값**으로 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.

### 수익 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **연 임대 수입** | 약 13.2억 원/년 | 추정, 확인 필요 |
| **운영 비용** | 약 1.8억 원/년 | 관리비, 세금 추정 |
| **순영업소득(NOI)** | 약 **11.4억~14.0억 원**/년 | 80% 구간 추정 |
| **Cap Rate** | **2.5%–3.1%** (구간 추정) | 매각가 450억 기준 |
| **㎡당 단가** | 약 529만 원/㎡ | 참고용 |

### 가격 밴드 참고
GBD 유사 규모 실거래(2022–2025) 기준:
- 80% 구간: **400억–510억** 원
- 중위값: 약 455억 원

> ⚠️ **면책 조항**: 상기 수익 추정치는 AI가 공개 시장 데이터를 기반으로 산출한 참고값입니다. 실제 수익은 임대차 조건, 공실률 변동, 세금 구조에 따라 현저히 다를 수 있으며, 본 자료는 투자 권유 또는 수익 보장이 아닙니다.`,
      boundaryNote:
        "AI 추정값. 실제 수익은 임대차 계약 확인 후 전문가 검토 필요.",
    },
    {
      sectionId: "05_risks",
      title: "확인 필요 사항",
      icon: "⚠️",
      dataSource: "AI 리스크 자동 도출",
      aiRole: "ai_generated",
      locked: false,
      content: `아래 사항은 **실사(DD) 과정에서 반드시 확인**이 필요한 항목입니다.

### 건물·물리적 위험
- 🔶 **준공 18년 경과**: 외벽 커튼월 유리 교체 시점 도래 예상 (비용 추정 필요)
- 🔶 **기계·전기 설비 노후화**: 공조(HVAC) 시스템 교체 주기 확인 필요
- 🔵 **에너지 등급**: 친환경 인증 부재 — ESG 매수자 관심 시 리스크 요소

### 임대차·법적 위험
- 🔶 **WALT 2.8년**: 단기 공실 전환 가능성 → 만기 임차인 재계약 현황 확인
- 🔵 **6F–9F 외국계 임차인**: 계약 잔여 1.8년, 철수 가능성 사전 확인 권장
- 🔵 **임대료 증액 조항**: 임대차계약서상 증액 한도 및 CPI 연동 여부

### 법규·인허가
- 🔵 **토지이용계획**: 추후 도시계획 변경 여부 (현재 제3종 일반주거지역 인접)
- 🔵 **석면 여부**: 2007년 준공 → 석면 조사 보고서 확인 권장

> 🔶 우선 확인 | 🔵 일반 확인`,
    },
    {
      sectionId: "06_investment",
      title: "투자 포인트",
      icon: "🎯",
      dataSource: "buyer_fit.fit_summary (DealCuriosityWriter AI)",
      aiRole: "ai_generated",
      locked: false,
      content: `본 자산의 **핵심 투자 가치**와 예상 매수자 유형 분석입니다.

### 이 건물을 사야 하는 이유

**① GBD A급 희소성 프리미엄**
테헤란로 직접 접근 가능한 A급 오피스는 연간 거래 물량이 극히 제한적입니다. 완전임대 상태로 즉시 수익 발생이 가능하며, 보유 기간 중 안정적인 현금흐름을 확보할 수 있습니다.

**② 밸류업 포텐셜**
현재 임대료 수준이 시장 대비 소폭 할인 상태로 파악됩니다. 임차인 교체 시점에 시장가 정상화 → Cap Rate 개선 여지가 존재합니다.

**③ 희소 규모 (8,500㎡)**
기관 투자자 최소 매입 기준(5,000㎡)을 충족하는 동시에, 개인 자산가 그룹 매입 가능 규모의 상한선에 해당. 경쟁 구매자 범위가 넓습니다.

### 예상 매수자 유형 (AI 분석)
| 유형 | 적합도 | 이유 |
|------|--------|------|
| **자산운용사 (임대형 펀드)** | ⭐⭐⭐⭐⭐ | 완전임대 + Cap Rate + 유동성 |
| **법인 자가사용 (사옥 매입)** | ⭐⭐⭐⭐ | GBD 브랜드 가치 + 임직원 접근성 |
| **고액 자산가 그룹** | ⭐⭐⭐ | 규모 상 협업 필요, 수익 안정성 ↑ |
| **외국계 리츠** | ⭐⭐⭐ | GBD 선호, 환율 변동 리스크 검토 필요 |`,
    },
    {
      sectionId: "07_next_steps",
      title: "다음 단계",
      icon: "🚀",
      dataSource: "정적 CTA",
      aiRole: "static",
      locked: false,
      content: `관심이 있으시다면 아래 절차로 진행해 주세요.

### 투자 진행 단계
1. **초기 관심 표명** → 담당 중개인 연락
2. **NDA 체결** → 임차인 정보 및 임대차계약서 제공
3. **현장 실사 일정 조율** → 인테리어 상태, 설비 확인
4. **LOI(투자의향서) 제출** → 가격 협의 개시
5. **법적 실사(DD)** → 법률·세무·기술 전문가 투입
6. **매매계약 체결 → 잔금 납부**

### 상세 분석이 필요하신가요?
Full IM (투자등급 정식 투자설명서)은 18개 섹션, 전문가 검토 포함 버전입니다.

> 담당 중개인 홍길동에게 연락하여 Full IM 업그레이드를 요청하세요.`,
    },
  ],
  generatedAt: new Date().toISOString(),
  protectedFieldsRemoved: [
    "tenant_phone",
    "tenant_email",
    "negotiation_floor",
    "negotiation_ceiling",
    "broker_internal_memo",
  ],
  disclaimer:
    "본 모바일 IM Lite는 제공된 정보를 바탕으로 AI가 자동 생성한 참고 자료이며, 투자 권유 또는 수익 보장이 아닙니다. 모든 수치는 추정값으로 실사 및 전문가 검토가 필요합니다. 부동산 투자에는 원금 손실 위험이 있으며, 투자 결정 전 반드시 전문가 상담을 받으시기 바랍니다. 이 자료에 포함된 임차인명, 호실별 임대료 등 민감 정보는 공개 제한 사항으로 실사 단계에서 제공됩니다. © 크리딜 (CRE DealCard) — 상업용 부동산 AI 투자설명서 플랫폼.",
  fullImUpgradeCta: {
    enabled: true,
    label: "Full IM (투자등급 정식 설명서) 업그레이드",
    description:
      "18개 섹션, 전문가 검토, 딜룸 Q&A 포함 투자등급 정식 투자설명서를 생성할 수 있습니다.",
  },
};

// ─── Demo Building 2: 여의도 국제금융로 프라임 오피스 (김철수) — 부분 잠금 ──

const KIM_CHULSOO_DEMO: MobileIMDocument = {
  status: "published",
  buildingId: "f2222222-2222-2222-2222-111111111111",
  // Photo/map data
  coordinates: { lat: 37.5256, lng: 126.9256 },
  photos: [
    { url: 'https://map.kakao.com/link/map/여의도프라임,37.5256,126.9256', type: 'map' as const, label: '위치 지도' },
  ],
  blindName: "영등포구 YBD *** 프라임 오피스 전층",
  fullName: "여의도 국제금융로 프라임 오피스 전층 임대",
  areaSignal: "영등포구 YBD",
  assetType: "프라임 오피스 (임대차)",
  priceBand: "보증금 15억 / 월 1.2억",
  sizeSignal: "전용 약 1,650㎡ (약 499평)",
  completenessScore: 78,
  broker: {
    userId: "e2b12345-1234-1234-1234-123456789abc",
    displayName: "김철수",
    company: "대박빌딩파트너스",
    phone: "010-8765-4321",
    tagline: "강남 오피스 빌딩 임대차 시장의 핵심 리더",
    photoUrl:
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/kim-chulsoo.png",
    slug: "kim-chulsoo",
    vibeTemplateId: "FC-01",
  },
  sections: [
    {
      sectionId: "01_overview",
      title: "물건 개요",
      icon: "🏢",
      dataSource: "asset_identity",
      aiRole: "auto",
      locked: false,
      content: `**여의도 YBD(금융 비즈니스 지구)** 핵심 소재 프라임 오피스 전층 임대 물건입니다.

| 항목 | 내용 |
|------|------|
| **소재지** | 서울특별시 영등포구 여의도동 일대 (YBD) |
| **용도** | 업무시설 (전층 단독 임대) |
| **전용면적** | 약 1,650㎡ (약 499평) |
| **공급면적** | 약 2,310㎡ (공용부 포함) |
| **층수** | 지하 5층 / 지상 26층 건물 중 전층 단독 계약 |
| **입주 가능일** | 2026년 9월 1일 (협의 가능) |
| **보증금** | 15억 원 |
| **월 임대료** | 1.2억 원 (VAT 별도) |
| **관리비** | 별도 (전용 관리 체계) |

> 금융권·외국계 기업 최적 입지. 전층 단독 사용으로 기업 이미지 제고 효과.`,
    },
    {
      sectionId: "02_location",
      title: "입지·상권",
      icon: "📍",
      dataSource: "market_location.location_analysis",
      aiRole: "ai_generated",
      locked: false,
      content: `**여의도 금융 비즈니스 지구(YBD)** 핵심 입지로, 국내외 금융기관 밀집 지역입니다.

### 교통 접근성
- **지하철 5호선·9호선** 여의도역 도보 3분 (200m)
- **여의도 환승센터** 광역버스 집중, 인천공항 리무진 직결
- **한강대교·올림픽대로** 인접, 강남·강북 모두 15분 이내

### 주변 환경
- 한국거래소, IFC서울, 파크원 등 프라임급 오피스 밀집
- 63빌딩·한강공원 조망 가능 (위치에 따라 차이)
- 직원 편의시설: IFC몰, 현대백화점 여의도점, 더현대서울 도보권

### 시장 현황
- YBD 프라임 공실률: **5.8%** (하향 추세, 6개월 전 7.2%→5.8%)
- 전층 단독 계약 가능 물건 시장 잠재: 연 3–5건 수준 (희소성↑)`,
    },
    {
      sectionId: "03_lease",
      title: "임대 현황",
      icon: "📋",
      dataSource: "supplemental.monthly_rent + vacancy_signal",
      aiRole: "auto",
      locked: true,
      lockedReason: "임대차 상세 현황 자료가 아직 확보되지 않았습니다.",
      content: "",
    },
    {
      sectionId: "04_financials",
      title: "수익 분석",
      icon: "💰",
      dataSource: "추정 (AI 계산 + 면책 자동첨부)",
      aiRole: "ai_generated",
      locked: true,
      lockedReason: "임대 현황 데이터 확보 후 수익 분석이 제공됩니다.",
      content: "",
    },
    {
      sectionId: "05_risks",
      title: "확인 필요 사항",
      icon: "⚠️",
      dataSource: "AI 리스크 자동 도출",
      aiRole: "ai_generated",
      locked: false,
      content: `전층 임대차 계약 시 반드시 확인해야 할 핵심 사항입니다.

### 법적·계약 위험
- 🔶 **전층 단독 계약 조건**: 임대인 명의, 건물관리 주체, 공용부 사용 권한 명시 필요
- 🔶 **인테리어 공사 허용 범위**: 전층 독립 사용 시 간벽 설치·전기 증설 허용 여부
- 🔶 **계약 해지 조항**: 조기 해지 시 위약금 구조 및 보증금 반환 조건

### 운영 위험
- 🔵 **관리비 구조**: 공용부 관리비 정산 방식 (실비 정산 vs. 고정액)
- 🔵 **주차 배정**: 전용 주차 대수 및 방문객 주차 처리 방법
- 🔵 **통신·보안 인프라**: 기존 시스템 재활용 vs. 신규 구축 여부

> 🔶 우선 확인 | 🔵 일반 확인`,
    },
    {
      sectionId: "06_investment",
      title: "투자 포인트",
      icon: "🎯",
      dataSource: "buyer_fit.fit_summary (DealCuriosityWriter AI)",
      aiRole: "ai_generated",
      locked: false,
      content: `이 물건이 적합한 임차인 유형과 핵심 가치를 분석합니다.

### 전층 단독 사용의 전략적 가치

**① 기업 이미지 극대화**
전층 단독 입주는 기업 로비·안내데스크 독립 운영, 커스텀 브랜딩 적용이 가능합니다. 외국계 기업, 금융사, 법무법인 등에 특히 유리합니다.

**② YBD 네트워크 효과**
한국거래소, 주요 증권사, 자산운용사와의 대면 미팅이 도보 10분 이내 가능. 금융 생태계 내 네트워킹 기회 극대화.

**③ 전환 비용 최소화**
현재 인테리어 상태가 우수한 것으로 파악 (확인 필요). A2B 이전 기업의 경우 전환 비용을 최소화할 수 있습니다.

### 예상 임차인 유형
| 유형 | 적합도 | 이유 |
|------|--------|------|
| **외국계 금융사·헤지펀드** | ⭐⭐⭐⭐⭐ | YBD 선호 + 전층 단독 니즈 |
| **국내 증권사·자산운용사** | ⭐⭐⭐⭐ | IFC 인근, 금융네트워크 최적 |
| **대형 로펌·회계법인** | ⭐⭐⭐⭐ | 기업이미지 + 접근성 |
| **스타트업 유니콘 (시리즈D+)** | ⭐⭐⭐ | 전층 규모는 크나 브랜드 효과 ↑ |`,
    },
    {
      sectionId: "07_next_steps",
      title: "다음 단계",
      icon: "🚀",
      dataSource: "정적 CTA",
      aiRole: "static",
      locked: false,
      content: `입주 문의 및 계약 진행 절차입니다.

### 임대 진행 단계
1. **초기 문의** → 담당 중개인 연락 (48시간 내 응대)
2. **현장 투어 일정 조율** → 전층 현황 직접 확인
3. **조건 협의** → 보증금·월세·인테리어 공사 범위
4. **NDA 체결 후 임대차 계약서 초안 검토**
5. **법적 검토** → 법률 자문 권장
6. **계약 체결 → 인테리어 공사 → 입주**

### 더 알고 싶으신가요?
임대 현황 상세 정보 및 건물 사양서를 요청하시면 추가 자료를 제공해 드립니다.

> 담당 중개인 김철수에게 연락하세요.`,
    },
  ],
  generatedAt: new Date().toISOString(),
  protectedFieldsRemoved: [
    "tenant_phone",
    "tenant_email",
    "negotiation_floor",
    "negotiation_ceiling",
  ],
  disclaimer:
    "본 모바일 IM Lite는 제공된 정보를 바탕으로 AI가 자동 생성한 참고 자료이며, 투자·임대 권유 또는 수익 보장이 아닙니다. 일부 섹션은 데이터 확보 전 잠금 상태이며, 실사 및 전문가 검토가 필요합니다. © 크리딜 (CRE DealCard)",
  fullImUpgradeCta: {
    enabled: true,
    label: "임대차 상세 자료 요청",
    description: "NDA 체결 후 임대현황, 관리비 내역 등 상세 자료를 받으실 수 있습니다.",
  },
};

// ─── Demo Building 3: 종로 우정국로 지식산업센터 (이영희) ──────────────────

const LEE_YOUNGHEE_DEMO: MobileIMDocument = {
  status: "published",
  buildingId: "f3333333-3333-3333-3333-111111111111",
  // Photo/map data
  coordinates: { lat: 37.5704, lng: 126.9921 },
  photos: [
    { url: 'https://map.kakao.com/link/map/종로지식산업센터,37.5704,126.9921', type: 'map' as const, label: '위치 지도' },
  ],
  blindName: "중구 CBD *** 지식산업센터 통매각",
  fullName: "종로 우정국로 밸류업용 지식산업센터 통매각",
  areaSignal: "중구 CBD",
  assetType: "지식산업센터",
  priceBand: "580억",
  sizeSignal: "연면적 약 12,000㎡",
  completenessScore: 88,
  broker: {
    userId: "e3c12345-1234-1234-1234-123456789abc",
    displayName: "이영희",
    company: "가온부동산투자자문",
    phone: "010-5555-9999",
    tagline: "데이터 기반 분석으로 도출하는 중소형 빌딩 밸류업 솔루션",
    photoUrl:
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/lee-younghee.png",
    slug: "lee-younghee",
    vibeTemplateId: "BF-01",
  },
  sections: [
    {
      sectionId: "01_overview",
      title: "물건 개요",
      icon: "🏭",
      dataSource: "asset_identity",
      aiRole: "auto",
      locked: false,
      content: `**서울 도심권(CBD)** 핵심에 위치한 **지식산업센터** 통매각 물건입니다.

| 항목 | 내용 |
|------|------|
| **소재지** | 서울특별시 종로구 우정국로 일대 (CBD) |
| **용도** | 지식산업센터 (구 아파트형 공장) |
| **연면적** | 약 12,000㎡ (약 3,630평) |
| **층수** | 지하 2층 / 지상 12층 |
| **준공연도** | 2019년 (최신 설비) |
| **호실 구성** | 총 96호실 (전용 50–180㎡ 다양) |
| **현재 입주율** | 92% (88호실 입주 중) |
| **매각가** | 약 580억 원 (VAT 별도) |
| **매각 유형** | 통매각 (전체 건물 일괄 매각) |

> 2019년 준공 최신 지산으로, CBD 내 IT·핀테크 기업 입주 집중. 안정적 임대 수익 + 밸류업 포텐셜 공존.`,
    },
    {
      sectionId: "02_location",
      title: "입지·상권",
      icon: "📍",
      dataSource: "market_location.location_analysis",
      aiRole: "ai_generated",
      locked: false,
      content: `**서울 도심 비즈니스 지구(CBD)** 핵심 입지로, 역사 도심 재생 개발의 중심에 위치합니다.

### 교통 접근성
- **지하철 1호선** 종각역 도보 3분 (250m)
- **지하철 5호선** 광화문역 도보 8분
- **서울역** 환승 접근 20분 이내, KTX·공항 직결

### 주변 인프라
- 광화문·청계천 광역 상권 인접 (대기업 본사 밀집)
- 서울 핀테크 허브·스타트업 클러스터 반경 1km
- 종로 리모델링 개발 사업 활성화 → 주변 지산 수요 증가 추세

### 시장 현황
- CBD 지식산업센터 공실률: **8.2%** (전체 지산 평균 12.1% 대비 우수)
- 2019년 이후 신규 지산 공급: CBD 내 제한적 (인허가 규제)
- IT·핀테크·스타트업 수요 지속 증가 (비대면 경제 이후 회복 트렌드)`,
    },
    {
      sectionId: "03_lease",
      title: "임대 현황",
      icon: "📋",
      dataSource: "supplemental.monthly_rent + vacancy_signal",
      aiRole: "auto",
      locked: false,
      content: `현재 **입주율 92%** (96호실 중 88호실 입주 중)의 안정적 임대 현황입니다.

### 임대 구성 요약
| 항목 | 내용 |
|------|------|
| **총 호실 수** | 96호실 |
| **입주 호실** | 88호실 (92%) |
| **공실 호실** | 8호실 (IT·핀테크 업체 입주 협의 중) |
| **주요 업종** | IT, 핀테크, 디자인, 스타트업 |
| **평균 임대 기간** | 2.8년 |
| **월 임대 수입 합계** | 약 1.95억 원/월 (추정) |

### 업종별 구성 (블라인드)
- IT 개발·소프트웨어: 약 38%
- 핀테크·블록체인: 약 22%
- 디자인·미디어: 약 18%
- 기타 서비스업: 약 22%

> ⚠️ 개별 임차인 정보는 NDA 체결 후 공개됩니다.`,
      boundaryNote: "임대 현황은 제공 자료 기준이며 실사 시 확인이 필요합니다.",
    },
    {
      sectionId: "04_financials",
      title: "수익 분석",
      icon: "💰",
      dataSource: "추정 (AI 계산 + 면책 자동첨부)",
      aiRole: "ai_generated",
      locked: false,
      content: `아래 수치는 **AI 추정값**으로 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.

### 수익 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **연 임대 수입** | 약 23.4억 원/년 | 현 입주율 기준 |
| **운영 비용** | 약 3.1억 원/년 | 관리비, 세금 추정 |
| **순영업소득(NOI)** | 약 **19.5억–22.0억 원**/년 | 80% 구간 추정 |
| **Cap Rate** | **3.4%–3.8%** (구간 추정) | 매각가 580억 기준 |
| **㎡당 단가** | 약 483만 원/㎡ | 참고용 |

### 밸류업 시나리오
공실 8호실 추가 임대 시:
- NOI 추정 개선: +약 1.4억 원/년
- 기대 Cap Rate: **3.6%–4.1%**

> ⚠️ **면책 조항**: 상기 수익 추정치는 AI가 공개 시장 데이터를 기반으로 산출한 참고값입니다. 실제 수익은 임대차 조건, 공실률 변동, 세금 구조에 따라 현저히 다를 수 있으며, 본 자료는 투자 권유 또는 수익 보장이 아닙니다.`,
      boundaryNote: "AI 추정값. 전문가 검토 필수.",
    },
    {
      sectionId: "05_risks",
      title: "확인 필요 사항",
      icon: "⚠️",
      dataSource: "AI 리스크 자동 도출",
      aiRole: "ai_generated",
      locked: false,
      content: `지식산업센터 통매각 특유의 주의사항과 실사 포인트입니다.

### 법적·규제 위험
- 🔶 **지식산업센터 용도 제한**: 입주 가능 업종 범위 확인 (제조업·IT·지식기반산업 한정)
- 🔶 **분양 전환 제한**: 통매각 후 개별 분양 전환 시 분양가 상한제·의무 입주 비율 규제
- 🔴 **취득세 중과 가능성**: 법인 취득 시 지식산업센터 취득세율 확인 (일반 오피스와 상이)

### 운영·물리적 위험
- 🔶 **소형 호실 임차인 관리**: 96개 임차인 개별 관리 비용·복잡성
- 🔵 **WALT 2.8년**: 단기 집중 만기 가능성 → 만기 분산 현황 확인
- 🔵 **화물용 승강기**: 제조·물류 이용 시 사용 부하 확인

### 시장 위험
- 🔵 **CBD 지산 신규 공급 모니터링**: 인근 도시재생사업 연계 신규 공급 현황
- 🔵 **스타트업 임차인 집중**: 경기 침체 시 공실 확대 가능성

> 🔴 최우선 확인 | 🔶 우선 확인 | 🔵 일반 확인`,
    },
    {
      sectionId: "06_investment",
      title: "투자 포인트",
      icon: "🎯",
      dataSource: "buyer_fit.fit_summary (DealCuriosityWriter AI)",
      aiRole: "ai_generated",
      locked: false,
      content: `본 자산의 **핵심 투자 가치**와 밸류업 포텐셜을 분석합니다.

### 이 건물만의 숨은 가치

**① CBD 지식산업센터 희소성**
2019년 준공 이후 CBD에 신규 지식산업센터 인허가가 사실상 중단된 상황. 최신 설비와 프리미엄 입지를 동시에 갖춘 매물은 연간 거래가 극히 드뭅니다.

**② 공실 8호실 = 즉시 밸류업 기회**
현 입주율 92%는 단점이 아닌 기회입니다. 8호실 추가 임대 완료 시 NOI 약 7% 추가 개선 가능. 매수 직후 가시적 성과 달성.

**③ IT·핀테크 생태계 앵커 효과**
입주 기업 간 네트워크 효과로 임차인 자발적 유지율 높음. 지산 특성상 이사 비용이 크기 때문에 재계약율 일반 오피스 대비 우수.

### 예상 매수자 유형
| 유형 | 적합도 | 이유 |
|------|--------|------|
| **시행사·개발업체 (밸류업)** | ⭐⭐⭐⭐⭐ | 공실 해소 + 리포지셔닝 여지 |
| **부동산 펀드 (수익형)** | ⭐⭐⭐⭐ | 안정 수익 + Cap Rate |
| **지산 전문 운영사** | ⭐⭐⭐⭐ | 운영 노하우 보유 시 최적 |
| **기업 사옥 이전** | ⭐⭐ | 전체 규모(12,000㎡) 과다 가능성 |`,
    },
    {
      sectionId: "07_next_steps",
      title: "다음 단계",
      icon: "🚀",
      dataSource: "정적 CTA",
      aiRole: "static",
      locked: false,
      content: `관심이 있으시다면 아래 절차로 진행해 주세요.

### 투자 진행 단계
1. **초기 관심 표명** → 담당 중개인 이영희 연락
2. **NDA 체결** → 임차인 목록 및 임대차계약서 일람 제공
3. **현장 실사 일정 조율** → 대표 호실 투어, 설비 확인
4. **재무 분석** → 세무사·법무사·CRE 컨설턴트 투입 권장
5. **LOI 제출 → 법적 DD → 매매계약 체결**
6. **잔금 납부 → 명도 관리 → 운영 시작**

### 핵심 실사 권고 사항
- 전체 임대차계약서 검토 (만기 분산 확인)
- 지식산업센터 취득세 및 부가세 처리 법률 자문
- 공실 8호실 임대 가능성 사전 협의

> Full IM을 통해 전문가 검토 포함 18개 섹션 정식 투자설명서를 받아보세요.`,
    },
  ],
  generatedAt: new Date().toISOString(),
  protectedFieldsRemoved: [
    "tenant_phone",
    "tenant_email",
    "negotiation_floor",
    "negotiation_ceiling",
    "broker_internal_memo",
  ],
  disclaimer:
    "본 모바일 IM Lite는 제공된 정보를 바탕으로 AI가 자동 생성한 참고 자료이며, 투자 권유 또는 수익 보장이 아닙니다. 모든 수치는 추정값으로 실사 및 전문가 검토가 필요합니다. 지식산업센터 투자는 용도 제한 및 취득세 관련 별도 법률 검토가 필수입니다. © 크리딜 (CRE DealCard)",
  fullImUpgradeCta: {
    enabled: true,
    label: "Full IM (투자등급 정식 설명서) 업그레이드",
    description:
      "18개 섹션, 전문가 검토, 실거래 비교 분석 포함 투자등급 정식 투자설명서를 생성할 수 있습니다.",
  },
};

// ─── Demo Building 4: Phase 0~1 파이프라인 생성본 (홍길동 / 공공데이터 반영) ─────
// 이 레코드는 Phase 0~1 파이프라인(writer.ts + financials.ts + 공공데이터 오케스트레이터)이
// 실제로 생성하는 Mobile IM 산출물을 TypeScript 수준에서 시딩합니다.
// Supabase migration 00042와 동일한 데이터 — API 키 없는 환경에서도 /im-lite/demo-gbd-office-hongildong 라우트가 동작합니다.

const PIPELINE_DEMO_GBD_OFFICE: MobileIMDocument = {
  status: "published",
  // f1111111과 동일 빌딩이나 파이프라인 생성 버전임을 명시 (slug 라우팅용)
  buildingId: "demo-gbd-office-hongildong",
  // Photo/map data + public data sources
  coordinates: { lat: 37.5074, lng: 127.0592 },
  photos: [
    { url: 'https://map.kakao.com/link/map/GBD오피스,37.5074,127.0592', type: 'map' as const, label: '위치 지도' },
  ],
  publicDataSources: ['건축물대장', '공시지가', '토지이용계획(LURIS)', '카카오 POI'],
  blindName: "강남구 GBD *** A급 오피스 — 파이프라인 생성본",
  fullName: "테헤란로 랜드마크 오피스 빌딩 (Phase 0~1 파이프라인 생성)",
  areaSignal: "강남구 GBD (테헤란로)",
  assetType: "오피스 빌딩",
  priceBand: "450억원",
  sizeSignal: "연면적 8,493.6㎡ (2,571평) — 건축물대장 확인",
  completenessScore: 92,
  broker: {
    userId: "e1a12345-1234-1234-1234-123456789abc",
    displayName: "홍길동",
    company: "한국상업부동산중개",
    phone: "010-1234-5678",
    tagline: "성공적인 빌딩 매매를 위한 최적의 파트너",
    photoUrl:
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/hong-gildong.png",
    slug: "hong-gildong",
    vibeTemplateId: "CC-01",
  },
  sections: [
    {
      sectionId: "01_overview",
      title: "🏢 자산 개요 및 제원",
      icon: "🏢",
      dataSource: "건축물대장(국토교통부) 공공데이터 + 브로커 입력",
      aiRole: "auto",
      locked: false,
      boundaryNote: "건축물대장(국토교통부) 공공데이터 기반 확인 수치입니다.",
      content: `**강남구 테헤란로** 소재 A급 프라임 오피스 빌딩입니다. 건축물대장(국토교통부) 공공데이터를 통해 확인된 수치를 반영하였습니다.

| 항목 | 내용 |
|------|------|
| **소재지** | 서울특별시 강남구 테헤란로 427 (GBD) |
| **용도** | 업무시설 (오피스) |
| **연면적** | **8,493.6㎡** (2,571평) — 건축물대장 확인 |
| **대지면적** | 1,820.5㎡ (550평) — 건축물대장 확인 |
| **층수** | 지하 3층 / 지상 15층 |
| **준공연도** | 2007년 (18년 경과) |
| **구조** | 철골철근콘크리트조 |
| **건폐율** | 60.0% / 법정 상한 60% |
| **용적률** | 466.7% / 법정 상한 800% (여유 333%p — 밸류업 포텐셜) |
| **주차** | 전용주차 120대 |
| **승강기** | 승객용 4대, 화물용 1대 |
| **매각가** | 약 **450억 원** (VAT 별도) |

> 📊 **데이터 출처**: 건축물대장(국토교통부 공공데이터포털) 확인 수치. 매각가 및 임대 현황은 브로커 제공 정보.`,
    },
    {
      sectionId: "02_location",
      title: "📍 입지 및 대중교통 분석",
      icon: "📍",
      dataSource: "카카오 로컬 API (POI 실측) + 시장 데이터",
      aiRole: "ai_generated",
      locked: false,
      boundaryNote: "카카오 로컬 API 실측 데이터 기반입니다.",
      content: `**강남 비즈니스 지구(GBD)** 핵심 입지로, 카카오 로컬 API 실측 거리를 반영하였습니다.

### 교통 접근성 (카카오 실측)
- 🚇 **강남역 (2호선 / 신분당선)** 도보 **5분** (약 **350m**) — 카카오 API 확인
- 🚇 **신논현역 (9호선)** 도보 7분 (약 500m)
- 🚌 인근 버스 정류장 **8개소** (광역·간선·지선 모두 집중)
- 🚗 강남대로·테헤란로 직접 접면, 강남IC 10분 이내

### 반경 500m 인프라 (카카오 POI 실측)
- ☕ 카페 **47개소** / 🍽️ 식당 **112개소** — 임직원 편의 탁월
- 🏨 5성급 호텔 **2개소** / 🏬 대형 상업시설 **1개소** (강남역 일대)
- 🅿️ 공영주차장 **6개소** / 편의점 **9개소**

### GBD 시장 현황
- 강남구 프라임 오피스 공실률: **3.2%** (서울 평균 7.1% 대비 현저히 낮음)
- 테헤란로 실질임대료: **3.2만원/3.3㎡/월** (전년比 +4.1%)
- 2027년까지 신규 공급 제한적 → 수급 긴장 지속 전망`,
    },
    {
      sectionId: "03_lease",
      title: "📊 임대차 현황",
      icon: "📋",
      dataSource: "브로커 입력 (임차인명·임대료는 NDA 이후 공개)",
      aiRole: "auto",
      locked: false,
      boundaryNote:
        "임대차 현황은 브로커 제공 자료 기준이며, 실사 시 확인이 필요합니다.",
      content: `현재 **완전임대(Full Occupancy, 0% 공실)** 상태입니다.

### 임대 구성 요약
| 항목 | 내용 |
|------|------|
| **공실률** | **0%** (완전임대) |
| **임차인 수** | 6개사 (기업 임차인) |
| **임대 유형** | 전층 분할임대 |
| **월 임대료 합계** | 약 1.1억 원/월 (추정, 실사 확인 필요) |
| **평균 임대기간** | 4.2년 |
| **WALT (잔여 가중평균임대기간)** | **2.8년** |

### 임차인 구성 (블라인드 처리)
- 2F–5F: 국내 상장 IT 기업 (잔여 3.2년)
- 6F–9F: **외국계 금융사** (잔여 1.8년 — 재계약 리스크 모니터링)
- 10F–13F: 국내 대형 법무법인 (잔여 4.1년)
- 3F, 14F: 소규모 기업 임차인

> ⚠️ 임차인명 및 호실별 임대료는 공개 제한 사항으로 **NDA 체결 후** 공개됩니다.`,
    },
    {
      sectionId: "04_financials",
      title: "💸 수익률 및 공시지가 분석",
      icon: "💰",
      dataSource:
        "국토부 개별공시지가 (공공데이터) + financials.ts 계산 엔진 (NOI/Cap Rate/IRR)",
      aiRole: "ai_generated",
      locked: false,
      boundaryNote:
        "AI 추정값. 실제 수익은 임대차 계약 확인 후 전문가 검토가 필요합니다.",
      content: `아래 수치는 **공공데이터 + AI 추정값**으로 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.

### 재무 지표 (financials.ts 고급 계산 엔진)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **연 순영업소득(NOI)** | **9.5억 ~ 14.0억 원**/년 | 80% 신뢰구간 |
| **Cap Rate** | **2.5%–3.1%** | 매각가 450억 기준 |
| **IRR (5년 보유)** | **7.8%–11.4%** | Newton-Raphson 시나리오, 참고용 |
| **총 수익률(Gross Yield)** | **2.93%** | 연 임대수입/매각가 |
| **평당 매매가** | **17,500,000원/평** | 시장 비교 참고용 |
| **대지 지분 가치 비중** | **33.8%** | 하방 경직성 지표 |

### 공시지가 (국토부 개별공시지가 공공데이터 확인)
- 2025년 기준: **㎡당 8,350,000원** (평당 약 27,598,000원)
- 추세: 2022년 682만 → 2023년 734만 → 2024년 798만 → 2025년 **835만원** (+22.4% 3년)

### 주변 실거래 비교 (강남구, 2023–2024, 국토부 실거래가)
| 거래 사례 | 시기 | 면적 | 평당가 |
|---------|------|------|------|
| GBD 오피스 ① | 2024.11 | 9,120㎡ | 약 17,587,000원 |
| GBD 오피스 ② | 2024.08 | 7,830㎡ | 약 16,826,000원 |
| GBD 인근 ③ | 2024.05 | 6,450㎡ | 약 16,739,000원 |
| GBD 인접 ④ | 2023.12 | 11,200㎡ | 약 15,917,000원 |

비교 사례 평균 평당가 **약 16,767,000원** → 본 물건 호가(17,500천원/평)는 시장 상위권 수준.

> ⚠️ **면책 조항**: 상기 수익 추정치는 AI가 공공 시장 데이터를 기반으로 산출한 참고값입니다. 실제 수익은 임대차 조건, 공실률 변동, 세금 구조에 따라 현저히 다를 수 있으며, 본 자료는 투자 권유 또는 수익 보장이 아닙니다.`,
    },
    {
      sectionId: "05_risks",
      title: "⚖️ 공법 규제 및 리스크 진단",
      icon: "⚠️",
      dataSource:
        "LURIS 토지이용계획(공공데이터) + 건축물대장 + AI 리스크 자동 도출",
      aiRole: "ai_generated",
      locked: false,
      boundaryNote:
        "공법 규제 세부 내용은 관할 관청 및 전문가 확인이 필요합니다.",
      content: `아래 사항은 **실사(DD) 과정에서 반드시 확인**이 필요한 항목입니다.

### 공법·용도 사항 (LURIS 토지이용계획 공공데이터 확인)
- 🟢 **용도지역**: 일반상업지역 / 중복: 방화지구, 도심지역
- 🔵 **건폐율**: 현재 60.0% / 법정 상한 60% → 여유 없음
- 🟢 **용적률**: 현재 466.7% / 법정 상한 800% → **여유 333%p** (증축·리모델링 여지)

### 건물·물리적 위험
- 🔶 **준공 18년 경과**: 외벽 커튼월 유리·공조(HVAC) 시스템 교체 시점 확인 필요
- 🔶 **에너지 효율**: 친환경 인증(LEED·G-SEED) 미보유 — ESG 중심 기관투자자 리스크
- 🔵 **석면 조사**: 2007년 준공 → 석면 함유 자재 여부 확인 권장

### 임대차·권리 관계
- 🔶 **WALT 2.8년**: 단기 집중 만기 가능성 → 임차인별 갱신 의향 사전 파악 필수
- 🔶 **외국계 임차인 (6F–9F, 잔여 1.8년)**: 철수 가능성 사전 확인 권장
- 🔵 **임대료 증액 조항**: CPI 연동 여부 및 증액 한도 확인
- 🔵 **등기 현황**: ⚠️ 자동 조회 미연동 — 등기부등본 최신본 수동 확인 필수

> 🔶 우선 확인 | 🔵 일반 확인 | 공법 세부는 강남구청·법무사 확인 권장`,
    },
    {
      sectionId: "06_investment",
      title: "🎯 핵심 투자 메리트",
      icon: "🎯",
      dataSource: "BSSoT buyer_fit 분석 + 실거래 비교 (국토부 공공데이터)",
      aiRole: "ai_generated",
      locked: false,
      content: `본 자산의 **핵심 투자 가치**와 예상 매수자 유형 분석입니다.

### 이 건물을 사야 하는 이유

**① GBD 완전임대 A급 — 즉시 현금흐름**
강남역 5분, 테헤란로 직접 접면 A급 오피스 중 완전임대 상태로 매각되는 물건은 연간 거래 물량이 극히 제한적입니다. 취득 즉시 월 **1.1억 원 이상**의 임대 현금흐름이 발생합니다.

**② 공시지가 상승 + 대지가치 하방 지지**
개별공시지가 3년간 22.4% 상승 (682만 → 835만원/㎡). 대지 가치가 매매가의 **33.8%**를 지지하여 하방 경직성 확보.

**③ 용적률 여유 333%p → 밸류업 포텐셜**
현 466.7% 대비 법정 상한 800%까지 **333%p 여유**. 임대료 정상화(현재 시장 대비 소폭 할인 추정) + 중장기 리모델링 시나리오 설계 가능.

> **전문가 한줄 의견**: "GBD 완전임대 A급 오피스는 공급이 워낙 희소해 매수 경쟁이 치열합니다. WALT 2.8년은 단점이 아닌 임대료 현실화 기회입니다." — 홍길동 중개사

### 예상 매수자 유형 (AI 분석)
| 유형 | 적합도 | 이유 |
|------|--------|------|
| **자산운용사 (임대형 펀드)** | ⭐⭐⭐⭐⭐ | 완전임대 + Cap Rate + 안정 현금흐름 |
| **법인 자가사용 (사옥 매입)** | ⭐⭐⭐⭐ | GBD 브랜드 가치 + 임직원 접근성 |
| **고액 자산가 그룹** | ⭐⭐⭐ | 규모 상 협업 필요, 수익 안정성 ↑ |
| **외국계 리츠** | ⭐⭐⭐ | GBD 선호, 환율 변동 리스크 검토 필요 |`,
    },
    {
      sectionId: "07_next_steps",
      title: "📅 향후 검토 및 진행 절차",
      icon: "🚀",
      dataSource: "정적 CTA",
      aiRole: "static",
      locked: false,
      content: `관심이 있으시다면 아래 절차로 진행해 주세요.

### 투자 진행 단계
1. **초기 관심 표명** → 담당 중개인 홍길동 연락 (010-1234-5678)
2. **NDA 체결** → 임차인 정보 및 임대차계약서 원본 제공
3. **현장 실사 일정 조율** → 인테리어 상태, 설비 컨디션 직접 확인
4. **LOI(투자의향서) 제출** → 가격 협의 개시
5. **법적 실사(DD)** → 법률·세무·기술 전문가 투입
6. **매매계약 체결 → 잔금 납부**

### Full IM (18섹션 투자등급 정식 설명서)으로 업그레이드
- 📊 DCF 분석 (10년 현금흐름 모델)
- 🔍 임차인별 신용 분석
- 📋 법적 DD 체크리스트 (법무사 검토)
- 🌍 글로벌 투자자용 영문 요약

> 본 자료는 예비 검토용이며 모든 수치와 내용은 실사 및 전문가 검토를 통해 확인이 필요합니다.`,
    },
  ],
  generatedAt: new Date().toISOString(),
  protectedFieldsRemoved: [
    "tenant_name",
    "exact_address",
    "unit_rent",
    "seller_motivation",
    "broker_internal_memo",
  ],
  disclaimer:
    "본 모바일 IM Lite는 Phase 0~1 파이프라인(financials.ts 고급 계산 엔진 + 공공데이터 오케스트레이터 + AI 서사 생성)이 자동 생성한 참고 자료입니다. 건축물대장(국토교통부), 개별공시지가, 토지이용계획(LURIS), 실거래가, 카카오 로컬 POI 공공데이터를 활용하였습니다. 투자 권유 또는 수익 보장이 아니며, 모든 수치는 추정값으로 실사 및 전문가 검토가 필요합니다. © 크리딜 (CRE DealCard) — AI 기반 상업용 부동산 투자설명서 플랫폼.",
  fullImUpgradeCta: {
    enabled: true,
    label: "Full IM (투자등급 정식 설명서) 업그레이드",
    description:
      "18개 섹션, DCF 분석, 전문가 검토, 딜룸 Q&A 포함 투자등급 정식 투자설명서로 업그레이드할 수 있습니다.",
  },
};

// ─── Demo Building 5: 미사랑 빌딩 (상도동 477-18) — E2E 파이프라인 데모 ──────

const MISARANG_DEMO: MobileIMDocument = {
  status: "published",
  buildingId: "f5555555-5555-5555-5555-111111111111",
  blindName: "동작구 숭실대입구역 *** 근생·의료 빌딩",
  fullName: "미사랑 빌딩 (상도동 477-18)",
  areaSignal: "동작구 숭실대입구역",
  assetType: "근린생활·업무시설 (복합빌딩)",
  priceBand: "112억 원",
  sizeSignal: "연면적 715㎡ (216평)",
  completenessScore: 95,
  coordinates: { lat: 37.4967, lng: 126.9538 },
  publicDataSources: [
    "건축물대장 (국토교통부)",
    "개별공시지가 (국토교통부)",
    "토지이용계획 (LURIS)",
    "실거래가 공개시스템",
    "카카오 로컬 POI",
  ],
  dataQualityBadge: {
    tier: "verified",
    label: "데이터 검증 완료",
    emoji: "🟢",
    score: 95,
  },
  photos: [
    { url: "https://map.kakao.com/link/map/미사랑빌딩,37.4967,126.9538", type: "map" as const, label: "위치 지도" },
  ],
  broker: {
    userId: "e5a12345-5555-5555-5555-123456789abc",
    displayName: "JS 부동산",
    company: "JS 상업부동산중개",
    phone: "010-0000-0000",
    tagline: "서울 남부 빌딩 매매의 전문 파트너",
    photoUrl:
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/hong-gildong.png",
    slug: "js-realty-demo",
    vibeTemplateId: "CC-01",
  },
  sections: [
    {
      sectionId: "01_overview",
      title: "물건 개요",
      icon: "🏢",
      dataSource: "asset_identity + 건축물대장",
      aiRole: "auto",
      locked: false,
      confidence: "confirmed",
      content: `**서울시 동작구 숭실대입구역** 인접 코너 입지의 근린생활·업무 복합빌딩입니다.

| 항목 | 내용 |
|------|------|
| **소재지** | 서울시 동작구 상도동 477-18 |
| **건물명** | 미사랑 빌딩 |
| **용도** | 근린생활시설 / 업무시설 (복합) |
| **대지면적** | 226㎡ (68평) |
| **연면적** | 715㎡ (216평) |
| **건축면적** | 113㎡ (34평) |
| **지상면적** | 563㎡ (170평) |
| **층수** | 지하 1층 / 지상 6층 |
| **준공연도** | 2019년 11월 (준공 약 7년) |
| **구조** | 철근콘크리트조, 개별난방 |
| **건폐율 / 용적률** | 50% / 250% |
| **승강기 / 주차** | 승강기 1대 / 주차 5대 |
| **용도지역** | 제3종 일반주거지역 |
| **도로조건** | 40M × 30M 광대로 코너 |
| **공시지가** | 875만원/㎡ (2,893만원/평) |

> 2019년 신축 준공으로 건물 컨디션이 양호하며, 숭실대입구역 광대로 코너에 위치하여 **가시성이 우수**합니다.`,
    },
    {
      sectionId: "02_location",
      title: "입지·상권",
      icon: "📍",
      dataSource: "카카오 로컬 POI + AI 위치분석",
      aiRole: "ai_generated",
      locked: false,
      confidence: "confirmed",
      content: `**숭실대입구역 광대로 코너** 최적 입지로, 40M×30M 대로변 교차로에 위치하여 보행 유동인구와 차량 가시성이 모두 우수합니다.

### 교통 접근성
- **지하철 7호선** 숭실대입구역 도보 2분 (150m 이내)
- **숭실대입구 사거리** 40M 광대로 × 30M 도로 코너 (최상위 가시성)
- **동작대로** 직접 접근, 사당·노량진 방면 교통 편리
- **서울 지하철 4호선** 총신대입구역 도보 10분권

### 주변 상권 특성
- **의료 클러스터**: 반경 500m 내 대형 병원, 의원, 약국 밀집
- **대학가 수요**: 숭실대학교 정문 인접, 대학 관련 상업 수요 풍부
- **주거 배후 수요**: 상도동·사당동 대규모 아파트 단지 배후 (상도 래미안, 사당 쌍용 등)
- **생활 인프라**: 대형마트, 은행, 관공서 도보권 밀집

### 시장 현황
- 숭실대입구역 인근 소형 빌딩 거래가: **평당 1.3억~1.8억** 수준
- 본 건물 평당가: **16,419만원/평** → 시장 중위 수준
- 의료·근생 임차 수요 안정적 (공실 리스크 낮음)`,
    },
    {
      sectionId: "03_lease",
      title: "임대 현황",
      icon: "📋",
      dataSource: "브로커 제공 렌트롤 (실데이터)",
      aiRole: "auto",
      locked: false,
      confidence: "confirmed",
      content: `현재 **전층 만실 (Full Occupancy)** 상태이며, 의료·근생 업종 중심의 안정적 임차인 구성입니다.

### 층별 임대 현황

| 층수 | 입주업체 | 전용면적(평) | 보증금(만원) | 월세(만원) | 관리비(만원) | 임대차기간 |
|------|----------|-------------|-------------|-----------|-------------|-----------|
| **B1** | PT 스튜디오 | 45.7 | 10,000 | 300 | — | 21.04~23.04 |
| **1F** | 약국 | 30.7 | 21,000 | 1,100 | — | 21.09~24.09 |
| **2F** | 이비인후과 | 33.8 | 6,000 | 350 | — | 19.12~29.12 |
| **3F** | 내과의원 | 33.8 | 12,000 | 714 | — | 19.08~24.07 |
| **4F** | 내과의원 | 33.8 | *(3F 합산)* | *(3F 합산)* | — | *(3F 합산)* |
| **5F** | 건강의학과 | 33.8 | 7,000 | 400 | — | 20.12~25.11 |
| **6F** | 상담연구소 | 17.5 | 1,500 | 100 | — | 20.12~25.11 |
| | **합계** | **216평** | **57,500** | **2,964** | **0** | |

### 임대 구성 분석
- **공실률**: 0% (전층 만실)
- **핵심 임차인**: 1F 약국 (월 1,100만원, 전체 임대료의 37%)
- **의료 비율**: 전체 임차인의 **83%가 의료·건강** 관련 (높은 임대 안정성)
- **관리비 수익**: 실비정산 + 사무업무추진비로 **약 45만원/월** 잉여수익 발생
- **임대료 인상 특약**: 5F·6F 2023.12.01부터 임대료 5% 인상, 2025.12.01 재계약 시 추가 5% 인상 조항 보유

> ⚠️ B1 PT 스튜디오 및 1F 약국 임대차 기간 만료 — **재계약 현황 확인 필요**`,
      boundaryNote:
        "임대 현황은 브로커 제공 렌트롤 기준이며, 실사 시 임대차계약서 확인이 필요합니다.",
    },
    {
      sectionId: "04_financials",
      title: "수익 분석",
      icon: "💰",
      dataSource: "브로커 데이터 + AI 재무분석 엔진",
      aiRole: "ai_generated",
      locked: false,
      confidence: "confirmed",
      content: `아래 수익 분석은 **브로커 제공 렌트롤**과 **AI 재무분석 엔진**을 결합한 추정치입니다.

### 핵심 수익 지표
| 항목 | 수치 | 비고 |
|------|------|------|
| **매매가** | **112억 원** | 135억→112억 급조정 (▼17%) |
| **평당 매매가** | 16,419만원/평 | 연면적 216평 기준 |
| **보증금 합계** | 5.75억 원 | 7개 임차인 합산 |
| **월 임대 수입** | 2,964만원/월 | 관리비 잉여 45만원 별도 |
| **연 총 임대 수입** | **3.56억 원/년** | 2,964 × 12 |
| **연 관리비 잉여** | **540만원/년** | 45만 × 12 |
| **연 총 수입** | **3.61억 원/년** | 임대료 + 관리비 잉여 |

### 수익률 분석
| 지표 | 산출값 | 평가 |
|------|--------|------|
| **총수익률 (Gross Yield)** | **3.22%** | 매매가 대비 연 총임대수입 |
| **Cap Rate (표면이율)** | **약 3.4%** | 브로커 산정 기준 *(관리비 잉여 포함)* |
| **순수익률 (Net Yield)** | **약 2.8~3.0%** | 운영비·세금 등 차감 추정 |
| **보증금 대비 매매가** | **5.1%** | 보증금 5.75억 / 112억 |

### 가격 변동 이력 및 밸류에이션
- **당초 호가**: 135억 원 → **현재 매각가**: 112억 원 (**▼17% 급조정**)
- **평당가 비교**: 16,419만원/평 (숭실대입구역 인근 소형빌딩 평균 대비 적정 수준)
- **공시지가 대비**: 대지 68평 × 2,893만/평 = **약 19.7억** (토지가 대비 매매가 5.7배)

### 대출 현황
| 항목 | 내용 |
|------|------|
| **융자** | 78억 원 (채권최고액 기준) |
| **대출기관** | 신한은행 |
| **LTV** | 약 69.6% (매매가 112억 기준) |

> ⚠️ **면책 조항**: 상기 수익 추정치는 브로커 제공 렌트롤 및 AI 분석을 기반으로 산출한 참고값입니다. 실제 수익은 공실 발생, 임대료 변동, 대출 조건, 세금 구조에 따라 달라질 수 있으며, 본 자료는 투자 권유 또는 수익 보장이 아닙니다.`,
      boundaryNote:
        "AI 추정값 + 브로커 제공 데이터. 실제 수익은 임대차 계약 확인 후 전문가 검토 필요.",
    },
    {
      sectionId: "05_risks",
      title: "확인 필요 사항",
      icon: "⚠️",
      dataSource: "AI 리스크 자동 도출",
      aiRole: "ai_generated",
      locked: false,
      confidence: "inferred",
      content: `아래 사항은 **실사(DD) 과정에서 반드시 확인**이 필요한 항목입니다.

### 🔶 우선 확인 (High Priority)

**① B1 PT 스튜디오 임대차 만료**
- 계약기간: 2021.04~2023.04 → **이미 만료** (재계약 여부 미확인)
- 지하 PT 스튜디오는 코로나 이후 임차 수요 변동성 높음
- 현 임대료(300만원/월) 시장 적정성 검토 필요

**② 1F 약국 임대차 만료**
- 계약기간: 2021.09~2024.09 → **만료 도래** (재계약 조건 확인 필수)
- 약국은 건물 전체 임대수입의 **37%** 차지 → 핵심 임차인 리스크
- 재계약 시 임대료 인상 협상 여지 존재

**③ 3~4F 내과의원 임대차 만료**
- 계약기간: 2019.08~2024.07 → **만료** (재계약 현황 확인 필요)
- 3F+4F 통합 보증금 1.2억, 월 714만원 — 주요 임대수입원

**④ 매매가 급조정 사유**
- 135억 → 112억 (**17% 급하락**) — 급매도 사유 확인 필요
- 시장 하락 vs 개별 사정(유동성 필요) 판단 필요

### 🔵 일반 확인 (Normal Priority)

**⑤ LTV 69.6% 높은 대출 비율**
- 융자 78억 (채권최고액) / 매매가 112억 = **69.6%**
- 매수 후 리파이낸싱 조건 및 대출 승계 가능 여부 확인 필요

**⑥ 5F·6F 임대료 인상 특약 이행 여부**
- 2023.12 및 2025.12 5% 인상 조항 → 실제 적용 여부 확인 필요
- 인상 적용 시 연 임대수입 추가 약 300만원 증가 예상

**⑦ 주차 5대 (216평 대비 부족 가능)**
- 의료 업종 특성상 환자 차량 주차 수요 — 인근 공영주차장 연계 확인

> 🔶 우선 확인 | 🔵 일반 확인`,
    },
    {
      sectionId: "06_investment",
      title: "투자 포인트",
      icon: "🎯",
      dataSource: "buyer_fit.fit_summary (AI 매수자 적합성 분석)",
      aiRole: "ai_generated",
      locked: false,
      confidence: "inferred",
      content: `본 자산의 **핵심 투자 가치**와 예상 매수자 유형 분석입니다.

### 이 건물을 사야 하는 5가지 이유

**① 135억→112억 급조정 (▼17%) — 가격 매력도 최고**
호가 대비 23억 할인된 급매도 상태입니다. 숭실대입구역 인근 유사 빌딩 평당가(1.3~1.8억) 대비 **16,419만원/평**으로 하단에 위치하며, 하방 리스크가 제한적입니다.

**② 의료 클러스터 — 높은 임대 안정성**
전 임차인의 83%가 의료·건강 관련 업종으로, 경기 변동에 상대적으로 둔감한 업종입니다. 이비인후과(2F)는 2029년까지 장기계약이 확보되어 있으며, 의료 임차인은 이전 비용이 높아 **재계약률이 90% 이상**입니다.

**③ 광대로 코너 프리미엄 + 2019년 신축**
40M × 30M 대로 코너에 위치하여 가시성이 극대화됩니다. 2019년 신축으로 구조·설비 컨디션이 양호하며, 향후 10년간 대규모 CAPEX(수선비) 부담이 최소화됩니다.

**④ 관리비 잉여수익 (월 45만원)**
관리비 실비정산 구조에서 **월 45만원의 잉여수익**이 발생하고 있어, 실질 수익률이 표면 Cap Rate(3.4%)보다 높습니다.

**⑤ 임대료 인상 업사이드**
5F·6F에 5% 인상 특약이 확보되어 있으며, 만료 임차인 재계약 시 시장 임대료로 정상화하면 **Cap Rate 3.8~4.0%까지 개선** 가능합니다.

### 예상 매수자 유형 (AI 분석)
| 유형 | 적합도 | 이유 |
|------|--------|------|
| **개인 자산가 (빌딩 첫 매입)** | ⭐⭐⭐⭐⭐ | 112억 규모 적정, 의료 임대 안정성, 역세권 |
| **의사·치과의사 (자가사용 겸 투자)** | ⭐⭐⭐⭐⭐ | 의료 빌딩 시너지, 1~2개 층 자가사용 가능 |
| **법인 (절세 목적 부동산 편입)** | ⭐⭐⭐⭐ | 감가상각 + 임대수익 + 시세차익 |
| **리모델링 밸류업 투자자** | ⭐⭐⭐ | 신축이라 리모델링 여지 제한적, 장기 보유 적합 |`,
    },
    {
      sectionId: "07_next_steps",
      title: "다음 단계",
      icon: "🚀",
      dataSource: "정적 CTA",
      aiRole: "static",
      locked: false,
      content: `관심이 있으시다면 아래 절차로 진행해 주세요.

### 투자 진행 단계
1. **초기 관심 표명** → 담당 중개인 연락 (카카오톡 또는 전화)
2. **렌트롤 원본 확인** → 각 임차인 임대차계약서 열람
3. **현장 실사** → B1~6F 각 층 내부 상태 점검, 주차장 확인
4. **재무 실사** → 대출 승계 조건, 세금(취득세·양도세) 시뮬레이션
5. **법적 DD** → 등기부등본, 토지이용계획 확인, 건물 하자 점검
6. **가격 협의** → LOI 제출 (현재 급매도 상태이므로 신속 진행 권장)
7. **매매계약 체결 → 잔금·소유권이전 등기**

### 실사 시 특별 확인 필수 사항
- ✅ B1·1F·3F·4F 임차인 재계약 현황 및 조건
- ✅ 매도인 급매도 사유 (135→112억 사유)
- ✅ 신한은행 융자 78억 대출 승계 또는 상환 조건
- ✅ 5F·6F 임대료 인상 특약 실제 이행 내역

### 상세 분석이 필요하신가요?
Full IM (투자등급 정식 투자설명서)은 18개 섹션, DCF·IRR 분석, 전문가 검토 포함 버전입니다.

> 담당 중개인에게 연락하여 현장 실사 일정을 잡아보세요. **급매도 물건은 선점이 핵심입니다.**`,
    },
  ],
  generatedAt: "2026-06-16T00:00:00.000Z",
  protectedFieldsRemoved: [
    "임차인_연락처",
    "매도인_상세_사유",
    "대출_상세_조건",
    "중개수수료_조건",
    "broker_internal_memo",
  ],
  disclaimer:
    "본 모바일 IM Lite는 브로커 제공 건물정보·렌트롤과 공공데이터(건축물대장, 개별공시지가, 토지이용계획, 실거래가)를 기반으로 AI가 자동 생성한 참고 자료입니다. 투자 권유 또는 수익 보장이 아니며, 모든 수치는 추정값으로 실사 및 전문가 검토가 필요합니다. 부동산 투자에는 원금 손실 위험이 있으며, 투자 결정 전 반드시 전문가 상담을 받으시기 바랍니다. © 크리딜 (CRE DealCard) — AI 기반 상업용 부동산 투자설명서 플랫폼.",
  fullImUpgradeCta: {
    enabled: true,
    label: "Full IM (투자등급 정식 설명서) 업그레이드",
    description:
      "18개 섹션, DCF·IRR 분석, 법률·세무 전문가 검토, 딜룸 Q&A 포함 투자등급 정식 투자설명서로 업그레이드할 수 있습니다.",
  },
};

// ─── Lookup Map ────────────────────────────────────────────────────────────

export const DEMO_MOBILE_IM_DATA: Record<string, MobileIMDocument> = {
  [HONG_GILDONG_DEMO.buildingId]: HONG_GILDONG_DEMO,
  [KIM_CHULSOO_DEMO.buildingId]: KIM_CHULSOO_DEMO,
  [LEE_YOUNGHEE_DEMO.buildingId]: LEE_YOUNGHEE_DEMO,
  // Phase 0~1 파이프라인 생성 데모 (slug 기반 라우팅)
  [PIPELINE_DEMO_GBD_OFFICE.buildingId]: PIPELINE_DEMO_GBD_OFFICE,
  // E2E 파이프라인 데모 — 미사랑 빌딩 (상도동 477-18)
  [MISARANG_DEMO.buildingId]: MISARANG_DEMO,
};

/** Returns demo IM data for a known demo building ID, or null. */
export function getDemoMobileIM(buildingId: string): MobileIMDocument | null {
  return DEMO_MOBILE_IM_DATA[buildingId] ?? null;
}

/** All demo building IDs for static generation, sitemaps, etc. */
export const DEMO_BUILDING_IDS = Object.keys(DEMO_MOBILE_IM_DATA);

