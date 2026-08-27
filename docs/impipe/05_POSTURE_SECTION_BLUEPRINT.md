# 05 포스처별 모범 IM 섹션 블루프린트

> **정본** `SECTION_CATALOG` · `deck-sequencer.ts` · `im.pages.yaml` · `im.bindings.yaml` · `im.ontology.yaml`
> **선행** D33 렌더 수렴 · D34 테스트 재편 · D35 모델 골든 IM 요구서
> **소유** CREDEAL 렌더 팀
> **버전** v1.1 (2026-08-27)

---

## 0. 문서 목적

이 문서는 각 포스처(income, owner_occupied, development, operating, trading)별로
**모범적인 IM의 섹션(페이지) 구성**과 **섹션별 상세 블루프린트**를 정의합니다.

모델 골든 IM(D35)을 수작업으로 정정할 때, 그리고 렌더 엔진을 개선할 때
**"이 섹션에 무엇이 있어야 하는가"**의 정답 역할을 합니다.

---

## 1. 공통 구조

모든 포스처의 IM은 다음 3계층으로 구성됩니다:

```
┌─────────────────────────────────────────────┐
│  1) 도입부 (공통 4면)                         │
│     cover → summary → land → building        │
├─────────────────────────────────────────────┤
│  2) 본문 (포스처별 3~6면)                     │
│     포스처 고유 섹션 + 등급 기반 재무 확장      │
├─────────────────────────────────────────────┤
│  3) 마감부 (공통 5면)                         │
│     thesis → risk → checklist → process → closing │
└─────────────────────────────────────────────┘
```

### 공통 도입부 (4면)

| 순서 | dataKey | 아키타입 | 타이틀 | 데이터 소스 |
|:---:|---|:---:|---|---|
| 1 | `cover` | A01 | 표지 | address, salePrice, hero/front 사진 |
| 2 | `summary` | A02 | 핵심 요약 | 제원 6대 지표 + highlights 3~4건 |
| 3 | `land` | A04 | 토지 현황 | land_sqm, zoning, far, bcr, 공시지가 |
| 4 | `building` | A04 | 건물 개요 | gfa_sqm, 구조, 층수, 준공일, 주용도 |

### 공통 마감부 (5면)

| 순서 | dataKey | 아키타입 | 타이틀 | 데이터 소스 |
|:---:|---|:---:|---|---|
| N-4 | `thesis` | A15 | 투자 논거 | LLM 생성 3대 투자 포인트 |
| N-3 | `risk` | A07 | 리스크 | 위반건축물, 제척, 권리관계, 법적 쟁점 |
| N-2 | `checklist` | A12 | 실사 체크리스트 | 결손 항목 + 게이트 경고 + 가정값 |
| N-1 | `process` | A09 | 진행 절차 | 표준 거래 절차 6단계 |
| N | `closing` | A10 | 마감 | 면책 고지 + 연락처 |

### 등급 기반 재무 확장 (Grade Extension)

| 조건 | 추가 면 | dataKey |
|---|---|---|
| A등급 | 자본구조 · DCF · 민감도 · 총수익률 · 대출 · 세금 | capital, dcf, sensitivity, totalReturn, loan, tax |
| B등급 | 자본구조 · 총수익률 | capital, totalReturn |
| C등급 | (추가 없음) | — |

### 데이터 가용성 기반 동적 추가

| 조건 | 추가 면 | dataKey |
|---|---|---|
| 건축물대장 + 토지이용계획 | 공부 발췌 | publicRecords |
| 등기부 | 권리관계 | titleRights |
| 지적도 WMS | 지적도 | cadastralMap |
| 상권 데이터 | 상권 분석 | commercialDistrict |
| hasRentRoll=true | 렌트롤 | rentRoll |
| hasPhotos=true | 갤러리 | gallery |

---

## 2. 수익형 (income) — 12섹션 · 기대 15면(A) / 13면(B)

