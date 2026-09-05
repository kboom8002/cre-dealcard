# 산출물 계보와 단계 인수인계

## 1. 목적

파이프라인은 거대한 JSON 한 개를 전달하지 않는다. 각 단계는 필요한 불변 산출물만 읽고 새 산출물을 등록한다. 이 문서는 어떤 값이 어디에서 생겨 어느 문장·표·사진·파일에 쓰였는지 재현하는 계약을 정의한다.

## 2. 산출물 계열

| 계열 | 대표 형식 | 내용 |
|---|---|---|
| 입력 | IntakeEnvelope | 접수 원문, 입력버전, 단위, 목표 |
| 근거 | Observation, EvidenceCollection | API 응답, 입력셀, 문서위치, 사진 메타 |
| 조정 | ConflictSet, CorrectionSet, AssetScope | 비교값, 채택값, 사유, 포함범위 |
| 기준 | EffectiveSnapshot | 발행 기준 유효값 |
| 판정 | ClaimEvaluationSet | 값·공식·상태·경고·근거 |
| 검사 | GateReport, LevelEligibility | 규칙별 판정과 가능등급 |
| 발행재료 | PublicationPackage | 내용·표·사진·주의·출처 |
| 채널작업 | ContentPlan, CopyPlan, LayoutPlan | 독자용 구성·편집계획 |
| 채널결과 | PublicationVersion, RenderedArtifact | 불변 화면·파일 |
| 승인·배포 | ApprovalEvent, DistributionRecord | 승인범위·해시·공개상태 |

## 3. 공통 포락선

모든 산출물은 다음 필드를 가진다.

```yaml
artifactId: ART-UUID
artifactType: effective_snapshot
schemaVersion: 1.0.0
caseId: CASE-UUID
runId: RUN-UUID
producedByStageExecutionId: STAGE-UUID
parentArtifactRefs:
  - artifactId: ART-PARENT
    sha256: "..."
policyVersions:
  corrections: 1.0.0
contentSha256: "..."
createdAt: 2026-08-31T10:00:00+09:00
createdBy: system:effective-snapshot-worker
disclosureClass: confidential
body: {}
```

## 4. 정규 해시

- JSON 키를 사전순 정렬한다.
- 날짜는 ISO 8601과 명시적 시간대로 정규화한다.
- 금액은 원 단위 정수, 비율은 소수값과 표시자릿수를 분리한다.
- `createdAt`, 실행시간, 임시 URL처럼 내용동일성과 무관한 필드는 본문해시에서 제외한다.
- 파일은 원시 바이트 SHA-256을 사용한다.
- 사진 크롭은 원본해시와 크롭 좌표·변환버전의 결합해시를 사용한다.

## 5. 핵심값 계보

예: 매도 희망가

```text
중개인 입력셀
→ OBS-ASK-001
→ COR-ASK-002(부가세 별도 명시)
→ SNAP-014 / askingPriceKrw
→ CLAIM-TX-ASK-001
→ CONTENT-OVERVIEW-003 / factRef
→ MOBILE-CARD-001, PPTX-TABLE-001
→ PUB-MOBILE-R2, PUB-PPTX-R4
```

모든 외부 표시값은 최소한 `claimEvaluationId`를 거쳐야 한다. 주소·사진 촬영일처럼 계산하지 않는 표시값도 사실 산출항목으로 등록한다.

## 6. 문안의 구조화 수치잠금

문안에 숫자를 직접 박아넣지 않고 토큰과 표시규칙을 보존한다.

```yaml
copyUnitId: COPY-001
template: "매도 희망가는 {{claim:TX-C01|format=krw_eok_1}}입니다."
renderedText: "매도 희망가는 120.0억원입니다."
claimRefs: [TX-C01]
copyHash: "..."
```

사용자가 `120억원`을 `110억원`으로 직접 고치면 채널검사는 토큰과 구조화값 불일치를 차단한다. 강조문구처럼 사실값이 아닌 부분은 자유편집할 수 있다.

## 7. 사진 계보

사진은 다음을 추적한다.

- 원본 파일해시와 저장위치
- 촬영·제공·업로드 시각
- 촬영대상과 위치
- 대표사진 여부와 공개승인
- 가림처리와 크롭 변환
- 연결된 산출항목·중개인 의견·페이지 역할
- 사용한 채널 발행버전

사진이 교체되면 사실스냅샷은 보통 유지되지만 그 사진을 근거로 한 의견과 해당 채널 승인은 영향판정 대상이다.

## 8. 단계 인수인계 검사

수신 단계는 시작 전에 다음을 검사한다.

1. 산출물 유형과 스키마 주버전
2. 등록해시와 실제 본문해시
3. 같은 거래건·실행 계보 여부
4. 필수 상위 산출물 존재
5. 격리·철회·오염 표식
6. 개인정보 공개등급
7. 정책버전 호환성

불일치는 입력오류가 아니라 `ARTIFACT_HANDOFF_INVALID` 치명오류다.

## 9. 계보 질의

필수 조회기능:

- 발행문장 → CopyUnit → ClaimEvaluation → EffectiveSnapshot → Observation
- 발행표 셀 → ClaimEvaluation/LeaseRow → 근거파일 위치
- 발행사진 → 변환사진 → 원본사진 → 공개승인
- 발행본 → 패키지 → CORE Gate → 규칙버전
- 승인사건 → 대상해시 → 현재해시 → 유효/무효 사유

## 10. 보존과 삭제

| 등급 | 예 | 권장 |
|---|---|---|
| audit | 스냅샷·판정·승인·발행이력 | 법적·계약정책에 따른 장기보존 |
| operational | 단계로그·중간계획 | 90~180일 후 요약보존 |
| transient | 미리보기·임시이미지 | 7~30일 |
| personal_sensitive | 등기·임차인 원본 | 최소보존·접근통제·삭제이력 |

개인정보 삭제 시 파생 산출물의 계보는 유지하되 원문은 삭제 또는 암호학적 파기하고 `redacted` 상태를 남긴다.

