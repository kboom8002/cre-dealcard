# 모델 골든 IM 5종 — 데이터/정보 요구사항 v1

> **선행** 04_MODEL_GOLDEN_IM_REQUIREMENTS.md Phase A (PPTX 파서) 완료
> **목적** 모델 골든 IM 5종 생성에 필요한 데이터 필드·조건·검증 기준을 사전 정의
> **버전** v1.0 (2026-08-28)

---

## 0. 개요

모델 골든 IM은 **위반 0 · 경고 0**이 확인된 이상적인 PPTX 산출물입니다.
각 표본은 포스처(posture) × 등급(grade) × 발행등급(ReleaseTier) 조합을 대표합니다.

| # | 표본명 | 포스처 | 등급 | ReleaseTier | 아키타입 |
|:---:|---|---|:---:|---|---|
| B-1 | 양평동 오피스 | `income` | A | `decision_im` | R-INC-01 (임대안정형) |
| B-2 | 필동 오피스 | `income` | C | `fact_om` | R-INC-01 |
| B-3 | 당산 사옥 | `owner_occupied` | B | `analysis_im` | — |
| B-4 | 개발부지 | `development` | B | `analysis_im` | — |
| B-5 | 숙박시설 | `operating` | A | `decision_im` | — |

---

## 1. 공통 필수 데이터 (5종 모두)

### 1.1 MobileImPptxInput (렌더러 입력)

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `buildingId` | `string` | ✅ | 건물 고유 ID |
| `preset` | `string` | ✅ | 테마 프리셋 (기본: `credeal_signature`) |
| `posture` | `InvestmentPosture` | ✅ | 투자 포스처 |
| `grade` | `A\|B\|C\|D` | ✅ | 데이터 등급 |
| `releaseTier` | `ReleaseTier` | ✅ | 5종 발행 등급 |
| `docno` | `string` | ✅ | 문서번호 (예: `IM-YP001`) |
| `doc.title` | `string` | ✅ | 건물명/문서 제목 |
| `doc.body` | `Record<string, any>` | ✅ | IM 본문 데이터 (§2~§6 참조) |
| `doc.sections` | `Section[]` | ✅ | LLM 생성 섹션 (제목, 마크다운, confidence) |
| `provenance` | `Record<string, ProvenanceKind>` | ✅ | 필드별 출처 (8종 ProvenanceKind) |

### 1.2 doc.body 공통 필드

| 필드 | 타입 | 필수 | 바인딩 대상 |
|---|---|:---:|---|
| `buildingName` | `string` | ✅ | A01 표지, 전체 |
| `address` | `string` | ✅ | A01, A06 입지 |
| `salePrice` | `number` | ✅ | A02 요약, 재무 슬라이드 |
| `pricePerPyeong` | `number` | ✅ | A02 요약 |
| `totalAreaPyeong` | `number` | ✅ | A02, A04 건물 |
| `landAreaPyeong` | `number` | ✅ | A04 토지 |
| `qualityGrade` | `A\|B\|C\|D` | ✅ | 등급 표시 |
| `investmentPosture` | `string` | ✅ | 포스처 결정 |
| `highlights` | `string[]` | ✅ | A02 핵심 투자 포인트 (3~4개) |
| `keyPoints` | `string[]` | — | A02 보조 지표 |

### 1.3 건물/토지 제원 (A04)

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `zoningCode` | `string` | ✅ | 용도지역 (예: 제2종일반주거) |
| `far` | `number` | ✅ | 용적률 (%) |
| `bcr` | `number` | ✅ | 건폐율 (%) |
| `builtYear` | `number` | ✅ | 건축년도 |
| `floorsAbove` | `number` | ✅ | 지상 층수 |
| `floorsBelow` | `number` | ✅ | 지하 층수 |
| `structureType` | `string` | ✅ | 구조 (RC, SRC 등) |
| `landUsePlan` | `string` | — | 토지이용계획확인원 |
| `parkingCount` | `number` | — | 주차대수 |
| `elevatorCount` | `number` | — | 승강기 수 |

### 1.4 DataAvailability (덱 시퀀서 입력)

> [!IMPORTANT]
> 이 플래그에 따라 슬라이드가 동적으로 추가/생략됩니다.
> 골든 IM은 가능한 모든 플래그를 `true`로 설정하여 최대 면수를 달성해야 합니다.

