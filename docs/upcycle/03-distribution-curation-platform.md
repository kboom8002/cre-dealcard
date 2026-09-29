# 전이 개발 분석 보고서 ③ — 유통 큐레이션 플랫폼

> **문서 코드**: UPCYCLE-03-CURATION  
> **작성일**: 2026-09-26  
> **원본 시스템**: CRE DealCard (cre-dealcard)  
> **타겟 시스템**: Distribution Curation Platform (유통 큐레이션 SaaS)  

---

## 1. Executive Summary

해외 유통사·리테일러의 카탈로그 구성 요청에 맞춰 국내 제조사의 제품을 **AI 큐레이션**하고, 유통 제안서·가격표·물류 견적을 자동 생성하는 **B2B 유통 매칭 플랫폼**.

소비재(화장품, 식품, 생활용품) 유통에 특화된 "**AI 머천다이저(MD)**" 역할을 수행합니다.

**핵심 가치 제안**:
- 유통사: 트렌드 맞춤 상품 큐레이션 + 카탈로그 PPTX 자동 생성 + 물류비 포함 견적 원스톱
- 공급사/브랜드: 유통 채널 접근성 확대 + 유통 제안서 자동화
- 큐레이터/MD: 상품 발굴 → 큐레이션 → 프레젠테이션까지 AI 보조

**전이 효율**: 기존 코드베이스 ~65% 재사용 | 예상 공수 16주 | 풀 신규 대비 55% 절감

> [!TIP]
> 3가지 시나리오 중 **가장 높은 전이 효율**을 보입니다. CRE의 "매물 큐레이션 → 바이어 피칭" 구조가
> 유통의 "상품 큐레이션 → 유통사 피칭" 구조와 1:1로 매핑되기 때문입니다.

---

## 2. 시장 컨텍스트

### 2.1 타겟 시장

| 지표 | 수치 |
|:---|:---|
| K-뷰티 수출 유통 채널 | 약 50,000+ 해외 유통 거래선 |
| K-푸드 수출 유통 채널 | 약 30,000+ 해외 유통 거래선 |
| 국내 소비재 수출 브랜드 | 약 15,000개사 |
| 해외 한국 전문 유통사 | 약 3,000개사 (미국, 동남아 중심) |
| 한국 상품 전문 이커머스 | 약 500+ (StyleKorean, YesStyle, Olive Young Global 등) |
| 연간 K-뷰티 유통 거래 규모 | 약 6조 원 (유통 마진 포함) |

### 2.2 핵심 Pain Points

1. **유통사(바이어)**: 매 시즌 수백 개 신제품 중 자사 채널에 맞는 상품 선별에 2~4주 소요
2. **브랜드(공급사)**: 유통사마다 다른 카탈로그 양식, 가격표, 규격에 맞춘 자료 제작 반복
3. **MD/큐레이터**: 트렌드 분석 → 상품 소싱 → 가격 협상 → 카탈로그 제작 → 물류 견적까지 수작업
4. **시즌 압박**: 유통 리드타임 (3~6개월 전 발주) 때문에 의사결정 속도가 경쟁력

---

## 3. CRE DealCard와의 구조적 유사성 — 최고 적합도

### 3.1 "큐레이션" 패러다임의 일치

CRE DealCard의 본질은 **"매물 큐레이션 → 바이어 피칭"** 입니다. 유통 큐레이션 플랫폼은 이 패러다임이 거의 동일합니다:

```
CRE DealCard 핵심 플로우              유통 큐레이션 핵심 플로우
════════════════════════              ════════════════════════

① 매물(Building) 수집                ① 상품(Product) 수집
② 매물 분석 (IM 작성)                ② 상품 분석 (카탈로그 작성)
③ 매물 큐레이션 (Circle 내 선별)     ③ 상품 큐레이션 (테마별 선별)
④ 바이어 의향 매칭                   ④ 유통사 채널 매칭
⑤ 피칭 문서 (PPTX IM)               ⑤ 카탈로그 PPTX + 가격표
⑥ 미팅 → 협상 → 계약                ⑥ 바잉 미팅 → 발주 → 입고
```

### 3.2 구조 매핑 한눈에 보기

