# 섹션 3~4: 포스처별 핵심 분석 섹션 (Income / Development / Owner / Operating / Trading)

> **전 포스처 공통 공식**: 섹션 3 = 현황 분석, 섹션 4 = 수익·비용·타당성 분석
> **emphasize 적용**: 섹션 3, 4는 모든 포스처에서 `emphasize` 대상 → **maxTokens ×2**

---

## 1. income 포스처: lease_status + income_analysis

### 1.1 lease_status (임대차 현황)

#### 섹션 미션
```
임대차 안정성과 공실 리스크 통제 상태를 설명하세요.
첫 문장에 '만실 운영 중 / 공실률 ○%' 등 현재 임대 안정성을 즉시 제시하세요.
```

#### 핵심 데이터 소스
| 소스 | 필드 | 용도 |
|:---|:---|:---|
| **supplemental** | `floor_leases[]` | 층별 임차인, 보증금, 월세, 계약 기간 |
| **supplemental** | `vacancy_pct` | 공실률 |
| **supplemental** | `total_deposit_manwon` | 보증금 합계 |
| **supplemental** | `monthly_rent_total_krw` | 월 임대료 합계 |

#### 결정론적 Rent Roll 주입 (핵심 로직)

[`lease-adapter.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/lease-adapter.ts) — **LLM 할루시네이션 방지의 핵심 메커니즘**:

1. `normalizeFloorLeases(floor_leases)` → 층 정규화 (B1, 1F, 2F~3F 등)
2. `formatRentRollMarkdown(normalized)` → 마크다운 테이블 생성
3. `formatRentRollSummary(normalized)` → 보증금/월세 합계 + 공실률 요약
4. **LLM이 생성한 테이블을 완전 교체** (L349–378 in `im-section-generator.ts`)

```markdown
| 층 | 임차인 | 보증금 | 월세 | 비고 |
|:---|:---|---:|---:|:---|
| 1F | 고은약국 | 5,000만 | 350만 | |
| 1F·2F·5F | 로뎀나무내과 | 1억 | 750만 | |
| 3F | 프리미엄 헬스장 | 5,000만 | 366만 | |
| 4F(401호) | 국제와인 | 4,000만 | 260만 | 갱신요구권 7년 잔여 |
```

> ⚠️ **LLM이 '6-7F' → '6층'으로 재인덱싱하는 할루시네이션을 방지**하기 위해, floor_leases 데이터가 있으면 AI 생성 테이블을 결정론적으로 교체합니다.

#### PPTX 매핑 (A03 Rent Roll)
| 요소 | 데이터 |
|:---|:---|
| 보증금 총액 | `totalDepositKrw` |
| 월 임대료 총액 | `monthlyRentTotalKrw` |
| 공실 현황 | `vacancyPct` + 층별 상세 |
| 층별 임차인 테이블 | `floor_leases[]` |
| 갱신요구권 잔여 | `floor_leases[].note` |

---

### 1.2 income_analysis (수익성 분석)

#### 섹션 미션
```
실투자금(내 돈), 월 순수익, 연 순수익률(Cap Rate), 대지 지분 가치 비중을
종합하여 현금흐름과 원금 안전성을 명확히 서술하세요.
```

#### 재무 계산 엔진 (`financials.ts`)

[`financials.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts) — 29,889 바이트, 핵심 산출:

| 지표 | 산출식 | 소스 |
|:---|:---|:---|
| **Cap Rate (Base)** | (월임대료 × 12 × 0.85) ÷ 매매가 × 100 | supplemental |
| **NOI (연간 순영업수익)** | 월임대료 × 12 × (1 - 공실률/100) × 0.85 | supplemental |
| **실투자금** | 매매가 - 대출금 - 보증금 합계 | supplemental |
| **자기자본수익률** | NOI ÷ 실투자금 × 100 | 계산 |
| **DSCR** | NOI ÷ (연간 원리금 상환) | 계산 |
| **대지 지분 가치** | 대지면적(㎡) × 공시지가(원/㎡) | 공공API |
| **땅값 비중** | 대지 지분 가치 ÷ 매매가 × 100 | 계산 |
| **DCF 10년** | discounted cash flow (dcf-sensitivity.ts) | 계산 |

