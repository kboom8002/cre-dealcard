# 13. Event & Analytics — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines the event model, analytics requirements, KPI definitions, and data capture rules for **JS Building SSoT MVP v0.1**.

The MVP must not be treated as a simple AI text generator. Every meaningful action should create structured event data so that the product can measure:

```text
user intent
broker reuse
AI document generation
public-to-lead conversion
disclosure safety
Gate demand
future deal intelligence
```

Core principle:

> Every useful product action should create an activity_event.

---

## 2. Analytics Philosophy

## 2.1 Product behavior is the dataset

The value of the MVP is not only generated documents. The value is the structured behavioral trail:

```text
address submitted
broker memo submitted
Building SSoT Lite created
Blind Deal Card generated
Buyer Intent normalized
Buyer Memo generated
Gate Request created
Expert Note requested
document shared
```

This trail becomes the starting point for future Building SSoT quality scoring, broker workflow analysis, IM conversion, Expert Patch routing, and Deal Intelligence.

## 2.2 Measure loops, not vanity metrics

Do not focus only on pageviews or signups.

The MVP should measure whether users complete the actual product loops:

```text
Public Loop:
address → report → CTA → expert note or IM inquiry

Broker Loop:
memo → deal card → copy/share → buyer memo or gate request

Intent Loop:
buyer memo → buyer intent → buyer memo output → follow-up

Readiness Loop:
owner readiness → missing data → expert note / snapshot inquiry
```

---

## 3. Event Object

## 3.1 activity_event schema

```text
id
actor_id
actor_role
event_type
entity_type
entity_id
session_id
request_id
metadata
created_at
```

## 3.2 actor_role values

```text
anonymous
public_user
broker
admin
expert
system
```

## 3.3 entity_type values

```text
building_ssot_lite
building_signal_card
buyer_intent_lite
owner_readiness_check
document_object
gate_request_lite
expert_note_request
evidence_file
ai_run
session
```

## 3.4 request_id

`request_id` links related API, AI, and activity events.

Example:

```text
public report generation request
→ ai_run
→ building_ssot_lite
→ document_object
→ activity_event
```

All events created in the same API call should share a `request_id`.

## 3.5 metadata

The `metadata` JSONB field should contain event-specific data.

Example:

```json
{
  "source": "broker_memo",
  "document_type": "blind_teaser",
  "visibility": "public_blind",
  "hidden_fields": ["exact_address", "tenant_name", "unit_rent"],
  "prompt_version": "prompt_blind_teaser_v1"
}
```

---

## 4. Event Naming Rules

Use past-tense event names.

Good:

```text
building_ssot_lite_created
blind_teaser_generated
expert_note_requested
```

Bad:

```text
create_building
click_teaser
user_event_1
```

Event names should be stable. Do not rename events after implementation without a migration or alias strategy.

---

## 5. Event Catalog

## 5.1 Public Entry Events

### address_submitted

Triggered when a user submits address or lot number.

Entity:

```text
session or building_ssot_lite if already created
```

Metadata:

```json
{
  "input_type": "address",
  "user_purpose": "sell_consideration",
  "source_page": "/building-radar"
}
```

---

### public_purpose_selected

Triggered when a user selects purpose.

Purpose values:

```text
sell_consideration
buy_consideration
owner_user_hq
broker_work
investment_learning
unknown
```

---

### deal_curiosity_report_generated

Triggered when a Deal Curiosity Report document is generated.

Entity:

```text
document_object
```

Metadata:

```json
{
  "building_id": "...",
  "score": 74,
  "document_type": "deal_curiosity_report",
  "prompt_version": "prompt_deal_curiosity_report_v1"
}
```

---

## 5.2 Building SSoT Events

### building_ssot_lite_created

Triggered when a `building_ssot_lite` row is created.

Entity:

```text
building_ssot_lite
```

Metadata:

```json
{
  "input_type": "broker_memo",
  "source": "broker_deal_card",
  "hidden_fields": ["exact_address", "tenant_name"]
}
```