```
CRE Entity                             Curation Entity
══════════                             ════════════════

Building (매물)                    →   Product (상품)
  ├── address (주소)                →     ├── brand (브랜드)
  ├── assetType (자산유형)          →     ├── category (카테고리)
  ├── priceBand (가격대)            →     ├── pricePoint (가격대)
  ├── physical (물리 스펙)          →     ├── specs (제품 스펙)
  ├── vacancySignal (공실)          →     ├── stockStatus (재고 상태)
  ├── investmentPosture (투자목적)  →     ├── channelFit (채널 적합도)
  └── dealCuriosityScore           →     └── trendScore (트렌드 점수)

BuyerIntent (매수의향)             →   ChannelBrief (유통사 요청)
  ├── budgetRange                  →     ├── budgetPerSKU (SKU당 예산)
  ├── preferredRegions             →     ├── salesRegions (판매 지역)
  ├── assetTypes                   →     ├── productCategories
  ├── purchasePurpose              →     ├── channelType (온라인/오프라인)
  ├── mustHave                     →     ├── mustHave (필수 인증, 성분 등)
  └── buyerTemperatureScore        →     └── seasonUrgency (시즌 긴급도)

Broker (중개인)                    →   Curator/MD (큐레이터)
IM (투자제안서)                    →   Catalog (카탈로그 PPTX)
DealCard                          →   CurationCard (큐레이션 카드)
Circle (네트워크)                  →   CurationCircle (바이어 서클)
Magazine (뉴스레터)                →   TrendReport (트렌드 리포트)
Teaser (티저)                      →   ProductTeaser (상품 티저)
```

---

## 4. 도메인 엔티티 상세 설계

### 4.1 상품 (Product) — ← Building 전이

```typescript
interface Product {
  id: string;
  brandId: string;
  curatorId: string;                     // ← brokerId
  
  // ── 기본 정보 ──
  name: string;
  nameEn: string;
  brand: string;
  brandEn: string;
  category: ProductCategory;
  subcategory: string;
  
  // ── 제품 스펙 (← physical) ──
  specs: {
    volume: string;                      // "50ml", "200g"
    weight: string;                      // 순중량
    grossWeight: string;                 // 총중량 (포장 포함)
    dimensions: string;                  // W×D×H mm
    shelfLifeMonths: number;
    madeIn: string;                      // 원산지
    keyIngredients: string[];
    inciList?: string;
    fragrance: string;
    texture: string;
    skinType: string[];                  // 적합 피부 타입
  };
  
  // ── 가격 (← price & equity) ──
  pricing: {
    retailPrice: { amount: number; currency: string };
    wholesalePrice: { amount: number; currency: string };
    fobPrice: { amount: number; currency: string };
    moqTiers: MOQTier[];                 // MOQ별 단가 구간
    marginGuide: {
      suggestedRetailMargin: number;     // 권장 소비자 마진율
      wholesaleMargin: number;           // 도매 마진율
    };
  };
  
  // ── 채널 적합도 (← investmentPosture) ──
  channelFit: {
    online: number;                      // 0~100 온라인 적합도
    offline: number;                     // 0~100 오프라인 적합도
    department: number;                  // 백화점 적합도
    drugstore: number;                   // 드럭스토어 적합도
    specialty: number;                   // 전문점 적합도
    marketplace: number;                 // 마켓플레이스 적합도
  };
  
  // ── 트렌드·실적 (← dealCuriosityScore) ──
  performance: {
    trendScore: number;                  // AI 트렌드 분석 점수 (0~100)
    domesticRanking: number | null;      // 국내 카테고리 순위
    monthlySearchVolume: number | null;  // 키워드 검색량
    socialMentions: number | null;       // SNS 언급량
    awards: string[];                    // 수상 이력
  };
  
  // ── 재고·공급 (← vacancySignal) ──
  supply: {
    stockStatus: 'in_stock' | 'limited' | 'pre_order' | 'out_of_stock';
    availableQuantity: number;
    productionLeadWeeks: number;
    minimumOrderQuantity: number;
  };
  
  // ── 인증·규제 ──
  compliance: {
    certifications: Certification[];
    exportRestrictions: string[];        // 수출 제한 국가
    ingredientRestrictions: {            // 국가별 성분 규제
      country: string;
      restrictedIngredients: string[];
    }[];
  };
  
  // ── 미디어 ──
  media: {
    mainImage: string;
    gallery: string[];                   // 제품 사진들
    packagingImages: string[];           // 포장 사진
    textureShots: string[];              // 텍스처 샷
    videoUrl?: string;
  };
  
  // ── Claim Registry (← claims) ──
  claims: Claim[];
  
  // ── Release Tier ──
  tier: 'T0' | 'T1' | 'T2' | 'T3';
}

interface MOQTier {
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
  currency: string;
}

type ProductCategory =
  | 'skincare_basic'      // 기초 (토너, 로션, 크림)
  | 'skincare_functional' // 기능성 (세럼, 앰플, 아이크림)
  | 'suncare'             // 선케어
  | 'cleansing'           // 클렌징
  | 'maskpack'            // 마스크팩
  | 'makeup_face'         // 메이크업 (페이스)
  | 'makeup_eye'          // 메이크업 (아이)
  | 'makeup_lip'          // 메이크업 (립)
  | 'haircare'            // 헤어케어
  | 'bodycare'            // 바디케어
  | 'fragrance'           // 프래그런스
  | 'mens_grooming'       // 남성 그루밍
  | 'baby_kids'           // 베이비/키즈
  | 'wellness'            // 이너뷰티/건기식
  | 'tools_devices';      // 뷰티 디바이스
```

