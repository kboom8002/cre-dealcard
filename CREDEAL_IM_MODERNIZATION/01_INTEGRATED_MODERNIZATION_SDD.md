# CREDEAL 통합 IM 고도화 소프트웨어 설계서

> 문서 ID: `CIM-SDD-001`  
> 버전: `1.0.0`  
> 적용범위: 딜카드·IM CORE·모바일 IM·PPTX IM Studio·게이트·승인·발행  
> 설계수준: 프로그램 및 서비스 경계 SDD

## 0. 설계목표

### 0.1 사용자 목표

중개인은 주소·바텀시트·임대차 현황·사진·중개인 의견을 입력하고 다음을 얻는다.

1. 메모에서 빠르게 만들되 공개범위가 통제된 블라인드 딜카드
2. 공부와 제출자료로 만든 사실확인형 모바일 L1
3. 근거 있는 중개인 의견이 반영된 모바일 L1.5
4. 같은 검증자료를 이용해 별도로 편집하는 PPTX IM
5. 자료가 부족한 부분, 확인해야 할 부분, 다음 행동이 명확한 문서

### 0.2 시스템 목표

- 한 거래건의 원자료·정정·유효기준본·산출항목·문구·사진·발행본 계보를 재현한다.
- 부분실패와 중단 후 성공단계를 잃지 않고 재개한다.
- 모바일과 PPTX를 공통 발행묶음의 독립 채널로 만든다.
- 차단급 검사의 미실행과 시스템오류를 통과로 흡수하지 않는다.
- 사람승인을 대상 버전과 해시에 결속하고 변경 시 자동 무효화한다.
- 구형 URL·기존 발행파일·사용자 자료를 보존하며 단계 전환한다.

### 0.3 비목표

- 감정평가, 법률·세무·건축·구조 전문가의 확정판단
- 자동 적정가 확정, 자동 공사비 확정, 자동 대출승인
- 전문가 협업형 L3/L4 전체 업무흐름
- 공공 API 공급자 자체 품질개선
- 과거 발행본의 일괄 재생성

## 1. 설계 원칙

### SD-01. 산출물은 서로의 사실정본이 아니다

딜카드, 모바일, PPTX는 각자 발행본과 승인을 가진다. 모바일 문안이나 PPTX 텍스트를 다른 채널의 사실 입력으로 사용하지 않는다.

### SD-02. 원자료·관측값·채택값·산출항목을 분리한다

메모 파싱과 API 응답은 관측값이다. 상충과 정정 후 채택된 값만 유효기준본에 들어간다. 외부 문서의 숫자는 허용된 산출항목 또는 결정론적 표시계산에서만 온다.

### SD-03. 문서등급은 허용범위 묶음이다

L1/L1.5/L2는 페이지 수가 아니다. 필요한 산출항목·중개인 의견·사람승인 묶음을 충족할 때만 해당 등급으로 발행한다.

### SD-04. 실행·판정·조립·렌더·승인을 분리한다

- 실행기는 단계·재시도·재개를 관리한다.
- IM CORE는 사실·산출항목·허용범위를 판정한다.
- 채널은 허용된 내용 단위를 조립한다.
- 렌더러는 표현 파일을 만든다.
- 게이트는 실제 관측값과 조건을 판정한다.
- 사람승인은 버전에 결속된 사건이다.

### SD-05. 실패는 보존하고 축소는 재조립한다

실패한 산출항목이나 의견을 숨긴 채 같은 파일을 발행하지 않는다. 안전한 하위 문서가 가능하면 실패 항목을 제거한 새 발행묶음과 새 발행본을 만든다.

## 2. 시스템 맥락

### 2.1 행위자

| 행위자 | 주요 행동 |
|---|---|
| 중개인 | 메모·바텀시트·의견·사진 입력, 정정·문안·공개 승인 |
| 매도인 자료제공자 | 임대차·운영·권리·도면 자료 제공 |
| 제품책임자 | 문서등급·위험등급·전환정책 승인 |
| 도메인 책임자 | 산출항목·산식·용어·근거규칙 승인 |
| 품질책임자 | 시험자료·변조시험·전환판정 승인 |
| 운영자 | 재개·취소·격리·철회·되돌리기 |

### 2.2 외부 시스템

- 국토교통부·브이월드 등 공부·공공자료 API
- 파일·사진 저장소
- 작업대기열 또는 재개 가능한 실행기
- 데이터베이스와 사건 보관함
- PPTX/PDF 렌더러
- 공개 URL·권한·배포 저장소

## 3. 목표 구성요소

