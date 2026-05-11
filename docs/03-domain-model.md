# 03. Domain Model — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines the domain objects, relationships, states, ownership rules, and implementation boundaries for **JS Building SSoT MVP v0.1**.

The goal is to make sure the product is implemented as a structured CRE deal workflow, not as a loose AI text generator.

The system must always preserve this object flow:

```text
address / lot number / broker memo
→ Building SSoT Lite
→ Building Signal Card
→ Document Object
→ Gate Request Lite / Expert Note Request
→ Activity Event
```

The user sees a simple mobile utility. The system quietly creates structured, reusable, AI-ready deal data.

---

## 2. Core Domain Principle

## 2.1 Truth / Signal Separation

The most important domain rule is the separation between **Truth** and **Signal**.

```text
Truth = internal, source-oriented, potentially sensitive building/deal information.
Signal = public-safe or blind-safe representation derived from Truth.
```

The MVP does not yet create a full Building SSoT. It creates **Building SSoT Lite**, a limited structured record that can safely generate blind/public outputs.

Sensitive information must never leak into public or blind outputs.

### Private or restricted information

```text
exact_address
owner_name
tenant_name
unit_level_rent
unit_level_deposit
seller_motivation
negotiation_floor
private_broker_note
raw_lease_details
raw_registry_file
raw_tax_or_legal_memo
```

### Public or blind-safe information

```text
area_signal
asset_type
price_band
size_signal
current_use_signal
fit_summary
caution_summary
risk_questions
missing_data
recommended_next_action
```

---

## 3. Domain Object Map

## 3.1 MVP Objects

The MVP has exactly these primary domain objects:

```text
user
profile
broker_profile
building_ssot_lite
building_signal_card
buyer_intent_lite
owner_readiness_check
document_object
gate_request_lite
expert_note_request
evidence_file
activity_event
ai_run
```

## 3.2 Object Relationship Overview

```text
profile
  ├─ broker_profile
  ├─ building_ssot_lite
  ├─ buyer_intent_lite
  ├─ owner_readiness_check
  ├─ expert_note_request
  └─ activity_event

building_ssot_lite
  ├─ building_signal_card
  ├─ document_object
  ├─ gate_request_lite
  ├─ evidence_file
  ├─ ai_run
  └─ activity_event

buyer_intent_lite
  ├─ buyer_memo document_object
  ├─ gate_request_lite
  ├─ ai_run
  └─ activity_event

owner_readiness_check
  ├─ missing_data_checklist document_object
  ├─ expert_note_request
  └─ activity_event

document_object
  ├─ source_refs
  ├─ gate_request_lite
  ├─ ai_run
  └─ activity_event
```

---

## 4. Object Definitions

## 4.1 profile

### Purpose

Represents the authenticated user profile. Supabase Auth stores the auth user; `profile` stores business-level user metadata.

### Core fields

```text
id
role
display_name
phone
email
company
created_at
updated_at
```

### Allowed roles

```text
public_user
broker
admin
expert
```

### Ownership

A user owns their own `profile`. Admin users may review all profiles through admin-only APIs.

### Notes

Do not store high-risk identity documents or sensitive professional license files in this table. If needed later, store those files in `evidence_file` or a dedicated verification table.

---

## 4.2 broker_profile

### Purpose

Stores broker-specific information used for broker workspace, generated document attribution, and future broker AI pages.

### Core fields

```text
id
profile_id
broker_display_name
specialty_regions
specialty_assets
bio
contact_visibility
is_verified
created_at
updated_at
```

### Examples

```json
{
  "broker_display_name": "JS 성수권역 담당 브로커",
  "specialty_regions": ["성수", "뚝섬", "서울숲"],
  "specialty_assets": ["꼬마빌딩", "근생빌딩", "사옥형 자산"],
  "contact_visibility": "registered_only",
  "is_verified": true
}
```

### Acceptance criteria

```text
- A broker user can create one broker_profile.
- A broker_profile can be associated with created buildings, documents, and gate requests.
- Public output must not automatically expose broker contact details unless contact_visibility permits it.
```

---

## 4.3 building_ssot_lite

### Purpose

The central MVP object. It is the lightweight, AI-ready building truth record created from an address, lot number, or broker memo.

It is not a full due diligence package. It is the minimum structured object required to generate:

```text
Deal Curiosity Report
Building Signal Card
Blind Deal Card
Owner Prep Memo
Buyer Memo context
Gate Request context
```

### Core fields

