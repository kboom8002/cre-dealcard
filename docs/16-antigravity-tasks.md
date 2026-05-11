# 16. Antigravity Tasks

## 1. Purpose

This document defines executable implementation tasks for Google Antigravity or any AI-pair coding agent working on **JS Building SSoT MVP v0.1**.

The goal is not to let the agent freely invent an application. The goal is to let the agent implement a constrained, testable, mobile-first CRE AI Deal Card Copilot based on the repo documents.

The product rule is:

> Small input → Building SSoT Lite → public-safe signal/document → gate or expert action → activity event.

Every task in this document must preserve that rule.

---

## 2. Execution Model

Use a single-lane execution model.

```text
Read relevant docs
→ produce short implementation plan
→ implement the slice
→ run typecheck/tests
→ verify demo path
→ report changed files and remaining issues
```

Do not begin the next task until the current task satisfies its acceptance criteria.

---

## 3. Global Rules for All Tasks

### 3.1 Scope Rules

- Do not add features outside `02-mvp-scope.md`.
- Do not implement Full Dealroom, Full Auto IM, advanced matching, payments, expert marketplace, investment recommendation, valuation, tax, legal, loan, or automatic cap rate calculation.
- If a feature seems necessary but is not in scope, add it to `19-future-roadmap.md` as a future item instead of implementing it.

### 3.2 Domain Rules

- Every building workflow must create or reference `building_ssot_lite`.
- Public and blind outputs must use `building_signal_card` or redacted document data, not private truth fields.
- Buyer condition workflows must create or reference `buyer_intent_lite`.
- Generated documents must be stored as `document_objects`.
- Significant user/system actions must create `activity_events`.

### 3.3 AI Rules

- AI outputs must be schema-validated with Zod before database writes.
- AI-generated documents are `draft` by default.
- Public/blind outputs must pass disclosure rules.
- AI must not generate price recommendation, investment advice, legal/tax/loan judgment, guaranteed yield, or definitive cap rate/NOI claims.
- Prompt version and model version must be logged in `ai_runs`.

### 3.4 Security Rules

- Do not expose Supabase service role key to browser/client code.
- RLS must be enabled for exposed tables.
- Evidence files are private by default.
- Gate approval is required before revealing protected fields.
- Do not return `private_truth`, exact address, tenant names, unit-level rent, seller motivation, or negotiation memo from public/blind APIs.

### 3.5 UX Rules

- Mobile-first.
- One primary action per screen.
- The user should understand what happened within 10 seconds.
- Use UX writing from `05-ui-ux-spec.md`.
- Do not expose the term “Building SSoT” as the main user-facing label except in admin/developer contexts. Use user-facing phrases such as “자료 준비 상태”, “공유 가능 정보”, “딜카드”, “확인 필요 항목”.

---

## 4. Task 0 — Project Foundation

### Read First

```text
docs/00-product-brief.md
docs/01-ai-pair-coding-guide.md
docs/02-mvp-scope.md
docs/06-technical-architecture.md
docs/15-implementation-slices.md
```

### Goal

Initialize the Next.js + TypeScript + Supabase + AI-ready project foundation.

### Build

```text
- Next.js App Router structure
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui baseline setup or compatible component structure
- /src/lib
- /src/domain
- /src/ai
- /src/components
- /src/types
- Supabase client wrappers
- environment variable example
- basic root page
- basic broker route placeholder
- basic admin route placeholder
```

### Expected Files / Folders

```text
src/app/page.tsx
src/app/(public)/building-radar/page.tsx
src/app/(broker)/broker/page.tsx
src/app/(admin)/admin/page.tsx
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/service.ts
src/domain/README.md
src/ai/README.md
.env.example
```

### Do Not

- Do not implement product logic yet.
- Do not add unplanned tables.
- Do not add payment, CRM, or full dealroom packages.

### Acceptance Criteria

```text
- App starts locally.
- Typecheck passes.
- Root page renders.
- Public, broker, and admin placeholder routes render.
- Supabase client files are present and use environment variables.
```

### Suggested Commands

```bash
npm run typecheck
npm run lint
npm run dev
```

---

## 5. Task 1 — Supabase Schema + RLS

### Read First

```text
docs/03-domain-model.md
docs/07-database-schema.md
docs/11-gate-disclosure-policy.md
docs/12-security-rls-storage.md
docs/13-event-analytics.md
```

### Goal

Create the Supabase schema and baseline RLS policies for MVP objects.

### Build Tables

```text
profiles
broker_profiles
building_ssot_lite
building_signal_cards
buyer_intent_lite
owner_readiness_checks
document_objects
gate_requests
expert_note_requests
evidence_files
activity_events
ai_runs
```

### Build Policies

```text
- RLS enabled on all exposed tables
- owner can read/write own rows
- broker can access own broker objects
- admin can review gate/expert/admin objects
- public/blind records never expose private truth fields
```

### Build Indexes

```text
owner_id
created_by
building_id
buyer_intent_id
document_type
visibility
status
event_type
created_at
```