---

### building_ssot_lite_updated

Triggered when a user or system updates Building SSoT Lite.

Metadata should include changed field names, not raw sensitive values.

```json
{
  "changed_fields": ["price_band", "caution_summary"],
  "update_source": "broker_edit"
}
```

---

### building_signal_card_created

Triggered when a blind/public-safe signal card is created.

Metadata:

```json
{
  "building_id": "...",
  "visibility": "public_blind",
  "blocked_fields": ["exact_address", "tenant_name", "unit_rent"],
  "disclosure_status": "checked"
}
```

---

## 5.3 Broker Workflow Events

### broker_memo_submitted

Triggered when a broker pastes or submits a property memo.

Metadata:

```json
{
  "memo_length": 241,
  "input_channel": "text_paste",
  "contains_sensitive_candidate": true
}
```

Do not log full raw memo in activity_event metadata.

---

### blind_teaser_generated

Triggered when a blind teaser document is generated.

Metadata:

```json
{
  "building_id": "...",
  "document_id": "...",
  "hidden_fields_count": 4,
  "disclosure_violations_detected": 2,
  "disclosure_status": "passed_after_redaction"
}
```

---

### kakao_copy_clicked

Triggered when user copies Kakao-friendly text.

Metadata:

```json
{
  "document_id": "...",
  "document_type": "blind_teaser",
  "copy_source": "deal_card_result"
}
```

This event is important because copy behavior is a proxy for real-world broker use.

---

### document_shared

Triggered when a user taps a share action or records that a document was shared.

Metadata:

```json
{
  "document_id": "...",
  "share_channel": "kakao_copy",
  "visibility": "public_blind"
}
```

MVP may not know if the user actually sent the Kakao message. Track copy/share intent as a behavioral proxy.

---

## 5.4 Buyer Intent Events

### buyer_intent_created

Triggered when Buyer Intent Lite is created.

Metadata:

```json
{
  "buyer_type": "corporate_owner_user",
  "budget_display": "50억~80억",
  "preferred_region_count": 2,
  "must_have_count": 2,
  "input_channel": "broker_memo"
}
```

Do not store buyer identity or contact details in event metadata.

---

### buyer_memo_generated

Triggered when Buyer Memo Lite is generated.

Metadata:

```json
{
  "building_id": "...",
  "buyer_intent_id": "...",
  "document_id": "...",
  "fit_reason_count": 3,
  "missing_data_count": 2
}
```

---

## 5.5 Owner Readiness Events

### owner_readiness_checked

Triggered when user completes Owner Readiness Lite.

Metadata:

```json
{
  "building_id": "optional",
  "readiness_score": 48,
  "available_outputs": ["blind_teaser", "snapshot_draft"],
  "missing_data_count": 4
}
```

---

### missing_data_checklist_generated

Triggered when missing data checklist document is created.

Metadata:

```json
{
  "owner_readiness_id": "...",
  "document_id": "...",
  "missing_data_count": 5
}
```

---

## 5.6 Gate Events

### gate_request_created

Triggered when a user requests more information.

Metadata:

```json
{
  "building_id": "...",
  "document_id": "optional",
  "requested_level": "G3_snapshot_or_im_lite",
  "requested_fields": ["exact_address", "snapshot_pdf"],
  "reason": "snapshot_request"
}
```

---

### gate_request_reviewed

Triggered when admin or broker approves/rejects.

Metadata:

```json
{
  "gate_request_id": "...",
  "review_result": "approved",
  "reviewer_role": "admin"
}
```

---

## 5.7 Expert Note Events

### expert_note_requested

Triggered when user requests expert note.

Metadata:

```json
{
  "building_id": "...",
  "document_id": "...",
  "request_type": "public_report_review",
  "user_goal": "sell_consideration"
}
```

---

### expert_note_completed

Triggered when admin/expert completes note.

Metadata:

```json
{
  "expert_note_request_id": "...",
  "next_recommendation": "snapshot_consultation"
}
```