### 4.2 유통사 채널 요청서 (ChannelBrief) — ← BuyerIntent 전이

```typescript
interface ChannelBrief {
  id: string;
  buyerId: string;
  curatorId: string;
  
  // ── 채널 정보 ──
  channel: {
    type: ChannelType;
    name: string;                        // e.g., "Sephora", "Olive Young", "Amazon"
    country: string;
    region: string;                      // ← preferredRegions
    storeCount?: number;
    monthlyTraffic?: number;
  };
  
  // ── 구매 조건 (← budgetRange) ──
  buyingCriteria: {
    budgetPerSKU: { min: number; max: number; currency: string };
    targetSKUCount: number;              // 원하는 SKU 수
    preferredPricePoint: 'mass' | 'masstige' | 'prestige' | 'luxury';
    requiredMargin: number;              // 최소 유통 마진율 (%)
  };
  
  // ── 상품 요청 (← assetTypes + mustHave) ──
  productRequest: {
    categories: ProductCategory[];
    themes: CurationTheme[];             // 큐레이션 테마 (아래 정의)
    ingredients: {
      preferred: string[];               // 선호 성분 (e.g., "시카", "레티놀")
      excluded: string[];                // 제외 성분 (e.g., "파라벤", "알코올")
    };
    certifications: Certification[];     // 필수 인증
    targetConsumer: {
      ageRange: string;
      skinType: string[];
      concerns: string[];               // "주름", "미백", "보습" 등
    };
  };
  
  // ── 시즌 & 일정 ──
  timeline: {
    season: 'SS' | 'FW' | 'Holiday' | 'year_round';
    launchTarget: string;                // ISO date
    orderDeadline: string;               // 발주 마감
    deliveryDeadline: string;            // 입고 마감
    urgency: 'immediate' | 'within_month' | 'within_quarter' | 'planning';
  };
  
  // ── AI 파싱 결과 ──
  inferredChannelProfile: ChannelProfile;
  confidenceScore: number;
}

type ChannelType =
  | 'online_marketplace'   // Amazon, Shopee, Lazada
  | 'online_specialty'     // 뷰티 전문 이커머스
  | 'offline_department'   // 백화점
  | 'offline_drugstore'    // H&B / 드럭스토어
  | 'offline_specialty'    // 뷰티 전문점
  | 'offline_supermarket'  // 대형마트
  | 'subscription_box'     // 구독 박스
  | 'duty_free'            // 면세점
  | 'social_commerce';     // 라이브커머스 / SNS

type CurationTheme =
  | 'k_beauty_essentials'  // K-뷰티 입문 세트
  | 'clean_beauty'         // 클린 뷰티
  | 'glass_skin'           // 글래스 스킨
  | 'anti_aging'           // 안티에이징
  | 'trending_ingredients' // 트렌딩 성분 (시카, 병풀 등)
  | 'vegan_cruelty_free'   // 비건·크루얼티프리
  | 'men_grooming'         // 남성 그루밍
  | 'seasonal_set'         // 시즌 한정 세트
  | 'value_for_money'      // 가성비
  | 'luxury_premium';      // 럭셔리/프리미엄
```

### 4.3 큐레이션 세트 (CurationSet) — 신규 (CRE에 없는 핵심 개념)

```typescript
// 큐레이터가 선별한 "상품 세트" — 유통 제안의 핵심 단위
interface CurationSet {
  id: string;
  curatorId: string;
  briefId: string;                       // 연결된 ChannelBrief
  
  name: string;                          // e.g., "2026 FW K-Beauty Essentials for Sephora"
  theme: CurationTheme;
  description: string;
  
  products: CuratedProduct[];
  
  // ── 세트 레벨 가격 ──
  setPrice: {
    totalWholesale: number;
    totalRetail: number;
    averageMargin: number;               // 평균 유통 마진
    currency: string;
  };
  
  // ── 물류 견적 ──
  logistics: {
    totalWeight: number;                 // kg
    totalVolume: number;                 // CBM
    shippingCost: {
      sea: number;                       // 해상
      air: number;                       // 항공
      express: number;                   // 특송
    };
    deliveryTerms: 'FOB' | 'CIF' | 'DDP';
  };
  
  // ── AI 분석 ──
  aiAnalysis: {
    trendAlignment: number;              // 트렌드 적합도 (0~100)
    channelFitScore: number;             // 채널 적합도 (0~100)
    marginOptimality: number;            // 마진 최적화 점수 (0~100)
    competitivenessScore: number;        // 경쟁력 점수 (0~100)
    reasoning: string;                   // AI 큐레이션 근거
  };
  
  status: 'draft' | 'proposed' | 'revised' | 'accepted' | 'ordered';
}

interface CuratedProduct {
  productId: string;
  product: Product;
  
  // ── 큐레이터 어노테이션 ──
  curatorNote: string;                   // MD의 추천 코멘트
  highlightReasons: string[];            // 선정 이유
  suggestedRetailPrice: number;          // 현지 권장 소비자가
  suggestedQuantity: number;             // 권장 발주 수량
  displayPriority: 'hero' | 'featured' | 'lineup';
  
  // ── 상품 포지셔닝 ──
  positioning: {
    competitorProducts: string[];        // 현지 경쟁 제품
    differentiators: string[];           // 차별화 포인트
    targetShelfPlacement: string;        // 진열 위치 제안
  };
}
```

