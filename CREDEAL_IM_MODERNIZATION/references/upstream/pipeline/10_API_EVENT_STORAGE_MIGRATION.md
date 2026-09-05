# API·이벤트·저장·마이그레이션 사양

## 1. API 원칙

- 변경 요청은 명령 API, 진행·결과는 조회 API로 분리한다.
- 장시간 작업은 `202 Accepted`와 `runId` 또는 `projectId`를 반환한다.
- 폴링과 서버전송사건(SSE)을 모두 지원할 수 있으나 같은 조회모델을 사용한다.
- 오류는 안정된 `errorCode`, 사용자문구, 기술추적번호, 재시도·보완 힌트를 가진다.
- 모든 명령은 `Idempotency-Key`를 요구한다.

## 2. 권장 API

### CORE

```text
POST /api/im/cases/{caseId}/pipeline-runs
GET  /api/im/pipeline-runs/{runId}
GET  /api/im/pipeline-runs/{runId}/stages
GET  /api/im/pipeline-runs/{runId}/events
POST /api/im/pipeline-runs/{runId}/resume
POST /api/im/pipeline-runs/{runId}/cancel
GET  /api/im/packages/{packageId}
POST /api/im/packages/{packageId}/regeneration-plan
POST /api/im/regeneration-plans/{planId}/execute
```

### 모바일

```text
POST /api/im/packages/{packageId}/mobile-drafts
GET  /api/im/mobile-publications/{publicationId}
PUT  /api/im/mobile-publications/{publicationId}/content
POST /api/im/mobile-publications/{publicationId}/validate
POST /api/im/mobile-publications/{publicationId}/approvals
POST /api/im/mobile-publications/{publicationId}/publish
POST /api/im/mobile-publications/{publicationId}/revoke
```

### PPTX Studio

```text
POST /api/im/packages/{packageId}/pptx-projects
GET  /api/im/pptx-projects/{projectId}
PUT  /api/im/pptx-projects/{projectId}/composition
PUT  /api/im/pptx-projects/{projectId}/copy
PUT  /api/im/pptx-projects/{projectId}/media
POST /api/im/pptx-projects/{projectId}/previews
POST /api/im/pptx-projects/{projectId}/validate
POST /api/im/pptx-projects/{projectId}/approvals
POST /api/im/pptx-projects/{projectId}/exports
GET  /api/im/exports/{exportId}
```

## 3. 응답 예

```json
{
  "runId": "RUN-UUID",
  "status": "queued",
  "statusUrl": "/api/im/pipeline-runs/RUN-UUID",
  "eventsUrl": "/api/im/pipeline-runs/RUN-UUID/events",
  "acceptedAt": "2026-08-31T10:00:00+09:00"
}
```

조회응답은 기술단계와 사용자단계를 함께 준다.

```json
{
  "status": "blocked",
  "technicalStage": "P20",
  "userPhase": "자료 확인",
  "progressPct": 38,
  "needsAction": true,
  "actionItems": [{"code":"SELECT_PARCEL_SCOPE","label":"매각대상 필지를 확인해 주세요."}]
}
```

## 4. 이벤트

핵심 사건:

- `PipelineRunCreated`
- `StageQueued`, `StageLeased`, `StageStarted`
- `StageSucceeded`, `StageFailed`, `StageBlocked`
- `ArtifactRegistered`, `ArtifactQuarantined`
- `EffectiveSnapshotCreated`
- `ClaimEvaluationCompleted`
- `CoreGateCompleted`
- `PublicationPackageCreated`
- `ChannelBuildRequested`
- `ChannelVersionCreated`, `ChannelValidationCompleted`
- `ApprovalGranted`, `ApprovalRejected`, `ApprovalInvalidated`
- `PublicationPublished`, `PublicationRevoked`
- `RegenerationPlanned`, `RegenerationStarted`
- `PipelineRunSucceeded`, `PipelineRunPartiallySucceeded`, `PipelineRunFailed`

사건은 사실을 과거형으로 기록한다. 소비자가 실패해도 보관함 발행자가 다시 전달한다. 소비자는 `eventId`로 중복처리한다.

## 5. 권장 테이블

### 신규 정본 테이블