> 핵심: **임대차 현황과 수익 분석이 IM의 중심**
> 강조 섹션: `lease_status`, `income_analysis`

### 2.1 모범 섹션 구성

| # | 면 | dataKey | 아키타입 | 섹션 카탈로그 | 필수 |
|:---:|---|---|:---:|---|:---:|
| 1 | 표지 | cover | A01 | — | — |
| 2 | 핵심 요약 | summary | A02 | property_overview | ✅ |
| 3 | 토지 현황 | land | A04 | land_detail | — |
| 4 | 건물 개요 | building | A04 | — | — |
| 5 | 렌트롤 | rentRoll | A03 | lease_status | ✅ |
| 6 | *포스처별* | *분기* | — | income_analysis | ✅ |
| 7 | *포스처별* | *분기* | — | — | — |
| 8 | 비교사례 | comps | A03 | comparables | — |
| 9 | 투자 논거 | thesis | A15 | investment_thesis | — |
| 10 | 리스크 | risk | A07 | risk_check | — |
| 11 | 실사 체크리스트 | checklist | A12 | checklist | ✅ |
| 12 | 진행 절차 | process | A09 | next_steps | — |

### 2.2 아키타입 분기 (6~7면)

| incomeArchetype | 6면 | 7면 | 특화 |
|---|---|---|---|
| **R-INC-01** (임대 안정) | 임대안정성 (stability) | 수익구조 (profit) | 안정적 현금흐름 강조 |
| **R-INC-02** (가치 상승) | 가치 상승 계획 (valueAdd) | 용적률 여유 (farUpside) | 리모델링/증축 잠재력 |
| **R-INC-04** (임대료 정상화) | 정상화 경로 (rentGap) | 갱신 인상 시나리오 (upside) | 시세 대비 저임대 갭 |
| **R-INC-05** (공실 해소) | 공실 원인·유치 전략 (vacancy) | 임차 유치 시나리오 (leasing) | 공실률 해소 로드맵 |
| **R-INC-06** (리모델링) | 현황 (current) | 리모델링 전후 비교 (remodel) | 개보수 투자 대비 수익 |

### 2.3 섹션별 블루프린트

#### 📄 cover (표지) — A01

| 항목 | 상세 |
|---|---|
| **레이아웃** | 전면 hero 사진 + 하단 밴드(주소, 가격, 면적) |
| **데이터 소스** | `address_jibun`, `price_krw`, `gfa_sqm`, `land_sqm` |
| **사진** | hero(필수), front(보조) — min DPI 180 |
| **작성 요건** | 사진 없이 표지를 내지 않음 (im.pages.yaml §cover) |
| **게이트** | G01(가격), G02(면적), G03(주소), G20(사진PII) |

#### 📄 summary (핵심 요약) — A02

| 항목 | 상세 |
|---|---|
| **레이아웃** | 좌: 제원 6대 지표 / 우: 투자 포인트 카드 3~4건 |
| **데이터 소스** | salePrice, gfa, landArea, capRate(basis 명기), yieldGross, vacancyPct |
| **작성 요건** | ① 좌우 텍스트 중복 금지 (AGENTS.md §3) ② highlights↔제원 중복 금지 (G43) ③ 제원 텍스트 필터링 (a02-stat-grid SPEC_TERMS) |
| **게이트** | G43(중복), QG12(Cap Rate basis) |

#### 📄 rentRoll (렌트롤) — A03

| 항목 | 상세 |
|---|---|
| **레이아웃** | 표 형식 — 호실, 업종/상호, 보증금, 월임대료, 만료일, 상태 |
| **데이터 소스** | rentroll_table (S1~S3) — rr_unit, rr_business, rr_deposit, rr_rent, rr_expiry, rr_state |
| **작성 요건** | ① 전량 표기 (상위 N행 요약 금지, im.pages.yaml §rentroll) ② 업종·상호 원문 그대로 (불변조건 6) ③ hasRentRoll=false면 면 자체 미개방 (D34 T3-RR-01) |
| **게이트** | G17(업종 추론 금지), G28(면적 분리) |
| **불변조건** | 18(렌트롤 전량 표기) |