---

## 5. 매칭 엔진 전이 — "채널-상품 적합도" 특화

### 5.1 3-Stage Pipeline 전이

```
┌─────────────────────────────────────────────────────────┐
│  Stage 1: Hard Filter                                   │
│  ─────────────────                                      │
│  ✗ 카테고리 불일치                                       │
│  ✗ 가격대 불일치 (도매가 > 유통사 SKU당 예산)             │
│  ✗ 필수 인증 미보유                                      │
│  ✗ 제외 성분 포함                                        │
│  ✗ 수출 제한 국가                                        │
│  ✗ 재고 없음 (out_of_stock)                              │
│  ✗ 시즌 리드타임 초과                                     │
└──────────────────────────┬──────────────────────────────┘
                           │ Pass
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 2: Semantic Similarity                           │
│  ─────────────────────────                              │
│  상품 프로필 텍스트 ↔ 채널 요청 텍스트                    │
│  (제품설명 + 성분 + 타겟소비자 + 브랜드스토리)             │
│  ↔ (채널특성 + 소비자층 + 트렌드테마 + 선호성분)          │
│  → OpenAI embedding 코사인 유사도                        │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 3: Ensemble Scoring                              │
│  ──────────────────────                                 │
│  채널 유형별 가중치 적용 → S/A/B/C 등급                   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 채널 유형별 가중치 (PURPOSE_WEIGHTS 전이)

```typescript
type ChannelProfile =
  | 'mass_market'       // 대중 시장 (드럭스토어, 마트)
  | 'prestige'          // 프레스티지 (백화점, 세포라)
  | 'online_volume'     // 온라인 대량 (아마존, 쇼피)
  | 'specialty_niche'   // 전문 니치 (비건 전문, 남성 전문)
  | 'subscription'      // 구독 (뷰티박스)
  | 'duty_free';        // 면세점

export const CHANNEL_WEIGHTS: Record<ChannelProfile, Record<string, number>> = {
  // 대중 시장: 가격 경쟁력 + 대량 공급 안정성
  mass_market: {
    price: 0.35,
    trend: 0.15,
    quality: 0.15,
    supply: 0.20,        // 재고 안정성
    semantic: 0.15,
  },

  // 프레스티지: 품질 + 브랜드 스토리 + 트렌드
  prestige: {
    price: 0.10,
    trend: 0.25,
    quality: 0.30,
    supply: 0.10,
    semantic: 0.25,      // 브랜드 스토리·포지셔닝
  },

  // 온라인 대량: 가격 + 물류 + 트렌드(검색량)
  online_volume: {
    price: 0.30,
    trend: 0.25,         // 검색량·SNS 언급량
    quality: 0.10,
    supply: 0.25,        // 물류 효율성
    semantic: 0.10,
  },

  // 전문 니치: 시맨틱 적합도 극대화
  specialty_niche: {
    price: 0.10,
    trend: 0.20,
    quality: 0.25,
    supply: 0.10,
    semantic: 0.35,      // 테마·컨셉 적합도
  },

  // 구독 박스: 트렌드 + 유니크함
  subscription: {
    price: 0.20,
    trend: 0.30,         // 신선함·트렌디함
    quality: 0.15,
    supply: 0.10,
    semantic: 0.25,      // 발견의 재미
  },

  // 면세점: 프리미엄 + 여행자 어필
  duty_free: {
    price: 0.15,
    trend: 0.20,
    quality: 0.25,
    supply: 0.15,
    semantic: 0.25,      // K-뷰티 대표성
  },
};
```

### 5.3 큐레이션 특화: 세트 최적화 알고리즘 (신규)

```typescript
// 단일 상품 매칭을 넘어, "세트 구성 최적화"가 핵심 차별화
interface SetOptimizationInput {
  brief: ChannelBrief;
  candidateProducts: (Product & { matchScore: number })[];
  constraints: {
    targetSKUCount: number;
    totalBudget: number;
    categoryDistribution: Record<ProductCategory, { min: number; max: number }>;
    pricePointMix: {
      entry: number;       // 엔트리 가격대 비율 (%)
      mid: number;         // 중간 가격대 비율 (%)
      premium: number;     // 프리미엄 가격대 비율 (%)
    };
    brandDiversity: number; // 최소 브랜드 다양성 (0~1)
  };
}

