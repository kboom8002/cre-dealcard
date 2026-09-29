# 전이 개발 분석 보고서 ② — 수출 에이전트 플랫폼

> **문서 코드**: UPCYCLE-02-AGENT  
> **작성일**: 2026-09-26  
> **원본 시스템**: CRE DealCard (cre-dealcard)  
> **타겟 시스템**: Export Agent Platform (수출 에이전트 SaaS)  

---

## 1. Executive Summary

영세·중소 제조기업의 수출 역량을 AI로 보완하는 **수출 에이전트 SaaS**. 공급사가 자사 정보를 입력하면 AI가 타겟 바이어를 발굴하고, 영문 피칭 문서를 자동 생성하며, 전시회·바이어 미팅 일정을 매칭하고, 딜 파이프라인을 체계적으로 관리해주는 "AI 수출 비서" 플랫폼.

**핵심 가치 제안**:
- 수출 경험 없는 제조사도 전문 에이전트 수준의 바이어 접근·피칭·협상 가능
- 1인 무역 에이전트의 관리 역량을 10배 확대 (AI 문서 생성 + 자동 매칭)
- 수출 바우처·지자체 사업과 연계 가능한 성과 측정 대시보드

**전이 효율**: 기존 코드베이스 ~55% 재사용 | 예상 공수 20주 | 풀 신규 대비 45% 절감

---

## 2. 시장 컨텍스트

### 2.1 타겟 시장

| 지표 | 수치 |
|:---|:---|
| 국내 수출 중소기업 수 | 약 96,000개사 (2024 관세청) |
| 수출 바우처 사업 규모 | 연 5,000억 원 (KOTRA) |
| 1인 무역회사 수 | 약 15,000개사 |
| K-뷰티 수출액 | 약 102억 달러 (2025) |
| K-푸드 수출액 | 약 130억 달러 (2025) |
| 주요 타겟 산업 | 화장품, 식품, 패션, 생활용품, 산업재 |

### 2.2 Pain Points

1. **제조사**: 좋은 제품은 있지만 해외 바이어 접근·영문 제안서 작성 역량 부재
2. **1인 무역회사**: 바이어 발굴→피칭→협상→물류→정산까지 전부 수작업
3. **KOTRA/지자체**: 수출 바우처 성과 측정 어려움, 사후 관리 부족
4. **바이어**: 한국 제조사 직접 소싱 시 커뮤니케이션·품질 검증 장벽

---

## 3. CRE DealCard와의 구조적 유사성

### 3.1 비즈니스 로직 매핑

이 시나리오의 핵심 인사이트는 **CRE 브로커(중개인)의 업무 프로세스**가 **수출 에이전트의 업무 프로세스**와 구조적으로 거의 동일하다는 점입니다:

```
CRE 브로커 워크플로우                    수출 에이전트 워크플로우
═══════════════════                    ═══════════════════════

1. 매물 확보 (건물 정보 수집)           1. 공급사 확보 (제조사 온보딩)
2. 매물 분석 (IM 투자제안서 작성)       2. 공급사 분석 (회사소개서 작성)
3. 바이어 발굴 (매수 의향 수집)         3. 바이어 발굴 (바이어 DB 매칭)
4. 매물-바이어 매칭                     4. 공급사-바이어 매칭
5. 피칭 & 미팅 (임장)                  5. 피칭 & 미팅 (전시회/화상미팅)
6. 협상 중개                           6. 협상 중개 (가격/조건)
7. 계약 체결                           7. 계약 체결 (공급계약)
8. 사후 관리                           8. 선적·정산·재주문 관리
```

### 3.2 역할 중심 매핑