#### 📄 stability / profit (임대안정성 · 수익구조) — A04, A05

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 공실률, 평균 잔여 임대기간, 갱신율, 운영비율, NOI/GOI |
| **작성 요건** | ① 수익률 basis 일관 (G38) ② 만실 서술+공실률>0 모순 금지 (G41, 불변조건 23) ③ 운영비 없이 NOI 산출 금지 (불변조건 1) ④ gross계열에 "순수익률" 라벨 금지 (불변조건 3) |

#### 📄 comps (비교사례) — A03

| 항목 | 상세 |
|---|---|
| **데이터 소스** | comps_table (S2a~S3) — 소재지, 면적, 거래가, 단가, 거래일 |
| **작성 요건** | ① 비교사례 없이 목표 매각가 산출 금지 (불변조건 5) ② 5~16건 범위 (im.pages.yaml §market.invariant) |
| **게이트** | G24(수치 교차 검증) |

---

## 3. 사옥형 (owner_occupied) — 9섹션 · 기대 13면(B)

> 핵심: **사용 적합성과 자가 vs 임차 비용 비교**
> 강조 섹션: `occupancy_fit`, `cost_comparison`
> 비노출: lease_status, land_detail, comparables

### 3.1 모범 섹션 구성

| # | 면 | dataKey | 아키타입 | 필수 |
|:---:|---|---|:---:|:---:|
| 1 | 표지 | cover | A01 | — |
| 2 | 핵심 요약 | summary | A02 | ✅ |
| 3 | 토지 현황 | land | A04 | — |
| 4 | 건물 개요 | building | A04 | — |
| 5 | 사용계획 | plan | A04 | ✅ |
| 6 | 자가비교 (임차 vs 매입) | vsLease | A08 | — |
| 7 | 통근·접근성 | commute | A06 | — |
| 8 | 자산가치 | value | A04 | — |
| 9~12 | 공통 마감 (thesis~closing) | — | — | checklist ✅ |

### 3.2 고유 섹션 블루프린트

#### 📄 plan (사용계획) — A04

| 항목 | 상세 |
|---|---|
| **데이터 소스** | buyer_purpose, 층별 배치안, 주차 대수, 회의실/집무실 배분 |
| **작성 요건** | ① 자가사용 공간과 잔여 임대 공간 분리 ② 잔여 임대 포함 시 occupancy_fit 필수 (D30 M-14) |

#### 📄 vsLease (자가비교) — A08

| 항목 | 상세 |
|---|---|
| **레이아웃** | 2열 비교 표 — 좌: 매입 시나리오 / 우: 임차 시나리오 |
| **데이터 소스** | 매입가, 대출이자, 관리비, 감가상각 vs 임차료, 보증금 기회비용 |
| **작성 요건** | 10년 총비용 비교 기준 |

#### 📄 commute (통근·접근성) — A06

| 항목 | 상세 |
|---|---|
| **데이터 소스** | transit (S2a) — 최근 역, 도보 거리, 버스 노선, 주요 도로 |
| **작성 요건** | 지도 이미지 포함 시 min DPI 150 (capture) |

---

## 4. 개발형 (development) — 10섹션 · 기대 13면(B)

> 핵심: **토지 가치와 개발 사업 수지**
> 강조 섹션: `site_analysis`, `development_feasibility`
> 비노출: lease_status, income_analysis, comparables

### 4.1 모범 섹션 구성