---

## 5.8 AI Events

### ai_run_started

Optional in MVP. Useful for long generation tasks.

### ai_run_completed

Triggered after successful AI generation.

Metadata:

```json
{
  "ai_run_id": "...",
  "run_type": "blind_teaser",
  "model": "configured_model",
  "prompt_version": "prompt_blind_teaser_v1",
  "latency_ms": 3200
}
```

### ai_run_failed

Triggered after AI failure.

Metadata:

```json
{
  "run_type": "deal_curiosity_report",
  "prompt_version": "prompt_deal_curiosity_report_v1",
  "error_code": "schema_validation_failed"
}
```

---

## 6. KPI Definitions

## 6.1 Public MVP KPIs

| KPI | Definition | Source events |
|---|---|---|
| Report generation count | Number of Deal Curiosity Reports generated | deal_curiosity_report_generated |
| Purpose selection rate | purpose selected / public sessions | public_purpose_selected, address_submitted |
| Report completion rate | reports generated / addresses submitted | deal_curiosity_report_generated, address_submitted |
| Blind deal card conversion | blind teasers generated / reports generated | blind_teaser_generated, deal_curiosity_report_generated |
| Expert note request rate | expert note requested / reports generated | expert_note_requested, deal_curiosity_report_generated |
| Gate request rate | gate request created / blind teasers generated | gate_request_created, blind_teaser_generated |

---

## 6.2 Broker MVP KPIs

| KPI | Definition | Source events |
|---|---|---|
| Broker memo submissions | Count of broker memo submissions | broker_memo_submitted |
| Deal card generation rate | blind teasers / broker memo submissions | blind_teaser_generated, broker_memo_submitted |
| Kakao copy rate | kakao copy clicks / blind teasers | kakao_copy_clicked, blind_teaser_generated |
| Buyer intent creation | Count of buyer intents | buyer_intent_created |
| Buyer memo generation | Count of buyer memos | buyer_memo_generated |
| Broker weekly reuse | brokers with 2+ weekly key actions | multiple events |
| Gate demand | gate requests from broker-created cards | gate_request_created |

---

## 6.3 Safety KPIs

| KPI | Definition | Source |
|---|---|---|
| Sensitive field detection count | Number of detected sensitive fields | ai_run metadata, document metadata |
| Redaction success rate | documents passing after redaction / detected sensitive docs | ai_run, document metadata |
| Disclosure violation escape count | sensitive field found after sharing | manual QA or test events |
| Blocked output count | documents blocked by disclosure guard | ai_run/document metadata |

Goal for MVP:

```text
Disclosure violation escape count = 0
```

---

## 6.4 Conversion KPIs

| KPI | Definition |
|---|---|
| Expert Note conversion | expert_note_requested / reports generated |
| Snapshot interest | gate requests or expert requests with snapshot intent |
| Full IM consultation interest | expert requests or CTA clicks with IM intent |
| Broker paid intent | broker requests for repeated usage or team plan |

---

## 7. Funnel Definitions

## 7.1 Public funnel

```text
address_submitted
→ public_purpose_selected
→ building_ssot_lite_created
→ deal_curiosity_report_generated
→ blind_teaser_generated or expert_note_requested
→ gate_request_created or IM consultation
```

## 7.2 Broker funnel

```text
broker_memo_submitted
→ building_ssot_lite_created
→ building_signal_card_created
→ blind_teaser_generated
→ kakao_copy_clicked / document_shared
→ buyer_memo_generated / gate_request_created
```

## 7.3 Buyer intent funnel

```text
buyer_intent_created
→ buyer_memo_generated
→ kakao_copy_clicked
→ gate_request_created
```

## 7.4 Owner readiness funnel

```text
owner_readiness_checked
→ missing_data_checklist_generated
→ expert_note_requested
→ snapshot or IM consultation
```

---

## 8. Analytics Views

MVP should support simple admin analytics.

## 8.1 Daily event count

