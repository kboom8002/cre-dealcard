# 09. AI Agent Contracts

## 1. Purpose

This document defines the AI agent contracts for **JS Building SSoT MVP v0.1**.

The goal is to make every AI behavior explicit, testable, and safe for CRE deal-document workflows. Agents must not behave as free-form chatbots. They must operate as bounded transformation modules that convert small inputs into structured, reviewable outputs.

Core rule:

> AI creates draft deal intelligence from small inputs, but it must not invent deal facts, expose sensitive information, or make investment/legal/tax/loan certainty claims.

---

## 2. Product Context

JS Building SSoT MVP v0.1 has two public-facing wedges:

1. **이 건물, 딜 될까?**  
   Address or lot number input → Building SSoT Lite → Deal Curiosity Report.

2. **JS 1분 딜카드**  
   Broker Kakao-style property memo → Building Mini Truth → Building Signal Card → Blind Teaser.

Both flows use the same underlying AI doctrine:

```text
small input
→ structured extraction
→ Building SSoT Lite
→ disclosure guard
→ safe signal/document
→ activity event
```

---

## 3. Agent Design Principles

### 3.1 Agents are bounded functions

Each agent must have:

```text
- role
- input schema
- output schema
- forbidden outputs
- tool access
- failure behavior
- acceptance tests
```

Agents must not add new product behavior outside their contract.

---

### 3.2 Structured output is mandatory

All agent outputs must be validated by Zod or equivalent schema validation.

No core agent may return only free-form text.

---

### 3.3 Draft by default

All AI-generated outputs are `draft` unless reviewed.

```text
AI draft
→ disclosure_checked
→ broker_reviewed / admin_reviewed
→ approved_internal / shared_external
```

---

### 3.4 Truth / Signal separation

Agents must distinguish between:

```text
Building SSoT Lite / internal truth candidate
= structured, possibly sensitive, not automatically public

Building Signal / public-blind output
= redacted, safe, shareable summary
```

---

### 3.5 No certainty claims

Agents must not produce certainty about:

```text
- investment recommendation
- fair value / proper price
- guaranteed rent increase
- confirmed cap rate / NOI
- loan availability
- tax benefit
- legal safety
- zoning or permit certainty
- absence of violation
```

Use boundary language:

```text
검토할 수 있습니다
확인이 필요합니다
자료 확인 전에는 단정하기 어렵습니다
전문가 검토가 필요한 영역입니다
```

---

## 4. Shared Types

### 4.1 Visibility

```ts
type Visibility =
  | 'public'
  | 'public_blind'
  | 'registered'
  | 'qualified_summary'
  | 'gate_restricted'
  | 'internal_only'
  | 'private_truth'
  | 'blocked';
```

---

### 4.2 Gate Level

```ts
type GateLevel = 'G0_PUBLIC_SIGNAL' | 'G1_REGISTERED_INTEREST' | 'G2_QUALIFIED_SUMMARY' | 'G3_SNAPSHOT_OR_IM_LITE';
```

---

### 4.3 Hidden Field

```ts
type HiddenField =
  | 'exact_address'
  | 'tenant_name'
  | 'unit_rent'
  | 'seller_motivation'
  | 'negotiation_memo'
  | 'owner_identity'
  | 'buyer_identity'
  | 'source_document_raw_text'
  | 'registry_detail'
  | 'lease_contract_raw_text';
```

---

### 4.4 Confidence Level

```ts
type ConfidenceLevel = 'confirmed' | 'user_provided' | 'public_data_inferred' | 'ai_hypothesis' | 'needs_verification' | 'unknown';
```

---

### 4.5 AI Run Status

```ts
type AIRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked_by_policy' | 'needs_human_review';
```

---

## 5. Agent Catalog

MVP v0.1 uses the following agents:

```text
1. AddressResolverAgent
2. MemoParserAgent
3. BuildingMiniTruthAgent
4. DisclosureGuardAgent
5. SignalComposerAgent
6. DealCuriosityWriterAgent
7. BuyerIntentNormalizerAgent
8. BuyerMemoWriterAgent
9. OwnerReadinessAgent
10. ExpertNoteDraftAgent
11. RiskBoundaryCheckerAgent
12. DocumentStatusAdvisorAgent
```

Agents 1-10 are P0/P1. Agents 11-12 may be implemented as part of post-processing logic in v0.1.

---

# 6. AddressResolverAgent

## 6.1 Role

