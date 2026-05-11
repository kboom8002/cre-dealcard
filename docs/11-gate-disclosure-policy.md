# 11. Gate & Disclosure Policy — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines the disclosure rules, gate levels, visibility states, blocked fields, and review requirements for **JS Building SSoT MVP v0.1**.

The goal is to make sure the system can generate useful public and broker-shareable documents without exposing sensitive CRE deal information.

The product must support this promise:

> 주소와 민감정보는 숨기고, 매수자에게 먼저 보여줄 수 있는 딜카드를 만듭니다.

---

## 2. Core Policy

## 2.1 Default Rule

All AI-generated deal content is **draft by default**.

All public or blind output must pass disclosure checks before being shared.

```text
AI output
→ draft
→ disclosure check
→ broker/user review
→ shareable or blocked
```

## 2.2 Truth / Signal Separation

The system separates internal truth from public-safe signal.

```text
Building SSoT Lite = structured source object
Building Signal Card = public/blind-safe derived representation
Document Object = generated output with explicit visibility
```

Sensitive fields may exist in internal objects only if provided by the user or broker, but they must not appear in public/blind outputs.

---

## 3. Gate Levels

MVP v0.1 uses four gate levels.

| Gate | Name | Purpose | Example Output |
|---|---|---|---|
| G0 | Public Signal | Public or blind-safe information | Deal Curiosity Report, Blind Deal Card |
| G1 | Registered Interest | Logged interest by a known user | Saved report, contact request |
| G2 | Qualified Summary | Limited summary after basic qualification | Qualified summary, approximate detail |
| G3 | Snapshot / IM Lite Request | Request for detailed broker-reviewed information | Snapshot draft, IM Lite request, exact address request |

MVP does not implement G4 Dealroom Access or G5 DD/Closing.

---

## 4. Visibility States

Every generated document and field must have a visibility state.

```text
public
public_blind
registered_only
gate_restricted
internal_only
private_truth
blocked
```

## 4.1 public

Information that may be shown publicly without exposing a specific asset's sensitive details.

Examples:

```text
general CRE education
market-level commentary
question templates
risk checklist
```

## 4.2 public_blind

Information that can be shared as a blind asset signal.

Examples:

```text
성수권역 80억대 근생형 자산
사옥+부분임대형 매수자에게 검토 가치
임대차 만기 확인 필요
상세자료는 자격 확인 후 제공 가능
```

## 4.3 registered_only

Information shown only after login or user identity capture.

Examples:

```text
saved reports
user's own generated report history
basic follow-up status
```

## 4.4 gate_restricted

Information requiring Gate Request approval.

Examples:

```text
exact address
lease summary
snapshot draft
IM Lite
site tour coordination
```

## 4.5 internal_only

Information for brokers/admins only.

Examples:

```text
seller motivation
broker memo
negotiation note
internal caution
lead quality score
```

## 4.6 private_truth

Raw or sensitive source information.

Examples:

```text
raw registry file
raw lease document
raw tax memo
unredacted evidence file
```

## 4.7 blocked

Information that must not be used in the current output.

Examples:

```text
tenant name in blind teaser
unit-level rent in public card
seller distress in public copy
legal/tax conclusion by AI
```

---

## 5. Disclosure Matrix

| Field | G0 Public Signal | G1 Registered | G2 Qualified Summary | G3 Snapshot / IM Lite | Internal Only |
|---|---|---|---|---|---|
| area_signal | allowed | allowed | allowed | allowed | allowed |
| asset_type | allowed | allowed | allowed | allowed | allowed |
| price_band | allowed as band | allowed as band | allowed as band | allowed with review | allowed |
| exact_address | blocked | blocked | usually blocked | allowed if approved | allowed |
| building_name | case-by-case | case-by-case | case-by-case | allowed if approved | allowed |
| owner_name | blocked | blocked | blocked | blocked unless explicitly approved | allowed only if needed |
| tenant_name | blocked | blocked | blocked | restricted | allowed only if needed |
| tenant_industry | allowed generalized | allowed | allowed | allowed | allowed |
| unit_rent | blocked | blocked | blocked | restricted | allowed |
| rent_summary | blocked or generalized | generalized | allowed summary | allowed if reviewed | allowed |
| NOI / Cap Rate | blocked unless explicitly marked as unavailable | blocked unless reviewed | restricted | allowed if verified | allowed |
| seller_motivation | blocked | blocked | blocked | blocked | internal_only |
| negotiation_floor | blocked | blocked | blocked | blocked | internal_only |
| raw_registry | blocked | blocked | blocked | restricted | private_truth |
| raw_lease | blocked | blocked | blocked | restricted | private_truth |
| deal_points | allowed | allowed | allowed | allowed | allowed |
| caution_points | allowed | allowed | allowed | allowed | allowed |
| risk_questions | allowed | allowed | allowed | allowed | allowed |
| expert_note | summary allowed | allowed | allowed | allowed | allowed |

