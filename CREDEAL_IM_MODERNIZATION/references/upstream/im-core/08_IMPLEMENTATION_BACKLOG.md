# IM CORE 개편 구현 백로그

> 작업정본 ID: `IC-WBS-001`  
> 실행순서: P0 → P1 → P2 → P3 → P4 → P5  
> 병렬원칙: 같은 단계 안에서 의존성이 없는 트랙만 병렬 수행

---

# 0. 공통 작업카드 계약

모든 PR은 다음을 포함한다.

```yaml
taskId: IC-Px-Txx
scope: 작업 범위
preReads: 선독 문서·지식 소스
changedContracts: 변경 스키마·API·enum
featureFlag: 적용 기능깃발
tests:
  added: []
  executed: []
evidence:
  before: 기준선 또는 실패재현
  after: 통과결과
rollback: 되돌리기 방법
openRisks: []
```

한 PR에 서로 다른 단계의 상태모델·DB·UI를 함께 넣지 않는다.

---

# P0. 신뢰봉합·정본복구

목표: 현재 승인과 발행이 거짓 안전신호를 만들지 않게 한다.

| ID | 작업 | 주요 대상 | 의존 | 필수 시험·완료조건 |
|---|---|---|---|---|
| IC-P0-T01 | 현행 기준선·호출지도 고정 | 감사문서, handler, writer, approve, PPTX routes | 없음 | 당산/상도/양평 fixture의 모바일·PPTX·승인 결과 저장, 호출경로 맵 승인 |
| IC-P0-T02 | 정본 소유권 복구 | `credeal/ssot/build_ssot.py`, 실제 owner 코드, CI | T01 | 생성본 3종 재생성 성공, 활성 owner 경로 존재, 생성 전후 diff 설명 가능 |
| IC-P0-T03 | ClaimRegistry 직렬화·재수화 | `im-core/claim*`, writer | T01 | 왕복 후 claim 수·값·근거·status·hash 일치 |
| IC-P0-T04 | 승인 API 실데이터 재검사 | `im-lite/[id]/approve/route.ts` | T03 | 빈 registry 통과 실패, conflict/not_available/asOf 실패가 422 |
| IC-P0-T05 | 발행검사 보고서 영속화 | writer, handler, document body 호환 | T03 | `publishBlocked`, 사유, gate report hash 저장·승인 재검사 |
| IC-P0-T06 | P0 오표현 차단 | financial calculators, binders, gates | T01 | 운영비 없는 NOI/Cap, 관리비 합산, 채권최고=잔액, 공란=0 오류주입 차단 |
| IC-P0-T07 | 승인·차단 관측성 | events, logging, metrics | T04~T06 | correlationId·claim/gate/hash 로그, PII 미포함 |
| IC-P0-T08 | P0 기능깃발·롤백 | feature flags, runbook | T04~T07 | flag off 기존경로 회귀, flag on 신규 검사경로, 롤백 기록 |

## P0 상세 지시

### IC-P0-T02 정본 소유권 복구

1. 활성 `credeal/ssot/build_ssot.py`가 import하는 `credeal/input_spec.py`, `credeal/presets.py`의 부재를 재현한다.
2. 인계폴더의 파일을 무조건 복사하지 말고 활성 코드와 생성본의 차이를 비교한다.
3. 실제 소유자를 활성 경로에 복구하거나 생성기를 현재 정본소유자로 전환한다.
4. 생성본 헤더의 owner를 실제 경로와 일치시킨다.
5. CI에 `build_ssot → git diff --exit-code` 상당 검사를 추가한다.
6. 사람이 직접 관리하는 YAML과 생성 YAML 목록을 문서·코드에서 일치시킨다.

### IC-P0-T04 승인 재검사

승인 시 다음 순서를 강제한다.

```text
문서소유권
→ 저장된 검사묶음 존재
→ ClaimRegistry 재수화
→ registry hash 재계산
→ 생성시 hash와 비교
→ runApprovalGate
→ gate report hash 확인
→ 승인상태 변경
```

검사묶음이 없는 구문서는 자동 승인하지 않고 legacy 정책결정을 요구한다.

---

# P1. IM CORE v1

목표: 유효기준본·산출항목 판정·공통 발행묶음의 실행 가능한 최소 구현.

