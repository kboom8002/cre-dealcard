# CREDEAL 온톨로지 SSoT — 5대 투자 포스처 및 포스처별 IM 작성 방법론

> 작성일: 2026-08-23
> 근거: `src/domain/ontology.ts`, `section-catalog.ts`, `narrative-prompt.ts`, `financials.ts`, `deck-sequencer.ts`, `archetype-registry.ts`, `data-binder.ts`, `im-context-builder.ts`

---

## 1. 포스처(Posture) 개요

**투자 포스처**는 자산의 매수 목적 및 투자 관점을 정의하는 온톨로지 핵심 타입입니다.

| # | 포스처 ID | 한국어 | 영문 | 적용 대상 |
|---|---|---|---|---|
| 1 | `income` | 임대수익형 | Income | 상가·오피스·꼬마빌딩 등 임대료 현금흐름 기반 투자 |
| 2 | `owner_occupied` | 자가사용형 | Owner Occupied | 법인 사옥 매입 목적 |
| 3 | `development` | 개발형 | Development | 나대지·노후 건물 철거 후 신축 개발 |
| 4 | `operating` | 운영형 | Operating | 호텔·요양·물류 등 직영 자가운영 |
| 5 | `trading` | 단기매매형 | Trading | 시세 갭 매입 후 단기 매각 차익 |

**근거:** `src/domain/ontology.ts` — `InvestmentPosture` 타입 정의
**기본값:** 포스처 미입력 시 `'income'` 적용 (`section-catalog.ts:55`)

---

## 2. 포스처별 모바일 IM 섹션 편성

각 포스처는 7개 섹션으로 구성되며, **공통 5개 + 특화 2개** 구조입니다.

### 2.1 섹션 카탈로그 (`section-catalog.ts:15-51`)

| 섹션 순서 | Income | Owner Occupied | Development | Operating | Trading |
|---|---|---|---|---|---|
| ① 자산 개요 | `property_overview` | `property_overview` | `property_overview` | `property_overview` | `property_overview` |
| ② 입지 분석 | `location_access` | `location_access` | `location_access` | `location_access` | `location_access` |
| ③ **특화A** | `lease_status` | `occupancy_fit` | `site_analysis` | `operation_overview` | `market_position` |
| ④ **특화B** | `income_analysis` | `cost_comparison` | `development_feasibility` | `gop_analysis` | `comparable_analysis` |
| ⑤ 리스크 | `risk_check` | `risk_check` | `risk_check` | `risk_check` | `risk_check` |
| ⑥ 투자 논거 | `investment_thesis` | `investment_thesis` | `investment_thesis` | `investment_thesis` | `investment_thesis` |
| ⑦ 진행 절차 | `next_steps` | `next_steps` | `next_steps` | `next_steps` | `next_steps` |

### 2.2 억제(Suppress) 및 강조(Emphasize) 설정

| 포스처 | suppress (비노출) | emphasize (상세 프롬프트) |
|---|---|---|
| income | 없음 | `lease_status`, `income_analysis` |
| owner_occupied | `lease_status` | `occupancy_fit`, `cost_comparison` |
| development | `lease_status`, `income_analysis` | `site_analysis`, `development_feasibility` |
| operating | `lease_status` | `operation_overview`, `gop_analysis` |
| trading | 없음 | `market_position`, `comparable_analysis` |

---

## 3. 포스처별 재무 전략 (Financial Strategy)

각 포스처에는 전용 재무 전략 클래스가 매핑됩니다 (`financials.ts`).

### 3.1 Income — `IncomeFinancialStrategy` (L143-325)

**핵심 로직:** NOI(순영업소득) 기반 Best/Base/Worst 시나리오 + Cap Rate + 5년 IRR + 10년 DCF

