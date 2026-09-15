<!-- BEGIN:cre-d37-rules -->
# CRE IM D37 고도화 규칙 (2026-08-28)

### 11. MobileIMSectionType 확장 시 연쇄 수정 (Section Extension Cascade)
- `types.ts` 배열에 새 섹션을 추가하면 **반드시 3곳을 동시에 수정**합니다:
  1. `section-alias-resolver.ts` → `SECTION_ALIAS_MAP` (alias 배열)
  2. `section-alias-resolver.ts` → `displayNames` (한국어 대표명)
  3. `premium-template-engine.ts` → `getSectionTitle()` (Record 매핑)
- 이 3곳은 `Record<MobileIMSectionType, ...>` 타입이므로 누락 시 빌드 에러가 발생합니다.

### 12. im-core 도메인 계층 의존 방향 (Domain Layer Direction)
- im-core는 **순수 도메인 로직**이며 React/Next.js/Supabase에 의존하지 않습니다.
- 프론트엔드 → im-core (O), im-core → 프론트엔드 (X)
- 모듈 목록: `claim-registry`, `financial-calc`, `display-label`, `release-tier`, `approval-gate`, `korean-legal`, `action-card`, `lease-calc`, `permit-zone`

### 13. ReleaseTier 5종 전구간 연결 (Full-Chain Tier Binding)
- `resolveTier()` 결과는 **handler → DB body → PPTX renderer → 뷰어 UI** 전구간에서 일관되게 전달합니다.
- 5종: `internal_only`, `fact_om`, `analysis_im`, `decision_im`, `expert_required`
- 레거시 `basic|pro` → D37 5종 변환 시 `analysis_im/decision_im → pro`, 나머지 → `basic`

### 14. displayLabel 8종 DISPLAY_LABEL_MAP 사용 (No Hardcoded Provenance)
- 프로베넌스 뱃지를 렌더링할 때 **반드시 `DISPLAY_LABEL_MAP`에서 참조**합니다.
- 하드코딩된 source 문자열(`public_data`, `broker_input` 등)을 직접 비교하지 않습니다.
- 레거시 source → ProvenanceKind 변환 매핑을 사용합니다.

### 15. ApprovalGate 우회 금지 (No Gate Bypass)
- `approve/route.ts`에서 문서 상태를 `published`로 전환하기 전에 반드시 `runApprovalGate()`를 호출합니다.
- `passed === false`이면 422 응답과 함께 `blockers` 목록을 반환합니다.
- 프로퍼티 이름: `passed` (NOT `approved`)

### 16. 프론트엔드-도메인 정합성 감사 (Frontend-Domain Audit)
- im-core에 새 모듈을 추가하면 프론트엔드(뷰어/편집기/승인API/PPTX) 연동 여부를 확인합니다.
- 연결 매트릭스: writer → handler → DB → viewer → editor → approvalAPI → PPTX
<!-- END:cre-d37-rules -->