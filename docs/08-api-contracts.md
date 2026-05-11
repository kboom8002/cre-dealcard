# 08. API Contracts — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines API contracts for JS Building SSoT MVP v0.1.

APIs must support the core product loop:

```text
input
→ building_ssot_lite
→ building_signal_card
→ document_object
→ gate_request_lite / expert_note_request
→ activity_event
```

## 2. API Design Principles

```text
1. Validate every request with Zod.
2. Return typed responses.
3. All mutations must record activity_event.
4. AI outputs must be validated before storing.
5. Public/blind responses must not include private_truth fields.
6. API handlers call domain services, not scattered raw DB operations.
7. Errors must be user-safe and not leak secrets or private deal data.
```

## 3. Common Response Shapes

### Success

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

### Error

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해주세요."
  }
}
```

## 4. Error Codes

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
AI_GENERATION_FAILED
DISCLOSURE_VIOLATION
RATE_LIMITED
INTERNAL_ERROR
```

---

# 5. POST /api/public/building-radar/generate

## Purpose

Generate a public Deal Curiosity Report from address or raw building input.

## Auth

Optional.

- Anonymous users may generate a report.
- Authenticated users may save it to their account.

## Request Schema

```ts
const PublicBuildingRadarGenerateRequest = z.object({
  input: z.string().min(2),
  inputType: z.enum(['address','manual_text']).default('address'),
  userPurpose: z.enum([
    'sell_consideration',
    'buy_consideration',
    'owner_user_hq',
    'broker_work',
    'investment_learning'
  ]),
});
```

## Response Schema

```ts
const PublicBuildingRadarGenerateResponse = z.object({
  buildingId: z.string().uuid(),
  reportId: z.string().uuid(),
  status: z.enum(['completed','queued']),
});
```

## Side Effects

Creates:

```text
building_ssot_lite
document_object: deal_curiosity_report
activity_event: address_submitted or manual_text_submitted
activity_event: building_ssot_lite_created
activity_event: deal_curiosity_report_generated
ai_run
```

## Disclosure Rules

Must not return:

```text
exact_address if marked hidden
tenant_name
unit_rent
seller_motivation
private internal notes
```

## Acceptance Criteria

- Valid input creates building_ssot_lite.
- Report document is stored as `draft` or `disclosure_checked`.
- Result page can render with returned IDs.
- No investment recommendation is included.

---

# 6. GET /api/public/building-radar/:id

## Purpose

Fetch public-safe report result.

## Auth

Optional, but anonymous result access should be tokenized or limited.

## Response

```ts
const PublicBuildingRadarResultResponse = z.object({
  building: z.object({
    id: z.string().uuid(),
    areaSignal: z.string().nullable(),
    assetType: z.string().nullable(),
    status: z.string(),
  }),
  report: z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    body: z.record(z.any()),
    markdown: z.string().nullable(),
  }),
});
```

## Acceptance Criteria

- Only public-safe fields are returned.
- No raw_input is returned to public users unless owner.

---

# 7. POST /api/broker/deal-card/from-memo

## Purpose

Create Building Mini Truth, Building Signal Card, and Blind Teaser from broker memo.

## Auth

Required. User role should be broker or admin for broker workspace.

## Request Schema

```ts
const BrokerDealCardFromMemoRequest = z.object({
  memo: z.string().min(5),
  visibilityPreference: z.enum(['blind','internal']).default('blind'),
});
```

## Response Schema

```ts
const BrokerDealCardFromMemoResponse = z.object({
  buildingId: z.string().uuid(),
  signalCardId: z.string().uuid(),
  teaserDocId: z.string().uuid(),
  hiddenFields: z.array(z.string()),
});
```

## Side Effects

Creates:

```text
building_ssot_lite
building_signal_card
document_object: blind_teaser
activity_event: broker_memo_submitted
activity_event: building_ssot_lite_created
activity_event: building_signal_card_created
activity_event: blind_teaser_generated
ai_run rows
```

## Disclosure Rules

Blind teaser must not include:

```text
exact_address
tenant_name
unit_rent
seller_motivation
negotiation_memo
```

## Acceptance Criteria

- Broker can paste memo and receive blind teaser.
- hiddenFields are shown in response.
- document_object status starts as draft or disclosure_checked.

---

# 8. POST /api/broker/deal-card/:id/generate-teaser

## Purpose

Regenerate or create a blind teaser from an existing building_ssot_lite row.

## Auth

Required. Owner broker or admin.

## Request Schema

```ts
const GenerateTeaserRequest = z.object({
  tone: z.enum(['concise','professional','kakao']).default('kakao'),
});
```

## Response

```ts
const GenerateTeaserResponse = z.object({
  teaserDocId: z.string().uuid(),
  markdown: z.string(),
  hiddenFields: z.array(z.string()),
});
```

## Side Effects

Creates:

```text
document_object: blind_teaser
activity_event: blind_teaser_generated
```

---

# 9. POST /api/broker/buyer-intents/from-memo

## Purpose

Normalize buyer memo into structured Buyer Intent Lite.

## Auth

Required for broker workspace.

## Request Schema

```ts
const BuyerIntentFromMemoRequest = z.object({
  memo: z.string().min(5),
});
```

## Response Schema

```ts
const BuyerIntentFromMemoResponse = z.object({
  buyerIntentId: z.string().uuid(),
  summary: z.object({
    budgetDisplay: z.string().nullable(),
    preferredRegions: z.array(z.string()),
    purchasePurpose: z.string().nullable(),
    mustHave: z.array(z.string()),
  }),
});
```

## Side Effects

Creates:

```text
buyer_intent_lite
activity_event: buyer_intent_created
ai_run
```

## Acceptance Criteria

