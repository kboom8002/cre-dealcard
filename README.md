# CREDEAL v3 — CRE 딜카드 코파일럿

## Product

**Public name:** 이 건물, 딜 될까?  
**Broker name:** JS 1분 딜카드  
**System name:** CREDEAL v3

대한민국 소형 빌딩(50억~300억) 상업용 부동산 중개인을 위한 **모바일 퍼스트 AI 딜카드 코파일럿**.

최소 입력(주소, 필지, 카카오 중개 메모)으로부터 구조화된 매물 정보를 생성하고, 딜 파이프라인 전 단계를 지능적으로 지원합니다.

---

## 아키텍처 (4-Layer)

```
┌─────────────────────────────────────────────┐
│  L4  Surfaces                               │
│  UI · Mobile IM · Magazine · Teaser Viewer  │
├─────────────────────────────────────────────┤
│  L3  Services                               │
│  NLG Mask · IM Renderer · Pitch · Matching  │
├─────────────────────────────────────────────┤
│  L2  Tacit Knowledge                        │
│  1-Tap Tags · Edit Diff · OCR Confirm       │
├─────────────────────────────────────────────┤
│  L1  Data Foundation                        │
│  Ontology · Provenance · Financials · Grade │
└─────────────────────────────────────────────┘
```

---

## 핵심 도메인 모듈

모든 v3 핵심 로직은 `src/domain/building/` 에 집중됩니다:

| 모듈 | 역할 | Stage | SDD 참조 |
|------|------|-------|----------|
| `financials.ts` | NOI·Cap Rate·실투자금 중앙 계산 | S0 | S0-T1/T2 |
| `guardrails.ts` | 공인중개사법 준수 법적 가드레일 | S0 | S0-T5/T8 |
| `grade-engine.ts` | 자산 데이터 등급(A~D) 평가 | S1 | S1-T7 |
| `constraint-validator.ts` | SHACL 제약조건 C01~C12 검증 | S0 | S0-T4 |
| `archetype-classifier.ts` | 딜 아키타입 10종 분류 | S1 | S1-T9 |
| `ocr-parser.ts` | 등기부/건축물대장 OCR 파싱 | S2 | S2-T1/T2 |
| `tacit-label-service.ts` | 1-탭 중개 암묵지 태깅 | S2 | S2-T5 |
| `edit-diff-collector.ts` | IM 편집 Diff 수집 (프롬프트 교정용) | S2 | S2-T6 |
| `nlg-mask-engine.ts` | NLG 마스크 (LLM 환각 방지) | S3 | S3-T1 |
| `im-render-policy.ts` | Basic/Pro IM 정보 노출 정책 | S3 | S3-T4 |
| `map-tier.ts` | 좌표 퍼지 오프셋 (~150m) | S3 | S3-T18 |
| `photo-classifier.ts` | 사진 자동 분류 + 프라이버시 가드 | S3 | S3-T10 |
| `layer-score-engine.ts` | 문서 완비 점수 + 산출물 적격성 | S1 | S1-T7 |

---

## 핵심 설계 원칙

| # | 원칙 | 위반 시 |
|---|------|---------|
| 1 | **재무 중앙화** — 모든 재무 계산은 `financials.ts` 경유 | CI 차단 (`check-ui-financials`) |
| 2 | **프로비넌스 4-Tier** — 모든 `attrs` 기록에 출처 추적 필수 | 데이터 무결성 위반 |
| 3 | **Rule #11** — OCR 추출 결과는 반드시 사용자 확인 화면 거침 | 자동 저장 금지 |
| 4 | **NLG 마스크** — LLM은 결정론적 마스크 통해서만 재무 수치 출력 | 환각 방지 |
| 5 | **K-익명성** — 강남/서초/성동 K=30, 기타 K=20 | 재식별 차단 |

---

## Quick Start

### 1. 환경 설정

```bash
cp .env.example .env.local
# 필수 환경 변수:
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# OPENAI_API_KEY=your-openai-key
```

### 2. 데이터베이스

```bash
# Supabase SQL Editor에서 마이그레이션 순서대로 실행:
# supabase/migrations/00001_mvp_schema.sql    (MVP 기본)
# supabase/migrations/0100_assumptions.sql     (Stage 0)
# supabase/migrations/0110_ontology_schema.sql (Stage 1)
# supabase/migrations/0120_tacit_labels.sql    (Stage 2)
# supabase/migrations/0121_edit_diffs.sql      (Stage 2)
# supabase/migrations/0130_im_tiering.sql      (Stage 3)
```

### 3. 실행

```bash
npm install
npm run dev           # http://localhost:3000
npm run typecheck     # TypeScript 타입 체크
npm run lint          # ESLint 검사
npm run test          # Vitest — 341개 테스트
```

---

## 테스트 스위트

```bash
npx vitest run        # 전체 실행 (47개 파일, 341개 테스트)
```

### Stage별 테스트 커버리지

