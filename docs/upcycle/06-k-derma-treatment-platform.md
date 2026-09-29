# 전이 개발 분석 보고서 ④ — K-더마 글로벌 시술 매칭 플랫폼

> **문서 코드**: UPCYCLE-04-DERMA  
> **작성일**: 2026-09-26  
> **원본 시스템**: CRE DealCard (cre-dealcard)  
> **타겟 시스템**: K-Derma Global Treatment Matching Platform  

---

## 1. Executive Summary

해외 고객이 원하는 피부 시술(레이저, 보톡스, 필러, 리프팅 등)을 설명하면,
AI가 한국 내 최적의 피부과/시술 클리닉을 매칭하고,
**시술 제안서·견적·일정·통역·숙박까지 원스톱으로 설계**하는 메디컬 큐레이션 플랫폼.

**핵심 인사이트**: 이 시나리오는 기존 3가지 전이안보다 **CRE 코드베이스와의 구조적 유사성이 한 차원 더 높습니다.**

| CRE 핵심 패턴 | K-더마 매핑 | 적합도 |
|:---|:---|:---|
| Building (매물) → Buyer 매칭 | Clinic (클리닉) → Patient 매칭 | ★★★★★ |
| IM 투자제안서 (PPTX) | Treatment Proposal (시술 제안서) | ★★★★★ |
| **스케줄링 + 예약 (이미 구현)** | **시술 예약 + 일정 관리** | ★★★★★ |
| **Booking Orchestrator (이미 구현)** | **시술 예약 오케스트레이터** | ★★★★★ |
| Gate 승인 워크플로우 | 의료 컴플라이언스 게이트 | ★★★★★ |
| Claim & Evidence 출처 증명 | 의사 자격·시술 결과 증명 | ★★★★★ |
| Circle 네트워크 | 클리닉 네트워크 (제휴 병원) | ★★★★☆ |
| Magazine 뉴스레터 | K-뷰티 시술 트렌드 리포트 | ★★★★☆ |

> [!IMPORTANT]
> **결정적 차이점**: 기존 3개 전이안에는 없었던 **스케줄링·예약 시스템**이 이 시나리오의 핵심인데,
> CRE 코드베이스에 이미 `booking-orchestrator.ts`, `ScheduleMatchInput`, `AvailableSlotSummary`,
> `BOOKING_PURPOSE_WEIGHTS` (상담·컨설팅 가중치 포함)가 **구현되어 있습니다.**
> 이것은 우연이 아니라 구조적 적합성의 증거입니다.

---

## 2. 시장 분석

### 2.1 시장 규모