#### 순수익 계산기 (`net-cash-flow-calculator.ts`)

[`net-cash-flow-calculator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/net-cash-flow-calculator.ts):
```
월 순수익 = 월 임대료 - 월 대출이자
연 순수익 = 월 순수익 × 12
자기자본수익률 = 연 순수익 ÷ 실투자금 × 100
```

#### 포스처 오버레이 (income 전용)
```
[실투자금 & 월 순수익 필수 포함 지침]
- 실투자금(내 돈) = 매매 희망가 - 선순위 대출금 - 보증금 합계
- 월 순수익(통장에 입금되는 돈) = 월 임대료 - 월 대출이자
- 자기자본수익률(내 돈 대비 연 수익률) = (연 순수익 / 실투자금) × 100
- 토지 지분 가치 비중(공시지가 기준 땅값 비율)을 함께 언급
```

> **소스**: [`posture-prompts.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/posture-prompts.ts) L36–43

#### PPTX 매핑 (A05 Profit)
| 요소 | 데이터 |
|:---|:---|
| 현재 Cap Rate | `financials.capRate.base` |
| 연간 실질 임대수입 | `financials.annualNoi.base` |
| 임대료 정상화 시뮬레이션 | value-add-engine 산출 |
| 법정 상한 규제 반영 | `floor_leases[].note` |
| 정상화 후 Cap Rate | value-add 시나리오 |
| 투자 가치 제안 서사 | AI 생성 |

#### 골든 레퍼런스 (income)
```markdown
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **연간 순수익(남는 돈)** | 약 11.4억~14.0억 원 | 운영비 차감 후 |
| **연 순수익률(Cap Rate)** | **2.5%–3.1%** | 매매가 450억 기준 |
| **실투자금(내 돈)** | **약 180억 원** | 대출·보증금 차감 후 |
| **내 돈 대비 수익률** | **6.3%~7.8%** | 레버리지 수익률 |
| **땅값 비중(원금 안전판)** | **68.5%** | 하방 경직성 |
```

---

## 2. development 포스처: site_analysis + development_feasibility

### 2.1 site_analysis (대지 분석)

#### 섹션 미션
```
대지면적, 용도지역, 건폐율/용적률 개발 여력 및 신축 개발 잠재력을 강조하세요.
```

#### 포스처 오버레이
```
[대지 분석 지침]
- 용적률 현재 vs 법정 상한 → 잔여 용적률 (%)
- 건폐율 현재 vs 법정 상한 → 증축/신축 가능 면적 (㎡)
- 일조권·도로사선 제한 분석
- 정북방향·인접대지 이격거리 제한
- 토지형상(정형/부정형) 및 접도 조건
- 중요: 관할 관청 확인 필수 문구 포함
```

#### 핵심 데이터
| 소스 | 필드 | 용도 |
|:---|:---|:---|
| 건축물대장 | `platArea` | 대지면적 |
| 건축물대장 | `bcRat`, `vlRat` | 현 건폐율·용적률 |
| 토지이용계획 | `buildingCoverageMax`, `floorAreaRatioMax` | 법정 상한 |
| 토지이용계획 | `zoningDistrict` | 용도지역 |
| 공시지가 | `pricePerSqm` | 토지 단가 |

### 2.2 development_feasibility (개발 사업수지)

#### 섹션 미션
```
토지 매입가, 예상 공사비, 총 사업비 및 개발 이익률 수지 분석을 종합하여
사업 타당성을 묘사하세요. 첫 문장에 '예상 총 사업비 ○억, 개발 이익률 ○%'를 명시하세요.
```

#### 포스처 오버레이
```
[개발 사업수지 분석 지침]
- 토지비 + 공사비 + 부대비용 → 총 사업비 산정
- 예상 분양가 × 분양면적 → 총 분양수입
- 사업수익률(%) = (분양수입 - 총사업비) / 총사업비 × 100
- 시공비 단가는 권역 평균 기준 (평당 550~700만원)
- PF 조건: LTV 60%, 금리 7~9% 기준
```

