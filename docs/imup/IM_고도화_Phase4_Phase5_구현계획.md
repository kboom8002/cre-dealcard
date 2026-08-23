# IM 고도화 Phase 4 & Phase 5 정밀 구현 계획

본 문서는 CREDEAL CRE IM 시스템 고도화 프로젝트의 Phase 4(렌더링 파이프라인 통합) 및 Phase 5(품질 게이트 & 테스트)의 정밀 구현 계획서입니다. 현재 코드베이스의 정확한 파일 경로 및 라인 번호를 바탕으로 작성되었습니다.

## 1. Phase 4: 렌더링 파이프라인 통합 (15일)

### 1.1. PPTX 아키타입(Archetype) 개편
- **A16 (투자 구조 - Investment Structure), A17 (준공 전 마케팅 - Pre-completion Marketing) 추가**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\archetypes\a16-investment-structure.ts` (신규), `a17-pre-completion-marketing.ts` (신규)
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\deck-sequencer.ts`
  - **수정 위치**: 
    - `deck-sequencer.ts` Line 13~21: `SlideSpec` 및 아키타입 정의부에 A16, A17 추가.
    - `deck-sequencer.ts` Line 139~199 (posture별 본문): Development 또는 관련 posture 분기에 A16, A17 삽입.
  - **작업 내용**: A16은 Posture에 따라 좌/우 테이블 렌더링(X: 12.713, Y: 6.75 제한 준수), A17은 Development 전용으로 스태킹 플랜 및 규제 만료 경고 포함.

- **A03 (Large Table) 개선**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\archetypes\a03-large-table.ts`
  - **작업 내용**: 
    - 기존 8행 하드 리밋 로직 제거 및 12행 기준 슬라이드 분할(Pagination) 로직 추가.
    - 텍스트 렌더링 전 `"외 N건은 별첨 참조"` 문자열을 grep/필터링하여 삭제하는 로직 추가.

- **A07 (Three Block) 디자인 개편**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\archetypes\a07-three-block.ts`
  - **작업 내용**: 리스크 체크를 위한 3개의 시각적 섹션(Three distinct visual sections)으로 디자인 전면 개편.

- **좌표 검증 및 텍스트 예산**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\text-budget.ts`
  - **작업 내용**: `assertBounds` 함수 또는 관련 CI 테스트 스크립트를 추가하여 객체가 지정된 X, Y 한계를 벗어나지 않도록 검증.

### 1.2. Mobile IM GAP 해소
- **Hero Metrics (2x2 그리드) 개편**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\app\(public)\im-lite\[buildingId]\hero-card.tsx`
  - **수정 위치**: Line 74~194 (`{/* 2×2 Metric Grid */}`)
  - **작업 내용**: 기존 Posture별 분기를 단순화하거나 통합하여 `[매매가/가격, 평당가, 월 임대료, 하자/보수]`의 4가지 주요 지표가 2x2 그리드로 명확히 표시되도록 변경.

- **전화 걸기(Phone CTA) 추가**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\app\(public)\im-lite\[buildingId]\mobile-im-viewer.tsx`
  - **수정 위치**: 화면 하단 고정 영역 또는 `IMInquiryBottomSheet` 근처.
  - **작업 내용**: `tel:` 링크를 사용한 Primary Action 형태의 전화 걸기 버튼(Phone CTA) 추가.

- **접근성 (타이포그래피 보정)**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\app\(public)\im-lite\[buildingId]\mobile-im-viewer.tsx` 및 하위 컴포넌트
  - **작업 내용**: 소스코드 전체에서 `text-[10px]` 유틸리티 클래스를 검색하여 모두 `text-xs` (12px) 이상으로 교체하여 가독성 확보. (예: Line 539, 571 등)

### 1.3. 렌더링 패스(Rendering Path) 재작성
- **Markdown 파싱 의존성 제거**
  - **대상 파일**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\data-binder.ts`
  - **수정 위치**: Line 117~123 (`parseMarkdownTable`, `extractMetrics` 부분), Line 271~405 (`transformForArchetype` 내부 파싱 로직)
  - **작업 내용**: 기존 `cleanMarkdown.split('|')` 등 원시 마크다운 텍스트 파싱을 Deprecate하고, SSoT 데이터 구조(`IMCore` 객체)를 직접 참조하여 컴포넌트 Props로 바인딩하도록 로직 전면 수정.

---

## 2. Phase 5: 품질 게이트 & 테스트 (10일)

### 2.1. 결정적 게이트(Deterministic Gates) 5종 구현
- **대상 경로**: `c:\Users\User\cre-dealcard\src\domain\building\gates\` (신규 생성 또는 기존 위치)
- **작업 내용**: 다음 5가지 하드 블로킹 룰 구현
  1. **G19**: 요약표의 보증금/임대료 총합이 상세 렌트롤(Ledger) 합산과 정확히 일치하는지 검증.
  2. **C19**: 대장 면적과 입력 면적 간 불일치(±2% 오차 허용치) 검증.
  3. **G21**: 첨부 문서/도면의 참조 위치 유효성 검증.
  4. **G15**: 텍스트 예산 및 필수 섹션 누락 검증.
  5. **G16**: 좌표 무결성 검증 (A16/A17 등의 엘리먼트 위치가 지정 바운더리를 초과하지 않는지).

### 2.2. 테스트 스위트 (Testing Suite) 구축
- **단위 테스트 (Unit Tests)**
  - **대상 경로**: `c:\Users\User\cre-dealcard\src\tests\unit\gates\`
  - **작업 내용**: `UT-01`부터 `UT-21`까지 21개의 불변성(Invariant) 검증 케이스를 작성하여 각 게이트 로직의 분기 및 엣지 케이스 테스트. (목표 커버리지: `financials/`, `gates/` 디렉토리 100%).

- **E2E 및 시각적 무결성 테스트**
  - **대상 경로**: `c:\Users\User\cre-dealcard\src\tests\e2e\`
  - **작업 내용**: 
    - 5대 E2E 시나리오 구성 (다양한 Posture 및 등급 조합).
    - PPTX 렌더링 결과물의 좌표 및 레이아웃을 검증하는 Visual Integrity Scan 로직 통합 (`pptx-renderer-e2e.test.ts` 등 활용).
    - LLM Assertion Rule을 통한 생성 텍스트 품질 검증 파이프라인 연동.

### 2.3. CI 파이프라인 통합
- Github Actions 또는 관련 CI 스크립트에 스키마-코드 일관성 체크(schema-code consistency) 추가.
- Gate 실패 시 빌드를 블락하는 strict mode 활성화.

---

## 3. 롤백 전략 (Rollback Strategy)
- **Phase 4**: `data-binder.ts`에서 IMCore 바인딩 로직에 치명적 결함 발생 시, 기존 `parseMarkdownTable` 기반의 레거시 파싱 로직으로 fallback 할 수 있도록 피처 플래그(Feature Flag) `USE_IMCORE_BINDING`를 도입합니다.
- **Phase 5**: 품질 게이트 적용 후 정상적인 문서까지 블락되는 False Positive가 발생할 경우, 각 게이트(G19, C19 등)의 블로킹 레벨을 `ERROR`에서 `WARN`으로 하향 조정할 수 있는 환경 변수(`GATE_STRICT_MODE=false`)를 마련합니다.
