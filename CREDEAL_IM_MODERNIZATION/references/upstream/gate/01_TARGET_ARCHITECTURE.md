# 목표 아키텍처

## 1. 전체 처리흐름

```text
중개인 메모
  -> MemoObservationSet
  -> DealCardCandidate
  -> 블라인드 공개검사
  -> 중개인 공개확인
  -> DealCardPublication

MemoObservationSet
  -> 바텀시트 사전채움
  + 공부 API / 첨부자료 / 사진 / 현장확인 / 정정
  -> Evidence Core
  -> EffectiveSnapshot
  -> ClaimEvaluationSet
  -> PublicationPackage
       -> Mobile Composer -> Mobile Artifact -> Mobile Approval
       -> PPTX IM Studio -> PPTX Artifact -> PPTX Approval
```

## 2. 계층별 책임

### 2.1 입력 및 관측 계층

메모, 바텀시트, 공부 API, 첨부문서, 사진, 현장확인을 원문 그대로 보존한다. 파싱값은 사실이 아니라 관측값으로 저장한다.

필수 속성:

- 원자료 ID와 버전
- 원자료 내 위치
- 관측값과 단위
- 관측 시각 또는 기준일
- 추출기·모델·규칙 버전
- 신뢰도와 모호성
- 중개인 확인 여부

### 2.2 근거 및 조정 계층

서로 다른 자료의 주소, 면적, 용도, 가격, 임대차, 필지 구성을 비교한다. 상충이 있으면 자동 승자를 선택하지 않고 `Conflict`와 `Correction`을 남긴다.

### 2.3 유효기준본 계층

한 발행본이 참조할 채택값 집합이다. 한 발행본은 하나의 유효기준본만 사용한다. 값 변경은 새 버전을 만든다.

### 2.4 산출항목 판정 계층

입력 충족도, 계산 가능성, 근거상태, 위험등급에 따라 각 산출항목의 외부 사용 가능 여부를 결정한다. 자료 부족은 해당 산출항목에만 영향을 주며 전체 문서를 불필요하게 차단하지 않는다.

### 2.5 공통 발행묶음 계층

채널이 사용할 수 있는 사실·의견·사진·근거·주의문구를 채널 중립적인 구조로 제공한다. PPTX 좌표나 모바일 CSS는 포함하지 않는다.

### 2.6 채널 조립 계층

- 모바일: 2~4분 내 이해 가능한 카드와 섹션으로 조립
- PPTX: 페이지 기획, 사진 인접배치, 표, 부록, 레이아웃을 편집

채널은 새로운 사실판정이나 재무계산을 수행하지 않는다.

## 3. 하네스 제어면

`HarnessOrchestrator`는 다음 입력을 받는다.

```typescript
interface HarnessRunRequest {
  artifactType: ArtifactType;
  artifactId: string;
  artifactHash: string;
  profileId: string;
  policyVersion: string;
  snapshotId?: string;
  publicationPackageId?: string;
  enforcementMode: 'shadow' | 'enforce';
}
```

처리 순서:

1. 검사 프로필 해석
2. `appliesWhen` 평가
3. 관측기 실행
4. 관측값 저장
5. 판정과 조치 계산
6. 필수 반대시험 상태 확인
7. 검사보고서 불변 저장
8. 승인 가능 여부 반환

## 4. 저장 객체

| 객체 | 핵심 역할 |
|---|---|
| `SourceArtifact` | 메모·파일·API 응답 원본 |
| `Observation` | 원자료에서 읽은 값 |
| `Conflict` | 서로 양립할 수 없는 관측값 |
| `Correction` | 채택값과 사유·근거·승인자 |
| `EffectiveSnapshot` | 발행 기준 채택값 집합 |
| `ClaimDefinition` | 산출항목 조건·산식·표시정책 |
| `ClaimEvaluation` | 특정 기준본에서의 판정 결과 |
| `ProposalUnit` | 중개인 의견과 외부문구 |
| `PublicationPackage` | 채널 중립 발행재료 |
| `ArtifactManifest` | 실제 사용한 값·사진·문안·정책·해시 |
| `HarnessReport` | 관측값과 판정이 포함된 검사결과 |
| `ApprovalEvent` | 사람승인·철회·무효화 사건 |

## 5. 책임 경계

| 구성요소 | 수행 | 금지 |
|---|---|---|
| 메모 파서 | 값 후보와 원문 위치 추출 | 누락값 추정·확정 |
| 딜카드 조립기 | 밴딩·마스킹·안전한 요약 | IM 계산·공부사실 단정 |
| Evidence Core | 근거연결·상충·정정 | 외부 카피 편집 |
| Claim Evaluator | 산식·허용상태 판정 | 레이아웃 결정 |
| Mobile Composer | 모바일 순서·문안 조립 | 숫자 재계산 |
| PPTX Studio | 페이지·사진·표·카피 편집 | 모바일 문장에서 숫자 재추출 |
| Harness | 관측·판정·발행차단 | 사람승인을 대체 |
| Approval Service | 승인사건·무효화 | 검사 미실행을 승인으로 우회 |

