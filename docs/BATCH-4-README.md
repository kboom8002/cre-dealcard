# Batch 4 README — AI / Prompt / Guardrail Contracts

## 1. Batch Purpose

Batch 4 defines the AI behavior layer for JS Building SSoT MVP v0.1.

This batch prevents AI-pair coding agents from implementing uncontrolled chatbot behavior. Every AI output must be structured, versioned, logged, and guarded by disclosure/risk rules.

---

## 2. Files Included

```text
/docs
├─ 09-ai-agent-contracts.md
├─ 10-prompt-contracts.md
└─ BATCH-4-README.md

/docs/examples
├─ sample-building-memo.md
├─ sample-buyer-intent.md
├─ sample-owner-readiness.json
├─ sample-deal-curiosity-report.json
├─ sample-blind-teaser.md
├─ sample-buyer-memo.md
├─ sample-gate-request.json
└─ sample-activity-events.json
```

---

## 3. What This Batch Locks

Batch 4 locks the following:

```text
- MVP AI agent catalog
- agent input/output contracts
- forbidden outputs
- disclosure guard behavior
- prompt versioning rules
- risk boundary rewrite rules
- sample inputs and expected outputs
- test fixture candidates
```

---

## 4. Core AI Doctrine

```text
Small input.
Structured output.
Draft by default.
Truth / Signal separation.
No sensitive disclosure.
No investment/legal/tax/loan certainty.
```

---

## 5. Most Important Agent

The most important agent in this batch is:

```text
DisclosureGuardAgent
```

It must remove or generalize:

```text
- exact address
- tenant names
- unit-level rent
- seller motivation
- negotiation memo
- owner/buyer identity
- raw legal/lease/registry text
```

No public or blind document is acceptable if DisclosureGuardAgent rules are violated.

---

## 6. Most Important Prompt Contracts

P0 prompt contracts:

```text
prompt_building_mini_truth_v1
prompt_building_signal_v1
prompt_deal_curiosity_report_v1
prompt_blind_teaser_v1
prompt_disclosure_guard_v1
```

P1 prompt contracts:

```text
prompt_buyer_intent_normalizer_v1
prompt_buyer_memo_v1
prompt_owner_readiness_v1
prompt_risk_boundary_v1
```

---

## 7. AI Implementation Rules

When implementing AI calls:

```text
1. Always validate output against schema.
2. Always log ai_runs with model and prompt_version.
3. Always store generated documents as draft by default.
4. Always run DisclosureGuardAgent before public_blind output.
5. Always include boundary note in public reports.
6. Never expose private_truth fields in public APIs.
7. Never allow AI to directly mutate DB except through approved domain services.
```

---

## 8. Example Fixtures

The examples in `/docs/examples` should be used for:

```text
- unit tests
- prompt evaluation
- E2E fixture data
- demo generation
- disclosure regression tests
```

At minimum, tests should verify that the sample building memo does not leak:

```text
- exact address
- tenant name
- unit rent
- seller motivation
```

into the blind teaser.

---

## 9. Next Batch

Next batch should produce:

```text
04-information-architecture.md
05-ui-ux-spec.md
14-test-plan.md
15-implementation-slices.md
18-demo-scenarios.md
```

That batch will translate the product, domain, tech, and AI contracts into screens, tests, and implementation slices.
