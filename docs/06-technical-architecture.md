# 06. Technical Architecture — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines the technical architecture for **JS Building SSoT MVP v0.1**, implemented with:

- Next.js App Router
- TypeScript
- Supabase Postgres/Auth/RLS/Storage/Queues/Realtime
- AI API via an AI orchestration layer
- Zod structured outputs
- Mobile-first UI

The goal is not to build a generic proptech platform. The goal is to build a reliable, secure, AI-assisted CRE deal document copilot that turns a small input into structured deal artifacts:

```text
address or broker memo
→ building_ssot_lite
→ building_signal_card
→ document_object
→ gate_request_lite / expert_note_request
→ activity_event
```

## 2. Scope

This architecture covers MVP v0.1 only.

### Included

- Public Building Radar
- Broker 1-minute Deal Card
- Buyer Intent Lite
- Buyer Memo Lite
- Owner Readiness Lite
- Blind Teaser Generator
- Gate Request Lite
- Expert Note Request
- Activity Analytics v1
- Admin Console v1

### Excluded

- Full Dealroom
- Advanced matching engine
- Full Auto IM
- Full Expert Marketplace
- Payment/settlement automation
- Automatic valuation, investment advice, legal/tax/debt conclusions

## 3. High-Level Architecture

```text
Mobile/Web Client
  ↓
Next.js App Router
  ↓
Server Components / Client Components
  ↓
Server Actions / Route Handlers
  ↓
Domain Service Layer
  ↓
Supabase Postgres + Auth + RLS + Storage + Queues
  ↓
AI Orchestration Layer
  ↓
Structured Output Validation
  ↓
Document / Gate / Event Persistence
```

## 4. Core Runtime Components

| Component | Responsibility |
|---|---|
| Next.js App Router | Routing, rendering, API endpoints, server actions |
| TypeScript | Type safety across app, domain, DB, AI contracts |
| Supabase Postgres | Source of truth for SSoT, intents, documents, gates, events |
| Supabase Auth | User/session management |
| Supabase RLS | Row-level authorization and tenant isolation |
| Supabase Storage | Evidence files and export artifacts |
| Supabase Queues | Async AI/document jobs if needed |
| Supabase Realtime | Admin/Broker live updates in later slice |
| AI Orchestration Layer | Structured AI runs, prompt versioning, tool boundaries |
| Zod | Runtime validation for API input/output and AI structured outputs |
| Activity Event Store | Product analytics, audit trail, future learning data |

## 5. Recommended Repository Layout

```text
src/
├─ app/
│  ├─ (public)/
│  │  ├─ page.tsx
│  │  ├─ building-radar/
│  │  ├─ owner-readiness/
│  │  └─ expert-note/
│  ├─ (broker)/
│  │  └─ broker/
│  ├─ (admin)/
│  │  └─ admin/
│  └─ api/
├─ components/
│  ├─ ui/
│  ├─ cards/
│  ├─ forms/
│  ├─ layout/
│  └─ feedback/
├─ domain/
│  ├─ building/
│  ├─ buyer-intent/
│  ├─ owner-readiness/
│  ├─ documents/
│  ├─ gates/
│  └─ analytics/
├─ ai/
│  ├─ agents/
│  ├─ prompts/
│  ├─ schemas/
│  └─ run-ai.ts
├─ lib/
│  ├─ supabase/
│  ├─ auth/
│  ├─ env/
│  └─ utils/
└─ types/
```

## 6. Route Groups

### Public Routes

```text
/
/building-radar
/building-radar/result/[id]
/owner-readiness
/expert-note/request
```

### Broker Routes

```text
/broker
/broker/deal-card/new
/broker/deal-card/[id]
/broker/buyer-intents/new
/broker/buyer-intents/[id]
```

### Admin Routes

```text
/admin
/admin/expert-notes
/admin/gate-requests
/admin/analytics
```

### API Routes

```text
/api/public/building-radar/generate
/api/broker/deal-card/from-memo
/api/broker/deal-card/[id]/generate-teaser
/api/broker/buyer-intents/from-memo
/api/broker/buyer-memo/generate
/api/owner-readiness/check
/api/gate-requests
/api/gate-requests/[id]/review
/api/expert-note/request
/api/events
```

