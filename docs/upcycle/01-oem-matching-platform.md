# 전이 개발 분석 보고서 ① — K-뷰티 OEM 매칭 플랫폼

> **문서 코드**: UPCYCLE-01-OEM  
> **작성일**: 2026-09-26  
> **원본 시스템**: CRE DealCard (cre-dealcard)  
> **타겟 시스템**: K-Beauty OEM Matching Platform  

---

## 1. Executive Summary

해외 바이어의 OEM/ODM 제조 요청(RFQ)을 AI로 구조화하고, 국내 화장품 OEM 공장과 자동 매칭하여, 제안서·견적서를 PPTX/PDF로 즉시 생성하는 B2B 매칭 플랫폼.

**핵심 가치 제안 (Value Proposition)**:
- 바이어: 요청서 한 장으로 최적 OEM 파트너 3~5개사 매칭 + 비교 제안서 자동 수신
- 공급사: 해외 바이어 접근 기회 확대 + AI 기반 전문 제안서 자동 생성
- 에이전트: 매칭·중개 업무의 80% 자동화 → 볼륨 확대

**전이 효율**: 기존 코드베이스 ~60% 재사용 | 예상 공수 18주 | 풀 신규 대비 50% 절감

---

## 2. 시장 컨텍스트

### 2.1 K-뷰티 OEM 시장 규모
| 지표 | 수치 |
|:---|:---|
| 국내 화장품 OEM/ODM 시장 | 약 8조 원 (2025) |
| 수출 비중 | 전체 생산의 ~40% |
| OEM 제조사 수 | 약 2,000+ 업체 |
| 주요 수출국 | 미국, 중국, 일본, 동남아, EU, 중동 |
| 연평균 성장률 (CAGR) | 12~15% |

### 2.2 현재 매칭 프로세스의 Pain Point
1. **바이어 측**: 적합한 OEM 공장 탐색에 평균 2~3개월 소요
2. **공급사 측**: 영문 제안서 작성 역량 부족, 견적 응답 지연 (평균 5~7일)
3. **에이전트 측**: 수작업 매칭, 엑셀 기반 견적, 반복적 문서 작성
4. **신뢰 문제**: 공장 인증·생산 캐파·품질 이력의 검증이 불투명

---

## 3. 도메인 엔티티 매핑

### 3.1 핵심 엔티티 전이 맵

```
CRE DealCard                          K-Beauty OEM Platform
═══════════════                        ═══════════════════════

Building (매물)                    →   Supplier (공급사/OEM공장)
├── address                        →   ├── factoryLocation (공장 위치)
├── physical (면적, 층수)           →   ├── capacity (생산 캐파, 라인수)
├── assetType (자산유형)            →   ├── specialization (전문 분야)
├── priceBand                      →   ├── priceRange (단가 범위)
├── vacancySignal (공실)            →   ├── availableCapacity (여유 캐파)
├── investmentPosture              →   ├── serviceType (OEM/ODM/OBM)
└── buildingUse (용도)              →   └── productCategory (제품군)

BuyerIntent (매수의향)             →   BuyerRFQ (바이어 견적요청)
├── budgetRange                    →   ├── budgetRange (예산 범위)
├── preferredRegions               →   ├── targetMarkets (수출 대상국)
├── assetTypes                     →   ├── productCategories (제품 카테고리)
├── purchasePurpose                →   ├── tradePurpose (OEM/ODM/PL/유통)
├── mustHave                       →   ├── mustHave (필수 인증, MOQ 조건)
├── niceToHave                     →   ├── niceToHave (선호 포장, 부가서비스)
├── riskTolerance                  →   ├── qualityStandard (품질 기준)
└── buyerTemperatureScore          →   └── urgencyScore (긴급도)

Broker (중개인)                    →   TradeAgent (무역 에이전트)
├── profile                        →   ├── profile
├── circles                        →   ├── tradeCircles (거래 서클)
└── dealPipeline                   →   └── dealPipeline

IM (투자제안서)                    →   Proposal (제안서/견적서)
├── cover                          →   ├── cover (공급사 소개 커버)
├── statGrid                       →   ├── keyMetrics (MOQ, 리드타임 등)
├── analysis                       →   ├── productProposal (제품 제안)
├── financials                     →   ├── quotation (견적 상세)
└── closing                        →   └── termsAndContact (거래조건)

DealCard                          →   DealCard (딜 카드)
Gate (승인 게이트)                 →   ComplianceGate (수출 규제 게이트)
Circle (브로커 서클)               →   TradeCircle (거래 서클)
Magazine (뉴스레터)                →   MarketIntelligence (시장 리포트)
```

