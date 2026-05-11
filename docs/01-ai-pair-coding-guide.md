# 01. AI-pair Coding Guide — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines how AI-pair coding agents must work in this repository.

It is written for Antigravity, Claude Sonnet, Gemini, Cursor-style agents, and human engineers.

The goal is to prevent three common failures:

```text
1. Building features outside MVP scope
2. Violating Truth / Signal separation
3. Producing plausible UI without correct data, RLS, AI schema, or event logging
```

---

## 2. Primary Instruction

Before coding any feature, read the relevant documents in `/docs`.

Do not infer product scope from memory.

Do not invent new product modules.

Do not create new database fields, routes, AI agents, or screens unless they are defined in the relevant docs.

---

## 3. Core Product Rule

Every feature must preserve this rule:

> **작은 입력을 받아 Building SSoT Lite를 만들고, 공개 가능한 Signal과 문서를 생성하며, 민감정보는 Gate로 보호하고, 모든 행동을 Event로 남긴다.**

English version:

> **Take a small input, create Building SSoT Lite, generate safe public/blind signals and documents, protect sensitive information through gates, and record every important action as an event.**

---

## 4. Required Reading Order

For any implementation task, read documents in this order unless the task specifies otherwise:

```text
1. 00-product-brief.md
2. 02-mvp-scope.md
3. 03-domain-model.md
4. 11-gate-disclosure-policy.md
5. Relevant implementation contract:
   - 04-information-architecture.md
   - 05-ui-ux-spec.md
   - 06-technical-architecture.md
   - 07-database-schema.md
   - 08-api-contracts.md
   - 09-ai-agent-contracts.md
   - 10-prompt-contracts.md
   - 12-security-rls-storage.md
   - 13-event-analytics.md
   - 14-test-plan.md
   - 15-implementation-slices.md
```

---

## 5. Scope Discipline

Do only the requested slice.

Do not add:

```text
Full Dealroom
Advanced Matching
Full Auto IM
Investment recommendation
Valuation engine
Expert marketplace
Complex billing
Legal/tax/debt judgment
```

Unless a future document explicitly changes the scope.

---

## 6. Domain-first Implementation

Every feature must map to one or more domain objects.

Core domain objects:

```text
user
broker_profile
building_ssot_lite
building_signal_card
buyer_intent_lite
owner_readiness_check
document_object
gate_request_lite
expert_note_request
activity_event
ai_run
evidence_file
```

If a feature does not create, read, update, or meaningfully use one of these objects, question whether it belongs in MVP.

---

## 7. Truth / Signal Separation

This is a hard rule.

### Private Truth

May include sensitive deal information:

```text
exact address
tenant name
unit-level rent
seller motivation
negotiation memo
private broker note
source evidence
```

### Public / Blind Signal

Must not expose sensitive fields.

Allowed:

```text
area signal
asset type
price band
size signal
fit summary
caution summary
missing data
gate level needed
```

Never expose private truth in public APIs, blind teaser documents, or public UI.

---

## 8. Draft by Default

All AI-generated documents are drafts.

Document statuses:

```text
draft
disclosure_checked
broker_reviewed
approved_internal
shared_external
```

The system must not treat AI-generated text as verified truth.

---

## 9. AI Output Must Be Structured

Every AI output must be validated with Zod or equivalent schema validation.

Do not store raw freeform AI output as final structured data without validation.

Required for AI modules:

```text
input schema
output schema
prompt version
model version
ai_run log
error handling
```

---

## 10. Every Mutation Logs an Event

Any important create/update/share action must create an `activity_event`.

Examples:

```text
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

---

## 11. Mobile-first UI

Every UI must be usable on mobile first.

Rules:

```text
one screen = one decision
one card = one message
one result = one primary next action
sticky CTA allowed
large tap targets
minimal form burden
```

Broker UX must prioritize paste / voice / copy workflows over long forms.

---

## 12. Security First

The following are non-negotiable:

```text
RLS enabled on exposed tables
service_role key never exposed in browser
private evidence files stored in private buckets
signed URLs only when allowed
Gate approval required for protected data disclosure
```

---

## 13. AI Agent Behavior Rules

## 13.1 Do Not Invent Facts

AI agents must not invent:

```text
exact building facts
rent roll
NOI
cap rate
valuation
loan terms
tax consequences
legal status
zoning certainty
tenant credit quality
```

If data is missing, output:

```text
확인 필요
자료 필요
추가 실사 필요
전문가 검토 필요
```

## 13.2 Forbidden Claims

Do not generate claims like:

```text
투자 가치가 높습니다
매수 추천합니다
수익률 상승이 가능합니다
대출 가능합니다
위반건축물 문제가 없습니다
리모델링하면 임대료가 오릅니다
우량 매물입니다
안전한 투자처입니다
```

Use safer language:

```text
검토해볼 질문이 있습니다
가능성을 검토할 수 있습니다
자료 확인이 필요합니다
전문가 검토가 필요한 영역입니다
```

## 13.3 Disclosure Guard Must Run

Before creating public or blind outputs, run disclosure logic.

Required redactions/generalizations:

```text
exact address → area signal
tenant name → tenant industry or remove
unit-level rent → summarize or remove
seller motivation → remove
negotiation memo → remove
```

---

## 14. Code Organization Rules

Recommended folder structure:

```text
src/
  app/
  components/
  lib/
    supabase/
    ai/
  domain/
    building/
    buyer-intent/
    documents/
    gates/
    analytics/
  ai/
    agents/
    prompts/
    schemas/
  types/