```
CRE Role                              Export Agent Role
════════                               ════════════════

Broker (중개인)                    →   ExportAgent (수출 에이전트)
  ├── 매물 관리                    →     ├── 공급사 포트폴리오 관리
  ├── IM 작성 (PPTX)               →     ├── 피칭덱 작성 (PPTX)
  ├── 바이어 매칭                   →     ├── 바이어 매칭
  ├── Circle 네트워크               →     ├── TradeCircle (업종별 네트워크)
  ├── Magazine (마켓 리포트)        →     ├── Market Brief (시장 동향 뉴스레터)
  └── Pipeline 관리                →     └── Deal Pipeline 관리

Building Owner (건물주)            →   Manufacturer (제조사)
  ├── 건물 정보 제공                →     ├── 제품/공장 정보 제공
  ├── 임대 조건 설정                →     ├── 거래 조건 설정 (MOQ, 단가)
  └── IM 승인                      →     └── 제안서 승인

Buyer (매수자)                     →   OverseasBuyer (해외 바이어)
  ├── 매수 의향서                   →     ├── 구매 요청서 (RFQ)
  ├── 예산·지역·용도 조건           →     ├── 예산·시장·스펙 조건
  └── 매칭 결과 수신                →     └── 매칭 결과 수신
```

---

## 4. 도메인 엔티티 상세 설계

### 4.1 공급사 프로필 (← Building)

```typescript
interface ManufacturerProfile {
  id: string;
  agentId: string;                       // ← brokerId
  
  // ── 기본 정보 ──
  companyName: string;
  companyNameEn: string;
  businessRegistrationNumber: string;
  ceoName: string;
  yearEstablished: number;
  employeeCount: number;
  annualRevenue: { amount: number; currency: string; year: number };
  
  // ── 공장 정보 (← physical) ──
  factory: {
    address: string;
    coordinates: { lat: number; lng: number };
    totalAreaSqm: number;                // ← grossFloorArea
    productionLines: number;             // ← floors
    dailyCapacity: number;
    equipmentList: string[];
  };
  
  // ── 제품 역량 (← assetType + buildingUse) ──
  productCategories: ProductCategory[];
  specializations: string[];             // 세부 전문 분야
  serviceTypes: ServiceType[];           // OEM/ODM/OBM
  coreCompetencies: string[];            // 핵심 역량 키워드
  
  // ── 인증 & 수출 이력 ──
  certifications: CertificationRecord[];
  exportHistory: {
    countries: string[];                 // 수출 이력 국가
    majorClients: string[];              // 주요 거래처 (선택)
    annualExportVolume: number;
  };
  
  // ── Release Tier (← releaseTier) ──
  tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
  
  // ── Claim Registry (← claims) ──
  claims: Claim[];
  
  // ── 미디어 ──
  photos: {
    factory: string[];
    products: string[];
    certifications: string[];
  };
  
  // ── 거래 조건 ──
  tradeTerms: {
    minMOQ: number;
    paymentTerms: string[];              // T/T, L/C, etc.
    deliveryTerms: DeliveryTerm[];       // FOB, CIF, etc.
    samplePolicy: string;
    leadTimeWeeks: { min: number; max: number };
  };
}

interface CertificationRecord {
  type: Certification;
  issuer: string;
  issuedDate: string;
  expiryDate: string;
  documentUrl: string;
  claim: Claim;                          // 출처 증명 연결
}
```

### 4.2 바이어 프로필 & RFQ (← BuyerIntent)

```typescript
interface BuyerProfile {
  id: string;
  companyName: string;
  country: string;
  industry: string;
  buyerType: 'distributor' | 'retailer' | 'brand_owner' | 'marketplace' | 'government';
  annualPurchaseVolume: number;
  preferredCategories: ProductCategory[];
  importHistory: string[];               // 기존 수입 이력 국가
  
  // ── 매칭용 시그널 ──
  temperatureScore: number;              // ← buyerTemperatureScore
  lastActiveDate: string;
  responseRate: number;                  // 제안서 응답률
}

interface BuyerRFQ {
  id: string;
  buyerId: string;
  agentId: string;
  
  // ── Stage 1 Hard Filter 필드 ──
  productCategories: ProductCategory[];
  desiredQuantity: number;
  budgetRange: { min: number; max: number; currency: string };
  targetDeliveryDate: string;
  requiredCertifications: Certification[];
  
  // ── Stage 2 Semantic 필드 ──
  productDescription: string;            // 자유 텍스트 (임베딩 대상)
  qualityRequirements: string;
  packagingPreferences: string;
  referenceProducts: string[];           // 참고 제품 URL
  
  // ── Stage 3 Ensemble 필드 ──
  priceSensitivity: 'high' | 'medium' | 'low';
  qualityPriority: 'high' | 'medium' | 'low';
  deliveryUrgency: 'immediate' | 'within_month' | 'within_quarter' | 'flexible';
  
  // ── AI 파싱 결과 (← inferredPurpose) ──
  inferredTradeProfile: TradeProfile;
  confidenceScore: number;
}
```

