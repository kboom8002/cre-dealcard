# 00. Product Brief — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines the product intent, users, core loops, and success criteria for **JS Building SSoT MVP v0.1**. It is the first document every AI-pair coding agent must read before implementation.

The MVP is not a generic real estate listing portal, not an automatic valuation engine, and not a full CRM. It is a mobile-first, AI-first **CRE deal document copilot** that turns a small input — an address, lot number, or Kakao-style broker memo — into structured pre-deal intelligence.

---

## 2. Product Names

| Type | Name |
|---|---|
| System name | JS Building SSoT MVP v0.1 |
| Public product name | 이 건물, 딜 될까? |
| Broker product name | JS 1분 딜카드 |
| Category | CRE AI Deal Card Copilot |

---

## 3. One-line Definition

**JS Building SSoT MVP v0.1 is a mobile-first CRE AI deal document copilot that turns a lot number, address, or Kakao-style broker memo into Building SSoT Lite, then generates deal curiosity reports, blind deal cards, buyer memos, owner prep memos, and conversion paths toward Expert Note, Snapshot, Full IM, and Deal OS.**

Korean working definition:

> **지번 또는 카톡 매물 메모를 입력하면 Building SSoT Lite를 생성하고, 이를 기반으로 딜 질문 리포트·블라인드 딜카드·Buyer Memo·Owner Prep Memo를 만들며, Expert Note·Snapshot·Full IM·Deal OS로 전환시키는 상업용 부동산 AI 딜문서 코파일럿.**

---

## 4. Why This Product Exists

Small and mid-sized commercial real estate brokerage workflows are fragmented across broker memory, KakaoTalk messages, phone calls, Excel sheets, loose files, informal descriptions, and private networks.

The MVP converts this fragmented workflow into structured objects:

```text
broker memo / address / lot number
→ Building SSoT Lite
→ Building Signal Card
→ Document Object
→ Buyer Intent Lite
→ Gate Request Lite
→ Activity Event
```

The user experiences a simple utility. The system quietly builds an AI-ready building truth infrastructure.

---

## 5. Core Product Hypotheses

### Broker Hypothesis

If a broker can paste a Kakao-style property memo and receive a safe, blind, buyer-shareable deal card in under one minute, they will reuse the tool.

### Owner Hypothesis

If an owner can enter a lot number or address and see how their building may be perceived by buyers, they will request readiness checks, Expert Notes, or IM support.

### Buyer Hypothesis

If a buyer can see why a building may or may not fit their purpose, they will request more detailed documents or contact a broker.

### Platform Hypothesis

Every generated report, deal card, memo, gate request, and expert note request becomes structured data that strengthens JS Building SSoT and future Deal Intelligence.

---

## 6. Primary Users

## 6.1 Public Users

### Building Owner

Primary jobs:

- understand how their building may be perceived
- check sale readiness
- know what documents are missing
- request Expert Note or IM support

Primary entry:

```text
Public Building Radar
→ Owner Readiness Lite
→ Expert Note
→ Snapshot / Full IM consultation
```

### Buyer / Investor

Primary jobs:

- evaluate whether a building is worth further review
- identify risks and missing data
- check owner-user or investment fit

Primary entry:

```text
Public Building Radar
→ risk questions
→ qualified inquiry
→ gate request
```

### Corporate Owner-user Buyer

Primary jobs:

- assess whether a building may work as company HQ
- compare own-use and partial-income possibilities

Primary entry:

```text
Purpose: 법인 사옥 검토
→ building fit questions
→ buyer memo
→ broker inquiry
```

---

## 6.2 Broker Users

### JS Internal Broker

Primary jobs:

- turn raw deal notes into shareable outputs
- protect sensitive information
- structure buyer conditions
- create buyer-facing explanations
- request gates for deeper disclosure

Primary entry:

```text
Kakao memo
→ 1-minute deal card
→ buyer memo
→ gate request
```

### External Broker / Pilot Broker

Primary jobs:

- create professional deal cards quickly
- avoid leaking exact address or tenant information
- impress owners and buyers with structured memos

---

## 6.3 Admin / Expert Users

MVP v0.1 does not include a full expert marketplace.

Admin and expert users only need basic workflows:

```text
Expert Note request review
Gate Request review
Activity / analytics monitoring
```

---

## 7. Core Product Loops

## 7.1 Public Lead Loop