Normalize user-entered address, lot number, or building name into a structured address candidate.

This agent does not verify legal ownership or registry information.

---

## 6.2 Input Schema

```ts
const AddressResolverInputSchema = z.object({
  rawInput: z.string().min(2),
  userPurpose: z.enum([
    'sell_consideration',
    'buy_consideration',
    'owner_user_hq',
    'broker_work',
    'learning'
  ]).optional(),
  locale: z.literal('ko-KR').default('ko-KR')
});
```

---

## 6.3 Output Schema

```ts
const AddressResolverOutputSchema = z.object({
  normalizedInput: z.string(),
  addressCandidates: z.array(z.object({
    displayAddress: z.string(),
    regionSignal: z.string().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
    needsUserConfirmation: z.boolean()
  })),
  unresolvedReason: z.string().nullable()
});
```

---

## 6.4 Forbidden Outputs

AddressResolverAgent must not:

```text
- claim ownership
- fetch or fabricate registry data
- expose exact address into public_blind documents
- infer sensitive owner identity
```

---

## 6.5 Failure Behavior

If address cannot be resolved:

```text
주소를 정확히 찾지 못했습니다. 지번, 도로명주소, 건물명 중 하나를 조금 더 구체적으로 입력해주세요.
```

---

# 7. MemoParserAgent

## 7.1 Role

Parse broker-style unstructured Kakao memo into a structured intermediate extraction.

This is not yet Building SSoT Lite. It is a parsed memo candidate.

---

## 7.2 Input Schema

```ts
const MemoParserInputSchema = z.object({
  memo: z.string().min(5),
  inputContext: z.enum(['property_memo', 'buyer_memo', 'owner_memo']).default('property_memo'),
  actorRole: z.enum(['broker', 'public_user', 'admin']).default('broker')
});
```

---

## 7.3 Output Schema

```ts
const MemoParserOutputSchema = z.object({
  extractedFacts: z.object({
    region: z.string().nullable(),
    exactAddressCandidate: z.string().nullable(),
    assetType: z.string().nullable(),
    priceText: z.string().nullable(),
    sizeText: z.string().nullable(),
    currentUse: z.string().nullable(),
    leaseSignal: z.string().nullable(),
    vacancySignal: z.string().nullable(),
    tenantNames: z.array(z.string()).default([]),
    unitRentTexts: z.array(z.string()).default([]),
    sellerMotivationText: z.string().nullable(),
    brokerNotes: z.array(z.string()).default([])
  }),
  detectedSensitiveFields: z.array(z.enum([
    'exact_address',
    'tenant_name',
    'unit_rent',
    'seller_motivation',
    'negotiation_memo',
    'owner_identity',
    'buyer_identity'
  ])),
  ambiguousFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([])
});
```

---

## 7.4 Forbidden Outputs

MemoParserAgent must not:

```text
- convert unverified memo into confirmed fact
- create final public text
- recommend purchase or sale
- infer exact legal facts from casual memo
```

---

# 8. BuildingMiniTruthAgent

## 8.1 Role

Create **Building SSoT Lite** from parsed address/memo input.

It creates a minimal truth candidate for MVP workflows.

---

## 8.2 Input Schema

```ts
const BuildingMiniTruthInputSchema = z.object({
  rawInput: z.string(),
  inputType: z.enum(['address', 'broker_memo', 'voice_note']),
  parsedMemo: MemoParserOutputSchema.optional(),
  addressResolution: AddressResolverOutputSchema.optional(),
  userPurpose: z.enum([
    'sell_consideration',
    'buy_consideration',
    'owner_user_hq',
    'broker_work',
    'learning'
  ]).optional()
});
```

---

## 8.3 Output Schema

```ts
const BuildingMiniTruthOutputSchema = z.object({
  areaSignal: z.string(),
  assetType: z.string(),
  priceBand: z.string().nullable(),
  sizeSignal: z.string().nullable(),
  currentUseSignal: z.string().nullable(),
  vacancySignal: z.string().nullable(),
  fitSummary: z.string(),
  cautionSummary: z.string(),
  hiddenFields: z.array(z.enum([
    'exact_address',
    'tenant_name',
    'unit_rent',
    'seller_motivation',
    'negotiation_memo',
    'owner_identity',
    'buyer_identity',
    'registry_detail',
    'lease_contract_raw_text'
  ])),
  confidence: z.object({
    areaSignal: z.enum(['confirmed', 'user_provided', 'public_data_inferred', 'ai_hypothesis', 'needs_verification', 'unknown']),
    assetType: z.enum(['confirmed', 'user_provided', 'public_data_inferred', 'ai_hypothesis', 'needs_verification', 'unknown']),
    priceBand: z.enum(['confirmed', 'user_provided', 'public_data_inferred', 'ai_hypothesis', 'needs_verification', 'unknown']),
    fitSummary: z.enum(['ai_hypothesis', 'needs_verification'])
  }),
  missingData: z.array(z.string()),
  boundaryNote: z.string()
});
```

