# CREDEAL 게이트 시스템 고도화 SDD 문서 세트

> 버전: v1.0  
> 기준일: 2026-08-31  
> 대상: 제품책임자, IM CORE, 딜카드, 모바일 IM, PPTX Studio, QA, 데이터, 운영 개발팀

## 목적

이 문서 세트는 기존 약 91개 게이트를 폐기하거나 단순 증설하지 않고, D55와 D58의 제작 구조 및 문서 하네스 공학 원칙에 맞게 재배치하는 실행 사양이다.

목표 상태는 다음과 같다.

1. 메모 파싱으로 만드는 블라인드 딜카드와 공부 중심 IM을 서로 다른 산출물로 관리한다.
2. 딜카드, 모바일 IM, PPTX IM마다 독립된 검사 프로필을 실행한다.
3. 모바일과 PPTX는 같은 유효기준본과 공통 발행묶음에서 갈라지는 형제 채널로 만든다.
4. 미실행·판정불가·시스템오류가 정상 통과로 흡수되지 않게 한다.
5. 모든 차단급 검사는 실제 원자료 또는 최종 파일 변조시험으로 검출력을 증명한다.
6. 기계검사, 사람승인, 공개정책, 열람권한을 분리한다.

## 문서 지도

| 문서 | 용도 |
|---|---|
| `00_DECISION_BASELINE.md` | 변경할 수 없는 핵심 의사결정 |
| `01_TARGET_ARCHITECTURE.md` | 전체 목표 구조와 책임 경계 |
| `02_ARTIFACT_HARNESS_PROFILES.md` | 산출물별 검사 묶음 |
| `03_DEALCARD_HARNESS_SPEC.md` | 메모 파싱 및 블라인드 딜카드 사양 |
| `04_EVIDENCE_CLAIM_GATE_MODEL.md` | 근거·주장·판정·검사 데이터 모델 |
| `05_MOBILE_L1_L15_HARNESS_SPEC.md` | 모바일 L1/L1.5 발행 사양 |
| `06_PPTX_STUDIO_HARNESS_SPEC.md` | PPTX Studio 편집 및 실물검사 사양 |
| `07_APPROVAL_VERSION_INVALIDATION.md` | 승인 사건과 자동 무효화 |
| `08_TEST_MUTATION_SELF_AUDIT.md` | 양성·음성·변조시험·자기감사 |
| `09_MIGRATION_WORK_ORDER.md` | P0~P4 작업지시서 |
| `10_ACCEPTANCE_CRITERIA_AND_RUNBOOK.md` | 완료조건과 운영 대응 |
| `knowledge/` | YAML/JSON 정본 예시 |
| `templates/` | 새 검사·승인 사건 작성 틀 |
| `adr/` | 핵심 아키텍처 결정 기록 |
| `traceability/` | 현행 검사에서 목표 검사로의 이전표 |

## 구현 시작 순서

1. `00_DECISION_BASELINE.md`를 제품책임자가 승인한다.
2. `knowledge/GATE_RESULT_SCHEMA.json`과 `knowledge/GATE_TAXONOMY.yaml`을 코드 생성 정본으로 채택한다.
3. `09_MIGRATION_WORK_ORDER.md`의 P0 작업부터 수행한다.
4. P0 완료 전에는 기존 게이트 결과를 폐기하지 않고 새 하네스를 그림자 실행한다.
5. P0 완료 후 딜카드, 모바일, PPTX 순서로 외부발행 차단을 전환한다.

## 외부 사용자 용어

`게이트`, `하네스`, `클레임`, `스냅샷`, `L1.5`는 내부 개발 용어다. 중개인 화면과 외부 IM에는 다음과 같이 표시한다.

| 내부 용어 | 중개인 화면 |
|---|---|
| Gate | 발행 전 확인 |
| Claim | 산출항목 |
| EffectiveSnapshot | 유효기준본 |
| Evidence | 근거자료 |
| NOT_RUN | 확인 미실행 |
| INDETERMINATE | 판정 불가 |
| L1.5 | 중개인 제안형 매각안내서 |