```
┌──────────────────────────────────────────────────────────────┐
│  TAM — 글로벌 메디컬 에스테틱 시장                             │
│  ~$25B (약 33조 원, 2025) → CAGR 12%                         │
│  ┌────────────────────────────────────────────────────┐      │
│  │  SAM — 한국 의료관광 + K-뷰티 시술 시장               │      │
│  │  ~$3.5B (약 4.7조 원)                                │      │
│  │  ┌──────────────────────────────────────────┐       │      │
│  │  │  SOM — 온라인 매칭형 시술 예약 시장          │       │      │
│  │  │  ~$500M (약 6,700억 원)                     │       │      │
│  │  │  (해외 환자 50만 명/년 × 건당 평균 $1,000)   │       │      │
│  │  └──────────────────────────────────────────┘       │      │
│  └────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

| 지표 | 수치 |
|:---|:---|
| 한국 의료관광 외국인 환자 수 | ~60만 명/년 (2025, 보건복지부) |
| 피부과·미용 시술 비중 | 전체 의료관광의 ~35% (약 21만 명) |
| 비수술 에스테틱 시장 (한국) | ~2.5조 원 (레이저, 보톡스, 필러 등) |
| 주요 인바운드 국적 | 일본, 중국, 동남아, 중동, 미국 |
| CAGR (메디컬 에스테틱) | 12~15% |
| K-뷰티 시술 글로벌 인지도 | 급상승 (유튜브/틱톡 "Korean skincare treatment" 조회수 급증) |

### 2.2 시장 성장 드라이버

| 드라이버 | 영향도 |
|:---|:---|
| K-콘텐츠 (드라마/아이돌) 효과로 K-뷰티 시술 관심 폭증 | ★★★★★ |
| 한국 시술 가격 경쟁력 (미국·유럽 대비 1/3~1/5) | ★★★★★ |
| 비수술 에스테틱 선호 증가 (비침습, 짧은 다운타임) | ★★★★☆ |
| 의료관광 비자 간소화 (전자비자, 의료비자 확대) | ★★★★☆ |
| SNS 기반 Before/After 콘텐츠 확산 | ★★★★☆ |
| 원화 약세 → 외국인 비용 절감 효과 | ★★★☆☆ |

### 2.3 경쟁 환경

| 플레이어 | 대표 | 강점 | 약점 | 차별화 기회 |
|:---|:---|:---|:---|:---|
| 의료관광 에이전시 | 메디뷰, 한국관광공사 | 대면 신뢰, 통역 | 수동 매칭, 확장 불가 | AI 자동 매칭 |
| 시술 리뷰 플랫폼 | 강남언니, 바비톡 | 리뷰 DB, 국내 사용자 | 글로벌 미진출, 매칭 없음 | 글로벌 + B2B 매칭 |
| 글로벌 메디컬 투어리즘 | Medical Departures, Bookimed | 글로벌 커버리지 | 한국 비특화, 품질 검증 미흡 | K-더마 특화 + Claim 증명 |
| SNS 기반 브로커 | 인스타/틱톡 개인 브로커 | 개인 신뢰 | 비체계적, 규제 리스크 | 체계적 Gate + 법적 컴플라이언스 |

---

## 3. CRE → K-더마 도메인 매핑 (핵심)

### 3.1 엔티티 매핑

```
CRE DealCard                          K-Derma Platform
═══════════════                        ═══════════════════

Building (매물)                    →   Clinic (클리닉/피부과)
├── address                        →   ├── location (강남, 신사, 청담 등)
├── assetType (자산유형)            →   ├── clinicType (피부과, 성형외과, 에스테틱)
├── physical (면적, 층수, 설비)     →   ├── facilities (장비, 시술실 수, 인증)
├── priceBand                      →   ├── priceRange (시술 가격대)
├── vacancySignal (공실)            →   ├── availableSlots (예약 가능 슬롯) ★이미 구현
├── investmentPosture              →   ├── treatmentFocus (레이저/주사/리프팅)
├── dealCuriosityScore             →   ├── popularityScore (인기도/리뷰점수)
└── fitSummary                     →   └── clinicSummary (클리닉 특장점)

BuyerIntent (매수의향)             →   PatientRequest (시술 요청)
├── budgetRange                    →   ├── budget (시술 예산)
├── preferredRegions               →   ├── preferredArea (선호 지역)
├── assetTypes                     →   ├── treatmentTypes (원하는 시술 종류)
├── purchasePurpose                →   ├── treatmentGoal (시술 목적)
├── mustHave                       →   ├── mustHave (의사 경력, 장비, 통역)
├── niceToHave                     →   ├── niceToHave (숙박 연계, 패키지)
├── riskTolerance                  →   ├── downtimeTolerance (다운타임 허용도)
└── buyerTemperatureScore          →   └── urgencyScore (시술 긴급도)