```text
id
owner_id
created_by_role
input_type
raw_input
area_signal
asset_type
price_band
size_signal
current_use_signal
vacancy_signal
fit_summary
caution_summary
hidden_fields
layers
confidence
disclosure
status
created_at
updated_at
```

### input_type values

```text
address
lot_number
broker_memo
voice_note
manual_form
```

### status values

```text
draft
ssot_lite
signal_ready
needs_review
archived
```

### hidden_fields values

```text
exact_address
owner_name
tenant_name
unit_rent
unit_deposit
seller_motivation
negotiation_memo
raw_registry
raw_lease
```

### Recommended JSONB structure for layers

```json
{
  "asset_identity": {
    "area_signal": "성수·뚝섬권",
    "asset_type": "근생형 꼬마빌딩",
    "price_band": "80억대"
  },
  "physical_fact": {
    "size_signal": "중소형",
    "floor_signal": "확인 필요",
    "parking_signal": "확인 필요"
  },
  "lease_income": {
    "current_use_signal": "일부 임대 중",
    "vacancy_signal": "일부 공실 가능성 확인 필요"
  },
  "market_location": {
    "area_story": "성수권역 내 사옥·리테일 수요 검토 가능"
  },
  "value_up_hypothesis": {
    "hypotheses": ["사옥+부분임대", "1층 리테일 리프라이싱"]
  },
  "risk_unknown": {
    "questions": ["임대차 만기 확인 필요", "주차 조건 확인 필요"]
  },
  "buyer_fit": {
    "fit_types": ["owner_user", "long_hold_investor"]
  }
}
```

### Confidence model

Each important field should have a confidence source:

```text
user_provided
broker_provided
public_data
ai_inferred
expert_reviewed
unknown
```

Example:

```json
{
  "area_signal": "public_data",
  "asset_type": "broker_provided",
  "fit_summary": "ai_inferred",
  "caution_summary": "ai_inferred"
}
```

### Acceptance criteria

```text
- building_ssot_lite must be created before any report or deal card.
- Public and blind documents must reference building_ssot_lite as source.
- Exact address may be stored internally only if collected, but must not appear in blind output.
- hidden_fields must be explicitly recorded.
- AI-inferred content must be marked as hypothesis or 확인 필요.
```

---

## 4.4 building_signal_card

### Purpose

A public/blind-safe card derived from `building_ssot_lite`.

This object is the safe representation that can be used in:

```text
public radar result
blind deal card
broker share text
buyer memo context
gate request context
```

### Core fields

```text
id
building_id
created_by
signal_title
signal_summary
deal_points
caution_points
risk_questions
buyer_fit_types
allowed_visibility
blocked_fields
gate_required_for_details
status
created_at
updated_at
```

### status values

```text
draft
disclosure_checked
broker_reviewed
shareable
archived
```

### Example

```json
{
  "signal_title": "성수권역 80억대 근생형 자산",
  "signal_summary": "사옥+부분임대형 매수자에게 검토 가치가 있을 수 있는 근생형 자산입니다.",
  "deal_points": [
    "사옥+부분임대 시나리오",
    "1층 리테일 리프라이싱 가능성",
    "장기보유형 매수자 관심 가능성"
  ],
  "caution_points": [
    "임대차 만기 확인 필요",
    "주차 조건 확인 필요",
    "위반건축물 여부 확인 필요"
  ],
  "blocked_fields": ["exact_address", "tenant_name", "unit_rent", "seller_motivation"],
  "gate_required_for_details": "G3"
}
```

### Acceptance criteria

```text
- building_signal_card must never contain tenant_name or unit_level_rent.
- building_signal_card must display blocked_fields when relevant.
- building_signal_card must have a source building_id.
- building_signal_card must be usable by Blind Teaser Generator.
```

---

## 4.5 buyer_intent_lite

### Purpose

A lightweight structured buyer intent generated from broker memo, buyer memo, or manual form.

### Core fields

```text
id
owner_id
raw_input
buyer_type
budget_min
budget_max
budget_display
preferred_regions
asset_types
purchase_purpose
must_have
nice_to_have
risk_tolerance
financing_note
timeline
contact_visibility
normalized
status
created_at
updated_at
```

### buyer_type values

```text
individual_investor
corporate_owner_user
family_office
broker_represented_buyer
unknown
```

### risk_tolerance values

```text
low
medium
high
unknown
```

### status values

```text
draft
normalized
ready_for_memo
archived
```

### Example