| Stage | 테스트 파일 수 | 주요 커버리지 |
|-------|---------------|---------------|
| S0 | 12 | 재무 계산, 프로비넌스, RAG 위생, 법적 가드레일, CI 체크 |
| S1 | 8 | 온톨로지 스키마, 등급 엔진, 제약 검증, 아키타입 분류 |
| S2 | 7 | OCR 파서, 암묵지 태깅, 편집 Diff |
| S3 | 12 | NLG 마스크, IM 티어링, 워터마크, K-익명성, 매칭 |
| S4+ | 8 | 사진 분류, Give-to-Get, P2P 공동중개 |

---

## CI Check Suite

```bash
npx tsx scripts/ci/run-all-checks.ts    # 13개 CI 검사 일괄 실행
```

| # | 검사 | 설명 |
|---|------|------|
| 1 | `check-ui-financials` | UI 컴포넌트 내 직접 재무 계산 차단 |
| 2 | `provenance-guard` | attrs 기록 시 provenance 필수 동반 확인 |
| 3 | `rag-hygiene` | RAG 인덱싱 위생 검사 |
| 4 | `cold-mode-guard` | Cold 모드 가격 의견 차단 |
| 5 | `nlg-mask-check` | NLG 마스크 바이패스 차단 |
| 6 | `disclosure-escape` | 정보 공개 정책 위반 탐지 |
| 7 | `ocr-confirm-check` | OCR Rule #11 자동저장 차단 |
| 8~13 | 기타 | K-익명성, 좌표 퍼지, 워터마크 등 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Database | Supabase Postgres + RLS |
| AI | OpenAI (structured outputs via Zod) |
| Testing | Vitest |
| Schema Validation | Zod v4 |
| Ontology | YAML (credeal-ontology-v0.1) |

---

## Disclosure Policy (정보 공개 정책)

| Field | Public | Basic IM | Pro IM (NDA) |
|---|---|---|---|
| area_signal (권역) | ✅ | ✅ | ✅ |
| price_band (가격대) | ✅ (밴드) | ✅ | ✅ (정확) |
| exact_address | ❌ | ❌ | ✅ |
| tenant_name | ❌ | ❌ | ✅ |
| unit_rent | ❌ | ❌ | ✅ |
| seller_motivation | ❌ | ❌ | ❌ (internal) |
| map_coordinates | ❌ | ⚡ (~150m 퍼지) | ✅ (정확) |

**목표: Disclosure violation escape count = 0**

---

## Demo Paths

### Demo A — Public "이 건물, 딜 될까?"

```
URL: /building-radar
Input: 서울 성수구 성수동2가 000-00
Purpose: 내 건물 매각 검토
```

### Demo B — Broker "카톡 매물 → 1분 딜카드"

```
URL: /broker/deal-card/new
Paste: 성수동 000-00, 80억대 근생, 1층 A카페 월세 800...
```

### Demo C — Buyer Intent → Buyer Memo

```
URL: /broker/buyer-intents/new
Paste: 김대표 50~80억, 성수나 강남, 사옥 겸 임대수익 원함.
```

### Demo D — Owner Readiness → Expert Note Request

```
URL: /owner-readiness → /expert-note/request
```

### Demo E — Gate Request

```
From deal card → Gate Request Form → G2 자격 요약 요청
```

### Demo F — Admin Console

```
/admin → /admin/analytics → /admin/gate-requests → /admin/expert-notes
```

> **Note:** Admin pages require `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

---

## 프로젝트 문서 맵

### v3 핵심 문서 (docs/credal_v3/)

| 문서 | 목적 |
|------|------|
| `README.md` | v3 문서 네비게이션 허브 (SSoT 우선순위) |
| `SDD.md` | 시스템 설계 문서 Stage 0~3 (v1.3) |
| `SDD-magazine.md` | 매거진 SDD (v1.2) |
| `SDD-stage4.md` | Stage 4 SDD (v1.0) |
| `TASKS.md` | 마스터 태스크 인덱스 (착수 순서 SSoT) |
| `ontology/credeal-ontology-v0.1.yaml` | 온톨로지 스키마 (최상위 SSoT) |
| `specs/` | 기능별 상세 명세 (9개 문서) |
| `developer-guide.md` | 개발자 온보딩 가이드 |

### 레거시 문서 (docs/)

| 문서 | 목적 |
|------|------|
| `00-product-brief.md` | 제품 비전 |
| `03-domain-model.md` | 도메인 모델 |
| `07-database-schema.md` | DB 스키마 |
| `08-api-contracts.md` | API 계약 |
| `11-gate-disclosure-policy.md` | 게이트/공개 정책 |

---

## 배포

```bash
npm run build                     # 로컬 빌드 검증 (필수)
git push origin main              # Vercel 자동 배포 트리거
# 또는
npx vercel --prod                 # 긴급 수동 배포
```

자세한 배포 가이드: [DEPLOY.md](file:///c:/Users/User/cre-dealcard/DEPLOY.md)

---

*Updated: 2026-07-28 · CREDEAL v3*