| 테이블 | 목적 | 주요키 |
|---|---|---|
| `im_pipeline_runs` | 부모·자식 실행 | id, case_id, run_type, status, input_version |
| `im_stage_executions` | 단계별 시도·임대·오류 | id, run_id, stage_code, attempt |
| `im_artifacts` | 불변 산출물 등록부 | id, type, content_sha256, storage_uri |
| `im_artifact_edges` | 산출물 의존관계 | parent_id, child_id, relation |
| `im_event_outbox` | 트랜잭션 사건 보관함 | id, aggregate_id, event_type, payload |
| `im_event_log` | 발행된 사건 조회 | event_id, occurred_at |
| `im_publication_projects` | 채널 편집 작업 | id, package_id, channel, version |
| `im_publication_versions` | 채널별 불변 발행본 | id, project_id, content_hash, status |
| `im_approval_events` | 사람 승인·거부·무효 | id, subject_id, approval_type, hashes |
| `im_distribution_records` | 공개·철회·다운로드 | id, publication_version_id, status |

### 기존 테이블의 역할

- `im_generation_jobs`: 전환기간 조회 호환 투영. 신규 정본이 아님.
- `document_objects`: 구형 공개화면·검색 호환 투영. 스냅샷·판정·승인 정본이 아님.
- `im_generation_metrics`: 단계·산출항목 계측으로 확장 또는 새 관측 저장소에 연결.
- `im_public_api_log`: `run_id`, `stage_execution_id`, cache 상태를 추가.
- `im_edit_events/im_edit_diffs`: 채널 프로젝트·내용단위 참조를 추가.

## 6. 주요 제약조건

- `(run_id, stage_code, attempt)` 유일
- `(stage_reuse_key, status='succeeded')` 논리적 유일
- `content_sha256`은 본문 저장 후 변경 불가
- 승인행에 대상해시 최소 1개 필수
- 발행레코드는 승인된 발행버전만 참조
- 자식 채널 실행의 `parent_run_id`와 `package_id` 필수
- 상태열은 정해진 열거값만 허용
- 다중 작업자 갱신은 `lease_token` 조건부

## 7. 마이그레이션 단계

### DB-0 관측과 봉합

- 현행 job ID의 실제 형식과 UUID 외래키 불일치 점검
- 생성결과에 `gateReport`, `claimSet`, 규칙버전·해시 임시 저장
- 승인 API 해시검사 추가

### DB-1 추가형 스키마

- 신규 테이블·인덱스·RLS 추가
- 기존 테이블 변경은 nullable 참조열만 추가
- 사건 보관함 발행자와 정리작업 배포

### DB-2 이중기록

- 신규 파이프라인 실행을 정본에 기록
- 동시에 `im_generation_jobs`와 `document_objects`에 호환 투영
- 이중기록 차이를 일별 대조

### DB-3 읽기전환

- 내부 관리화면 → 신규 조회모델
- 모바일 공개화면 → 신규 발행버전, 실패 시 구형 읽기
- PPTX 다운로드 → 승인된 `RenderedArtifact`

### DB-4 쓰기종료

- 구형 생성경로 신규진입 차단
- 과거 자료 읽기만 유지
- 보존기간 후 호환열 제거는 별도 ADR 필요

## 8. RLS·권한

- 중개인은 자신이 소유하거나 공유받은 거래건 실행만 조회한다.
- 서비스 작업자는 필요한 테이블과 저장경로에만 쓰기 가능하다.
- 승인권한은 거래건 역할과 승인종류로 나눈다.
- 공개 API는 `im_distribution_records`의 활성 공개본만 읽는다.
- 원자료와 개인정보 산출물은 공개 채널 서비스 계정이 읽지 못하게 한다.

## 9. 현행 API 호환

`POST /api/broker/im-lite/generate-async`:

- 내부적으로 새 CORE+모바일 명령을 생성
- 기존 `jobId` 응답 유지, `runId` 추가
- 상태 조회는 신규 실행상태를 기존 3상태로 축약해 반환

`GET /api/public/im-lite/{buildingId}/pptx`:

- 승인된 Studio 파일이 있으면 재다운로드
- 없다면 `409 PPTX_PROJECT_REQUIRED`와 Studio 시작 안내
- 전환 기능깃발 대상만 제한적으로 구형 즉석렌더

## 10. 되돌리기

- 신규 테이블은 삭제하지 않고 기능깃발만 구형 읽기·쓰기로 되돌린다.
- 이중기록 기간에는 구형 투영을 계속 유지한다.
- 신규 산출물과 승인사건은 보존한다.
- 데이터 변환 실패는 원본 정본을 수정하지 않고 재투영한다.

