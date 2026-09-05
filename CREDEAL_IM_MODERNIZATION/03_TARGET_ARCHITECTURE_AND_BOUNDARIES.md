# 목표 아키텍처와 책임 경계

## 1. 전체 구조

```text
[중개인 메모]
   ├─ Memo Parser ─> MemoObservationSet ─> Dealcard Harness ─> Blind Dealcard
   └─ Bottom-sheet Prefill Candidate

[바텀시트·공부 API·첨부문서·사진·현장확인·정정]
   └─ Evidence Intake
       └─ Conflict / Correction / AssetScope
           └─ EffectiveSnapshot
               └─ Claims / Formula / Proposal Eligibility
                   └─ Core Harness Report
                       └─ PublicationPackage
                           ├─ Mobile L1/L1.5 Composer
                           │   └─ Mobile Harness / Approval / Release
                           └─ PPTX IM Studio
                               └─ Render Harness / Editorial Approval
                                   / Artifact Approval / Release

[Pipeline Control Plane]
PipelineRun · StageExecution · ArtifactEnvelope · Outbox · Retry · RegenerationPlan

[Assurance Control Plane]
GateProfile · Observation · GateResult · HarnessReport · ApprovalEvent · ReleaseRecord
```

## 2. 경계별 책임

| 경계 | 해야 하는 일 | 하면 안 되는 일 |
|---|---|---|
| 메모 파서 | 원문 위치·후보값·신뢰도·모호성 추출 | 사실 확정, 누락값 보완 |
| 딜카드 조립기 | 밴딩·가림·블라인드 문안 조립 | IM 수익률·재무분석 생성 |
| 근거 CORE | 원자료·계보·상충·정정·범위·기준본 | 외부 카피·레이아웃 편집 |
| 판정 CORE | 산출항목·산식·전제·허용상태 판정 | 채널 페이지 순서 결정 |
| 발행 CORE | 채널중립 내용·의견·사진·위험·실사 묶음 | 모바일 CSS·PPTX 좌표 저장 |
| 모바일 | 카드·표·사진 순서·한국어 문안·검토 UI | 숫자 재계산·원자료 재판정 |
| PPTX Studio | 페이지·카피·표·사진·렌더링 편집 | 모바일 body 의존·사실정본 생성 |
| 게이트 실행기 | 적용성·관측·판정·조치·보고서 | 사람승인을 자동 승인으로 대체 |
| 승인 서비스 | 해시 결속·선행승인·무효화·감사 | 빈 데이터·미실행 검사 우회 |
| 파이프라인 | 단계·재시도·재개·산출물·사건 관리 | 도메인 값 임의 보정 |

## 3. 정본과 투영

### 3.1 사람이 관리하는 정본

- 산출항목·산식·전제·단위
- 게이트 ID·심각도·적용성·반대조건
- 문서등급 필수묶음
- 외부 용어·공개·사진 정책
- 단계·이벤트·오류 계약

### 3.2 런타임 불변 산출물

- 접수봉투와 원자료 버전
- 유효기준본
- 산출항목 판정집합
- 공통 발행묶음
- 채널 계획·편집버전·렌더파일
- 검사보고서·승인사건·발행기록

### 3.3 호환 투영

- 기존 `document_objects.body`
- 기존 `ReleaseTier`
- 기존 공개 URL 응답
- 구형 `MobileImPptxInput`

호환 투영은 새 정본이 아니다. 신규 경로에서 읽은 결과를 구형 형식으로 보여주는 어댑터다.

## 4. 파이프라인 분기

```text
CORE P00 → P10 → P20 → P30 → P40 → P50 → P60
                                                  ├─ M10 → M20 → M30 → M40
                                                  └─ S10 → S20 → S30 → S40 → S50
```

| 채널 단계 | 의미 |
|---|---|
| M10 | 모바일 내용계획 |
| M20 | 카드·표·사진·문안 조립 |
| M30 | 모바일 검사·편집승인 |
| M40 | 외부발행·철회·버전 |
| S10 | Studio 프로젝트·문서개요 |
| S20 | 페이지·문안·사진 편집계획 |
| S30 | 미리보기·편집승인 |
| S40 | 최종 렌더·실물 관측기 |
| S50 | 파일승인·외부배포 |

모바일 실패는 PPTX 프로젝트를 손상시키지 않고, PPTX 렌더 실패는 모바일 발행을 되돌리지 않는다. 공통 사실이 바뀐 경우에만 양 채널이 함께 오래된 상태가 된다.

## 5. 게이트 아키텍처

### 5.1 공통 실행순서

```text
프로필 선택
→ appliesWhen 평가
→ 관측기 실행
→ 관측값·버전 저장
→ 통과조건·반대조건 판정
→ 결과상태·실패조치 계산
→ 필수 양성·음성·변조시험 상태 확인
→ HarnessReport 불변 저장
→ 승인 가능상태 반환
```

### 5.2 프로필

- `P-MEMO-CANDIDATE`
- `P-DEALCARD-BLIND`
- `P-CORE-PACKAGE`
- `P-MOBILE-L1`
- `P-MOBILE-L15`
- `P-PPTX-DRAFT`
- `P-PPTX-RELEASE`

프로필은 산출물 종류와 문서등급을 구분한다. 전체 91개 검사를 매번 무조건 순회하지 않는다.

## 6. 데이터 소유권

| 데이터 | 소유 모듈 | 변경방식 |
|---|---|---|
| 메모 원문·관측값 | memo-intake | 새 버전·확인사건 |
| 공부·첨부 원자료 | evidence | 새 원자료 버전 |
| 상충·정정 | evidence/correction | 승인된 정정사건 |
| 유효기준본 | evidence/snapshot | 불변 새 버전 |
| 산출항목 정의·산식 | claims | 정책버전·코드생성 |
| 산출항목 판정 | claims/evaluation | 불변 판정집합 |
| 중개인 의견 | proposals | 원문 보존·새 공개문구 버전 |
| 공통 발행묶음 | publication | 불변 새 패키지 |
| 모바일 발행본 | mobile | 채널 버전 |
| PPTX 프로젝트·파일 | pptx-studio | 프로젝트·파일 버전 |
| 검사보고서 | harness | 불변 새 보고서 |
| 승인·철회·무효화 | approval | 사건추가 방식 |

## 7. 기술적 금지선

- 채널에서 공공 API 직접 호출
- `document_objects.body`를 새 사실정본으로 갱신
- LLM 문장에서 숫자를 추출해 산출항목으로 저장
- `false`, `0`, 빈 문자열을 관측불가 기본값으로 사용
- 승인 API가 현재 객체 대신 새 빈 객체를 생성
- 환경변수로 `block`을 `warn`으로 변경
- 최종 PPTX 파일을 관측하지 않은 상태에서 파일승인
- 같은 발행본에 서로 다른 `snapshotId` 혼용

## 8. 권장 레포 경계

```text
src/domain/building/
  memo-intake/
  dealcard-publication/
  im-core/
    evidence/
    claims/
    proposals/
    publication/
    approval/
    compat/
  mobile-im/
    composer/
    presentation/
    validation/
  pptx-studio/
    project/
    composition/
    copy/
    media/
    rendering/
    validation/

src/platform/im-pipeline/
  commands/
  stages/
  artifacts/
  outbox/
  retry/
  regeneration/

src/assurance/im-harness/
  profiles/
  observers/
  evaluator/
  reports/
  mutation-tests/
```

실제 경로는 현행 소유 파일 감사 후 ADR로 확정한다. 위 구조를 이유로 기존 코드를 성급히 이동하지 않는다.