```text
Memo Intake ──> MemoObservationSet ──> Dealcard Publication
      │                                      │
      └────────── Bottom Sheet Prefill ──────┘
                         │
Public Data / Files / Photos / Corrections
                         │
                 Evidence & Scope Core
                         │
                 EffectiveSnapshot
                         │
                Claim & Formula Core
                         │
          Eligibility + Core Harness Report
                         │
                 PublicationPackage
                    ┌────┴────┐
             Mobile Composer  PPTX IM Studio
                    │              │
             Mobile Artifact  PPTX Artifact
                    │              │
             Mobile Approval  PPTX Approvals
                    └────┬────┘
                  Release Registry
```

### 3.1 실행 제어면

- `PipelineRun`: 사용자 명령의 전체 실행
- `StageExecution`: P00~P60 및 채널 단계실행
- `ArtifactEnvelope`: 불변 산출물 ID·스키마·해시·계보
- `PipelineEvent`: 상태변화와 보완요청
- `OutboxEvent`: DB와 사건발행의 결속
- `RegenerationPlan`: 변경영향과 재사용·재실행 계획

### 3.2 근거·판정 제어면

- `SourceArtifact`, `Observation`, `Conflict`, `CorrectionEvent`
- `AssetScope`, `RentRoll`, `PhotoAsset`
- `EffectiveSnapshot`
- `ClaimDefinition`, `ClaimEvaluationSet`, `CalculationRecord`
- `ProposalUnit`, `RiskItem`, `DueDiligenceItem`
- `PublicationPackage`, `ContentUnit`

### 3.3 검증·승인 제어면

- `GateDefinition`, `GateObservation`, `GateResult`, `HarnessReport`
- `ApprovalEvent`
- `PublicationVersion`, `ArtifactManifest`, `ReleaseRecord`

## 4. 단계 계약

| 단계 | 입력 | 출력 | 실패 시 |
|---|---|---|---|
| P00 접수 | 사용자 입력·메모·파일 참조 | 동결된 접수봉투 | 보완요청 또는 거부 |
| P10 근거수집 | 접수봉투 | 원자료·관측값·자료목록 | 부분성공 보존, 의존항목 제한 |
| P20 조정 | 관측값·매각범위 | 불일치·정정·필지범위 | 중대 상충은 확인 대기 |
| P30 기준본 | 채택값·정정승인 | 불변 유효기준본 | 생성하지 않음 |
| P40 판정 | 기준본·정의·산식 | 산출항목 판정집합 | 종속 항목 차단 |
| P50 적격·검사 | 판정집합·의견·사진 | 등급 가능범위·CORE 검사보고서 | 안전한 하위 등급 후보 |
| P60 발행묶음 | 허용 항목·문구·사진 | 공통 발행묶음 | 차단항목 참조 시 실패 |

성공한 단계는 입력해시·정책버전·출력해시를 저장한다. 같은 재사용키이면 재계산하지 않는다.

## 5. 채널 계약

### 5.1 딜카드

- 입력: 메모 관측값, 공개변환정책, 중개인 확인
- 출력: 제한 공개 블라인드 안내물
- 금지: 공부 사실로 승격, 정확주소·소유자·임차인 노출, 무단 수익률 생성
- 승인: 블라인드 공개확인과 발행승인

### 5.2 모바일 L1/L1.5

- 입력: `PublicationPackage`와 모바일 계획
- 출력: 카드·표·사진묶음 기반 모바일 발행본
- 기본: L1
- L1.5: 적격한 `ProposalUnit`과 중개인 편집승인이 있을 때만 가능
- 금지: 모바일 조립기에서 숫자 재계산, 원시 enrichment 직접 사용

### 5.3 PPTX IM Studio

- 입력: `PublicationPackage`, 문서개요, 편집결정, 사진계획
- 출력: 버전된 PPTX 프로젝트·미리보기·최종파일
- 승인: 편집승인과 최종 파일해시 승인 분리
- 금지: 모바일 body/markdown을 사실 입력으로 사용, PPTX 텍스트에서 숫자 재추출해 정본화

## 6. 상태모델

### 6.1 검사결과

```text
PASS | FAIL | WARN | NOT_APPLICABLE |
NOT_RUN | INDETERMINATE | SYSTEM_ERROR
```

차단급 검사에서 `FAIL`, `NOT_RUN`, `INDETERMINATE`, `SYSTEM_ERROR`는 외부발행을 차단한다. `NOT_APPLICABLE`은 적용성 사유가 있어야 한다.

### 6.2 실행상태

```text
ACCEPTED → RUNNING → WAITING_INPUT | RETRY_SCHEDULED
→ SUCCEEDED | FAILED | CANCELLED | QUARANTINED
```

전체 실행상태는 단계상태의 투영이다. 운영자가 근거 없이 성공으로 덮어쓰지 않는다.

### 6.3 발행상태

```text
DRAFT → MACHINE_CHECKED → HUMAN_APPROVED → PUBLISHED
PUBLISHED → STALE | WITHDRAWN | SUPERSEDED
```

변경이 해시 결속범위에 영향을 주면 `HUMAN_APPROVED`와 `PUBLISHED`를 유지하지 않고 `STALE`로 전환한다.