| # | 면 | dataKey | 아키타입 | 필수 |
|:---:|---|---|:---:|:---:|
| 1 | 표지 | cover | A01 | — |
| 2 | 핵심 요약 | summary | A02 | ✅ |
| 3 | 토지 현황 | land | A04 | — |
| 4 | 건물 개요 | building | A04 | — |
| 5 | 토지상세 | land (확장) | A04 | — |
| 6 | 신축규모 | scale | A05 | ✅ |
| 7 | 명도 | eviction | A04 | — |
| 8 | 투입비용 | cost | A08 | — |
| 9 | 스태킹 | stacking | A17 | — |
| 10 | 사업수지 | feasibility | A05 | ✅ |
| 11~15 | 공통 마감 | — | — | checklist ✅ |

### 4.2 고유 섹션 블루프린트

#### 📄 scale (신축규모) — A05

| 항목 | 상세 |
|---|---|
| **데이터 소스** | zoning, far_limit, bcr_limit (S2a), land_sqm |
| **작성 요건** | ① 용도지역 조회 실패 시 산출 거부 (불변조건 4) ② 법정 용적률·건폐율은 토지이용계획 API 기준 (im.assumptions.yaml §targetFarByZoning) ③ 400% 일괄 적용 금지 (잠원동 사고) |
| **게이트** | G05(교차 검증) |

#### 📄 eviction (명도) — A04

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 현 임차인 수, 잔여 임대기간, 명도 소요 기간 추정 |
| **작성 요건** | 명도 계획 포함 (D30 M-14 필수) |

#### 📄 feasibility (사업수지) — A05

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 토지 매입비, 철거·공사비, 금융비용, 분양수입, 사업이익률 |
| **작성 요건** | ① 취득세 4.6% 표준세율 (im.assumptions.yaml) ② 공사비는 ㎡당 단가 × 연면적 ③ 분양가는 비교사례 기반 (없으면 산출 거부) |

#### 📄 stacking (스태킹) — A17

| 항목 | 상세 |
|---|---|
| **레이아웃** | 층별 용도 배분 다이어그램 |
| **데이터 소스** | 층수, 층별 면적, 용도 배분안 |

---

## 5. 운영형 (operating) — 10섹션 · 기대 13면(B)

> 핵심: **실질 영업이익(GOP)과 운영 지표**
> 강조 섹션: `operation_overview`, `gop_analysis`
> 비노출: lease_status

### 5.1 모범 섹션 구성

| # | 면 | dataKey | 아키타입 | 필수 |
|:---:|---|---|:---:|:---:|
| 1 | 표지 | cover | A01 | — |
| 2 | 핵심 요약 | summary | A02 | ✅ |
| 3 | 토지 현황 | land | A04 | — |
| 4 | 건물 개요 | building | A04 | — |
| 5 | 운영지표 (KPI) | kpi | A13 | ✅ |
| 6 | 매출 | revenue | A05 | ✅ |
| 7 | 계절성 | seasonality | A05 | — |
| 8 | 운영사 | operator | A04 | — |
| 9~13 | 공통 마감 | — | — | risk ✅, checklist ✅ |

### 5.2 고유 섹션 블루프린트

#### 📄 kpi (운영지표) — A13

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 객실 가동률, ADR, RevPAR (호텔) / 매출 원단위, 좌석 회전율 (F&B) / 월 이용자수 (코워킹) |
| **작성 요건** | ① 업종별 KPI 항목 분기 ② 연간 추이 3개년 이상 |

#### 📄 revenue (매출) — A05

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 월별·분기별 매출 데이터, 매출원가, 인건비, 임차료 |
| **작성 요건** | ① GOP = 매출 - 운영비 (im.lexicon.yaml: "실질 영업이익 (GOP)") ② 운영비 없이 NOI 산출 금지 (불변조건 1) |

#### 📄 seasonality (계절성) — A05

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 12개월 매출 추이, 비수기/성수기 구간 |
| **작성 요건** | 월별 막대 차트 + 전년 대비 |

#### 📄 operator (운영사) — A04

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 운영사명, 계약 형태 (위탁/직영), 수수료율, 계약 잔여기간 |
| **작성 요건** | 용도 적법성 확인 (D30 M-14 필수) |