---

## 8.4 Required Behavior

The agent must:

```text
- summarize only what was given or safely inferred
- mark fitSummary as hypothesis
- generate cautionSummary with verification language
- list hiddenFields explicitly
- list missingData needed for Snapshot / Full IM
```

---

## 8.5 Forbidden Outputs

```text
- 정확한 매각가가 적정합니다
- 매수 추천합니다
- 수익률이 개선됩니다
- 대출 가능합니다
- 세금상 유리합니다
- 위반건축물 문제가 없습니다
```

---

# 9. DisclosureGuardAgent

## 9.1 Role

Detect and remove sensitive CRE deal information from public or blind outputs.

This is the most important safety agent in MVP v0.1.

---

## 9.2 Input Schema

```ts
const DisclosureGuardInputSchema = z.object({
  text: z.string(),
  targetDocumentType: z.enum([
    'deal_curiosity_report',
    'blind_teaser',
    'buyer_fit_memo',
    'owner_prep_memo',
    'gate_request_note'
  ]),
  targetVisibility: z.enum([
    'public',
    'public_blind',
    'registered',
    'qualified_summary',
    'gate_restricted',
    'internal_only'
  ]),
  knownSensitiveFields: z.array(z.string()).default([])
});
```

---

## 9.3 Output Schema

```ts
const DisclosureGuardOutputSchema = z.object({
  isSafe: z.boolean(),
  violations: z.array(z.object({
    type: z.enum([
      'exact_address_detected',
      'tenant_name_detected',
      'unit_rent_detected',
      'seller_motivation_detected',
      'negotiation_memo_detected',
      'owner_identity_detected',
      'buyer_identity_detected',
      'raw_document_text_detected'
    ]),
    originalText: z.string(),
    suggestedReplacement: z.string()
  })),
  redactedText: z.string(),
  requiredGateLevel: z.enum(['G0_PUBLIC_SIGNAL', 'G1_REGISTERED_INTEREST', 'G2_QUALIFIED_SUMMARY', 'G3_SNAPSHOT_OR_IM_LITE']).nullable(),
  reviewerNote: z.string().nullable()
});
```

---

## 9.4 Redaction Rules

```text
exact address → region signal
specific tenant name → tenant industry/category
unit-level rent → income structure summary or remove
seller motivation → remove
negotiation memo → remove
owner/buyer identity → remove
raw registry/lease/legal text → remove or cite as evidence type only
```

---

## 9.5 Example

Input:

```text
서울 성동구 성수동2가 123-4, 1층 A카페 월세 850만 원, 매도자 급매 희망.
```

Output:

```text
성수권역 근생형 자산으로, 1층 F&B 임차 수요와 사옥+부분임대 가능성을 검토할 수 있습니다. 상세 위치와 임대차 정보는 자격 확인 후 검토가 필요합니다.
```

---

# 10. SignalComposerAgent

## 10.1 Role

Create a safe **Building Signal Card** from Building SSoT Lite.

The signal is a public-blind, shareable representation of the internal truth candidate.

---

## 10.2 Input Schema

```ts
const SignalComposerInputSchema = z.object({
  buildingMiniTruth: BuildingMiniTruthOutputSchema,
  targetAudience: z.enum(['broker', 'owner', 'buyer', 'public']).default('broker'),
  outputTone: z.enum(['concise', 'professional', 'kakao']).default('professional')
});
```

---

## 10.3 Output Schema

```ts
const SignalComposerOutputSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  dealPoints: z.array(z.string()).min(3).max(5),
  cautionPoints: z.array(z.string()).min(2).max(5),
  hiddenInfoNotice: z.array(z.string()),
  recommendedGateLevel: z.enum(['G0_PUBLIC_SIGNAL', 'G1_REGISTERED_INTEREST', 'G2_QUALIFIED_SUMMARY', 'G3_SNAPSHOT_OR_IM_LITE']),
  kakaoText: z.string(),
  boundaryNote: z.string()
});
```

