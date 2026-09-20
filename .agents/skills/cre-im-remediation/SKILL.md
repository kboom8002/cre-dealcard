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
| `pptx-renderer.ts` | PPTX 렌더링 + ReleaseTier 전달 |
| `deck-sequencer.ts` | 면 편성 + 절삭 |
| `text-budget.ts` | 텍스트 버짓 + 괄호 균형 |
| `terminology-normalizer.ts` | CRE 용어 정규화 |
| `guardrails.ts` | 리스크 표현·PII·마스킹 |
| `data-binder.ts` | 데이터→슬라이드 바인딩 (SECTION_TYPE_TO_DATA_KEY) |
| `im-section-generator.ts` | 섹션별 마크다운 생성 |
| `im-core/` | 순수 도메인 로직 (9모듈) |

## im-core 모듈 (D37 추가)

| 모듈 | 핵심 export |
|---|---|
| `claim-registry.ts` | `ClaimRegistry`, `Claim`, `EvidenceRef` |
| `display-label.ts` | `DISPLAY_LABEL_MAP`, `getDisplayLabel()` |
| `release-tier.ts` | `ReleaseTier`, `resolveTier()` |
| `approval-gate.ts` | `runApprovalGate()`, `ApprovalGateResult` |
| `korean-legal.ts` | `KoreanLegalFields`, `registerKoreanLegalClaims()` |
| `action-card.ts` | `ActionCard`, `Scenario`, `ScenarioType` |
| `lease-calc.ts` | 환산보증금, 상임법 보호 판정 |
| `permit-zone.ts` | 토지거래허가구역 판정 |
| `financial-calc.ts` | FinancialCalculator |

## MobileIMSectionType 확장 체크리스트

새 섹션을 추가할 때 반드시 확인:
```
□ types.ts MOBILE_IM_SECTIONS 배열
□ section-alias-resolver.ts SECTION_ALIAS_MAP
□ section-alias-resolver.ts displayNames
□ premium-template-engine.ts getSectionTitle()
□ data-binder.ts SECTION_TYPE_TO_DATA_KEY
□ data-binder.ts DATA_KEY_ARCHETYPE (선택)
```

## 병렬 버그 감사 워크플로우 (D41 추가)

기능 구현 계획 수립 과정에서 파이프라인 버그를 체계적으로 발견·검증하는 방법:

### Phase 1: 의심 항목 도출
- 구현 계획을 세우면서 코드베이스를 분석할 때 **의심 패턴**을 목록화
- 각 의심 항목에 대해: 파일, 라인, 구체적 질문(What happens when X?) 명시
- 심각도 예측: Critical / High / Medium / Low

### Phase 2: 병렬 서브에이전트 검증
- 6건씩 분할하여 2개 `research` 서브에이전트에 위임
- 각 서브에이전트에게 정확한 파일·라인과 검증 질문을 제공
- 코드 스니펫 + 정확한 동작 분석 결과를 요구

### Phase 3: 종합 감사 보고서
- 확인된 버그를 심각도별 정렬 (Critical → High → Medium → Low)
- 각 버그: 근본 원인, 재현 조건, 권고 수정, 검증 테스트
- 3-Wave 수정 로드맵 (즉시 / 긴급 / 개선)

### Phase 4: 배치 수정
- Wave별 수정 → tsc → build → commit → push
- 신규 타입 에러 0건 기준 → 기존 테스트 에러와 분리 필터링

## 테스트 계층

| 계층 | 파일 | 무엇을 단언하는가 |
|---|---|---|
| L2 | `l2-gate-judgments.test.ts` | 게이트 판정 (T2-GATE-01 포함) |
| L3 | `l3-composition.test.ts` | 면 편성·시퀀스 |
| L4 | `l4-output-assertions-d34.test.ts` | **산출물 게이트 결과** |
| P0 | `p0-tier-grade-gate.test.ts` | 등급·포스처 분기 |

## 참고 문서

- [01_FULL_PIPELINE_ARCHITECTURE.md](../../../docs/impipe/01_FULL_PIPELINE_ARCHITECTURE.md) — 풀 파이프라인 v6
- [SSOT YAML 14개](../../../credeal/ssot/) — 단일 진실 원천
- [AGENTS.md §5~§16](../AGENTS.md) — D33/D34/D37 규칙