## 7. Data Flow: Public Building Radar

```text
User enters address + purpose
  ↓
POST /api/public/building-radar/generate
  ↓
Address/Memo parser normalizes input
  ↓
Building SSoT Lite service creates building_ssot_lite
  ↓
DealCuriosityWriterAgent generates structured report
  ↓
DisclosureGuardAgent validates public-safe output
  ↓
document_object inserted as deal_curiosity_report
  ↓
activity_events logged
  ↓
Result page renders report
```

## 8. Data Flow: Broker 1-Minute Deal Card

```text
Broker pastes Kakao-style memo
  ↓
POST /api/broker/deal-card/from-memo
  ↓
MemoParserAgent extracts raw facts/signals
  ↓
BuildingMiniTruthAgent creates building_ssot_lite
  ↓
DisclosureGuardAgent identifies hidden fields
  ↓
SignalComposerAgent creates building_signal_card
  ↓
Document service creates blind_teaser document_object
  ↓
activity_events logged
  ↓
Broker sees card + Kakao copy text
```

## 9. AI Orchestration Principles

AI must be treated as a structured generation service, not an autonomous decision-maker.

### Required Rules

```text
1. Every AI call uses a typed input schema.
2. Every AI output is validated with Zod before persistence.
3. Every AI run is logged in ai_runs.
4. Prompt version and model version are recorded.
5. AI-generated documents start as draft.
6. AI must not generate price recommendation, investment advice, legal/tax/debt conclusions.
7. Public/blind outputs must pass Disclosure Guard.
```

## 10. AI Model Abstraction

Use an internal interface so the implementation can use OpenAI, Claude, Gemini, or gateway routing without changing domain logic.

```ts
export interface AiModelClient {
  generateObject<T>(args: {
    schemaName: string;
    promptVersion: string;
    input: unknown;
    schema: ZodSchema<T>;
  }): Promise<{ output: T; usage?: unknown; model: string }>;
}
```

## 11. Domain Services

Domain services are the only layer allowed to create core objects.

```text
buildingService
- createSsotLiteFromAddress
- createSsotLiteFromMemo
- createSignalCard

documentService
- createDealCuriosityReport
- createBlindTeaser
- createBuyerMemo
- createOwnerPrepMemo

gateService
- createGateRequest
- reviewGateRequest

analyticsService
- recordEvent
```

## 12. Storage Architecture

### Buckets

```text
evidence-private
public-cards
document-exports
```

### Bucket Rules

| Bucket | Default | Use |
|---|---|---|
| evidence-private | private | uploaded evidence, registers, rent rolls, photos |
| public-cards | public or signed | redacted card images only |
| document-exports | private | PDF/markdown/pptx exports |

## 13. Queue / Async Jobs

MVP can run most AI calls synchronously. Use queue when latency or retries matter.

Recommended queues:

```text
queue_public_report
queue_document_generation
queue_analytics_rollup
queue_expert_note
```

## 14. Realtime Strategy

MVP v0.1 can ship without complex realtime. Admin/Broker updates may later use Supabase Realtime.

Potential use cases:

```text
- expert note request received
- gate request status changed
- AI document generation completed
- admin analytics live refresh
```

## 15. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
AI_DEFAULT_MODEL=
APP_BASE_URL=
```

Rules:

```text
- SUPABASE_SERVICE_ROLE_KEY must never be exposed to the browser.
- AI API keys must only be used server-side.
- Public env vars must not contain secrets.
```

## 16. Acceptance Criteria

- Next.js app can render public, broker, and admin shells.
- API routes call domain services, not raw DB writes everywhere.
- Supabase tables are accessed through typed clients.
- AI outputs are schema-validated before persistence.
- Every major mutation writes an activity_event.
- Public/blind output never exposes private fields.
- RLS is enabled on exposed tables.

## 17. Non-goals

- Multi-tenant enterprise org structure
- Payment and billing
- Full file-based data room
- Advanced semantic matching
- Automated legal/tax/valuation conclusions
- Full Expert Marketplace

## 18. References

- `/docs/00-product-brief.md`
- `/docs/02-mvp-scope.md`
- `/docs/03-domain-model.md`
- `/docs/11-gate-disclosure-policy.md`
- `/docs/13-event-analytics.md`
