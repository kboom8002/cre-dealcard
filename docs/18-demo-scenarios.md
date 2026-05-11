# 18. Demo Scenarios

## 1. Purpose

This document defines the primary demo scenarios for **JS Building SSoT MVP v0.1**.

Each scenario must be usable for:

```text
manual QA
Playwright E2E testing
Antigravity browser verification
stakeholder demo
```

---

## 2. Demo A — Public “이 건물, 딜 될까?”

### Goal

Show that a public user can input an address and receive a Deal Curiosity Report.

### Given

```text
User is on /building-radar.
User is not necessarily logged in.
```

### Input

```text
Address: 서울 성동구 성수동2가 000-00
Purpose: 내 건물 매각 검토
```

### When

```text
User submits the form.
```

### Then UI Should Show

```text
AI analysis loading screen
One-line diagnosis
Deal Curiosity Score
Risk questions
Deal points
Building SSoT readiness
Available outputs
CTA: 블라인드 딜카드 만들기
CTA: 전문가 3줄 코멘트 받기
```

### Expected DB Rows

```text
building_ssot_lite
Deal Curiosity Report document_object
activity_events:
- address_submitted
- building_ssot_lite_created
- deal_curiosity_report_generated
```

### Safety Check

```text
No price recommendation.
No investment recommendation.
No legal/tax/debt certainty.
```

---

## 3. Demo B — Broker “카톡 매물 → 1분 딜카드”

### Goal

Show that a broker can paste a Kakao-style memo and generate a safe blind deal card.

### Given

```text
Broker is logged in.
Broker opens /broker/deal-card/new.
```

### Input

```text
성수동 000-00, 80억대 근생, 1층 A카페 월세 800, 일부 임대 중.
사옥 수요도 볼 수 있고 매도자는 빠른 협의를 원함.
주소는 일단 비공개.
```

### When

```text
Broker clicks “1분 딜카드 만들기”.
```

### Then UI Should Show

```text
딜카드가 준비됐습니다.
주소와 민감정보는 숨겼어요.

Extracted info card
Hidden fields card
Blind teaser preview
Kakao copy message
Actions:
- 문구 복사
- 매수자 조건과 연결
- Gate 요청 만들기
```

### Expected Hidden Fields

```text
exact_address
tenant_name
unit_rent
seller_motivation
```

### Expected DB Rows

```text
building_ssot_lite
building_signal_card
blind_teaser document_object
activity_events:
- broker_memo_submitted
- building_ssot_lite_created
- building_signal_card_created
- blind_teaser_generated
```

### Safety Check

Blind teaser must not contain:

```text
성수동 000-00
A카페
월세 800
매도자는 빠른 협의를 원함
```

---

## 4. Demo C — Buyer Intent → Buyer Memo

### Goal

Show that broker can structure buyer condition and create client-facing memo.

### Given

```text
Broker has generated at least one deal card.
Broker opens /broker/buyer-intents/new.
```

### Input

```text
김대표 50~80억, 성수나 강남, 사옥 겸 임대수익 원함.
주차 중요하고 너무 낡은 건물은 싫어함.
대출은 50% 정도 생각.
```

### When

```text
Broker clicks “조건 정리하기”.
```

### Then UI Should Show

```text
Buyer Intent Summary:
- 예산
- 지역
- 목적
- 필수조건
- 리스크 성향
- 확인 필요
```

### When

```text
Broker selects a building and clicks “고객에게 보낼 문구 만들기”.
```

### Then UI Should Show

```text
Buyer Memo:
- 맞는 점
- 주의할 점
- 부족한 자료
- 다음 액션
- 카톡 문구
```

### Expected DB Rows

```text
buyer_intent_lite
buyer_memo document_object
activity_events:
- buyer_intent_created
- buyer_memo_generated
```

### Safety Check

```text
No guarantee that building matches.
No purchase recommendation.
No loan certainty.
```

---

## 5. Demo D — Owner Readiness → Expert Note

### Goal

Show that an owner or broker can check Full IM readiness and request expert note.

### Given

```text
User opens /owner-readiness.
```

### Input

Checked:

```text
건축물대장
등기부등본
건물 사진
```

Unchecked:

```text
임대차 요약표
수선 이력
공개 가능/불가 정보
```

### When

```text
User submits readiness checklist.
```

### Then UI Should Show

```text
Owner Readiness Score
Available outputs
Missing data checklist
CTA: 전문가 3줄 코멘트 요청
CTA: Snapshot 제작 상담
```

### When

```text
User requests Expert Note.
```

### Expected DB Rows

```text
owner_readiness_check
expert_note_request
activity_events:
- owner_readiness_checked
- expert_note_requested
```

---

## 6. Demo E — Disclosure Guard Redaction

### Goal

Prove that public/blind output never leaks sensitive information.

### Given

Input memo contains:

```text
exact address
tenant name
unit rent
seller motivation
```

### When

```text
Blind Teaser is generated.
```

### Then

The output must replace or remove:

```text
Exact address → area signal only
Tenant name → tenant industry only
Unit rent → summarized income signal or removed
Seller motivation → removed entirely
```

### Expected UI

```text
Hidden Fields card lists all removed fields.
```

### Expected DB

```text
building_ssot_lite.hidden_fields includes detected sensitive fields.
document_object.body does not include raw sensitive values.
```

---

## 7. Demo F — Gate Request Lite

### Goal

Show that a user can request more information and the system does not reveal protected fields before approval.

### Given

```text
Broker has a Blind Teaser.
Requester wants additional details.
```

### When

```text
Requester clicks “상세자료 요청”.
```

### Then UI Should Show

```text
Gate Request form
Requested level: G2 or G3
Requested fields
Reason
```

### Expected DB Rows

```text
gate_request_lite
activity_events:
- gate_request_created
```

### Admin Flow

```text
Admin opens /admin/gate-requests.
Admin approves or rejects.
```

### Safety Check

```text
Before approval, exact address and sensitive fields remain hidden.
```

---

## 8. Demo G — Admin Expert Note Review

### Goal

Show that admin can process expert note requests.

### Given

```text
Expert Note request exists.
```

### When

```text
Admin opens /admin/expert-notes.
```

### Then UI Should Show

```text
Request list
Building summary
User purpose
AI report summary
Prepared data status
Expert comment input
Next recommendation selector
```

### Completion

```text
Admin writes 3-line expert note.
Admin selects next recommendation.
Admin marks complete.
```

### Expected DB

```text
expert_note_request.status = completed
expert_note_request.expert_note is saved
activity_event records completion
```

---

## 9. Demo H — Analytics v1

### Goal

Show basic MVP activity counts.

### Given

Several demo flows have been completed.

### When

```text
Admin opens /admin/analytics.
```

### Then UI Should Show

```text
Building SSoT Lite created count
Blind Teaser generated count
Buyer Intent created count
Buyer Memo generated count
Gate Request count
Expert Note Request count
Recent activity list
```

---

## 10. Demo Completion Checklist

A demo build is acceptable when:

```text
Demo A through F can be completed manually.
Sensitive redaction is visible in Demo B/E.
Events are visible in Admin Analytics.
Expert Note request appears in Admin Console.
Gate Request appears in Admin Console.
No public/blind output includes protected fields.
```
