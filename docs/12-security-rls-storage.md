# 12. Security, RLS, and Storage Policy — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines security, Supabase RLS, storage, disclosure, and secret handling policies for JS Building SSoT MVP v0.1.

The product handles sensitive commercial real estate information. Even in MVP, the system must prevent accidental exposure of:

```text
exact address
owner/seller motivation
tenant names
unit-level rent
negotiation memo
raw evidence files
buyer private conditions
```

## 2. Security Principles

```text
1. Truth and Signal are separate.
2. Public/blind outputs never expose private truth.
3. AI-generated documents are draft by default.
4. Gate approval is required for higher-disclosure information.
5. All exposed tables have RLS enabled.
6. Storage is private by default.
7. service_role key is server-only.
8. Every meaningful mutation writes activity_event.
9. AI tools never directly expose secrets or privileged DB access.
10. Raw sensitive data is not written into analytics metadata.
```

## 3. Role Model

```text
public_user
broker
expert
admin
```

### public_user

Can:

```text
- generate public building radar report
- request expert note
- access own saved records if authenticated
```

Cannot:

```text
- access another user's building_ssot_lite
- access broker/private buyer intent
- access evidence files
- approve gate requests
```

### broker

Can:

```text
- create own deal cards
- create own buyer intents
- create own documents
- review gate requests assigned to them in later workflow
```

Cannot:

```text
- access another broker's private data unless explicitly shared
- bypass disclosure rules
- expose private fields in blind teaser
```

### expert

Can:

```text
- view assigned expert note requests in later phase
```

Cannot:

```text
- browse all projects
- access raw evidence unless assigned and authorized
```

### admin

Can:

```text
- review expert note requests
- review gate requests
- inspect analytics
- support QA
```

Admin access should be scoped and audited.

## 4. RLS Requirements

### General Rule

Every exposed table must have RLS enabled.

Tables:

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

## 5. Baseline RLS Policy Pattern

### Own Row Select

```sql
create policy "select_own_rows"
on table_name for select
to authenticated
using (owner_id = auth.uid());
```

### Own Row Insert

```sql
create policy "insert_own_rows"
on table_name for insert
to authenticated
with check (owner_id = auth.uid());
```

### Own Row Update

```sql
create policy "update_own_rows"
on table_name for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
```

## 6. Anonymous Public Report Policy

Anonymous public report generation must not require broad public table read access.

Recommended pattern:

```text
1. API route receives request.
2. Server-side service creates building_ssot_lite with owner_id null or temporary token.
3. API returns result ID plus result access token if needed.
4. Public result endpoint returns only redacted report fields.
5. Raw building_ssot_lite row is not directly queryable by anonymous client.
```

## 7. Private Truth Fields

The following fields must never be returned in public/blind APIs:

```text
exact_address
tenant_name
unit_rent
seller_motivation
negotiation_memo
raw evidence file path
buyer contact details
```

These may appear in internal/raw inputs but must not appear in:

```text
blind_teaser
public building signal
public report
analytics metadata
share card
```

## 8. Disclosure Levels

```text
G0 Public Signal
G1 Registered Interest
G2 Qualified Summary
G3 Snapshot / IM Lite Request
```

### G0 Public Signal

Allowed:

```text
area signal
asset type
price band if non-sensitive
high-level deal points
high-level caution points
risk questions
```

Blocked:

```text
exact address
tenant names
unit rents
seller motivation
raw documents
```

### G1 Registered Interest

Allowed:

```text
saved interest
basic follow-up
non-sensitive summary
```

### G2 Qualified Summary

Allowed:

```text
more detailed summary
some summarized lease/income indicators if approved
```

### G3 Snapshot / IM Lite Request

Allowed after review:

```text
selected detail fields
snapshot or IM Lite
deeper location and lease summaries
```

## 9. Storage Buckets

### Bucket: evidence-private

Use:

```text
building register
registry documents
lease summaries
rent rolls
photos
floor plans
raw evidence
```

Policy:

```text
private
signed URL only
no public access
linked to evidence_files metadata
```

### Bucket: public-cards

Use:

```text
redacted image cards
public-safe preview assets
```

Policy:

```text
may be public only if generated from disclosure-checked content
no raw uploads
```

### Bucket: document-exports

Use:

```text
PDF/Markdown/PPTX exports
```

Policy:

```text
private by default
signed URL after permission check
```

## 10. Evidence File Rules

Every uploaded file must create an `evidence_files` row with:

```text
owner_id
building_id
file_type
storage_bucket
storage_path
visibility
contains_sensitive_data
training_allowed
```

Rules:

```text
- contains_sensitive_data defaults to true.
- training_allowed defaults to false.
- exact file path is not returned to public clients.
- signed URL generation must check permission and gate status.
```

## 11. API Security Rules

```text
1. All request payloads are Zod-validated.
2. Auth-required APIs verify session server-side.
3. Public APIs return redacted DTOs, not raw DB rows.
4. Mutation APIs call domain services.
5. Domain services enforce disclosure and ownership.
6. Route handlers never return service errors with secrets.
7. AI output is validated and disclosure-checked before storage or return.
```

## 12. AI Security Rules

```text
1. Do not send unnecessary raw sensitive files to the model.
2. Use minimal context required for each prompt.
3. Redact or summarize private fields for public/blind generation.
4. Every AI run logs prompt_version and model, not full secrets.
5. AI output is never automatically treated as verified truth.
6. AI-generated document status starts as draft.
```

## 13. Tool / MCP Boundary

MVP production AI tools must be minimal and permission-scoped.

Allowed internal tools:

```text
building.create_ssot_lite
building.create_signal_card
document.create_document_object
gate.create_request
analytics.record_event
```

Forbidden:

```text
raw SQL execution by user-facing AI
service_role key exposure
unrestricted storage listing
unrestricted user or broker search
cross-user data browsing
```

Development MCP tools may be used by developers, but user-facing AI must use app-defined domain services only.

## 14. Activity Event Privacy

Do not put sensitive raw data in activity_events.metadata.

Allowed metadata:

```json
{
  "document_type": "blind_teaser",
  "source": "broker_memo",
  "hidden_fields_count": 4
}
```

Not allowed:

```json
{
  "exact_address": "...",
  "tenant_name": "...",
  "unit_rent": "..."
}
```

## 15. Admin Access

Admin console must be protected by role check.

Admin actions:

```text
view expert note requests
view gate requests
view aggregate analytics
complete expert notes
approve/reject gate requests
```

Admin actions must log activity_events.

## 16. Disclosure Guard Acceptance Criteria

A blind teaser generated from a memo containing exact address, tenant name, and rent must:

```text
- store these classes in hidden_fields
- exclude raw values from markdown/body
- mark document_object.status as disclosure_checked only if clean
- create activity_event with hidden_fields_count only
```

## 17. RLS Acceptance Criteria

```text
- user A cannot select user B's building_ssot_lite
- user A cannot select user B's buyer_intent_lite
- anonymous users cannot query raw tables directly
- evidence files cannot be listed by non-owner
- admin route requires admin role
```

## 18. Non-goals

```text
- Enterprise-grade tenant hierarchy
- Full permission matrix for dealroom
- External investor membership access
- Payment/settlement security
- Legal-grade audit trail
```

These are v0.2+ considerations.
