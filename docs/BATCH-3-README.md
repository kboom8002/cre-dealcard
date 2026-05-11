# Batch 3 README — Tech / DB / API Contracts

## Completed Documents

```text
/docs
├─ 06-technical-architecture.md
├─ 07-database-schema.md
├─ 08-api-contracts.md
├─ 12-security-rls-storage.md
└─ BATCH-3-README.md
```

## Purpose

Batch 3 converts the product/domain definitions from Batch 1 and Batch 2 into implementation contracts for:

- Next.js App Router
- Supabase Postgres/Auth/RLS/Storage
- AI orchestration
- API route handlers
- Security and disclosure policy

## Document Summary

### 06-technical-architecture.md

Defines the overall system architecture:

```text
Client
→ Next.js App Router
→ Route Handlers / Server Actions
→ Domain Services
→ Supabase
→ AI Orchestration
→ Documents / Gates / Events
```

Includes:

- Runtime components
- Repo layout
- Route groups
- Data flows
- AI orchestration principles
- Storage and queue strategy
- Environment variables
- Acceptance criteria

### 07-database-schema.md

Defines the Supabase Postgres schema for MVP v0.1.

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

Includes:

- Table purposes
- SQL columns
- Indexes
- RLS patterns
- Example rows
- Acceptance criteria

### 08-api-contracts.md

Defines the API route contracts.

Core APIs:

```text
POST /api/public/building-radar/generate
GET  /api/public/building-radar/:id
POST /api/broker/deal-card/from-memo
POST /api/broker/buyer-intents/from-memo
POST /api/broker/buyer-memo/generate
POST /api/owner-readiness/check
POST /api/gate-requests
PATCH /api/gate-requests/:id/review
POST /api/expert-note/request
POST /api/events
```

Includes:

- Auth requirements
- Request/response schemas
- Side effects
- Activity events
- Disclosure rules
- Acceptance criteria

### 12-security-rls-storage.md

Defines security and governance requirements.

Includes:

- Role model
- RLS principles
- Public/anonymous report policy
- Private truth fields
- Gate levels
- Storage buckets
- Evidence file handling
- AI security rules
- Tool/MCP boundaries
- Activity event privacy rules
- Admin access rules

## Batch 3 Quality Gate

Batch 3 is complete only if:

```text
- DB schema supports every MVP module from Batch 1.
- API contracts map to domain objects from Batch 2.
- RLS/security rules prevent cross-user access.
- Disclosure policy prevents sensitive data leakage.
- Every mutation has an activity_event side effect.
- AI output is treated as draft unless reviewed.
```

## Next Batch

Batch 4 should produce:

```text
09-ai-agent-contracts.md
10-prompt-contracts.md
/docs/examples/*
```

Batch 4 will define the AI agents, prompt contracts, schemas, forbidden claims, examples, and evaluation fixtures used by the implementation.
