# JS Building SSoT MVP v0.1

## 1. What This Is

**JS Building SSoT MVP v0.1** is a mobile-first CRE AI Deal Card Copilot.

It turns a small input such as:

```text
- parcel/address
- road-name address
- Kakao-style broker property memo
- buyer condition memo
- owner readiness checklist
```

into:

```text
- Building SSoT Lite
- public-safe Building Signal
- Deal Curiosity Report
- Blind Deal Card
- Buyer Memo
- Owner Prep Memo
- Gate Request
- Expert Note Request
- Activity Events
```

The public product name is:

```text
이 건물, 딜 될까?
```

The broker-facing product name is:

```text
JS 1분 딜카드
```

---

## 2. Core Product Rule

```text
Small input
→ Building SSoT Lite
→ public-safe signal/document
→ gate or expert action
→ activity event
```

---

## 3. MVP Modules

```text
1. Building SSoT Lite Generator
2. Public “이 건물, 딜 될까?” Report
3. Broker “JS 1분 딜카드”
4. Buyer Intent Lite
5. Buyer Memo Lite
6. Owner Readiness Lite
7. Blind Teaser Generator
8. Gate Request Lite
9. Expert Note Request
10. Analytics v1
```

---

## 4. Non-goals

Do not implement in v0.1:

```text
- Full Dealroom
- Full Auto IM
- Advanced Match Algorithm
- Expert Marketplace
- Payment / settlement
- Investment recommendation
- Automatic valuation
- Tax / legal / loan judgment
- Cap rate / NOI certainty
- External investor membership
```

---

## 5. Tech Stack

```text
Frontend:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui or equivalent component system
- React Hook Form
- Zod

Backend:
- Next.js Route Handlers
- Server Actions
- Supabase JS client

Database:
- Supabase Postgres
- RLS
- Storage
- Queues
- pgvector later

AI:
- AI SDK-style structured output
- OpenAI / Claude / Gemini abstraction
- Zod output validation
- prompt version logging

Testing:
- Unit tests
- API tests
- RLS tests
- E2E happy-path tests
- Disclosure guard tests
```

---

## 6. Repository Map

```text
/docs
  00-product-brief.md
  01-ai-pair-coding-guide.md
  02-mvp-scope.md
  03-domain-model.md
  04-information-architecture.md
  05-ui-ux-spec.md
  06-technical-architecture.md
  07-database-schema.md
  08-api-contracts.md
  09-ai-agent-contracts.md
  10-prompt-contracts.md
  11-gate-disclosure-policy.md
  12-security-rls-storage.md
  13-event-analytics.md
  14-test-plan.md
  15-implementation-slices.md
  16-antigravity-tasks.md
  17-single-lane-prompts.md
  18-demo-scenarios.md
  19-future-roadmap.md

/docs/examples
  sample-building-memo.md
  sample-buyer-intent.md
  sample-owner-readiness.json
  sample-deal-curiosity-report.json
  sample-blind-teaser.md
  sample-buyer-memo.md
  sample-gate-request.json
  sample-activity-events.json
```

---

## 7. AI-Pair Coding Workflow

Use single-lane execution.

```text
Task 0. Project Foundation
Task 1. Supabase Schema + RLS
Task 2. Public Building Radar
Task 3. Broker 1분 딜카드
Task 4. Buyer Intent + Buyer Memo
Task 5. Owner Readiness + Expert Note
Task 6. Gate Request Lite
Task 7. Admin Console + Analytics
Task 8. QA / E2E / Demo Polish
```

Before coding each task:

```text
1. Read required docs.
2. Produce short plan.
3. Implement only that task.
4. Run typecheck/tests.
5. Verify demo path.
6. Report changed files.
```

---

## 8. Setup

Create `.env.local` based on `.env.example`.

Expected variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
AI_DEFAULT_MODEL=
APP_BASE_URL=
```

Install and run:

```bash
npm install
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Test:

```bash
npm run test
```

---

## 9. Demo Paths

### Demo A — Public “이 건물, 딜 될까?”

```text
/building-radar
→ enter address
→ select purpose
→ generate report
→ view Deal Curiosity Report
```

### Demo B — Broker “카톡 매물 → 1분 딜카드”

```text
/broker/deal-card/new
→ paste sample broker memo
→ generate deal card
→ verify hidden fields
→ copy Kakao message
```

### Demo C — Buyer Intent → Buyer Memo

```text
/broker/buyer-intents/new
→ paste buyer memo
→ create Buyer Intent
→ select building
→ generate Buyer Memo
```

### Demo D — Owner Readiness → Expert Note

```text
/owner-readiness
→ complete checklist
→ view readiness score
→ request Expert Note
```

### Demo E — Admin Analytics

```text
/admin/analytics
→ view event counts
→ view recent activity
```

---

## 10. Disclosure Rules

Public/blind outputs must not expose:

```text
- exact address
- tenant name
- unit-level rent
- seller motivation
- negotiation memo
- private truth fields
```

Use:

```text
- area signal
- asset type
- price band
- fit summary
- caution summary
- missing data
- next action
```

---

## 11. MVP Definition of Done

The MVP is ready only when:

```text
- Public Building Radar happy path works.
- Broker 1분 딜카드 happy path works.
- Buyer Intent → Buyer Memo works.
- Owner Readiness → Expert Note works.
- Gate Request Lite works.
- Admin can view expert notes, gate requests, and analytics.
- Activity events are recorded.
- Disclosure redaction test passes.
- RLS policies are enabled.
- Typecheck/tests pass.
```

---

## 12. Important Product Boundary

This app is not a valuation tool, investment recommendation engine, legal/tax advisor, or loan feasibility engine.

All outputs are preliminary, question-oriented, and document-assistive.

Preferred language:

```text
확인할 필요가 있습니다.
검토해볼 수 있습니다.
자료 확인 전에는 단정하기 어렵습니다.
전문가 검토가 필요한 영역입니다.
```

Avoid:

```text
투자 가치가 높습니다.
수익률이 개선됩니다.
대출 가능합니다.
세금상 유리합니다.
안전한 투자처입니다.
```
