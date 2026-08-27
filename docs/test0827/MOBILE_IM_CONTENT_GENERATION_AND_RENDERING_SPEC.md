# 모바일 IM 콘텐츠 생성 및 렌더링 스펙 (코드 감사용)

> **문서 ID**: `DOC-TEST0827-02-MOBILE-IM-SPEC`  
> **작성일**: 2026-08-27 (Updated)  
> **대상**: QA / 코드 감사 / 개발 기획팀  
> **코드베이스 기준**: `main` branch, 커밋 `7f9f468` 이후  
> **범위**: `src/domain/building/mobile-im/` (68 파일, 5 서브디렉터리)

> [!NOTE]
> 본 문서는 2026-08-27 세션(커밋 `55110d8`)의 코드 개선 결과를 반영한 갱신본입니다. **이전 감사에서 지적된 7건의 결함(Critical 1, High 3, Medium 3)이 모두 해결(RESOLVED)되었습니다.**

---

## 목차
1. [오케스트레이터 아키텍처](#1-오케스트레이터-아키텍처)
2. [4단계 위상 기반 생성 흐름](#2-4단계-위상-기반-생성-흐름)
3. [5대 투자 포스처 & 섹션 구성](#3-5대-투자-포스처--섹션-구성)
4. [콘텐츠 생성 3중 메커니즘](#4-콘텐츠-생성-3중-메커니즘)
5. [재무 계산 엔진 상세](#5-재무-계산-엔진-상세)
6. [품질 게이트 & 안전 가드레일](#6-품질-게이트--안전-가드레일)
7. [CRE 실무 규칙 구현](#7-cre-실무-규칙-구현)
8. [렌더링 & 출력 파이프라인](#8-렌더링--출력-파이프라인)
9. [테스트 커버리지](#9-테스트-커버리지)
10. [약점 및 우려 사항 종합 (해결 현황)](#10-약점-및-우려-사항-종합)

---

## 1. 오케스트레이터 아키텍처

### 1.1 핵심 진입점

**파일**: [`writer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts) — 510행  
**함수**: `generateMobileIM(input: MobileIMWriterInput): Promise<MobileIMWriterOutput>` (L50)

```
MobileIMWriterInput (SSoT Lite + Supplemental + External Data)
    │
    ▼
[0] StageTimer 시작 (Soft: 90s / Hard: 105s / Kill: 120s)
    │
    ▼
[1] buildIMContext (im-context-builder.ts)
    │   • SSoT 정규화, RAG 컨텍스트, Value-add 시나리오
    ▼
[2] NumericalAnchors 고정 (numerical-anchors.ts)
    │   • 매각가, 대지면적, 연면적, 임대료, 보증금, 공실률 앵커 잠금
    ▼
[3] 4-Stage Topological Section Generation
    │   (stage-plans.ts 기반 — 포스처별 동적 구성)
    ▼
[4] Quality Gates (quality-gates-v02.ts: G01~G16)
    │
    ▼
[5] Cross-Validator (cross-validator.ts: ±15% 앵커 검증, 13개 패턴)
    │
    ▼
[6] RAG Embedding Indexing (Supabase)
    │
    ▼
[7] HeroCard 조립 + 사진 변환 (photo-url-transformer.ts)
    │
    ▼
[8] CANONICAL_ORDER 재정렬 (3-tier 폴백: YAML → STAGE_PLANS → 하드코딩)
    │
    ▼
MobileIMWriterOutput
```

### 1.2 글로벌 타임아웃 (`StageTimer`)

**파일**: [`stage-timer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/stage-timer.ts)

| 한계 | 시간 | 동작 |
|:---:|:---:|---|
| **Soft** | 90s | 최적화 킥인 (토큰 예산 축소) |
| **Hard (BL-7)** | 105s | LLM 호출 중단, 프리미엄 템플릿 폴백 강제 전환. 필수 섹션 미완 시 시스템 에러 |
| **Kill (BL-6)** | 120s | 불완전/신뢰불가 섹션 폐기 |

### 1.3 멱등성 & 재시도

**파일**: [`idempotency.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/idempotency.ts)

- **M-8 재시도 정책**: Stage 2~4의 순차 섹션 실패 시 최대 2회 재시도
- **멱등키**: `buildingId + posture + timestamp` 조합

---

## 2. 4단계 위상 기반 생성 흐름

**파일**: [`stage-plans.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/stage-plans.ts) — 177행

### Stage 1: 독립 섹션 병렬 생성
- **실행 방식**: `Promise.allSettled` (최대 동시 4개 — `IM_SECTION_CONCURRENCY`)
- **대상 (포스처별)**:
  - `income`: `property_overview`, `location_access`, `lease_status`, `next_steps`
  - `development`/`operating`/`owner_occupied`/`trading`: `property_overview`, `location_access`, `next_steps`
- **컨텍스트 전파**: 완료 섹션에서 `extractKeyFactsFromMarkdown`을 통해 핵심 수치를 `ctx.sectionCtx.keyFacts`에 고정

> [!TIP]
> **✅ W-IM-6 해결**: `extractKeyFacts` 에러가 이제 `console.warn`으로 로깅됩니다 ([`writer.ts` L151-152](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts#L151-L152)). 앵커 전파 실패가 다운스트림에 명시적으로 통보됩니다.

### Stage 2: 핵심 재무/타당성 순차 생성

| 포스처 | Stage 2 섹션 | 앵커 의존성 |
|---|---|---|
| `income` | `income_analysis` | `askingPriceKrw`, `totalAreaSqm` |
| `development` | `site_analysis`, `development_feasibility` | `askingPriceKrw`, `landAreaSqm` |
| `operating` | `operation_overview`, `gop_analysis` | `askingPriceKrw`, `totalAreaSqm` |
| `owner_occupied` | `occupancy_fit`, `cost_comparison` | `askingPriceKrw`, `totalAreaSqm` |
| `trading` | `market_position`, `comparable_analysis` | `askingPriceKrw`, `totalAreaSqm` |

### Stage 3: 리스크 점검
- **대상**: `risk_check` + 아키타입별 경고 섹션
- **확장 경고 계획 (BL-2)**: `getAugmentedSectionPlan`이 특정 리스크 아키타입 탐지 시 전용 경고 섹션을 `risk_check` 앞에 주입

### Stage 4: 투자 논거 합성
- **대상**: `investment_thesis`
- **입력**: Stage 1~3 전체 결과물 + value-add 마크다운 테이블

---

## 3. 5대 투자 포스처 & 섹션 구성

**파일**: [`section-catalog.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-catalog.ts)

| 포스처 | 섹션 수 | 포함 섹션 | 차단 섹션 | 2× 토큰 배분 |
|---|:---:|---|---|---|
| **income** (수익형) | 12 | property_overview, location_access, title_rights, land_detail, lease_status, income_analysis, risk_check, comparables, investment_thesis, checklist, next_steps, closing | 없음 | lease_status, income_analysis |
| **owner_occupied** (사옥형) | 9 | property_overview, location_access, title_rights, occupancy_fit, cost_comparison, risk_check, investment_thesis, checklist, next_steps | lease_status, land_detail, comparables | occupancy_fit, cost_comparison |
| **development** (개발형) | 10 | property_overview, location_access, title_rights, land_detail, site_analysis, development_feasibility, risk_check, investment_thesis, checklist, next_steps | lease_status, income_analysis, comparables | site_analysis, dev_feasibility |
| **operating** (운영형) | 10 | property_overview, location_access, title_rights, land_detail, operation_overview, gop_analysis, risk_check, investment_thesis, checklist, next_steps | lease_status | operation_overview, gop_analysis |
| **trading** (단기매매형) | 8 | property_overview, location_access, title_rights, market_position, comparable_analysis, risk_check, checklist, next_steps | lease_status, land_detail | market_position, comparable_analysis |

### 필수 섹션 정의 (M-14)
- **income**: `property_overview`, `lease_status`, `income_analysis`, `checklist`
- **development**: `property_overview`, `site_analysis`, `development_feasibility`, `checklist`
- **operating**: `property_overview`, `operation_overview`, `gop_analysis`, `risk_check`, `checklist`
- 누락 시 BL-7 예외 발생 (생성 실패)

---

## 4. 콘텐츠 생성 3중 메커니즘

### 4.1 결정론적 렌더러 (100% 팩트 기반)

**디렉터리**: `section-renderers/`

| 렌더러 | 파일 | 기능 | 개선 사항 |
|---|---|---|---|
| **토지 상세** | [`land-detail-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-renderers/land-detail-renderer.ts) (99행) | PNU, 지목, 면적, 공시지가, 건폐율/용적률, 배제면적 테이블 | ✅ **W-IM-5**: V-World `landShape`/`landTopography`/`roadFrontage` 3필드 추가 및 조건부 렌더링 |
| **권리 분석** | `title-rights-renderer.ts` | 소유권 구조, 저당권 테이블, 총 채권 부담 합산 | — |
| **매매사례 비교** | `comparables-renderer.ts` | 거리순 정렬, 평균 평당가, 할인/프리미엄 % | — |
| **렌트롤 어댑터** | [`lease-adapter.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/lease-adapter.ts) | `normalizeFloorLeases`, `formatRentRollMarkdown`, `formatRentRollSummary` | ✅ **W-IM-7**: 측션 보존 로직 추가 |

### 4.2 LLM 서사 엔진

**파일**: [`im-section-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-section-generator.ts) — 525행  
**함수**: `generateSingleSection` (L98)

#### 프롬프트 조립 구조
1. **System Prompt**: `MOBILE_IM_NARRATIVE_CORE` + `CrePromptRegistry`(섹션별) + `POSTURE_LEXICONS` + `getPosturePromptOverlay`
2. **User Prompt**: SSoT Lite 팩트, 레지스트리 데이터, 재무 테이블, RAG 컨텍스트, Few-Shot Golden IM 블록

#### 후처리 파이프라인 (L300~L500)
1. **환각 탐지**: 생성 가격이 SSoT 앵커 대비 >20× 또는 <0.05×, 면적 >10× 차이 시 차단
2. **LLM-as-Judge** (`im-judge.ts`): 5개 차원 평가 (`factual_accuracy`, `financial_soundness`, `regulatory_compliance`, `investor_value`, `data_grounding`) — < 3.0 시 폴백 강제
3. **임차인 마스킹** (L399, L422): 실명 → `[임차인A]`, 유명 브랜드 자동 제거
4. **용어 정규화** (L432): CRE 표준 용어 치환
5. **안전 게이트**: `runRiskBoundaryCheck`, `runCREQualityGate`, `runDisclosureGuard`
6. **렌트롤 표 강제 덮어쓰기** (L351): `lease_status` 섹션에서 AI 생성 표를 결정론적 렌트롤로 교체

> [!TIP]
> **✅ W-IM-7 해결**: 렌트롤 표 교체 시 직전 측션 라인(`###`, `>`, `**임대`, `**렌트롤`, `**층별`)을 정규식으로 감지하여 보존합니다 ([L372-388](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-section-generator.ts#L372-L388)).

### 4.3 프리미엄 템플릿 엔진 (폴백)

**파일**: [`premium-template-engine.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts) — 642행 (v0.5)

- **트리거 조건**: AI 타임아웃, 품질 게이트 실패, 환각 탐지, LLM-as-Judge < 3.0
- **생성 방식**: 100% 결정론적 재무 엔진 활용 기관급 마크다운 생성

> [!IMPORTANT]
> **✅ W-IM-1 해결 (구 Critical)**: 커밋 `55110d8`에서 non-income 포스처 전용 템플릿이 완전 구현되었습니다.

| 섹션 | 개선 내용 | 라인 |
|---|---|---|
| `property_overview` | `postureLeadMap`: 5개 포스처별 리드 텍스트 (income=수익형, owner_occupied=사옥, development=개발, operating=직영운영, trading=시세차익) | [L122-138](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts#L122-L138) |
| `lease_status` | Non-income 분기: development→명도 안내, owner_occupied→자가사용 안내, operating→직영운영 안내 | [L184-202](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts#L184-L202) |
| `investment_thesis` | 5-way switch: 포스처별 "3대 핵심 투자 포인트" 차별화 생성 | [L442-483](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts#L442-L483) |

---

## 5. 재무 계산 엔진 상세

### 5.1 핵심 재무 엔진

**파일**: [`financials.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts) — 858행  
**함수**: `calculateFinancials` (L728), `formatFinancialsMarkdown` (L737)

**아키텍처**: Strategy 패턴 — 5개 포스처별 전략 클래스:

| 전략 | 산출 지표 | 주요 로직 |
|---|---|---|
| `IncomeFinancialStrategy` | NOI(기본/최악/최선), Cap Rate, WACC, 5년 IRR, 역레버리지 경고 | Gross Yield vs 대출금리(4.5%) 비교 |
| `DevelopmentFinancialStrategy` | 건축비 총액, 개발 이익률 % | 목표 연면적(평) × 평당 건축비 |
| `OperatingFinancialStrategy` | GOP, ADR, OCC, RevPAR | 호텔/숙박 운영 지표 |
| `OwnerOccupiedFinancialStrategy` | 자가 vs 임차 절감액 | 가상 시장 임대료 − 대출 원리금 = 순 절감 |
| `TradingFinancialStrategy` | 시장 할인율(걭), 목표 HPR % | 매입가 vs 현재 시세 비교 |

### 5.2 운영비율 산정 엔진 (`getOpexRatio`)

> [!IMPORTANT]
> **✅ W-IM-2 해결 (구 High)**: `getOpexRatio()` ([L140-156](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts#L140-L156))가 6개 → **10개** 자산 유형 그룹으로 확장. 미매칭 시 `console.warn` 경고 로그 출력.

| 자산 유형 그룹 | 키워드 | 운영비율 | 비고 |
|---|---|:---:|---|
| 오피스/업무 | `오피스`, `office`, `업무` | 15% | — |
| 리테일/근생 | `상가`, `근린`, `리테일` | 20% | — |
| 지식산업센터 | `지식산업`, `지산` | 22% | — |
| 물류/창고/데이터센터 | `물류`, `창고`, `데이터센터` | 12% | — |
| 꼬마빌딩/주상복합 | `꼬마`, `빌딩`, `주상복합` | 18% | — |
| 호텔/숙박/레지던스 | `호텔`, `숙박`, `생활형숙박`, `레지던스` | 25% | — |
| **원룸/다세대/오피스텔** | `원룸`, `다세대`, `다가구`, `오피스텔` | 15% | ✅ 신규 |
| **병원/의료/요양** | `병원`, `의료`, `요양` | 22% | ✅ 신규 |
| **주유소/세차** | `주유소`, `세차` | 10% | ✅ 신규 |
| **교육/학원** | `교육`, `학원` | 20% | ✅ 신규 |
| 기본 폴백 (Unknown) | — | 18% | `console.warn` 출력 |

### 5.3 부속 재무 엔진

| 엔진 | 파일 | 주요 기능 |
|---|---|---|
| **DCF 감응도** | `dcf-sensitivity.ts` | 3×3 WACC × Exit Cap Rate 히트맵 (Grade A 전용) |
| **소득 시나리오** | `income-scenario-engine.ts` | 기본/최선/최악 NOI 시나리오 |
| **순현금흐름** | `net-cash-flow-calculator.ts` | 3-line 순현금흐름 요약 |
| **대출 시뮬레이션** | `loan-simulation.ts` | LTV/DSR 기반 원리금 산출 |
| **세금 시나리오** | `tax-scenarios.ts` | 취득세(4.6%), 중개수수료(0.9%), 양도소득세 |
| **총 수익률** | `total-return-engine.ts` | Income Yield + Capital Gain = Total Return |
| **WALE 계산기** | `wale-calculator.ts` | 가중평균잔여임대기간 |
| **임대수학** | `lease-math.ts` | 보증금→월세 환산, 관리비 포함 실질 임대료 |
| **벤치마크** | `comparable-benchmark.ts` | 비교사례 대비 할인/프리미엄 % |

---

## 6. 품질 게이트 & 안전 가드레일

### 6.1 발행 품질 게이트 (16개)

**파일**: [`quality-gates-v02.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/quality-gates-v02.ts)  
**함수**: `runPublishGates` — G01~G16 순차 실행

### 6.2 교차 검증기

**파일**: [`cross-validator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) — 649행  
**함수**: `runCrossValidation` (L347), `extractKeyFacts` (L200)

> [!IMPORTANT]
> **✅ W-IM-3 해결 (구 High)**: 교차 검증 패턴이 7개 → **13개**로 확장되었습니다 ([L119-140](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts#L119-L140)).

| # | 패턴 ID | 매칭 대상 | 비고 |
|:---:|---|---|---|
| 1 | `area` | 면적/연면적/GFA/전용면적/대지면적 (㎡, m², 평) | 대체 표현 보강 |
| 2 | `vacancy` | 공실률/공실 비율/빈 공간 (%) | — |
| 3 | `monthlyRent` | 월세/월 임대료/월 수입/월 렌트 (만원, 억원) | 대체 표현 보강 |
| 4 | `capRate` | Cap Rate/측레이트/환원이율/순수익률 (%) | — |
| 5 | `buildYear` | 준공/건축년도/사용승인 (YYYY년) | — |
| 6 | `buildAge` | 건물 연식/경과 연수 (N년) | — |
| 7 | `stationWalk` | 도보/걸어서/역세권 (N분) | — |
| 8 | **`noi`** | NOI/순영업소득/순 운영 소득 (억, 만) | ✅ 신규 |
| 9 | **`askingPrice`** | 매각 희망가/매매가/호가 (억, 만) | ✅ 신규 |
| 10 | **`deposit`** | 보증금/총 보증금/임대 보증금 (억, 만) | ✅ 신규 |
| 11 | **`floorCount`** | 지상/지하 N층 | ✅ 신규 |
| 12 | **`parkingCount`** | 주차/주차 대수 N대 | ✅ 신규 |
| 13 | **`elevatorCount`** | 승강기/엘리베이터/E/V N대 | ✅ 신규 |

### 6.3 안전 가드레일

**파일**: [`guardrails.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/guardrails.ts) — 18,602 bytes

#### P0 차단 (즉시 삭제/재작성)
| 카테고리 | 차단 패턴 예시 |
|---|---|
| 투자 추천 | `매수 추천`, `확실한 투자처` |
| 수익률 보장 | `수익률 보장`, `원금 보장`, `NOI 확정` |
| 대출 확정 | `대출 가능 확정`, `LTV 확정` |
| 법적 면책 | `법적 문제 없음` |

---

## 7. CRE 실무 규칙 구현

### 7.1 페르소나 격리 원칙

**파일**: [`persona-sanitizer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/persona-sanitizer.ts) — 60대 자산가, 법인 대표 등 → **내부 톤앵매너 조절용으로만** 사용

### 7.2 CRE 한국 표준 용어집

**파일**: [`terminology-normalizer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/terminology-normalizer.ts) — 17,802 bytes

| ❌ 금지 표현 | ✅ 정규화 표현 |
|---|---|
| 측레이트 | 연 순수익률 (Cap Rate) |
| 네이밍 라이츠 / 브랜딩 라이츠 | 사옥 단독 명칭 표기(간판 설치권) / 기업 단독 브랜딩 |
| GOP (원시 약어) | 실질 영업이익 (GOP) |
| TI / Rent Free | 인테리어 지원금(TI) / 렌트프리(무상임대) |
| 내 돈 | 실투자금 |
| 달세, 급매, 알박기 | 월 임대료, 시세 대비 할인 매각, 잔존 권리관계 |

### 7.3 갱신요구권 정규화 (Invariant 7)

`first_contract_date` 미제공 시:
> ❌ "갱신요구권 3년 잔여" → ✅ "계약갱신요구권(최초계약일 확인 필요)"

### 7.4 데이터 부재 처리

**파일**: [`data-absence.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/data-absence.ts) — 13,059 bytes, [`data-provenance.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/data-provenance.ts) — 6,783 bytes  
- 9종 데이터 출처 뱃지: `✓ 등기·대장`, `✓ 공공데이터`, `● 현장확인`, `★ 전문가검증`, `◈ 파생계산`, `◇ AI추정·가정` 등

---

## 8. 렌더링 & 출력 파이프라인

### 8.1 HeroCard 조립

**파일**: `writer.ts` L375-388 — 포스처별 2×2 핵심 메트릭 그리드:
- **income**: 매각가, 실투자금, 수익률, ROE
- **development**: 평당가, 용도지역, 매각가, 개발이익률
- **operating**: ADR, OCC, GOP, 매각가
- **trading**: 매각가, 시장가, 걭율, 평당가

### 8.2 CANONICAL_ORDER 재정렬

> [!IMPORTANT]
> **✅ W-IM-4 해결 (구 High)**: 3-tier 폴백으로 스키마 드리프트 방지 ([`writer.ts` L442-473](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts#L442-L473))

| 우선순위 | 소스 | 설명 |
|:---:|---|---|
| **1** | YAML `loadPageOrder()` | SSOT 어댑터에서 동적 로드 |
| **2** | `STAGE_PLANS[posture].flatMap(s => s.sections)` | 포스처별 스테이지 플랜에서 동적 생성 |
| **3** | 하드코딩 18개 배열 | STAGE_PLANS import 자체 실패 시만 사용 |

---

## 9. 테스트 커버리지

**디렉터리**: `src/domain/building/mobile-im/__tests__/` — 34개 테스트 파일

| 레벨 | 파일 패턴 | 검증 범위 |
|:---:|---|---|
| **L1** | `l1-calculations.test.ts` | 순수 재무 계산 단위 테스트 |
| **L2** | `l2-gate-judgments.test.ts` | 품질 게이트 판정 로직 |
| **L3** | `l3-composition/` | 섹션 조합 및 상호작용 |
| **L4** | `l4-output-artifacts/` | 출력 아티팩트 형태 검증 |
| **L5** | `l5-pipeline-e2e.test.ts` | 전체 파이프라인 E2E |
| **E2E** | `e2e-real-property.test.ts` | 양평동/당산동 실제 물건 E2E |
| **Unit** | `hero-card-posture.test.ts` 등 | HeroCard, 환각 경계, 임대수학 |

---

## 10. 약점 및 우려 사항 종합 (해결 현황)

> [!IMPORTANT]
> 이전 감사에서 지적된 **7건 전원 해결** (Critical 1, High 3, Medium 3).

### ✅ 해결 완료 항목

| ID | 등급 | 제목 | 해결 내용 | 커밋 |
|---|:---:|---|---|---|
| **W-IM-1** | 🔴→✅ | Non-income 폴백 템플릿 미구현 | `premium-template-engine.ts` v0.5: 5개 포스처별 `postureLeadMap`(L122-138), `lease_status` 분기(L184-202), `investment_thesis` 5-way switch(L442-483) | `55110d8` |
| **W-IM-2** | 🟡→✅ | opexRatioPct 기본값 매칭 한계 | `financials.ts` `getOpexRatio()` 10개 자산 유형 그룹 확장(L140-156), 미매칭 시 warn 로그 | `55110d8` |
| **W-IM-3** | 🟡→✅ | Cross-validator 정규식 취약성 | `cross-validator.ts` PATTERNS 7→13개 확장(L119-140): NOI, 매각가, 보증금, 층수, 주차, 승강기 | `55110d8` |
| **W-IM-4** | 🟡→✅ | CANONICAL_ORDER 하드코딩 폴백 | `writer.ts` 3-tier 폴백(L442-473): YAML→STAGE_PLANS 동적→하드코딩(최종) | `55110d8` |
| **W-IM-5** | 🟢→✅ | V-World 토지 속성 미연결 | `land-detail-renderer.ts` `LandDetailInput`에 `landShape`/`landTopography`/`roadFrontage` 추가 | `55110d8` |
| **W-IM-6** | 🟢→✅ | extractKeyFacts 에러 묵시적 삼킴 | `writer.ts` L151-152: `catch` 블록에 `console.warn` 명시적 로깅 | `55110d8` |
| **W-IM-7** | 🟢→✅ | 렌트롤 표 측션 손실 | `im-section-generator.ts` L372-388: `###`/`>`/`**임대` 측션 라인 정규식 감지 및 보존 | `55110d8` |

### 🟢 잔여 Low 수준 관찰 사항

| ID | 제목 | 설명 |
|---|---|---|
| L-IM-1 | 다국어 구조 부재 | 한국어 하드코딩 텍스트가 템플릿에 다수. 글로벌 확장 시 i18n 도입 필요 |
| L-IM-2 | 교차 검증기 AI 모델 종속성 | 13개 정규식 패턴이 GPT 계열 표현에 최적화됨. 모델 교체 시 커버리지 재검증 권장 |
| L-IM-3 | V-World 캐싱 효율 | 대량 지적 데이터 호출 시 Redis/in-memory 캐싱 레이어 효율성 재검토 권장 |
