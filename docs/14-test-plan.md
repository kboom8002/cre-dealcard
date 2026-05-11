# 14. Test Plan

## 1. Purpose

This document defines the test plan for **JS Building SSoT MVP v0.1**.

The product handles sensitive real estate deal information. Testing must verify not only happy paths but also disclosure safety, AI output boundaries, RLS behavior, and event logging.

---

## 2. Test Strategy

Testing is organized into five layers.

```text
1. Unit tests
2. API tests
3. AI structured output tests
4. Security / RLS tests
5. E2E tests
```

A feature is not complete unless:

```text
- Typecheck passes
- Relevant unit/API tests pass
- E2E happy path works
- Disclosure redaction is verified
- activity_event is recorded
```

---

## 3. Unit Test Scope

### 3.1 Zod Schemas

Test schemas for:

```text
BuildingMiniTruthSchema
DealCuriosityReportSchema
BuildingSignalCardSchema
BuyerIntentLiteSchema
BuyerMemoSchema
OwnerReadinessSchema
GateRequestSchema
ActivityEventSchema
```

Test cases:

```text
valid input passes
missing required fields fail
invalid enum fails
oversized array fails when fixed length required
forbidden null handling is explicit
```

---

### 3.2 Disclosure Rules

Unit tests for redaction logic.

Must detect and remove:

```text
exact_address
tenant_name
unit_rent
seller_motivation
negotiation_memo
```

Example test:

```text
Input memo includes exact address, tenant name, monthly rent, and seller urgency.
Output blind teaser must not include these values.
```

---

### 3.3 Domain Functions

Test:

```text
readiness score calculation
available output determination
hidden field classification
activity_event payload builder
document status transition rules
gate status transition rules
```

---

## 4. API Test Scope

### 4.1 Public Building Radar API

Endpoint:

```text
POST /api/public/building-radar/generate
```

Test:

```text
valid address creates building_ssot_lite
valid request creates deal_curiosity_report document_object
activity_events are recorded
response includes buildingId and reportId
forbidden claims do not appear in generated markdown/body
```

Error tests:

```text
empty input returns 400
unsupported purpose returns 400
AI schema parse failure returns controlled error
```

---

### 4.2 Broker Deal Card API

Endpoint:

```text
POST /api/broker/deal-card/from-memo
```

Test:

```text
authenticated broker can create deal card
building_ssot_lite is created
building_signal_card is created
blind_teaser document_object is created
activity_events are recorded
hidden_fields include sensitive detected fields
```

Disclosure test:

```text
exact address, tenant name, unit rent must not appear in blind teaser.
```

---

### 4.3 Buyer Intent API

Endpoint:

```text
POST /api/broker/buyer-intents/from-memo
```

Test:

```text
buyer memo is parsed into structured buyer_intent_lite
budget range is normalized when possible
missing questions are returned
activity_event is recorded
```

---

### 4.4 Buyer Memo API

Endpoint:

```text
POST /api/broker/buyer-memo/generate
```

Test:

```text
requires building_ssot_lite and buyer_intent_lite
creates buyer_memo document_object
includes fit reasons, cautions, missing data, next action
activity_event is recorded
```

---

### 4.5 Owner Readiness API

Endpoint:

```text
POST /api/owner-readiness/check
```

Test:

```text
calculates readiness_score
returns available_outputs
returns missing_data checklist
records activity_event
```

---

### 4.6 Gate Request API

Endpoints:

```text
POST /api/gate-requests
PATCH /api/gate-requests/:id/review
```

Test:

```text
creates gate request
admin can approve/reject
non-admin cannot approve/reject
protected fields remain hidden before approval
activity_events are recorded
```

---

### 4.7 Expert Note API

Endpoint:

```text
POST /api/expert-note/request
```

Test:

```text
creates request
links report/building when provided
captures contact and user goal
records activity_event
admin can see pending request
```

---

## 5. AI Structured Output Tests

### 5.1 Required AI Output Behavior

Every AI result must:

```text
match output schema
include boundary note when public-facing
avoid forbidden claims
avoid unsupported certainty
preserve Truth/Signal separation
```

---

### 5.2 Forbidden Claim Library

Generated content must not include:

```text
투자 가치가 높습니다
수익률 상승이 가능합니다
대출 가능합니다
적정가입니다
안전한 투자처입니다
법적 문제 없습니다
세금상 유리합니다
```

---

### 5.3 Safety Rewrite Test

Input:

```text
리모델링하면 임대료가 오릅니다.
```

Expected safe output:

```text
리모델링 후 임대료 재검토 여지는 있으나, 실제 가능성은 공사비, 공실기간, 인허가, 주변 임대사례 확인이 필요합니다.
```

---

## 6. Security / RLS Tests

### 6.1 RLS Baseline

Test:

```text
user can read own rows
user cannot read another user's private rows
admin can read review queues
anonymous access cannot read private records
```

---

### 6.2 Storage Tests

Test:

```text
private evidence file is not publicly accessible
signed URL is generated only for authorized user
public blind card export contains no private truth
```

---

## 7. E2E Test Scenarios

### Scenario A. Public Building Radar

Given:

```text
Visitor opens /building-radar.
```

When:

```text
User enters address and selects “내 건물 매각 검토”.
```

Then:

```text
Deal Curiosity Report is generated.
Result page shows one-line diagnosis, risk questions, readiness status, CTAs.
activity_event contains address_submitted and deal_curiosity_report_generated.
```

---

### Scenario B. Broker 1분 딜카드

Given:

```text
Broker is logged in.
```

When:

```text
Broker pastes Kakao-style building memo.
```

Then:

```text
Building Mini Truth is created.
Blind Teaser is created.
Hidden Fields card is shown.
Kakao copy button is visible.
Sensitive information is redacted.
```

---

### Scenario C. Buyer Intent → Buyer Memo

Given:

```text
Broker has one building deal card.
```

When:

```text
Broker pastes buyer condition memo and generates buyer memo.
```

Then:

```text
Buyer Intent Lite is created.
Buyer Memo document_object is created.
Fit reasons, cautions, missing data, and next action are displayed.
```

---

### Scenario D. Owner Readiness → Expert Note

Given:

```text
User opens owner readiness page.
```

When:

```text
User checks available documents and requests Expert Note.
```

Then:

```text
Owner Readiness Score is shown.
Missing data checklist is shown.
Expert Note request is stored.
Admin can see pending request.
```

---

### Scenario E. Disclosure Guard

Given:

```text
Broker memo includes exact address, tenant name, monthly rent, seller urgency.
```

When:

```text
Broker generates blind teaser.
```

Then:

```text
Blind teaser does not include exact address, tenant name, unit rent, or seller motivation.
Hidden Fields card lists removed fields.
```

---

### Scenario F. Gate Request Lite

Given:

```text
Broker has generated a blind teaser.
```

When:

```text
User requests detailed information.
```

Then:

```text
Gate Request is created with status submitted.
Admin can approve/reject.
Protected fields are not exposed before approval.
```

---

## 8. Test Data Fixtures

Use files in:

```text
docs/examples/
```

Fixtures:

```text
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

## 9. Minimum Test Commands

Expected scripts:

```text
npm run typecheck
npm run test
npm run test:e2e
npm run lint
```

If a test framework is not yet installed in Slice 0, create placeholders and implement them in Slice 8.

---

## 10. Definition of Done

```text
All relevant type checks pass.
All unit/API tests for the slice pass.
Happy-path E2E for the slice passes or is manually documented.
Disclosure guard tests pass.
activity_event rows are created for major actions.
No forbidden claims appear in generated public/blind documents.
No protected fields appear in public/blind outputs.
```
