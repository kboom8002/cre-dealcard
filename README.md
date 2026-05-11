# JS Building SSoT MVP v0.1

## Product

**Public name:** 이 건물, 딜 될까?  
**Broker name:** JS 1분 딜카드  
**System name:** JS Building SSoT MVP v0.1

JS Building SSoT MVP v0.1 is a mobile-first CRE AI Deal Card Copilot.

It turns a small input (address, parcel, Kakao broker memo) into:

- **Building SSoT Lite** — structured source object
- **Building Signal Card** — public-safe derived representation  
- **Deal Curiosity Report** — AI-generated pre-deal analysis
- **Blind Teaser** — address/tenant-redacted shareable deal card
- **Buyer Memo Lite** — fit/mismatch analysis against buyer intent
- **Owner Readiness Result** — weighted checklist score + available outputs
- **Gate Request Lite** — structured access request (G1/G2/G3)
- **Expert Note Request** — advisory lead capture
- **Activity Events** — full behavioral audit trail

## Core Rule

```
Small input → Building SSoT Lite → public-safe signal/document → gate or expert action → activity event
```

---

## Quick Start

### 1. Environment

```bash
cp .env.example .env.local
# Fill in:
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   ← required for admin pages
# OPENAI_API_KEY=your-openai-key
```

### 2. Database

Apply migration in Supabase SQL editor:

```bash
# Copy contents of supabase/migrations/00001_mvp_schema.sql
# Run in Supabase Dashboard → SQL Editor
```

### 3. Run

```bash
npm install
npm run dev       # http://localhost:3000
npm run typecheck
npm run lint
npm run test      # 100 tests
```

---

## Demo Paths

### Demo A — Public "이 건물, 딜 될까?"

```
URL: /building-radar
Input: 서울 성수구 성수동2가 000-00
Purpose: 내 건물 매각 검토
```

Expected:
- Deal Curiosity Report (one-line diagnosis, risk questions, score)
- No price/investment/legal/loan conclusions
- `building_ssot_lite` + `document_object` created
- 3 `activity_events` logged

---

### Demo B — Broker "카톡 매물 → 1분 딜카드"

```
URL: /broker/deal-card/new
Paste memo:
  성수동 000-00, 80억대 근생, 1층 A카페 월세 800, 일부 임대 중.
  사옥 수요도 볼 수 있고 매도자는 빠른 협의를 원함.
  주소는 일단 비공개.
```

Expected:
- Hidden Fields card: `exact_address`, `tenant_name`, `unit_rent`, `seller_motivation`
- Blind Teaser: `성수권역` replaces exact address, `F&B 업종` replaces `A카페`, no `월세 800`
- Kakao copy button works
- Gate Request form visible below the card

✅ **Disclosure Check:** The blind teaser must NOT contain `성수동 000-00`, `A카페`, `800만원`, or `빠른 협의를 원함`

---

### Demo C — Buyer Intent → Buyer Memo

```
URL: /broker/buyer-intents/new
Paste memo:
  김대표 50~80억, 성수나 강남, 사옥 겸 임대수익 원함.
  주차 중요하고 너무 낡은 건물은 싫어함.
  대출은 50% 정도 생각.
```

Expected:
- Structured buyer intent: budget, region, purpose, mustHave, riskTolerance
- Generate buyer memo against any existing deal card
- Fit reasons, caution points, missing data, Kakao message
- No purchase guarantees or loan certainty

---

### Demo D — Owner Readiness → Expert Note Request

```
URL: /owner-readiness
Check: 건축물대장, 등기부등본, 건물 사진
(Score: 35/100 → public_report_only)
```

Expected:
- Score card with state: "공개 리포트 가능"
- Missing data checklist
- Available outputs: `deal_curiosity_report`, `blind_teaser`

```
URL: /expert-note/request
Select goal: 내 건물 매각
Fill contact info
```

Expected:
- `expert_note_request` row created
- `expert_note_requested` activity event logged
- Admin can see in `/admin/expert-notes`

---

### Demo E — Gate Request

```
From any deal card result page → Gate Request Form
Select: G2 자격 요약 요청
Fill reason
Submit
```

Expected:
- `gate_request` created with status `submitted`
- No protected fields auto-revealed
- Admin approves at `/admin/gate-requests`

---

### Demo F — Admin Console

```
URL: /admin           → nav to analytics, gate, expert notes
URL: /admin/analytics → event counts by loop, funnel rates, recent 30 events
URL: /admin/gate-requests  → approve/reject pending requests
URL: /admin/expert-notes   → pending expert note queue
```

> **Note:** Admin pages require `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

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

---

## Disclosure Policy

This product follows a strict disclosure gate policy:

| Field | Public | Blind Teaser | Gate Approved |
|---|---|---|---|
| area_signal | ✅ | ✅ | ✅ |
| price_band | ✅ (band only) | ✅ | ✅ |
| exact_address | ❌ | ❌ | ✅ (G3+) |
| tenant_name | ❌ | ❌ | ❌ (restricted) |
| unit_rent | ❌ | ❌ | ❌ (restricted) |
| seller_motivation | ❌ | ❌ | ❌ (internal only) |

**Goal: Disclosure violation escape count = 0**

---

## Non-goals for v0.1

- Automatic valuation or investment advice
- Legal / tax / loan judgment
- Full Dealroom (G4/G5)
- Full Auto IM generation
- Expert Marketplace with payments
- Advanced semantic matching

---

## Test Commands

```bash
npm run typecheck    # TypeScript — 0 errors
npm run lint         # ESLint — 0 errors
npm run test         # 100 tests, 5 suites — all pass

# Test suites:
# ✓ owner-readiness.test.ts     (19 tests) — score calculation, thresholds, outputs
# ✓ disclosure-guard.test.ts    (25 tests) — redaction policy, forbidden claims
# ✓ schemas.test.ts             (23 tests) — Zod schema validation
# ✓ analytics-funnel.test.ts    ( 9 tests) — funnel rate computation
# ✓ gate-request.test.ts        (24 tests) — level policy, state machine, disclosure
```

---

## Docs Map

| File | Purpose |
|---|---|
| docs/00-product-brief.md | Product intent |
| docs/01-ai-pair-coding-guide.md | AI-pair coding rules |
| docs/02-mvp-scope.md | MVP scope lock |
| docs/03-domain-model.md | Domain objects |
| docs/04-information-architecture.md | Routes and IA |
| docs/05-ui-ux-spec.md | Mobile-first UI/UX |
| docs/06-technical-architecture.md | Technical architecture |
| docs/07-database-schema.md | Supabase schema |
| docs/08-api-contracts.md | API contracts |
| docs/09-ai-agent-contracts.md | AI agent contracts |
| docs/10-prompt-contracts.md | Prompt contracts |
| docs/11-gate-disclosure-policy.md | Gate/disclosure policy |
| docs/12-security-rls-storage.md | Security/RLS/storage |
| docs/13-event-analytics.md | Events and analytics |
| docs/14-test-plan.md | Test plan |
| docs/18-demo-scenarios.md | Demo scenarios |

---

*Generated: 2026-05-10*