```json
{
  "buyer_type": "corporate_owner_user",
  "budget_display": "50억~80억",
  "preferred_regions": ["성수", "강남"],
  "asset_types": ["꼬마빌딩", "근생빌딩"],
  "purchase_purpose": "사옥 사용 + 일부 임대수익",
  "must_have": ["주차", "사옥 전환 가능성"],
  "nice_to_have": ["일부 공실", "리모델링 가능"],
  "risk_tolerance": "medium",
  "financing_note": "대출 50% 수준 검토 가능성 언급"
}
```

### Acceptance criteria

```text
- buyer_intent_lite can be created from free-form memo.
- buyer_intent_lite must not expose buyer identity outside owner's scope.
- buyer_intent_lite can be paired with building_signal_card to create Buyer Memo Lite.
- The system must distinguish must_have from nice_to_have.
```

---

## 4.6 owner_readiness_check

### Purpose

Represents a readiness assessment for an owner or broker preparing for Snapshot, IM Lite, or Full IM.

### Core fields

```text
id
owner_id
building_id
raw_input
checklist
readiness_score
available_outputs
missing_data
recommended_next_action
status
created_at
updated_at
```

### Checklist fields

```text
building_register
registry_document
land_use_plan
lease_summary
building_photos
floor_plan
repair_history
vacancy_status
asking_price
public_private_info_policy
```

### available_outputs values

```text
deal_curiosity_report
blind_teaser
snapshot_draft
im_lite_candidate
full_im_candidate
```

### Example result

```json
{
  "readiness_score": 48,
  "available_outputs": ["deal_curiosity_report", "blind_teaser", "snapshot_draft"],
  "missing_data": ["lease_summary", "registry_document", "building_photos", "repair_history"],
  "recommended_next_action": "전문가 3줄 코멘트 또는 Snapshot 제작 상담"
}
```

### Acceptance criteria

```text
- User can complete checklist without uploading documents.
- System must show what can be generated now and what is blocked.
- Full IM must be blocked unless required data exists or marked as draft-only.
```

---

## 4.7 document_object

### Purpose

Represents any AI-generated or human-reviewed document created by the system.

### Supported document types in MVP

```text
deal_curiosity_report
blind_teaser
buyer_fit_memo
owner_prep_memo
missing_data_checklist
gate_request_note
expert_note
```

### Core fields

```text
id
owner_id
source_type
source_id
building_id
buyer_intent_id
document_type
visibility
status
title
body
markdown
source_refs
model_version
prompt_version
created_by
reviewed_by
created_at
updated_at
```

### visibility values

```text
public
public_blind
internal_only
gate_restricted
private_truth
blocked
```

### status values

```text
draft
disclosure_checked
broker_reviewed
approved_internal
shared_external
archived
```

### Source reference rule

Every document must reference source objects:

```json
{
  "building_ssot_lite_id": "...",
  "building_signal_card_id": "...",
  "buyer_intent_lite_id": "optional",
  "gate_policy_version": "v0.1",
  "prompt_version": "prompt_blind_teaser_v1"
}
```

### Acceptance criteria

```text
- AI-generated documents default to status=draft.
- Public/blind documents must pass Disclosure Guard before sharing.
- document_object must have source_refs.
- shared_external documents must create document_shared activity_event.
```

---

## 4.8 gate_request_lite

### Purpose

Represents a request to access more detailed information.

### Core fields

```text
id
building_id
document_id
requester_id
target_broker_id
requested_level
requested_fields
reason
status
reviewer_id
review_note
reviewed_at
expires_at
created_at
updated_at
```

### requested_level values

```text
G1_registered_interest
G2_qualified_summary
G3_snapshot_or_im_lite
```

### status values

```text
submitted
broker_review
approved
rejected
expired
cancelled
```

### requested_fields examples

```text
approximate_location
exact_address
lease_summary
snapshot_pdf
im_lite
site_tour
broker_contact
```

### Acceptance criteria

```text
- Gate request can be created from building_signal_card or document_object.
- Protected fields remain hidden until approved.
- Gate approval/rejection must create activity_event.
- MVP does not implement Full Dealroom.
```

---

## 4.9 expert_note_request

### Purpose

A conversion object for users requesting expert review after public report, owner readiness, or broker deal card generation.

### Core fields

```text
id
user_id
building_id
document_id
request_type
user_goal
contact
request_memo
status
assigned_expert_id
expert_note
next_recommendation
created_at
completed_at
```

### request_type values

```text
public_report_review
owner_readiness_review
broker_deal_card_review
im_consultation
snapshot_consultation
```

### status values

```text
submitted
reviewing
completed
cancelled
```

### Acceptance criteria