### 4.3 딜 파이프라인 (← Deal Pipeline)

```typescript
type ExportDealStage =
  | 'prospect'        // 바이어 발굴
  | 'contacted'       // 초기 접촉
  | 'rfq_received'    // RFQ 수신
  | 'matched'         // 매칭 완료
  | 'proposed'        // 제안서 발송
  | 'sample_sent'     // 샘플 발송
  | 'negotiating'     // 가격/조건 협상
  | 'po_received'     // PO 수신
  | 'production'      // 생산 중
  | 'shipping'        // 선적
  | 'delivered'       // 인도 완료
  | 'payment'         // 정산
  | 'reorder';        // 재주문

// CRE의 bridge-state-machine.ts FSM 패턴 그대로 전이
const VALID_TRANSITIONS: Record<ExportDealStage, ExportDealStage[]> = {
  prospect:     ['contacted'],
  contacted:    ['rfq_received', 'prospect'],        // 실패 시 돌아가기
  rfq_received: ['matched'],
  matched:      ['proposed'],
  proposed:     ['sample_sent', 'negotiating', 'rfq_received'],
  sample_sent:  ['negotiating', 'proposed'],
  negotiating:  ['po_received', 'proposed'],         // 협상 결렬 시 재제안
  po_received:  ['production'],
  production:   ['shipping'],
  shipping:     ['delivered'],
  delivered:    ['payment'],
  payment:      ['reorder', 'delivered'],             // 재주문 or 완료
  reorder:      ['rfq_received'],                     // 새 주문 사이클
};
```

---

## 5. AI 문서 생성 파이프라인 전이

### 5.1 문서 유형별 PPTX 설계

수출 에이전트 플랫폼에서는 **4가지 문서 유형**을 자동 생성합니다:

#### 문서 A: 공급사 소개서 (Company Profile) — ← Basic IM 전이

| 순서 | CRE 아키타입 | 전이 슬라이드 | 내용 |
|:---|:---|:---|:---|
| 1 | A01 Cover | Company Cover | 로고 + 회사명(영문) + 태그라인 |
| 2 | A02 Stat Grid | At a Glance | 설립연도/매출/직원수/인증수/수출국수/공장면적 |
| 3 | A04 Asymmetric 7:5 | Factory Overview | 공장 스펙 10항목 + 공장 외관 사진 |
| 4 | A14 Gallery | Production Facilities | 생산라인·시설 사진 6장 |
| 5 | A14 Gallery | Product Showcase | 주력 제품 6종 사진 |
| 6 | A03 Large Table | Product Lineup | 전체 제품 라인업 표 |
| 7 | A18 Checklist | Certifications | 보유 인증 목록 + 유효기간 |
| 8 | A05 Asymmetric 7:4 | Why Choose Us | 차별화 포인트 + 실적 카드 |
| 9 | A06 Diagram | Global Footprint | 수출 국가 지도 + 주요 실적 |
| 10 | A10 Closing | Contact | 담당자·이메일·전화·QR코드 |

#### 문서 B: 바이어 피칭덱 (Pitch Deck) — ← Pro IM 전이

타겟 바이어에 맞춤화된 피칭 문서 (15~20 슬라이드):
- 바이어의 니즈에 맞는 제품 추천
- 경쟁사 대비 강점 분석
- 시장 트렌드 데이터 포함
- 견적 및 거래조건 제안

#### 문서 C: 전시회 리플릿 (Trade Show Brief) — 신규

전시회용 1~2페이지 압축 리플릿:
- A4 규격 PDF
- 핵심 제품 3~5개 + 스펙 표
- QR코드로 상세 카탈로그 링크

#### 문서 D: 시장 동향 뉴스레터 (Market Brief) — ← Magazine 전이