Broker (중개인)                    →   MedicalCoordinator (메디컬 코디네이터)
IM (투자제안서)                    →   TreatmentProposal (시술 제안서 PPTX)
DealCard                          →   TreatmentCard (시술 카드)
Circle (네트워크)                  →   ClinicNetwork (제휴 클리닉 네트워크)
Magazine                          →   TrendReport (K-더마 트렌드 리포트)
Teaser                            →   ClinicTeaser (클리닉 티저 카드)
GateRequest                       →   MedicalGate (의료 컴플라이언스 게이트)
```

### 3.2 이미 구현된 모듈의 직접 전이

| CRE 구현체 | K-더마 전이 대상 | 전이 방식 |
|:---|:---|:---|
| `booking-orchestrator.ts` | 시술 예약 오케스트레이터 | **거의 그대로** — CAS 패턴, Hold/Confirm, 만료 처리 |
| `ScheduleMatchInput` | 시술 일정 매칭 입력 | **그대로** — preferredDates, TimeSlot, flexibility, urgency |
| `AvailableSlotSummary` | 클리닉 가용 슬롯 | **그대로** — slotId, date, startTime, endTime, status |
| `computeScheduleFitScore()` | 시술 일정 적합도 | **그대로** — 날짜 매칭, 블랙아웃, 유연성 보정 |
| `hold-expiry-cron.ts` | 예약 만료 크론 | **그대로** — 기존 크론잡 재사용 |
| `BOOKING_PURPOSE_WEIGHTS` | 시술 예약 가중치 | 확장만 필요 — `aesthetic: { schedule: 0.35, expertise: 0.30, ... }` |
| `getHoldDuration()` | 도메인별 Hold 타임 | 확장만 필요 — `aesthetic: 48h`, `consultation: 2h` |

### 3.3 투자 포스처 → 시술 포스처 (3축 온톨로지 전이)

```
CRE 3-Axis Ontology                    K-Derma 3-Axis Ontology
═══════════════════                    ═══════════════════════

1. BuildingUse (29 법정 용도)       →   1. TreatmentCategory (시술 분류)
                                         ├── laser (레이저: 피코, 프락셀, IPL)
                                         ├── injection (주사: 보톡스, 필러, 스킨부스터)
                                         ├── lifting (리프팅: 울쎄라, 실리프팅, 써마지)
                                         ├── peel (필링: 화학적, 물리적)
                                         ├── regenerative (재생: PRP, 엑소좀)
                                         ├── body (바디: 쿨스컬프팅, 윤곽주사)
                                         └── comprehensive (종합 프로그램)

2. AssetType (17 거래 유형)         →   2. ClinicTier (클리닉 등급)
                                         ├── premium (프리미엄 의원: 강남 대형)
                                         ├── specialist (전문 의원: 특정 시술 특화)
                                         ├── general_derm (일반 피부과)
                                         ├── aesthetic_center (에스테틱 센터)
                                         └── hospital_dept (종합병원 피부과)

3. InvestmentPosture (5 투자 목적)  →   3. TreatmentGoal (시술 목적)
   income (수익형)                  →     maintenance (유지 관리형)
   owner_occupied (자가사용형)      →     correction (교정형: 흉터, 색소)
   development (개발형)             →     rejuvenation (회춘형: 탄력, 주름)
   operating (운영형)               →     combination (복합 프로그램형)
   trading (매매차익형)             →     emergency (급성: 여드름, 트러블)
```

---

## 4. 매칭 엔진 전이

### 4.1 3-Stage 매칭 — 시술 특화

```
Stage 1: Hard Filter
──────────────────
✗ 시술 카테고리 불일치 (레이저 원하는데 주사만 하는 클리닉)
✗ 예산 범위 초과 (환자 예산 < 클리닉 최소 시술비)
✗ 일정 불일치 (← computeScheduleFitScore 그대로 활용)
✗ 언어 불일치 (영어 상담 필요 → 영어 불가 클리닉)
✗ 의료 금기 사항 (특정 시술 불가 조건)

Stage 2: Semantic Similarity
────────────────────────────
클리닉 프로필: "강남 10년 경력 피코레이저 전문, 색소 치료 특화, 
              일본어 가능, JCI 인증, before/after 5000건"
환자 요청:     "기미 제거하고 싶어요. 일본에서 가는데 
              다운타임 짧은 레이저 원해요. 예산 50만원 이내"