| ID | 작업 | 주요 대상 | 의존 | 필수 시험·완료조건 |
|---|---|---|---|---|
| IC-P1-T01 | 스키마·지식소스 채택 | `schemas/`, `knowledge/`, Zod | P0 | JSON Schema·Zod·enum diff 0, 제품/도메인 승인 |
| IC-P1-T02 | 5개 표·RLS·전이함수 | 신규 migration | T01 | 로컬 migration, owner 격리, 일반 UPDATE/DELETE 차단 |
| IC-P1-T03 | Legacy Evidence Adapter | ssot-lite/assets/layers/supplemental | T01 | 원문·출처·basis·asOf 보존, 공란/0 구분 |
| IC-P1-T04 | AssetScope·Conflict·Correction | `im-core/evidence/` | T03 | 다필지·면적·임대합계 불일치와 정정 회귀 |
| IC-P1-T05 | EffectiveSnapshot materializer | evidence service | T02,T04 | 결정성·불변성·hash·새 버전 생성 |
| IC-P1-T06 | ClaimDefinition·Evaluator | `im-core/claims/` | T01,T05 | 6 useStatus 전체, not_evaluated fail-closed |
| IC-P1-T07 | Formula Registry | calculator adapters | T06 | 같은 입력 동일 hash, basis/단위, 금지산식 차단 |
| IC-P1-T08 | ProposalUnit·위험·실사 | proposals/publication | T05,T06 | 의견 완성조건·승인·위험→DD/LOI 연결 |
| IC-P1-T09 | Eligibility·Bundle | capability bundle | T06,T08 | L1/L1.5/L2 정상·실패 짝 |
| IC-P1-T10 | PublicationPackage builder | publication package | T02,T09 | 패키지 밖 자료 0, 단일 snapshot, packageHash |
| IC-P1-T11 | CORE Gate Engine | approval/gates | T06,T10 | P0 16게이트, NOT_RUN/ERROR 차단 |
| IC-P1-T12 | 서비스·API·이벤트 | API routes, event contracts | T02,T05~T11 | 멱등·오류코드·권한·correlationId |
| IC-P1-T13 | Legacy adapters | ReleaseTier/document_objects | T10~T12 | 기존 URL·구문서 읽기, 손실매핑 경고 |
| IC-P1-T14 | 그림자 이중실행 | generation handler | T10~T13 | 구/신 값과 판정 차이 저장, 외부결과 미변경 |

## P1 금지

- ClaimDefinition을 여러 파일·프롬프트에 중복
- `ReleaseTier`에서 새 산출항목 허용
- 패키지 생성 후 enrichment를 다시 조회
- 미실행 claim을 빈칸으로 조용히 생략
- 스냅샷 유효값을 채널에서 변경

---

# P2. 모바일 L1/L1.5

목표: 중개인이 일상적으로 사용할 수 있는 빠른 골디락스 채널.

| ID | 작업 | 주요 대상 | 의존 | 필수 시험·완료조건 |
|---|---|---|---|---|
| IC-P2-T01 | 채널중립 ContentUnit builder | publication/content-unit | P1 | 카탈로그 ID·claim/proposal/source 연결 |
| IC-P2-T02 | MobileContentPlan | mobile composer | T01 | L1/L1.5 순서·생략사유·hash |
| IC-P2-T03 | 숫자마스크 문안조립 | copy composer/NLG mask | T02 | 자유생성 숫자 0, 한국어 카피 스냅샷 |
| IC-P2-T04 | 모바일 PhotoPlan | photo plan | P1,T02 | 0/1/3/8/11장 변종, 공개승인 차단 |
| IC-P2-T05 | 중개인 의견 반영표 UI | approval UI | P1,T01 | 원문·근거·문구·카드·승인 추적 100% |
| IC-P2-T06 | 모바일 검토·편집 | im-approval UI | T02~T05 | 구조화 편집, 숫자 직접수정 차단, lockVersion |
| IC-P2-T07 | 모바일 검사·승인 | mobile validator, ApprovalService | P1,T06 | expectedHash·선행승인·무효화 |
| IC-P2-T08 | 공개뷰어 호환 | `/im-lite/{id}` | T07 | URL 불변, 내부용어/민감자료 미노출 |
| IC-P2-T09 | 모바일 E2E·실무평가 | fixtures, Playwright | T08 | 평균 4/5, 항목 3 미만 없음, 제작시간 측정 |

## P2 사용자 완료경로

```text
거래건 → 자료확인 → 가능한 문서 확인
→ L1 또는 L1.5 선택
→ 의견·사진 반영 확인
→ 문안수정 → 기계검사
→ 최종승인 → 기존 URL로 발행
```

---

# P3. PPTX IM Studio

