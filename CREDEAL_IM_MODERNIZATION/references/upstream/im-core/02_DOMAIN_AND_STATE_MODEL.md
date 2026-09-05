# IM CORE 도메인·상태모델

> 설계 ID: `IC-DOM-001`  
> 핵심원칙: 원자료, 유효값, 외부 산출항목, 문안, 발행본을 서로 다른 객체로 관리한다.

---

# 1. 용어와 집합체

| 객체 | 뜻 | 가변성 |
|---|---|---|
| `IMCase` | 하나의 매각 검토건 | 식별·상태만 변경 |
| `AssetScope` | 매각에 포함되는 필지·건물·지분 | 승인 후 버전 추가 |
| `Observation` | 특정 출처에서 관측한 원자료값 | 불변 |
| `EvidenceArtifact` | 파일·API 응답·사진·현장기록 | 원본 불변, 공개상태 별도 |
| `Conflict` | 같은 항목의 양립하기 어려운 값 | 해소상태 전이 |
| `Correction` | 채택값·근거·사유·승인 | 불변 사건 |
| `EffectiveSnapshot` | 한 시점의 유효값과 원자료 계보 | 불변 |
| `ClaimDefinition` | 외부 산출항목의 적용조건·전제·산식 | 버전형 정본 |
| `ClaimEvaluation` | 특정 스냅샷에서의 산출항목 판정 | 불변 |
| `BrokerOpinion` | 중개인 원문과 내부 판단 | 새 버전 가능 |
| `ProposalUnit` | 근거·의미·조건·공개문구가 갖춰진 제안 | 승인 버전 불변 |
| `RiskItem` | 매수 판단에 중요한 위험·미확인 | 스냅샷별 평가 |
| `PublicationPackage` | 채널이 사용할 수 있는 공통 발행재료 | 불변 |
| `PublicationProject` | 모바일 또는 Studio의 편집작업 | 명시적 상태전이 |
| `PublicationVersion` | 채널별 완성 내용·파일·해시 | 불변 |
| `ApprovalEvent` | 사람이 특정 범위·해시를 승인한 사건 | 불변 |

---

# 2. 식별자

식별자는 UUID를 기본으로 하되 사람이 읽는 규칙 ID는 별도로 둔다.

| 대상 | 식별자 예 |
|---|---|
| 원자료 | `observationId: UUID` |
| 불일치 | `conflictId: UUID` |
| 정정 | `correctionId: UUID` |
| 유효기준본 | `snapshotId: UUID` |
| 산출항목 정의 | `claimId: RR-C11-ASKING-GROSS-YIELD` |
| 산출항목 평가 | `evaluationId: UUID` |
| 제안 단위 | `proposalUnitId: UUID` |
| 규칙 | `gateId: ICG-009-YIELD-BASIS` |
| 발행묶음 | `packageId: UUID` |
| 편집작업 | `projectId: UUID` |
| 발행버전 | `publicationVersionId: UUID` |
| 승인사건 | `approvalEventId: UUID` |

사람이 읽는 ID는 재사용·의미변경하지 않는다. 의미가 바뀌면 버전을 올리거나 새 ID를 만든다.

---

# 3. 원자료 상태

## 3.1 Observation

필수필드:

```typescript
interface Observation {
  observationId: string;
  caseRef: { type: 'building_ssot_lite' | 'asset' | 'deal'; id: string };
  domain: 'asset' | 'transaction' | 'parcel' | 'building' | 'lease' | 'rights' | 'market' | 'photo' | 'opinion';
  subjectPath: string;
  rawValue: unknown;
  normalizedValue: unknown;
  unit?: string;
  basis?: string;
  sourceChannel: 'public_record' | 'public_api' | 'seller' | 'contract' | 'payment' | 'broker_field' | 'broker_input' | 'expert' | 'legacy';
  evidenceRef: { artifactId: string; locator?: string };
  asOf: string | null;
  retrievedAt: string;
  recordedBy: string | 'system';
  supersedesObservationId?: string;
}
```

규칙:

- `rawValue` 보존
- 정규화 실패 시 `normalizedValue=null`과 오류 기록
- 공란·0·미제공·해당없음 구분
- 출처와 기준일이 없으면 외부 사용 전제에서 직접 평가
- LLM이 만든 값을 Observation으로 등록 금지

## 3.2 EvidenceStatus

```text
unverified
broker_checked
reconciled
conflicted
stale
not_available
```

이는 근거 검증상태다. 외부 사용허가가 아니다.

## 3.3 Missing semantics

| 내부값 | 의미 | 숫자계산 |
|---|---|---|
| `unknown` | 값 존재 여부를 모름 | 금지 |
| `not_provided` | 제공자가 아직 제출하지 않음 | 금지 |
| `not_applicable` | 해당 거래에 적용되지 않음 | 제외 가능 |
| `zero_confirmed` | 실제 0으로 확인 | 0 사용 가능 |
| `redacted` | 존재하지만 공개정책으로 숨김 | 내부판정 가능, 외부 숨김 |

---

# 4. 매각범위

## 4.1 AssetScope

```typescript
interface AssetScope {
  version: number;
  status: 'candidate' | 'broker_confirmed' | 'seller_confirmed' | 'conflicted';
  parcels: Array<{
    pnu: string;
    included: boolean;
    shareNumerator?: number;
    shareDenominator?: number;
    evidenceRefs: string[];
  }>;
  buildings: Array<{
    registerKey?: string;
    included: boolean;
    parcelPnus: string[];
    evidenceRefs: string[];
  }>;
  excludedItems: Array<{ type: string; description: string; evidenceRefs: string[] }>;
  confirmedBy?: string;
  confirmedAt?: string;
}
```

다필지 규칙:

- PNU별 사실을 별도로 유지
- 필지 합계와 대표필지 값을 구분
- 포함/제외 미확정이면 가격단가·개발규모 등 의존 산출항목 차단
- 건축물대장 대지면적과 필지면적 합은 별도 불일치 검사

---

# 5. 불일치·정정·유효기준본

## 5.1 ConflictStatus

```text
open
resolved
accepted_with_warning
not_material
```

중대한 불일치는 자동 `not_material` 처리하지 않는다.

## 5.2 Correction

정정에는 다음이 필요하다.

- 대상 불일치 또는 subjectPath
- 채택 Observation
- 배제 Observation 목록
- 정정사유
- 추가근거
- 승인자와 승인시각
- 영향 산출항목

## 5.3 EffectiveSnapshot 상태

```text
materializing → valid
materializing → failed
valid → superseded
valid → invalidated
```

`valid` 스냅샷은 수정하지 않는다. 새 원자료가 오면 새 스냅샷을 만든다.

스냅샷 해시 입력:

```text
canonical(assetScope)
+ sorted(observationIds)
+ sorted(correctionIds)
+ canonical(effectiveValues)
+ materializerVersion
```

---

# 6. 산출항목

## 6.1 ClaimDefinition

```typescript
interface ClaimDefinition {
  claimId: string;
  version: string;
  label: string;
  applicability: Predicate;
  requires: RequirementExpression;
  formulaId?: string;
  unit?: string;
  basisRules?: string[];
  warningPolicies?: string[];
  gateRefs: string[];
  permittedLevels: Array<'L1' | 'L1.5' | 'L2' | 'L3' | 'L4'>;
}
```

## 6.2 ClaimUseStatus

```text
allowed
allowed_with_warning
blocked
not_applicable
not_available_at_stage
not_evaluated
```

## 6.3 평가 규칙

- 적용조건 거짓: `not_applicable`
- 거래단계상 정상 결손: `not_available_at_stage`
- 평가기 미실행·오류: `not_evaluated`
- 필수입력·중대한 불일치·금지규칙 실패: `blocked`
- 경고정책만 해당: `allowed_with_warning`
- 모두 충족: `allowed`

`not_evaluated`와 `blocked`는 외부 사용 관점에서 모두 사용할 수 없다.

## 6.4 계산결과

계산결과에는 다음을 저장한다.

