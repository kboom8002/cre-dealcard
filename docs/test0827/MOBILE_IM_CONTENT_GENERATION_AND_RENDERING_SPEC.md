# 모바일 IM 콘텐츠 생성 및 렌더링 스펙 (코드 감사용)

> **문서 ID**: `DOC-TEST0827-02-MOBILE-IM-SPEC`  
> **작성일**: 2026-08-27 (Updated — 커밋 `4b8550e`)  
> **대상**: QA / 코드 감사 / 개발 기획팀  
> **코드베이스 기준**: `main` branch, 커밋 `4b8550e`  
> **범위**: `src/domain/building/mobile-im/` (68 파일, 5 서브디렉터리)

> [!NOTE]
> 커밋 `4b8550e` (25건 보완 개선) 반영본. 이전 7건 결함 전원 해결 + 신규 10건 개선 반영.

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
    ▼
[2] NumericalAnchors 고정 (numerical-anchors.ts)
    ▼
[3] 4-Stage Section Generation (stage-plans.ts 기반)
    ▼
[4] Quality Gates (G01~G16)
    ▼
[5] Cross-Validator (13개 패턴, ±15% 앵커 검증)
    ▼
[6] RAG Embedding + HeroCard 조립
    ▼
[7] CANONICAL_ORDER 재정렬 (3-tier 폴백)
    ▼
[8] 데이터 신선도 경고 첨부  ✅ NEW-C2
    ▼
MobileIMWriterOutput
```

### 1.2 글로벌 타임아웃

| 한계 | 시간 | 동작 |
|:---:|:---:|---|
| **Soft** | 90s | 토큰 예산 축소 |
| **Hard (BL-7)** | 105s | LLM 중단, 프리미엄 템플릿 폴백 |
| **Kill (BL-6)** | 120s | 불완전 섹션 폐기 |

---

## 2. 4단계 위상 기반 생성 흐름

**파일**: [`stage-plans.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/stage-plans.ts) — 177행

### Stage 1: 독립 섹션 병렬
- `Promise.allSettled` (최대 4개)
- ✅ **W-IM-6 해결**: `extractKeyFacts` `console.warn` 로깅
- ✅ **NEW-H1 개선**: `writer.ts` L143, L251의 묵시적 catch → `console.warn` 교체

### Stage 2: 핵심 재무/타당성 순차

| 포스처 | Stage 2 섹션 | 앵커 의존성 |
|---|---|---|
| `income` | `income_analysis` | `askingPriceKrw`, `totalAreaSqm` |
| `development` | `site_analysis`, `development_feasibility` | `askingPriceKrw`, `landAreaSqm` |
| `operating` | `operation_overview`, `gop_analysis` | `askingPriceKrw`, `totalAreaSqm` |
| `owner_occupied` | `occupancy_fit`, `cost_comparison` | `askingPriceKrw`, `totalAreaSqm` |
| `trading` | `market_position`, `comparable_analysis` | `askingPriceKrw`, `totalAreaSqm` |

### Stage 3: 리스크 / Stage 4: 투자 논거
- `risk_check` + 아키타입별 경고
- `investment_thesis` — Stage 1~3 전체 결과 + value-add 테이블

---

## 3. 5대 투자 포스처 & 섹션 구성

| 포스처 | 섹션 수 | 2× 토큰 섹션 |
|---|:---:|---|
| **income** | 12 | lease_status, income_analysis |
| **owner_occupied** | 9 | occupancy_fit, cost_comparison |
| **development** | 10 | site_analysis, dev_feasibility |
| **operating** | 10 | operation_overview, gop_analysis |
| **trading** | 8 | market_position, comparable_analysis |

---

## 4. 콘텐츠 생성 3중 메커니즘

### 4.1 결정론적 렌더러

| 렌더러 | 파일 | 개선 |
|---|---|---|
| 토지 상세 | [`land-detail-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-renderers/land-detail-renderer.ts) | ✅ W-IM-5: V-World 3필드 |
| 렌트롤 | [`lease-adapter.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/lease-adapter.ts) | ✅ W-IM-7: 측션 보존 |

### 4.2 LLM 서사 엔진

**파일**: [`im-section-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-section-generator.ts) — 525행

- ✅ **NEW-H1 개선**: L217, L299, L309 묵시적 catch → `console.warn('[im-section-generator]', err)` 교체

### 4.3 프리미엄 템플릿 엔진 (v0.5)

**파일**: [`premium-template-engine.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts) — 642행

- ✅ **W-IM-1 해결**: 5개 포스처별 템플릿 완전 구현

---

## 5. 재무 계산 엔진 상세

