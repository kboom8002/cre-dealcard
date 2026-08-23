# CREDEAL IM 시스템 고도화 — Phase 2 & 3 정밀 구현 계획

> 작성일: 2026-08-23
> 목적: Phase 2 (코어 아키텍처 전환, 18일) 및 Phase 3 (재무 엔진 재설계, 12일) 상세 구현 지침

## 1. Phase 2: 코어 아키텍처 전환 (Day 14-31)

### 2-1. 온톨로지 v0.4 3축 모델 적용
* **목표**: 기존 단일 `AssetClass` 기반 체계를 `BuildingUse × AssetType × InvestmentPosture` 3축 체계로 완전 전환

* **수정 대상 파일 및 라인**
  - `src/domain/ontology/slots.ts` (L444-445): `AssetDocV2` 및 `PublishRecord`의 `assetClass` 속성을 폐기(`deprecated`)하고 3축 모델(`identity` 필드)을 강제 적용.
  - `src/domain/building/mobile-im/narrative-prompt.ts` (L162-208): `POSTURE_LEXICONS`에 Lexicon 엔진 (canonical → proLabel → b2cLabel) 연동.

* **구현 단계**
  1. `src/types/ontology.ts` 파일 신설 및 3축 타입(`BuildingUse`, `AssetType`, `InvestmentPosture`) 정의.
  2. 프론트엔드 입력 폼에서 불가능한 조합 매트릭스 제약 추가.
  3. `src/domain/building/mobile-im/im-context-builder.ts` 내 임대차 판정 시 `T-C(상가)`와 `T-R(주택)` 분기 로직 삽입 (대항력·갱신요구권 분리).
  4. 어휘 변환을 담당하는 Lexicon 엔진 패키지 신설 및 `narrative-prompt.ts` 프롬프트 템플릿에 연동.

### 2-2. `lease_ledger` 단일 원장 통합
* **목표**: 파편화된 `lease_spaces`와 `lease_units` 테이블을 `lease_ledger` 단일 원장으로 통합

* **수정 대상 파일 및 라인**
  - `src/domain/building/mobile-im/lease-adapter.ts` (L143, 167)
  - `src/domain/matching/lease-auto-matcher.ts` (L16, 133)
  - `src/lib/ssot-adapter.ts` (L352, 355-357)
  - `src/app/api/broker/lease-card/[id]/route.ts` (L49, 129, 169)
  
* **구현 단계**
  1. `lease_ledger` 신규 테이블 마이그레이션 스크립트 작성 (`deposit_krw`, `monthly_rent_krw` 등 명세 컬럼 15개 대응).
  2. `lease-adapter.ts` 등의 쿼리를 `lease_ledger` 테이블로 마이그레이션.
  3. 구 테이블은 Drop 하지 않고, 읽기 전용으로 보존하여 롤백 대비 (플래그 `LEASE_TABLE=ledger/legacy_dual` 사용).

### 2-3. IMCore 단일 자료구조 확립
* **목표**: 마크다운을 경유하는 PPTX 렌더링 파이프라인을 제거하고, `IMCore` 객체에서 직접 렌더링

* **수정 대상 파일 및 라인**
  - `src/domain/building/mobile-im/pptx/data-binder.ts` (L22-95): 마크다운 `split('|')` 파싱 로직 폐기.
  - `src/domain/building/mobile-im/im-context-builder.ts`: `IMCore` 표준 객체 리턴으로 구조 변경.
  
* **구현 단계**
  1. `src/types/im-core.ts`에 `IMCore` 인터페이스 맵 구현.
  2. `src/domain/building/mobile-im/render/apply-mask.ts` 신설하여 `applyMask('public' | 'full')` 구현.
  3. 확인 불가능한 항목을 별도 관리하는 `deficiency-ledger.ts` 신설.
  4. `data-binder.ts`가 `IMCore`를 직접 소비하도록 바인딩 모델 재작성.

### 2-4. API/타입 계약 적용
* **목표**: 엑셀 15개 입력 필드 ↔ DB 컬럼 ↔ TypeScript 타입 간 1:1 고정 매핑

* **수정 대상 파일 및 라인**
  - `src/domain/building/mobile-im/financials.ts` 등 전역.