### Do Not

- Do not create tables not listed in `07-database-schema.md`.
- Do not leave RLS disabled.
- Do not use wide-open public policies.
- Do not store raw AI prompt text containing sensitive info in public tables.

### Acceptance Criteria

```text
- Migration applies cleanly.
- RLS is enabled on all MVP tables.
- Authenticated user can insert and read their own building_ssot_lite row.
- Another authenticated user cannot read that row.
- activity_events can be inserted through approved server path.
```

### Demo Verification

Create one test user, insert a `building_ssot_lite`, and verify RLS isolation.

---

## 6. Task 2 — Public Building Radar

### Read First

```text
docs/00-product-brief.md
docs/04-information-architecture.md
docs/05-ui-ux-spec.md
docs/08-api-contracts.md
docs/09-ai-agent-contracts.md
docs/10-prompt-contracts.md
docs/13-event-analytics.md
```

### Goal

Implement the public “이 건물, 딜 될까?” flow.

### Build Routes

```text
/building-radar
/building-radar/result/[id]
```

### Build API

```text
POST /api/public/building-radar/generate
GET  /api/public/building-radar/[id]
```

### Build AI Flow

```text
Address / raw input
→ Building SSoT Lite
→ Deal Curiosity Report document_object
→ Activity events
```

### Required Report Sections

```text
- one-line diagnosis
- Deal Curiosity Score
- score meaning
- Building SSoT readiness / 자료 준비 상태
- deal points
- risk questions
- buyer fit types
- possible deal stories
- missing data
- boundary note
```

### Forbidden Output

```text
- price recommendation
- investment recommendation
- guaranteed yield
- cap rate claim
- NOI claim
- loan availability claim
- legal/tax/permit certainty
```

### Acceptance Criteria

```text
- User can enter address or building memo.
- User can select purpose.
- API creates building_ssot_lite.
- API creates document_object with type deal_curiosity_report.
- Result page renders mobile-first report cards.
- activity_events include address_submitted, building_ssot_lite_created, deal_curiosity_report_generated.
- Report includes boundary note.
```

### Demo Path

```text
/building-radar
→ enter sample address
→ select “내 건물 매각 검토”
→ generate report
→ view result page
```

---

## 7. Task 3 — Broker 1분 딜카드

### Read First

```text
docs/02-mvp-scope.md
docs/03-domain-model.md
docs/05-ui-ux-spec.md
docs/08-api-contracts.md
docs/09-ai-agent-contracts.md
docs/10-prompt-contracts.md
docs/11-gate-disclosure-policy.md
docs/examples/sample-building-memo.md
```

### Goal

Build the broker memo-to-deal-card flow.

### Build Routes

```text
/broker
/broker/deal-card/new
/broker/deal-card/[id]
```

### Build API

```text
POST /api/broker/deal-card/from-memo
POST /api/broker/deal-card/[id]/generate-teaser
```

### Build AI Agents

```text
MemoParserAgent
BuildingMiniTruthAgent
DisclosureGuardAgent
SignalComposerAgent
```

### Required UI

```text
- Big memo input
- Helper copy: “카톡 매물 설명을 붙여넣으세요”
- Generate button: “1분 딜카드 만들기”
- Hidden fields card
- Blind teaser preview
- Kakao message copy button
- Next actions: Buyer Intent, Gate Request, Expert Note
```

### Redaction Requirements

Blind teaser must not show:

```text
- exact address
- tenant names
- unit-level rent
- seller motivation
- negotiation notes
```

### Acceptance Criteria

```text
- Broker can paste memo and generate a deal card.
- building_ssot_lite row is created.
- building_signal_card row is created.
- blind_teaser document_object is created.
- hidden_fields are displayed.
- copyable Kakao message is generated.
- activity_events are recorded.
- sensitive fields do not appear in the blind teaser.
```

### Demo Path

```text
/broker/deal-card/new
→ paste sample memo
→ generate
→ verify hidden fields
→ copy Kakao text
```

---

## 8. Task 4 — Buyer Intent + Buyer Memo

### Read First

```text
docs/03-domain-model.md
docs/05-ui-ux-spec.md
docs/08-api-contracts.md
docs/09-ai-agent-contracts.md
docs/10-prompt-contracts.md
docs/examples/sample-buyer-intent.md
```

### Goal

Allow brokers to turn buyer memo into structured intent and generate a buyer memo linked to a building.

### Build Routes

```text
/broker/buyer-intents/new
/broker/buyer-intents/[id]
```

### Build API

```text
POST /api/broker/buyer-intents/from-memo
POST /api/broker/buyer-memo/generate
```

### Build AI Agents

```text
BuyerIntentNormalizerAgent
BuyerMemoWriterAgent
```

### Required Buyer Intent Fields

```text
buyer_type
budget_range
preferred_regions
asset_types
purchase_purpose
must_have
nice_to_have
risk_tolerance
financing_note
missing_questions
```

### Required Buyer Memo Sections