| 플래그 | B-1 | B-2 | B-3 | B-4 | B-5 |
|---|:---:|:---:|:---:|:---:|:---:|
| `hasBuildingRegister` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hasLandUsePlan` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hasRegistryData` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hasComparables` | ✅ | ❌ | ✅ | ✅ | ✅ |
| `hasRentRoll` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `hasCommercialDistrict` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `hasCadastralMap` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hasFloorPlan` | ✅ | ❌ | ✅ | ❌ | ✅ |
| `hasPhotos` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hasOpex` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `hasAsOf` | ✅ | ❌ | ✅ | ✅ | ✅ |
| `hasScenario` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `hasExpertReview` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `hasPermitZone` | ✅ | ✅ | ✅ | ✅ | ✅ |

### 1.5 ReleaseTier 결정 조건 (`resolveTier()`)

```
D등급                          → internal_only
공부+토지이용 없음              → internal_only
렌트롤·비교사례 모두 없음       → fact_om
development + 전문가 없음       → analysis_im
기준일·시나리오 없음            → analysis_im
A/B등급 + 전부 충족             → decision_im
C등급                          → analysis_im (최대)
```

### 1.6 입지 데이터 (A06)

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `nearestStation` | `string` | ✅ | 최근접 지하철역 |
| `distanceToStation` | `number` | ✅ | 역거리 (m) |
| `walkingMinutes` | `number` | — | 도보 시간 |
| `nearbyFacilities` | `string[]` | — | 주변 시설 |
| `mapImageUrl` | `string` | — | 지도 이미지 URL |

### 1.7 리스크·체크리스트·절차 (공통 마감)

| 슬라이드 | 필요 데이터 | 설명 |
|---|---|---|
| A15 투자 논거 | `body.thesis` | 투자 매력 3~4대 핵심 논거 |
| A07 리스크 | `body.riskFactors[]` | 리스크 요인 3~5개 + 대응 방안 |
| A12 체크리스트 | `body.checklist[]` | 실사 항목 5~8개 |
| A09 절차 | `body.process` | 매매 진행 절차 (LOI→실사→계약→잔금) |
| A10 마감 | `broker`, `docno` | 중개인 연락처, 면책 조항 |

### 1.8 사진 데이터 (A14 갤러리)

| 필드 | 타입 | 필수 | 요구사항 |
|---|---|:---:|---|
| `photos` | `Photo[]` | ✅ | 건물 외관/내부 사진 3~6장 |
| `photo.url` | `string` | ✅ | 이미지 URL (최소 150 DPI) |
| `photo.caption` | `string` | ✅ | 캡션 (예: "건물 전경", "1층 로비") |
| `photo.category` | `string` | — | 17종 분류 코드 |

> [!NOTE]
> 사진 품질 요구: **DPI ≥ 150**, 크로핑률 < 45%, 종횡비 왜곡 < 5%.
> 골든 IM용 사진은 이미지 PII(물건명·임차인명) 없어야 합니다.

---

## 2. B-1: 양평동 A등급 income (decision_im)

### 2.1 포스처 전용 슬라이드

| dataKey | 아키타입 | 필요 데이터 |
|---|---|---|
| `rentRoll` | A03 | 임차인 목록, 층/호, 전용면적, 보증금, 월세, 계약기간, 임대율 |
| `stability` | A04 | 임대안정성 분석 (평균 입주기간, 연체율, 임차인 신용) |
| `profit` | A05 | 수익구조 (NOI, OPEX, Cap Rate, 순수익 흐름) |
| `comps` | A03 | 비교사례 3~5건 (주소, 매매가, 면적, Cap Rate, 거래시점) |

### 2.2 A등급 재무 슬라이드

| dataKey | 아키타입 | 필요 데이터 |
|---|---|---|
| `capital` | A16 | 매입가, 취등록세, 보증금 승계, 자기자본, 대출비율 |
| `dcf` | A05 | 할인율, 보유기간, 연도별 순현금흐름, 처분가정 |
| `sensitivity` | A05 | 할인율 ±50bp × 공실률 ±5% 매트릭스 |
| `totalReturn` | A05 | 연 총수익률 (Equity Multiple, IRR, CoC) |
| `loan` | A08 | LTV, 금리, 상환방식, DSCR |
| `tax` | A08 | 취득세, 재산세, 종부세, 양도소득세 추정 |

### 2.3 재무 계산 입력 (`FinancialCalculator.calculate()`)

| 입력 | 타입 | 설명 |
|---|---|---|
| `salePrice` | `number` | 매매대금 |
| `totalGrossIncome` | `number` | 총 임대수입 |
| `vacancyRate` | `number` | 공실률 (%) |
| `opex` | `number` | 운영비 |
| `capRate` | `number` | Cap Rate |
| `ltv` | `number` | 대출비율 (%) |
| `interestRate` | `number` | 대출금리 (%) |
| `holdingPeriod` | `number` | 보유기간 (년) |
| `discountRate` | `number` | 할인율 (%) |
| `exitCapRate` | `number` | 처분 Cap Rate (%) |
| `acquisitionCostRate` | `number` | 취등록세율 (%) |

### 2.4 Claim 검증 요구

| Claim | 출처 | 검증 |
|---|---|---|
| Cap Rate 수치 | `broker_input` | 산식 재현 가능 (G51) |
| NOI 수치 | `public_data` + `broker_input` | 총수입 - 운영비 = NOI (교차 검증) |
| 공실률 수치 | `broker_input` | 만실/공실 서술어 모순 없음 (G41) |
| 기준일 | `broker_input` | 모든 수치에 기준일 표시 (G50) |

### 2.5 부록 데이터

| dataKey | 조건 | 필요 데이터 |
|---|---|---|
| `publicRecords` | 건축물대장+토지이용 | 대장 요약 테이블 |
| `titleRights` | 등기부 | 갑구/을구 요약, 근저당, 전세권 |
| `cadastralMap` | 지적도 WMS | 지적도 이미지 URL |
| `commercialDistrict` | 상권 데이터 | 유동인구, 업종 분포, 매출 트렌드 |

---

## 3. B-2: 필동 C등급 income (fact_om)

### 3.1 제한사항

> [!WARNING]
> C등급 + `fact_om`은 **재무 슬라이드 전량 생략**됩니다.
> `allowFinancials = false` → 자본구조/DCF/총수익률/대출/세금 없음.
> `hasRentRoll = false` → 렌트롤 슬라이드 없음.

### 3.2 포스처 전용 슬라이드 (축소)

| dataKey | 아키타입 | 필요 데이터 |
|---|---|---|
| `stability` | A04 | 임대안정성 — 정성적 서술만 (수치 미확인) |
| `profit` | A05 | 수익구조 — 매매가 기반 추정만 |
| `comps` | A03 | 비교사례 없음 (`hasComparables = false`) |

### 3.3 최소 데이터셋

사실형 OM에 필요한 최소 데이터:

| 데이터 | 출처 | 설명 |
|---|---|---|
| 건물 제원 | 건축물대장 | 면적, 층수, 구조, 건축년도 |
| 토지 제원 | 토지이용확인 | 용도지역, 용적률, 건폐율 |
| 매매 호가 | 중개인 입력 | 가격만 있고 산식 미확인 |
| 사진 2~3장 | 현장 촬영 | 외관 + 입구 최소 |
| 입지 정보 | 공공 API | 역거리, 주변 시설 |

---

## 4. B-3: 당산 B등급 owner_occupied (analysis_im)

### 4.1 포스처 전용 슬라이드

| dataKey | 아키타입 | 필요 데이터 |
|---|---|---|
| `plan` | A04 | 사용계획 (입주 시기, 용도, 면적 배분) |
| `vsLease` | A08 | 자가 vs 임차 비교 (월 비용, 5년 TCO, NPV) |
| `commute` | A06 | 통근·접근성 (본사↔신사옥 비교) |
| `value` | A04 | 자산가치 (토지가 상승률, 감가상각, 시세 추이) |

### 4.2 자가 비교 데이터 (`vsLease` 슬라이드)

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `currentRent` | `number` | ✅ | 현재 임차 월 비용 |
| `mortgagePayment` | `number` | ✅ | 매입 시 월 상환액 |
| `breakEvenYears` | `number` | — | 손익분기 연차 |
| `fiveYearTco` | `{ buy: number; lease: number }` | ✅ | 5년 총비용 비교 |

### 4.3 B등급 재무

자본구조(A16) + 총수익률(A05)만 포함 (DCF·민감도·대출·세금 없음).

---

## 5. B-4: 개발부지 B등급 development (analysis_im)

### 5.1 포스처 전용 슬라이드

| dataKey | 아키타입 | 필요 데이터 |
|---|---|---|
| `land` | A04 | 토지 상세 (필지, 제척, 유효면적, 도로 접면) |
| `scale` | A05 | 신축 규모 (용적률 여유, 건축 가능 면적, 총 GFA) |
| `eviction` | A04 | 명도 (기존 임차인 수, 명도 일정, 보상 추정) |
| `cost` | A08 | 투입비용 (토지매입+건축+부대 = 총사업비) |
| `stacking` | A17 | 스태킹 플랜 (층별 용도 배분) |
| `feasibility` | A05 | 사업수지 (총수입 vs 총비용, 사업이익률) |

### 5.2 개발 전용 데이터

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `effectiveLandArea` | `number` | ✅ | 유효 대지면적 (㎡) |
| `allowedFAR` | `number` | ✅ | 허용 용적률 (%) |
| `maxGFA` | `number` | ✅ | 최대 건축 가능 연면적 (㎡) |
| `constructionCostPerPyeong` | `number` | ✅ | 평당 건축비 (원) |
| `totalProjectCost` | `number` | ✅ | 총 사업비 |
| `expectedRevenue` | `number` | ✅ | 예상 분양/임대 수입 |
| `profitMargin` | `number` | ✅ | 사업이익률 (%) |
| `timelineMonths` | `number` | ✅ | 사업 기간 (개월) |
| `existingTenants` | `number` | — | 기존 임차인 수 |
| `evictionCost` | `number` | — | 명도 보상 추정액 |
| `stackingPlan` | `StackingRow[]` | ✅ | 층별 용도 배분 |

> [!NOTE]
> **D36 §1.9**: development는 전문가 검토(`hasExpertReview`) 없이
> `analysis_im`까지만 발행 가능합니다 (Screening 원칙).
> `decision_im` 발행은 `hasExpertReview = true` 필수.

### 5.3 제척/유효면적 규칙 (im.parcel.yaml)

```
유효 대지면적 = 총 대지면적 - Σ(제척면적 where affectsFAR = true)
effectiveFAR = 건축연면적 / 유효 대지면적 × 100
```

---

## 6. B-5: 숙박시설 A등급 operating (decision_im)

### 6.1 포스처 전용 슬라이드

| dataKey | 아키타입 | 필요 데이터 |
|---|---|---|
| `kpi` | A13 | 운영지표 (객실수, ADR, OCC, RevPAR, GOP) |
| `revenue` | A05 | 매출 구조 (객실, F&B, 부대, 기타) |
| `seasonality` | A05 | 계절성 (월별 OCC, ADR 패턴) |
| `operator` | A04 | 운영사 (브랜드, 계약형태, 수수료, 잔여기간) |

### 6.2 운영 전용 데이터

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `roomCount` | `number` | ✅ | 객실 수 |
| `adr` | `number` | ✅ | 평균 객실 단가 (ADR, 원) |
| `occupancyRate` | `number` | ✅ | 점유율 (OCC, %) |
| `revpar` | `number` | ✅ | RevPAR (원) |
| `gop` | `number` | ✅ | 실질 영업이익 (GOP, 원) |
| `gopMargin` | `number` | ✅ | GOP 마진 (%) |
| `monthlyRevenue` | `number[]` | ✅ | 월별 매출 (12개월) |
| `monthlyOcc` | `number[]` | ✅ | 월별 점유율 (12개월) |
| `operatorName` | `string` | ✅ | 운영사명 |
| `managementFeeRate` | `number` | ✅ | 운영 수수료율 (%) |
| `contractType` | `string` | ✅ | 위탁/직영/프랜차이즈 |
| `contractExpiry` | `string` | — | 계약 만료일 |
| `revenueBreakdown` | `{ rooms: number; fnb: number; other: number }` | ✅ | 매출 구성비 |

### 6.3 A등급 재무 (income과 동일)

자본구조 + DCF + 민감도 + 총수익률 + 대출 + 세금 전부 포함.
operating 포스처의 DCF는 NOI 대신 **GOP 기반**으로 계산합니다.

---

## 7. 교차 검증 데이터 (cross-validator)

파서 셀프 검증 외에 교차 검증기가 추가로 확인하는 데이터 조합:

| 검증 | 필요 필드 | 조건 |
|---|---|---|
| `cap_rate_narrative` | Cap Rate, NOI, 매매가 | NOI ÷ 매매가 = Cap Rate ±0.5% |
| `noi_narrative` | 총수입, 운영비, NOI | 총수입 - 운영비 = NOI |
| `vacancy_narrative` | 공실률, 서술어 | 만실 서술 + 공실률>5% 모순 금지 |
| `price_area` | 매매가, 면적, 평당가 | 매매가 ÷ 면적 = 평당가 ±1% |
| `yield_basis` | 수익률 basis, 계산 경로 | basis 라벨과 실제 계산 일치 |
| `leverage` | LTV, Cap Rate, 금리 | 역레버리지(Cap < 금리) 시 경고 표시 |

---

## 8. 파서 검증 통과 기준 (셀프 검증)

골든 IM의 PPTX 파서 감사 결과는 다음을 만족해야 합니다:

| 항목 | 기준 | 근거 |
|---|---|---|
| 레이아웃 위반 | **0건** | G31~G36 전항 통과 |
| 표준 위반 | **0건** | G41~G44 전항 통과 |
| 크로핑률 | < 45% | G31 |
| 실효 DPI | ≥ 150 | G32 |
| 텍스트 넘침 | 0건 | G33 |
| 요소 겹침 | ≤ 0.015in | G34 |
| 지면 이탈 | 0건 | G35 |
| 종횡비 왜곡 | < 5% | G36 |
| 만실↔공실 모순 | false | G41 |
| 폴백 중복 | 0건 | G42 |
| 괄호 균형 | 0건 | G44 |

---

## 9. Provenance 8종 매핑

각 데이터 필드에 출처를 명시해야 합니다:

| ProvenanceKind | 한국어 | 신뢰도 가중치 | 대표 데이터 |
|---|---|:---:|---|
| `public_data` | 공공데이터 | 1.0 | 건축물대장, 등기부, 공시지가 |
| `broker_input` | 중개인 입력 | 0.8 | 매매가, 렌트롤, 임대조건 |
| `field_verified` | 현장확인 | 0.9 | 사진, 현장 면적 실측 |
| `llm_generated` | AI 생성 | 0.4 | 투자 논거, 리스크 분석 |
| `llm_calculated` | AI 계산 | 0.6 | 수익률, DCF |
| `market_data` | 시장데이터 | 0.7 | 실거래 비교사례, 시세 |
| `expert_opinion` | 전문가 의견 | 0.9 | 감정평가, 법률 검토 |
| `assumption` | 가정 | 0.3 | 공실률 추정, 할인율 |

---

## 10. 데이터 준비 체크리스트

### B-1 양평동 (income/A/decision_im)

- [ ] 건물 제원 (건축물대장 기반)
- [ ] 렌트롤 전체 (층별 임차인·보증금·월세·계약기간)
- [ ] 매매가 + Cap Rate + NOI 산식
- [ ] DCF 입력 (할인율, 보유기간, 처분 Cap Rate)
- [ ] 대출 조건 (LTV, 금리, DSCR)
- [ ] 취등록세·재산세·양도세 추정
- [ ] 비교사례 3건 이상
- [ ] 건물 사진 5~6장 (DPI ≥ 150)
- [ ] 기준일 명시
- [ ] 시나리오 (Base/Upside/Downside)

### B-2 필동 (income/C/fact_om)

- [ ] 건물 제원 (건축물대장 기반)
- [ ] 매매 호가 (산식 미확인 가능)
- [ ] 건물 사진 2~3장
- [ ] 입지 정보 (역거리, 주변 시설)
- [ ] 등기부 요약

### B-3 당산 (owner_occupied/B/analysis_im)

- [ ] 건물 제원
- [ ] 현재 임차 비용 vs 매입 상환 비교
- [ ] 5년 TCO 비교 데이터
- [ ] 통근 접근성 (본사↔신사옥)
- [ ] 비교사례 2건 이상
- [ ] 건물 사진 4~5장
- [ ] 기준일 명시

### B-4 개발부지 (development/B/analysis_im)

- [ ] 토지 상세 (필지, 제척, 유효면적)
- [ ] 용적률 여유 + 최대 GFA
- [ ] 명도 현황 (임차인 수, 보상)
- [ ] 사업비 내역 (토지+건축+부대)
- [ ] 스태킹 플랜 (층별 용도)
- [ ] 사업수지 (수입/비용/이익률)
- [ ] 지적도 이미지
- [ ] 기준일 명시

### B-5 숙박시설 (operating/A/decision_im)

- [ ] 객실 수 + ADR + OCC + RevPAR + GOP
- [ ] 월별 매출/점유율 12개월
- [ ] 매출 구성비 (객실/F&B/기타)
- [ ] 운영사 정보 (계약형태, 수수료)
- [ ] DCF 입력 (GOP 기반)
- [ ] 대출 조건
- [ ] 세금 추정
- [ ] 비교사례 3건
- [ ] 건물 사진 5~6장
- [ ] 기준일 + 시나리오