```
기존: 주간 CRE 마켓 매거진 (시세 동향, 거래 사례)
전이: 월간 수출 시장 동향 뉴스레터
  - 대상국별 수입 트렌드
  - 규제 변경 알림
  - 전시회 일정
  - 성공 사례
```

### 5.2 Posture → TradeProfile 기반 문서 분기

```typescript
// CRE: 투자 포스처별로 IM 구조가 달라짐
// 전이: 거래 목적별로 제안서 구조가 달라짐

type TradeProfile = 'oem' | 'odm' | 'private_label' | 'distribution' | 'direct_export';

const TRADE_DOCUMENT_PROFILES: Record<TradeProfile, DocumentProfile> = {
  oem: {
    emphasis: ['factory_capacity', 'certifications', 'pricing'],
    slides: ['cover', 'stats', 'factory', 'production', 'products', 'certs', 'pricing', 'timeline', 'contact'],
    toneGuide: '기술적·수치 중심, 신뢰성 강조',
  },
  odm: {
    emphasis: ['rd_capability', 'innovation', 'portfolio'],
    slides: ['cover', 'stats', 'rd_center', 'innovation', 'portfolio', 'case_studies', 'process', 'pricing', 'contact'],
    toneGuide: '혁신·창의성 강조, 트렌드 리더십',
  },
  private_label: {
    emphasis: ['brand_building', 'packaging', 'marketing_support'],
    slides: ['cover', 'stats', 'brand_support', 'packaging', 'design', 'products', 'testimonials', 'pricing', 'contact'],
    toneGuide: '브랜드 파트너십 강조, 풀서비스 어필',
  },
  distribution: {
    emphasis: ['product_range', 'pricing', 'logistics'],
    slides: ['cover', 'stats', 'product_range', 'bestsellers', 'pricing_tiers', 'logistics', 'terms', 'contact'],
    toneGuide: '가격 경쟁력·물량 안정성 강조',
  },
  direct_export: {
    emphasis: ['brand_story', 'market_fit', 'consumer_insights'],
    slides: ['cover', 'brand_story', 'market_analysis', 'products', 'consumer_data', 'pricing', 'marketing', 'contact'],
    toneGuide: '소비자 인사이트·브랜드 스토리 중심',
  },
};
```

---

## 6. 매칭 엔진 전이 — "바이어 발굴" 특화

### 6.1 역방향 매칭 (CRE와의 핵심 차이)

CRE에서는 **"매물 → 바이어"** 매칭이 주류이지만, 수출 에이전트 플랫폼에서는 **"공급사 → 바이어"** 역방향 매칭이 핵심입니다.

```
CRE 매칭 방향:          수출 에이전트 매칭 방향:
Building → Buyer        Manufacturer → Buyer (프로액티브 바이어 발굴)
Buyer → Building        Buyer → Manufacturer (인바운드 RFQ 매칭)
```

### 6.2 바이어 발굴 소스 통합 (신규 기능)

```typescript
interface BuyerDiscoverySource {
  // ── 기존 시스템 전이 ──
  internalDB: BuyerProfile[];            // 플랫폼 내부 바이어 DB
  circleNetwork: TradeCircle[];          // ← Circle 전이
  
  // ── 신규 외부 소스 ──
  tradeShowAttendees: {                  // 전시회 참가자 DB
    shows: ['Cosmoprof', 'Beautyworld', 'CPHI', 'InCosmetics'];
    attendeeAPI: string;
  };
  importData: {                          // 수입 통계 기반 바이어 후보
    source: 'UN Comtrade' | 'Korea Customs' | 'ImportGenius';
    hsCode: string;
    targetCountry: string;
  };
  linkedInEnrichment: {                  // LinkedIn Sales Navigator 연동
    companyName: string;
    decisionMakers: string[];
  };
}
```

### 6.3 Proactive Matching Score (신규)