```text
- fit reasons
- caution / misfit reasons
- missing data
- recommended next action
- Kakao-friendly message
```

### Acceptance Criteria

```text
- Broker can paste buyer condition memo.
- buyer_intent_lite row is created.
- Broker can link buyer intent to a building/deal card.
- buyer_memo document_object is created.
- document is safe, non-advisory, and includes missing data.
- activity_events are recorded.
```

### Demo Path

```text
/broker/buyer-intents/new
→ paste buyer memo
→ create buyer intent
→ select building
→ generate buyer memo
```

---

## 9. Task 5 — Owner Readiness + Expert Note

### Read First

```text
docs/02-mvp-scope.md
docs/05-ui-ux-spec.md
docs/08-api-contracts.md
docs/09-ai-agent-contracts.md
docs/13-event-analytics.md
docs/examples/sample-owner-readiness.json
```

### Goal

Build the owner readiness check and expert note conversion flow.

### Build Routes

```text
/owner-readiness
/expert-note/request
```

### Build API

```text
POST /api/owner-readiness/check
POST /api/expert-note/request
GET  /api/admin/expert-notes
PATCH /api/admin/expert-notes/[id]/complete
```

### Required Readiness Checklist

```text
building register
registry
land use plan
lease summary
photos
floor plan
repair history
vacancy status
asking price
public/private disclosure preference
```

### Required Output

```text
- readiness score
- available outputs
- missing data checklist
- recommended next product/action
```

### Acceptance Criteria

```text
- User can complete owner readiness checklist.
- readiness result is stored.
- missing data checklist renders.
- expert note request can be submitted.
- admin can view request.
- activity_events are recorded.
```

### Demo Path

```text
/owner-readiness
→ complete checklist
→ view score
→ request expert note
→ admin sees request
```

---

## 10. Task 6 — Gate Request Lite

### Read First

```text
docs/03-domain-model.md
docs/08-api-contracts.md
docs/11-gate-disclosure-policy.md
docs/12-security-rls-storage.md
docs/14-test-plan.md
docs/examples/sample-gate-request.json
```

### Goal

Create a minimal gate request workflow.

### Build API

```text
POST /api/gate-requests
PATCH /api/gate-requests/[id]/review
GET /api/admin/gate-requests
```

### Build UI

```text
- gate request button/component
- gate status badge
- admin gate request list
- approve/reject action
```

### MVP Gate Levels

```text
G0 Public Signal
G1 Registered Interest
G2 Qualified Summary
G3 Snapshot / IM Lite Request
```

### Do Not

- Do not implement G4/G5.
- Do not implement full dealroom.
- Do not reveal protected fields before approval.

### Acceptance Criteria

```text
- Gate request can be created from building signal/document.
- Request status changes from submitted to broker_review to approved/rejected.
- Protected fields remain hidden before approval.
- activity_events are recorded.
```

### Demo Path

```text
Deal card result
→ create gate request
→ admin gate list
→ approve/reject
```

---

## 11. Task 7 — Admin Console + Analytics v1

### Read First

```text
docs/13-event-analytics.md
docs/04-information-architecture.md
docs/05-ui-ux-spec.md
docs/08-api-contracts.md
```

### Goal

Build minimal admin console and analytics dashboard.

### Build Routes

```text
/admin
/admin/expert-notes
/admin/gate-requests
/admin/analytics
```

### Required Analytics

```text
building_ssot_lite_created count
blind_teaser_generated count
buyer_intent_created count
buyer_memo_generated count
owner_readiness_checked count
gate_request_created count
expert_note_requested count
document_shared count
```

### Acceptance Criteria

```text
- Admin can see pending expert notes.
- Admin can see gate requests.
- Admin can view basic event counts.
- Admin can view recent activity list.
```

---

## 12. Task 8 — QA / E2E / Demo Polish

### Read First

```text
docs/14-test-plan.md
docs/18-demo-scenarios.md
docs/05-ui-ux-spec.md
docs/11-gate-disclosure-policy.md
```

### Goal

Verify MVP happy paths and disclosure safeguards.

### Build Tests

```text
- Public radar happy path
- Broker deal card happy path
- Buyer intent → buyer memo path
- Owner readiness → expert note path
- Gate request path
- Disclosure guard redaction test
```

### Required Demo Paths

```text
/building-radar
/broker/deal-card/new
/broker/buyer-intents/new
/owner-readiness
/admin/analytics
```

### Acceptance Criteria

```text
- Typecheck passes.
- Unit/API/E2E happy path tests pass.
- exact address, tenant name, unit rent redaction is verified.
- README demo instructions are updated.
- No P0 scope violation exists.
```

---

## 13. Final Completion Criteria

The full MVP implementation is complete only when:

```text
- All tasks 0 through 8 pass acceptance criteria.
- Typecheck passes.
- Core E2E happy paths pass.
- Public/blind outputs pass disclosure tests.
- All major mutations write activity_events.
- Admin can see expert notes, gate requests, and analytics counts.
- README includes setup and demo instructions.
```
