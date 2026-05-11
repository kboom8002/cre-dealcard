# 19. Future Roadmap

## 1. Purpose

This document captures valuable future features that are intentionally excluded from JS Building SSoT MVP v0.1.

The purpose is to prevent scope creep during AI-pair coding. If an idea is useful but not part of v0.1, put it here instead of implementing it.

---

## 2. Current MVP Boundary

JS Building SSoT MVP v0.1 includes:

```text
- Building SSoT Lite Generator
- Public “이 건물, 딜 될까?” report
- Broker “JS 1분 딜카드”
- Buyer Intent Lite
- Buyer Memo Lite
- Owner Readiness Lite
- Blind Teaser Generator
- Gate Request Lite
- Expert Note Request
- Analytics v1
```

v0.1 excludes:

```text
- Full Dealroom
- Advanced matching algorithm
- Full Auto IM
- External investor membership
- Complex revenue-share logic
- Payment/settlement automation
- Expert marketplace
- Automatic valuation
- Investment recommendation
- Legal/tax/loan judgment
```

---

## 3. v0.2 — B-SSoT Studio Pro

### Goal

Let building owners and brokers progressively enrich Building SSoT beyond Lite.

### Features

```text
- Evidence upload wizard
- Lease summary input
- Photo/floor plan upload
- Repair history entry
- Public/private disclosure selector
- Completeness score by layer
- Missing data checklist
```

### Key Object Extensions

```text
building_ssot_full
evidence_files
building_layer_scores
disclosure_preferences
```

### Success Criteria

```text
- Users can improve a building from SSoT Lite to Mini SSoT.
- The system can say which documents are possible: teaser, snapshot, IM Lite, Full IM candidate.
```

---

## 4. v0.3 — Snapshot Draft / IM Lite

### Goal

Generate a 2~4 page External Snapshot and 8~12 page IM Lite from enriched Building SSoT.

### Features

```text
- Snapshot Draft generator
- IM Lite outline
- Property overview
- Location summary
- Risk questions
- Missing evidence appendix
- PDF export
```

### Guardrails

```text
- Draft watermark
- No valuation claims
- No guaranteed yield
- No legal/tax/loan certainty
```

---

## 5. v0.4 — Expert Patch Workbench

### Goal

Allow experts to review and patch specific Building SSoT layers.

### Expert Patch Types

```text
- CRE Consultant Patch
- Broker Deal Strategy Patch
- Legal Registry Patch
- Tax/Accounting Patch
- Building Condition Patch
- Valuation Logic Patch
- Debt/Finance Patch
- Market Demand Patch
```

### Features

```text
- Expert assignment
- Evidence binder
- AI draft vs expert revision
- Edit reason tags
- Visibility selector
- Patch approval status
```

### Dataset Impact

Expert patches become candidates for Golden Building/IM Dataset after redaction and consent checks.

---

## 6. v0.5 — Dealroom Lite

### Goal

Turn approved Snapshot/IM Lite into a controlled buyer-facing dealroom.

### Features

```text
- Buyer invite
- NDA status
- Gate-level field disclosure
- Q&A thread
- document activity tracking
- evidence disclosure log
```

### Excluded Until Later

```text
- Full due diligence room
- Contract workflow
- closing workflow
```

---

## 7. v0.6 — Semantic Match v1

### Goal

Match Buyer Intent and Building Signal with explainable fit/misfit/missing-data outputs.

### Features

```text
- Embeddings for building_signal_cards
- Embeddings for buyer_intent_lite
- Fit reason generator
- Misfit reason generator
- Missing data detector
- Match Case object
```

### Success Criteria

```text
- Broker can see why a building may fit a buyer.
- System never says “guaranteed match”.
- Every recommendation includes missing data.
```

---

## 8. v0.7 — Full IM Builder

### Goal

Generate Buyer-ready Full IM drafts from reviewed Building SSoT and Expert Patches.

### Sections

```text
- Cover & Confidentiality
- Executive Summary
- Investment Thesis
- Property Fact Sheet
- Land / Zoning
- Location / Market
- Building Condition
- Rent Roll
- Income / NOI / Yield
- Debt Sensitivity
- Valuation Logic
- Value-add Scenario
- Risk Factors
- Deal Process
- Q&A Starter
- Appendix / Evidence Index
- Disclaimer
```

### Guardrails

```text
- Full IM requires readiness score threshold
- Data Gate
- Disclosure Gate
- Risk Gate
- Human Review
- Expert Patch flags where needed
```

---

## 9. v0.8 — Golden Dataset Pipeline

### Goal

Collect structured, consented, redacted training examples from AI drafts, expert revisions, gate decisions, buyer reactions, and deal outcomes.

### Objects

```text
golden_examples
expert_revisions
disclosure_decisions
buyer_reactions
deal_outcomes
training_rights
redaction_status
```

### Dataset Grades

```text
G0 Raw Draft
G1 Expert Edited
G2 Expert Approved
G3 Multi-role Reviewed
G4 Buyer-tested
G5 Deal Outcome-linked
G6 Canonical Golden Set
```

---

## 10. v1.0 — Team DealHub SaaS

### Goal

Provide team-level SaaS for brokerage teams and small CRE advisory firms.

### Features

```text
- Team workspace
- Broker roles
- shared buildings
- shared buyer intents
- review queue
- gate management
- analytics dashboard
- branded broker pages
- white-label settings
```

### Monetization

```text
- Broker Deal Pack
- Team DealHub Lite
- Expert Patch credits
- Snapshot/IM credits
```

---

## 11. v1.1 — B-SSoT API / Partner Ecosystem

### Goal

Allow partner brokers, data providers, and expert networks to integrate Building SSoT workflows.

### API Areas

```text
- Building SSoT Lite creation
- Building Signal retrieval
- Buyer Intent creation
- Document generation
- Gate request
- Event ingestion
```

### Partner Types

```text
- CRE brokerage team
- proptech data provider
- legal/tax/building expert network
- asset management firm
- owner community
```

---

## 12. Deferred Ideas

Add any future idea here instead of implementing during v0.1.

| Idea | Why Deferred | Target Version |
|---|---|---|
| Full valuation engine | Legal/compliance risk and data requirement | v1.2+ |
| Loan feasibility engine | Requires lender-specific assumptions | v1.2+ |
| Tax calculator | Professional scope risk | v1.2+ |
| Investor marketplace | Regulatory and cold-start complexity | v1.5+ |
| Revenue-share marketplace | Operational/legal complexity | v1.5+ |
| Automated contract workflow | Not MVP; requires legal ops | v1.5+ |
| CRE crowdfunding / fractional investment | Regulatory complexity | separate product |