---

## 6. 단기매매형 (trading) — 8섹션 · 기대 11면(C)

> 핵심: **비교사례 기반 시세 판단과 회전 전략**
> 강조 섹션: `market_position`, `comparable_analysis`
> 비노출: lease_status, land_detail

### 6.1 모범 섹션 구성

| # | 면 | dataKey | 아키타입 | 필수 |
|:---:|---|---|:---:|:---:|
| 1 | 표지 | cover | A01 | — |
| 2 | 핵심 요약 | summary | A02 | ✅ |
| 3 | 토지 현황 | land | A04 | — |
| 4 | 건물 개요 | building | A04 | — |
| 5 | 비교사례 | comps | A03 | — |
| 6 | 거래동향 | trend | A05 | ✅ |
| 7 | 회전율 | turnover | A04 | — |
| 8 | 가격 | price | A04 | — |
| 9~12 | 공통 마감 | — | — | risk ✅, checklist ✅ |

### 6.2 고유 섹션 블루프린트

#### 📄 comps (비교사례) — A03

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 인근 실거래가 5~16건 (im.pages.yaml §market.invariant) |
| **작성 요건** | ① 단가(㎡당·평당) 비교 ② 거래 시점 보정 |

#### 📄 trend (거래동향) — A05

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 권역 거래량 추이, 매물 적체량, 평균 보유기간 |
| **작성 요건** | 출구 시나리오 포함 (D30 M-14 필수) |

#### 📄 turnover (회전율) — A04

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 동일 물건 거래 이력, 보유기간별 수익률 |

#### 📄 price (가격) — A04

| 항목 | 상세 |
|---|---|
| **데이터 소스** | 호가, 감정평가액, 공시지가 대비 배율 |
| **작성 요건** | 3축 비교 (호가 vs 감정 vs 공시) |

---

## 7. 면수 상한 규칙

| 항목 | 값 | 출처 |
|---|:---:|---|
| 권장 면수 | **12면** | `im.pages.yaml §rules.min_pages` + `PAGE_RECOMMENDED` |
| 절대 상한 | **16면** | `im.pages.yaml §rules.max_pages_absolute` + `PAGE_HARD_LIMIT` |
| 최소 면수 | **12면** | 12면 미만 → "내부 검토용" 워터마크 |
| 초과 시 | **빌드 중단** | im.pages.yaml: "자르지 않습니다" |

### 등급별 기대 분량 (im.pages.yaml §by_grade)

| 등급 | 기대 면수 | 생략 면 | 비고 |
|:---:|:---:|---|---|
| A | 15 | 없음 | 상용 기본 · 사진 완비 |
| B | 13 | lease2 | L=R1 — 만료일·관리비 부재 |
| C | 11 | lease2, market, evidence, landvalue | 내부 검토용 워터마크 |
| D | 9 | +location, land | 내부 검토용 워터마크 |

---

## 8. 절삭 알고리즘

```
1. 포스처별 본문 면 + 공통 도입/마감 → 전체 면 산출
2. active.length > PAGE_RECOMMENDED(12)?
   → 보호 키 제외하고 나머지에서 후순위부터 절삭
   → 보호 키: cover, summary, closing, risk, checklist, process, thesis, titleRights
3. finalSlides.length > PAGE_HARD_LIMIT(16)?
   → 강제 절삭 (앞 16면만 유지)
```

---

## 9. 불변조건 매핑

| 불변조건 | 적용 포스처 | 해당 섹션 |
|---|---|---|
| 1. 운영비 없이 NOI 금지 | income, operating | profit, revenue |
| 2. 수익률 basis 없이 렌더 금지 | income, operating, trading | summary, comps |
| 3. gross에 "순수익률" 금지 | income, operating | summary, profit |
| 4. 용도지역 실패 시 개발규모 금지 | development, trading | scale, feasibility |
| 5. comps 없이 목표 매각가 금지 | all | comps, price |
| 6. 업종·상호 추론 금지 | income, operating | rentRoll |
| 22. 게이트 전량 실행 | all | 전 면 |
| 23. 만실↔공실 공존 금지 | income, operating | stability, profit |
| 24. 폴백 중복 금지 | all | 전 면 |
| 25. 열린 괄호 금지 | all | 전 면 |
| 26. hasRentRoll=false → 렌트롤 금지 | income | rentRoll |