```sql
select
  date_trunc('day', created_at) as day,
  event_type,
  count(*)
from activity_events
group by 1, 2
order by 1 desc;
```

## 8.2 Broker usage summary

```sql
select
  actor_id,
  count(*) filter (where event_type = 'broker_memo_submitted') as memo_count,
  count(*) filter (where event_type = 'blind_teaser_generated') as teaser_count,
  count(*) filter (where event_type = 'buyer_intent_created') as buyer_intent_count,
  count(*) filter (where event_type = 'kakao_copy_clicked') as copy_count
from activity_events
where actor_role = 'broker'
group by actor_id;
```

## 8.3 Public conversion summary

```sql
select
  count(*) filter (where event_type = 'address_submitted') as address_submitted,
  count(*) filter (where event_type = 'deal_curiosity_report_generated') as reports,
  count(*) filter (where event_type = 'expert_note_requested') as expert_requests,
  count(*) filter (where event_type = 'gate_request_created') as gate_requests
from activity_events;
```

---

## 9. Event Logging Rules

## 9.1 Mutation rule

Every meaningful mutation must log an activity_event.

Examples:

```text
create building_ssot_lite → building_ssot_lite_created
create document_object → relevant document_generated event
create gate_request_lite → gate_request_created
create expert_note_request → expert_note_requested
```

## 9.2 Sensitive data rule

Do not store raw sensitive text in activity_event.metadata.

Do store:

```text
counts
field names
status
visibility
prompt_version
redaction result
```

Do not store:

```text
exact_address
tenant_name
unit_rent
seller_motivation
raw memo
raw lease details
```

## 9.3 Request correlation rule

Each API call should generate or receive a `request_id`. Any ai_run and activity_event created during that request should include it.

---

## 10. Admin Analytics v1 UI

The MVP Admin Analytics page should show:

```text
1. Total Building SSoT Lite created
2. Total Deal Curiosity Reports generated
3. Total Blind Teasers generated
4. Total Buyer Intents created
5. Total Buyer Memos generated
6. Total Gate Requests created
7. Total Expert Note Requests
8. Recent activity list
9. Disclosure violation count
```

## 10.1 Recent activity card

Example:

```text
10:41 broker_memo_submitted by Broker A
10:42 building_ssot_lite_created
10:42 blind_teaser_generated
10:43 kakao_copy_clicked
```

## 10.2 Safety card

```text
Disclosure Guard
- Detected sensitive fields: 37
- Redacted outputs: 37
- Escaped violations: 0
```

---

## 11. Product Success Targets for MVP Pilot

## 11.1 Broker pilot targets

```text
20 invited brokers
10 active brokers
50 Building SSoT Lite objects
100 Blind Teasers
50 Buyer Intents
50 Buyer Memos
30 Kakao copy/share actions
10 Gate Requests
0 disclosure leaks
```

## 11.2 Public launch targets

```text
1,000 Deal Curiosity Reports
70% purpose selection rate
60% report completion rate
20% blind deal card creation rate
3-5% Expert Note request rate
10 Snapshot / Full IM consultation requests
```

---

## 12. Future Analytics Extensions

Do not implement in MVP, but preserve event structure for:

```text
full dealroom analytics
buyer Q&A analytics
site tour conversion
LOI conversion
deal receipt learning
expert patch quality
IM document performance
Building SSoT completeness scoring
```

---

## 13. Acceptance Criteria

```text
- activity_events table exists.
- Every core API mutation writes activity_event.
- activity_event metadata does not include raw sensitive text.
- Admin Analytics v1 can show key event counts.
- Broker memo → deal card flow records at least 4 events.
- Public radar flow records address_submitted, building_ssot_lite_created, deal_curiosity_report_generated.
- Disclosure Guard outcomes are measurable.
```

---

## 14. Non-goals

The MVP analytics system does not include:

```text
full BI warehouse
complex attribution modeling
paid conversion analytics
real-time cohort dashboard
third-party analytics integration
deal outcome prediction
```

Those may be added after the MVP proves repeat usage and conversion.

