# 02. MVP Scope — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines the exact scope of **JS Building SSoT MVP v0.1**.

The purpose is to prevent scope creep during AI-pair coding and keep the product focused on the shortest useful loop:

```text
small input
→ Building SSoT Lite
→ public/blind signal
→ useful document
→ conversion action
→ activity event
```

---

## 2. MVP Positioning

The MVP is not a full platform.

It is a **mobile-first CRE AI Deal Card Copilot** that proves three things:

```text
1. Users will enter an address, lot number, or broker memo.
2. The system can create useful Building SSoT Lite and documents.
3. Brokers and high-intent users will reuse or convert.
```

---

## 3. MVP Product Bundle

The MVP combines two externally visible products.

## 3.1 Public Product

**이 건물, 딜 될까?**

Primary function:

```text
address / lot number
→ Deal Curiosity Report
→ Building SSoT readiness state
→ Blind Deal Card / Expert Note / IM consultation CTA
```

## 3.2 Broker Product

**JS 1분 딜카드**

Primary function:

```text
Kakao-style property memo
→ Building Mini Truth
→ Building Signal Card
→ Blind Deal Card
→ Kakao copy
→ Buyer Memo / Gate Request
```

---

## 4. MVP Core Modules

The MVP includes exactly ten modules.

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

Each module must be implemented as a thin vertical slice with:

```text
UI
API
domain service
database persistence
AI schema when applicable
activity_event logging
```

---

## 5. Module Scope Details

## 5.1 Building SSoT Lite Generator

### Goal

Create a minimal, structured building truth object from:

```text
address
lot number
broker memo
voice-derived memo
```

### Required Output

```text
building_ssot_lite
```

### Required Fields

```text
area_signal
asset_type
price_band
size_signal
current_use_signal
vacancy_signal
fit_summary
caution_summary
hidden_fields
confidence
disclosure
status
```

### Acceptance Criteria

```text
- The user can create Building SSoT Lite from public address input.
- The broker can create Building SSoT Lite from raw memo input.
- Sensitive fields are identified and stored as hidden_fields.
- The object is persisted.
- An activity_event is created.
```

---

## 5.2 Public “이 건물, 딜 될까?” Report

### Goal

Give public users immediate value from an address or lot number.

### Required Output

```text
deal_curiosity_report document_object
```

### Required Sections

```text
one-line diagnosis
Deal Curiosity Score
Building SSoT readiness state
deal points
risk questions
buyer fit types
deal stories
missing data
boundary note
```

### Required CTA

```text
Blind Deal Card
Expert Note
Full IM readiness
Owner Readiness
```

### Acceptance Criteria

```text
- User can submit address/purpose.
- Report is generated and stored as document_object.
- Report does not include investment advice.
- Report does not include valuation certainty.
- Report includes boundary note.
- activity_event is created.
```

---

## 5.3 Broker “JS 1분 딜카드”

### Goal

Allow brokers to paste a Kakao-style property memo and generate a safe, blind, buyer-shareable deal card.

### Required Input

```text
raw broker memo
optional visibility preference
```

### Required Output

```text
building_ssot_lite
building_signal_card
blind_teaser document_object
```

### Required UI

```text
large memo input
hidden information card
deal card preview
Kakao copy button
Buyer Intent connection CTA
Gate Request CTA
```

### Acceptance Criteria

```text
- Broker can paste raw memo.
- Building Mini Truth is generated.
- Blind Teaser is generated.
- exact address does not appear in blind teaser.
- tenant name does not appear in blind teaser.
- unit-level rent does not appear in blind teaser.
- seller motivation does not appear in blind teaser.
- activity_events are created.
```

---

## 5.4 Buyer Intent Lite

### Goal

Turn raw buyer condition memo into structured buyer intent.

### Required Input

```text
raw buyer memo
```

### Required Output

```text
buyer_intent_lite
```