interface SetOptimizationOutput {
  recommendedSet: CuratedProduct[];
  
  // 세트 최적화 메트릭
  metrics: {
    avgMatchScore: number;         // 평균 매칭 점수
    categoryBalance: number;       // 카테고리 균형 점수
    pricePointBalance: number;     // 가격대 분산 점수
    brandDiversity: number;        // 브랜드 다양성 점수
    trendCoverage: number;         // 트렌드 커버리지
    overallCurationScore: number;  // 종합 큐레이션 점수
  };
  
  // AI 추천 이유
  reasoning: string;
  
  // 대안 세트
  alternativeSets: {
    name: string;                  // e.g., "가성비 최적화", "프리미엄 집중"
    products: CuratedProduct[];
    metrics: typeof metrics;
  }[];
}
```

---

## 6. PPTX 카탈로그 생성 — 핵심 문서

### 6.1 유통 카탈로그 슬라이드 시퀀스 (12~20 슬라이드)

유통 큐레이션 플랫폼의 **킬러 피처**는 카탈로그 PPTX 자동 생성입니다.

| 순서 | CRE 아키타입 | 카탈로그 슬라이드 | 내용 |
|:---|:---|:---|:---|
| 1 | A01 Cover | **Catalog Cover** | 큐레이션 테마 + 시즌 + 유통사명 |
| 2 | A25 Chapter | **Theme Introduction** | 큐레이션 테마 소개 + 트렌드 키워드 |
| 3 | A02 Stat Grid | **Market Overview** | 트렌드 지표 6개 (검색량, 성장률 등) |
| 4 | A04 Asymmetric 7:5 | **Hero Product** | 대표 상품 상세 + 제품 사진 |
| 5~8 | A14 Gallery (반복) | **Product Cards** | 상품별 카드 (사진+스펙+가격) |
| 9 | A03 Large Table | **Product Lineup** | 전체 라인업 비교표 (8열) |
| 10 | A03 Large Table | **Price List** | MOQ별 단가표 + 유통 마진 가이드 |
| 11 | A05 Asymmetric 7:4 | **Why K-Beauty** | K-뷰티 트렌드·소비자 인사이트 |
| 12 | A22 Stacking Plan | **Shelf Plan** | 매대 진열 제안 (시각화) |
| 13 | A16 Investment Structure | **Cost Structure** | FOB/CIF 비용 구조 + 마진 시뮬레이션 |
| 14 | A06 Diagram | **Logistics Flow** | 공급망 플로우 다이어그램 |
| 15 | A18 Checklist | **Import Checklist** | 수입 절차 체크리스트 (국가별) |
| 16 | A10 Closing | **Order Form & Contact** | 발주서 양식 + 담당자 QR코드 |

### 6.2 채널별 카탈로그 변형

```typescript
const CATALOG_PROFILES: Record<ChannelProfile, CatalogProfile> = {
  mass_market: {
    slideCount: { min: 10, max: 14 },
    emphasis: ['price_comparison', 'volume_tiers', 'logistics'],
    heroProductCount: 1,
    productCardsPerSlide: 4,          // 밀도 높게
    priceDisplay: 'wholesale_with_margin',
    tone: '효율적·실용적',
  },
  prestige: {
    slideCount: { min: 14, max: 20 },
    emphasis: ['brand_story', 'ingredients', 'awards', 'consumer_insights'],
    heroProductCount: 3,              // 히어로 상품 강조
    productCardsPerSlide: 2,          // 여유 있게
    priceDisplay: 'retail_with_positioning',
    tone: '프리미엄·스토리텔링',
  },
  online_volume: {
    slideCount: { min: 10, max: 12 },
    emphasis: ['search_volume', 'reviews', 'shipping_speed', 'content_ready'],
    heroProductCount: 1,
    productCardsPerSlide: 4,
    priceDisplay: 'fob_with_landed_cost',
    tone: '데이터 드리븐·실적 중심',
  },
  specialty_niche: {
    slideCount: { min: 12, max: 16 },
    emphasis: ['unique_story', 'ingredient_deep_dive', 'certifications'],
    heroProductCount: 2,
    productCardsPerSlide: 2,
    priceDisplay: 'retail_premium',
    tone: '전문적·교육적',
  },
  subscription: {
    slideCount: { min: 8, max: 10 },
    emphasis: ['unboxing_experience', 'sample_sizes', 'novelty'],
    heroProductCount: 0,              // 모든 상품 동등
    productCardsPerSlide: 3,
    priceDisplay: 'per_box_cost',
    tone: '재미있는·발견의 즐거움',
  },
  duty_free: {
    slideCount: { min: 12, max: 16 },
    emphasis: ['brand_story', 'exclusive_sets', 'gift_packaging'],
    heroProductCount: 2,
    productCardsPerSlide: 2,
    priceDisplay: 'duty_free_retail',
    tone: '럭셔리·기프트',
  },
};
```

### 6.3 A22 Stacking Plan → Shelf Plan 전이

CRE의 **건물 층별 적층도(Stacking Plan)**가 유통에서는 **매대 진열 제안도(Shelf Plan)**로 전이됩니다:

```typescript
// CRE: 건물 각 층의 임차인·용도·면적을 시각화
// 유통: 매대 각 칸의 상품·카테고리·가격대를 시각화