- formulaId와 version
- 정렬된 입력 Claim 참조
- 입력값·단위·basis
- 결과값·단위·반올림 전 원값
- 표시값
- 계산해시
- 경고

---

# 7. 중개인 의견과 제안

## 7.1 BrokerOpinionStatus

```text
draft
normalized
evidence_linked
ready_for_review
approved_for_publication
rejected
withdrawn
```

## 7.2 ProposalUnit 완성조건

L1.5 외부사용을 위해 모두 필요하다.

- 중개인 원문
- 외부문구
- 사실·현장관찰·사진 중 하나 이상의 근거
- 매수자에게 갖는 의미
- 적합한 매수자 또는 활용방향
- 성립조건 또는 추가 확인사항
- 공개승인자와 승인시각

수치가 포함된 제안은 승인된 산출항목 또는 승인된 분석가정 토큰을 참조해야 한다.

## 7.3 정성 실행방안과 수치 시나리오

```text
ProposalAction: 무엇을·왜·언제·어떤 조건으로 검토할지
ScenarioProjection: 승인된 비용·기간·임대·공실 가정에 따른 수치결과
```

둘을 같은 객체에 넣지 않는다. 가정이 부족해도 정성 실행방안은 표시할 수 있지만 수치효과는 만들지 않는다.

---

# 8. 문서등급과 발행상태

## 8.1 DocumentLevel

```text
L0
L1
L1.5
L2
L3
L4
```

외부 문서에는 코드명을 노출하지 않는다.

## 8.2 가능한 등급과 목표등급

- `eligibleLevels`: 패키지가 안전하게 만들 수 있는 등급
- `targetLevel`: 사용자가 선택한 등급
- `actualLevel`: 실제 포함 내용이 충족한 등급

`targetLevel`이 `eligibleLevels`에 없으면 생성 거부 또는 낮은 등급 제안이다. 자동 상향은 하지 않는다.

## 8.3 PublicationProject 상태

```text
draft
composing
ready_for_review
revision_needed
machine_blocked
machine_passed
approved
published
invalidated
archived
```

허용 전이:

```text
draft → composing → ready_for_review
ready_for_review → revision_needed → composing
ready_for_review → machine_blocked → composing
ready_for_review → machine_passed → approved → published
machine_passed → composing  # 편집 시 검사결과 무효
approved → invalidated      # 입력·해시 변경
published → invalidated     # 새 스냅샷 또는 정책상 중대변경
* → archived               # 승인된 보존정책 경유
```

임의 DB status update를 금지하고 전이서비스만 사용한다.

---

# 9. 승인범위

| 승인종류 | 대상해시 | 재사용범위 |
|---|---|---|
| 사실기준본 확인 | snapshotHash | 같은 스냅샷의 모든 채널 |
| 중개인 의견 공개승인 | proposalUnitHash | 해당 문구·근거가 변하지 않은 채널 |
| 사진 공개승인 | photoDisclosureHash | 같은 가림처리·크롭 범위 |
| 모바일 편집승인 | mobileContentHash | 해당 모바일 버전만 |
| PPTX 편집승인 | pptxCompositionHash | 해당 PPTX 버전만 |
| 최종파일 승인 | artifactHash | 해당 파일만 |

---

# 10. 불변조건

1. 원자료는 수정하지 않는다.
2. 한 발행본은 한 스냅샷과 한 패키지만 쓴다.
3. 외부 수치는 사용가능 또는 조건부 사용가능 산출항목에서만 온다.
4. 조건부 수치는 지정 경고와 산정기준을 함께 표시한다.
5. 운영비가 없으면 NOI와 자본환원율을 만들지 않는다.
6. 관리비 청구액을 임대수입이나 순수입으로 자동 합산하지 않는다.
7. 채권최고액을 대출잔액으로 바꾸지 않는다.
8. 자가사용을 공실로 자동 계산하지 않는다.
9. 대표필지 사실을 전체 필지에 전파하지 않는다.
10. L1.5 의견은 사람의 공개승인이 필요하다.
11. 기계검사 미실행은 통과가 아니다.
12. 승인 대상해시가 현재해시와 다르면 승인할 수 없다.