### Required Fields

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
visibility
```

### Acceptance Criteria

```text
- Broker can create Buyer Intent Lite from memo.
- Buyer Intent Lite is persisted.
- The output does not expose buyer contact details beyond owner broker scope.
- activity_event is created.
```

---

## 5.5 Buyer Memo Lite

### Goal

Generate a buyer-facing explanation using a selected Building Signal and Buyer Intent.

### Required Input

```text
building_ssot_lite_id
buyer_intent_lite_id
```

### Required Output

```text
buyer_fit_memo document_object
```

### Required Sections

```text
fit reasons
caution / misfit reasons
missing data
recommended next action
Kakao-friendly message
```

### Acceptance Criteria

```text
- Buyer Memo can be generated from building + buyer intent.
- Memo includes fit and caution, not just positive selling points.
- Memo does not guarantee fit.
- Memo is stored as document_object.
- activity_event is created.
```

---

## 5.6 Owner Readiness Lite

### Goal

Show whether a building is ready for Snapshot or Full IM.

### Required Input

Checklist:

```text
building register
registry document
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
owner_readiness_check
missing_data_checklist document_object
```

### Readiness States

```text
public_report_only
teaser_ready
snapshot_draft_ready
im_lite_candidate
full_im_candidate
```

### Acceptance Criteria

```text
- User can complete readiness checklist.
- Score and readiness state are shown.
- Missing data checklist is generated.
- Expert Note CTA is shown.
- activity_event is created.
```

---

## 5.7 Blind Teaser Generator

### Goal

Generate safe blind teaser from Building SSoT Lite.

### Required Output

```text
blind_teaser document_object
```

### Required Disclosure Rules

Must remove or generalize:

```text
exact address
tenant name
unit-level rent
seller motivation
private broker memo
negotiation memo
```

### Acceptance Criteria

```text
- Blind teaser is generated.
- Disclosure Guard runs before persistence.
- Sensitive fields are not displayed.
- Document status is draft unless reviewed.
- source_refs are stored.
```

---

## 5.8 Gate Request Lite

### Goal

Allow users/brokers to request deeper disclosure in a controlled way.

### MVP Gate Levels

```text
G0 Public Signal
G1 Registered Interest
G2 Qualified Summary
G3 Snapshot / IM Lite Request
```

### Required Output

```text
gate_request_lite
```

### Acceptance Criteria

```text
- Gate request can be created from building or document.
- Gate status can be updated by admin/broker reviewer.
- Protected fields remain hidden before approval.
- activity_events are created.
```

---

## 5.9 Expert Note Request

### Goal

Convert high-intent users into expert-reviewed leads.

### Required Input

```text
building_ssot_lite_id
user goal
relationship to building
contact info
optional memo
```

### Required Output

```text
expert_note_request
```

### Acceptance Criteria

```text
- User can submit Expert Note request.
- Request appears in admin console.
- Expert/admin can add 3-line note later.
- activity_event is created.
```

---

## 5.10 Analytics v1

### Goal

Track MVP learning and conversion.

### Required Events

```text
address_submitted
broker_memo_submitted
building_ssot_lite_created
building_signal_card_created
deal_curiosity_report_generated
blind_teaser_generated
buyer_intent_created
buyer_memo_generated
owner_readiness_checked
gate_request_created
expert_note_requested
document_shared
```

### Required Dashboard

```text
event count by type
recent activity
top conversion actions
expert note request count
gate request count
```

### Acceptance Criteria

```text
- Every major mutation logs activity_event.
- Admin analytics page shows basic counts.
- Events include entity_type and entity_id.
```

---

## 6. Included User Flows

## Flow A — Public Radar

```text
User enters address
→ selects purpose
→ receives Deal Curiosity Report
→ sees readiness state
→ creates blind deal card or requests expert note
```

## Flow B — Broker Deal Card

```text
Broker pastes property memo
→ receives Building Mini Truth
→ sees hidden fields
→ receives Blind Teaser
→ copies Kakao message
```

## Flow C — Buyer Intent

```text
Broker pastes buyer condition memo
→ receives Buyer Intent Lite
→ connects selected deal card
→ generates Buyer Memo
```

## Flow D — Owner Readiness

```text
User completes readiness checklist
→ receives readiness score
→ sees missing data
→ requests expert note or IM consultation
```

## Flow E — Gate Request

```text
User requests deeper info
→ Gate Request Lite is created
→ admin/broker reviewer approves or rejects
```

---

## 7. Excluded Features

## 7.1 Product Exclusions

```text
Full Dealroom
Advanced Match Algorithm
Full Auto IM
External Investor Membership
Complex Revenue-share Logic
Full Expert Marketplace
Team billing
White-label brokerage workspace
```

## 7.2 AI Exclusions

```text
Automatic valuation
Investment recommendation
Legal judgment
Tax judgment
Loan approval judgment
Guaranteed cap rate
NOI certainty
Seller motivation inference
Tenant credit judgment
```

## 7.3 Workflow Exclusions

```text
LOI management
Contract workflow
Closing workflow
Due diligence document room
Automated broker commission logic
Multi-party negotiation workspace
```

---

## 8. MVP Boundary Language

Every generated report or document must include boundary language where relevant:

```text
이 자료는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다.
가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.
상세 검토에는 추가 자료와 전문가 확인이 필요합니다.
```

---

## 9. Prioritization

## P0

Must be implemented for MVP demo.

```text
Building SSoT Lite Generator
Public Deal Curiosity Report
Broker 1분 딜카드
Blind Teaser Generator
Activity Event logging
Disclosure Guard
```

## P1

Needed for complete MVP pilot.

```text
Buyer Intent Lite
Buyer Memo Lite
Owner Readiness Lite
Expert Note Request
Analytics v1
```

## P2

Can be basic or placeholder.

```text
Gate Request Lite
Admin Console
Evidence file upload
```

---

## 10. Definition of Done

The MVP is done when these conditions are met:

```text
1. Public user can generate a Deal Curiosity Report.
2. Broker can generate a Blind Deal Card from memo.
3. Buyer Intent can be created from memo.
4. Buyer Memo can be generated.
5. Owner Readiness can be checked.
6. Expert Note request can be submitted.
7. Gate Request Lite can be created.
8. Major mutations create activity_events.
9. Sensitive fields are not exposed in public/blind documents.
10. All AI outputs conform to schemas.
11. All core tables have RLS enabled.
12. Mobile-first screens are usable.
```

---

## 11. Anti-scope-creep Rule

If a requested feature does not directly support one of these loops, it must not be implemented in MVP v0.1:

```text
Public address → report → conversion
Broker memo → blind deal card → buyer/gate action
Buyer memo → buyer intent → buyer memo
Owner readiness → missing data → expert note
```