### 3.2 신규 엔티티 (CRE에 없는 것)

```typescript
// ── 제품 카탈로그 ──
interface ProductCatalog {
  supplierId: string;
  products: ProductEntry[];
}

interface ProductEntry {
  productId: string;
  category: ProductCategory;
  subcategory: string;                    // e.g., "에센스", "세럼", "크림"
  formulationType: 'stock' | 'custom' | 'modify';
  moqRange: { min: number; max: number }; // 최소/최대 발주량
  unitPriceRange: PriceBand;              // MOQ별 단가 구간
  leadTimeWeeks: { min: number; max: number };
  availableCertifications: Certification[];
  sampleAvailable: boolean;
  sampleCost: number;
  keyIngredients: string[];               // 핵심 성분
  inciList?: string;                      // INCI 전성분
  packagingOptions: PackagingOption[];
}

type ProductCategory =
  | 'skincare' | 'makeup' | 'haircare' | 'bodycare'
  | 'suncare' | 'maskpack' | 'cleansing' | 'fragrance'
  | 'mens_grooming' | 'baby_kids' | 'oral_care'
  | 'supplement' | 'device';

type Certification =
  | 'CGMP' | 'ISO22716' | 'ISO9001' | 'ISO14001'
  | 'FDA_OTC' | 'EU_CPNP' | 'Halal' | 'Vegan'
  | 'EWG_Verified' | 'COSMOS' | 'Ecocert'
  | 'China_NMPA' | 'Japan_PMDA' | 'ASEAN_AHCR';

// ── 견적 ──
interface Quotation {
  quotationId: string;
  rfqId: string;
  supplierId: string;
  items: QuotationLineItem[];
  toolingCost: number;           // 금형·포장 초기비용
  certificationCost: number;     // 인증 취득 비용
  shippingEstimate: number;      // 예상 운송비 (FOB/CIF/DDP)
  totalProjectCost: number;
  deliveryTerms: 'FOB' | 'CIF' | 'DDP' | 'EXW';
  paymentTerms: string;          // e.g., "30% deposit, 70% before shipment"
  validUntil: string;            // ISO date
  currency: 'USD' | 'EUR' | 'KRW';
  notes: string;
}

interface QuotationLineItem {
  productId: string;
  productName: string;
  moq: number;
  unitPrice: number;
  totalPrice: number;
  leadTimeWeeks: number;
  packaging: PackagingSpec;
}
```

---

## 4. 매칭 엔진 전이 설계

### 4.1 3-Stage Pipeline — 구조 유지, 가중치 교체

```
┌─────────────────────────────────────────────────────────┐
│  Stage 1: Hard Filter (규칙 기반 즉시 탈락)              │
│  ─────────────────────────────────────────               │
│  ✗ 제품 카테고리 불일치                                   │
│  ✗ MOQ 범위 초과 (바이어 요구 < 공급사 최소MOQ)            │
│  ✗ 필수 인증 미보유 (바이어가 FDA 요구 → 공급사 미보유)     │
│  ✗ 대상국 수출 불가 (수출 금지 / 미등록 성분)              │
│  ✗ 리드타임 초과 (바이어 납기 < 공급사 최소 리드타임)       │
└──────────────────────────┬──────────────────────────────┘
                           │ Pass
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 2: Semantic Similarity (임베딩 유사도)             │
│  ─────────────────────────────────────────               │
│  공급사 프로필 텍스트 ↔ 바이어 RFQ 텍스트                  │
│  (전문분야 + 핵심성분 + 인증 + 실적)                      │
│  ↔ (제품요구 + 타겟시장 + 품질기준 + 선호조건)             │
│  → OpenAI text-embedding-3-small 코사인 유사도            │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 3: Ensemble Scoring (목적별 가중치 앙상블)          │
│  ─────────────────────────────────────────               │
│  OEM:   { price: 0.30, quality: 0.25, capacity: 0.20,  │
│           semantic: 0.25 }                               │
│  ODM:   { price: 0.20, quality: 0.30, capacity: 0.15,  │
│           semantic: 0.35 }                               │
│  PL:    { price: 0.25, quality: 0.35, capacity: 0.15,  │
│           semantic: 0.25 }                               │
│  → S/A/B/C 등급 산출                                     │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Hard Filter 전이 코드 (수정 범위)

```typescript
// 기존: src/domain/matching/matching-engine.ts → runHardFilter()