---

## 10. 게이트 → 섹션 매핑

| 게이트 | severity | 관련 섹션 |
|---|:---:|---|
| G01~G03 | block | cover (가격·면적·주소) |
| G04 | block | 전체 (D등급 차단) |
| G05~G08 | block | 전체 (교차검증·환각·PII·리스크) |
| G17 | block | rentRoll (업종 추론) |
| G20 | block | cover, gallery (사진 PII) |
| G28 | block | summary (면적 분리) |
| G31~G36 | block/warn | gallery (크로핑·DPI·넘침·왜곡·이탈) |
| G38 | block | summary, profit (basis 정합) |
| G40 | block | totalReturn (역레버리지) |
| G41 | block | stability, profit (만실↔공실) |
| G42 | block | 전 면 (폴백 중복) |
| G43 | warn | summary (highlights↔제원) |
| G44 | warn | 전 면 (괄호 균형) |
| G45 | warn | 전 면 (정적 문구 QG) |

---

## 11. 아키타입 레지스트리 요약

| 아키타입 | 용도 | 레이아웃 |
|---|---|---|
| A01 | 표지 | 전면 사진 + 하단 정보 밴드 |
| A02 | 핵심 요약 | 좌: 제원 격자 / 우: 투자 포인트 카드 |
| A03 | 표 중심 | 상단 키커 + 전면 표 |
| A04 | 텍스트+데이터 | 좌: 서술 / 우: 지표 카드 |
| A05 | 분석 서술 | 좌: 분석 요약 / 우: 차트/시나리오 |
| A06 | 지도/다이어그램 | 전면 시각 자료 + 범례 |
| A07 | 리스크 | 위험 항목 목록 + 영향도 |
| A08 | 비교 표 | 2열 비교 (A vs B) |
| A09 | 절차 | 단계별 타임라인 |
| A10 | 마감 | 면책 + 연락처 |
| A12 | 체크리스트 | 결손·경고·가정 3구획 |
| A13 | KPI 대시보드 | 지표 카드 격자 |
| A14 | 사진 갤러리 | 1~4컷 배치 |
| A15 | 투자 논거 | 3대 포인트 서술 |
| A16 | 자본구조 | 에쿼티·레버리지 워터폴 |
| A17 | 스태킹 | 층별 면적 다이어그램 |

---

## 12. 포스처별 성숙도 매트릭스

> 출처: `im.ontology.yaml` — 포스처 확장 계약(posture_contract)

| 포스처 | 아키타입 | 제약 | 게이트 | 표준문서 | 계약 충족 | **릴리즈 상태** |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **income** | 9종 | 7 | 10 | ✅ | 13/13 | 🟢 **commercial** (상용) |
| **owner_occupied** | 4종 | 1 | 2 | ✅ | 13/13 | 🟡 **beta** (실증 0건) |
| **development** | 4종 | 5 | 3 | ✅ | 13/13 | 🟡 **beta** (실증 0건) |
| **operating** | 4종 | 7 | 10 | ✅ | 13/13 | 🟡 **beta** (실증 1건) |
| **trading** | 4종 | 4 | 1 | ✅ | 13/13 | 🔴 **internal_only** (등기부 미구현) |

### 온톨로지 계약 13개 키

새 포스처를 정의하거나 상용화할 때 반드시 충족해야 합니다:

```yaml
posture_contract:
  1. archetypes         # 최소 3종
  2. sections           # 최소 7개
  3. emphasisSections   # 강조 섹션 2종 (토큰 예산 2배)
  4. requiredSlots      # 필수 슬롯
  5. valueMetric        # 가치 지표
  6. yieldBasis         # 수익률 기준 (없으면 none)
  7. lAxisSlots         # L축 슬롯
  8. minResolution      # 최소 해상도
  9. gradeAdjustment    # 등급 보정
  10. layoutRules       # 레이아웃 규칙
  11. constraints       # 제약 조건
  12. gates             # 적용 게이트
  13. nlgMasks          # 자연어 마스크
```

---

## 13. 데이터 파이프라인 — section_type → dataKey → 아키타입

### 13.1 section_type → dataKey 매핑

> 출처: `data-binder.ts` SECTION_TYPE_TO_DATA_KEY

| section_type (카탈로그) | dataKey (슬라이드) | 아키타입 |
|---|---|:---:|
| `property_overview` | `building` | A04 |
| `location_access` | `location` | A06 |
| `lease_status` | `rentRoll` | A03 |
| `income_analysis` | `profit` | A05 |
| `risk_check` | `risk` | A07 |
| `investment_thesis` | `thesis` | A15 |
| `next_steps` | `process` | A09 |
| `occupancy_fit` | `plan` | A04 |
| `cost_comparison` | `vsLease` | A08 |
| `site_analysis` | `landDetail` | A04 |
| `development_feasibility` | `feasibility` | A05 |
| `operation_overview` | `kpi` | A13 |
| `gop_analysis` | `revenue` | A05 |
| `market_position` | `marketPosition` | A04 |
| `comparable_analysis` | `comps` | A03 |

### 13.2 파생 바인딩 (1 section_type → N dataKeys)

한 섹션의 데이터가 여러 슬라이드에 파생됩니다:

| 소스 section_type | 파생 dataKey | 조건 |
|---|---|---|
| `property_overview` | `summary` (A02), `land` (A04) | 항상 |
| `income_analysis` | `capital` (A16), `dcf` (A05), `sensitivity` (A05), `loan` (A08), `tax` (A08) | Grade A/B |
| `income_analysis` | `rentGap`, `upside`, `leasing`, `remodel` | 아키타입 분기 |
| `lease_status` | `stability`, `vacancy`, `current` | 아키타입 분기 |
| `occupancy_fit` | `commute` (A06) | 항상 |
| `cost_comparison` | `value` (A04) | 항상 |
| `site_analysis` | `scale` (A05), `eviction` (A04) | 항상 |
| `development_feasibility` | `cost` (A08), `stacking` (A17) | 항상 |
| `operation_overview` | `operator` (A04) | 항상 |
| `gop_analysis` | `seasonality` (A05) | 항상 |
| `market_position` | `turnover` (A04) | 항상 |
| `comparable_analysis` | `trend` (A05), `price` (A04) | 항상 |

### 13.3 외부 데이터 바인딩 6종

> 출처: `data-binder.ts` bindFromExternalData

| 외부 소스 | dataKey | 아키타입 | 조건 |
|---|---|:---:|---|
| V-World 토지이용계획/공시지가 | `land` (보강) | A04 | `_source` 우선 |
| 건축물대장 + 토지이용계획 | `publicRecords` | A04 | 둘 다 있을 때 |
| 등기부 | `titleRights` | A04 | 등기부 있을 때 |
| 국토부 실거래 | `comps` (보강) | A03 | 실거래 있을 때 |
| 소상공인 상권 | `commercialDistrict` | A04 | 상권 데이터 |
| V-World WMS 지적도 | `cadastralMap` | A06 | WMS 이미지 |

---

## 14. AI 생성 파이프라인 — 섹션별 콘텐츠 생성 흐름

