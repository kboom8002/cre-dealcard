# 단계별 실행계약

## 1. 공통 계약

각 단계는 다음 규칙을 지킨다.

1. 입력은 산출물 참조와 해시로 받는다.
2. 입력 본문을 수정하지 않는다.
3. 모든 예상 항목에 명시적 상태를 부여한다.
4. 성공 전에 출력 스키마와 불변조건을 검사한다.
5. 부분 성공은 허용된 단계에서만 명시적으로 반환한다.
6. 오류는 재시도 가능 여부와 사용자 보완 여부를 분리한다.

## 2. P00 요청접수·입력동결

| 항목 | 내용 |
|---|---|
| 입력 | 거래건 ID, 입력버전, 직접입력, 사진참조, 목표채널, 공개범위 |
| 출력 | `IntakeEnvelope` |
| 검사 | 권한, UUID, 단위, 공란/0 구분, 다필지 목록, 입력 스키마 |
| 차단 | 거래건 없음, 권한 없음, 매각대상 식별 불가 |
| 재시도 | 인증·스키마 오류는 자동 재시도 안 함 |
| 보상 | 생성된 빈 실행만 취소, 사용자 입력은 보존 |

`IntakeEnvelope`는 접수시점의 입력복사본과 원 입력레코드 버전을 가진다. 이후 원 입력이 바뀌어도 실행 중인 P00 입력은 바뀌지 않는다.

## 3. P10 근거수집·정규화

하위작업 예:

- P10-A 건축물·토지 공부
- P10-B 실거래·공시·상권 자료
- P10-C 임대차 현황 정규화
- P10-D 사진·문서 메타데이터
- P10-E 중개인 입력·의견 원문

| 항목 | 내용 |
|---|---|
| 입력 | IntakeEnvelope, 공급자 정책 |
| 출력 | `EvidenceCollection`, `DataInventory` |
| 검사 | 출처, 조회시각, 기준일, 단위, 원문 위치, 공급자 응답상태 |
| 부분성공 | 허용. 실패 공급자는 결손 Observation으로 기록 |
| 차단 | 자산 식별에 필요한 주소·PNU·필지 대응 모두 실패 |
| 재시도 | 외부 API만 지수형 지연+무작위분산, 기본 3회 |
| 금지 | 실패값을 0, 없음, 해당없음으로 변환 |

임대차 입력은 행별 원문·정규화값·확인수준·기준일을 보존한다. 합계와 행합계를 모두 원자료로 등록한다.

## 4. P20 매각범위·불일치조정

| 항목 | 내용 |
|---|---|
| 입력 | EvidenceCollection, DataInventory |
| 출력 | `AssetScope`, `ConflictSet`, `CorrectionSet`, `ReconciliationSet` |
| 검사 | 필지별 포함여부, 건물 대응, 중복, 단위, 합계 차이, 출처 우선순위 |
| 차단 | 매각범위 미확정, 핵심 가격·면적·임대합계의 중대한 미해결 충돌 |
| 사용자보완 | 채택값·사유·근거를 요청하고 `blocked_user` |
| 재시도 | 결정론 단계이므로 같은 입력 자동재시도 최대 1회만 |

중요: 출처 등급만으로 값 하나를 자동선택하지 않는다. 규칙이 결정할 수 없는 충돌은 사람이 채택하거나 해당 산출항목을 차단한다.

## 5. P30 유효기준본 생성

| 항목 | 내용 |
|---|---|
| 입력 | ReconciliationSet |
| 출력 | `EffectiveSnapshot` |
| 검사 | 단일 기준일, 모든 유효값의 근거·정정 참조, 자산범위버전, 해시 |
| 차단 | 유효값이 원자료·정정과 연결되지 않음, 서로 다른 자산범위 혼합 |
| 재시도 | 코드·저장 일시오류만 1회 |

스냅샷은 불변이다. 값 하나를 수정해도 새 스냅샷을 만든다.

## 6. P40 산출항목 계산·판정

산출항목 상태:

- `allowed`
- `allowed_with_warning`
- `blocked`
- `not_applicable`
- `not_available_at_stage`
- `not_evaluated`