```typescript
// 기존 매칭 엔진에 추가되는 "프로액티브" 스코어
interface ProactiveMatchScore {
  // Stage 1~3 기본 매칭 점수 (기존 구조)
  baseMatchScore: number;            // 0~100
  matchGrade: MatchGrade;            // S/A/B/C
  
  // 프로액티브 보정 점수 (신규)
  buyerActivityScore: number;        // 바이어 최근 활동 빈도 (0~100)
  marketTimingScore: number;         // 시장 타이밍 적합도 (0~100)
  competitionDensity: number;        // 경쟁 공급사 수 역수 (적을수록 기회)
  tradeShowProximity: number;        // 관련 전시회 임박 여부 (0~100)
  
  // 최종 프로액티브 점수
  proactiveScore: number;            // 가중 합산
  actionRecommendation: 
    | 'immediate_pitch'              // 즉시 피칭
    | 'warm_up_email'                // 관계 형성 이메일
    | 'trade_show_meeting'           // 전시회 미팅 예약
    | 'monitoring'                   // 모니터링 유지
    | 'not_recommended';             // 매칭 부적합
}
```

---

## 7. 스케줄링 시스템 전이

### 7.1 CRE 임장(Site Tour) → 전시회·미팅 스케줄링

CRE의 `ScheduleMatchInput` 구조가 전시회·미팅 관리에 거의 그대로 적용됩니다:

```typescript
// 기존: src/domain/matching/matching-types.ts → ScheduleMatchInput
// 전이:

interface TradeEventSchedule {
  // ── 전시회 일정 (← AvailableSlotSummary) ──
  events: {
    eventId: string;
    eventName: string;                   // e.g., "Cosmoprof Asia 2026"
    location: string;
    dates: DateRange;
    booth?: string;                      // 부스 번호 (등록 시)
    status: 'planning' | 'registered' | 'confirmed';
    targetBuyers: string[];              // 만날 예정 바이어 목록
  }[];
  
  // ── 바이어 미팅 (← TimeSlot) ──
  meetings: {
    meetingId: string;
    buyerId: string;
    type: 'video_call' | 'in_person' | 'trade_show';
    proposedSlots: TimeSlot[];           // ← 기존 TimeSlot 재사용
    confirmedSlot?: TimeSlot;
    agenda: string;
    preparationDocs: string[];           // 준비 문서 (피칭덱 등)
  }[];
  
  // ── 에이전트 일정 선호 (← clientSchedule) ──
  agentAvailability: {
    preferredDates: DateRange[];
    preferredTimeSlots: TimeSlot[];
    blackoutDates: string[];             // ← 기존 구조 그대로
    timezone: string;
  };
}
```

### 7.2 Morning Briefing 전이

```
CRE: /api/cron/morning-briefing
  → 오늘 임장 일정, 새 매물 알림, 시장 동향

수출 에이전트: /api/cron/morning-briefing
  → 오늘 미팅 일정, 새 RFQ 알림, 환율·관세 변동, 전시회 D-day
```

---

## 8. Claim & Evidence 시스템 확장

### 8.1 수출 에이전트 특화 Evidence Sources

```typescript
const EXPORT_EVIDENCE_SOURCES = {
  // ── CRE 전이 ──
  'certification':   '✓ 인증서 확인',      // ← registry (공부 확인)
  'audit_report':    '● 공장 감사 확인',    // ← broker (현장확인)
  'supplier_claim':  '▲ 공급사 고지',       // ← seller (매도인 고지)
  'third_party':     '★ 제3자 검증',        // ← expert (전문가 검증)
  'calculated':      '= 자동 산출',          // ← derived (계산값)
  'assumed':         '◇ 업계 평균 가정',     // ← assumed (분석가정)
  
  // ── 수출 에이전트 전용 ──
  'customs_data':    '✓ 관세청 데이터',      // 수출 실적 공적 데이터
  'trade_reference': '★ 거래처 레퍼런스',    // 기존 바이어 추천
  'sample_test':     '● 샘플 테스트 완료',   // 샘플 품질 확인
  'trade_show':      '● 전시회 대면 확인',   // 전시회에서 직접 확인
};
```

### 8.2 공급사 Tier별 최소 Evidence 요건