---

## 10.4 Required Behavior

```text
- must use region signal, not exact address
- must include caution points
- must include hidden info notice
- must include boundary note
- must be suitable for Kakao copy
```

---

# 11. DealCuriosityWriterAgent

## 11.1 Role

Generate the public-facing **“이 건물, 딜 될까?”** report from Building SSoT Lite.

This report is a question-generation and readiness report, not an appraisal or investment recommendation.

---

## 11.2 Input Schema

```ts
const DealCuriosityWriterInputSchema = z.object({
  buildingMiniTruth: BuildingMiniTruthOutputSchema,
  userPurpose: z.enum([
    'sell_consideration',
    'buy_consideration',
    'owner_user_hq',
    'broker_work',
    'learning'
  ]),
  availableEvidenceTypes: z.array(z.string()).default([])
});
```

---

## 11.3 Output Schema

```ts
const DealCuriosityReportSchema = z.object({
  oneLineDiagnosis: z.string(),
  dealCuriosityScore: z.number().min(0).max(100),
  scoreMeaning: z.string(),
  ssotReadiness: z.object({
    publicSignalReady: z.boolean(),
    teaserReady: z.boolean(),
    snapshotDraftReady: z.boolean(),
    fullImReady: z.boolean(),
    missingData: z.array(z.string())
  }),
  dealPoints: z.array(z.string()).length(5),
  riskQuestions: z.array(z.string()).length(5),
  buyerFitTypes: z.array(z.string()),
  dealStories: z.array(z.object({
    title: z.string(),
    description: z.string(),
    requiredValidation: z.array(z.string())
  })).length(3),
  ctas: z.array(z.object({
    label: z.string(),
    action: z.enum(['create_blind_teaser', 'request_expert_note', 'check_full_im_readiness', 'save_report'])
  })),
  boundaryNote: z.string()
});
```

---

## 11.4 Required Boundary Note

Every report must include:

```text
이 리포트는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다. 가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.
```

---

# 12. BuyerIntentNormalizerAgent

## 12.1 Role

Normalize broker-entered buyer condition memo into Buyer Intent Lite.

---

## 12.2 Input Schema

```ts
const BuyerIntentNormalizerInputSchema = z.object({
  rawMemo: z.string().min(5),
  brokerId: z.string().optional(),
  visibilityPreference: z.enum(['private', 'anonymized_matchable']).default('private')
});
```

---

## 12.3 Output Schema

```ts
const BuyerIntentLiteSchema = z.object({
  buyerType: z.string(),
  budgetRange: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    display: z.string()
  }),
  preferredRegions: z.array(z.string()),
  assetTypes: z.array(z.string()),
  purchasePurpose: z.string(),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  riskTolerance: z.enum(['low', 'medium', 'high', 'unknown']),
  financingNote: z.string().nullable(),
  missingQuestions: z.array(z.string()),
  privacyNotes: z.array(z.string())
});
```

---

## 12.4 Forbidden Outputs

```text
- do not expose buyer contact details in shareable memo
- do not claim final suitability
- do not recommend purchase
```

---

# 13. BuyerMemoWriterAgent

## 13.1 Role

Generate a Kakao-friendly buyer memo by comparing Buyer Intent Lite and Building Signal.

This is not a match guarantee.

---

## 13.2 Input Schema

```ts
const BuyerMemoWriterInputSchema = z.object({
  buildingSignal: SignalComposerOutputSchema,
  buyerIntent: BuyerIntentLiteSchema,
  outputTone: z.enum(['kakao', 'professional']).default('kakao')
});
```

---

## 13.3 Output Schema

```ts
const BuyerMemoOutputSchema = z.object({
  fitReasons: z.array(z.string()),
  cautionReasons: z.array(z.string()),
  missingData: z.array(z.string()),
  recommendedNextAction: z.string(),
  kakaoMessage: z.string(),
  boundaryNote: z.string()
});
```

---

## 13.4 Required Structure

```text
맞는 점
주의할 점
확인 필요한 자료
다음 액션
카톡 문구
```

---

# 14. OwnerReadinessAgent

## 14.1 Role

Convert a checklist of available owner/building documents into Owner Readiness result.

---

## 14.2 Input Schema

