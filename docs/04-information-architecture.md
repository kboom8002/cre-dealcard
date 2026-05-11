# 04. Information Architecture

## 1. Purpose

This document defines the information architecture, route structure, navigation model, and page hierarchy for **JS Building SSoT MVP v0.1**.

The product is mobile-first and AI-first. Users should not feel that they are operating a complex CRM or deal platform. They should feel that they are using a simple tool that turns a single address, broker memo, or buyer memo into a useful deal document.

Core product rule:

```text
Input is small.
Output is immediate.
Sensitive data is hidden.
Documents are draft by default.
Sharing is gate-based.
Every important action creates activity_event.
Every building starts as Building SSoT Lite.
```

---

## 2. Scope

This IA covers the MVP only.

Included:

```text
Public “이 건물, 딜 될까?” flow
Broker “JS 1분 딜카드” flow
Buyer Intent Lite flow
Owner Readiness Lite flow
Expert Note Request flow
Gate Request Lite flow
Admin Review / Analytics v1
```

Excluded:

```text
Full Dealroom
Advanced matching dashboard
Full Auto IM editor
Expert marketplace browsing
Payment/settlement
External investor membership
```

---

## 3. User Entry Points

### 3.1 Public User

Public users arrive through search, shared link, content, or direct link.

Primary jobs:

```text
내 건물이 매수자에게 어떻게 보일까?
이 건물은 검토할 만할까?
우리 회사 사옥으로 맞을까?
이 건물을 매각자료로 만들 수 있을까?
```

Primary entry:

```text
/building-radar
```

---

### 3.2 Broker User

Brokers arrive from internal JS usage, direct login, or shared pilot link.

Primary jobs:

```text
카톡 매물 설명을 딜카드로 만들기
매수자 조건을 정리하기
고객에게 보낼 답장 문구 만들기
건물주에게 준비자료 체크리스트 보내기
```

Primary entry:

```text
/broker
```

---

### 3.3 Admin / Reviewer

Admins and reviewers manage expert notes, gate requests, and analytics.

Primary jobs:

```text
전문가 코멘트 요청 확인
Gate 요청 승인/거절
민감정보 공개 여부 확인
MVP 사용 이벤트 확인
```

Primary entry:

```text
/admin
```

---

## 4. Route Map

### 4.1 Public Routes

```text
/
/building-radar
/building-radar/result/[id]
/owner-readiness
/expert-note/request
```

#### `/`

Purpose:

```text
Explain the product in one screen and route user to the right starting point.
```

Primary CTA:

```text
지번으로 딜 가능성 보기
```

Secondary CTA:

```text
블라인드 딜카드 만들기
내 건물 매각 준비도 체크
```

---

#### `/building-radar`

Purpose:

```text
Collect address or building name and user purpose.
```

Input:

```text
address_or_parcel
purpose
optional memo
```

Output:

```text
building_ssot_lite
Deal Curiosity Report document_object
activity_events
```

---

#### `/building-radar/result/[id]`

Purpose:

```text
Show generated Deal Curiosity Report and conversion CTAs.
```

Core cards:

```text
One-line diagnosis
Deal Curiosity Score
Risk questions
Deal points
Building SSoT readiness
Available outputs
Next actions
```

Primary CTA:

```text
블라인드 딜카드 만들기
```

Secondary CTAs:

```text
전문가 3줄 코멘트 요청
Full IM 가능 여부 확인
내 리포트 저장
```

---

#### `/owner-readiness`

Purpose:

```text
Check whether a building is ready for Snapshot or Full IM preparation.
```

Core cards:

```text
Readiness checklist
Owner Readiness Score
Available outputs
Missing data
Next action
```

---

#### `/expert-note/request`

Purpose:

```text
Convert high-intent public or broker user into Expert Note lead.
```

Input:

```text
building_id or report_id
relationship_to_building
request_goal
contact
memo
```

---

### 4.2 Broker Routes

```text
/broker
/broker/deal-card/new
/broker/deal-card/[id]
/broker/buyer-intents/new
/broker/buyer-intents/[id]
/broker/owner-readiness/[id]
```

#### `/broker`

Purpose:

```text
Mobile broker home focused on immediate creation tasks.
```

Primary actions:

```text
카톡 매물 → 1분 딜카드
매수자 조건 → 답장 문구
건물주 상담 → 준비 메모
```

Recent work:

```text
최근 딜카드
최근 Buyer Intent
최근 Gate 요청
최근 전문가 코멘트 요청
```

