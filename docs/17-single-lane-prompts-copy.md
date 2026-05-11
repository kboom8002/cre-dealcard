# Antigravity Single-lane Copy-paste Prompts

이 파일은 Antigravity 또는 Claude Sonnet 기반 AI-pair coding에 바로 복사해 넣기 쉽게 편집한 작업 프롬프트 세트입니다.

사용법:

1. 먼저 전체 레포에 `/docs` 문서를 배치합니다.
2. Antigravity에서 새 작업 레인을 엽니다.
3. 아래 `GLOBAL PROMPT`를 먼저 입력합니다.
4. 그다음 `PROMPT 0`부터 순서대로 하나씩 실행합니다.
5. 각 Prompt의 Acceptance Criteria가 통과하기 전에는 다음 Prompt로 넘어가지 않습니다.

---

# 17. Single-Lane Prompts

## 1. Purpose

This document contains copy-ready prompts for running JS Building SSoT MVP v0.1 implementation in Google Antigravity or another AI-pair coding environment.

The execution pattern is single-lane:

```text
One slice at a time.
Read first.
Plan.
Implement.
Test.
Verify.
Report.
Only then move to the next slice.
```

---

## 2. Global System Prompt for the Coding Agent

Use this at the beginning of the coding session.

```text
You are implementing JS Building SSoT MVP v0.1.

You must follow the repo docs strictly.

Core product:
A mobile-first CRE AI Deal Card Copilot that turns a small input such as an address, parcel, or Kakao-style broker memo into Building SSoT Lite, public-safe Building Signal, Deal Curiosity Report, Blind Teaser, Buyer Memo, Owner Prep Memo, Gate Request, and activity events.

Core implementation rule:
Small input → Building SSoT Lite → public-safe signal/document → gate or expert action → activity event.

Do not expand scope.
Do not implement Full Dealroom, Full Auto IM, payment, advanced matching, investment recommendation, valuation, tax, legal, loan, or cap rate calculation.

Every AI output must be schema-validated.
Every AI document is draft by default.
Every public/blind output must pass disclosure rules.
Every important mutation must write activity_event.
Every exposed Supabase table must have RLS.
Never expose exact address, tenant names, unit-level rent, seller motivation, or negotiation memo in public/blind outputs.

Use:
- Next.js App Router
- TypeScript
- Supabase
- RLS
- Zod
- Tailwind/shadcn-style mobile-first UI
- AI structured outputs

When implementing each slice:
1. Read the required docs listed in the task.
2. Produce a short plan.
3. Implement only that slice.
4. Run typecheck/tests.
5. Verify the demo path.
6. Report changed files, commands run, and any remaining issues.
```

---

## 3. Single-Lane Prompt 0 — Repo Foundation

```text
Task 0: Initialize the repository foundation.

Read first:
- docs/00-product-brief.md
- docs/01-ai-pair-coding-guide.md
- docs/02-mvp-scope.md
- docs/06-technical-architecture.md
- docs/15-implementation-slices.md

Goal:
Create the Next.js + TypeScript + Supabase + AI-ready project foundation.

Build:
- Next.js App Router structure
- /src/lib folder structure
- /src/domain folder structure
- /src/ai folder structure
- /src/components folder structure
- Supabase client wrappers
- .env.example
- basic shadcn/ui or equivalent component baseline
- typecheck script
- test script placeholder

Routes:
- /
- /building-radar
- /broker
- /admin

Do not:
- implement product features yet
- create DB schema beyond placeholder
- add unmatched routes
- add payment, CRM, full dealroom, or advanced matching

Acceptance:
- npm install works
- npm run typecheck passes
- app home route renders
- public/broker/admin placeholders render
- folder structure matches docs

After completion:
Report changed files and commands run.
```

---

## 4. Single-Lane Prompt 1 — Supabase Schema + RLS