// 전이 후:
export function runHardFilter(input: OEMMatchInput): Stage1Result {
  const { supplier, rfq } = input;
  const failReasons: string[] = [];

  // 1. 제품 카테고리 체크 (← assetType 체크 전이)
  if (rfq.productCategories.length > 0) {
    const categoryMatch = matchProductCategory(
      supplier.specialization, rfq.productCategories
    );
    if (!categoryMatch) {
      failReasons.push(
        `제품 카테고리 불일치: ${supplier.specialization} ∉ [${rfq.productCategories.join(', ')}]`
      );
    }
  }

  // 2. MOQ 체크 (← budget 체크 전이)
  if (rfq.desiredQuantity < supplier.minMOQ) {
    failReasons.push(
      `MOQ 불일치: 바이어 요구 ${rfq.desiredQuantity}pcs < 공급사 최소 ${supplier.minMOQ}pcs`
    );
  }

  // 3. 필수 인증 체크 (← mustHave 체크 전이)
  const missingCerts = rfq.requiredCertifications.filter(
    cert => !supplier.certifications.includes(cert)
  );
  if (missingCerts.length > 0) {
    failReasons.push(
      `필수 인증 미보유: [${missingCerts.join(', ')}]`
    );
  }

  // 4. 수출 대상국 규제 체크 (← region 체크 전이 + 신규 규제 로직)
  const blockedMarkets = rfq.targetMarkets.filter(
    market => !supplier.exportableMarkets.includes(market)
  );
  if (blockedMarkets.length > 0) {
    failReasons.push(
      `수출 불가 시장: [${blockedMarkets.join(', ')}]`
    );
  }

  // 5. 리드타임 체크 (신규)
  if (rfq.maxLeadTimeWeeks && supplier.minLeadTimeWeeks > rfq.maxLeadTimeWeeks) {
    failReasons.push(
      `리드타임 초과: 공급사 최소 ${supplier.minLeadTimeWeeks}주 > 바이어 요구 ${rfq.maxLeadTimeWeeks}주`
    );
  }

  return { passed: failReasons.length === 0, failReasons };
}
```

### 4.3 가중치 프로파일 (PURPOSE_WEIGHTS 전이)

```typescript
// 기존 CRE: income, owner_occupied, development, operating, trading, gift
// 전이 후:

export const TRADE_PURPOSE_WEIGHTS: Record<TradeProfile, Record<string, number>> = {
  // OEM (가격 민감, 캐파 중요)
  oem: {
    price: 0.30,      // 단가 경쟁력
    quality: 0.25,     // 품질 인증·실적
    capacity: 0.20,    // 생산 캐파·여유분
    semantic: 0.25,    // 전문성·적합도
  },

  // ODM (R&D 역량 중시)
  odm: {
    price: 0.20,
    quality: 0.30,     // R&D 역량 + 품질
    capacity: 0.15,
    semantic: 0.35,    // 전문 분야 시맨틱 매칭 강화
  },

  // Private Label (품질+브랜딩 중시)
  private_label: {
    price: 0.25,
    quality: 0.35,     // 프리미엄 품질·디자인
    capacity: 0.15,
    semantic: 0.25,
  },

  // 대량 유통 (가격+캐파 중시)
  bulk_distribution: {
    price: 0.35,
    quality: 0.15,
    capacity: 0.30,    // 대량 생산 역량
    semantic: 0.20,
  },

  // 프리미엄 소량 (품질+전문성 극대화)
  premium_niche: {
    price: 0.10,
    quality: 0.40,
    capacity: 0.10,
    semantic: 0.40,
  },

  default: {
    price: 0.25,
    quality: 0.25,
    capacity: 0.25,
    semantic: 0.25,
  },
};
```

---

## 5. PPTX 제안서 아키타입 설계

### 5.1 OEM 매칭 제안서 슬라이드 시퀀스 (9~12 슬라이드)

| 순서 | CRE 아키타입 원본 | OEM 전이 슬라이드 | 내용 |
|:---|:---|:---|:---|
| 1 | A01 Cover | **Company Cover** | 공급사 로고 + 제안 제목 + 날짜 |
| 2 | A02 Stat Grid | **Key Metrics** | MOQ / 리드타임 / 인증수 / 수출국수 / 연매출 / 설립연도 |
| 3 | A04 Asymmetric 7:5 | **Factory Profile** | 공장 스펙 (라인수, 면적, 일생산량) + 공장 사진 |
| 4 | A14 Gallery | **Product Gallery** | 대표 제품 6개 사진 갤러리 |
| 5 | A03 Large Table | **MOQ Price Table** | MOQ별 단가표 (3000/5000/10000/50000pcs) |
| 6 | A05 Asymmetric 7:4 | **Why Us** | 차별화 포인트 + 수치 카드 (수율, 불량률 등) |
| 7 | A18 Checklist | **Certification List** | 보유 인증 체크리스트 (CGMP, ISO, FDA 등) |
| 8 | A06 Diagram | **Logistics Map** | 공장 위치 + 항구·공항 접근성 다이어그램 |
| 9 | A16 Investment Structure | **Quotation Summary** | FOB/CIF/DDP 견적 구조 + 결제조건 |
| 10 | A03 Large Table | **Timeline** | 개발~출하 타임라인 (주차별 마일스톤) |
| 11 | A18 Checklist | **Export Checklist** | 수출 준비 체크리스트 (FDA등록, 라벨링, HS코드) |
| 12 | A10 Closing | **Contact & Terms** | 담당자 + 법적 고지 + QR코드 |

### 5.2 제안서 SSOT YAML 설계

```yaml
# credeal/ssot/oem-proposal.yaml (← im.budget.yaml 패턴 전이)
proposal:
  maxSlides: 12
  hardLimit: 14       # 부록 포함 절대 상한
  
  slides:
    cover:
      maxTitleChars: 40
      maxSubtitleChars: 60
    
    keyMetrics:
      statCount: 6
      labelMaxChars: 12
      valueMaxChars: 15
    
    factoryProfile:
      specItems: 8     # 공장 면적, 라인수, 일생산량 등
      photoRequired: true
      photoMinDPI: 150
    
    priceTable:
      maxRows: 8
      columns: ['제품명', 'MOQ', '단가(USD)', '총액', '리드타임', '비고']
    
    quotationSummary:
      deliveryTerms: ['FOB', 'CIF', 'DDP']
      currencyOptions: ['USD', 'EUR', 'KRW']

  lexicon:
    prohibited:
      - "최저가 보장"          # 과장
      - "100% 무결점"         # 비현실적 주장
      - "타사 대비 최고"       # 비교 광고
    mandatory:
      capRate: null            # CRE 전용 → 삭제
      moq: "MOQ (Minimum Order Quantity)"
      leadTime: "리드타임 (Lead Time)"
      fob: "FOB (Free On Board)"
