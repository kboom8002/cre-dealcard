# 15. Implementation Slices

## 1. Purpose

This document breaks the MVP into sequential implementation slices for Antigravity / AI-pair coding.

The implementation must follow a single-lane strategy:

```text
Implement one slice.
Run checks.
Verify demo path.
Only then move to the next slice.
```

This prevents uncontrolled scope expansion and keeps domain, database, API, and UI aligned.

---

## 2. Slice Overview

```text
Slice 0. Project Foundation
Slice 1. Supabase Schema + RLS
Slice 2. Public Building Radar
Slice 3. Broker 1분 딜카드
Slice 4. Buyer Intent + Buyer Memo
Slice 5. Owner Readiness + Expert Note
Slice 6. Gate Request Lite
Slice 7. Admin Console + Analytics
Slice 8. QA / E2E / Demo Polish
```

---

## 3. Slice 0 — Project Foundation

### Goal

Create the Next.js + TypeScript + Supabase + AI-ready project foundation.

### Build

```text
Next.js App Router structure
TypeScript config
Tailwind CSS
shadcn/ui placeholder setup
/src/lib structure
/src/domain structure
/src/ai structure
Supabase client wrappers
.env.example
basic home route
script placeholders
```

### Files / Folders

```text
src/app/
src/components/
src/lib/supabase/
src/lib/env.ts
src/domain/
src/ai/
```

### Acceptance Criteria

```text
npm install works.
npm run typecheck passes.
Home route renders.
Folder structure matches docs.
No product-specific feature is implemented yet.
```

---

## 4. Slice 1 — Supabase Schema + RLS

### Goal

Create database schema and baseline RLS.

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
owner can read/write own rows
admin can review relevant queues
anonymous cannot read private data
RLS enabled on all exposed tables
```

### Acceptance Criteria

```text
Migrations apply cleanly.
RLS is enabled.
User cannot read another user's private row.
activity_events table exists.
Types are generated or documented.
```

---

## 5. Slice 2 — Public Building Radar

### Goal

Implement public “이 건물, 딜 될까?” flow.

### Build

```text
/building-radar
/building-radar/result/[id]
POST /api/public/building-radar/generate
Building SSoT Lite creation
Deal Curiosity Report document_object creation
activity_event logging
```

### AI Dependencies

```text
DealCuriosityWriterAgent
BuildingMiniTruthAgent
RiskBoundaryCheckerAgent
```

### Acceptance Criteria

```text
User can submit address and purpose.
Result page shows report cards.
document_object is stored.
activity_events are stored.
No price recommendation or investment advice appears.
```

### Demo Path

```text
/building-radar → submit → /building-radar/result/[id]
```

---

## 6. Slice 3 — Broker 1분 딜카드

### Goal

Implement broker memo-to-deal-card flow.

### Build

```text
/broker
/broker/deal-card/new
/broker/deal-card/[id]
POST /api/broker/deal-card/from-memo
BuildingMiniTruthAgent
DisclosureGuardAgent
SignalComposerAgent
Blind Teaser document_object
Kakao copy UI
```

### Acceptance Criteria

```text
Broker can paste memo and generate deal card.
building_ssot_lite row is created.
building_signal_card row is created.
blind_teaser document_object is created.
Hidden Fields card is shown.
Kakao copy button works.
Sensitive data does not appear in blind teaser.
activity_events are recorded.
```

### Demo Path

```text
/broker/deal-card/new → paste memo → /broker/deal-card/[id]
```

---

## 7. Slice 4 — Buyer Intent + Buyer Memo

### Goal

Implement buyer condition normalization and buyer memo generation.

### Build

```text
/broker/buyer-intents/new
/broker/buyer-intents/[id]
POST /api/broker/buyer-intents/from-memo
POST /api/broker/buyer-memo/generate
BuyerIntentNormalizerAgent
BuyerMemoWriterAgent
```

### Acceptance Criteria

```text
Buyer memo input creates buyer_intent_lite.
Buyer memo can be generated from building + buyer intent.
Output includes fit reasons, cautions, missing data, next action.
Buyer Memo document_object is stored.
activity_events are recorded.
```

---

## 8. Slice 5 — Owner Readiness + Expert Note

### Goal

Implement owner readiness check and expert note conversion.

### Build

```text
/owner-readiness
/expert-note/request
POST /api/owner-readiness/check
POST /api/expert-note/request
OwnerReadinessAgent
Expert Note request storage
```

### Acceptance Criteria

```text
User can complete readiness checklist.
Score is calculated.
Available outputs are shown.
Missing data checklist is shown.
Expert Note request is stored.
Admin can see pending request placeholder.
activity_events are recorded.
```

---

## 9. Slice 6 — Gate Request Lite

### Goal

Create basic gate request flow.

### Build

```text
POST /api/gate-requests
PATCH /api/gate-requests/:id/review
Gate status badge
minimal admin gate queue
```

### Gate States

```text
submitted
broker_review
approved
rejected
expired
```

### Acceptance Criteria

```text
Gate request can be created from deal card or document.
Admin can approve/reject.
Protected fields remain hidden before approval.
activity_events are recorded.
```

---

## 10. Slice 7 — Admin Console + Analytics

### Goal

Implement admin review screens and analytics v1.

### Build

```text
/admin
/admin/expert-notes
/admin/gate-requests
/admin/analytics
```

### Metrics

```text
building_ssot_lite_created
blind_teaser_generated
buyer_intent_created
buyer_memo_generated
gate_request_created
expert_note_requested
```

### Acceptance Criteria

```text
Admin can see pending Expert Note requests.
Admin can see Gate Requests.
Analytics page shows event counts.
Recent activity list renders.
```

---

## 11. Slice 8 — QA / E2E / Demo Polish

### Goal

Verify happy paths, disclosure guard, and demo quality.

### Build

```text
unit tests
API tests
E2E tests
manual demo script
README demo instructions
```

### E2E Paths

```text
Public radar happy path
Broker deal card happy path
Buyer intent → buyer memo path
Owner readiness → expert note path
Disclosure guard redaction path
Gate request path
```

### Acceptance Criteria

```text
typecheck passes
tests pass
E2E happy paths pass
redaction test passes
README demo instructions are updated
```

---

## 12. Slice Completion Rule

A slice is complete only when:

```text
1. All acceptance criteria are met.
2. Typecheck passes.
3. Relevant test or manual demo passes.
4. New mutation paths create activity_event.
5. Public/blind output passes disclosure rules.
6. Scope has not expanded beyond this document.
```