```typescript
// Release Tier 전이: 각 Tier에 필요한 최소 Claim 증거
const TIER_EVIDENCE_REQUIREMENTS: Record<SupplierTier, EvidenceRequirement> = {
  T0: {
    label: '미검증',
    minEvidences: 0,
    requiredSources: [],
    canGenerateProposal: false,        // ← Grade D 발행 차단과 동일
  },
  T1: {
    label: '기본 등록',
    minEvidences: 2,
    requiredSources: ['certification'],  // 사업자등록증
    canGenerateProposal: true,
    proposalWatermark: 'UNVERIFIED',
  },
  T2: {
    label: '검증 완료',
    minEvidences: 5,
    requiredSources: ['certification', 'audit_report'],  // 인증서 + 감사 보고서
    canGenerateProposal: true,
    proposalWatermark: null,
  },
  T3: {
    label: '프리미엄',
    minEvidences: 8,
    requiredSources: ['certification', 'audit_report', 'trade_reference'],
    canGenerateProposal: true,
    proposalBadge: 'VERIFIED SUPPLIER',
  },
  T4: {
    label: '전략 파트너',
    minEvidences: 12,
    requiredSources: ['certification', 'audit_report', 'trade_reference', 'third_party'],
    canGenerateProposal: true,
    proposalBadge: 'STRATEGIC PARTNER',
  },
};
```

---

## 9. Quality Gates — 수출 에이전트 전용

```
Gate Code        기원             설명
─────────        ────             ─────────────────────────────────────
G-EA-01          G30              미검증(T0) 공급사 피칭덱 발행 차단
G-EA-02          G31              바이어 개인정보(이메일/전화) 마스킹
G-EA-03          G35              과장 문구 검출 ("세계 최고", "No.1")
G-EA-04          G40              가격 정합성 (FOB < CIF < DDP 순서)
G-EA-05          G45              제품/공장 사진 해상도 150DPI 이상
G-EA-06          G50              인증서 유효기간 만료 체크
G-EA-07          G49              Claim evidence ≥ 1 (출처 없는 수치 차단)
G-EA-08          신규              수출 대상국-제품 카테고리 규제 교차 체크
G-EA-09          신규              HS 코드 정합성 (제품 카테고리 ↔ HS 코드)
G-EA-10          신규              환율 적용 일자 검증 (30일 이상 경과 시 경고)
G-EA-11          신규              영문 번역 품질 게이트 (필수 용어 미번역 차단)
G-EA-12          신규              전시회 참가 정보 정합성 (날짜, 부스번호)
G-EA-13          신규              운송 리드타임 ↔ 바이어 납기 정합성
```

---

## 10. 데이터베이스 스키마

### 10.1 핵심 테이블

```sql
-- ── 공급사/제조사 ──
CREATE TABLE manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES profiles(id),
  company_name TEXT NOT NULL,
  company_name_en TEXT NOT NULL,
  business_reg_number TEXT,
  industry TEXT NOT NULL,                  -- cosmetics, food, fashion, etc.
  product_categories TEXT[],
  specializations TEXT[],
  service_types TEXT[] DEFAULT '{"oem"}',
  factory JSONB,                           -- 공장 정보 (주소, 면적, 라인수 등)
  certifications JSONB DEFAULT '[]',
  export_history JSONB DEFAULT '{}',
  trade_terms JSONB DEFAULT '{}',
  tier TEXT DEFAULT 'T0',
  claim_registry JSONB DEFAULT '[]',
  photos JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 바이어 DB ──
CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES profiles(id),
  company_name TEXT NOT NULL,
  country TEXT NOT NULL,
  industry TEXT,
  buyer_type TEXT,                         -- distributor/retailer/brand_owner
  contact JSONB,
  preferences JSONB,
  temperature_score INTEGER DEFAULT 50,
  source TEXT,                             -- trade_show/referral/online/cold
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 딜 파이프라인 ──
CREATE TABLE export_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID REFERENCES manufacturers(id),
  buyer_id UUID REFERENCES buyers(id),
  agent_id UUID REFERENCES profiles(id),
  stage TEXT DEFAULT 'prospect',
  match_grade TEXT,
  match_score NUMERIC,
  documents JSONB DEFAULT '[]',            -- 생성된 문서 목록
  quotation JSONB,
  timeline JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 전시회·미팅 ──
CREATE TABLE trade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES profiles(id),
  event_name TEXT NOT NULL,
  event_type TEXT,                         -- trade_show/conference/webinar
  location TEXT,
  dates JSONB,                             -- {start, end}
  booths JSONB DEFAULT '[]',
  meetings JSONB DEFAULT '[]',
  status TEXT DEFAULT 'planning',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 파이프라인 인프라 (100% 재사용) ──
-- stage_runs, artifact_envelopes, approval_events → 그대로 전이
```