→ OpenAI 임베딩 코사인 유사도

Stage 3: Ensemble (시술 목적별 가중치)
────────────────────────────────────
```

### 4.2 시술 목적별 가중치

```typescript
const TREATMENT_PURPOSE_WEIGHTS: Record<TreatmentGoal, Record<string, number>> = {
  // 유지 관리형 — 스케줄 편의성 + 가격 중시
  maintenance: {
    expertise: 0.15,
    price: 0.30,
    schedule: 0.25,    // ← 스케줄 가중치 높음
    review: 0.15,
    semantic: 0.15,
  },
  
  // 교정형 (흉터, 색소) — 전문성 최우선
  correction: {
    expertise: 0.40,   // 해당 시술 경력·장비
    price: 0.10,
    schedule: 0.10,
    review: 0.20,      // before/after 리뷰
    semantic: 0.20,
  },
  
  // 회춘형 (탄력, 주름) — 전문성 + 리뷰 균형
  rejuvenation: {
    expertise: 0.30,
    price: 0.15,
    schedule: 0.15,
    review: 0.25,
    semantic: 0.15,
  },
  
  // 복합 프로그램 — 시맨틱 + 전문성
  combination: {
    expertise: 0.25,
    price: 0.15,
    schedule: 0.15,
    review: 0.15,
    semantic: 0.30,    // 종합적 적합도
  },
  
  // 급성 (여드름, 트러블) — 일정 최우선
  emergency: {
    expertise: 0.20,
    price: 0.10,
    schedule: 0.40,    // 즉시 예약 가능 여부
    review: 0.10,
    semantic: 0.20,
  },
};
```

---

## 5. 시술 제안서 PPTX (← IM 전이)

### 5.1 슬라이드 시퀀스 (8~12 슬라이드)

| # | CRE 아키타입 | K-더마 슬라이드 | 내용 |
|:---|:---|:---|:---|
| 1 | A01 Cover | **Treatment Cover** | 환자명(이니셜) + 시술 제안 제목 + 클리닉명 |
| 2 | A02 Stat Grid | **Clinic at a Glance** | 경력연수 / 시술건수 / 리뷰점수 / 장비수 / 언어 / 인증 |
| 3 | A04 Asymmetric 7:5 | **Doctor Profile** | 의사 프로필 + 경력 + 클리닉 사진 |
| 4 | A14 Gallery | **Before & After** | 유사 시술 B/A 사진 6장 (동의 받은 것만) |
| 5 | A05 Asymmetric 7:4 | **Treatment Plan** | 추천 시술 조합 + 예상 효과 설명 |
| 6 | A03 Large Table | **Price & Package** | 시술별 가격표 + 패키지 할인 |
| 7 | A22 Stacking Plan | **Treatment Timeline** | 시술 일정 시각화 (Day 1~3, 회복 기간) |
| 8 | A06 Diagram | **Location & Access** | 클리닉 위치 + 공항/호텔 접근성 |
| 9 | A18 Checklist | **Pre-Treatment Checklist** | 시술 전 준비사항 체크리스트 |
| 10 | A16 Investment Structure | **Cost Breakdown** | 시술비 + 숙박 + 통역 + 교통 총비용 |
| 11 | A10 Closing | **Booking & Contact** | 예약 QR코드 + 카카오톡 + 이메일 |

### 5.2 A22 Stacking Plan → Treatment Timeline 전이

```
CRE Stacking Plan:              K-Derma Treatment Timeline:
┌──────────────┐                ┌──────────────────────────────────┐
│ 5F: 공실      │                │ Day 0: 상담 & 피부 분석           │
│ 4F: 사무실    │                │ Day 1: 피코레이저 + 스킨부스터    │
│ 3F: 사무실    │                │ Day 2: 회복 (호텔 휴식)           │
│ 2F: 카페      │                │ Day 3: 보톡스 + LED 테라피        │
│ 1F: 식당      │                │ Day 4: 최종 체크 & 귀국           │
│ B1: 주차      │                │ +2W:   원격 경과 체크 (화상)      │
└──────────────┘                └──────────────────────────────────┘

