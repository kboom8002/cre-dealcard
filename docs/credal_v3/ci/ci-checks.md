# ci/ci-checks.md — CI 검증 스크립트 스펙 v1.0

> 목적: 3개 SDD에 산재한 DO NOT(계 40종+) 중 기계 검증 가능한 항목을 CI 스크립트로 명세 — 리뷰 의존을 기계 강제로 이동. 전부 머지 게이트(fail=블록).

| # | 스크립트 | 검사 | 실패 메시지·수정 가이드 |
|---|----------|------|--------------------------|
| 1 | `check-ontology-sync` | YAML(enum·필드 ID) ↔ 생성된 Zod/상수 diff=0 | "YAML을 먼저 개정하세요 (SDD §0.1-2)" |
| 2 | `check-provenance-writes` | `assets.attrs` 쓰기 코드에 provenance 인자 누락 탐지 (AST) | "tier 미지정 쓰기 — provenance.ts 경유 필수" |
| 3 | `check-route-snapshot` | 공개 라우트(/dc·/im-lite·/vibe-card·/magazine/*) 스냅샷 불변 | "공개 URL 스킴 변경 금지 — 신규 경로로 추가" |
| 4 | `check-flag-registry` | 코드 내 `ff_*` 사용 ↔ SDD 플래그 목록·TASKS.md 등재 대조 | "미등재 플래그 — 소속 SDD §0.4에 추가" |
| 5 | `check-event-registry` | activity_events 타입 문자열 ↔ 통합 대장 대조 + 중복 명명 | "미등재/중복 이벤트" |
| 6 | `check-coord-leak` | TeaserView·RenderedIM(basic)·매거진 카드·agora 피드 직렬화 결과에 lat/lng·정밀 숫자 필드 타입 존재 여부 (타입 테스트 + 픽스처 페이로드 스캔) | "Basic 이하 좌표/정밀값 누출 — S3-T18/T8 정책 위반" |
| 7 | `check-mask-discipline` | 고객 대면 렌더 경로에서 LLM 출력 문자열에 수치 패턴 검출 시 [MASKED] 블록 외 여부 (S3 이후) | "마스크 밖 수치 — nlg-mask-engine 경유" |
| 8 | `check-n5-gate` | v_collective_insights 소비 코드의 자체 집계 SQL·N 재검증 로직 탐지 | "집합 통계는 뷰 단일 소스 (Stage4 §0-3)" |
| 9 | `check-copy-ids` | LC-* 문구 ID 참조 무결성 (copy-pack.md ↔ 코드) | "미정의 문구 ID" |
| 10 | `check-transition-fns` | deals·grants 상태 컬럼 직접 UPDATE 탐지 (전이 함수 외) | "명시적 전이 함수만 (deal-service)" |
| 11 | `check-shared-ownership` | 공용 모듈(Stage4 §3) 파일 변경 시 소유 트랙 리뷰어 자동 지정 (CODEOWNERS 생성 검증) | "소유 트랙 리뷰 필요" |
| 12 | `check-doc-versions` | SDD·스펙 헤더 버전 ↔ CHANGELOG 기재 대조 | "CHANGELOG 갱신 누락" |
| 13 | `check-ui-financials` | UI 컴포넌트(tsx) 내 인라인 재무 산식 패턴 탐지(`*12`·`/100`·capRate 계산식 등) — financials.ts 호출 외 금지 (v1.3·D5) | "UI 내 재무 산식 — financials 단일 소스 위반 (S0-T12)" |

**운영**: 1~6·10은 즉시 구축(Stage 0~1과 병행), 7~8은 해당 기능 플래그 활성 시 활성화, 11~12는 저비용 상시. 스크립트는 `scripts/ci/` 배치, 각각 단독 실행 가능(`--fix` 미제공 — 수정은 사람/에이전트가 가이드 따라).