```text
Task 1: Implement Supabase schema and baseline RLS.

Read first:
- docs/03-domain-model.md
- docs/07-database-schema.md
- docs/11-gate-disclosure-policy.md
- docs/12-security-rls-storage.md
- docs/13-event-analytics.md

Goal:
Create migrations for core MVP tables and baseline RLS.

Build tables:
- profiles
- broker_profiles
- building_ssot_lite
- building_signal_cards
- buyer_intent_lite
- owner_readiness_checks
- document_objects
- gate_requests
- expert_note_requests
- evidence_files
- activity_events
- ai_runs

Build:
- RLS enabled on all exposed tables
- owner can read/write own rows
- admin role can review relevant rows
- indexes for owner_id, building_id, document_type, event_type
- generated Supabase TypeScript types if available

Do not:
- expose private fields via public policies
- skip RLS
- add unplanned tables

Acceptance:
- migration applies cleanly
- RLS is enabled
- seed user can insert own building_ssot_lite
- unauthorized user cannot read another user's row

After completion:
Report migration files, policy files, and verification results.
```

---

## 5. Single-Lane Prompt 2 — Public Building Radar

```text
Task 2: Implement Public Building Radar.

Read first:
- docs/00-product-brief.md
- docs/04-information-architecture.md
- docs/05-ui-ux-spec.md
- docs/08-api-contracts.md
- docs/09-ai-agent-contracts.md
- docs/10-prompt-contracts.md
- docs/13-event-analytics.md

Goal:
Build the public “이 건물, 딜 될까?” flow.

Build:
- /building-radar page
- purpose selector
- address/input field
- POST /api/public/building-radar/generate
- Building SSoT Lite creation
- Deal Curiosity Report document_object creation
- activity_event logging
- /building-radar/result/[id] result page

AI:
- use structured output schema
- generate one-line diagnosis
- deal curiosity score
- risk questions
- deal stories
- missing data
- boundary note

Do not:
- generate price recommendation
- generate investment advice
- claim cap rate / NOI
- expose private_truth fields

Acceptance:
- user can submit address/purpose
- result page renders report cards
- document_object is stored
- activity_events are stored
- forbidden claims do not appear

After completion:
Report changed files, test results, and demo path.
```

---

## 6. Single-Lane Prompt 3 — Broker 1분 딜카드

```text
Task 3: Implement Broker 1분 딜카드.

Read first:
- docs/02-mvp-scope.md
- docs/03-domain-model.md
- docs/05-ui-ux-spec.md
- docs/08-api-contracts.md
- docs/09-ai-agent-contracts.md
- docs/10-prompt-contracts.md
- docs/11-gate-disclosure-policy.md
- docs/examples/sample-building-memo.md

Goal:
Build the broker memo-to-deal-card flow.

Build:
- /broker page
- /broker/deal-card/new
- /broker/deal-card/[id]
- POST /api/broker/deal-card/from-memo
- BuildingMiniTruthAgent
- DisclosureGuardAgent
- BlindTeaser document_object creation

Required UI:
- big memo input
- “카톡 매물 설명을 붙여넣으세요”
- hidden fields card
- preview blind teaser
- copy Kakao message button

Do not:
- expose exact address in blind teaser
- expose tenant names
- expose unit rent
- expose seller motivation

Acceptance:
- broker can paste memo and generate deal card
- building_ssot_lite row is created
- building_signal_card row is created
- blind_teaser document_object is created
- hidden_fields are displayed
- activity_events are recorded

After completion:
Report changed files, redaction verification, and demo path.
```

---

## 7. Single-Lane Prompt 4 — Buyer Intent + Buyer Memo

```text
Task 4: Implement Buyer Intent Lite and Buyer Memo Lite.

Read first:
- docs/03-domain-model.md
- docs/05-ui-ux-spec.md
- docs/08-api-contracts.md
- docs/09-ai-agent-contracts.md
- docs/10-prompt-contracts.md
- docs/examples/sample-buyer-intent.md

Goal:
Allow brokers to paste buyer condition memo and create structured Buyer Intent, then generate Buyer Memo with a selected deal card.

Build:
- /broker/buyer-intents/new
- /broker/buyer-intents/[id]
- POST /api/broker/buyer-intents/from-memo
- POST /api/broker/buyer-memo/generate
- BuyerIntentNormalizerAgent
- BuyerMemoWriterAgent

Buyer Memo must include:
- fit reasons
- misfit/caution reasons
- missing data
- recommended next action
- Kakao-friendly message

Do not:
- say this is a guaranteed match
- recommend purchase as final advice
- expose buyer contact outside owner broker scope

Acceptance:
- buyer memo input creates buyer_intent_lite
- buyer memo can be generated using building_ssot_lite + buyer_intent_lite
- document_object is stored
- activity_events are recorded

After completion:
Report changed files, generated sample output, and demo path.
```

