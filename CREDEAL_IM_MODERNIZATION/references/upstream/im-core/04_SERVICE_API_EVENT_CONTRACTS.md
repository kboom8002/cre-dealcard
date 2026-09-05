# 서비스·API·이벤트 계약

> 설계 ID: `IC-API-001`  
> 원칙: 외부 URL 보존, 내부 책임분리, 멱등·해시·명시적 오류

---

# 1. 애플리케이션 서비스

## 1.1 EvidenceService

```typescript
interface EvidenceService {
  collectObservations(input: CollectEvidenceInput): Promise<ObservationBatch>;
  detectConflicts(caseRef: CaseRef): Promise<ConflictSet>;
  recordCorrection(input: RecordCorrectionInput): Promise<Correction>;
  materializeSnapshot(input: MaterializeSnapshotInput): Promise<EffectiveSnapshot>;
}
```

`collectObservations`은 원시 외부 API를 호출하는 오케스트레이터가 아니다. 기존 보강결과를 관측기록으로 수용하는 경계다.

## 1.2 ClaimEvaluationService

```typescript
interface ClaimEvaluationService {
  evaluate(snapshotId: string, context: MVPContext): Promise<ClaimEvaluationSet>;
  recompute(claimIds: string[], snapshotId: string): Promise<ClaimEvaluationSet>;
  explain(evaluationId: string): Promise<ClaimEvaluationExplanation>;
}
```

`recompute`는 공식등록부에 있는 결정론적 산출항목에만 허용한다.

## 1.3 PublicationPackageService

```typescript
interface PublicationPackageService {
  determineEligibility(snapshotId: string, evaluations: ClaimEvaluationSet): Promise<EligibilityResult>;
  build(input: BuildPackageInput): Promise<PublicationPackage>;
  validate(packageId: string): Promise<CoreGateReport>;
}
```

## 1.4 Channel services

```typescript
interface MobileComposerService {
  createDraft(input: CreateMobileDraftInput): Promise<PublicationProject>;
  compose(projectId: string): Promise<MobilePublicationVersion>;
}

interface PptxStudioService {
  createProject(input: CreatePptxProjectInput): Promise<PublicationProject>;
  proposeComposition(projectId: string): Promise<CompositionPlan>;
  updateProject(input: UpdateStudioProjectInput): Promise<PublicationProject>;
  renderPreview(projectId: string): Promise<PptxPreviewResult>;
  renderFinal(projectId: string): Promise<PptxArtifactResult>;
}
```

## 1.5 ApprovalService

```typescript
interface ApprovalService {
  runMachineChecks(publicationVersionId: string): Promise<ChannelGateReport>;
  approve(input: ApprovePublicationInput): Promise<ApprovalEvent>;
  reject(input: RejectPublicationInput): Promise<ApprovalEvent>;
  invalidate(input: InvalidatePublicationInput): Promise<ApprovalEvent>;
  publish(input: PublishPublicationInput): Promise<PublicationVersion>;
}
```

---

# 2. API 원칙

- 기존 공개 URL `/im-lite/{id}` 유지
- 내부 신규 API는 `/api/broker/im-core/*`, `/api/broker/pptx-studio/*`
- 모든 변경 요청에 `Idempotency-Key`
- 편집 요청에 `If-Match` 또는 `expectedLockVersion`
- 승인·발행 요청에 `expectedHash`
- 응답에 `correlationId`
- 서버가 해시·권한·상태를 재검사
- 원자료 JSON을 채널 API에 직접 전달하지 않음

---

# 3. CORE API

## 3.1 스냅샷 생성

`POST /api/broker/im-core/snapshots`

요청:

```json
{
  "caseRef": {"type": "building_ssot_lite", "id": "uuid"},
  "asOf": "2026-08-31T00:00:00+09:00",
  "assetScopeVersion": 3,
  "correctionIds": ["uuid"],
  "reason": "initial_generation"
}
```

응답 `201`:

```json
{
  "snapshotId": "uuid",
  "snapshotHash": "sha256:...",
  "status": "valid",
  "openMaterialConflicts": [],
  "correlationId": "uuid"
}
```

중대한 식별·범위 불일치가 있으면 `422 IM_CORE_ASSET_SCOPE_UNRESOLVED`.

## 3.2 산출항목 평가

`POST /api/broker/im-core/snapshots/{snapshotId}/evaluate`

요청:

```json
{
  "assetForm": "whole_building",
  "lenses": ["yield", "value_add"],
  "requestedClaimIds": "mvp_default"
}
```

응답에는 상태별 개수, 가능한 문서등급, 보완과제 최대 3개를 포함한다. 전체 평가는 별도 상세 조회로 제공한다.

## 3.3 발행묶음 생성

`POST /api/broker/im-core/publication-packages`

요청:

```json
{
  "snapshotId": "uuid",
  "targetLevel": "L1.5",
  "disclosurePolicyId": "public_blind",
  "selectedProposalUnitIds": ["uuid"],
  "selectedPhotoAssetIds": ["uuid"]
}
```

목표등급이 불가능하면 `409 IM_PACKAGE_LEVEL_NOT_ELIGIBLE`와 가능한 등급·보완과제를 반환한다.

---

# 4. 모바일 API

기존 `POST /api/broker/im-lite/generate`를 유지한다. 기능깃발과 요청필드로 신경로를 선택한다.

```json
{
  "building_id": "uuid",
  "engine_version": "im_core_v1",
  "target_level": "L1.5",
  "selected_proposal_unit_ids": ["uuid"],
  "representative_photo_id": "uuid"
}
```

신경로 응답은 기존 필드와 다음을 함께 제공한다.