| 하드코딩 상수 | 값 | 라인 |
|---|---|---|
| 기본 보유기간 | 5년 | L148 |
| 기본 공실률 | 5% | L149 |
| 연 임대료 상승률 | 2% | L150 |
| Opex Ratio (오피스) | 15% | L124 |
| Opex Ratio (상가/근린) | 20% | L126 |
| Opex Ratio (지식산업) | 22% | L128 |
| Opex Ratio (물류) | 12% | L130 |
| Opex Ratio (호텔) | 35% | L132 |
| Opex Ratio (기본) | 18% | L134 |
| Exit Cap Rate 가산 — Best | +0.25% | L192 |
| Exit Cap Rate 가산 — Base | +0.50% | L193 |
| Exit Cap Rate 가산 — Worst | +1.00% | L194 |
| WACC 자기자본비용 | 8% | L250 |
| WACC 타인자본비용 | 5% | L250 |
| WACC 법인세율 | 22% | L250 |

**산출 지표:** Cap Rate (best/base/worst), NOI, 총수익률, 레버리지 수익률, 5년 IRR, 10년 DCF NPV/IRR

---

### 3.2 Development — `DevelopmentFinancialStrategy` (L328-414)

**핵심 로직:** 총 사업비 = 토지비 + 공사비 + 기타비용 → 분양 수익 대비 개발 이익률

| 하드코딩 상수 | 값 | 라인 |
|---|---|---|
| 평당 공사비 기본값 | 800만원 | L340 |
| 기본 목표 용적률 | 400% (대지×4) | L341 |
| 기타 사업 비용 | 매입가+공사비의 15% | L343 |
| 기본 분양/매각가 | 토지 평당가의 1.4배 또는 3,500만원 | L348 |

**산출 지표:** 총 사업비, 예상 분양 수입, 개발 이익률(Margin), 개발 이익 총액

---

### 3.3 Operating — `OperatingFinancialStrategy` (L417-488)

**핵심 로직:** 총 매출 × GOP 마진 → 실질 영업이익(GOP) + GOP Cap Rate + RevPAR 역산

| 하드코딩 상수 | 값 | 라인 |
|---|---|---|
| GOP 마진율 기본값 | 35% | L421 |

**산출 지표:** 연간 GOP, GOP 마진율, GOP Cap Rate, ADR, OCC, RevPAR

---

### 3.4 Owner Occupied — `OwnerOccupiedFinancialStrategy` (L491-562)

**핵심 로직:** 시장 임차료 vs 자가 대출이자 비교 → 연간 절감액 + 손익분기 기간

| 하드코딩 상수 | 값 | 라인 |
|---|---|---|
| 기본 시장 평당 임대료 | 7만원/평 | L497 |
| 대출 이자율 | 5.2% | L501 |

**산출 지표:** 연간 절감액, 손익분기 기간(년), 평당 점유비용

---

### 3.5 Trading — `TradingFinancialStrategy` (L565-635)

**핵심 로직:** 인근 비교사례 평당가 대비 시세 갭 산출 + 목표 매각가 기반 HPR 계산

| 하드코딩 상수 | 값 | 라인 |
|---|---|---|
| 비교사례 평당가 기본값 | 매입 평당가 × 1.15 | L576 |
| 목표 매각가 기본값 | 매입가 × 1.2 | L582 |

**산출 지표:** 시세 갭(할인율), 목표 시세차익, 자본수익률(HPR)

---

## 4. 포스처별 아키타입(Archetype) 분기

아키타입은 투자 서사의 톤앤매너와 PPTX 슬라이드 구성을 세밀하게 조정합니다 (`archetype-registry.ts`).

### 4.1 Income 포스처 세부 아키타입 (4종)

| 코드 | 라벨 | 톤 | 트리거 조건 | 우선순위 |
|---|---|---|---|---|
| `R-INC-03` | 공실 해소형 | turnaround | `vacancyPct ≥ 15` | 1 (최우선) |
| `R-INC-04` | 리모델링형 | renovation | `buildingAge ≥ 20` | 2 |
| `R-INC-02` | 갭 투자형 | opportunity | `rentGapPct ≥ 15` | 3 |
| `R-INC-01` | 안정형 | predictability | 기본값 (조건 미달) | 4 |

### 4.2 Non-Income 포스처 (각 1종)