```
section_type
  ↓
┌─ 1. 재무 계산 라우팅 ──────────────────────────────────────┐
│  income     → calculateFinancials + calculateNetCashFlow    │
│  development → developmentFeasibilityCalc                   │
│  operating  → gopAnalysisCalc                               │
│  owner_occ  → costComparisonCalc                            │
│  trading    → comparableAnalysisCalc                        │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─ 2. 프롬프트 조립 ─────────────────────────────────────────┐
│  buildIMFewShotBlock (자산유형/가격대별 승인 예시 검색)      │
│  getPosturePromptOverlay (포스처별 프롬프트 오버레이)        │
│  emphasize 섹션 → SECTION_MAX_TOKENS × 2                   │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─ 3. LLM 호출 (gpt-5.6-terra) ─────────────────────────────┐
│  ↓ 1차 검증: detectHallucination (매매가/면적 왜곡)         │
│  ↓ 2차 검증: judgeIMSection (점수 < 3.0 반려, ≥ 4.5 승격)  │
│  ↓ 반려 시: generatePremiumTemplate 폴백                   │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─ 4. 결정론적 테이블 주입 ──────────────────────────────────┐
│  lease_status / income_analysis 섹션:                       │
│  normalizeFloorLeases → formatRentRollMarkdown              │
│  AI 테이블을 정밀 렌트롤 블록으로 교체                      │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─ 5. 사후 정제 ─────────────────────────────────────────────┐
│  normalizeTerminologyAsync (CRE 용어 표준화)                │
│  repairBracketBalance (괄호 균형 — G44)                     │
│  임차인 마스킹 (상호→[임차인A], 업종 보존)                  │
│  Cap Rate 라벨 정본 병기                                    │
│  runRiskBoundaryCheck + runCREQualityGate                   │
│  결손 문구 소독 → _deficiencies → checklist 이관            │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─ 6. 맥락 전파 ─────────────────────────────────────────────┐
│  extractKeyFacts + updateNumericalAnchors                   │
│  → 다음 섹션 프롬프트에 사실/수치 맥락 전파                 │
│  → 만실↔공실 모순 방지 (G41)                                │
└─────────────────────────────────────────────────────────────┘
```

### 결손 문구 소독 → 체크리스트 이관 규칙

> 출처: `data-binder.ts` BL-6 소독→이관

마크다운 본문에 다음 표현이 있으면 **본문에서 제거**하고 `_deficiencies` 배열에 수집하여 `checklist`(A12) 슬라이드로 이관합니다:

```
조회 미완료 / 임대차 상세 미확보 / 확인 필요 /
자료 없음 / 미확인 / 미공개 / 미제출
```

---

## 15. PPTX 프리셋 체계

> 출처: `im.pages.yaml` §presets

| 프리셋 | 대상 | 최대 면 | 특화 순서 |
|---|---|:---:|---|
| `jsre_field_navy` | 현장 표준 | 17p | cover→points→overview→location→... |
| `evidence_first` | 기관/법인 매수자 | 19p | cover→points→**evidence**→overview→... |
| `land_value_first` | 개발 여력 소구 | 17p | cover→points→**parcels**→land→**landvalue**→... |

### PPTX 내장 테마 5종

| 테마 | 톤 |
|---|---|
| `golden_institutional` | 기관 표준 골드 |
| `credeal_signature` | CREDEAL 기본 |
| `executive_gold` | 임원 보고 골드 |
| `corporate_clean` | 기업 깔끔 |
| `pro_dark_obsidian` | 다크 프로 |

---

## 16. 경고 아키타입 동적 보강

> 출처: `section-catalog.ts` getAugmentedSectionPlan

특정 아키타입은 risk_check 섹션을 강화하고, 전용 경고 섹션을 자동 삽입합니다:

| 아키타입 | 포스처 | 동적 삽입 | 효과 |
|---|---|---|---|
| **R-OPR-04** (용도 리스크형) | operating | `legality_warning` (risk 앞) | risk_check가 emphasize에 추가 |
| **R-TRD-04** (출구 제약형) | trading | `exit_constraint` (risk 앞) | risk_check가 emphasize에 추가 |