```

---

## 6. Quality Gates 전이

### 6.1 OEM 플랫폼 게이트 코드 체계

```
OEM Gate Code    기원 (CRE Gate)     설명
─────────────    ───────────────     ─────────────────────────────────
G-OEM-01         G30 (Grade D 차단)  → 미검증 공급사(T0) 제안서 발행 차단
G-OEM-02         G31 (PII 마스킹)    → 바이어/공급사 개인정보 마스킹
G-OEM-03         G35 (회피문구)       → 과장 광고 문구 검출 ("최저가", "100%")
G-OEM-04         G40 (가격정합성)     → MOQ별 단가 역전 감지 (MOQ↑ 단가↑ 이면 차단)
G-OEM-05         G45 (DPI)           → 제품/공장 사진 해상도 150DPI 미만 차단
G-OEM-06         G50 (수치교차검증)   → INCI 성분 ↔ 인증 정합성 교차 검증
G-OEM-07         신규                → FDA 금지 성분 목록 자동 체크
G-OEM-08         신규                → EU CPNP 규정 성분 한도 체크
G-OEM-09         신규                → Halal 인증 ↔ 알코올/돼지 유래 성분 정합성
G-OEM-10         신규                → 견적 유효기간 만료 제안서 발행 차단
G-OEM-11         신규                → 라벨링 필수 항목 누락 체크 (수출국별)
G-OEM-12         G49 (evidence≥1)    → Claim 출처 없는 수치 렌더링 차단
```

### 6.2 Claim & Evidence 전이 예시

```typescript
// OEM 공급사 스펙의 출처 증명
const factoryClaims: Claim[] = [
  {
    field: 'dailyCapacity',
    value: '50,000 units/day',
    status: 'broker_checked',           // → 'agent_verified'
    evidence: [{
      source: 'factory_audit',          // ← 'registry' 전이
      label: '● 에이전트 공장 방문 확인',  // ← '● 중개인 현장확인' 전이
      date: '2026-08-15',
      documentUrl: '/audits/factory-001.pdf',
    }],
  },
  {
    field: 'cgmpCertification',
    value: 'CGMP (2024-2027)',
    status: 'reconciled',
    evidence: [{
      source: 'certification',          // ← 'registry' 전이
      label: '✓ 인증서 확인',            // ← '✓ 공부 확인' 전이
      date: '2024-03-20',
      documentUrl: '/certs/cgmp-2024.pdf',
    }],
  },
];
```

---

## 7. 데이터베이스 스키마 전이

### 7.1 핵심 테이블 매핑

```sql
-- CRE: building_ssot_lite → OEM: suppliers
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES profiles(id),         -- ← broker_id
  company_name TEXT NOT NULL,
  company_name_en TEXT,
  factory_address TEXT,
  factory_location POINT,                         -- PostGIS
  specializations TEXT[],                          -- ← asset_types
  certifications TEXT[],
  service_types TEXT[] DEFAULT '{"oem"}',          -- OEM/ODM/OBM
  min_moq INTEGER,
  daily_capacity INTEGER,
  production_lines INTEGER,
  export_countries TEXT[],
  year_established INTEGER,
  annual_revenue_usd NUMERIC,
  tier TEXT DEFAULT 'T0',                          -- ← release_tier
  claim_registry JSONB DEFAULT '[]',               -- ← claims
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CRE: buyer_intent → OEM: buyer_rfqs
CREATE TABLE buyer_rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id),
  agent_id UUID REFERENCES profiles(id),
  product_categories TEXT[],
  formulation_type TEXT,                           -- stock/custom/modify
  desired_quantity INTEGER,
  budget_range JSONB,                              -- {min, max, currency}
  target_markets TEXT[],                           -- ← preferred_regions
  required_certifications TEXT[],                   -- ← must_have (인증)
  quality_standard TEXT,
  max_lead_time_weeks INTEGER,
  packaging_requirements JSONB,
  trade_purpose TEXT,                              -- oem/odm/pl/distribution
  urgency_score INTEGER DEFAULT 50,               -- ← buyer_temperature_score
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CRE: deals → OEM: deals (구조 유사)
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES buyer_rfqs(id),
  supplier_id UUID REFERENCES suppliers(id),
  agent_id UUID REFERENCES profiles(id),
  match_grade TEXT,                                -- S/A/B/C
  match_score NUMERIC,
  quotation JSONB,
  proposal_status TEXT DEFAULT 'draft',
  pipeline_stage TEXT DEFAULT 'matched',           -- matched→proposed→negotiating→contracted→shipping
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CRE: approval_events → OEM: approval_events (그대로 재사용)
-- CRE: stage_runs → OEM: stage_runs (그대로 재사용)
-- CRE: artifact_envelopes → OEM: artifact_envelopes (그대로 재사용)
```

### 7.2 Supabase RLS 정책 전이

```sql
-- CRE 패턴 그대로 전이
-- 에이전트는 자기 공급사만 조회/수정 가능
CREATE POLICY "agents_own_suppliers" ON suppliers
  FOR ALL USING (agent_id = auth.uid());

-- 바이어는 매칭된 공급사만 조회 가능 (deal 테이블 통해)
CREATE POLICY "buyers_matched_suppliers" ON suppliers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN buyer_rfqs r ON d.rfq_id = r.id
      WHERE d.supplier_id = suppliers.id
      AND r.buyer_id = auth.uid()
    )
  );