---

## 11. API Routes

### 11.1 핵심 API

| CRE Route | Export Agent Route | 설명 |
|:---|:---|:---|
| `POST /broker/deal-card/from-memo` | `POST /agent/manufacturer/from-memo` | 메모 → 공급사 프로필 파싱 |
| `POST /broker/memo/voice` | `POST /agent/memo/voice` | 음성 → 텍스트 (그대로) |
| `POST /broker/match` | `POST /agent/match/buyers` | 공급사 → 바이어 매칭 |
| `POST /broker/im-lite/generate-async` | `POST /agent/pitch-deck/generate-async` | 피칭덱 비동기 생성 |
| `GET /broker/im-lite/job-status` | `GET /agent/documents/job-status` | 문서 생성 상태 |
| `POST /broker/im-lite/[id]/approve` | `POST /agent/documents/[id]/approve` | 문서 승인 |
| `GET /public/im-lite/[id]/pptx` | `GET /public/catalog/[id]/pptx` | PPTX 다운로드 |
| `POST /broker/circles/[id]/match` | `POST /agent/circles/[id]/match` | 서클 내 매칭 |
| `POST /broker/pipeline/transition` | `POST /agent/pipeline/transition` | 딜 단계 전환 |
| `GET /cron/morning-briefing` | `GET /cron/morning-briefing` | 아침 브리핑 |
| `GET /cron/weekly-magazine` | `GET /cron/market-brief` | 시장 동향 뉴스레터 |
| 신규 | `POST /agent/buyer/discover` | 바이어 프로액티브 발굴 |
| 신규 | `POST /agent/trade-show/plan` | 전시회 계획 생성 |
| 신규 | `GET /agent/export-stats` | 수출 성과 대시보드 |
| 신규 | `POST /agent/quotation/generate` | 견적서 자동 생성 |

---

## 12. 프론트엔드 구조

```
src/app/
├── (public)/
│   ├── catalog/[manufacturerId]/        ← im-lite 전이 (공급사 카탈로그)
│   ├── pitch/[pitchId]/                 ← im-lite 전이 (피칭덱 웹뷰)
│   ├── market-brief/                    ← magazine 전이 (시장 뉴스레터)
│   └── search/                          ← explore/search 전이
│
├── (agent)/                             ← (broker) 전이
│   ├── dashboard/                       메인 대시보드
│   │   ├── pipeline/                    딜 파이프라인 칸반 보드
│   │   ├── calendar/                    전시회·미팅 캘린더
│   │   └── performance/                 성과 대시보드
│   ├── manufacturers/                   ← buildings 전이 (공급사 관리)
│   │   ├── [id]/                        공급사 상세
│   │   ├── [id]/pitch-studio/           ← basic-im-studio 전이
│   │   └── new/                         공급사 온보딩
│   ├── buyers/                          바이어 CRM
│   │   ├── discover/                    바이어 발굴 (신규)
│   │   └── [id]/                        바이어 상세
│   ├── matching/                        ← matching 전이
│   ├── trade-shows/                     ← scheduling 전이 (전시회 관리)
│   └── circles/                         ← circles 전이 (네트워크)
│
├── (manufacturer)/                      신규 (제조사 셀프서비스 포털)
│   ├── profile/                         프로필 편집
│   ├── products/                        제품 카탈로그 관리
│   ├── orders/                          주문 관리
│   └── analytics/                       수출 실적 대시보드
│
└── (admin)/                             그대로 전이
```

---

## 13. SSOT YAML 설정

