---
name: cre-im-remediation
description: >-
  CRE IM 파이프라인의 결함 수정(remediation) 워크플로우.
  사용자가 PPTX IM 위반 건수 감소, 게이트 추가, 렌더 결함 수정,
  테스트 재편을 요청할 때 이 스킬을 사용합니다.
  D33/D34 지시서 패턴으로 체계적 수정을 수행합니다.
---

# CRE IM 파이프라인 결함 수정 워크플로우

## 언제 사용하는가

- PPTX IM 산출물에서 위반 건수를 줄여야 할 때
- 새 품질 게이트(G-series)를 추가해야 할 때
- 기존 테스트가 산출물 결함을 놓쳤을 때
- 렌더 엔진의 지면 물리(레이아웃) 결함을 수정할 때

## 핵심 원칙 (D33/D34 교훈)

1. **산출물이 최종 권위** — 함수가 옳다는 것과 산출물이 옳다는 것은 다릅니다
2. **게이트 선언-구현-등록 3단 일치** — 구현만 하고 `PUBLISH_GATES`에 등록하지 않으면 무의미
3. **negative 짝 없는 케이스 금지** — 대조군에서 실패해야 통과가 의미를 가집니다
4. **임계값 리터럴 금지** — `credeal/ssot/*.yaml`에서 읽습니다
5. **문장 단언 금지** — 구조·수치·게이트만 단언합니다

## 수정 워크플로우

### Step 1: 위반 분류 (BL/M/S)

위반을 세 범주로 분류합니다:

- **BL (Blocker)**: 게이트가 없거나 미연결 → 잘못된 산출물이 통과
- **M (Medium)**: 용어·중복·마스킹 등 품질 저하
- **S (Spec)**: 문서·스펙 갱신 필요

### Step 2: 게이트 추가 절차

새 게이트를 추가할 때는 반드시 3곳을 동시에 수정합니다:

```
1. 구현 파일 (cross-validator.ts, pptx-renderer.ts 등)
   → 검사 로직 작성

2. quality-gates-v02.ts
   → GateContext 인터페이스에 필드 추가
   → PUBLISH_GATES 배열에 GateDefinition 추가

3. l4-output-assertions-d34.test.ts (또는 l2-gate-judgments.test.ts)
   → positive + negative 짝 테스트 추가
```

### Step 3: deck-sequencer 수정 시 주의

- `buildDeckSequence()`의 면 추가는 **항상 `dataAvailability` 가드** 확인
- 예: `if (input.dataAvailability?.hasRentRoll !== false) sequence.push(...)`
- 면수 상한은 **16면** (`PAGE_HARD_LIMIT`)

### Step 4: 검증

```bash
# 1. 타입 체크 + 빌드
npm run build

# 2. 관련 테스트
npx vitest run src/domain/building/mobile-im/__tests__/
npx vitest run src/tests/e2e/p0-tier-grade-gate.test.ts

# 3. 커밋 + 배포
git add -A && git commit -m "..." && git push origin main
```

## 코드 맵

| 파일 | 역할 |
|---|---|
| `quality-gates-v02.ts` | 게이트 레지스트리 (PUBLISH_GATES + GateContext) |
| `cross-validator.ts` | 교차 검증 (서술어↔수치 모순 등) |
| `pptx-renderer.ts` | PPTX 렌더링 + 폴백 추적 |
| `deck-sequencer.ts` | 면 편성 + 절삭 |
| `text-budget.ts` | 텍스트 버짓 + 괄호 균형 |
| `terminology-normalizer.ts` | CRE 용어 정규화 |
| `guardrails.ts` | 리스크 표현·PII·마스킹 |
| `data-binder.ts` | 데이터→슬라이드 바인딩 |
| `im-section-generator.ts` | 섹션별 마크다운 생성 |

## 테스트 계층

| 계층 | 파일 | 무엇을 단언하는가 |
|---|---|---|
| L2 | `l2-gate-judgments.test.ts` | 게이트 판정 (T2-GATE-01 포함) |
| L3 | `l3-composition.test.ts` | 면 편성·시퀀스 |
| L4 | `l4-output-assertions-d34.test.ts` | **산출물 게이트 결과** |
| P0 | `p0-tier-grade-gate.test.ts` | 등급·포스처 분기 |

## 참고 문서

- [04_MODEL_GOLDEN_IM_REQUIREMENTS.md](../../../docs/impipe/04_MODEL_GOLDEN_IM_REQUIREMENTS.md) — SSOT/대조군/골든 IM 요구서
- [SSOT YAML 14개](../../../credeal/ssot/) — 단일 진실 원천
- [expected.json](../../../tests/corpus/expected.json) — 대조군 기대 위반