| 항목 | 내용 |
|---|---|
| 입력 | EffectiveSnapshot, ClaimDefinitionRegistry, FormulaRegistry |
| 출력 | `ClaimEvaluationSet` |
| 검사 | 필수입력, 공식버전, 단위, 기준일, 근거상태, 경고·차단사유 |
| 부분성공 | 허용. 각 항목은 반드시 6상태 중 하나 |
| 차단 | 등록되지 않은 공식, 단위 불일치, 계산결과 비유한수 |
| 금지 | LLM 수치를 공식결과로 채택, 관리비를 임대료로 자동합산 |

산출항목 의존그래프에 순환이 있으면 배포를 차단한다. 계산은 순수함수로 실행하고 입력값과 중간값을 보관한다.

## 7. P50 CORE 검사·가능등급

| 항목 | 내용 |
|---|---|
| 입력 | EffectiveSnapshot, ClaimEvaluationSet, ProposalUnits, 공개정책 |
| 출력 | `CoreGateReport`, `LevelEligibility` |
| 검사 | H0 불변조건, 필수 산출항목 묶음, 의견 근거·승인상태, 가림정책 |
| 차단 | 핵심 미해결 불일치, 차단값 사용, 미실행 필수규칙, 공개불가 개인정보 |
| 결과 | 가능한 최고등급과 등급별 결손목록을 별도 반환 |

검사 실행 실패는 `passed`가 아니다. 규칙마다 `observed`, `opposite`, `decision`, `policyVersion`을 기록한다.

## 8. P60 공통 발행묶음

| 항목 | 내용 |
|---|---|
| 입력 | Snapshot, EvaluationSet, GateReport, Eligibility, 승인된 제안·사진 |
| 출력 | `PublicationPackage` |
| 검사 | 허용·조건부·차단 목록 완전성, 내용단위 계보, 사진공개, 출처표시 |
| 차단 | 어떤 내용단위가 차단 산출항목을 참조, 상위 해시 불일치 |
| 재사용 | 동일 입력해시·정책버전이면 기존 패키지 사용 |

P60은 문장 후보를 포함할 수 있지만 채널 최종문안이나 좌표를 포함하지 않는다.

## 9. 모바일 단계

| 단계 | 입력 | 출력 | 핵심검사 |
|---|---|---|---|
| M00 | Package, targetLevel | MobileBuildRequest | 등급가능범위·공개범위 |
| M10 | Request, ContentUnits | MobileContentPlan | 필수 카드·보완과제·의견선택 |
| M20 | Plan, copy policy, media | MobileDraftVersion | 수치토큰·근거·사진연결 |
| M30 | Draft | MobileChannelGateReport | 금지어·누락·가독성·사실대조 |
| M40 | Gate, hashes | ApprovalEvent | 사람·범위·해시 |
| M50 | approved version | DistributionRecord | 공개 URL·철회상태 |

## 10. PPTX Studio 단계

| 단계 | 입력 | 출력 | 핵심검사 |
|---|---|---|---|
| S00 | Package, brief | StudioProject v1 | 독자·목적·가능등급 |
| S10 | Project, content units | CompositionPlan | 페이지예산·필수내용·빈면 금지 |
| S20 | Plan, copy edits | CopyPlan | 구조화 수치잠금·각주·출처 |
| S30 | Copy, photos, theme | LayoutPlan | 사진역할·크롭·가림·해상도 |
| S40 | fixed project version | PreviewArtifact | 입력버전 고정 |
| S50 | preview, package | PptxChannelGateReport | 값·넘침·겹침·잘림·파일검사 |
| S60 | gate, hashes | ApprovalEvent | 프로젝트·미리보기·레이아웃 해시 |
| S70 | approved project | RenderedArtifact, DistributionRecord | 최종파일 해시=승인대상 파생 |

## 11. 단계별 시간예산

시간예산은 실패정책과 분리한다.

| 단계 | 권장 경고 | 권장 중단 | 비고 |
|---|---:|---:|---|
| P10 공급자 하위작업 | 8초 | 20초 | 공급자별 독립 |
| P20/P30 | 2초 | 10초 | 결정론 |
| P40 | 5초 | 20초 | 항목별 병렬 가능 |
| P50/P60 | 3초 | 15초 | 규칙·조립 |
| M20 AI 문안 | 20초 | 60초 | 실패 시 숫자 없는 결정론 초안 또는 사용자보완 |
| S10/S20 AI 제안 | 30초 | 90초 | 프로젝트 보존 |
| S40/S70 렌더 | 60초 | 180초 | 파일복잡도별 프로필 |

전체 실행 120초를 넘으면 폐기하는 대신 단계별 마감과 영속 체크포인트를 사용한다.

