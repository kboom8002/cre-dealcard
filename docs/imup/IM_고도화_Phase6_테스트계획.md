# IM 고도화 Phase 6 & 전체 테스트 계획

> 본 문서는 IM 고도화 Phase 6 (화면 확장, Day 69-101) 구현 계획과 프로젝트 전체의 정밀 테스트 및 품질 보증 계획을 정의합니다.

## Phase 6: 화면 확장 (Day 69-101)

### 6-1. 딜카드 (블라인드 티저) (8일)
**문서 소유**: `c:\Users\User\cre-dealcard\docs\imup\04_screen\DEAL_CARD_SPEC.md`

- **현행 구현 분석**
  - 현재 딜카드는 `c:\Users\User\cre-dealcard\src\app\(public)\im-lite\[buildingId]\page.tsx`와 `c:\Users\User\cre-dealcard\src\app\(public)\im-lite\[buildingId]\mobile-im-viewer.tsx` (L1~800)에 구현되어 있습니다. 
  - 정적 렌더링을 유지하되, 현재 하드코딩된 UI를 `isTeaserVisible` 판정에 맞게 개편해야 합니다.
- **b2cLabel 전용 노출 구현**
  - 대고객 화면에서는 오직 `b2cLabel`이 있는 슬롯만 노출해야 합니다. (DEAL_CARD_SPEC.md L69-83)
- **포스처별 히어로 UI 분기**
  - 관점(posture)에 따라 히어로 4칸이 동적으로 변경됩니다. (예: `income`은 임대수익률, `development`는 개발 가능 규모)
  - 파일: `c:\Users\User\cre-dealcard\src\app\(public)\im-lite\[buildingId]\hero-card.tsx`를 수정하여 관점에 따른 분기를 구현합니다.
- **밴딩 정책 (매각가·수익률 범위 표기)**
  - 정확한 값이 아닌 밴드 형태(예: "190억대", "2%대 중반")로 마스킹 처리하여 호기심을 유도합니다. (DEAL_CARD_SPEC.md L190-216)
- **3단 CTA (질문→관심→상세)**
  - 상세 요청(`intent.detail_request`)시에만 Party 생성을 위해 개인정보(이름, 연락처)를 받고, 나머지는 마찰 없이 동작하게 구현합니다.
- **성능 예산 (1.2초)**
  - 3G 네트워크 기준 첫 화면 1.2s 내 표시를 강제합니다. (스크립트 최소화, 정적 HTML 렌더링 유지)

### 6-2. 중개인 워크스페이스 (10일)
**문서 소유**: `c:\Users\User\cre-dealcard\docs\imup\04_screen\BROKER_WORKSPACE_SPEC.md`

- **자료등급 ↔ 딜 준비도 분리**
  - 기존에 혼재된 A~D 등급을 발행 목적의 **자료등급**과 성사 가능성을 나타내는 **상태어 기반 준비도**(준비완료/보완필요/위험/정체)로 분리합니다. (L65-94)