목표: 모바일과 독립된 전문 편집·조립 채널.

| ID | 작업 | 주요 대상 | 의존 | 필수 시험·완료조건 |
|---|---|---|---|---|
| IC-P3-T01 | Studio 프로젝트·상태전이 | DB/API/project service | P1 | 생성·편집·충돌·무효화 상태시험 |
| IC-P3-T02 | DocumentBrief UI | Studio UI | T01 | 목적·독자·소구점·등급 선택 |
| IC-P3-T03 | CompositionPlanner | composition | P1,T01 | 7/9/13/16면, 빈면 없음, 생략사유 |
| IC-P3-T04 | ContentUnitBinder | binding | P1,T03 | 모바일 markdown·enrichment 미참조 |
| IC-P3-T05 | 문안편집기 | copy editor | T04 | 숫자필드 잠금, copyHash, 근거패널 |
| IC-P3-T06 | 사진편집기 | media editor | T03 | 역할·크롭·가림·공개승인·photoHash |
| IC-P3-T07 | 미리보기 | SVG/slide preview | T03~T06 | 최종렌더와 핵심배치 일치도 측정 |
| IC-P3-T08 | PptxStudioRenderer | 기존 아키타입/imlib 재사용 | T04,T06 | A01~A18 회귀, package만으로 렌더 |
| IC-P3-T09 | PPTX 채널검사 | layout/text/photo/cross validation | T08 | G31~G36·G38·G40와 신규 CORE 연결 |
| IC-P3-T10 | PPTX 승인·내보내기 | ApprovalService/storage | T09 | 편집승인·artifact 승인 분리, hash |
| IC-P3-T11 | 구형 PPTX 호환 | legacy adapter/routes | T08,T10 | 과거 재다운로드, 신규 직접변환 차이로그 |
| IC-P3-T12 | Studio E2E·실무평가 | Playwright/fixtures | T02~T11 | 당산 L1.5 완주, 평균 4/5 이상 |

---

# P4. 병행검증·운영전환

| ID | 작업 | 내용 | 완료조건 |
|---|---|---|---|
| IC-P4-T01 | 실물·합성 fixture 확정 | 당산·상도·양평·나대지·최소자료·사진변종 | 기대결과 전문가 승인 |
| IC-P4-T02 | 구/신 이중실행 대조 | 값·등급·차단·문안·페이지·시간 | 중대 잘못된 허용 0 |
| IC-P4-T03 | 교차채널 일관성 | 같은 package 모바일/PPTX | 핵심값 불일치 0 |
| IC-P4-T04 | 중개실무 사용성 | 5명 이상 목표, 시간·수정량·평점 | 평균 4/5·개별 3 이상 |
| IC-P4-T05 | 성능·부하 | 동시 생성·렌더·승인 | SLO 또는 승인된 개정치 |
| IC-P4-T06 | 보안·RLS·공개 | 소유권·PII·사진·링크 | 고위험 취약점 0 |
| IC-P4-T07 | 롤백훈련 | flag off·읽기복귀·작업중단 | 데이터 손실 없이 목표시간 복귀 |
| IC-P4-T08 | 기본전환 승인 | 제품·기술·품질·중개실무 서명 | 신규 거래건 신경로 기본 |

---

# P5. 구형 신규생성 폐기

| ID | 작업 | 내용 | 완료조건 |
|---|---|---|---|
| IC-P5-T01 | 신규 모바일→PPTX 직접변환 차단 | 신문서에서 legacy renderer 입력 거부 | 신규 사용 0 |
| IC-P5-T02 | `getTierAllowedSections` 신규호출 차단 | lint/의존성 테스트 | 신규 호출 0 |
| IC-P5-T03 | 외부자료 직접 PPTX 바인딩 차단 | legacy read-only로 격리 | 신경로 참조 0 |
| IC-P5-T04 | deprecated 표시와 제거계획 | 구 API·타입·모듈 | 2개 릴리스 사용량 0 |
| IC-P5-T05 | 최종 문서·운영 인계 | 코드맵·runbook·사고대응 | 운영자 승인 |

---

# 단계별 승인조건

| 다음 단계 | 선행 승인 |
|---|---|
| P1 | P0 보안·승인 오류봉합, 정본 재생성 CI |
| P2 | Snapshot/Claim/Package v1과 CORE gate |
| P3 | P1 패키지 안정 + 채널중립 ContentUnit |
| P4 | 모바일·Studio 기능완료와 자동시험 |
| P5 | P4 인수기준·롤백훈련·사용량 기준 |