| 포스처 | 코드 | 라벨 | 톤 |
|---|---|---|---|
| Owner Occupied | `OO-01` | 사옥 이전형 | corporate-fit |
| Development | `DEV-01` | 개발 사업형 | development-upside |
| Operating | `OP-01` | 운영 수익형 | operational-excellence |
| Trading | `TR-01` | 시세 차익형 | capital-appreciation |

### 4.3 아키타입 오버라이드

`im-context-builder.ts:299`에서 `input.supplemental.archetype_override` 값이 있으면 자동 제안을 무시하고 강제 적용됩니다 (중개인 수동 지정).

---

## 5. 포스처별 PPTX 슬라이드 시퀀스

`deck-sequencer.ts`에서 포스처 × 등급(Basic/Pro) 조합으로 슬라이드 배열을 결정합니다.

### 5.1 Basic 시퀀스 (7~10슬라이드)

```
[공통] 표지(A01) → 갤러리(A14) → 핵심요약(A02) → 입지(A06)
[포스처별 본문 2~3슬라이드]
[공통] 리스크(A07) → 투자논거(A15) → 진행절차(A09) → 면책(A10)
```

| 포스처 | 본문 슬라이드 |
|---|---|
| **Income** | 건물(A04) → 렌트롤(A03) → 수익분석(A05) |
| **Owner Occupied** | 건물(A04) → 사용계획(A04) → 자가비교(A08) |
| **Development** | 건물(A04) → 토지상세(A04) → 개발개요(A05) |
| **Operating** | 건물(A04) → 운영지표(A13) → 매출(A05) |
| **Trading** | 건물(A04) → 시장포지션(A04) → 비교사례(A03) |

### 5.2 Pro 시퀀스 (15~24슬라이드)

```
[공통] 표지(A01) → 갤러리(A14) → 핵심요약(A02) → 입지(A06) → 토지(A04) → 건물(A04)
[포스처별 본문 4~6슬라이드]
[공통 Pro 추가] DCF(A05) → 민감도(A05) → 총수익률(A05) → 대출(A08) → 세금(A08)
[공통 마감] 투자논거(A15) → 리스크(A07) → 진행절차(A09) → 마감(A10)
```

| 포스처 | Pro 본문 슬라이드 |
|---|---|
| **Income R-INC-01** | 렌트롤(A03) → 임대안정성(A04) → 수익구조(A05) → 자본구조(A08) → 비교사례(A03) |
| **Income R-INC-02** | 렌트롤(A03) → 임대료갭(A05) → 인상경로(A05) → 자본구조(A08) → 비교사례(A03) |
| **Income R-INC-03** | 렌트롤(A03) → 공실분석(A04) → 임차유치(A05) → 자본구조(A08) → 비교사례(A03) |
| **Income R-INC-04** | 렌트롤(A03) → 현황(A04) → 리모델링(A05) → 자본구조(A08) → 비교사례(A03) |
| **Owner Occupied** | 사용계획(A04) → 자가비교(A08) → 통근(A06) → 자산가치(A04) |
| **Development** | 토지상세(A04) → 신축규모(A05) → 명도(A04) → 투입비용(A08) → 스태킹(A05) → 사업수지(A05) |
| **Operating** | 운영지표(A13) → 매출(A05) → 계절성(A05) → 운영사(A04) |
| **Trading** | 비교사례(A03) → 거래동향(A05) → 회전율(A04) → 가격(A04) |

---

## 6. 포스처별 프롬프트 전략

### 6.1 시스템 프롬프트 구조 (`narrative-prompt.ts`)

```
[MOBILE_IM_NARRATIVE_CORE]    ← 포스처 중립 코어 (13개 작성 규칙)
  +
[Golden IM 예시]               ← 포스처별 참조 테이블 스니펫
  +
[포스처 전문 용어집]            ← 포스처별 전용 용어 매핑
```

### 6.2 포스처별 전문 용어집 (POSTURE_LEXICONS, L162-208)