```json
{
  "im_lite_id": "document-object-uuid",
  "publication_project_id": "uuid",
  "publication_version_id": "uuid",
  "snapshot_id": "uuid",
  "package_id": "uuid",
  "actual_level": "L1.5",
  "status": "ready_for_review"
}
```

기존 승인 URL `POST /api/broker/im-lite/{id}/approve`는 `document_objects.body.publication_version_id`가 있으면 신규 ApprovalService로 위임한다. 없으면 구형 read-only 승인정책을 적용하되 이벤트에 `legacy=true`를 남긴다.

---

# 5. PPTX IM Studio API

## 5.1 프로젝트 생성

`POST /api/broker/pptx-studio/projects`

```json
{
  "packageId": "uuid",
  "targetLevel": "L1.5",
  "brief": {
    "documentPurpose": "sale_proposal",
    "audience": "private_buyer",
    "primaryAppeal": ["location", "tenant_mix", "value_add"],
    "presetId": "jsre_field_navy"
  }
}
```

## 5.2 구성안 생성

`POST /api/broker/pptx-studio/projects/{projectId}/compose`

서버는 패키지의 허용된 내용 단위만 사용한다. 결과에는 사용·미사용 내용 단위와 사유를 포함한다.

## 5.3 편집

`PATCH /api/broker/pptx-studio/projects/{projectId}`

```json
{
  "expectedLockVersion": 4,
  "operations": [
    {"op": "replace_copy", "contentUnitId": "CU-SELLING-POINTS", "field": "title", "value": "..."},
    {"op": "move_page", "pageId": "PAGE-07", "afterPageId": "PAGE-03"},
    {"op": "bind_photo", "pageId": "PAGE-03", "slot": "hero", "photoAssetId": "uuid"}
  ]
}
```

구조화 수치 필드를 일반 텍스트로 덮어쓸 수 없다. 수치 변경은 스냅샷 보완으로 돌아간다.

## 5.4 미리보기

`POST /api/broker/pptx-studio/projects/{projectId}/preview`

응답:

- 미리보기 URL 또는 이미지 목록
- 지면검사 결과
- 사용된 package/content/photo/layout hash
- 경고와 차단

## 5.5 승인·내보내기

`POST /api/broker/pptx-studio/projects/{projectId}/approve`

```json
{
  "expectedHash": "sha256:composition...",
  "approvalScope": ["copy", "photo", "layout"],
  "notes": "최종 문안·사진 확인"
}
```

`POST /api/broker/pptx-studio/projects/{projectId}/export`

최종파일 렌더 후 artifact hash가 생기면 별도 `artifact_final` 승인을 요구한다. 베타에서는 편집승인과 파일승인을 한 화면에서 연속 수행할 수 있으나 사건은 둘로 기록한다.

---

# 6. 이벤트

`src/contracts/events.ts`에 다음을 추가한다.

```text
im.snapshot.materialized
im.snapshot.invalidated
im.conflict.detected
im.correction.recorded
im.claims.evaluated
im.package.built
im.package.blocked
im.mobile.draft_created
im.mobile.machine_checked
im.pptx_studio.project_created
im.pptx_studio.composed
im.pptx_studio.preview_rendered
im.publication.machine_blocked
im.publication.machine_passed
im.publication.approved
im.publication.rejected
im.publication.published
im.publication.invalidated
im.approval.hash_mismatch
im.compat.legacy_adapter_used
```

공통 이벤트 속성:

```typescript
interface IMEventEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: string;
  actorId?: string;
  ownerId: string;
  caseRef: CaseRef;
  snapshotId?: string;
  packageId?: string;
  projectId?: string;
  publicationVersionId?: string;
  correlationId: string;
  payload: Record<string, unknown>;
}
```

원문·임차인명·계약내용·사진 URL을 이벤트 payload에 넣지 않는다.

---

# 7. 오류코드

| 코드 | HTTP | 의미 |
|---|---:|---|
| `IM_CORE_SCHEMA_INVALID` | 400 | 자료계약 불일치 |
| `IM_CORE_CASE_NOT_FOUND` | 404 | 거래건 없음 |
| `IM_CORE_ASSET_SCOPE_UNRESOLVED` | 422 | 매각범위 미확정 |
| `IM_CORE_CONFLICT_OPEN` | 422 | 의존 중대불일치 |
| `IM_CORE_SNAPSHOT_STALE` | 409 | 최신 유효기준본 아님 |
| `IM_CLAIM_NOT_EVALUATED` | 422 | 필수 판정 미실행 |
| `IM_PACKAGE_LEVEL_NOT_ELIGIBLE` | 409 | 목표등급 불가 |
| `IM_PACKAGE_GATE_BLOCKED` | 422 | CORE 발행검사 차단 |
| `IM_PROJECT_VERSION_CONFLICT` | 409 | lock_version 불일치 |
| `IM_APPROVAL_HASH_MISMATCH` | 409 | 승인대상 변경 |
| `IM_APPROVAL_PREREQUISITE_MISSING` | 422 | 선행승인 없음 |
| `IM_PUBLICATION_INVALIDATED` | 410 | 무효 발행본 |
| `IM_PPTX_LAYOUT_BLOCKED` | 422 | 지면검사 차단 |
| `IM_COMPAT_UNCONVERTIBLE` | 422 | 구문서 자동변환 불가 |

---

# 8. 멱등성

- 스냅샷: caseRef + observation/correction hash + materializerVersion
- 평가: snapshotHash + claimDefinitionSetVersion + context hash
- 패키지: snapshotId + evaluation hash + targetLevel + disclosure policy + selection hash
- 렌더: publication content/layout/photo hash
- 승인: actor + approvalType + targetHash

같은 멱등키와 같은 요청은 같은 결과를 반환한다. 같은 멱등키에 다른 body가 오면 `409 IDEMPOTENCY_KEY_REUSED`.