interface ShelfPlan {
  shelfId: string;
  type: 'gondola' | 'endcap' | 'wall' | 'island' | 'counter';
  rows: ShelfRow[];
}

interface ShelfRow {
  position: 'eye_level' | 'reach' | 'stoop' | 'top';   // 진열 높이
  products: {
    productId: string;
    facings: number;             // 페이싱 수
    category: ProductCategory;
    pricePoint: string;
  }[];
}

// A22 아키타입의 "층별 박스 그리기" 로직을 
// "선반별 상품 블록 그리기"로 전이
```

---

## 7. 트렌드 분석 엔진 (신규 — CRE의 prediction 전이)

### 7.1 CRE 가격 예측 → 트렌드 예측

```typescript
// CRE: src/domain/prediction/ → 부동산 가격 예측
// 유통: 뷰티 트렌드 예측

interface TrendAnalysis {
  category: ProductCategory;
  ingredient: string;                    // 주목 성분 (e.g., "레티놀", "시카")
  
  signals: {
    searchVolumeGrowth: number;          // 검색량 증가율 (%)
    socialMentionGrowth: number;         // SNS 언급 증가율 (%)
    newProductLaunches: number;          // 신제품 출시 수
    competitorAdoption: number;          // 경쟁사 채택률
    expertEndorsements: number;          // 전문가 추천 수
  };
  
  trendPhase: 'emerging' | 'growing' | 'peak' | 'maturing' | 'declining';
  trendScore: number;                    // 0~100
  confidenceLevel: number;              // 0~1
  
  // CRE의 dealCuriosityScore와 동일한 역할
  recommendation:
    | 'first_mover'       // 선점 기회 (emerging)
    | 'strong_bet'        // 확실한 투자 (growing)
    | 'safe_play'         // 안전한 선택 (peak)
    | 'late_entry'        // 후발 진입 (maturing)
    | 'avoid';            // 회피 권장 (declining)
}
```

---

## 8. Quality Gates

```
Gate Code        기원             설명
─────────        ────             ─────────────────────────────────────
G-CU-01          G30              T0 상품 카탈로그 포함 차단
G-CU-02          G31              공급사 원가 정보 마스킹 (유통사 제안서에서)
G-CU-03          G35              과장 마케팅 문구 검출
G-CU-04          G40              도매가 > 소매가 역전 감지
G-CU-05          G40              MOQ별 단가 비논리적 역전 감지
G-CU-06          G45              제품 사진 150DPI / 최소 500px 이상
G-CU-07          G49              Claim evidence ≥ 1
G-CU-08          G50              유통 마진율 비현실적 범위 (< 10% 또는 > 80%) 경고
G-CU-09          신규              제외 성분 포함 상품 카탈로그 혼입 차단
G-CU-10          신규              인증서 유효기간 만료 상품 차단
G-CU-11          신규              시즌 마감일 초과 납기 상품 경고
G-CU-12          신규              세트 내 브랜드 다양성 최소 기준 미달 경고
G-CU-13          신규              세트 가격대 분산 최소 기준 미달 경고
G-CU-14          신규              카탈로그 슬라이드 수 상한 초과 차단 (hardLimit)
```

---

## 9. 데이터베이스 스키마

```sql
-- ── 상품 ──
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id),
  curator_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  name_en TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  specs JSONB DEFAULT '{}',
  pricing JSONB DEFAULT '{}',
  channel_fit JSONB DEFAULT '{}',
  performance JSONB DEFAULT '{}',
  supply JSONB DEFAULT '{}',
  compliance JSONB DEFAULT '{}',
  media JSONB DEFAULT '{}',
  claim_registry JSONB DEFAULT '[]',
  tier TEXT DEFAULT 'T0',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 브랜드 ──
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  name_en TEXT,
  country TEXT DEFAULT 'KR',
  story TEXT,
  story_en TEXT,
  logo_url TEXT,
  certifications JSONB DEFAULT '[]',
  tier TEXT DEFAULT 'T0',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 채널 요청 ──
CREATE TABLE channel_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id),
  curator_id UUID REFERENCES profiles(id),
  channel JSONB NOT NULL,
  buying_criteria JSONB NOT NULL,
  product_request JSONB NOT NULL,
  timeline JSONB NOT NULL,
  inferred_channel_profile TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 큐레이션 세트 ──