**파일**: [`financials.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts) — 858행

> [!IMPORTANT]
> **✅ NEW-H4 개선**: 하드코딩 기본값(`vacancyRatePct=5`, `rentGrowthPct=2`, `entryCapBase=0.04`)이 `getAssumptions(assetType)` 호출로 교체되었습니다.

### `getOpexRatio` (10개 자산 유형 그룹)

| 자산 유형 | 키워드 | 운영비율 |
|---|---|:---:|
| 오피스/업무 | `오피스`, `office` | 15% |
| 리테일/근생 | `상가`, `근린` | 20% |
| 지식산업센터 | `지식산업` | 22% |
| 물류/창고/DC | `물류`, `창고` | 12% |
| 꼬마빌딩/주상복합 | `꼬마`, `빌딩` | 18% |
| 호텔/숙박 | `호텔`, `숙박` | 25% |
| 원룸/다세대/오피스텔 | `원룸`, `다세대` | 15% |
| 병원/의료/요양 | `병원`, `의료` | 22% |
| 주유소/세차 | `주유소`, `세차` | 10% |
| 교육/학원 | `교육`, `학원` | 20% |
| 기본 폴백 | — | 18% (warn) |

---

## 6. 품질 게이트 & 안전 가드레일

### 6.1 교차 검증기 (13개 패턴)

**파일**: [`cross-validator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) — 649행

> [!TIP]
> **✅ NEW-M7 개선**: `@model-dependency GPT-4o` JSDoc 추가 — 모델 교체 시 검증 절차 4단계 문서화

| # | 패턴 ID | 비고 |
|:---:|---|---|
| 1-7 | area, vacancy, monthlyRent, capRate, buildYear, buildAge, stationWalk | 기존 |
| 8-13 | **noi, askingPrice, deposit, floorCount, parkingCount, elevatorCount** | ✅ 신규 |

---

## 7. CRE 실무 규칙 구현

- **페르소나 격리**: 외부 노출 문구에서 연령/계층 직접 지칭 자동 삭제
- **CRE 표준 용어**: 측레이트→연 순수익률, 네이밍 라이츠→사옥 단독 명칭 표기 등
- **갱신요구권**: `first_contract_date` 미제공 시 "최초계약일 확인 필요" 표기
- **데이터 부재 처리**: 9종 데이터 출처 뱃지

---

## 8. 렌더링 & 출력 파이프라인

### CANONICAL_ORDER 3-tier 폴백

| 우선순위 | 소스 |
|:---:|---|
| 1 | YAML `loadPageOrder()` |
| 2 | `STAGE_PLANS[posture].flatMap(s => s.sections)` |
| 3 | 하드코딩 18개 배열 |

### 출력 확장

> [!TIP]
> **✅ NEW-C2 개선**: `MobileIMWriterOutput`에 `dataFreshnessWarning: string | null` 필드 추가.
> - 데이터 수집 30일 초과 시 🔴, 7일 초과 시 🟡 경고 표시

---

## 9. 테스트 커버리지

| 레벨 | 파일 패턴 | 검증 범위 |
|:---:|---|---|
| L1 | `l1-calculations.test.ts` | 재무 계산 |
| L2 | `l2-gate-judgments.test.ts` | 품질 게이트 |
| L3-L5 | `l3-composition/` ~ `l5-pipeline-e2e.test.ts` | 조합~E2E |
| E2E | `e2e-real-property.test.ts` | 실제 물건 |
| **신규** | **`land-detail-renderer.test.ts`** | ✅ V-World 3필드 렌더링 |
| **신규** | **`text-budget.test.ts`** | ✅ 12개 요소 절삭/보존 |
| **신규** | **`data-binder-sanitize.test.ts`** | ✅ 페르소나/CRE 용어 11개 |

---

## 10. 약점 및 우려 사항 종합

### ✅ 해결 완료 (총 17건 = 이전 7건 + 신규 10건)

| ID | 등급 | 제목 | 커밋 |
|---|:---:|---|---|
| W-IM-1 | 🔴→✅ | Non-income 폴백 템플릿 | `55110d8` |
| W-IM-2 | 🟡→✅ | opexRatioPct 한계 | `55110d8` |
| W-IM-3 | 🟡→✅ | Cross-validator 정규식 | `55110d8` |
| W-IM-4 | 🟡→✅ | CANONICAL_ORDER 폴백 | `55110d8` |
| W-IM-5 | 🟢→✅ | V-World 토지 속성 | `55110d8` |
| W-IM-6 | 🟢→✅ | extractKeyFacts 에러 삼킴 | `55110d8` |
| W-IM-7 | 🟢→✅ | 렌트롤 측션 손실 | `55110d8` |
| NEW-C2 | 🔴→✅ | 데이터 신선도 데드코드 | `4b8550e` |
| NEW-H1 | 🟡→✅ | writer/generator 에러 삼킴 | `4b8550e` |
| NEW-H4 | 🟡→✅ | 재무 상수 외부화 | `4b8550e` |
| NEW-M1 | 🟢→✅ | 단위 테스트 3건 | `4b8550e` |
| NEW-M7 | 🟢→✅ | 모델 종속성 문서화 | `4b8550e` |
| NEW-L5 | 🔵→✅ | Supabase RPC 타입 | `4b8550e` |
| NEW-L7 | 🔵→✅ | 텍스트 예산 연동 | `4b8550e` |

### 🟢 잔여 관찰 사항

| ID | 제목 | 설명 |
|---|---|---|
| L-IM-1 | `as any` ~180건 | 핵심 파일 타입 정비 완료. 나머지는 점진적 타입 강화 필요 |
| L-IM-2 | i18n 구조 부재 | 한국어 하드코딩. 글로벌 확장 시 도입 |
| L-IM-3 | 교차 검증기 모델 종속 | `@model-dependency` 문서화 완료. 모델 교체 시 4단계 검증 필요 |