---

#### `/broker/deal-card/new`

Purpose:

```text
Paste broker memo and generate Building Mini Truth + Blind Deal Card.
```

Input:

```text
broker_memo
optional visibility preference
```

Output:

```text
building_ssot_lite
building_signal_card
blind_teaser document_object
activity_events
```

---

#### `/broker/deal-card/[id]`

Purpose:

```text
Review generated deal card, hidden fields, and sharing text.
```

Core cards:

```text
Building Signal Summary
Hidden Fields
Blind Teaser Preview
Kakao Message
Next Actions
```

Primary CTA:

```text
문구 복사
```

Secondary CTAs:

```text
매수자 조건과 연결
Gate 요청 만들기
Owner Prep Memo 만들기
```

---

#### `/broker/buyer-intents/new`

Purpose:

```text
Paste buyer condition memo and normalize it into Buyer Intent Lite.
```

---

#### `/broker/buyer-intents/[id]`

Purpose:

```text
Show Buyer Intent summary and generate Buyer Memo with selected building.
```

---

#### `/broker/owner-readiness/[id]`

Purpose:

```text
Check readiness for a broker-managed owner/building.
```

---

### 4.3 Admin Routes

```text
/admin
/admin/expert-notes
/admin/gate-requests
/admin/analytics
```

#### `/admin`

Purpose:

```text
Show pending review queues and key MVP metrics.
```

---

#### `/admin/expert-notes`

Purpose:

```text
List, review, and complete Expert Note requests.
```

---

#### `/admin/gate-requests`

Purpose:

```text
Approve/reject Gate Request Lite.
```

---

#### `/admin/analytics`

Purpose:

```text
Show event counts, conversion rates, and disclosure guard metrics.
```

---

## 5. Navigation Model

### 5.1 Public Bottom Navigation

```text
홈
리포트
딜카드
전문가
마이
```

MVP may implement this as a simple responsive bottom bar.

---

### 5.2 Broker Bottom Navigation

```text
홈
딜카드
매수자
요청
마이
```

Broker navigation must optimize for repeat use, not exploration.

---

### 5.3 Admin Navigation

```text
대시보드
전문가 요청
Gate 요청
Analytics
```

---

## 6. Page-Level Object Dependencies

| Page | Reads | Writes |
|---|---|---|
| `/building-radar` | none | building_ssot_lite, document_object, activity_event |
| `/building-radar/result/[id]` | building_ssot_lite, document_object | activity_event |
| `/broker/deal-card/new` | broker_profile | building_ssot_lite, building_signal_card, document_object, activity_event |
| `/broker/deal-card/[id]` | building_ssot_lite, building_signal_card, document_object | gate_request_lite, activity_event |
| `/broker/buyer-intents/new` | broker_profile | buyer_intent_lite, activity_event |
| `/broker/buyer-intents/[id]` | buyer_intent_lite, building_ssot_lite | buyer_memo document_object, activity_event |
| `/owner-readiness` | optional building_ssot_lite | owner_readiness_check, activity_event |
| `/expert-note/request` | building_ssot_lite, document_object | expert_note_request, activity_event |
| `/admin/expert-notes` | expert_note_requests | expert_note_request status update, activity_event |
| `/admin/gate-requests` | gate_requests | gate_request status update, activity_event |

---

## 7. State Model

### 7.1 Building State

```text
public_signal
ssot_lite
mini_ssot
snapshot_ready
im_ready
archived
```

MVP primarily uses:

```text
public_signal
ssot_lite
```

---

### 7.2 Document State

```text
draft
disclosure_checked
broker_reviewed
approved_internal
shared_external
blocked
```

MVP default:

```text
draft
```

---

### 7.3 Gate State

```text
submitted
broker_review
approved
rejected
expired
```

---

## 8. Acceptance Criteria

```text
Public user can complete address → report → expert note request flow.
Broker can complete memo → deal card → copy Kakao message flow.
Broker can complete buyer memo → buyer intent → buyer memo flow.
Owner readiness flow produces score and missing data checklist.
Admin can see expert note requests and gate requests.
All major flows create activity_event records.
No public/blind route exposes exact_address, tenant_name, unit_rent, seller_motivation.
```

---

## 9. Non-goals

```text
No full CRM navigation.
No complex dashboard as first screen.
No investor marketplace.
No full dealroom.
No payment pages.
No expert marketplace browsing.
```