```

Rules:

```text
- UI components should not contain business logic.
- Domain services should own business rules.
- API routes should validate input and call domain services.
- AI agents should expose typed functions.
- DB access should go through typed Supabase clients.
```

---

## 15. API Implementation Rules

Every API route must define:

```text
request schema
response schema
auth requirement
side effects
activity event
error cases
```

API routes must not:

```text
return private truth fields to public clients
perform unvalidated AI writes
skip event logging
skip auth/RLS consideration
```

---

## 16. Database Rules

Every table must define:

```text
purpose
columns
relationships
indexes
RLS policy
example row
acceptance criteria
```

Every exposed table must have RLS enabled.

Do not create migration files without checking `07-database-schema.md`.

---

## 17. UI Implementation Rules

Use the UI/UX spec as source of truth.

Core UI patterns:

```text
Purpose Selector
Address Input
Memo Input
AI Progress Steps
Insight Card
Risk Question Card
SSoT Readiness Card
Disclosure Guard Card
Blind Teaser Preview
Kakao Copy Button
Sticky Action Bar
Gate Level Badge
Expert Note CTA
Missing Data Checklist
Document Status Badge
```

UX writing must follow safe language rules.

---

## 18. Testing Rules

Every slice must include at least one meaningful validation path.

Minimum tests by category:

```text
Unit:
- Zod schema validation
- disclosure redaction
- readiness scoring

API:
- request validation
- auth behavior
- event logging

E2E:
- happy path for major flows
- no sensitive leakage in blind teaser

AI:
- structured output parse
- forbidden claim detection
```

---

## 19. Slice Completion Rule

A slice is not complete until:

```text
1. Required docs were read.
2. Feature compiles.
3. Typecheck passes.
4. API validates inputs.
5. Relevant DB rows are created.
6. activity_event is logged.
7. Sensitive fields are protected.
8. Mobile UI is usable.
9. Acceptance criteria pass.
10. Demo path is documented.
```

---

## 20. Single-lane Execution Rule

Implement one slice at a time.

Do not begin the next slice until the current slice passes:

```text
typecheck
unit tests if applicable
basic manual demo
acceptance criteria
```

Single-lane order:

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

## 21. Commit / Change Discipline

Suggested commit format:

```text
feat(building): add Building SSoT Lite schema
feat(public): implement building radar flow
feat(broker): add memo-to-deal-card flow
feat(ai): add disclosure guard agent
test(disclosure): verify blind teaser redaction
```

Do not mix unrelated slices in one commit.

---

## 22. Failure Handling

When something is ambiguous:

```text
1. Check docs.
2. Prefer narrower implementation.
3. Preserve safety and disclosure rules.
4. Leave TODO with clear reason.
5. Do not invent product behavior.
```

When AI output fails validation:

```text
1. Do not store as final object.
2. Store ai_run with error.
3. Return user-friendly retry message.
4. Suggest more specific input.
```

User-facing failure copy:

```text
이번 생성은 완료하지 못했습니다.
입력 내용이 너무 짧거나 건물 정보를 식별하기 어려웠습니다.
메모를 조금 더 추가해 다시 시도해주세요.
```

---

## 23. Mandatory Boundary Copy

Any report or AI-generated document must include boundary language when relevant:

```text
이 자료는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다.
가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.
상세 검토에는 추가 자료와 전문가 확인이 필요합니다.
```

---

## 24. What Good Implementation Looks Like

A good implementation feels simple to the user:

```text
paste memo
→ get deal card
→ copy message
```

But stores structured data behind the scenes:

```text
building_ssot_lite
building_signal_card
document_object
activity_event
ai_run
```

---

## 25. Final Reminder

Do not build a generic real estate platform.

Do not build a valuation tool.

Do not build a full CRM.

Build the smallest reliable loop:

```text
small input
→ Building SSoT Lite
→ safe signal
→ useful document
→ conversion CTA
→ activity event
```
