# 조정·상태·멱등성·재시도 사양

## 1. 설계원칙

- 적어도 한 번 전달(at-least-once)을 전제로 각 단계는 멱등하게 만든다.
- 단계 성공과 다음 단계 예약은 사건 보관함을 통해 유실 없이 연결한다.
- 재시도는 같은 논리단계의 새 `attempt`이며 산출물 중복을 만들지 않는다.
- 사용자 보완이 필요한 실패를 자동 재시도로 숨기지 않는다.
- 운영자가 수동 완료값을 쓰지 않고 명령으로 재개·취소·대체한다.

## 2. 실행상태 계산

우선순위는 다음과 같다.

1. 명시적 취소 → `cancelled`
2. 새 실행으로 대체 → `superseded`
3. 필수 단계 `failed_fatal` → `failed`
4. 필수 단계 `blocked_user|blocked_policy` → `blocked`
5. CORE 성공, 일부 요청채널 실패 → `partially_succeeded`
6. 요청한 모든 종료산출물 존재 → `succeeded`
7. 나머지 → `running` 또는 `queued`

## 3. 멱등키

### 명령 멱등키

클라이언트가 제공하되 서버가 범위를 붙인다.

```text
tenantId:actorId:caseId:commandType:clientKey
```

같은 키와 다른 본문해시가 오면 `409 IDEMPOTENCY_PAYLOAD_MISMATCH`를 반환한다.

### 단계 재사용키

```text
sha256(stageCode | inputArtifactHashes | policyVersions | executionProfile)
```

`attempt`는 재사용키에 넣지 않는다. 같은 작업을 다시 시도해도 하나의 성공 산출물만 확정한다.

### 파일 렌더키

```text
sha256(projectVersionHash | rendererVersion | themeVersion | exportOptions)
```

## 4. 작업임대와 심장박동

- 기본 임대시간: 60초
- 심장박동: 15초
- 장기 렌더: 임대시간 180초, 심장박동 30초
- 재임대 가능: `leaseExpiresAt < now`이고 성공산출물 없음
- 늦은 완료방지: 저장 시 현재 `leaseToken` 일치 필수
- 실행자 종료 시 보상은 필요 없으며 임대만 만료시킨다.

## 5. 오류분류

| 분류 | 의미 | 자동 재시도 | 사용자 노출 |
|---|---|---:|---|
| transient_external | 공급자 시간초과·429·5xx | 예 | 공급자 지연 |
| transient_internal | DB 잠금·저장소 일시오류 | 예 | 처리 지연 |
| invalid_input | 형식·단위·필수식별자 오류 | 아니오 | 수정항목 |
| missing_evidence | 필요한 자료 없음 | 아니오 | 보완자료 |
| unresolved_conflict | 사람이 채택해야 하는 불일치 | 아니오 | 비교값·선택요청 |
| policy_block | 발행불변조건 위반 | 아니오 | 차단사유·해소방법 |
| concurrency_conflict | 예상버전 불일치 | 아니오 | 새로고침·재적용 |
| deterministic_bug | 스키마·불변조건·코드 오류 | 1회 후 아니오 | 일반 오류, 운영경보 |
| render_defect | 넘침·겹침·파일손상 | 조건부 | 수정필요 항목 |
| cancelled | 사용자·상위 실행 취소 | 아니오 | 취소됨 |

## 6. 기본 재시도 정책

| 작업 | 최대 시도 | 지연 | 대체처리 |
|---|---:|---|---|
| 공공 API GET | 3 | 2초, 6초, 18초 + 무작위분산 | 유효 캐시가 있으면 명시적 cached Observation |
| DB/저장소 일시오류 | 4 | 1초, 3초, 9초, 27초 | 없음 |
| LLM 문안 | 2 | 2초, 8초 | 수치·판단을 만들지 않는 결정론 초안 또는 보완대기 |
| 결정론 CORE | 2 | 즉시 1회 | 두 번째 실패 시 치명오류 |
| PPTX 미리보기/렌더 | 2 | 5초 | 프로젝트 보존, 오류위치 반환 |
| 승인 | 1 | 없음 | 같은 멱등키 재호출은 기존 승인 반환 |

429의 `Retry-After`가 있으면 이를 우선한다. 전체 단계 마감시각 이후에는 예약하지 않는다.

## 7. 순환차단기

공급자별 최근 1분 최소 20건 중 실패율 60% 이상이면 열림 상태로 전환한다.

- 열림: 새 호출 중단, 캐시 또는 결손기록
- 60초 후 반열림: 제한된 시험호출
- 연속 3건 성공: 닫힘

순환차단은 해당 공급자 하위작업만 제어하며 파이프라인 전체를 임의 성공시키지 않는다.

## 8. 중단·재개

재개명령은 마지막 성공단계를 단순 추측하지 않는다. 다음을 검사한다.

1. 성공 산출물이 존재하고 해시가 맞는가
2. 스키마와 정책버전이 재사용 가능한가
3. 상위 입력이 아직 최신인가
4. 철회·오염·개인정보삭제 표식이 없는가

검사를 통과한 가장 먼 단계 이후부터 예약한다. 통과하지 못한 최초 단계부터 다시 실행한다.

## 9. 취소·대체

- 취소는 아직 시작하지 않은 단계 예약을 없애고 실행중 작업에 취소표식을 보낸다.
- 이미 생성된 불변 산출물은 감사·재사용 정책에 따라 보존한다.
- 새 입력버전으로 대체된 실행은 `supersededByRunId`를 기록한다.
- 발행된 산출물이 있는 실행은 대체되더라도 삭제하지 않는다.

## 10. 채널 격리

- P60 성공은 CORE 실행의 성공이다.
- 모바일 실패는 `mobile child run`만 실패한다.
- PPTX 실패는 Studio 프로젝트와 오류를 보존한다.
- 부모 실행 조회에는 채널별 상태를 함께 보여주되 한 채널 실패로 P60을 실패로 되돌리지 않는다.

## 11. 보상작업

보상은 원자료 삭제가 아니라 외부효과 취소에만 사용한다.

| 외부효과 | 보상 |
|---|---|
| 잘못 공개된 모바일 링크 | 배포레코드 철회, 링크 410 또는 최신 승인본으로 전환 |
| 잘못 공개된 PPTX URL | 서명 URL 만료·배포레코드 철회 |
| 승인 후 프로젝트 변경 | 승인 무효사건 추가 |
| 중복 렌더파일 | 참조 없는 파일을 보존기간 후 정리 |
| 잘못된 사건발행 | 정정사건 추가, 과거 사건 수정 금지 |

## 12. 운영자 명령

- `ResumePipelineRun(runId, fromStage?)`
- `CancelPipelineRun(runId, reason)`
- `SupersedePipelineRun(oldRunId, newRunId)`
- `RetryStage(stageExecutionId)` — 재시도 가능 분류만
- `RebuildReadModel(caseId)`
- `QuarantineArtifact(artifactId, reason)`
- `RevokePublication(publicationId, reason)`

모든 운영자 명령은 사유·행위자·시각·대상버전을 감사로그에 남긴다.