```

---

## 8. API Routes 전이

### 8.1 핵심 API 매핑

| CRE API Route | OEM API Route | 설명 |
|:---|:---|:---|
| `POST /api/broker/deal-card/from-memo` | `POST /api/agent/rfq/from-memo` | 메모 → 구조화 RFQ 파싱 |
| `POST /api/broker/match` | `POST /api/agent/match` | 매칭 실행 |
| `POST /api/broker/im-lite/generate-async` | `POST /api/agent/proposal/generate-async` | 제안서 비동기 생성 |
| `GET /api/broker/im-lite/job-status` | `GET /api/agent/proposal/job-status` | 생성 진행 상태 |
| `POST /api/broker/im-lite/[id]/approve` | `POST /api/agent/proposal/[id]/approve` | 제안서 승인 |
| `GET /api/public/im-lite/[id]/pptx` | `GET /api/public/proposal/[id]/pptx` | PPTX 다운로드 |
| `POST /api/broker/rent-roll/parse-text` | `POST /api/agent/price-list/parse` | 가격표 텍스트 파싱 |
| `POST /api/broker/circles/[id]/match` | `POST /api/agent/circles/[id]/match` | 서클 내 매칭 |
| `GET /api/public/building-register` | `GET /api/public/company-register` | 사업자 등록 정보 조회 |
| `POST /api/broker/memo/voice` | `POST /api/agent/memo/voice` | 음성 메모 → 텍스트 |
| 신규 | `POST /api/agent/quotation/calculate` | 견적 자동 산출 |
| 신규 | `POST /api/compliance/ingredient-check` | 성분 규제 체크 |
| 신규 | `POST /api/compliance/labeling-check` | 라벨링 요건 체크 |

---

## 9. 견적 엔진 설계 (신규 개발)

### 9.1 견적 산출 로직

```typescript
interface QuotationCalculationInput {
  supplierId: string;
  products: {
    productId: string;
    quantity: number;
    packagingSpec: PackagingSpec;
    customFormula: boolean;
  }[];
  deliveryTerms: 'FOB' | 'CIF' | 'DDP';
  targetCountry: string;
  currency: 'USD' | 'EUR';
}

interface QuotationCalculationOutput {
  lineItems: {
    productName: string;
    quantity: number;
    unitPrice: number;        // MOQ 구간별 자동 산출
    subtotal: number;
  }[];
  productionCost: number;
  toolingCost: number;        // 금형·포장 초기비용
  certificationCost: number;  // 필요 인증 취득 비용
  shippingCost: number;       // 운송비 (FOB/CIF/DDP별 차이)
  insuranceCost: number;      // 적하보험
  customsDuty: number;        // 관세 (DDP일 경우)
  totalCost: number;
  margin: number;             // 에이전트 마진
  grandTotal: number;
  pricePerUnit: number;       // 최종 개당 단가
  
  // CRE의 deficiency 패턴 전이: 누락/추정 항목 투명 공개
  assumptions: {
    field: string;
    value: string;
    basis: string;            // "업계 평균 기준" 등
  }[];
}
```

### 9.2 가격 밴드 (CRE priceBand 전이)

```typescript
// CRE: B1(30~80억), B2(80~150억), ...
// OEM: MOQ별 단가 밴드
const OEM_PRICE_BANDS = {
  P1: { label: '$0.5~$2',   moqRange: '50K+',  description: '대량 기초' },
  P2: { label: '$2~$5',     moqRange: '10K~50K', description: '중량 기초/색조' },
  P3: { label: '$5~$15',    moqRange: '3K~10K',  description: '프리미엄 기초' },
  P4: { label: '$15~$50',   moqRange: '1K~3K',   description: '럭셔리/기능성' },
  P5: { label: '$50+',      moqRange: '500~1K',  description: '초프리미엄/의약외품' },
} as const;
```

---

## 10. 온톨로지 전이 (3-Axis → 4-Axis)

### CRE 3축 → OEM 4축

```
CRE 3-Axis Ontology                    OEM 4-Axis Ontology
═══════════════════                    ═══════════════════════

1. BuildingUse (29 법정 용도)       →   1. ProductCategory (13 제품군)
2. AssetType (17 거래 유형)         →   2. ServiceType (4: OEM/ODM/OBM/CMO)
3. InvestmentPosture (5 투자 목적)  →   3. TradePurpose (5: OEM/ODM/PL/유통/직수출)
                                    →   4. TargetMarket (지역블록: NA/EU/APAC/MENA/LATAM)
