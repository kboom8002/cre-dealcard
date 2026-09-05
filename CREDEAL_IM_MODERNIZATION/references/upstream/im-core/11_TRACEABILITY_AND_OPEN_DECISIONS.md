# 추적성·미결정사항

> 설계 ID: `IC-TRACE-001`

---

# 1. 핵심 추적표

| D55 원칙 | 요구 ID | 작업 | 시험 |
|---|---|---|---|
| 원자료를 덮어쓰지 않음 | ICR-FR-001 | P1-T03~T05 | MUT-001, snapshot 불변시험 |
| 불일치·정정·유효기준본 | ICR-FR-002~003 | P1-T04~T05 | 상도·양평 fixture |
| 산출항목 중심 | ICR-FR-004~006 | P1-T06~T09 | 6상태·NOT_RUN·bundle 시험 |
| 운영비 없으면 NOI 금지 | ICR-FR-005 | P0-T06,P1-T07,T11 | MUT-004~005 |
| 관리비와 수입 분리 | ICR-FR-005 | P0-T06,P1-T07 | MUT-002 |
| 채권최고와 잔액 분리 | ICR-FR-005 | P0-T06,P1-T11 | MUT-003 |
| L1.5 중개인 제안 | ICR-FR-007 | P1-T08,P2-T05~T07 | MUT-015~016 |
| 사진을 근거로 관리 | ICR-FR-008 | P2-T04,P3-T06 | photo fixtures, MUT-017~018 |
| 모바일/PPTX 형제채널 | ICR-FR-009 | P1-T10,P2,P3 | 독립생성·MUT-028 |
| 모바일 기본 L1/L1.5 | ICR-FR-010 | P2-T01~T09 | L1/L1.5 E2E |
| Studio 별도 편집 | ICR-FR-011 | P3-T01~T12 | package-only render, MUT-021,027 |
| 기계검사와 사람승인 분리 | ICR-FR-012 | P0-T04~T05,P1-T11,P2-T07,P3-T10 | MUT-019,024 |
| 승인 해시·무효화 | ICR-FR-013 | P1-T02,T12,P2-T07,P3-T10 | MUT-022~025 |
| 구버전 호환 | ICR-FR-014 | P1-T13,P3-T11,P4,P5 | URL·재다운로드 회귀 |
| 발행이력 완전성 | ICR-FR-015 | P1-T02,T10,P2-T07,P3-T10 | manifest 역추적 |

---

# 2. 현행 근거와 변경점

| 현행 근거 | 확인 | 본 SDD 변경 |
|---|---|---|
| `01_FULL_PIPELINE_ARCHITECTURE.md` | 모바일→DB→PPTX 연속 | 공통 package에서 형제채널 |
| `02_MOBILE_IM_SPEC.md` | writer 안에 계산·LLM·게이트 | CORE 판정과 모바일 조립 분리 |
| `03_PPTX_IM_SPEC.md` | 모바일 JSON→PPTX | Studio package 입력 |
| `08_IM_CORE_DOMAIN_SPEC.md` | ClaimRegistry·ReleaseTier·ApprovalGate | snapshot·claim use·package·approval event |
| `D37_FRONTEND_AUDIT_REPORT.md` | 배선완료 | 의미·영속·해시·재수화 추가감사 |
| `D55...WHITEPAPER.md` | L1/L1.5/L2·산출항목·사진·승인 | 실행계약과 작업으로 변환 |
| `claim.ts` | 근거 검증상태 | 외부 사용상태 별도 추가 |
| `release-tier.ts` | tier별 분석면 허용 | eligibility 요약·compat 전용 |
| `approve/route.ts` | 빈 ClaimRegistry | 저장 평가묶음 재수화 |
| `pptx-renderer.ts`·`data-binder.ts` | body/section/enrichment 재해석 | package/content plan만 입력 |

---

# 3. 미결정사항

## OQ-01 거래건 루트

- 질문: 신규 표의 caseRef를 `building_ssot_lite`, `assets`, `deals` 중 무엇으로 고정할 것인가
- 권고: v1은 다형 `case_ref_type/id`, 신규 제품은 deal 우선, legacy는 building 지원
- 결정권자: 기술책임자·데이터책임자
- 차단작업: P1-T02

## OQ-02 조직 공동편집 RLS

- 질문: owner 외 같은 중개법인 구성원의 읽기·편집·승인 범위
- 권고: 기존 조직권한 모델을 재사용하고 승인역할을 별도권한으로 둠
- 차단작업: P1-T02, P2-T07, P3-T10

## OQ-03 스냅샷 JSONB 범위

- 질문: observations/conflicts/corrections를 v1에서 별도 표로 정규화할 것인가
- 권고: v1은 불변 snapshot JSONB, 검색·증분기록 요구가 확인되면 v2 정규화
- 차단작업: P1-T02

## OQ-04 정본 생성소유자

- 질문: 활성 경로에 없는 input_spec/presets를 복구할지, 현재 TypeScript/다른 정본을 owner로 바꿀지
- 권고: P0에서 생성재현과 실제 소비자를 확인한 뒤 하나의 owner만 채택
- 차단작업: P0-T02

## OQ-05 모바일 L2

- 질문: L2 전체를 모바일 외부에 기본 노출할지
- 권고: 기본은 L1.5, 사용자가 매수검토 확장을 선택할 때만 L2 모듈
- 차단작업: P2-T02

## OQ-06 파일저장소

- 질문: PPTX 원본·미리보기·워터마크 파생본의 storage bucket과 보존기간
- 권고: 기본파일과 파생파일 경로 분리, artifact hash 각각 기록
- 차단작업: P3-T10

## OQ-07 무효 발행본 사용자경험

- 질문: 즉시 410, 최신본 이동, 오래된 자료 경고 중 정책
- 권고: 중대한 공개·오표현은 회수, 단순 최신성은 경고+최신본 링크
- 차단작업: P2-T08, P3-T10

## OQ-08 외부 경계문 법률검토

- 질문: 모바일·PPTX 공통 자료 유의사항의 확정 원문과 검토상태
- 권고: 기존 법무 카피팩 ID를 재사용하고 미검토 문구는 베타 표시
- 차단작업: P2-T08, P3-T10

---

# 4. 문서 자체에서 확인된 정합성 수정대상

1. D55 의사코드의 `L1P`와 본문 `L1.5` 명칭 통일
2. D55의 `im.gatespec.yaml`, `im.claims.yaml`, `im.opinion.yaml` 언급과 실제 14개 YAML 목록 조정
3. 생성본 `im.gating.yaml`의 owner 경로 부재 해결
4. D37 연결행렬의 ClaimRegistry DB 저장·PPTX 연결을 실제 직렬화·사용 기준으로 재감사
5. 현행 `ReleaseTier`와 D55 L0~L4의 손실매핑을 명시

---

# 5. 승인기록

| 역할 | 이름 | 결정일 | 버전 | 비고 |
|---|---|---|---|---|
| 제품책임자 | 미정 |  |  |  |
| 기술책임자 | 미정 |  |  |  |
| 도메인 책임자 | 미정 |  |  |  |
| 데이터 책임자 | 미정 |  |  |  |
| 모바일 책임자 | 미정 |  |  |  |
| PPTX 책임자 | 미정 |  |  |  |
| 품질 책임자 | 미정 |  |  |  |
| 중개실무 검수자 | 미정 |  |  |  |