```yaml
# credeal/ssot/export-agent.yaml

ontology:
  industries:
    - cosmetics
    - food_beverage
    - fashion_textile
    - consumer_goods
    - industrial_materials
    - electronics_components
    
  serviceTypes:
    - oem      # 위탁생산
    - odm      # 설계+생산
    - obm      # 자체브랜드
    - cmo      # 위탁제조 (의약품)
    
  tradeProfiles:
    - oem
    - odm
    - private_label
    - distribution
    - direct_export
    
  supplierTiers:
    T0: { label: '미검증', minEvidence: 0, canPublish: false }
    T1: { label: '기본등록', minEvidence: 2, canPublish: true, watermark: 'UNVERIFIED' }
    T2: { label: '검증완료', minEvidence: 5, canPublish: true }
    T3: { label: '프리미엄', minEvidence: 8, canPublish: true, badge: 'VERIFIED' }
    T4: { label: '전략파트너', minEvidence: 12, canPublish: true, badge: 'STRATEGIC' }

pipeline:
  dealStages:
    - prospect
    - contacted
    - rfq_received
    - matched
    - proposed
    - sample_sent
    - negotiating
    - po_received
    - production
    - shipping
    - delivered
    - payment
    - reorder
    
  timeoutBudget:
    pitchDeckGeneration:
      softLimitMs: 135000      # ← CRE IM 타이머 그대로
      hardLimitMs: 155000
      killLimitMs: 180000

lexicon:
  prohibited:
    - "세계 최고"
    - "업계 1위"
    - "100% 천연"
    - "부작용 없음"
    - "최저가 보장"
  mandatory:
    moq: "MOQ (Minimum Order Quantity)"
    leadTime: "Lead Time"
    fob: "FOB (Free On Board)"
    lc: "L/C (Letter of Credit)"
    tt: "T/T (Telegraphic Transfer)"

gating:
  photoMinDPI: 150
  maxSlides: 20
  evidenceMinCount: 1
  priceValidityMaxDays: 30
  certExpiryWarningDays: 90
```

---

## 14. 개발 일정 상세 (20주)

| 주차 | Phase | 작업 항목 | 산출물 |
|:---|:---|:---|:---|
| W1~2 | Foundation | 도메인 모델 (Manufacturer, Buyer, Deal) | TypeScript 타입 |
| W3~4 | Foundation | DB 스키마 + SSOT YAML + 온톨로지 | 마이그레이션 + YAML |
| W5~6 | Engine | 매칭 엔진 전이 (역방향 매칭 포함) | `matching-engine.ts` |
| W7 | Engine | 프로액티브 바이어 발굴 스코어 | `proactive-matcher.ts` |
| W8 | Engine | 견적 엔진 + 수출 게이트 | `quotation-engine.ts` |
| W9~10 | Document | 공급사 소개서 PPTX 아키타입 | 10슬라이드 아키타입 |
| W11~12 | Document | 피칭덱 PPTX + 영문 AI 생성 | 15~20슬라이드 |
| W13 | Document | 뉴스레터 + 전시회 리플릿 | Magazine 전이 |
| W14~15 | Frontend | 에이전트 대시보드 + 파이프라인 | 칸반 보드, 캘린더 |
| W16~17 | Frontend | 공급사 관리 + 피칭 스튜디오 | CRUD + 편집기 |
| W18 | Frontend | 제조사 셀프서비스 포털 | 프로필·제품 관리 |
| W19 | Polish | E2E 테스트 + 성능 최적화 | 테스트 스위트 |
| W20 | Polish | 배포 + QA + 문서화 | Vercel 프로덕션 |

---

## 15. 경쟁 우위 요약

| 기존 방식 | 수출 에이전트 플랫폼 |
|:---|:---|
| 수동 바이어 발굴 (엑셀, 인맥) | 3-Stage AI 매칭 + 프로액티브 발굴 |
| 워드/PPT 수작업 제안서 | AI 자동 피칭덱 생성 (PPTX/PDF) |
| 공급사 검증 미흡 | Claim & Evidence 출처 증명 + Tier 체계 |
| 딜 관리 = 카카오톡 + 엑셀 | 13단계 파이프라인 FSM + 아침 브리핑 |
| 전시회 준비 = 수동 | AI 전시회 리플릿 + 미팅 스케줄링 |
| 성과 측정 어려움 | 대시보드 + 수출 바우처 성과 리포트 |
| 1인 에이전트 한계 (20개사) | AI 보조로 100개사+ 동시 관리 |
