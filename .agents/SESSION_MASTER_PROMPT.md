# CRE IM 파이프라인 — 세션 마스터 프롬프트 (D33~D44 경험 기반)

> **용도**: 새 세션에서 IM 파이프라인 고도화 작업을 이어받을 때, 이 파일을 첫 메시지에 첨부합니다.
> **마지막 갱신**: 2026-08-28 · 커밋 `0d82275`

---

## 1. 프로젝트 개요

**CRE DealCard** — 한국 상업용 부동산(CRE) 중개인을 위한 SaaS 플랫폼.
핵심 기능은 **투자설명서(IM) 자동 생성 파이프라인**:

```
브로커 입력(메모/음성) → LLM 섹션 생성 → 품질 게이트 → PPTX 렌더링 → 모바일 뷰어
```

기술 스택: Next.js (App Router) · TypeScript · Supabase · Vercel · PptxGenJS

---

## 2. 아키텍처 핵심 — 3계층

```
[프론트엔드] → [도메인 로직] → [외부 서비스]
     ↓              ↓
  뷰어/편집기    im-core (순수 TS, React 의존 없음)
  승인API        mobile-im (writer → section-generator → pptx/)
  PPTX 편집기    quality-gates-v02.ts (45개 게이트)
```

### im-core 도메인 계층 (13모듈)
순수 TypeScript. React/Next.js/Supabase 의존 금지.

| 모듈 | 역할 |
|---|---|
| `claim.ts` + `claim-registry.ts` | Claim 6상태 + Conflict 9종 |
| `calculation.ts` + `financial-calculator.ts` | 재무 계산 + violations 게이트 |
| `release-tier.ts` | 5종 발행 등급 |
| `display-label.ts` | 8종 ProvenanceKind 뱃지 |
| `approval-gate.ts` | 승인 전 검증 |
| `korean-legal.ts` | 한국법 특수 필드 (v3: 권리금+VAT) |
| `lease-calc.ts` | 환산보증금 계산 |
| `permit-zone.ts` | 토지이용계획 |
| `action-card.ts` | 투자자 행동 카드 |
| `data-availability.ts` | 데이터 가용성 플래그 |

### PPTX 렌더링 파이프라인

```
stage-plans.ts → deck-sequencer.ts → pptx-renderer.ts → data-binder.ts
                                           ↓
                                     layout-validator.ts
                                     pptx-parser.ts (바이너리 감사)
                                     extract-gate-context.ts
```

### 핵심 상수/설정

| 상수 | 값 | 위치 |
|---|---|---|
| `PAGE_HARD_LIMIT` | 16 (본문만, 부록 제외) | deck-sequencer.ts |
| `PAGE_RECOMMENDED` | 12 | deck-sequencer.ts |
| `SAFE_W / SAFE_H` | 12.093" / 6.26" | layout-validator.ts |
| `MARGIN` | 0.62" | layout-validator.ts |
| Stage 구조 | 전 포스처 3-Stage | stage-plans.ts |

---

## 3. 완료된 지시서 (D33~D44)

| 지시서 | 내용 | 커밋 범위 |
|---|---|---|
| D33 | 27항목 기본 품질 | 이전 세션 |
| D34 | 테스트 재편 | 이전 세션 |
| D37 | 프론트엔드 감사 23건 + im-core 16규칙 | `2ab77c9`~`ed30cbb` |
| D38 | V6 위험 감사 12종 | docs 기록 |
| D39 | im-core 완전성 감사 5종 | docs 기록 |
| D40 | 골든 IM 선결 조건 | docs 기록 |
| D41 | V6 통합 작업 (W1~W4, S1~S9) | `49c7ede`~`a69614a` |
| D44 | 방법론 적용 (PR 템플릿, CI, 자가진단) | `0d82275` |

---

## 4. 현재 상태 — 무엇이 되어 있고 무엇이 남았나

### ✅ 완료

- 품질 게이트 60종 YAML 등재 (`im.errors.yaml`)
- 배선 대조 도구 (`wiring-check.ts`) + 테스트 3/3
- im-core → PPTX 연결 (`data-binder.ts` bindFromClaimRegistry)
- NumericalAnchors 이중화 해소 (CrossValidatorAnchors)
- PptxTier 전수 제거
- 골든 IM 인프라 (스크립트 + QA, 콘텐츠 미생성)
- PR 템플릿 + 자가진단 (`qa/adoption_check.py` → 4/6 채택)
- PPTX 바이너리 파서 (`pptx-parser.ts`)

### 🟡 인프라만 준비, 실행 필요

- **골든 IM 실제 생성**: 풀 파이프라인 실행 → 전문가 검수 → 커밋
- **CI 워크플로**: `.github/workflows/harness.yml` 로컬에 있지만 PAT workflow scope 필요
- **cycles/ 계기판**: 야간 자동 실행 미설치 (R3 미충족)
- **음성 대조군**: tests/corpus/ 미등록 (R1: 게이트 51종 중 39종 짝 없음)

### 🔴 미착수

- **D43**: 근생 수익형 9주 E2E 계획 (D44와 3주차부터 접점)
- **S3-2/S3-4**: 폴백 제거 잔여 (im-section-generator 내부)
- **E2E 실제 실행**: 양평동 등 실물건 풀 파이프라인 렌더 테스트

---

## 5. 🔴 하지 말 것 (6판의 교훈)