```text
address or lot number input
→ Building SSoT Lite
→ Deal Curiosity Report
→ Building SSoT readiness state
→ Blind Deal Card CTA
→ Expert Note / IM consultation CTA
```

## 7.2 Broker Reuse Loop

```text
Kakao property memo
→ Building Mini Truth
→ Building Signal Card
→ Blind Deal Card
→ Kakao copy
→ Buyer Intent connection
→ Buyer Memo
→ Gate Request
```

## 7.3 Buyer Intent Loop

```text
buyer condition memo
→ Buyer Intent Lite
→ match with Building Signal
→ Buyer Memo Lite
→ next action recommendation
```

## 7.4 Owner Readiness Loop

```text
owner readiness checklist
→ readiness score
→ missing data checklist
→ Expert Note request
→ Snapshot / Full IM consultation
```

## 7.5 Data Loop

```text
user input
→ structured object
→ document object
→ gate / expert request
→ activity event
→ analytics
→ future training/evaluation data
```

---

## 8. MVP Outputs

The MVP must generate these output types:

```text
deal_curiosity_report
blind_teaser
buyer_fit_memo
owner_prep_memo
missing_data_checklist
gate_request_note
```

Each output must be stored as a `document_object`.

AI-generated outputs are always `draft` unless explicitly reviewed.

---

## 9. Core System Objects

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

---

## 10. Product Rules

### 10.1 Small Input Rule

The user should not complete a long form before receiving value.

Preferred inputs:

```text
address
lot number
Kakao-style broker memo
buyer condition memo
owner readiness checklist
```

### 10.2 Immediate Output Rule

Every core flow should return a useful artifact:

```text
report
deal card
memo
readiness score
missing data checklist
expert note request
```

### 10.3 Truth / Signal Rule

Private truth and public signal must be separated.

Protected fields include:

```text
exact address
tenant name
unit-level rent
seller motivation
negotiation memo
private broker memo
```

### 10.4 Draft Rule

All AI-generated documents are drafts by default.

External sharing requires:

```text
disclosure check
document status
visibility level
review state when applicable
```

### 10.5 Event Rule

Every important mutation must create an `activity_event`.

---

## 11. Success Criteria

### 11.1 Public MVP Success

```text
1,000+ generated building reports
70%+ purpose selection rate
60%+ report completion rate
20%+ blind deal card creation rate
3–5% Expert Note request rate
10+ Snapshot / Full IM consultation requests
```

### 11.2 Broker Pilot Success

```text
20 invited brokers
10 active brokers
50+ Building Mini Truth records
100+ Blind Teasers
50+ Buyer Intents
30+ actual customer shares
10+ Gate Requests
0 sensitive information leakage incidents
```

### 11.3 Data Success

```text
Building SSoT Lite rows created
Building Signal Cards created
Buyer Intent Lite rows created
Document Objects created
Gate Requests created
Activity Events logged
AI Runs logged
```

---

## 12. Non-goals

The MVP must not implement:

```text
Full Dealroom
Advanced Match Algorithm
Full Auto IM
External Investor Membership
Complex Revenue-share Logic
Expert Marketplace
Automatic valuation
Investment recommendation
Legal/tax/debt judgment
Guaranteed cap rate / NOI
Automated closing workflow
```

---

## 13. Product Boundary Statement

This product does not provide:

```text
appraisal
investment advice
legal advice
tax advice
loan approval judgment
guaranteed return forecast
```

It provides:

```text
pre-deal questions
public signal organization
blind document generation
buyer/owner communication support
readiness and missing data identification
expert review conversion
```

---

## 14. Primary Demo Paths

```text
Demo A:
Public user enters address
→ receives Deal Curiosity Report
→ creates Blind Deal Card
→ requests Expert Note

Demo B:
Broker pastes Kakao property memo
→ generates Building Mini Truth
→ creates Blind Teaser
→ copies Kakao message

Demo C:
Broker pastes buyer condition memo
→ creates Buyer Intent Lite
→ connects to deal card
→ generates Buyer Memo

Demo D:
Owner checks readiness
→ sees missing data
→ requests Expert Note
```

---

## 15. Implementation Reminder

When implementing any feature, preserve this rule:

> **작은 입력을 받아 Building SSoT Lite를 만들고, 공개 가능한 Signal과 문서를 생성하며, 민감정보는 Gate로 보호하고, 모든 행동을 Event로 남긴다.**
