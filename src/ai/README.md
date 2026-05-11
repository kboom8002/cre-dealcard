# AI Layer

This folder contains AI agent implementations for JS Building SSoT MVP v0.1.

## Structure

- `agents/` — AI agent implementations (typed functions)
- `prompts/` — Prompt templates with version identifiers
- `schemas/` — Zod schemas for AI input/output validation
- `run-ai.ts` — AI model abstraction layer

## Rules

- Every AI call uses a typed input schema.
- Every AI output is validated with Zod before persistence.
- Every AI run is logged in ai_runs.
- Prompt version and model version are recorded.
- AI-generated documents start as draft.
- AI must not generate price recommendation, investment advice, legal/tax/debt conclusions.
- Public/blind outputs must pass DisclosureGuardAgent.