```

---

## 11. 프론트엔드 페이지 구조

```
src/app/
├── (public)/
│   ├── catalog/[supplierId]/          ← im-lite/[buildingId] 전이 (공급사 카탈로그 뷰)
│   ├── proposal/[proposalId]/         ← im-lite/[buildingId] 전이 (제안서 웹 뷰)
│   ├── market-intelligence/           ← pulse/ 전이 (K-뷰티 시장 트렌드)
│   └── search/                        ← explore/search 전이 (공급사 검색)
│
├── (agent)/                           ← (broker) 전이
│   ├── dashboard/                     ← broker 대시보드
│   ├── rfq/new/                       ← deal-card/from-memo 전이 (RFQ 입력)
│   ├── rfq/[id]/                      ← deal-card/[id] 전이 (RFQ 상세)
│   ├── matching/                      ← broker/matching 전이 (매칭 결과)
│   ├── proposal-studio/[id]/          ← basic-im-studio 전이 (제안서 편집)
│   ├── suppliers/                     ← buildings 전이 (공급사 관리)
│   ├── suppliers/[id]/                ← buildings/[id] 전이 (공급사 상세)
│   └── circles/                       ← circles 전이 (거래 서클)
│
├── (supplier)/                        신규 (공급사 포털)
│   ├── profile/                       ← broker/profile 전이
│   ├── products/                      신규 (제품 카탈로그 관리)
│   ├── quotations/                    신규 (견적 관리)
│   └── inbox/                         ← broker/inbox 전이
│
└── (admin)/                           그대로 전이
```

---

## 12. 개발 일정 상세

| 주차 | Phase | 작업 항목 | 산출물 |
|:---|:---|:---|:---|
| W1~2 | Foundation | 도메인 모델 정의, TypeScript 타입 | `supplier-types.ts`, `rfq-types.ts` |
| W3 | Foundation | SSOT YAML 교체, 온톨로지 설정 | `oem-proposal.yaml`, `export.ontology.yaml` |
| W4 | Foundation | DB 스키마 마이그레이션 | Supabase migrations |
| W5~6 | Engine | 매칭 엔진 가중치 교체 + Hard Filter | `matching-engine.ts` 전이 완료 |
| W7 | Engine | 견적 엔진 신규 개발 | `quotation-engine.ts` |
| W8 | Engine | 수출 게이트 (FDA, EU CPNP) | `export-compliance-gate.ts` |
| W9~10 | Document | PPTX 아키타입 전이 (A01~A10 → P01~P12) | 제안서 아키타입 |
| W11~12 | Document | 제안서 템플릿 제작 + Sharp 이미지 | 제품/공장 사진 처리 |
| W13~14 | Frontend | 에이전트 대시보드 + RFQ 폼 | `/agent/` 라우트 |
| W15~16 | Frontend | 매칭 결과 뷰 + 제안서 스튜디오 | 인터랙티브 편집기 |
| W17 | Polish | E2E 골든 테스트 + 성능 최적화 | 테스트 스위트 |
| W18 | Polish | 배포 + QA + 문서화 | Vercel 프로덕션 |

---

## 13. 리스크 및 완화

| 리스크 | 확률 | 영향 | 완화 방안 |
|:---|:---|:---|:---|
| 성분 규제 DB 구축 난이도 | 높음 | 높음 | 외부 API 연동 (Cosing DB, FDA ingredient DB) |
| OEM 공장 데이터 확보 | 높음 | 높음 | 초기 50개사 수동 온보딩 → 이후 셀프 등록 |
| 다국어 제안서 (영/중/일) | 중간 | 중간 | GPT 번역 + 용어 사전 기반 후처리 |
| 견적 정확도 | 중간 | 높음 | 에이전트 수동 검증 단계 필수화 (Gate) |
| 경쟁사 (Alibaba, Kompass) | 높음 | 중간 | Claim 출처 증명 + 전문 제안서 품질로 차별화 |

---

## 14. 경쟁 우위 요약

| 기존 플랫폼 (Alibaba 등) | OEM 매칭 플랫폼 (전이 시스템) |
|:---|:---|
| 단순 키워드 검색 | 3-Stage AI 매칭 (Hard Filter + 임베딩 + 앙상블) |
| 공급사 자체 신고 스펙 | Claim & Evidence 출처 증명 (8대 책임 마크) |
| 바이어가 직접 제안서 작성 | AI 자동 PPTX 제안서 생성 (12슬라이드) |
| 수출 규제 미확인 | 40+ Quality Gate 자동 컴플라이언스 체크 |
| 단순 메시지 기반 협상 | 파이프라인 기반 딜 관리 + 견적 자동화 |
| 공급사 검증 없음 | Release Tier (T0→T4) 단계적 검증 |