CREATE TABLE curation_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID REFERENCES profiles(id),
  brief_id UUID REFERENCES channel_briefs(id),
  name TEXT NOT NULL,
  theme TEXT,
  products JSONB DEFAULT '[]',
  set_price JSONB DEFAULT '{}',
  logistics JSONB DEFAULT '{}',
  ai_analysis JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 파이프라인 인프라 (100% 재사용) ──
-- stage_runs, artifact_envelopes, approval_events → 그대로
```

---

## 10. API Routes

| CRE Route | Curation Route | 설명 |
|:---|:---|:---|
| `POST /broker/deal-card/from-memo` | `POST /curator/brief/from-memo` | 메모 → 채널 요청서 파싱 |
| `POST /broker/match` | `POST /curator/match/products` | 상품 매칭 |
| `POST /broker/im-lite/generate-async` | `POST /curator/catalog/generate-async` | 카탈로그 비동기 생성 |
| `GET /broker/im-lite/job-status` | `GET /curator/catalog/job-status` | 생성 상태 |
| `POST /broker/im-lite/[id]/approve` | `POST /curator/catalog/[id]/approve` | 카탈로그 승인 |
| `GET /public/im-lite/[id]/pptx` | `GET /public/catalog/[id]/pptx` | PPTX 다운로드 |
| `POST /broker/circles/[id]/match` | `POST /curator/circles/[id]/match` | 서클 내 매칭 |
| `GET /cron/weekly-magazine` | `GET /cron/trend-report` | 트렌드 리포트 |
| `POST /broker/pitch` | `POST /curator/pitch` | 바이어 피칭 |
| 신규 | `POST /curator/curation-set/optimize` | 세트 최적화 |
| 신규 | `POST /curator/trend/analyze` | 트렌드 분석 |
| 신규 | `GET /curator/shelf-plan/generate` | 진열 제안도 생성 |
| 신규 | `POST /curator/logistics/estimate` | 물류비 견적 |

---

## 11. 프론트엔드 구조

```
src/app/
├── (public)/
│   ├── catalog/[catalogId]/             ← im-lite 전이 (카탈로그 웹뷰)
│   │   ├── page.tsx                     반응형 모바일 카탈로그 뷰어
│   │   └── pptx/                        PPTX 다운로드
│   ├── brand/[brandId]/                 ← building-radar 전이 (브랜드 페이지)
│   ├── trend-report/                    ← pulse 전이 (트렌드 리포트)
│   └── search/                          ← search 전이 (상품 검색)
│
├── (curator)/                           ← (broker) 전이
│   ├── dashboard/                       메인 대시보드
│   │   ├── pipeline/                    딜 파이프라인 칸반 보드
│   │   └── trends/                      트렌드 대시보드
│   ├── products/                        ← buildings 전이 (상품 관리)
│   │   ├── [id]/                        상품 상세
│   │   └── import/                      대량 등록 (엑셀 업로드)
│   ├── brands/                          브랜드 관리
│   ├── briefs/                          채널 요청서 관리
│   │   ├── new/                         신규 요청서 입력
│   │   └── [id]/                        요청서 상세
│   ├── curation/                        큐레이션 워크스페이스 (핵심)
│   │   ├── [briefId]/                   큐레이션 작업 화면
│   │   ├── [briefId]/catalog-studio/    ← basic-im-studio 전이 (카탈로그 편집)
│   │   └── [briefId]/shelf-plan/        진열 제안도 편집 (신규)
│   ├── matching/                        ← matching 전이
│   └── circles/                         ← circles 전이
│
├── (brand)/                             신규 (브랜드 셀프서비스 포털)
│   ├── profile/                         브랜드 프로필
│   ├── products/                        제품 등록/관리
│   ├── orders/                          주문 현황
│   └── analytics/                       판매 분석
│
└── (admin)/                             그대로 전이
```

---

## 12. SSOT YAML 설정

```yaml
# credeal/ssot/curation.yaml

ontology:
  productCategories:
    - skincare_basic
    - skincare_functional
    - suncare
    - cleansing
    - maskpack
    - makeup_face
    - makeup_eye
    - makeup_lip
    - haircare
    - bodycare
    - fragrance
    - mens_grooming
    - baby_kids
    - wellness
    - tools_devices
    
  channelTypes:
    - online_marketplace
    - online_specialty
    - offline_department
    - offline_drugstore
    - offline_specialty
    - offline_supermarket
    - subscription_box
    - duty_free
    - social_commerce
    
  channelProfiles:
    - mass_market
    - prestige
    - online_volume
    - specialty_niche
    - subscription
    - duty_free
    
  curationThemes:
    - k_beauty_essentials
    - clean_beauty
    - glass_skin
    - anti_aging
    - trending_ingredients
    - vegan_cruelty_free
    - men_grooming
    - seasonal_set
    - value_for_money
    - luxury_premium

