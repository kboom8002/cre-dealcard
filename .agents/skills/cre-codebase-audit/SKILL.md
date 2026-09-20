---
name: cre-codebase-audit
description: >-
  MECE 기반 코드베이스 정밀 감사 및 병렬 Wave 수정 워크플로우.
  사용자가 '감사', 'audit', '코드 품질 점검', '전면 정비', '코드베이스 감사' 등을 요청할 때 사용합니다.
---

# CRE 코드베이스 정밀 감사 워크플로우

> D45 세션(2026-09-20)에서 183건 이슈를 19분만에 5-Wave로 처리한 경험 기반.

## Phase 1: MECE 감사 (연구 전용 — 코드 수정 금지)

### 1.1 병렬 감사 서브에이전트 발사 (3~4개)
각 서브에이전트는 `research` 타입으로 발사하여 읽기 전용 탐색만 수행합니다.

| 서브에이전트 | 스캔 대상 | grep 패턴 예시 |
|------------|----------|--------------|
| **데이터 독소** | binder, archetypes | 하드코딩 가격/날짜/임차인/비율/설명 |
| **레이아웃/크래시** | archetypes | 캔버스 오버플로우, null 가드 누락, throw |
| **API/보안** | api routes, external | err.message 노출, try/catch 부재, 레이트리밋 |
| **테스트 품질** | tests | 삼킨 실패, 무단언 PASS, 잘못된 프리셋 |

### 1.2 결과 분류
- P0 CRITICAL → P1 HIGH → P2 MEDIUM → P3 LOW
- `implementation_plan.md` 아티팩트에 MECE 매트릭스로 정리
- **사용자 승인 대기** (request_feedback=true)

## Phase 2: Wave 실행 (사용자 승인 후)

### 2.1 Wave 분할 원칙
- **Wave 단위**: P0 → P1 → P2 → P3 순서
- **서브에이전트 분할**: 파일 충돌 방지를 위해 같은 파일은 같은 서브에이전트에 할당
- **서브에이전트당 파일 3개 이내** 권장

### 2.2 각 Wave 실행 절차
```
1. define_subagent (phase1-fixer) 또는 기존 타입 사용
2. invoke_subagent: 2~3개 병렬 발사
3. 결과 수집 (모든 서브에이전트 완료 대기)
4. kill_all → npm run build 검증
5. 빌드 에러 시 직접 수정 (서브에이전트 재발사 금지)
6. 빌드 통과 → 다음 Wave
```

### 2.3 빌드 에러 핫픽스 패턴
| 에러 유형 | 대응 |
|----------|------|
| 참조 누락 (리네임) | `grep_search`로 잔존 참조 찾아 직접 수정 |
| PromiseLike `.catch()` | `.then(ok, err)` 패턴으로 교체 |
| 타입 불일치 | `as any` 캐스트 또는 타입 가드 추가 |

## Phase 3: 완료 검증

1. `npm run build` Exit 0 확인
2. `task.md` 체크리스트 전체 `[x]` 표시
3. `walkthrough.md` 최종 업데이트
4. 변경 파일 목록 + 수정 내용 요약

## 핵심 원칙

- ❌ 연구 단계에서 코드 수정 금지
- ❌ 빌드 실패 상태에서 다음 Wave 진행 금지
- ❌ 동일 파일을 서로 다른 서브에이전트에 할당 금지
- ✅ 상수 리네임 후 전체 grep 검증 (Rule 11)
- ✅ 폴백값은 중립적 값만 허용 (Rule 41)
- ✅ 매 Wave 빌드 검증 필수
