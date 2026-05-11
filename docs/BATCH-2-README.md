# Batch 2 README — Domain / Governance Lock

This batch defines the domain model, gate/disclosure policy, and event analytics contracts for JS Building SSoT MVP v0.1.

## Included documents

```text
docs/03-domain-model.md
docs/11-gate-disclosure-policy.md
docs/13-event-analytics.md
```

## Purpose

Batch 2 locks the core governance layer that every later technical, AI, API, and UI implementation must follow.

It answers:

```text
- What are the core domain objects?
- How does Building SSoT Lite relate to Signal, Document, Gate, and Event?
- Which information can be shown publicly or blindly?
- Which information must remain internal or blocked?
- What events must be recorded to prove product usage and build future data moat?
```

## Critical implementation rules

```text
1. Every useful building workflow starts with building_ssot_lite.
2. Every public/blind output is derived from building_signal_card or document_object.
3. Truth and Signal must be separated.
4. Exact address, tenant names, unit rent, and seller motivation must not appear in blind outputs.
5. Every meaningful mutation must create activity_event.
6. Every AI run must be logged in ai_run.
7. Every generated document must have source_refs and visibility.
```

## Next batch

Batch 3 should create the technical implementation contracts:

```text
docs/06-technical-architecture.md
docs/07-database-schema.md
docs/08-api-contracts.md
docs/12-security-rls-storage.md
```