| 포스처 | 핵심 용어 |
|---|---|
| **Income** | NOI, Cap Rate, WALE, DSCR, IRR, DCF, EGI, 실투자금, Leveraged Yield |
| **Development** | 건폐율(BCR), 용적률(FAR), 분양가, 공사비, 토지비, PF, 브릿지론, LTC |
| **Operating** | GOP, ADR, OCC, RevPAR, OPEX, GOP Cap Rate |
| **Owner Occupied** | 사옥, 자가전환, 기회비용, 손익분기, 점유비용 |
| **Trading** | 평당가, 시세 갭, HPR, 플립, 비교사례, 양도세 |

### 6.3 섹션 미션 동적 분기 (L258-284)

특화 섹션의 작성 미션이 포스처에 따라 동적으로 변경됩니다:

| 섹션 | Income | Development | Operating | Owner Occupied | Trading |
|---|---|---|---|---|---|
| `income_analysis` | 실투자금·월순수익·Cap Rate 종합 서술 | 총사업비·개발이익률 수지 분석 | GOP·ADR·OCC 운영 실적 묘사 | 임차 대비 절감액·손익분기 묘사 | 시세 갭·목표 차익 수치 묘사 |
| `lease_status` | 임대 안정성·공실 리스크 통제 | 기존 임차인 명도 현황·퇴거 일정 분석 | (억제) | (억제) | 임대 안정성·공실 리스크 |

---

## 7. 포스처별 외부 데이터 연동

### 7.1 공통 외부 데이터 (`im-context-builder.ts`)

| 데이터 소스 | 활용 | 참조 위치 |
|---|---|---|
| 건축물대장 | 연면적, 대지면적, 준공연도(건물 연식 산출) | L193, L231-234 |
| 공시지가 | 토지 평당가, 대지가치 비중 산출 | `financials.ts:21,223` |
| RAG 유사사례 | 과거 IM 문서 검색 → 프롬프트 컨텍스트 주입 | L257-266 |

### 7.2 포스처별 재무 계산 트리거 (`im-section-generator.ts:120-134`)

| 포스처 | shouldCalculateFinancials 트리거 조건 |
|---|---|
| Income | `sectionType === 'income_analysis'` AND `monthly_rent_total_krw` 존재 |
| Development | `sectionType === 'development_feasibility'` |
| Operating | `sectionType === 'gop_analysis'` |
| Owner Occupied | `sectionType === 'cost_comparison'` |
| Trading | `sectionType === 'comparable_analysis'` |

---

## 8. 파이프라인 전체 흐름도

```
사용자 입력 (메모 + 바텀시트)
  │
  ▼
[1] 포스처 결정 (im-context-builder.ts)
  │  └─ supplemental.investmentPosture || identity.investmentPosture || 'income'
  │
  ▼
[2] 섹션 편성 (section-catalog.ts)
  │  └─ SECTION_CATALOG[posture].sections → 7개 섹션 배열
  │
  ▼
[3] 아키타입 제안 (archetype-registry.ts)
  │  └─ suggestArchetype({vacancyPct, buildingAge, rentGapPct, posture})
  │
  ▼
[4] 프롬프트 조립 (narrative-prompt.ts)
  │  └─ buildPostureAwareSystemPrompt(posture)
  │  └─ buildNarrativeUserPrompt(sectionType, ..., posture, archetype)
  │
  ▼
[5] 섹션별 LLM 호출 + 재무 계산 (im-section-generator.ts)
  │  └─ calculateFinancials() — 포스처별 Strategy 클래스
  │  └─ calculateNetCashFlow() — Income 포스처 한정
  │
  ▼
[6] 마크다운 → 모바일 IM 뷰어 (mobile-im-viewer.tsx)
  │
  ▼
[7] 마크다운 → PPTX 변환
     └─ data-binder.ts: 마크다운 파싱 → 아키타입별 Props
     └─ deck-sequencer.ts: 포스처 × 등급 → 슬라이드 시퀀스
     └─ pptx-renderer.ts: Props → 슬라이드 렌더링
```