---

## 8. Single-Lane Prompt 5 — Owner Readiness + Expert Note

```text
Task 5: Implement Owner Readiness Lite and Expert Note Request.

Read first:
- docs/02-mvp-scope.md
- docs/05-ui-ux-spec.md
- docs/08-api-contracts.md
- docs/09-ai-agent-contracts.md
- docs/13-event-analytics.md

Goal:
Build the owner readiness check and expert note lead conversion.

Build:
- /owner-readiness page
- POST /api/owner-readiness/check
- readiness score calculation
- missing data checklist
- /expert-note/request
- POST /api/expert-note/request
- admin expert note request list placeholder

Owner readiness output:
- score
- available outputs
- missing documents
- next recommended action

Acceptance:
- user can complete readiness checklist
- readiness result renders
- expert note request is stored
- activity_events are recorded

After completion:
Report changed files, stored rows, and demo path.
```

---

## 9. Single-Lane Prompt 6 — Gate Request Lite

```text
Task 6: Implement Gate Request Lite.

Read first:
- docs/03-domain-model.md
- docs/08-api-contracts.md
- docs/11-gate-disclosure-policy.md
- docs/12-security-rls-storage.md
- docs/14-test-plan.md

Goal:
Create basic Gate Request flow from building signal or document.

Build:
- POST /api/gate-requests
- PATCH /api/gate-requests/:id/review
- minimal admin gate request list
- gate status badge component
- gate level display component

Gate states:
submitted
→ broker_review
→ approved / rejected

Do not:
- reveal protected fields before approval
- create dealroom
- implement G4/G5

Acceptance:
- request can be created
- admin can approve/reject
- activity_events are recorded
- protected fields remain hidden before approval

After completion:
Report changed files, policy checks, and demo path.
```

---

## 10. Single-Lane Prompt 7 — Admin Console + Analytics

```text
Task 7: Implement Admin Console and Analytics v1.

Read first:
- docs/13-event-analytics.md
- docs/04-information-architecture.md
- docs/05-ui-ux-spec.md
- docs/08-api-contracts.md

Goal:
Build admin views for expert notes, gate requests, and basic MVP analytics.

Build:
- /admin
- /admin/expert-notes
- /admin/gate-requests
- /admin/analytics
- basic counts by event_type
- recent activity list

Metrics:
- building_ssot_lite_created
- blind_teaser_generated
- buyer_intent_created
- buyer_memo_generated
- gate_request_created
- expert_note_requested

Acceptance:
- admin can see pending expert notes
- admin can see gate requests
- analytics page shows key event counts

After completion:
Report changed files, screenshots if available, and demo path.
```

---

## 11. Single-Lane Prompt 8 — QA / E2E / Demo Polish

```text
Task 8: Add QA, E2E tests, and demo polish.

Read first:
- docs/14-test-plan.md
- docs/18-demo-scenarios.md
- docs/05-ui-ux-spec.md
- docs/11-gate-disclosure-policy.md

Goal:
Verify the MVP happy paths and disclosure safeguards.

Build tests:
- Public radar happy path
- Broker deal card happy path
- Buyer intent → buyer memo path
- Owner readiness → expert note path
- Disclosure guard redaction test

Demo paths:
- /building-radar
- /broker/deal-card/new
- /broker/buyer-intents/new
- /owner-readiness
- /admin/analytics

Acceptance:
- tests pass
- exact address/tenant/unit rent redaction is verified
- README demo instructions are updated

After completion:
Report test results, known issues, and MVP readiness.
```

---

## 12. Completion Prompt

Use this after all slices are complete.

```text
Review the entire JS Building SSoT MVP v0.1 implementation against:

- docs/02-mvp-scope.md
- docs/03-domain-model.md
- docs/11-gate-disclosure-policy.md
- docs/14-test-plan.md
- docs/18-demo-scenarios.md

Produce a final implementation report including:
1. Completed features
2. Demo paths
3. Database tables implemented
4. API routes implemented
5. AI agents implemented
6. Disclosure guard status
7. Activity events verified
8. Tests run
9. Known issues
10. Items deferred to 19-future-roadmap.md

Do not add new code unless a P0 acceptance criterion is failing.
```