```ts
const OwnerReadinessInputSchema = z.object({
  hasBuildingRegister: z.boolean(),
  hasRegistry: z.boolean(),
  hasLandUsePlan: z.boolean(),
  hasRentRoll: z.boolean(),
  hasPhotos: z.boolean(),
  hasFloorPlan: z.boolean(),
  hasRepairHistory: z.boolean(),
  hasVacancyInfo: z.boolean(),
  hasAskingPrice: z.boolean(),
  hasDisclosurePreference: z.boolean(),
  userGoal: z.enum(['sell', 'prepare_im', 'consultation', 'unknown']).default('unknown')
});
```

---

## 14.3 Output Schema

```ts
const OwnerReadinessOutputSchema = z.object({
  readinessScore: z.number().min(0).max(100),
  currentPossibleOutputs: z.array(z.enum([
    'deal_curiosity_report',
    'blind_teaser',
    'snapshot_draft',
    'im_lite',
    'buyer_ready_full_im'
  ])),
  missingRequiredData: z.array(z.string()),
  recommendedNextAction: z.enum([
    'create_blind_teaser',
    'request_expert_note',
    'upload_documents',
    'snapshot_consultation',
    'full_im_consultation'
  ]),
  ownerMessage: z.string(),
  boundaryNote: z.string()
});
```

---

# 15. ExpertNoteDraftAgent

## 15.1 Role

Assist admin/expert by drafting a possible 3-line expert note based on the AI report and user goal.

This draft is never automatically sent to the user.

---

## 15.2 Input Schema

```ts
const ExpertNoteDraftInputSchema = z.object({
  dealCuriosityReport: DealCuriosityReportSchema,
  userGoal: z.string(),
  clickedRiskQuestions: z.array(z.string()).default([]),
  ownerReadiness: OwnerReadinessOutputSchema.optional()
});
```

---

## 15.3 Output Schema

```ts
const ExpertNoteDraftOutputSchema = z.object({
  draftNoteLines: z.array(z.string()).length(3),
  recommendedNextProduct: z.enum([
    'no_action',
    'owner_readiness',
    'snapshot_draft',
    'im_lite',
    'full_im_consultation',
    'deal_room_lite'
  ]),
  expertReviewChecklist: z.array(z.string()),
  warningFlags: z.array(z.string())
});
```

---

## 15.4 Important Rule

ExpertNoteDraftAgent output is for admin assistance only.

It must be saved as:

```text
status = draft
visibility = internal_only
```

---

# 16. RiskBoundaryCheckerAgent

## 16.1 Role

Detect unsafe claims in generated outputs.

---

## 16.2 Unsafe Claim Types

```text
investment_recommendation
price_certainty
cap_rate_certainty
noi_certainty
loan_certainty
tax_certainty
legal_certainty
zoning_certainty
rent_increase_certainty
violation_absence_claim
```

---

## 16.3 Output Schema

```ts
const RiskBoundaryCheckerOutputSchema = z.object({
  isSafe: z.boolean(),
  unsafeClaims: z.array(z.object({
    type: z.string(),
    text: z.string(),
    suggestedRewrite: z.string()
  })),
  finalText: z.string()
});
```

---

# 17. DocumentStatusAdvisorAgent

## 17.1 Role

Advise what document status should be applied after AI generation and disclosure/risk check.

---

## 17.2 Output Status

```text
draft
disclosure_checked
broker_reviewed
approved_internal
shared_external
blocked_by_policy
```

---

## 17.3 Rule

No AI-generated document can be `shared_external` without human action.

---

# 18. Tool Access Policy

## 18.1 MVP Tool Access

Agents may access only approved tools:

```text
building.create_ssot_lite
building.create_signal_card
document.create_document_object
disclosure.check_text
analytics.record_event
gate.create_request
```

---

## 18.2 Forbidden Tool Access

Agents must not directly access:

```text
- Supabase service_role key
- raw private Storage URLs
- evidence file raw text unless explicitly passed by server-side service
- user contact data outside current request scope
- admin-only data
```

---

# 19. Agent Evaluation Requirements

Each agent must be tested with:

```text
1. normal input
2. short/ambiguous input
3. sensitive input
4. overclaim-risk input
5. missing data input
```

Minimum evaluation cases are in `/docs/examples`.

---

# 20. Global Acceptance Criteria

AI system is acceptable only if:

```text
- all agent outputs validate against schema
- exact_address is removed from blind teaser
- tenant_name is removed from blind teaser
- unit_rent is removed or generalized in blind teaser
- all reports include boundary note
- every AI run is logged to ai_runs
- every generated document is saved as draft by default
- every main mutation records activity_event
```
