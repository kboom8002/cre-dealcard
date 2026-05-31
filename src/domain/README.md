# Domain Layer

This folder contains domain services for JS Building SSoT MVP v0.1.

## Core domain objects

- `building/` — building_ssot_lite, building_signal_card
- `buyer-intent/` — buyer_intent_lite
- `owner/` — owner_readiness_checks
- `documents/` — document_objects (deal curiosity report, blind teaser, buyer memo, etc.)
- `gates/` — gate_requests, expert_note_requests
- `analytics/` — activity_events

## Rules

- Domain services are the only layer allowed to create core objects.
- UI components must not contain business logic.
- API routes validate input and call domain services.
- Every mutation must log an activity_event.