---

## 6. Blocked Field Definitions

## 6.1 exact_address

Full address, lot number, road address, building name, or any combination that can identify the asset precisely.

### Must be removed from

```text
Blind Deal Card
Public Building Radar output
public_blind document_object
Kakao blind share text
```

### Safe replacement

```text
서울 주요 상권
성수권역
강남권역
역세권 근생형 자산
```

---

## 6.2 tenant_name

Any tenant or occupant name.

### Unsafe

```text
1층 A카페
OO병원 입점
XX편의점 임차 중
```

### Safe replacement

```text
1층 F&B 임차인
의료/서비스 업종 임차 가능성
리테일 임차 수요 확인 필요
```

---

## 6.3 unit_rent and unit_deposit

Unit-level rent, deposit, management fee, or lease detail.

### Unsafe

```text
1층 월세 850만 원
2층 보증금 1억 / 월세 450만 원
```

### Safe replacement

```text
임대수익 구조 확인 필요
호실별 임대차 상세는 Gate 승인 후 확인 필요
수익성은 임대차 요약표 확인 후 검토 필요
```

---

## 6.4 seller_motivation

Seller's personal reason, urgency, debt situation, family issue, distress, or private negotiation context.

### Unsafe

```text
급매
상속 문제로 매각
자금 압박
협상 가능성 큼
```

### Safe replacement

```text
매각 조건은 별도 협의 필요
거래 조건은 브로커 확인 필요
```

---

## 6.5 negotiation_memo

Internal negotiation floor, buyer ceiling, commission arrangement, personal relationships, broker strategy.

### Safe rule

Always `internal_only`. Never show in public, blind, qualified, or G3 output.

---

## 7. Document Type Policies

## 7.1 Deal Curiosity Report

### Purpose

Public or semi-public educational/pre-deal report generated from address or lot number.

### Allowed

```text
one-line diagnosis
Deal Curiosity Score
risk questions
deal points
buyer fit hypotheses
missing data
readiness state
```

### Blocked

```text
exact price recommendation
investment advice
confirmed cap rate
confirmed NOI
loan availability
tax/legal conclusion
```

### Required disclaimer

```text
이 리포트는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다. 가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.
```

---

## 7.2 Blind Deal Card / Blind Teaser

### Purpose

Shareable broker or owner-facing blind card for first-stage buyer interest.

### Allowed

```text
area_signal
asset_type
price_band
high-level deal points
caution points
risk questions
Gate CTA
```

### Blocked

```text
exact_address
tenant_name
unit_rent
unit_deposit
seller_motivation
raw documents
```

### Required disclosure note

```text
정확한 주소, 임차인명, 호실별 임대료, 매도자 사정은 공개하지 않습니다. 상세자료는 자격 확인 후 제공됩니다.
```

---

## 7.3 Buyer Memo Lite

### Purpose

Broker-facing or buyer-facing memo explaining fit between buyer intent and building signal.

### Allowed

```text
fit reasons
misfit/caution reasons
missing data
recommended next action
Kakao-friendly message
```

### Blocked

```text
guaranteed match
purchase recommendation
private seller information
unapproved exact address
```

### Required language

Use:

```text
부합할 수 있습니다
확인 필요합니다
상세자료 확인 후 검토하는 것이 좋습니다
```

Do not use:

```text
추천합니다
확실합니다
문제없습니다
```

---

## 7.4 Owner Prep Memo

### Purpose

Guide owner/broker on missing data and readiness for Snapshot or IM.

### Allowed

```text
readiness score
available outputs
missing documents
recommended next action
```

### Blocked

```text
valuation conclusion
legal/tax conclusion
loan conclusion
```

---

## 7.5 Expert Note

### Purpose

Human or expert-reviewed short note.

### Allowed

```text
perspective
first risk to check
next data to prepare
next recommended service
```

### Boundaries

Expert Note is not legal advice, tax advice, valuation, or investment recommendation unless written under a separately defined licensed professional scope.

---

## 8. Risk Language Policy

## 8.1 Forbidden Claim Types

AI-generated or automated output must not claim:

```text
investment recommendation
price correctness
cap rate certainty
NOI certainty
rent increase certainty
loan availability
legal safety
tax advantage
zoning permission certainty
renovation feasibility certainty
```

## 8.2 Safe Rewrites

