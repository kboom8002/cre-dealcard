# CREDEAL IM CORE 개편 SDD 문서 세트

> 버전: 1.0.0  
> 기준일: 2026-08-31  
> 상태: 구현 착수 전 승인후보  
> 대상: 제품책임자, 도메인·백엔드·AI·모바일·PPTX·품질검사 개발자, 중개실무 검수자

## 1. 목적

이 문서 세트는 D55 방법론을 CREDEAL 운영 코드에 적용하기 위한 구현 지시서다. 목표는 현재의 `모바일 IM 생성 → 모바일 JSON을 PPTX로 변환` 구조를 다음 구조로 바꾸는 것이다.

```text
근거와 원자료
→ 유효기준본
→ 산출항목 판정
→ 공통 발행묶음
→ 모바일 IM / PPTX IM Studio 독립 발행
```

모바일은 L1 사실확인형과 L1.5 중개인 제안형의 기본 채널로 사용한다. PPTX IM Studio는 같은 공통 발행묶음을 사용하는 별도 편집·조립·렌더링 하위시스템으로 만든다.

## 2. 문서 읽기 순서

### 제품책임자·기술책임자

1. `00_WORK_ORDER.md`
2. `01_SOFTWARE_DESIGN_DOCUMENT.md`
3. `11_TRACEABILITY_AND_OPEN_DECISIONS.md`
4. `adr/` 3종

### 구현팀

1. `00_WORK_ORDER.md`
2. 담당 영역의 상세 사양
3. `08_IMPLEMENTATION_BACKLOG.md`
4. `09_TEST_ACCEPTANCE_AND_FIXTURES.md`
5. `knowledge/README.md`

### AI 코딩 에이전트

1. 저장소 `AGENTS.md`
2. `00_WORK_ORDER.md`의 착수 규약과 금지사항
3. 배정된 작업의 선행 문서
4. `knowledge/*.yaml`과 `schemas/*.schema.json`
5. 작업 ID의 완료조건과 시험

## 3. 구성

| 파일 | 역할 |
|---|---|
| `00_WORK_ORDER.md` | 전체 작업지시, 착수순서, 책임, 금지사항, 완료정의 |
| `01_SOFTWARE_DESIGN_DOCUMENT.md` | 목표 구조와 시스템 설계의 정본 후보 |
| `02_DOMAIN_AND_STATE_MODEL.md` | 원자료·산출항목·발행본·승인 상태모델 |
| `03_DATA_STORAGE_AND_MIGRATION.md` | 데이터베이스, 불변 버전, 호환 이관 |
| `04_SERVICE_API_EVENT_CONTRACTS.md` | 서비스·API·이벤트·오류 계약 |
| `05_MOBILE_IM_COMPOSER_SPEC.md` | 모바일 L1/L1.5 조립기 |
| `06_PPTX_IM_STUDIO_SPEC.md` | PPTX IM Studio 편집·조립·렌더링 |
| `07_GATE_APPROVAL_VERSIONING_SPEC.md` | 발행검사·사람승인·무효화·해시 |
| `08_IMPLEMENTATION_BACKLOG.md` | 단계·트랙·작업 ID·의존성·산출물·시험 |
| `09_TEST_ACCEPTANCE_AND_FIXTURES.md` | 시험피라미드, 실물표본, 오류주입, 인수기준 |
| `10_ROLLOUT_OPERATIONS_ROLLBACK.md` | 기능깃발, 병행검증, 관측성, 되돌리기 |
| `11_TRACEABILITY_AND_OPEN_DECISIONS.md` | D55→요구→작업→시험 추적과 미결정 |
| `12_REPOSITORY_PLACEMENT_AND_PR_GUIDE.md` | 저장소 편입위치·PR 순서·정본 승격방법 |
| `adr/` | 되돌리기 어려운 구조결정 3건 |
| `knowledge/` | 사람이 검토하고 코드로 승격할 기계 판독 지식 원천 |
| `schemas/` | 핵심 자료계약 JSON Schema |
| `examples/` | 당산동형 L1.5 공통 발행묶음 예시 |

## 4. 효력과 우선순위

1. 법령·개인정보·보안 정책
2. 저장소 `AGENTS.md`
3. 승인된 런타임 정본과 데이터베이스 제약
4. 본 SDD 문서 세트
5. 기존 D37 계열 감사·사양

이 세트의 `knowledge/`는 **운영 정본이 아니다**. 작업 `IC-P1-T01`에서 현행 소유권을 확정하고, 승인된 항목만 기존 정본의 실제 소유 파일에 병합한다. `credeal/ssot/im.gating.yaml`, `im.tokens.yaml`, `im.budget.yaml`은 생성본이므로 직접 수정하지 않는다.

## 5. 현재 확인된 선행 차단사항

- 승인 API가 저장된 주장목록을 재수화하지 않고 빈 `ClaimRegistry`로 검사한다.
- writer의 `publishBlocked` 결과와 완전한 발행검사 보고서가 발행본에 불변 결박되지 않는다.
- PPTX가 모바일 `body/sections/enrichment`를 다시 해석한다.
- `ReleaseTier` 하나가 재무·시나리오·가치개선 면을 넓게 개방한다.
- `im.gating.yaml`의 생성소유자로 적힌 활성 경로의 `credeal/input_spec.py`, `credeal/presets.py`가 없고 인계 폴더에만 있다.
- D55가 언급하는 `im.gatespec.yaml`, `im.claims.yaml`, `im.opinion.yaml`은 현재 활성 정본 목록에 없다.

위 항목은 새 Studio 화면보다 먼저 처리한다.

## 6. 변경 원칙

- 빅뱅 재작성 금지
- 기존 공개 URL 유지
- 기존 `document_objects`는 호환 읽기·재다운로드에 유지
- 신규 기능은 기능깃발 아래 배포
- 데이터베이스 변경은 추가형 우선, 기존 컬럼 삭제 금지
- 원자료는 덮어쓰지 않고 정정사건으로 보완
- 기계검사 통과와 사람승인 분리
- LLM이 숫자·산식·사용허가를 결정하지 않음
- 모바일과 PPTX는 같은 발행묶음을 쓰지만 각각 최종승인

## 7. 패키지 채택 절차

1. 제품책임자와 기술책임자가 `11_TRACEABILITY_AND_OPEN_DECISIONS.md`의 OQ-01~OQ-08을 결정한다.
2. 도메인 책임자가 `knowledge/claim-catalog-mvp.yaml`과 `document-level-bundles.yaml`을 승인한다.
3. 데이터 책임자가 `03_DATA_STORAGE_AND_MIGRATION.md`의 5개 표와 RLS를 승인한다.
4. 모바일·PPTX 책임자가 채널별 사양과 승인 무효화 규칙을 승인한다.
5. 승인결과를 반영해 버전을 1.1.0으로 올린 뒤 `IC-P0-T01`부터 착수한다.