→ 동일한 "층별 박스 그리기" 로직으로 "일정별 블록 그리기" 구현
```

---

## 6. Claim & Evidence — 의료 분야 킬러 피처

### 6.1 의료 Evidence Sources

```typescript
const MEDICAL_EVIDENCE_SOURCES = {
  // ── CRE 전이 ──
  'license':         '✓ 면허 확인',        // ← registry (공부 확인)
  'certification':   '✓ 전문의 자격 확인',  // ← registry
  'coordinator':     '● 코디네이터 방문 확인', // ← broker (현장확인)
  'clinic_claim':    '▲ 클리닉 자체 고지',   // ← seller (매도인 고지)
  'patient_review':  '★ 환자 실제 리뷰',     // ← expert (전문가 검증)
  'calculated':      '= 자동 산출',           // ← derived
  
  // ── 의료 전용 ──
  'jci_accredited':  '✓ JCI 국제인증',       // 국제 의료기관 인증
  'kha_accredited':  '✓ 의료기관 인증',      // 한국 의료기관 평가인증원
  'before_after':    '● B/A 사진 (동의)',    // 환자 동의 하 사진
  'equipment_cert':  '✓ 장비 인증',          // FDA 승인 장비
  'malpractice':     '✓ 의료사고 이력 없음',  // 의료사고 무결점 확인
};
```

### 6.2 의료 분야에서 Claim 시스템이 필수인 이유

```
일반 플랫폼:                     CureX K-Derma (Claim 시스템):
────────────                     ──────────────────────────────
"경력 20년"                      "경력 20년" ✓ 면허 확인 (2006-03-15 발급)
"시술 5000건"                    "시술 5000건" ▲ 클리닉 자체 고지
"부작용 없음"                    → GATE 차단 (비현실적 주장)
"최신 장비"                      "Picosure Pro" ✓ 장비 인증 (FDA 510k)
"리뷰 4.8점"                    "리뷰 4.8점" ★ 환자 실제 리뷰 (432건 기반)
"전문의"                         "피부과 전문의" ✓ 전문의 자격 확인 (#12345)
```

> 의료 분야에서 근거 없는 주장은 **생명·건강 리스크**. Claim 시스템은 여기서 법적 방어 + 환자 신뢰의 핵심 인프라.

---

## 7. Quality Gates — 의료광고법 컴플라이언스

```
Gate Code        기원            설명
─────────        ────            ──────────────────────────────────
G-MD-01          G30             미검증(T0) 클리닉 제안서 발행 차단
G-MD-02          G31             환자 개인정보(이름/연락처) 마스킹
G-MD-03          G35             의료법 위반 문구 차단:
                                  - "100% 효과 보장" (비현실적)
                                  - "부작용 없음" (허위)
                                  - "최고" / "유일" (비교광고 금지)
                                  - "모든 피부 타입 가능" (과장)
G-MD-04          G40             가격 정합성 (패키지 < 개별 합산 검증)
G-MD-05          G45             B/A 사진 해상도 + 동의서 존재 확인
G-MD-06          G49             Claim evidence ≥ 1 (출처 없는 수치 차단)
G-MD-07          G50             의사 면허·전문의 자격 유효기간 교차 검증
G-MD-08          신규             Before/After 사진 환자 동의(Consent) 확인
G-MD-09          신규             시술 금기사항 고지 의무 포함 여부 체크
G-MD-10          신규             장비 인증(FDA/CE) 유효기간 체크
G-MD-11          신규             의료기관 개설 신고 유효성 확인
G-MD-12          신규             시술 후 케어/부작용 안내 포함 여부 체크
G-MD-13          신규             다운타임 정보 정합성 (시술 유형 ↔ 안내)
G-MD-14          신규             국가별 의료광고 규제 교차 체크
                                  (일본: 의약품의료기기법, 미국: FTC)
```

---

## 8. 예약 시스템 — 이미 구현된 핵심 자산

### 8.1 기존 코드의 직접 활용

```typescript
// ── booking-orchestrator.ts → 시술 예약에 그대로 적용 ──

// 기존 코드의 getHoldDuration에 의료 도메인만 추가:
function getHoldDuration(domain?: string): number {
  switch (domain) {
    case 'wedding':       return 72 * 60 * 60 * 1000;  // 72시간
    case 'consulting':    return 48 * 60 * 60 * 1000;  // 48시간
    case 'counseling':    return 30 * 60 * 1000;        // 30분
    // ── 신규 추가 ──
    case 'aesthetic':     return 48 * 60 * 60 * 1000;   // 48시간 (시술 예약)
    case 'consultation':  return 2 * 60 * 60 * 1000;    // 2시간 (상담 예약)
    case 'package':       return 72 * 60 * 60 * 1000;   // 72시간 (패키지)
    default:              return 24 * 60 * 60 * 1000;   // 24시간
  }
}
```

### 8.2 환자 여정 일정 매칭 (ScheduleMatchInput 확장)

```typescript
// 기존 ScheduleMatchInput을 거의 그대로 사용
interface TreatmentScheduleInput extends ScheduleMatchInput {
  // 기존 필드 모두 활용
  // vendor → clinic
  // clientSchedule → patientSchedule

  // ── 의료 특화 추가 ──
  travelPlan: {
    arrivalDate: string;         // 입국일
    departureDate: string;       // 출국일
    stayDuration: number;        // 체류 일수
    accommodation: 'hotel' | 'airbnb' | 'clinic_provided' | 'own';
  };
  
  treatmentPlan: {
    treatments: {
      type: TreatmentCategory;
      estimatedDuration: number; // 분
      recoveryDays: number;      // 시술 후 회복 일수
      requiresFollow: boolean;   // 경과 관찰 필요 여부
    }[];
    
    // 시술 순서 최적화
    // (회복이 긴 시술을 먼저, 마무리는 회복 짧은 시술)
    optimizedSequence?: string[];
  };
}
```

---

## 9. 전이 효율 비교 — 4개 시나리오 통합

```
                      OEM매칭  수출에이전트  유통큐레이션  K-더마시술
─────────────────────────────────────────────────────────────────────
매칭 엔진              70%      60%          75%         80% ← 최고
PPTX 파이프라인        50%      55%          70%         75%
도메인 모델            20%      25%          35%         40% ← 최고
UI 컴포넌트            60%      55%          70%         65%
Gate 시스템            80%      75%          85%         90% ← 최고
스케줄링·예약 시스템    10%      30%          20%         95% ← 압도적
Booking Orchestrator   0%       0%           0%          98% ← 거의 그대로
전체 평균              ~60%     ~55%         ~65%        ~70%
예상 공수              18주     20주         16주        14주 ← 최단
```

> [!TIP]
> **K-더마 시술 매칭은 코드 재사용률 ~70%, 예상 공수 14주로 4개 시나리오 중 최고의 전이 효율.**
> 특히 `booking-orchestrator`, `ScheduleMatchInput`, `BOOKING_PURPOSE_WEIGHTS`가 이미 존재하므로
> "예약이 핵심인 서비스"에서 압도적 우위.

---

## 10. 7축 루브릭 사업성 평가

```
                    OEM매칭  수출에이전트  유통큐레이션  K-더마시술
───────────────────────────────────────────────────────────────────
① 시장 규모           5        4            4           5 ★
② 수익 모델           5        3            4           5 ★
③ 경쟁 해자           3        4            5           4
④ 고객 획득           2        3            4           3
⑤ 전이 효율           4        3            5           5 ★
⑥ 확장성              4        5            4           4
⑦ 정책 연계           4        5            3           5 ★
────────────────────────────────────────────────────────────────
합계                  27       27           29          31 ★★★
등급                   A        A            S           S+
```

### K-더마의 추가 점수 근거:

**① 시장 규모 5점** — 글로벌 메디컬 에스테틱 TAM $25B, 한국 의료관광 연 60만 명 + CAGR 12%

**② 수익 모델 5점** — 시술 건당 커미션(10~20%)이 유통 수수료(3~5%)보다 월등히 높음. 건당 평균 거래액 $500~$3,000.

**⑤ 전이 효율 5점** — 예약 시스템 이미 구현, 4개 시나리오 중 재사용률 최고(70%), 14주 최단 개발.

**⑦ 정책 연계 5점** — 보건복지부 의료관광 활성화 정책, 한국관광공사 K-뷰티 의료관광 사업, 의료관광 유치기관 등록 제도.

---

## 11. 비즈니스 모델 스케치

### 11.1 수익 구조

| 수익원 | 비중 | 과금 방식 | 건당 예상 |
|:---|:---|:---|:---|
| **시술 예약 커미션** | 45% | 시술비의 10~20% | \$100~\$600 |
| **패키지 설계 수수료** | 20% | 패키지 생성 건당 | \$50~\$200 |
| **클리닉 프로필 프리미엄** | 15% | 월 구독 (Featured 노출) | \$200~\$500/월 |
| **부가 서비스** | 20% | 통역·숙박·교통 연계 | \$50~\$300 |

### 11.2 Unit Economics 잠재력

```
CRE DealCard:    건당 거래액 ~80억 원, 중개수수료 0.9% → 건당 ~7,200만 원
유통 큐레이션:    건당 거래액 ~$20K, 수수료 4% → 건당 ~$800
K-더마 시술:     건당 시술비 ~$1,500, 커미션 15% → 건당 ~$225

→ 건당은 작지만, 거래 빈도가 압도적 (월 수백~수천 건 가능)
→ 유통(시즌 2~4회/년) 대비 시술(연중 매일) = 거래 빈도 100배+
```

---

## 12. 전략적 판단

### 유통 큐레이션 vs K-더마 시술 — 우선순위 판단

| 기준 | 유통 큐레이션 (CureX) | K-더마 시술 | 판정 |
|:---|:---|:---|:---|
| 전이 효율 | 65% / 16주 | **70% / 14주** | 🏆 K-더마 |
| 시장 규모 | SAM $6B | SAM $3.5B | 🏆 유통 |
| 건당 수익 | $800 (수수료) | **$225 (커미션) × 고빈도** | 비김 |
| 콜드스타트 | 브랜드 자발 등록 (용이) | 클리닉 제휴 필요 (중간) | 🏆 유통 |
| 규제 리스크 | 낮음 | **의료법 주의 필요** | 🏆 유통 |
| 해자 (Moat) | 데이터 플라이휠 | **의료 인증+리뷰+예약 락인** | 🏆 K-더마 |
| 정책 지원 | 간접적 | **의료관광 정책 직접 연계** | 🏆 K-더마 |

### 권장: 병렬 진행 또는 K-더마 우선

```
Option A: 유통 큐레이션 → K-더마 순차 (기존 권장안 + 확장)
  유통 큐레이션 MVP (16주) → K-더마 추가 (10주) → 통합 플랫폼

Option B: K-더마 먼저 → 유통 확장 (신규 권장안)
  K-더마 MVP (14주) → 유통 큐레이션 추가 (12주) → 통합 플랫폼
  ★ 예약 시스템이 이미 있어 최단 시간 MVP 가능
  ★ 건당 커미션 높아 초기 수익화 빠름
  ★ 의료관광 정책 + 한국관광공사 연계로 초기 고객 확보 용이

Option C: 동시 진행 (공유 코어)
  공유 코어 엔진 (매칭+PPTX+예약+Gate) 먼저 구축 (10주)
  → 유통 스킨 + K-더마 스킨 동시 출시 (+6주)
  ★ 가장 효율적이나 팀 규모 필요 (5인+)
```
