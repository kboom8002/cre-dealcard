---
name: cre-frontend-audit
description: >-
  CRE IM 파이프라인의 프론트엔드-도메인 정합성 감사(audit) 워크플로우.
  im-core 도메인 계층의 모듈이 프론트엔드 UI에 올바르게 연동되었는지
  검증할 때 이 스킬을 사용합니다. D37 감사 경험에 기반합니다.
---

# CRE 프론트엔드-도메인 정합성 감사 워크플로우

## 언제 사용하는가

- im-core에 새 도메인 모듈을 추가한 후 UI 연동 확인이 필요할 때
- 대규모 고도화 후 프론트엔드와 백엔드 간 정합성을 점검할 때
- PPTX 렌더러/뷰어/편집기/승인 API의 데이터 흐름을 감사할 때

## 감사 범위

### 1. 연결 매트릭스 (7-Column Check)
각 im-core 모듈이 아래 7개 접점에서 올바르게 연결되었는지 확인합니다:

| # | 접점 | 파일 위치 |
|---|---|---|
| 1 | writer.ts (LLM 작성) | `mobile-im/im-section-generator.ts` |
| 2 | handler (API 생성) | `api/broker/im-lite/generate/handler.ts` |
| 3 | DB body (영속화) | Supabase `document_objects.body` |
| 4 | viewer (공개 뷰어) | `im-lite/[buildingId]/mobile-im-viewer.tsx` |
| 5 | editor (편집기) | `im-data-bottom-sheet.tsx`, `im-editor.tsx` |
| 6 | approval API | `api/broker/im-lite/[id]/approve/route.ts` |
| 7 | PPTX renderer | `pptx/pptx-renderer.ts` + `data-binder.ts` |

### 2. 유형별 체크포인트

#### MobileIMSectionType 확장 시
```
□ types.ts 배열에 추가
□ section-alias-resolver.ts SECTION_ALIAS_MAP
□ section-alias-resolver.ts displayNames
□ premium-template-engine.ts getSectionTitle()
□ data-binder.ts SECTION_TYPE_TO_DATA_KEY
□ data-binder.ts DATA_KEY_ARCHETYPE
```

#### ReleaseTier 연동 시
```
□ handler.ts에서 resolveTier() 호출
□ DB body에 releaseTier 영속화
□ pptx-renderer.ts sequenceInput.releaseTier 전달
□ im-management-panel.tsx 뱃지 표시
□ im-data-bottom-sheet.tsx targetTier 수용
```

#### displayLabel 연동 시
```
□ import { DISPLAY_LABEL_MAP } from '@/domain/building/im-core'
□ 레거시 source→ProvenanceKind 변환 매핑
□ trustWeight 기반 색상 차등
□ 하드코딩 문자열 제거 확인
```

#### ApprovalGate 연동 시
```
□ runApprovalGate(registry, tier) 호출
□ passed === false → 422 응답
□ blockers 배열 반환
□ 프로퍼티: passed (NOT approved)
```

## 감사 절차

### Step 1: 병렬 조사 (7 에이전트)
연구 에이전트를 7개 병렬 실행하여 각 접점을 조사합니다:
1. PPTX 렌더러/아키타입
2. IM 뷰어/승인/Studio/API
3. React 컴포넌트 (뱃지/뷰어)
4. 타입 정합성
5. 정보 수집 UI (바텀시트)
6. 생성 옵션/프로필
7. 뷰어 인터랙션/작성 지원

### Step 2: 결함 분류 (5등급)
- 🔴 **Critical**: 런타임 버그, 타입 불일치
- 🟠 **High**: 데이터 미연동, 게이트 우회
- 🟡 **Medium**: 신규 컴포넌트 부재
- ⚪ **Low**: UX 개선, 점진 확장
- ⬜ **Deferred**: 설계 미완, 의도적 보류

### Step 3: 시정 (우선순위 순)
Critical → High → Medium → Low 순서로 수정합니다.

### Step 4: 검증
```bash
# 타입 체크 + 빌드
npm run build

# 테스트
npx vitest run src/domain/building/mobile-im/__tests__/

# 커밋 + 배포
git add -A; git commit -m "fix(audit): ..."; git push origin main
```

## 코드 맵 (D37 기준)

| 파일 | 역할 |
|---|---|
| `im-core/index.ts` | 도메인 모듈 re-export (9모듈) |
| `im-core/claim-registry.ts` | Claim 등록/조회 |
| `im-core/display-label.ts` | 8종 프로베넌스 뱃지 |
| `im-core/release-tier.ts` | 5종 발행 등급 판정 |
| `im-core/approval-gate.ts` | 승인 게이트 검증 |
| `im-core/korean-legal.ts` | 한국법 12종 필드 |
| `im-core/action-card.ts` | Value-Add 3시나리오 |
| `im-core/lease-calc.ts` | 환산보증금/상임법 |
| `im-core/permit-zone.ts` | 토지거래허가구역 |
| `components/im/action-card-view.tsx` | 시나리오 렌더링 |
| `components/im/gate-report-view.tsx` | 게이트 결과 UI |
| `components/teaser/RegulationScreening.tsx` | 규제 스크리닝 |

## 참고 문서

- [01_FULL_PIPELINE_ARCHITECTURE.md](../../../docs/impipe/01_FULL_PIPELINE_ARCHITECTURE.md)
- [AGENTS.md §11~§16](../AGENTS.md) — D37 규칙