---

## 3. owner_occupied 포스처: occupancy_fit + cost_comparison

### 3.1 occupancy_fit (사옥 적합성)

#### 포스처 오버레이
```
[사옥 적합성 분석 지침]
- 기업 규모별 필요 면적 대비 전용률·공용률 적합도
- 주차 대수 대비 직원 수 예상 적정성
- 회의실·로비·카페테리아 등 부대시설 확보 가능성
- 기업 단독 브랜딩 및 옥상/외벽 간판 설치 가능 여부
  (❌ '네이밍 라이츠' → ✅ '사옥 단독 명칭 표기')
```

### 3.2 cost_comparison (자가 vs 임차 비교)

#### 포스처 오버레이
```
[비용 비교 분석 지침]
- 자가 매입 vs 임차 10년 비교 시나리오
- 매입 시: 취득세 4.6%, 법인세 절감(감가상각), 자산 가치 상승
- 임차 시: 보증금 기회비용, 임대료 인상률 3%/년 반영
```

---

## 4. operating 포스처: operation_overview + gop_analysis

### 4.1 operation_overview (운영 현황)

#### 섹션 미션
```
직영 자가운영 영업 개요 및 브랜드 오퍼레이션 현황을 설명하세요.
```

### 4.2 gop_analysis (GOP 분석)

#### 섹션 미션
```
실질 영업이익(GOP), 객단가(ADR), 가동률(OCC) 등
직영 운영 재무 실적을 묘사하세요.
첫 문장에 '연간 GOP ○억 원, GOP 마진율 ○%'를 명시하세요.
```

#### 전용 용어집 (`POSTURE_LEXICONS.operating`)
| 약어 | 한글 표기 |
|:---|:---|
| GOP | 실질 영업이익(GOP) |
| ADR | 평균 객단가(ADR) |
| OCC | 가동률(OCC) |
| RevPAR | 객실당 수익(RevPAR) |
| GOP Cap Rate | GOP 기반 환원수익률 |

---

## 5. trading 포스처: market_position + comparable_analysis

### 5.1 market_position (시장 포지셔닝)

#### 섹션 미션
```
주변 매매 시세 및 경쟁 매물 대비 본 자산의 마켓 포지셔닝(할인율)을 제시하세요.
```

### 5.2 comparable_analysis (비교사례 분석)

#### 섹션 미션
```
인근 거래사례와의 평당가 비교 및 단기 매각 시 목표 차익 타당성을 입증하세요.
```

#### 핵심 데이터
| 소스 | 필드 | 용도 |
|:---|:---|:---|
| 실거래가 API | `comparableTransactions[]` | 인근 거래 사례 |
| 실거래가 API | `pricePerPyeong` | 평당 거래가 |
| supplemental | `manual_comps[]` | 브로커 수동 입력 비교사례 |

#### 비교사례 벤치마크 (`comparable-benchmark.ts`)

[`comparable-benchmark.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/comparable-benchmark.ts) — 공공 API 실거래가를 기반으로:
- 인근 유사 건물 거래가 평당 비교
- 매물 평당가 vs 인근 시세 대비 할인율 산출
- 시세 차익 추정

---

## 6. 토큰 제한 (섹션 3~4)

| 섹션 유형 | 기본 maxTokens | emphasize 시 |
|:---|:---:|:---:|
| lease_status | 1,000 (기본) | 2,000 |
| income_analysis | **1,800** | **3,600** |
| site_analysis | 1,200 | 2,400 |
| development_feasibility | 1,500 | 3,000 |
| occupancy_fit | 1,200 | 2,400 |
| cost_comparison | 1,500 | 3,000 |
| operation_overview | 1,200 | 2,400 |
| gop_analysis | 1,500 | 3,000 |
| market_position | 1,200 | 2,400 |
| comparable_analysis | 1,500 | 3,000 |
