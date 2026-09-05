# 목표 IM 제작 파이프라인 상세설계

## 1. 시스템 맥락

### 행위자

- 중개인: 거래건 입력, 자료보완, 중개인 의견 작성, 문안·사진·발행 승인
- 제작담당자: PPTX Studio 편집, 지면검수, 파일 내보내기
- 매수자: 승인된 모바일 링크·PPTX 파일 열람
- 운영자: 실행재개, 오류조사, 기능깃발, 공급자 장애대응
- 공공자료 공급자: 국토교통부·브이월드·건축물대장 등 외부자료 제공
- AI 모델: 허용된 내용 단위의 요약·문안 후보 작성; 사실판정자는 아님

### 외부 시스템

- 인증·권한
- 거래건 및 `building_ssot_lite`
- 파일·사진 저장소
- 작업대기열 또는 영속 작업실행기
- 관계형 DB
- LLM 공급자
- 공공 API
- PPTX 렌더링 실행환경

## 2. 상위 구성도

```text
API/화면
  └─ Command Gateway
      ├─ Idempotency Store
      └─ Pipeline Orchestrator
          ├─ Stage Scheduler / Worker Lease
          ├─ Evidence Workers
          ├─ Core Decision Workers
          ├─ Mobile Workers
          └─ PPTX Studio Workers

영속영역
  ├─ Pipeline Run / Stage Execution
  ├─ Artifact Registry + Object Storage
  ├─ Event Outbox / Event Log
  ├─ Snapshot / Claim / Package Read Models
  ├─ Channel Project / Publication Version
  └─ Approval Event / Distribution Log
```

## 3. 파이프라인 유형

| 유형 | 시작명령 | 종료 산출물 | 비고 |
|---|---|---|---|
| CORE 제작 | `CreateCorePipelineRun` | PublicationPackage | 채널 없이 종료 가능 |
| 모바일 제작 | `CreateMobileDraft` | MobilePublicationVersion | 기존 패키지에서 시작 |
| PPTX 제작 | `CreatePptxStudioProject` | PptxStudioProjectVersion | 자동초안 후 편집 가능 |
| 재생성 | `RequestRegeneration` | 영향받은 새 버전 | 변경영향계획 필수 |
| 재검사 | `ReevaluatePolicy` | 새 GateReport/Package | 규칙버전 변경 대응 |
| 재렌더 | `RenderChannelArtifact` | 새 파일 산출물 | 사실·문안 불변 |

## 4. CORE 단계 그래프

| 단계 | 이름 | 주요 출력 | 다음 단계 조건 |
|---|---|---|---|
| P00 | 요청접수·입력동결 | IntakeEnvelope | 입력스키마·권한 통과 |
| P10 | 근거수집·정규화 | EvidenceCollection | 필수 공급자 응답 또는 명시적 결손기록 |
| P20 | 매각범위·불일치조정 | ReconciliationSet | 핵심 불일치의 채택·차단 결정 |
| P30 | 유효기준본 | EffectiveSnapshot | 해시·기준일·매각범위 고정 |
| P40 | 산출항목 계산·판정 | ClaimEvaluationSet | 모든 대상항목이 6상태 중 하나 |
| P50 | CORE 검사·등급가능범위 | CoreGateReport, LevelEligibility | H0 차단 없음 또는 내부초안만 허용 |
| P60 | 공통 발행묶음 | PublicationPackage | 패키지 스키마·계보·해시 통과 |

P10은 공급자별 병렬 하위작업으로 구성할 수 있다. P40은 산출항목 의존그래프로 병렬화할 수 있다. P30·P50·P60은 하나의 입력 집합에서 원자적으로 확정한다.

## 5. 채널 분기 그래프

### 모바일

```text
M00 채널요청 → M10 내용선택·구성 → M20 문안·표·사진조립
→ M30 모바일검사 → M40 사람검토·승인 → M50 발행
```

### PPTX Studio

```text
S00 프로젝트생성 → S10 페이지구성안 → S20 문안·표 계획 → S30 사진·레이아웃
→ S40 미리보기 → S50 지면·사실 교차검사 → S60 최종승인 → S70 렌더·배포
```

S10~S40은 사용자의 편집으로 여러 버전을 만들 수 있다. S50은 고정 프로젝트 버전에만 실행한다. S60 승인 후 프로젝트가 바뀌면 승인과 S50 결과가 무효가 된다.

## 6. 명령처리

모든 변경 API는 명령으로 취급한다.

필수 머리정보:

```yaml
commandId: UUID
commandType: CreateCorePipelineRun
idempotencyKey: broker-17:deal-42:core:input-r9
actorId: broker-17
caseId: deal-42
expectedVersion: 8
requestedAt: 2026-08-31T10:00:00+09:00
correlationId: CORR-UUID
causationId: null
payload: {}
```

처리순서:

1. 인증·권한
2. 명령 스키마검사
3. 멱등키 조회
4. 예상버전 비교
5. 실행 또는 프로젝트 생성
6. 최초 단계 예약과 보관함 사건 기록을 같은 트랜잭션으로 처리
7. `202`와 조회 URL 반환

## 7. 단계실행 계약

모든 단계 실행자는 같은 포락선(envelope)을 사용한다.

```yaml
stageExecutionId: UUID
runId: UUID
stageCode: P30
attempt: 1
inputArtifacts:
  - artifactId: ART-RECON-01
    sha256: "..."
policyVersions:
  parcel: 2.1.0
  corrections: 1.0.0
leaseToken: opaque-token
deadlineAt: 2026-08-31T10:03:00+09:00
```

성공응답은 출력 산출물 ID·해시·스키마버전과 계측값을 반환한다. 실패응답은 오류코드, 분류, 안전한 사용자문구, 재시도 가능시각, 입력보완 요구를 반환한다.

## 8. 산출물 저장

산출물은 다음 두 부분으로 저장한다.

- 등록정보: DB의 `im_artifacts`
- 본문: 작으면 JSONB, 크거나 파일이면 객체저장소

필수 등록정보:

- `artifact_id`, `artifact_type`, `schema_version`
- `case_id`, `run_id`, `produced_by_stage_execution_id`
- `parent_artifact_ids`
- `content_sha256`, `size_bytes`, `storage_uri`
- `policy_versions`, `created_at`, `retention_class`
- `contains_personal_data`, `disclosure_class`

본문은 생성 후 변경하지 않는다. 오류수정은 새 산출물을 만든다.

## 9. 동시성

### 거래건 동시 실행

- 동일 입력버전·정책버전·목표인 CORE 명령은 멱등키로 합친다.
- 다른 입력버전이면 최신 실행을 계속하고 이전 실행은 P30 확정 전에 `superseded`할 수 있다.
- P30 이후 발행에 사용된 실행은 삭제하지 않고 완료 또는 오래된 상태로 남긴다.

### Studio 동시 편집

- 프로젝트 버전에 정수 `version`을 둔다.
- 저장명령은 `expectedVersion`을 요구한다.
- 충돌 시 자동 병합하지 않고 변경단위와 최신버전을 반환한다.

### 작업임대

- 작업자는 단계행을 조건부 갱신해 임대한다.
- 임대에는 `workerId`, `leaseToken`, `leaseExpiresAt`, `heartbeatAt`가 있다.
- 만료 후 다른 작업자가 재임대할 수 있지만, 첫 작업자의 늦은 성공은 토큰 불일치로 거부한다.

## 10. 캐시와 재사용

재사용키:

```text
sha256(stageCode + sortedInputArtifactHashes + sortedPolicyVersions + executionProfile)
```

재사용 가능 조건:

- 같은 스키마 주버전
- 같은 정책버전 또는 정책이 명시한 호환범위
- 산출물이 철회·오염·개인정보삭제 대상이 아님
- 기준일 요구를 충족함

외부 API 캐시는 원자료로 등록하며 공급자·조회시각·유효기간을 가진다. 캐시 사용은 결손을 숨기지 않으며 UI와 출처에 `cached`를 표시한다.

## 11. 보안·개인정보

- 원본 임차인명·연락처·등기 개인정보는 발행묶음 전에 공개정책으로 가림처리한다.
- 외부 AI에는 필요한 최소 필드와 가명 식별자만 전달한다.
- 로그와 오류문구에 원문 문서·토큰·서명 URL을 남기지 않는다.
- 승인과 다운로드에는 행위자·목적·IP 또는 기기정보를 정책 범위에서 기록한다.
- 산출물 `disclosure_class`보다 낮은 권한의 채널은 읽을 수 없다.

## 12. 비기능 요구

| 항목 | 요구 |
|---|---|
| 재현성 | 산출물 해시·입력해시·규칙버전으로 같은 판정 재실행 가능 |
| 복구성 | 단계 성공 후 장애 시 다음 단계부터 재개 |
| 확장성 | P10 공급자와 P40 산출항목은 독립 병렬 확장 |
| 격리성 | 채널 실패가 CORE·형제 채널 상태를 손상시키지 않음 |
| 감사성 | 외부 문장·표·사진에서 산출항목·스냅샷·근거 역추적 |
| 안전성 | 차단·미판정·불일치 핵심값의 외부노출 0건 |
| 사용성 | 사용자는 기술단계 대신 ‘자료확인/내용검토/발행준비’로 진행상태 확인 |

## 13. 최종 불변조건

- P60은 P30·P40·P50의 정확한 산출물 해시를 내장한다.
- 채널 버전은 하나의 `packageId`만 참조한다.
- 발행된 채널 버전은 수정하지 않는다.
- 승인사건은 승인 대상 해시를 반드시 가진다.
- 배포주소는 승인된 발행버전만 가리킨다.
- 상위 산출물이 오래된 상태가 되면 자식 발행본도 계산된 상태로 오래됨을 표시한다.