catalog:
  maxSlides: 20
  hardLimit: 24
  
  slides:
    cover:
      maxTitleChars: 50
      includeSeasonBadge: true
    productCard:
      photoMinDPI: 150
      minPhotoWidth: 500
      maxDescChars: 120
      priceDisplay: ['wholesale', 'retail', 'margin']
    priceTable:
      maxRows: 30
      columns: ['제품명', '카테고리', 'MOQ', '도매가', '소매가(참고)', '마진율']

lexicon:
  prohibited:
    - "최저가"
    - "독점 공급"           # 사실 확인 필요
    - "100% 천연"
    - "의학적 효능"          # 화장품 표시광고법 위반
  mandatory:
    fob: "FOB (Free On Board)"
    moq: "MOQ (Minimum Order Quantity)"
    sku: "SKU (Stock Keeping Unit)"
    msrp: "MSRP (Manufacturer's Suggested Retail Price)"

gating:
  photoMinDPI: 150
  photoMinWidth: 500
  maxSlidesHard: 24
  evidenceMinCount: 1
  marginWarningMin: 10
  marginWarningMax: 80
  priceReversalBlock: true
  excludedIngredientBlock: true
```

---

## 13. 개발 일정 상세 (16주)

| 주차 | Phase | 작업 항목 | 산출물 |
|:---|:---|:---|:---|
| W1~2 | Foundation | 도메인 모델 (Product, Brand, ChannelBrief, CurationSet) | TypeScript 타입 |
| W3 | Foundation | SSOT YAML + 온톨로지 + DB 스키마 | 마이그레이션 |
| W4 | Foundation | 상품 대량 등록 (엑셀 파서) | xlsx 파서 전이 |
| W5~6 | Engine | 매칭 엔진 전이 + 채널별 가중치 | `matching-engine.ts` |
| W7 | Engine | 세트 최적화 알고리즘 | `set-optimizer.ts` |
| W8 | Engine | 트렌드 분석 + 수출 게이트 | `trend-engine.ts` |
| W9~10 | Document | 카탈로그 PPTX 아키타입 (16슬라이드) | 아키타입 전이 |
| W11 | Document | 채널별 카탈로그 변형 + 진열제안도 | 프로파일별 분기 |
| W12~13 | Frontend | 큐레이터 대시보드 + 큐레이션 워크스페이스 | 핵심 UI |
| W14 | Frontend | 상품 관리 + 카탈로그 스튜디오 | 편집기 전이 |
| W15 | Frontend | 브랜드 포털 + 트렌드 대시보드 | 셀프서비스 |
| W16 | Polish | E2E 테스트 + 배포 + QA | 프로덕션 |

---

## 14. 경쟁 우위 요약

| 기존 방식 | 유통 큐레이션 플랫폼 |
|:---|:---|
| MD의 감에 의한 상품 선정 | AI 3-Stage 매칭 + 트렌드 분석 |
| 브랜드별 카탈로그 수작업 합치기 | 자동 큐레이션 세트 + PPTX 카탈로그 생성 |
| 진열 제안 = PPT 수동 작업 | A22 Stacking Plan → Shelf Plan 자동 시각화 |
| 가격표 = 엑셀 이메일 첨부 | 인터랙티브 견적 + 마진 시뮬레이션 |
| 트렌드 파악 = SNS 서핑 | AI 트렌드 스코어 (검색량+SNS+신제품 분석) |
| 채널별 맞춤화 = 수동 | 6가지 채널 프로파일 자동 분기 |
| 공급사 검증 없음 | Claim & Evidence + Tier 체계 |
| 물류비 = 포워더에 매번 문의 | 자동 물류비 견적 (해상/항공/특송) |

---

## 15. 유통 큐레이션이 전이 효율 최고인 이유

```
재사용률 비교:
                OEM 매칭    수출 에이전트   유통 큐레이션
매칭 엔진        70%         60%           75% ← 최고
PPTX 파이프라인  50%         55%           70% ← 최고 (카탈로그≈IM)
도메인 모델      20%         25%           35% ← 최고 (Product≈Building)
UI 컴포넌트      60%         55%           70% ← 최고
Gate 시스템      80%         75%           85% ← 최고
전체 평균        ~60%        ~55%          ~65% ← 최고
```

> [!IMPORTANT]
> **유통 큐레이션은 CRE의 핵심 패러다임("매물 큐레이션 → 바이어 피칭")과 가장 구조적으로 일치**합니다.
> Product ↔ Building, ChannelBrief ↔ BuyerIntent, Catalog ↔ IM 의 매핑이 자연스러워
> 전이 시 **가장 적은 신규 코드**로 **가장 빠른 MVP 출시**가 가능합니다.