| Unsafe | Safe |
|---|---|
| 수익률이 개선됩니다 | 임대료 재검토 여지는 있으나, 임대차·공실·비용 확인이 필요합니다. |
| 대출 60% 가능합니다 | LTV 60%는 예비 시나리오이며, 실제 대출 조건은 차주·담보평가·금융기관 정책에 따라 달라질 수 있습니다. |
| 리모델링하면 임대료가 오릅니다 | 리모델링 후 임대료 재검토 가능성은 있으나, 공사비·공실기간·주변 임대사례 확인이 필요합니다. |
| 위반건축물 문제 없습니다 | 위반건축물 여부는 건축물대장과 현황 확인이 필요합니다. |
| 매수 추천합니다 | 조건에 부합할 수 있는 부분과 추가 확인이 필요한 부분을 구분해 검토하는 것이 좋습니다. |

---

## 9. Disclosure Guard Requirements

## 9.1 Agent purpose

`DisclosureGuardAgent` checks all public/blind outputs before storage or display.

## 9.2 Required inputs

```text
raw_input
intended_document_type
candidate_output
visibility
source_refs
```

## 9.3 Required output

```json
{
  "safe": false,
  "violations": ["exact_address_detected", "tenant_name_detected"],
  "blockedFields": ["exact_address", "tenant_name"],
  "redactedOutput": "...",
  "reviewRequired": true
}
```

## 9.4 Violation codes

```text
exact_address_detected
tenant_name_detected
unit_rent_detected
unit_deposit_detected
seller_motivation_detected
negotiation_memo_detected
legal_tax_claim_detected
valuation_claim_detected
loan_claim_detected
```

## 9.5 Acceptance criteria

```text
- Blind Teaser cannot be saved as disclosure_checked if violations remain.
- Public result cannot show exact address if visibility is public_blind.
- Redacted output must be stored separately from raw input.
- Violations must be recorded in ai_run or document metadata.
```

---

## 10. Gate Request Lite Policy

## 10.1 Creation triggers

Gate Request Lite can be created from:

```text
Blind Deal Card
Building Signal Card
Buyer Memo Lite
Deal Curiosity Report result
```

## 10.2 Request reasons

```text
exact_address_request
lease_summary_request
snapshot_request
im_lite_request
site_tour_request
broker_contact_request
```

## 10.3 Required request metadata

```text
requester_id
building_id or document_id
requested_level
requested_fields
reason
optional user message
```

## 10.4 Review states

```text
submitted
broker_review
approved
rejected
expired
cancelled
```

## 10.5 Approval effect in MVP

MVP approval may show status and next instructions, but does not need to create a full Dealroom.

### Allowed MVP approval outputs

```text
approved status
broker contact note
next step message
manual follow-up flag
```

### Not included in MVP

```text
full dealroom
file-level evidence disclosure
automated NDA workflow
payment workflow
```

---

## 11. UI Disclosure Components

The UI must include visible disclosure cues.

## 11.1 Hidden Fields Card

Show in broker deal card result:

```text
자동으로 숨긴 정보
- 정확한 주소
- 임차인명
- 호실별 임대료
- 매도자 사정
```

## 11.2 Boundary Note

Show under generated reports:

```text
이 리포트는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다. 가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.
```

## 11.3 Document Status Badge

Supported badges:

```text
AI 초안
민감정보 점검 완료
브로커 검토 필요
내부 공유 가능
외부 공유 가능
Gate 필요
```

---

## 12. Implementation Rules

```text
1. Never expose raw_input in public result pages unless explicitly safe.
2. Save raw_input separately from redacted output.
3. Always store document visibility.
4. Always run disclosure guard for public_blind documents.
5. Always log activity_event when a document is shared.
6. Always prevent exact_address from appearing in Blind Deal Card.
7. Always show boundary note when output includes AI-generated deal analysis.
8. Never use AI output as legal, tax, valuation, or loan advice.
```

---

## 13. Test Cases

## 13.1 Exact address redaction

Given broker memo contains an exact address.

When Blind Deal Card is generated.

Then exact address must not appear in output.

## 13.2 Tenant name redaction

Given broker memo contains a tenant name.

When Blind Deal Card is generated.

Then tenant name must be replaced by tenant industry or generalized wording.

## 13.3 Unit rent redaction

Given broker memo contains unit-level rent.

When Blind Deal Card is generated.

Then unit rent must be removed and replaced with “임대차 상세 확인 필요”.

## 13.4 Seller motivation redaction

Given broker memo contains “급매”, “상속”, or “자금 압박”.

When Blind Deal Card is generated.

Then seller motivation must not appear in blind output.

## 13.5 Unsafe claim rewrite

Given AI output says “수익률 상승이 가능합니다”.

When Risk Boundary Check runs.

Then it must rewrite to a conditional, evidence-needed statement.

---

## 14. Non-goals

This policy does not implement:

```text
full NDA workflow
full dealroom disclosure
licensed legal/tax review marketplace
valuation report generation
loan quote generation
payment-based gate release
```

Those belong to later versions.