```text
- Expert note request must preserve source report/document.
- Admin can view pending requests.
- Completion creates expert_note document_object or updates expert_note_request.expert_note.
- Completed request creates activity_event.
```

---

## 4.10 evidence_file

### Purpose

Stores metadata for uploaded files such as photos, registers, lease summaries, or future IM evidence.

### Core fields

```text
id
owner_id
building_id
file_type
storage_path
visibility
contains_sensitive_data
training_allowed
uploaded_by
created_at
```

### file_type values

```text
building_register
registry_document
land_use_plan
lease_summary
photo
floor_plan
repair_history
other
```

### visibility values

```text
private
internal_only
gate_restricted
public_blind
```

### MVP rule

Files are optional in v0.1. The product must work without uploads.

### Acceptance criteria

```text
- Evidence files are private by default.
- Evidence files must not be attached to public output unless transformed/redacted.
- Storage path must not be exposed to unauthorized users.
```

---

## 4.11 activity_event

### Purpose

Records product behavior and creates the data layer for analytics and future learning.

### Core fields

```text
id
actor_id
actor_role
event_type
entity_type
entity_id
metadata
created_at
```

### event_type values

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
gate_request_reviewed
expert_note_requested
expert_note_completed
document_shared
ai_run_completed
ai_run_failed
```

### Acceptance criteria

```text
- Every major mutation creates activity_event.
- Activity events must include entity_type and entity_id.
- Analytics v1 is derived from activity_events.
```

---

## 4.12 ai_run

### Purpose

Logs every AI generation or AI classification run.

### Core fields

```text
id
user_id
run_type
input_ref
output_ref
model
provider
prompt_version
status
token_usage
latency_ms
error
created_at
```

### run_type values

```text
building_mini_truth
disclosure_guard
building_signal
deal_curiosity_report
blind_teaser
buyer_intent_normalize
buyer_memo
owner_readiness
risk_boundary_check
```

### Acceptance criteria

```text
- Every AI call creates ai_run.
- Failed AI calls are logged.
- AI output must be schema-validated before being saved as domain object.
- prompt_version and model must be stored.
```

---

## 5. Status and Lifecycle Models

## 5.1 Building lifecycle

```text
draft
→ ssot_lite
→ signal_ready
→ needs_review
→ archived
```

## 5.2 Document lifecycle

```text
draft
→ disclosure_checked
→ broker_reviewed
→ approved_internal
→ shared_external
```

## 5.3 Gate lifecycle

```text
submitted
→ broker_review
→ approved / rejected / expired
```

## 5.4 Expert note lifecycle

```text
submitted
→ reviewing
→ completed / cancelled
```

---

## 6. Derived Outputs

## 6.1 Deal Curiosity Report

Source:

```text
building_ssot_lite
```

Output object:

```text
document_object.document_type = deal_curiosity_report
```

## 6.2 Blind Deal Card

Source:

```text
building_ssot_lite
building_signal_card
```

Output object:

```text
document_object.document_type = blind_teaser
visibility = public_blind
```

## 6.3 Buyer Memo Lite

Source:

```text
building_signal_card
buyer_intent_lite
```

Output object:

```text
document_object.document_type = buyer_fit_memo
visibility = internal_only or gate_restricted
```

## 6.4 Owner Prep Memo

Source:

```text
owner_readiness_check
building_ssot_lite optional
```

Output object:

```text
document_object.document_type = owner_prep_memo
```

---

## 7. Cross-object Invariants

These rules must always be true.

```text
1. No public/blind document without source building_ssot_lite.
2. No blind teaser without Disclosure Guard result.
3. No document_shared event without document_object.
4. No Gate Request without building_id or document_id.
5. No Buyer Memo without buyer_intent_lite.
6. No AI-generated document without ai_run.
7. No externally shareable document containing blocked_fields.
```

---

## 8. Non-goals

The MVP domain model does not include:

```text
full_dealroom
full_im_project
advanced_match_case
payment
expert_marketplace_project
legal_tax_advice_object
valuation_object
loan_quote_object
```

These may be added after v0.1, but must not be implemented in initial slices.

---

## 9. Implementation Guidance for AI-pair Coding

When implementing domain logic, follow this order:

```text
1. Create or load source object.
2. Validate ownership and role.
3. Generate or transform AI output using schema.
4. Save result as domain object.
5. Run disclosure/risk guard when output may be public/blind.
6. Save document_object if relevant.
7. Save activity_event.
8. Return minimal response object to UI.
```

Do not skip event logging. Do not return private fields to public endpoints. Do not infer legal, tax, valuation, or loan conclusions.