## 7. 승인 결속

승인 결속해시는 최소 다음을 포함한다.

```text
snapshotHash
+ claimEvaluationSetHash
+ publicationPackageHash
+ finalCopyHash
+ approvedPhotoSetHash
+ disclosurePolicyVersion
+ terminologyPolicyVersion
+ channelPolicyVersion
+ artifactFileHash(최종 파일승인 시)
```

승인 API는 저장객체를 재수화하고 현재 해시와 `expectedHash`를 비교한 뒤 필수 검사를 다시 확인한다. 빈 Registry나 빈 검사보고서는 승인할 수 없다.

## 8. 변경영향과 재생성

| 변경 | 최소 재시작 | 무효화 |
|---|---|---|
| 메모·공부·임대차·가격·면적 | P20 또는 P10 | 딜카드 영향필드, CORE, 양 채널 |
| 정정 채택 | P30 | 기준본 이후 전체 |
| 산식·산출항목 정책 | P40 | 영향 항목·패키지·채널 |
| 중개인 의견 원문·근거 | P50 | 관련 제안단위·포함 채널 |
| 공통 외부문구 | P60 | 양 채널 해당 내용 단위 |
| 모바일 순서·문안 | M10 | 모바일만 |
| PPTX 사진·문안·레이아웃 | S10~S40 | PPTX만 |
| 렌더러·테마·폰트 | S40 | PPTX 지면검사·파일승인 |

기존 발행본은 삭제하지 않고 `STALE` 또는 `SUPERSEDED`로 남긴다.

## 9. API 원칙

- 장시간 생성명령은 `202 Accepted`와 `runId`를 즉시 반환한다.
- 생성·승인·재생성 명령은 멱등키를 요구한다.
- 조회 API는 실행·단계·보완요청·산출물·검사·승인 상태를 구분한다.
- 승인과 발행은 대상해시·버전·선행승인을 요구한다.
- 오류는 `VALIDATION`, `CONFLICT`, `DEPENDENCY`, `TIMEOUT`, `SYSTEM`, `POLICY`로 분류한다.
- 채널 API는 원시 공공자료나 다른 채널 body를 입력으로 받지 않는다.

## 10. 데이터·보안

- 원자료는 불변 버전으로 보존하고 정정은 별도 사건으로 저장한다.
- 소유권·RLS·공개범위는 문서품질과 분리한다.
- 정확주소·소유자·임차인·연락처·사진 개인정보는 산출물 종류별 공개정책을 적용한다.
- 로그에는 원문 메모와 개인정보 전체를 남기지 않고 참조 ID와 해시를 사용한다.
- 임시 렌더파일은 만료시간과 삭제정책을 가진다.
- 외부 URL은 승인된 `ReleaseRecord`에만 연결한다.

## 11. 비기능 요구

| 항목 | 목표 |
|---|---|
| 재개성 | 작업자 강제종료 후 성공 체크포인트부터 재개 |
| 멱등성 | 동일 명령·키의 중복 산출물 0 |
| 재현성 | 같은 입력·정책버전의 CORE 출력해시 동일 |
| 계보 | 핵심값·의견·사진·발행본 역추적률 100% |
| 일관성 | 같은 패키지의 모바일·PPTX 핵심값 오차 0 |
| 안전 | 차단급 허위 통과 외부발행 0 |
| 복구 | 기능깃발로 데이터 손실 없이 구형 읽기경로 복귀 |
| 관측 | `runId`, `artifactId`, `approvalId`로 전구간 조회 |

정량 시간목표는 현행 기준선을 측정한 뒤 M0에서 승인한다. 근거 없이 새 SLO를 확정하지 않는다.

## 12. 호환과 폐기

- `ReleaseTier`, `document_objects.body`, `MobileImPptxInput`은 호환 어댑터로만 유지한다.
- 기존 공개 URL과 과거 파일 재다운로드를 유지한다.
- 신규 기능은 새 CORE·채널 경계에만 추가한다.
- 구형 모바일→PPTX 직접변환은 M8에서 신규 사용 0과 두 릴리스 관측 후 제거한다.
- 호환 손실은 조용히 보완하지 않고 `mappingWarnings`로 남긴다.

## 13. 설계 완료조건

1. 스키마·지식소스·TypeScript/Zod 열거값 차이 0
2. 각 단계의 입력·출력·해시·재사용키·실패조치 정의
3. 산출물별 검사 프로필과 양성·음성·변조시험 연결
4. 승인 결속과 자동 무효화의 계약시험 통과
5. 당산동 통합 실행이 딜카드→CORE→모바일→PPTX까지 재현
6. 부분실패·재개·중복명령·동시편집·롤백 시나리오 통과
7. 제품·도메인·기술·품질·운영 책임자의 단계종료 승인

