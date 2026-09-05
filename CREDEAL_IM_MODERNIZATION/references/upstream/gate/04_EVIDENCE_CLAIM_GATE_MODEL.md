# 근거·산출항목·발행검사 데이터 모델

## 1. 근거 객체

```typescript
interface EvidenceRef {
  evidenceId: string;
  sourceType: 'memo' | 'bottom_sheet' | 'public_api' | 'registry' | 'document' | 'photo' | 'site_check';
  sourceArtifactId: string;
  locator: string;
  asOf: string;
  contentHash: string;
  extractorVersion?: string;
}
```

근거는 파일 URL만 저장하지 않고 문서 페이지, 표 행, API 필드, 메모 위치처럼 재검토 가능한 위치를 가진다.

## 2. 상충과 정정

```typescript
interface Conflict {
  conflictId: string;
  subject: string;
  observationRefs: string[];
  riskClass: 'RC0' | 'RC1' | 'RC2' | 'RC3';
  status: 'open' | 'resolved' | 'accepted_unresolved';
}

interface Correction {
  correctionId: string;
  conflictId?: string;
  chosenValue: string | number | null;
  reason: string;
  evidenceRefs: string[];
  approvedBy: string;
  approvedAt: string;
}
```

핵심주소·매각범위·면적·가격·렌트롤 합계의 상충은 자동 승자를 선택하지 않는다.

## 3. 유효기준본

```typescript
interface EffectiveSnapshot {
  snapshotId: string;
  dealId: string;
  version: number;
  asOf: string;
  values: Record<string, SnapshotValue>;
  correctionRefs: string[];
  sourceHashes: string[];
  snapshotHash: string;
  createdAt: string;
}
```

새 값이 채택되면 기존 기준본을 수정하지 않고 새 버전을 만든다.

## 4. 산출항목 정의와 판정

```typescript
interface ClaimDefinition {
  claimId: string;
  nameKo: string;
  appliesWhen: string;
  requiredInputs: string[];
  formulaRef?: string;
  evidencePolicy: string;
  warningPolicy?: string;
  riskClass: 'RC0' | 'RC1' | 'RC2' | 'RC3';
}

type ClaimDecision =
  | 'ALLOWED'
  | 'ALLOWED_WITH_WARNING'
  | 'BLOCKED'
  | 'NOT_APPLICABLE'
  | 'NOT_AVAILABLE_AT_STAGE'
  | 'NOT_EVALUATED';
```

근거상태와 외부사용 허가상태는 별도로 저장한다.

## 5. 계산 객체

```typescript
interface CalculationRecord {
  calculationId: string;
  formulaId: string;
  formulaVersion: string;
  inputClaimRefs: string[];
  assumptions: Array<{ key: string; value: number; approvedBy?: string }>;
  outputValue: number;
  unit: string;
  roundingPolicy: string;
  reproducibilityHash: string;
}
```

표시명은 계산값에서 임의로 추정하지 않는다. 총수익률·순수익률·매매가 기준·보증금 차감 기준을 계산 객체와 함께 고정한다.

## 6. 검사 정의

검사 정본 필드는 다음을 필수로 한다.

```typescript
interface GateDefinitionV2 {
  gateId: string;
  nameKo: string;
  family: 'eligibility' | 'evidence' | 'content' | 'reasoning' | 'layout' | 'approval';
  artifactTypes: string[];
  appliesWhen: string;
  observerId: string;
  passCondition: string;
  oppositeCondition: string;
  severity: 'block' | 'warn' | 'info';
  failureAction: string;
  positiveFixtureIds: string[];
  negativeFixtureIds: string[];
  mutationOperatorIds: string[];
  owner: string;
  policyVersion: string;
}
```

## 7. 검사 결과

검사 결과에는 최종 boolean만 저장하지 않는다.

- 적용성 판정과 사유
- 관측기 버전
- 실제 관측값
- 기대조건
- 결과상태
- 근거 참조
- 실행시간과 오류
- 검사정책 버전
- 산출물 해시

차단급 검사에서 관측값이 없으면 `PASS`가 아니라 `NOT_RUN` 또는 `INDETERMINATE`다.

## 8. 단일 정본 원칙

임계값·심각도·적용대상·표시명·검사메시지는 YAML 정본에 한 번만 선언한다. 코드·문서·시험목록은 정본에서 생성한다. 코드 내부 임계값 리터럴은 예외승인 없이는 허용하지 않는다.

