# 모바일 IM 콘텐츠 생성 및 렌더링 스펙 (코드 감사용)

> **문서 ID**: `DOC-TEST0827-02-MOBILE-IM-SPEC`  
> **작성일**: 2026-08-27  
> **대상**: QA / 코드 감사 / 품질 관리팀  
> **범위**: `src/domain/building/mobile-im/` (68 파일, 5 서브디렉터리)

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
10. [약점 및 우려 사항 종합](#10-약점-및-우려-사항-종합)

---

## 1. 오케스트레이터 아키텍처

### 1.1 핵심 진입점

**파일**: [`writer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts) — 499행  
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
    │   (stage-plans.ts 기반)
    ▼
[4] Quality Gates (quality-gates-v02.ts: G01~G16)
    │
    ▼
[5] Cross-Validator (cross-validator.ts: ±15% 앵커 검증)
    │
    ▼
[6] RAG Embedding Indexing (Supabase)
    │
    ▼
[7] HeroCard 조립 + 사진 변환 (photo-url-transformer.ts)
    │
    ▼
[8] CANONICAL_ORDER 재정렬 (실행 순서 ≠ 표시 순서)
    │
    ▼
MobileIMWriterOutput
```

### 1.2 글로벌 타임아웃 (`StageTimer`)

**파일**: [`stage-timer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/stage-timer.ts)

| 한계 | 시간 | 동작 |
|:---:|:---:|---|
| **Soft** | 90s | 최적화 킥인 (토큰 예산 축소) |
| **Hard (BL-7)** | 105s | LLM 호출 중단, 프리미엄 템플릿 폴백 강제 전환. 필수 섹션(`property_overview`, `checklist`, `closing`) 미완 시 시스템 에러 발생 |
| **Kill (BL-6)** | 120s | 불완전/신뢰불가 섹션 폐기 |

### 1.3 멱등성 & 재시도

**파일**: [`idempotency.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/idempotency.ts)

- **M-8 재시도 정책**: Stage 2~4의 순차 섹션이 실패 시 최대 2회 재시도
- **멱등키**: `buildingId + posture + timestamp` 조합

---

## 2. 4단계 위상 기반 생성 흐름

**파일**: [`stage-plans.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/stage-plans.ts)

### Stage 1: 독립 섹션 병렬 생성
- **실행 방식**: `Promise.allSettled` (최대 동시 4개 — `IM_SECTION_CONCURRENCY`)
- **대상**: `property_overview`, `location_access`, `title_rights`, `land_detail`, `lease_status` 등 구조/서술 섹션
- **컨텍스트 전파**: 완료된 섹션에서 `extractKeyFactsFromMarkdown`을 통해 핵심 수치(가격, 면적, 캡레이트)를 추출하여 `ctx.sectionCtx.keyFacts`에 고정
- **에러 처리**: 개별 섹션 실패는 `settled.status === 'rejected'`로 격리, 다른 섹션에 영향 없음

> [!NOTE]
> `extractKeyFacts` 에러는 **묵시적으로 삼킴** (L151). 핵심 수치 추출 실패가 로그에만 기록되고 파이프라인은 계속 진행됩니다.

### Stage 2: 핵심 재무/타당성 순차 생성
- **대상 (포스처별)**:
  - `income`: `income_analysis`
  - `development`: `dev_feasibility`
  - `operating`: `gop_analysis`
  - `owner_occupied`: `cost_comparison`
  - `trading`: `comparable_analysis`
- **의존성**: Stage 1의 고정 앵커 + `keyFacts` 소비
- **재시도**: M-8 멱등 재시도 (최대 2회)

### Stage 3: 리스크 점검
- **대상**: `risk_check` + 아키타입별 경고 섹션
- **확장 경고 계획 (BL-2)**: `getAugmentedSectionPlan`이 특정 리스크 아키타입(예: `R-OPR-04` 용도위반, `R-TRD-04` 엑싯 제약) 탐지 시 전용 경고 섹션(`legality_warning`, `exit_constraint`)을 `risk_check` 앞에 주입

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

| 렌더러 | 파일 | 기능 | 특이사항 |
|---|---|---|---|
| **토지 상세** | `land-detail-renderer.ts` | PNU, 지목, 면적, 공시지가, 건폐율/용적률, 배제면적 테이블 | V-World 신규 필드(형상/지형/도로접면) **미연결** |
| **권리 분석** | `title-rights-renderer.ts` | 소유권 구조(단독/공유지분), 저당권 테이블, 총 채권자 부담 합산 | — |
| **매매사례 비교** | `comparables-renderer.ts` | 거리순 정렬, 평균 평당가, 할인/프리미엄 % 산출 | — |
| **렌트롤 어댑터** | [`lease-adapter.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/lease-adapter.ts) | `normalizeFloorLeases`, `formatRentRollMarkdown`, `formatRentRollSummary` | AI 생성 임대 표를 **강제 덮어쓰기** (L351 in `im-section-generator.ts`) |
| **접근 통제 마스크** | `render/apply-mask.ts` | `public`/`full` 뷰어별 도로명주소 마스킹("동 일대"), 임차인 상호 은닉 | — |

### 4.2 LLM 서사 엔진

**파일**: [`im-section-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-section-generator.ts) — 513행  
**함수**: `generateSingleSection` (L98)

#### 프롬프트 조립 구조
1. **System Prompt**: `MOBILE_IM_NARRATIVE_CORE` + `CrePromptRegistry`(섹션별) + `POSTURE_LEXICONS` + `getPosturePromptOverlay`
2. **User Prompt**: SSoT Lite 팩트, 레지스트리 데이터, 사전 계산된 재무 테이블, RAG 컨텍스트, Few-Shot Golden IM 블록(`buildIMFewShotBlock`)

#### 실행 파라미터
- **모델**: `gpt-5.6-terra` (via `getModel("terra")`)
- **Temperature**: 0.3
- **토큰 한도**: 섹션별 상이 (강조 섹션은 2× 배분)

#### 후처리 파이프라인 (L300~L500)
1. **환각 탐지**: 생성 가격이 SSoT 앵커 대비 >20× 또는 <0.05×, 면적 >10× 차이 시 차단
2. **LLM-as-Judge** (`im-judge.ts`): 5개 차원 평가
   - `factual_accuracy`, `financial_soundness`, `regulatory_compliance`, `investor_value`, `data_grounding`
   - **< 3.0**: 폴백 강제 전환
   - **≥ 4.5**: Golden Candidate 플래그
3. **임차인 마스킹** (L399, L422): 실명 → `[임차인A]`, 유명 브랜드(스타벅스, 올리브영, GS25 등) 자동 제거
4. **용어 정규화** (L432): CRE 표준 용어 치환
5. **안전 게이트**: `runRiskBoundaryCheck`, `runCREQualityGate`, `runDisclosureGuard`
6. **렌트롤 표 강제 덮어쓰기** (L351): `lease_status` 섹션에서 AI가 생성한 표를 결정론적 렌트롤 표로 무조건 교체

### 4.3 프리미엄 템플릿 엔진 (폴백)

**파일**: [`premium-template-engine.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts) — 579행

- **트리거 조건**: AI 타임아웃, 품질 게이트 실패, 환각 탐지, LLM-as-Judge 점수 < 3.0
- **생성 방식**: 100% 결정론적 재무 엔진(`calculateFinancials`, `calculateNetCashFlow`, `calculateWALE`, `computeVacancyPositioning`)을 활용하여 기관급 마크다운 생성
- **커버리지**: 5개 포스처 × 전 섹션 타입에 대한 레이아웃 템플릿 보유

> [!CAUTION]
> **약점 W-IM-1 (High)**: [`premium-template-engine.ts` L70](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts#L70)에 다음 TODO 존재:
> ```
> // TODO: owner_occupied, development, operating, trading 전용 템플릿 추가
> ```
> **현재 non-income 포스처에서 AI가 실패하면 income 전용 템플릿으로 폴백**됩니다. 이는 사옥형/개발형/운영형/단기매매형 IM에서 부적절한 재무 지표(NOI, Cap Rate)가 표시될 수 있음을 의미합니다.

---

## 5. 재무 계산 엔진 상세

### 5.1 핵심 재무 엔진

**파일**: [`financials.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts) — 852행  
**함수**: `calculateFinancials` (L728), `formatFinancialsMarkdown` (L737)

**아키텍처**: Strategy 패턴 — 5개 포스처별 전략 클래스:

| 전략 | 산출 지표 | 주요 로직 |
|---|---|---|
| `IncomeFinancialStrategy` | NOI(기본/최악/최선), Cap Rate, WACC, 5년 IRR, 역레버리지 경고 | Gross Yield vs 대출금리(4.5%) 비교 → Negative Leverage 판정 |
| `DevelopmentFinancialStrategy` | 건축비 총액, 개발 이익률 % | 목표 연면적(평) × 평당 건축비 |
| `OperatingFinancialStrategy` | GOP, ADR, OCC, RevPAR | 호텔/숙박 운영 지표 |
| `OwnerOccupiedFinancialStrategy` | 자가 vs 임차 절감액 | 가상 시장 임대료 − 대출 원리금 = 순 절감 |
| `TradingFinancialStrategy` | 시장 할인율(갭), 목표 HPR % | 매입가 vs 현재 시세 비교 |

> [!WARNING]
> **약점 W-IM-2**: `opexRatioPct`(운영비율) 미제공 시, `assetType` 문자열 매칭으로 기본값 적용: '호텔' → 25%, '물류' → 12%, 기타 → 18%. 비표준 자산유형에서 NOI가 왜곡될 수 있음.

### 5.2 부속 재무 엔진

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

**파일**: [`cross-validator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) — 642행  
**함수**: `runCrossValidation` (L347), `extractKeyFacts` (L200)

**검증 대상**: 공실률, 면적, 건물 연식, 역세권 거리, 월세, Cap Rate

**알고리즘**:
1. 섹션 순회 → 정규식으로 핵심 수치 추출
2. 최초 발견값을 "Ground Truth Anchor"로 고정
3. 후속 섹션에서 동일 지표가 임계값 초과 차이 시 불일치 판정
4. `runFinancialsNarrativeValidation` (L589): 재무 엔진 계산값 vs AI 서사 수치 비교

**불일치 심각도**:
- `critical`: 공실률 절대차 > 0%, 면적 상대차 > 0% → 재생성 필요
- `warning`: 검토 권장

> [!CAUTION]
> **약점 W-IM-3 (High — Regex 취약성)**: 교차 검증기의 정규식 패턴이 AI 모델의 표현 변동에 취약합니다. 예: `(?:월세|월\s*임대료)` 패턴은 "월 임차료", "월간 렌트비" 등 미등록 표현을 **완전히 건너뜁니다**. AI 모델 교체(GPT → Claude 등) 시 검증 커버리지가 급감할 위험이 있습니다.

### 6.3 안전 가드레일

**파일**: [`guardrails.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/guardrails.ts) — 18,602 bytes

#### P0 차단 (즉시 삭제/재작성)
| 카테고리 | 차단 패턴 예시 |
|---|---|
| 투자 추천 | `매수 추천`, `확실한 투자처` |
| 수익률 보장 | `수익률 보장`, `원금 보장`, `NOI 확정` |
| 대출 확정 | `대출 가능 확정`, `LTV 확정` |
| 법적 면책 | `법적 문제 없음` |

#### High Severity 재작성
| 카테고리 | 재작성 대상 |
|---|---|
| 가치 평가 극단 표현 | `적정 가격`, `저평가 확정` |
| 인허가 확정 | `용도변경 확정` |
| 결손 은폐 | 미검증 항목을 `확인 완료`로 표현 |

### 6.4 CRE 품질 게이트

**파일**: [`cre-quality-gate.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cre-quality-gate.ts) — 12,843 bytes

- 고위험 블록 탐지 시 해당 섹션을 폴백 전환
- 데이터 출처 추적 연동

---

## 7. CRE 실무 규칙 구현

### 7.1 페르소나 격리 원칙

**파일**: [`persona-sanitizer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/persona-sanitizer.ts)

- 60대 자산가, 법인 대표, 디벨로퍼 등 → **내부 톤앤매너 조절용으로만** 사용
- `sanitizePersonaInGoldenIM` 함수가 정규식으로 외부 노출 문구에서 자동 삭제

### 7.2 CRE 한국 표준 용어집

**파일**: [`terminology-normalizer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/terminology-normalizer.ts) — 17,802 bytes

| ❌ 금지 표현 | ✅ 정규화 표현 |
|---|---|
| 캡레이트 | 연 순수익률 (Cap Rate) |
| 네이밍 라이츠 / 브랜딩 라이츠 | 사옥 단독 명칭 표기(간판 설치권) / 기업 단독 브랜딩 |
| GOP (원시 약어) | 실질 영업이익 (GOP) |
| TI / Rent Free | 인테리어 지원금(TI) / 렌트프리(무상임대) |
| 내 돈 | 실투자금 |
| 달세, 급매, 알박기, 통으로 빌려주는 | 월 임대료, 시세 대비 할인 매각, 잔존 권리관계, 마스터리스 구조 |
| 연 총수익률 (Cap Rate) *잘못된 번역* | 연 총수익률 (Gross Yield) |

### 7.3 임차인 브랜드 환각 방어

**파일**: `im-section-generator.ts` L399, L422

LLM이 빈번하게 환각하는 유명 브랜드를 자동 제거:
> 스타벅스, 맥도날드, 투썸플레이스, 올리브영, 다이소, 버거킹, GS25 등

### 7.4 갱신요구권 정규화 (Invariant 7)

`first_contract_date` 미제공 시:
> ❌ "갱신요구권 3년 잔여"  
> ✅ "계약갱신요구권(최초계약일 확인 필요)"

### 7.5 데이터 부재 처리

**파일**: [`data-absence.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/data-absence.ts) — 13,059 bytes  
**파일**: [`data-provenance.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/data-provenance.ts) — 6,783 bytes

- 부재 필드를 "확인 필요"로 명확히 표기
- 9종 데이터 출처 뱃지: `✓ 등기·대장`, `✓ 공공데이터`, `● 현장확인`, `★ 전문가검증`, `◈ 파생계산`, `◇ AI추정·가정` 등

---

## 8. 렌더링 & 출력 파이프라인

### 8.1 HeroCard 조립

**파일**: `writer.ts` L375-388

포스처별 2×2 핵심 메트릭 그리드:
- **income**: 매각가, 실투자금, 수익률, ROE
- **development**: 평당가, 용도지역, 매각가, 개발이익률
- **operating**: ADR, OCC, GOP, 매각가
- **trading**: 매각가, 시장가, 갭율, 평당가

### 8.2 사진 URL 변환

**파일**: [`photo-url-transformer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/photo-url-transformer.ts) — 7,066 bytes

- 8개 카테고리 라벨(`cover`, `exterior`, `aerial`, `interior` 등)
- 히어로/외관 플래그 자동 분류

### 8.3 CANONICAL_ORDER 재정렬

**파일**: `writer.ts` L444

- 실행 순서(위상 기반)와 표시 순서(UX 기반)를 분리
- SSOT 어댑터에서 YAML 순서를 동적 로드; 실패 시 19개 섹션 하드코딩 배열 폴백

> [!WARNING]
> **약점 W-IM-4**: SSOT 어댑터 동적 import 실패 시 하드코딩 폴백 배열이 사용됨. 섹션 추가/삭제 시 이 배열도 수동 동기화해야 하는 스키마 드리프트 위험.

---

## 9. 테스트 커버리지

**디렉터리**: `src/domain/building/mobile-im/__tests__/` — 34개 테스트 파일

### 계층적 테스트 체계

| 레벨 | 파일 패턴 | 검증 범위 |
|:---:|---|---|
| **L1** | `l1-calculations.test.ts` | 순수 재무 계산 단위 테스트 |
| **L2** | `l2-gate-judgments.test.ts` | 품질 게이트 판정 로직 |
| **L3** | `l3-composition/` | 섹션 조합 및 상호작용 |
| **L4** | `l4-output-artifacts/` | 출력 아티팩트 형태 검증 |
| **L5** | `l5-pipeline-e2e.test.ts` | 전체 파이프라인 E2E 테스트 |
| **E2E** | `e2e-real-property.test.ts` | 양평동/당산동 실제 물건 데이터 E2E |
| **Unit** | `hero-card-posture.test.ts` 등 | HeroCard, 환각 경계, 임대수학 단위 테스트 |

---

## 10. 약점 및 우려 사항 종합

### 🔴 Critical

| ID | 제목 | 위치 | 설명 |
|---|---|---|---|
| **W-IM-1** | Non-income 폴백 템플릿 미구현 | `premium-template-engine.ts` L70 | AI 실패 시 사옥/개발/운영/매매 포스처가 income 템플릿으로 폴백 → 부적절한 지표 표시 |

### 🟡 High

| ID | 제목 | 위치 | 설명 |
|---|---|---|---|
| **W-IM-2** | opexRatioPct 기본값 문자열 매칭 | `financials.ts` | 비표준 assetType에서 NOI 왜곡 가능 (기본 18%) |
| **W-IM-3** | Cross-validator 정규식 취약성 | `cross-validator.ts` | AI 표현 변동 시 검증 건너뜀. 모델 교체 시 커버리지 급감 |
| **W-IM-4** | CANONICAL_ORDER 하드코딩 폴백 | `writer.ts` L444 | SSOT 어댑터 로드 실패 시 스키마 드리프트 |

### 🟢 Medium

| ID | 제목 | 위치 | 설명 |
|---|---|---|---|
| **W-IM-5** | V-World 토지 속성 미연결 | `land-detail-renderer.ts` | 형상/지형/도로접면 데이터가 IM에 미반영 |
| **W-IM-6** | extractKeyFacts 에러 묵시적 삼킴 | `writer.ts` L151 | 앵커 고정 실패가 다운스트림에 전파되지 않음 |
| **W-IM-7** | 렌트롤 표 강제 덮어쓰기의 부작용 | `im-section-generator.ts` L351 | AI가 추가한 렌트롤 관련 서술 맥락도 함께 제거될 수 있음 |