1. **면수를 20으로 올려 해결하지 마십시오** — 부록으로 분리
2. **폴백을 개선하지 말고 제거하십시오**
3. **gateCtx에 상수를 넣지 마십시오**
4. **골든을 손수정하지 마십시오** — 렌더러가 생성
5. **골든 깨졌을 때 골든을 갱신하지 마십시오** — 정본을 고치십시오
6. **검사기를 느슨하게 하지 마십시오** — 설계를 고치십시오
7. **게이트를 추가하지 마십시오** (기존 60종으로 충분)
8. **모바일 IM만 보고 완료 판정하지 마십시오** — PPTX가 정본
9. **Kill 120→300초로 올리지 마십시오** — Stage 수를 줄이십시오
10. **허용오차로 정당화하지 마십시오** — 오차 0이 원칙

---

## 6. 환경 주의사항 (Windows)

| 항목 | 주의 |
|---|---|
| PowerShell | `&&` 안 됨, `;` 사용. `tail` 없음 |
| `git push` | exit code 1이지만 stderr에 `main -> main` → 실제 성공 |
| `npm run build` | Turbopack 25~30초, 중복 실행 시 에러 |
| Python 출력 | cp949 인코딩 문제 → `$env:PYTHONIOENCODING='utf-8'` |
| GitHub PAT | workflow scope 없으면 `.github/workflows/` 푸시 불가 |

---

## 7. 사용자 커뮤니케이션 패턴

| 사용자 말 | 의미 |
|---|---|
| "다음" | 현재 작업 승인 + 다음 단계 실행 |
| "진행" | 제안 승인 + 즉시 실행 |
| 지시서 전문 붙여넣기 | 해당 지시서의 구현을 요청 |
| "~하지 않나?" | 기존 설계에 대한 교정/의문 → 동의하고 반영할 것 |

---

## 8. 작업 방법론 (D42/D44)

### PR 5칸 (R1~R6)
1. 이 PR이 답하는 질문 하나 (참/거짓)
2. Negative 짝 추가 여부 (케이스 ID)
3. 값을 어디에 적었는가 (코드 리터럴 0)
4. 실패 출구를 늘렸는가 (폴백/허용오차/warn 강등)
5. 완료 증명 (도구 출력)
6. +검사기 변경 사유

### 핵심 패러다임
```
현행: LLM이 쓰고 렌더러가 그림
목표: 사람이 승인 → 엔진이 계산 → LLM이 설명
```

---

## 9. 주요 파일 인덱스

### 도메인 로직
| 파일 | 역할 |
|---|---|
| `src/domain/building/mobile-im/writer.ts` | IM 생성 메인 (generateMobileIM) |
| `src/domain/building/mobile-im/im-section-generator.ts` | LLM 섹션 생성 |
| `src/domain/building/mobile-im/im-context-builder.ts` | 컨텍스트 전처리 |
| `src/domain/building/mobile-im/cross-validator.ts` | 섹션 간 교차 검증 |
| `src/domain/building/mobile-im/numerical-anchors.ts` | 수치 앵커 (충돌 감지) |
| `src/domain/building/mobile-im/stage-plans.ts` | 3-Stage 파이프라인 구조 |
| `src/domain/building/mobile-im/quality-gates-v02.ts` | 45개 PUBLISH_GATES |
| `src/domain/building/im-core/` | 13개 순수 도메인 모듈 |

### PPTX 렌더링
| 파일 | 역할 |
|---|---|
| `src/domain/building/mobile-im/pptx/pptx-renderer.ts` | PPTX 렌더러 (MobileImPptxRenderer) |
| `src/domain/building/mobile-im/pptx/data-binder.ts` | 데이터 바인딩 |
| `src/domain/building/mobile-im/pptx/deck-sequencer.ts` | 면 구성 알고리즘 |
| `src/domain/building/mobile-im/pptx/layout-validator.ts` | Safe 영역 검증 |
| `src/domain/building/mobile-im/pptx/pptx-parser.ts` | PPTX 바이너리 파서 |
| `src/domain/building/mobile-im/pptx/extract-gate-context.ts` | 게이트 컨텍스트 추출 |

### 설정/테스트
| 파일 | 역할 |
|---|---|
| `credeal/ssot/im.errors.yaml` | 품질 게이트 60종 SSOT |
| `scripts/wiring-check.ts` | YAML↔코드 대조 |
| `scripts/generate-golden-im.ts` | 골든 IM 생성 (SCAFFOLD) |
| `scripts/qa-golden-verify.ts` | 골든 QA 검증 |
| `qa/adoption_check.py` | D42 6규율 자가진단 |
| `.github/pull_request_template.md` | PR 5칸 |

### 문서
| 파일 | 역할 |
|---|---|
| `.agents/AGENTS.md` | 에이전트 규칙 §1~§16 |
| `docs/impipe/01_FULL_PIPELINE_ARCHITECTURE.md` | 파이프라인 아키텍처 |
| `docs/impipe/04_MODEL_GOLDEN_IM_REQUIREMENTS.md` | 골든 IM 요구사항 v3 |
| `docs/impipe/09_GOLDEN_IM_DATA_REQUIREMENTS.md` | 골든 데이터 요구사항 |
| `docs/impipe/IM_V6_CONSOLIDATED_ORDER.md` | D41 원문 |