- Raw memo is preserved in buyer_intent_lite.
- Structured fields are populated where inferable.
- Missing data is captured in normalized JSON.

---

# 10. POST /api/broker/buyer-memo/generate

## Purpose

Generate a buyer-friendly memo from Building SSoT Lite and Buyer Intent Lite.

## Auth

Required. User must own both or have admin rights.

## Request Schema

```ts
const BuyerMemoGenerateRequest = z.object({
  buildingId: z.string().uuid(),
  buyerIntentId: z.string().uuid(),
  tone: z.enum(['kakao','professional','brief']).default('kakao'),
});
```

## Response Schema

```ts
const BuyerMemoGenerateResponse = z.object({
  documentId: z.string().uuid(),
  fitReasons: z.array(z.string()),
  cautionReasons: z.array(z.string()),
  missingData: z.array(z.string()),
  recommendedNextAction: z.string(),
  kakaoMessage: z.string(),
});
```

## Side Effects

Creates:

```text
document_object: buyer_fit_memo
activity_event: buyer_memo_generated
ai_run
```

## Must Not

```text
- say this is a guaranteed match
- recommend purchase as final advice
- expose buyer private contact outside authorized scope
```

---

# 11. POST /api/owner-readiness/check

## Purpose

Create owner readiness score and missing data checklist.

## Auth

Optional for basic check; authenticated required to save long-term.

## Request Schema

```ts
const OwnerReadinessCheckRequest = z.object({
  buildingId: z.string().uuid().optional(),
  checklist: z.object({
    buildingRegister: z.boolean().default(false),
    registry: z.boolean().default(false),
    landUsePlan: z.boolean().default(false),
    rentRoll: z.boolean().default(false),
    photos: z.boolean().default(false),
    floorPlan: z.boolean().default(false),
    repairHistory: z.boolean().default(false),
    vacancyStatus: z.boolean().default(false),
    askingPrice: z.boolean().default(false),
    disclosurePolicy: z.boolean().default(false),
  }),
});
```

## Response Schema

```ts
const OwnerReadinessCheckResponse = z.object({
  readinessCheckId: z.string().uuid(),
  readinessScore: z.number().min(0).max(100),
  availableOutputs: z.array(z.string()),
  missingData: z.array(z.string()),
  nextRecommendedAction: z.string(),
});
```

## Side Effects

Creates:

```text
owner_readiness_check
document_object: missing_data_checklist optional
activity_event: owner_readiness_checked
```

---

# 12. POST /api/gate-requests

## Purpose

Request access to higher-disclosure information.

## Auth

Required.

## Request Schema

```ts
const GateRequestCreateRequest = z.object({
  buildingId: z.string().uuid(),
  requestedLevel: z.enum(['G1','G2','G3']),
  requestedFields: z.array(z.string()).default([]),
  reason: z.string().optional(),
});
```

## Response

```ts
const GateRequestCreateResponse = z.object({
  gateRequestId: z.string().uuid(),
  status: z.enum(['submitted','broker_review']),
});
```

## Side Effects

Creates:

```text
gate_request
activity_event: gate_request_created
```

## Acceptance Criteria

- Request is created with status submitted.
- No protected data is returned.

---

# 13. PATCH /api/gate-requests/:id/review

## Purpose

Allow broker/admin to approve or reject a gate request.

## Auth

Required. Admin or target broker only.

## Request Schema

```ts
const GateRequestReviewRequest = z.object({
  decision: z.enum(['approved','rejected']),
  reviewerNote: z.string().optional(),
});
```

## Response

```ts
const GateRequestReviewResponse = z.object({
  gateRequestId: z.string().uuid(),
  status: z.enum(['approved','rejected']),
  reviewedAt: z.string(),
});
```

## Side Effects

Updates:

```text
gate_request.status
gate_request.reviewed_at
gate_request.reviewer_id
```

Creates:

```text
activity_event: gate_request_reviewed
```

---

# 14. POST /api/expert-note/request

## Purpose

Create an Expert 3-line Note request.

## Auth

Optional, but contact details required if anonymous.

## Request Schema

```ts
const ExpertNoteRequestCreateRequest = z.object({
  buildingId: z.string().uuid().optional(),
  aiReportId: z.string().uuid().optional(),
  userGoal: z.enum([
    'my_building',
    'buy_consideration',
    'client_listing',
    'client_recommendation',
    'learning'
  ]),
  contact: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
  memo: z.string().optional(),
});
```

## Response

```ts
const ExpertNoteRequestCreateResponse = z.object({
  requestId: z.string().uuid(),
  status: z.enum(['requested']),
});
```

## Side Effects

Creates:

```text
expert_note_request
activity_event: expert_note_requested
```

---

# 15. POST /api/events

## Purpose

Record client-side or server-side activity event.

## Auth

Optional for public events; authenticated events should include actor_id server-side.

## Request Schema

```ts
const ActivityEventCreateRequest = z.object({
  eventType: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  metadata: z.record(z.any()).default({}),
});
```

## Response

```ts
const ActivityEventCreateResponse = z.object({
  eventId: z.string().uuid(),
});
```

## Security Rule

Do not accept or store raw sensitive values in client-provided metadata.

---

# 16. API Implementation Pattern

Every route handler should follow:

```text
1. Parse request JSON.
2. Validate with Zod.
3. Resolve auth/session if required.
4. Call domain service.
5. Domain service writes DB rows.
6. Domain service records activity_event.
7. Return typed response.
8. Catch and map errors safely.
```

## Example Skeleton

```ts
export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = Schema.parse(json);
    const result = await domainService.action(input);
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
```

## 17. Non-goals

- GraphQL API
- Public raw SQL access
- Full REST coverage for all tables
- Client-side writes bypassing domain rules
- Exposing service role via route responses