* **구현 단계**
  1. 15개 엑셀 컬럼과 DB 명칭, TS 타입을 API Contract 문서에 맞추어 `src/types/im.ts`에 고정.
  2. 런타임 계산값 6종은 DB 컬럼을 제거하고 조회 시 계산 함수(e.g., `convertedDeposit()`)에서 파생.
  3. `posture` 필드의 기본값(`income`) 삭제 및 필수 선택 강제.
  4. 수익률 산출 기반인 `CapRateBasis` 7종 반환 구조(`YieldValue`) 적용.


## 2. Phase 3: 재무 엔진 재설계 (Day 32-43)

### 3-1. 가정값 레지스트리 외부화
* **목표**: 코드 내 하드코딩된 상수 폐기 및 Assumption Registry 도입

* **수정 대상 파일 및 라인**
  - `src/domain/building/mobile-im/financials.ts` (L132, L421): Opex Ratio 및 GOP 마진율 35% 상수 폐기.
  - `src/domain/building/mobile-im/financials.ts` (L446-447): `0.85` 최악 산식 계수 폐기.
  - `src/domain/building/mobile-im/value-add-engine.ts` (L37, L52, L69): `0.85` 계수 폐기.
  - `src/domain/building/mobile-im/im-context-builder.ts` (L215): `annualNoi = monthlyRent * 12 * 0.85` 폐기.

* **구현 단계**
  1. `src/domain/building/mobile-im/assumptions.ts` 파일 신설 및 21종 가정값 레지스트리 구현 (`Assumption<T>`).
  2. 기존 소스 파일에서 `0.85`, `8000000`, `400` 등 하드코딩 값을 모두 레지스트리 참조로 교체.
  3. 사용자 미입력(`user_input`)이나 법정 정보 누락(`legal`) 시 `null`을 반환하여 강제 계산을 방지.

### 3-2. 포스처별 재무 산식 재정의
* **목표**: 각 포스처 전략 패턴의 도메인 로직 정확도 향상

* **수정 대상 파일 및 라인**
  - `src/domain/building/mobile-im/financials.ts` (L137-644): `PostureFinancialStrategy` 구현체 5종.

* **구현 단계**
  1. **income**: 취득세 4.6% 및 중개보수 0.9%를 필수 반영하여 총취득원가 강제 산출. 역레버리지 경고 로직 추가.
  2. **owner_occupied**: 임대수익률 산출 로직을 제거하고 자가사용 가치 산출 로직 신설. 명도 가능일 계산 연동.
  3. **development**: `manualComps` 미기재 시 매각가 자동 산출 중단. `targetFarByZoning` 실패 시 사업성 평가 중단.
  4. **operating**: 입력된 Opex가 없으면 NOI 등 수익률 반환 금지.
  5. **trading**: 비교사례(`manualComps`) 캡 500억 상향 조정 및 300억 초과 자동 매각가 창작 차단 기능 구현.

### 3-3. 명도·갱신요구권 산식 분리
* **목표**: 상가(T-C)와 주택(T-R) 간 상이한 갱신요구권 기산 및 보장 기간 로직 구현

* **구현 단계**
  1. `src/domain/building/mobile-im/lease-math.ts` 신설.
  2. 상가(commercialVacatePoint): 최초 계약일 기준 10년 로직.
  3. 주택(residentialVacatePoint): 현 계약 만료일 기준 1회(+2년) 로직.
  4. 만약 최초계약일 등 필수 데이터 누락 시 `unknown` 상태 반환 및 강제 계산 회피.


## 3. 의존성 및 롤백 전략

* **의존성 (Dependencies)**
  - Phase 2의 `lease_ledger` 통합은 API 및 DB 마이그레이션이 선행되어야 함.
  - Phase 3의 `Assumption<T>` 적용은 `IMCore` 단일 자료구조가 확립(Phase 2-3)된 후 진행해야 파이프라인에서 정상 노출됨.
  
* **롤백 전략 (Rollback & Failsafe)**
  1. `RENDER_PATH`: `imcore` 렌더링에 문제가 생길 경우 기존 `legacy_md` 로 되돌리기 위한 `.env` 롤백 스위치.
  2. `LEASE_TABLE`: 구 테이블(`lease_spaces`, `lease_units`) 읽기 지원을 최소 2분기 유지하여 장애 발생 시 즉각 롤백(Flag: `legacy_dual`).
  3. `ASSUMPTION_SOURCE`: `registry`에서 문제가 발생할 경우 기존 하드코딩 로직으로Fallback (`hardcode` Flag).