- **준비도 7축 패널**
  - 준비도 7축을 `c:\Users\User\cre-dealcard\components\workspace\` 내 패널 컴포넌트로 구현하고, 각 축별로 점수와 근거 문장을 필히 병기합니다. (L187-246)
- **IM 탭 variant 관리**
  - 관점(posture)별로 별도의 IM variant를 생성 및 관리할 수 있도록 탭 구조를 개편합니다. (L303-324)
- **nextBestField 안내**
  - 중개인에게 가장 점수 상승 효과가 큰 행동(nextAction) 3가지를 제시하도록 구현합니다.

### 6-3. 발행 후 관리 F/S 엔진 (10일)
**문서 소유**: `c:\Users\User\cre-dealcard\docs\imup\04_screen\POST_PUBLISH_SPEC.md`

- **F 엔진 (신선도 10종) 설계**
  - 일 1회 배치로 실행되며, F01(등기부 경과)부터 F10(갱신권 잔여)까지 결정적인 룰 기반 판정을 내립니다. (L78-124)
- **S 엔진 (반응 8종) 설계**
  - `track_event` 기반 통계 엔진으로 S01(이탈 집중)부터 S08(미기록)을 도출합니다. 최소 표본 조건 충족 시에만 신호로 인정합니다. (L146-191)
- **AI 호출 계약**
  - 온디맨드로 이탈 원인 가설을 생성하며, 법령 판정이나 수치 재계산을 금지하고 근거(`evidence`) 필수가 되도록 DB 제약(`evidence_not_empty`)을 둡니다. (L193-267)
- **재발행 diff 연동**
  - finding 해소 시 기존 딜을 덮어쓰지 않고 `superseded` 처리 후 새로운 `publish_record`를 발행하는 파이프라인과 연동합니다. (L404-431)

### 6-4. 배포/신원 체계 (5일)
**문서 소유**: `c:\Users\User\cre-dealcard\docs\imup\04_screen\DISTRIBUTION_AND_IDENTITY.md`

- **3층 신원 모델**
  - `Viewer` (익명) → `Recipient` (확률) → `Party` (확정) 3단계로 분리 구현하여 오염을 막습니다. (L29-56)
- **전달 오염 탐지**
  - `distinct_viewers > 3` 초과 시 `contaminated=true` 처리하여 신규 조건을 `buyer_condition`에 귀속시키지 않습니다. (L91-117)
- **RLS 정책**
  - `party`, `buyer_condition` 등은 `security definer`와 RLS로 보호하며 매칭 집계 결과에 개인정보가 절대 누출되지 않도록(`MatchResult` 구조 보장) 제약합니다. (L432-483)

---

## 전체 테스트 계획

### T-1. 테스트 전략 개요
**문서 소유**: `c:\Users\User\cre-dealcard\docs\imup\01_spec_new\TEST_PLAN.md`

- **테스트 피라미드**: 단위(Vitest) → 게이트(Vitest) → 스키마 검증(스크립트) → E2E(Playwright) → 성능(스트레스 스크립트) 계층으로 구성됩니다. (TEST_PLAN.md L48-67)
- **커버리지 목표**: `financials/`와 `gates/` 모듈은 분기 커버리지 95~100%를 엄수하며, 수치가 틀려 전체가 어긋나는 것을 방어합니다. (L473-485)

### T-2. 실매물 E2E 검증 5건 상세
실제 데이터를 기준으로 E2E를 수행합니다. (TEST_PLAN.md L270-346)

1. **G01 양평동 250억**: `income` 포스처. 12행 표지 불일치(월세 오차 360만) 및 토지이용계획원 주소 불일치(논현동)로 인한 **G19, G21 게이트 차단 확인**.
2. **G02 당산동 115억**: `income` 포스처. 층별 면적 계 행 합산 모순(20.8% 차이)으로 **C19 게이트 차단 확인**. LTV 50% 가정 시 월 순현금 음수(역레버리지 경고) 확인.
3. **G03 역삼동 사옥 120억**: `owner_occupied` 사옥형 포스처로 설정, 공실/자가사용 조건의 처리 로직 검증.
4. **G06 잠원동 332억**: `development` 포스처. 2종일반주거 상한인 용적률 250% 적용, 자동 400% 적용 금지 및 취득세 강제 편입 로직 확인.
5. **G07 대치동 150억**: Comps 부재 시 목표 매각가 미산출(`manualComps` 강제) 처리 검증.

### T-3. 21개 불변조건 → 테스트 매핑
`TEST_PLAN.md` §2. 21개 불변조건 각각에 1:1 테스트 코드를 매핑합니다.

- **UT-YIELD-01**: 운영비 결손 시 NOI 미산출
- **TC-BASIS-01**: 수익률 basis 누락 시 렌더링 거부
- **UT-DEV-01**: 용도지역 조회 실패 시 개발 규모 미산출
- **GT-G19-01/02**: 표지 월세와 원장 합계 불일치 차단
- **GT-C19-01**: 면적 20.8% 불일치 차단
- **SC-TABLE-01**: 미존재 테이블 스키마 참조 차단 (CI 연동)
- **PF-LIMIT-01**: p95 처리 시간 120초 미만 보장 등. (L70-124)

### T-4. 페이스별 수용 기준
**문서 소유**: `c:\Users\User\cre-dealcard\docs\imup\01_spec_new\MIGRATION_RUNBOOK.md`

- **수용 기준 (DoD)**: 각 배포 단계에서 검증 쿼리(예: `input_missing_pct` = 0%, `metrics_rows` 수집 여부)가 통과되어야 합니다.
- **롤백 트리거 조건**:
  - Phase별 플래그를 통한 롤백 (예: `IM_SECTION_CONCURRENCY=1`, `RENDER_PATH=markdown`)이 기본입니다.
  - 데이터 유실 위험이 있는 구 테이블 삭제나 덮어쓰기(예: Golden 원본)는 발생하지 않도록 2분기 동안 구 컬럼 유지 및 백업(`golden_examples_backup`)을 선제 적용합니다. (MIGRATION_RUNBOOK.md L399-410)
- **모니터링 지표**: `im_generation_metrics` 테이블을 통해 생성 소요 시간, 실패 원인(`system_error` 여부) 등을 데일리 배치로 감시합니다.

### T-5. CI/CD 통합
- **배포 파이프라인 구성**: `tsc --noEmit` → 스키마 대조 스크립트 → 단위/게이트 테스트(Vitest) → 회귀 스냅샷 → E2E 순으로 진행됩니다. (TEST_PLAN.md L438-449)
- **릴리스 게이트 21개 불변조건**: 모든 테스트는 CI 파이프라인에서 블로커로 작동하며 단 하나라도 깨지면 머지가 차단됩니다.
- **스키마-코드 정합성 스크립트**: DB에 없는 테이블 참조 시 `comm` 명령어로 즉각 차단하여 시스템 오류를 방지합니다. (TEST_PLAN.md L450-461)
- **롤백 플래그 8종 검증**: 배포 전 스테이징 환경에서 `FORM_PREVALIDATE`, `LEASE_READ_FROM`, `DETERMINISTIC_GATES` 등 8종 플래그 스위칭이 정상 작동하는지 필히 확인합니다. (MIGRATION_RUNBOOK.md L428-447)
