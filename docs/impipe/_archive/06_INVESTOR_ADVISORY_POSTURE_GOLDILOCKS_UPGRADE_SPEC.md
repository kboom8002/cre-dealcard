# 06 투자자문형 포스처 평가 및 Goldilocks 개선 요구서

> **문서 상태** 제안 사양 · 개발 착수 전 승인 필요  
> **버전** v1.0 (2026-08-27)  
> **대상** CREDEAL Mobile IM · PPTX IM · 포스처별 섹션 카탈로그  
> **선행 문서** 01_FULL_PIPELINE_ARCHITECTURE · 02_MOBILE_IM_SPEC · 03_PPTX_IM_SPEC · 04_MODEL_GOLDEN_IM_REQUIREMENTS · 05_POSTURE_SECTION_BLUEPRINT  
> **관련 정본** CATALOG 계열 · im.pages.yaml · im.bindings.yaml · im.ontology.yaml · im.gating.yaml · im.invariants.yaml  
> **주요 독자** 제품 책임자 · CRE 분석가 · 중개인 · AI/백엔드 개발자 · PPTX 렌더 개발자 · QA  
> **목적** 현재의 자동 중개 IM을 매수자 의사결정을 지원하는 증거기반 투자자문형 IM으로 고도화

---

## 0. 결론과 개발 판단

현재 시스템은 다음 영역에서 강합니다.

- 5개 투자 포스처 분류
- 섹션 카탈로그와 아키타입 기반 PPTX 편성
- 공부·렌트롤·사진 등 데이터 가용성 기반 동적 구성
- 렌트롤 결정론적 렌더링
- 수익률 basis, 공실 모순, PII, 이미지 품질 등 발행 게이트
- 모바일 IM과 PPTX IM의 공통 데이터 바인딩

그러나 현재 시스템의 주된 질문은 다음에 가깝습니다.

> 보유한 데이터를 어떤 순서와 레이아웃으로 배치하여 완성도 높은 IM을 만들 것인가?

투자자문형 Goldilocks가 답해야 할 질문은 다릅니다.

> 매수자는 이 물건을 얼마에, 어떤 조건으로, 어떤 실행전략을 전제로 검토해야 하며, 그 판단은 어떤 증거·계산·전문가 확인으로 방어되는가?

따라서 기존 포스처·아키타입·렌더러는 유지하되, 그 아래에 **증거·계산 계층**, 그 위에 **의사결정·승인 계층**을 추가해야 한다.

### 0.1 현재 수준 판정

| 영역 | 현재 수준 | 목표 |
|---|:---:|:---:|
| 포스처·섹션 편성 | A- | A |
| 렌더링·시각 품질 제어 | A- | A |
| 국내 중개형 OM/IM | B+ | A |
| 주장 단위 출처 추적 | B- | A |
| 재무·가치분석 | C+ | A- |
| 밸류애드 실행분석 | C | A- |
| 가격·조건 의사결정 | C+ | A |
| 전문가 협업·승인 | C- | A- |
| 종합 | B- | A- |

### 0.2 릴리즈 권고

| 포스처 | 현재 권고 | Goldilocks 목표 |
|---|---|---|
| income | 제한적 상용 · 예비투심형 | G22 우선 상용화 |
| owner_occupied | 베타 | G18~G20 실증 후 상용화 |
| development | 베타 · 사업수지 결론 제한 | G22~G26 전문가 조건부 |
| operating | 베타 · 업종별 실증 필요 | G20~G24 업종 모듈별 상용화 |
| trading | 내부용 유지 | 권리이력·출구 데이터 구현 후 재심사 |

### 0.3 현행 기준선에서 확인된 P0

본 요구서는 문서 목차만 검토한 결과가 아니다. 05 블루프린트가 지목한 YAML과 실제 실행 코드를 함께 대조했다.

| P0 | 확인된 상태 | 관련 파일 | 요구 |
|---|---|---|---|
| SSOT 충돌 | 블루프린트는 16면 강제 절삭, im.pages는 18면·빌드 중단, 시퀀서는 12면 절삭·16면 슬라이스 | 05_POSTURE_SECTION_BLUEPRINT · im.pages.yaml · deck-sequencer.ts | 단일 소유자로 통합 |
| 포스처 순서 미완성 | im.pages 범위는 income R1/R2이고, ontology도 income 외 페이지 순서 미정의를 기록 | im.pages.yaml · im.ontology.yaml | 5개 포스처 편성 정본화 |
| 잘못된 기준값 흐름 | 최초 LLM 섹션에서 추출한 숫자가 후속 Numerical Anchor가 될 수 있음 | cross-validator.ts | 정본 Fact만 Anchor 허용 |
| 제한적 환각 탐지 | 가격·면적의 극단치 위주로 탐지하여 임대료·공실·만기·Cap Rate 오류를 포괄하지 못함 | im-context-builder.ts | Claim 단위 검증 |
| 평가 soft-fail | Judge 실패가 발행을 중단하지 않고, inferred·confirmed 섹션은 샘플 평가 | im-judge.ts | 핵심 Claim은 100% 검사 |
| 출처범위 협소 | 구현상 8개 데이터 포인트 중심이며 중개인 입력이 confirmed가 될 수 있음 | data-provenance.ts | 주장 단위 provenance |
| 개발모델 과단순 | FAR 배수, 고정 공사비·기타비율·매각단가 fallback으로 사업수지 생성 가능 | financials.ts | 전문가 승인된 개발모델 |
| 결손정책 불일치 | 문서는 본문 제거를 규정하지만 바인더는 결손을 수집한 뒤 원문을 계속 파싱 | 05 블루프린트 · data-binder.ts | 국소 경고 정책으로 통합 |

관련 기준선:

- 05_POSTURE_SECTION_BLUEPRINT.md
- credeal/ssot/im.pages.yaml
- credeal/ssot/im.ontology.yaml
- src/domain/building/mobile-im/cross-validator.ts
- src/domain/building/mobile-im/data-provenance.ts
- src/domain/building/mobile-im/financials.ts
- src/domain/building/mobile-im/pptx/deck-sequencer.ts

---

## 1. 이 문서가 정의하는 Goldilocks

### 1.1 Goldilocks는 페이지 수가 아니다

Goldilocks는 12면, 16면 또는 22면이라는 숫자가 아니다. 다음 세 조건을 동시에 충족하는 제품 수준이다.

1. 매수자가 10분 안에 진행·보류·추가검토를 판단할 수 있다.
2. 핵심 숫자와 결론을 원자료와 계산식까지 역추적할 수 있다.
3. 완전한 법률·기술·세무 DD 전에도 가격범위, 선행조건, 철회조건을 설계할 수 있다.

페이지 수는 결과다. 자산과 전략의 복잡도가 높으면 본문 또는 부록이 늘어날 수 있다.

### 1.2 산출물 등급

| 등급 | 명칭 | 입력 수준 | 허용 용도 | 핵심 산출물 |
|---|---|---|---|---|
| S1 | Fact OM | 공부·사진·매도가 | 매물 소개 | 8~12면 OM |
| S2 | Pre-IC IM | S1 + 중개인 렌트롤·비교사례 | 관심도·현장답사 결정 | 12~16면 |
| G | Goldilocks | 계약·수납·운영비·현장·시장근거 | LOI·가격협상·예비투심 | 16~26면 + 모델 |
| F | Full Advisory | G + 법률·건축·세무·공사비·금융 검토 | 최종투심·DD·계약조건 | 본문 + 부록 + 전문가 의견 |

### 1.3 권장 명명

- G18: 18면 전후의 비교적 단순한 사옥형·단기검토형
- G22: 20~24면 전후의 수익형 표준
- G26: 개발형·운영형 등 복합 분석
- F35: 전문가 검토와 부록을 포함한 완전형

숫자는 템플릿 강제가 아니라 통상적인 본문 규모를 나타낸다.

---

## 2. 현재 구조에서 유지할 것과 변경할 것

### 2.1 유지

- investmentPosture 5종
- SECTION_CATALOG의 포스처별 분기
- A01~A17 레이아웃 아키타입
- 결정론적 렌트롤 테이블
- 사진 DPI·비율·PII 게이트
- 수익률 basis 불변조건
- 데이터 가용성에 따른 섹션 개방
- 체크리스트와 리스크 필수 노출
- PPTX 산출물 파싱과 골든 회귀검사 방향

### 2.2 변경

| 현재 | 변경 목표 |
|---|---|
| section_type이 콘텐츠의 시작점 | decision_question이 시작점 |
| 섹션 단위 신뢰도 | 주장·숫자 단위 증거와 검증 상태 |
| LLM이 섹션별 서술 생성 | 정본 데이터와 계산결과를 LLM이 설명 |
| 최초 LLM 서술값을 수치 앵커로 사용 가능 | 원자료·계산엔진만 수치 앵커 생성 |
| A/B/C 등급에 따라 DCF·세금 자동 추가 | 포스처와 의사결정 모델에 따라 계산 모듈 선택 |
| 하나의 incomeArchetype 선택 | 전략 태그를 복수 조합 |
| 결손을 마지막 체크리스트로 이동 | 주장 옆 경고 + 통합 결손 레지스터 |
| 12면 권장 후 자동 절삭 | 핵심도 기반 편성 + 부록 이동 + 초과 시 빌드 차단 |
| LLM-as-Judge 중심 | 결정론적 검사 + 독립 평가 + 인간 승인 |
| 투자 논거를 LLM이 생성 | 검증된 증거·계산·전략에서 논거 조립 |

---

## 3. 목표 데이터 모델

### 3.1 문서보다 먼저 생성할 객체

에이전트는 PPTX 문장을 바로 만들지 않는다. 먼저 다음 객체를 생성한다.

| 객체 | 의미 | 생성 주체 |
|---|---|---|
| DealIdentity | 주소·필지·건물·거래기준일 | 결정론적 |
| Evidence | 공부·계약·입금·견적·사진·API 원본 | 수집기 |
| Fact | 증거에서 추출한 사실 | 추출기 + 검증 |
| Assumption | 시장·비용·일정·금융 가정 | 분석가 승인 |
| Calculation | 공식·입력·결과·버전 | 계산엔진 |
| Claim | IM에 표시할 주장 | 규칙 + LLM |
| Risk | 발생가능성·영향·대응·확인방법 | 에이전트 + 전문가 |
| Decision | 가격·조건·진행입장·철회조건 | 분석가 승인 |
| Approval | 누가 무엇을 언제 승인했는가 | 워크플로 |

### 3.2 Claim 계약

모든 외부 노출 문장은 다음 유형 중 하나여야 한다.

- FACT: 원자료로 직접 확인
- DERIVED: 확인된 입력을 계산하여 산출
- ASSUMPTION: 분석 목적의 가정
- OPINION: 중개인·분석가·전문가 의견
- RECOMMENDATION: 가격·조건·전략 제안

권장 스키마:

    Claim:
      claim_id
      claim_type
      subject
      predicate
      value
      unit
      as_of
      evidence_ids
      calculation_id
      assumption_ids
      verification_status
      approved_by
      display_disclosure

### 3.3 출처등급과 확인상태 분리

기존 S1~S5 체계를 유지하되 출처등급과 확인상태를 혼합하지 않는다.

| 등급 | 의미 | 예 |
|---|---|---|
| S1 | 원본·전문가 확인 | 발급 등기, 계약 원본, 입금내역, 전문가 검토 |
| S2a | 공공 API 원시 | RTMS·건축물대장 API 원응답 |
| S2b | 공공 API + 식별·보강 | 마스킹 실거래를 중개인이 특정 |
| S3 | 매도인·중개인 진술 | 인터뷰, 수기 입력 |
| S4 | 파생 계산 | NOI, Cap Rate, IRR, 조정단가 |
| S5 | AI 추정·가설 | 업종 가설, 잠재 전략 |

별도로 다음 상태를 둔다.

- unverified
- reconciled
- human_confirmed
- expert_confirmed
- conflicted
- stale

중개인이 입력한 값은 S3이며, 입력했다는 이유만으로 confirmed가 되지 않는다.

### 3.4 시간 필드

다음 시각을 구분한다.

- source_published_at
- source_retrieved_at
- fact_effective_as_of
- entered_at
- verified_at

IM 표지와 요약에는 공통 기준일을 표시하고, 기준일이 다른 임대·거래·공부 자료는 각 표에 개별 표시한다.

---

## 4. 목표 에이전트 파이프라인

    0. Intake
       문서·사진·엑셀 접수, PII 분리, 딜 ID 발급

    1. Identity Resolution
       지번·도로명·필지·건물 식별, 동일 물건 여부 확인

    2. Evidence Ingestion
       공부·계약·입금·비용·비교사례·현장자료 저장

    3. Fact Normalization
       단위·기준일·면적 basis·금액 basis 정규화

    4. Conflict Resolution
       공부·중개인·계약·현황 간 충돌 목록화

    5. Deterministic Underwriting
       포스처별 공식으로 재무·가치·민감도 계산

    6. Strategy Synthesis
       밸류애드·사용·개발·운영·출구 전략 후보 생성

    7. Decision Assembly
       가격범위·선행조건·철회조건·실사계획 조립

    8. Narrative Generation
       승인된 Claim만 사용하여 설명문 생성

    9. Red Team
       낙관 가정·증거부족·모순·실행불가능성 공격

    10. Human Gates
        중개인·분석가·전문가·책임자 승인

    11. Render
        PPTX·PDF·1-page·모델·출처로그 생성

    12. Artifact QA
        PPTX 파싱, 숫자·출처·레이아웃·PII 종단검사

### 4.1 LLM 허용 업무

- 문서 분류와 항목 추출
- 충돌 후보와 누락자료 탐지
- 비교사례 설명 초안
- 실행전략 후보 생성
- 위험·대응·DD 질문 초안
- 승인된 숫자의 자연어 설명
- 페이지 요약과 Q&A 작성

### 4.2 LLM 금지 업무

- 원자료에 없는 숫자 생성
- 최초 서술값을 사실 기준값으로 채택
- 법적 적법성·권리·세금 확정
- 계약 특약을 일반조항으로 추론
- 계산식을 자연어 산술로 수행
- 근거 없는 시장임대료·공사비·Exit Cap 생성
- 결손을 일반적인 긍정 문구로 대체
- S3 또는 S5를 S1로 승격

---

## 5. 섹션 카탈로그 V2 계약

현재 section_type, dataKey, archetype 매핑에 다음 필드를 추가한다.

    SectionContract:
      section_id
      posture_applicability
      decision_questions
      decisions_supported
      required_claims
      required_evidence
      minimum_source_tier
      required_calculations
      allowed_assumptions
      local_disclosures
      blockers
      human_owner
      approval_gate
      release_tiers
      page_variants
      appendix_policy
      fallback_policy
      qa_rules

### 5.1 fallback_policy

| 값 | 의미 |
|---|---|
| omit | 의사결정에 중요하지 않고 데이터가 없으면 생략 |
| qualify | 부분 데이터와 국소 경고를 함께 표시 |
| appendix | 본문에서 요약하고 세부는 부록 |
| block | 해당 릴리즈 등급 발행 금지 |

투자결정 핵심 섹션에는 generic template fallback을 사용하지 않는다.

### 5.2 페이지 보호 규칙

페이지 키가 아니라 decision_criticality로 보호한다.

| 단계 | 내용 | 처리 |
|---|---|---|
| D1 | 가격·수익·권리·핵심위험·조건 | 절대 삭제 금지 |
| D2 | 시장·전략·민감도 | 본문 우선 |
| D3 | 사진·세부표 | 필요 시 부록 이동 |
| D4 | 회사소개·일반절차 | 통합 또는 부록 |

---

## 6. 공통 Goldilocks 본문

모든 포스처는 아래 공통 코어를 갖는다. 토지와 건물은 복잡도가 낮으면 한 면으로 통합할 수 있다.

| 순서 | 섹션 | 답해야 할 질문 | 최소 요건 |
|:---:|---|---|---|
| 1 | Cover | 어떤 자산·거래인가 | 대상 사진, 주소, 가격, 기준일 |
| 2 | Decision Snapshot | 진행·보류 판단은 무엇인가 | 가격범위, 핵심논리, 조건, 위험 |
| 3 | Evidence Health | 무엇이 확인됐고 무엇이 미확인인가 | 출처등급, 충돌, 최신성 |
| 4 | Asset & Rights | 무엇을 취득하는가 | 필지·건물·권리·현황 차이 |
| 5 | Location & Demand | 수요와 유동성의 근거는 무엇인가 | 접근성·배후·상권·거래시장 |
| 6 | Posture Core | 이 포스처의 핵심 경제성은 무엇인가 | 포스처별 계산 |
| N-4 | Price & Value | 매도가와 분석가치가 어떻게 연결되는가 | 비교·수익·잔여가치 브리지 |
| N-3 | Downside & Risk | 무엇이 틀리면 손실이 발생하는가 | 스트레스·대응·확인 |
| N-2 | DD & LOI Conditions | 계약 전 무엇을 조건화할 것인가 | 자료·실사·특약 |
| N-1 | Execution Plan | 인수 후 무엇을 언제 할 것인가 | 30·60·100일 계획 |
| N | Disclosure & Contact | 분석범위와 책임은 무엇인가 | 면책·기준일·연락처 |

### 6.1 투자 논거 배치

investment_thesis는 공통 마감 전용 페이지에서 제거한다.

- 요약 논거는 2면 Decision Snapshot에 배치
- 세부 논거는 각 분석섹션에서 증거와 함께 표시
- 마지막에는 논거 반복 대신 가격·조건·행동을 제시

### 6.2 위험 표시

위험은 두 번 표시한다.

1. 해당 주장·숫자 옆의 국소 경고
2. 통합 Risk Register

통합표 최소 열:

| risk_id | 위험 | 발생가능성 | 영향 | 현재 증거 | 대응 | 확인주체 | 계약조건 |
|---|---|---:|---:|---|---|---|---|

---

## 7. 수익형 Income

### 7.1 현재 평가

| 항목 | 평가 |
|---|---|
| 현재 성숙도 | B/B+ |
| 장점 | 렌트롤, 수익률 basis, NOI 금지조건, 비교사례, 아키타입 분기 |
| 핵심 결손 | 실제 수납, 계약 롤오버, 정상화 NOI, 시장임대료, 실행비용, 가격상한 |
| 권장 릴리즈 | S2 상용 가능 · G22는 아래 요건 충족 후 |

### 7.2 매수자 핵심 질문

1. 현재 계약상 임대수입과 실제 수납액은 얼마인가?
2. 지속 가능한 정상화 NOI는 얼마인가?
3. 어느 임차인·층에서 임대료 조정 또는 공실 위험이 발생하는가?
4. 임대료 정상화·공실 해소·리뉴얼에 얼마와 몇 개월이 필요한가?
5. 밸류애드가 실패해도 현재 가격을 방어할 수 있는가?
6. 대출을 적용했을 때 DSCR과 현금수익률은 어떻게 변하는가?
7. 얼마까지 매입해야 목표수익률과 하방방어가 성립하는가?

### 7.3 필수 입력

#### G22 차단 입력

- 전체 임대차계약서 또는 계약조건 확인표
- 호실·층별 임대면적
- 보증금·월임대료·관리비·VAT
- 계약 시작·종료·인상·갱신·해지조건
- 최근 12개월 실제 입금내역
- 최근 12개월 운영비
- 공실·연체·분쟁 현황
- 매매가와 예상 거래비용
- 임대 비교사례
- 매매 비교사례

#### 권장 입력

- 임차인 신용·사업상태
- 임차인별 매출 또는 영업현황
- 시설 상태와 예상 CAPEX
- 대출 Indicative Term
- 공사·임대인 인센티브 견적

### 7.4 렌트롤 V2 필드

현재 렌트롤 필드에 다음을 추가한다.

| 그룹 | 필드 |
|---|---|
| 식별 | floor, unit, use, tenant_alias |
| 면적 | exclusive_sqm, common_sqm, chargeable_sqm, area_basis |
| 금액 | deposit, contract_rent, collected_rent, management_fee, vat |
| 계약 | start_date, expiry_date, break_option, renewal_option, escalation |
| 인센티브 | rent_free, tenant_improvement, landlord_work |
| 회수 | arrears, collection_rate, deposit_offset |
| 위험 | tenant_credit, dispute, restoration_obligation |
| 증거 | contract_source_id, collection_source_id, as_of, verification |

### 7.5 필수 계산

    GPI = 계약상 총 잠재임대수입
    Less Vacancy = 공실 및 공실손실
    Less Credit Loss = 연체 및 미수
    EGI = 유효총수입
    Less Non-recoverable OPEX = 소유자 부담 운영비
    NOI Current = 현재 순영업소득
    NOI Normalized = 안정화 임대·공실·비용 적용 NOI
    Cap Rate Current = NOI Current / 분석 가격 basis
    Cap Rate Stabilized = NOI Normalized / 총취득원가 basis
    DSCR = NOI 또는 CFADS / 연간 원리금

보증금은 부채성 자금으로 별도 표시하며 수입에 포함하지 않는다.

### 7.6 밸류애드 액션 모델

아키타입은 하나만 선택하지 않는다. 다음 전략 태그를 복수 조합한다.

- stable_income
- rent_reversion
- vacancy_lease_up
- tenant_reconfiguration
- capex_reposition
- operating_expense_recovery
- extension_or_conversion

각 액션은 다음 필드를 가져야 한다.

| 필드 | 설명 |
|---|---|
| target_unit | 대상 층·호실 |
| current_state | 현재 임대·시설 상태 |
| action | 갱신·퇴거·분할·통합·리뉴얼 등 |
| prerequisite | 계약만기·동의·인허가 |
| capex | 공사비 |
| leasing_cost | 무상임대·TI·중개비 |
| duration_months | 실행 및 안정화 기간 |
| rent_delta | 월 임대수입 변화 |
| opex_delta | 비용 변화 |
| noi_delta | 연 NOI 변화 |
| value_delta | 적용 Cap Rate 기준 가치 변화 |
| probability | 실현가능성 |
| downside | 실패 시 손실 |
| owner | 실행 책임자 |

### 7.7 권장 섹션 구성

| 그룹 | 섹션 |
|---|---|
| 공통 | Cover · Decision Snapshot · Evidence Health · Asset & Rights · Location & Demand |
| 임대 | Rent Roll · Collection & Arrears · Lease Expiry/WALE · Tenant Concentration |
| 수익 | Current NOI · Normalized NOI Bridge · Market Rent Gap |
| 전략 | Value-add Action Plan · CAPEX & Stabilization Timeline |
| 가치 | Adjusted Comps · Current/Stabilized Value · Financing & Returns |
| 판단 | Sensitivity · Risk · DD/LOI · 100-day Plan · Disclosure |

권장 본문 18~22면. 렌트롤·계약 세부·비교사례 원장은 부록으로 자동 분할한다.

### 7.8 스트레스 테스트

- 임대료 -5%, -10%
- 공실률 +5%p, +10%p
- 핵심 임차인 퇴거
- 안정화 3개월, 6개월 지연
- CAPEX +10%, +20%
- 금리 +100bp, +200bp
- Exit Cap +50bp, +100bp

### 7.9 발행 차단

- 계약면적·임대면적 basis 불명
- 계약상 임대료와 렌트롤 합계 불일치
- 수납자료 없이 실제수납이라고 표기
- 운영비 없이 NOI 확정
- 시장임대료 근거 없이 정상화 NOI 확정
- 밸류애드 비용 또는 기간 없이 가치상승 표기
- 가격상한 근거 없이 매입 적정 표기

### 7.10 수용 기준

- 렌트롤 합계와 요약 합계 100% 일치
- Current와 Normalized가 동일 표에서 브리지됨
- 모든 정상화 항목에 source 또는 assumption 존재
- 모든 밸류애드 액션에 비용·기간·NOI 변화 존재
- Base/Upside/Downside의 입력과 출력 재현 가능
- 가격범위와 Walk-away 조건 존재

---

## 8. 사옥형 Owner Occupied

### 8.1 현재 평가

| 항목 | 평가 |
|---|---|
| 현재 성숙도 | C+ |
| 장점 | 사용계획, 매입 대 임차 비교, 통근·접근성 |
| 핵심 결손 | 비교사례 억제, 잔존가치, 이전·인테리어 비용, 대체입지 |
| 권장 릴리즈 | 베타 · 실제 매수기업 3건 이상 검증 후 |

### 8.2 매수자 핵심 질문

1. 이 건물이 조직·업무·고객·물류 요구를 충족하는가?
2. 매입, 계속 임차, 대체 사옥 임차 중 어느 선택이 유리한가?
3. 예상 인테리어·이전·증설비용은 얼마인가?
4. 잔여 공간을 임대할 수 있는가?
5. 5년·10년·15년 후 잔존가치와 유동성은 어떤가?
6. 조직 확대·축소 시 공간 유연성이 있는가?

### 8.3 필수 입력

- buyer_purpose와 예상 인원
- 부서별 좌석·회의·지원공간 요구
- 직원 거주권역 또는 통근 기준
- 고객·배송·주차·사인 요구
- 현재 임차료·보증금·관리비
- 이전비·인테리어비·IT·설비비
- 매입 금융조건
- 소유자 부담 수선·세금·보험
- 매매 비교사례와 대체 임차사례
- 잔존가치 가정

### 8.4 사용적합성 모델

| 평가축 | 예 |
|---|---|
| 공간 | 전용률, 층당 면적, 분할 가능성, 회의실 배치 |
| 물리 | 층고, 하중, 승강기, 전력, 냉난방 |
| 접근 | 역·도로·직원 통근·고객 접근 |
| 운영 | 주차, 하역, 사인, 보안, 24시간 사용 |
| 법규 | 용도 적합성, 장애인 편의, 소방 |
| 성장 | 증원·감원, 재임대, 증축 가능성 |

fit_score는 단일 합계만 보여주지 않는다. 필수조건을 하나라도 충족하지 못하면 별도 blocker로 표시한다.

### 8.5 매입 대 임차 모델

비교기간을 10년으로 고정하지 않는다. 최소 5년·10년·15년을 제공한다.

#### 매입 현금흐름

- 매입가
- 취득·중개·법률 비용
- 대출 원리금
- 보유세·보험·수선·관리
- 인테리어·이전비
- 잔여 공간 임대수입
- 최종 잔존가치와 매각비용

#### 임차 현금흐름

- 보증금 기회비용
- 임차료·관리비·인상률
- 인테리어·이전비
- 갱신·퇴거·원상복구비
- 대체공간 비용

출력:

- NPV Buy
- NPV Lease
- 연간 점유비용
- 평당·인당 점유비용
- 손익분기 보유기간
- 잔존가치 민감도

### 8.6 권장 섹션

- Decision Snapshot
- Buyer Requirements
- Space Program & Stacking
- Physical/Legal Fit
- Commute & Access
- Buy vs Lease vs Alternative
- Initial CAPEX & Move Cost
- Residual Value & Market Comps
- Flexibility/Exit
- Sensitivity
- Risk · DD · Negotiation Conditions

권장 본문 16~20면.

### 8.7 발행 차단

- buyer_purpose 없음
- 공간 요구량 없이 사용 적합 판정
- 비교기간·할인율 없이 매입 대 임차 결론
- 잔존가치 없이 장기 비용우위 결론
- 비교사례를 억제한 채 자산가치 표기
- 법적 용도 확인 없이 입주 적합 표기

---

## 9. 개발형 Development

### 9.1 현재 평가

| 항목 | 평가 |
|---|---|
| 현재 성숙도 | C- |
| 장점 | 토지·규모·명도·스태킹·사업수지 구조 |
| 핵심 결손 | 비교사례 억제, FAR 중심 규모산정, 단순 공사비, 일정·금융·Residual 부재 |
| 권장 릴리즈 | 전문가 조건부 베타 |

### 9.2 매수자 핵심 질문

1. 법적·물리적으로 실제 개발 가능한 연면적은 얼마인가?
2. 어떤 상품과 임대·매각 전략이 최고최선이용인가?
3. 명도·철거·설계·인허가·공사·안정화에 얼마나 걸리는가?
4. 총 사업비와 자금투입 시점은 무엇인가?
5. GDV 또는 안정화가치는 어떤 비교사례로 방어되는가?
6. 목표 개발이익을 만족하는 최대 토지가격은 얼마인가?
7. 공사비·일정·Exit 가격이 변할 때 손실범위는 얼마인가?

### 9.3 개발규모 입력

- 필지목록·제척·도로접면·형상·고저차
- 용도지역·지구·구역·도시계획
- 건폐율·용적률
- 도로폭·높이·사선·일조·경관
- 지구단위계획·특별계획
- 주차·조경·공개공지
- 문화재·군사·항공·교육환경 등 중첩규제
- 기존 건축물·임차인·석면·철거
- 공급 가능한 전력·상하수·가스
- 건축사 검토 또는 massing

법정 FAR에 토지면적을 곱한 값을 개발가능 연면적으로 확정하지 않는다.

### 9.4 개발비용 모델

| 비용군 | 내용 |
|---|---|
| Land | 매입가, 취득비, 중개·법률비 |
| Enabling | 명도, 철거, 오염·석면, 가설 |
| Hard Cost | 구조·마감·설비·외부공사 |
| Soft Cost | 설계·감리·PM·인허가 |
| Finance | 브릿지·PF 이자, 수수료, 예치 |
| Sales/Lease | 분양·임대 마케팅, 중개, TI |
| Tax/VAT | 거래구조별 검토값 |
| Contingency | 설계·공사·일정 리스크 |
| Developer Cost | 본사비·사업관리비 |

고정 취득세율과 평당 공사비는 default가 아니라 명시적 assumption으로 저장하고, 사용자·전문가 승인 없이는 G등급 확정값으로 표시하지 않는다.

### 9.5 일정과 현금흐름

최소 단계:

1. 계약·잔금
2. 명도
3. 설계
4. 인허가
5. 철거
6. 착공
7. 골조
8. 준공
9. 임대·분양 안정화
10. 매각 또는 보유

월별 또는 분기별 현금흐름을 만들고 공사비는 S-curve로 배분한다.

### 9.6 가치와 의사결정 모델

필수 출력:

- GDV 또는 Stabilized Value
- 총 사업비
- 개발이익
- Profit on Cost
- Project IRR
- Equity IRR
- Residual Land Value
- 매입가 대비 Residual 여유
- 최대 허용 토지가

필수 검증:

- 토지 비교사례
- 개발 후 임대·매각 비교사례
- 직접환원 또는 DCF 교차검증
- 개발안 대 현상유지·단순매각 비교

### 9.7 권장 섹션

- Decision Snapshot
- Parcel/Title/Constraints
- Planning & Buildability
- Massing/Stacking
- Product/Market Strategy
- Tenant Eviction & Demolition
- Programme
- Detailed Cost Plan
- GDV/Exit Comps
- Development Cash Flow
- Residual Land Value
- Funding & Equity
- Sensitivity
- Alternative Scheme Comparison
- Risk · DD · Conditions

권장 본문 20~26면. 세부 사업수지·규제·도면은 부록.

### 9.8 필수 민감도

- 공사비 +10%, +20%
- 사업기간 +3개월, +6개월, +12개월
- 분양·매각가 -5%, -10%
- 임대료 -5%, -10%
- Exit Cap +50bp, +100bp
- 금리 +100bp, +200bp
- 연면적 -5%, -10%
- 명도비·기간 증가

### 9.9 전문가 게이트

| 게이트 | 승인자 |
|---|---|
| Buildable Area | 건축사 |
| Legal/Title | 변호사·법무사 |
| Cost Plan | 시공·CM·QS 역할 |
| Tax | 세무전문가 |
| Funding | 금융기관 또는 금융자문 |
| Release | 책임 분석가 |

전문가 확인 전에는 Expert Confirmed가 아닌 Analyst Scenario로 표시한다.

### 9.10 발행 차단

- 용도지역만으로 개발규모 확정
- 토지·Exit 비교사례 없이 GDV 확정
- 일정 없는 금융비용
- 평당 단가만으로 총 사업비 확정
- Residual 또는 목표이익 검토 없이 적정 토지가 제시
- 전문가 확인 없이 인허가 가능 확정

---

## 10. 운영형 Operating

### 10.1 현재 평가

| 항목 | 평가 |
|---|---|
| 현재 성숙도 | C |
| 장점 | KPI, 매출, 계절성, 운영사 분리 |
| 핵심 결손 | 부동산·사업가치 경계, GOP-to-NOI, 운영계약, FF&E, 인허가 |
| 권장 릴리즈 | 업종별 모듈을 분리하여 베타 |

### 10.2 매수자 핵심 질문

1. 부동산에서 발생하는 가치와 운영사업에서 발생하는 가치는 각각 얼마인가?
2. 보고된 매출과 GOP가 반복 가능한가?
3. 운영사·브랜드·인허가·인력에 대한 의존도는 얼마인가?
4. 정상화 후 부동산 NOI와 사업 EBITDA는 얼마인가?
5. FF&E·리뉴얼·운영자본을 반영하면 현금흐름은 얼마인가?
6. 가동률·객단가·인건비가 변할 때 손익분기점은 어디인가?

### 10.3 필수 입력

- 최근 36개월 월별 매출
- 업종별 KPI
- 매출원가·인건비·공통비
- 운영사·브랜드·프랜차이즈 계약
- 인허가와 영업권
- FF&E 목록·연식·교체계획
- 수선·교체적립
- owner add-back
- 운영자본
- 운영사 변경 가능성
- 부동산 임대가치 비교사례

### 10.4 업종별 KPI 팩

| 업종 | 필수 KPI |
|---|---|
| 호텔·숙박 | 객실수, Occupancy, ADR, RevPAR, 객실·F&B 매출 |
| F&B | 좌석수, 객단가, 회전율, 원가율, 인건비율 |
| 코워킹 | 좌석수, 이용률, desk rate, churn, CAC |
| 리테일 운영 | 면적당 매출, 객수, 객단가, 재고회전 |
| 의료·웰니스 | 이용자수, 객단가, 인력생산성, 인허가 |

하나의 operating 템플릿으로 모든 업종을 처리하지 않는다.

### 10.5 GOP-to-NOI 브리지

    Gross Revenue
    - Departmental Expenses
    = Departmental Profit
    - Undistributed Operating Expenses
    = GOP
    - Management/Franchise Fees
    - Insurance/Tax/Owner Expenses
    - FF&E Reserve
    = Property NOI or Owner Cash Flow

GOP와 NOI를 혼용하지 않는다.

### 10.6 필수 분석

- Actual vs Budget vs Prior Year
- 월별 계절성
- Revenue Driver Model
- 정상화 인건비·원가
- 운영사·브랜드 계약 종료 영향
- FF&E 교체
- Break-even Occupancy 또는 Break-even Sales
- 부동산 가치와 사업 가치 분리
- Debt Service와 DSCR
- 매수 후 운영개선 계획

### 10.7 권장 섹션

- Decision Snapshot
- Asset/Business Boundary
- Historical KPI
- Revenue & Seasonality
- Cost Structure
- GOP-to-NOI
- Operator/Brand/License
- FF&E & CAPEX
- Normalization Adjustments
- Business/Property Valuation
- Break-even & Sensitivity
- Transition Plan
- Risk · DD · Conditions

권장 본문 18~24면.

### 10.8 발행 차단

- 12개월 미만 자료로 안정적 계절성 결론
- GOP와 NOI 혼용
- 운영사 계약 없이 운영 지속 가능 확정
- 인허가 미확인 상태에서 적법운영 표기
- FF&E·교체비를 제외한 현금수익 확정
- 사업가치와 부동산가치를 중복 합산

---

## 11. 단기매매형 Trading

### 11.1 현재 평가

| 항목 | 평가 |
|---|---|
| 현재 성숙도 | D+ · 내부용 |
| 장점 | 비교사례·거래동향·회전전략 개념 |
| 핵심 결손 | 등기이력, 총거래비용, 자금비용, 유동성, 실현 가능한 Exit |
| 권장 릴리즈 | 외부 상용 금지 유지 |

### 11.2 매수자 핵심 질문

1. 매입가가 즉시 재매각 가능한 시장가보다 충분히 낮은가?
2. 취득·보유·금융·매각비용을 포함한 손익분기 매각가는 얼마인가?
3. 현실적인 매각기간과 Exit 채널은 무엇인가?
4. 매각이 지연되거나 가격이 하락할 때 손실은 얼마인가?
5. 권리·명도·공사 중 무엇을 해결해야 가격차익이 발생하는가?

### 11.3 필수 입력

- 등기·소유·거래이력
- 매입가격과 모든 취득비용
- 대출·브릿지 조건
- 월별 보유비용
- 필요한 수선·명도·법률비
- 실거래와 현재 경쟁매물
- 예상 매각채널
- 평균 마케팅 기간
- 매각비용과 세금 검토

### 11.4 필수 계산

    Total Basis = 매입가 + 취득비 + 해결비용 + 금융비 + 보유비
    Break-even Exit Price = Total Basis + 매각비용
    Target Exit Price = 목표 자기자본수익을 만족하는 가격
    HPR = 순매각수익 / 투입 자기자본
    Annualized Return = 보유기간을 반영한 연환산 수익

공시지가·감정가·호가의 3축만으로 적정가를 판단하지 않는다.

### 11.5 권장 섹션

- Decision Snapshot
- Title/Transaction History
- Purchase Basis
- Adjusted Comps
- Competing Listings & Liquidity
- Remediation Plan
- Holding Cost
- Exit Channel & Timeline
- Break-even Exit
- Downside
- Risk · DD · Conditions

권장 본문 14~18면.

### 11.6 발행 차단

- holding_history 미구현
- 실거래 또는 경쟁매물 부족
- 거래비용·금융비용 제외
- Exit 기간 없이 연환산수익률 표시
- 단순 호가 차이만으로 차익 확정

---

## 12. 가격·가치·권고의 공통 규칙

### 12.1 가격 축

각 포스처의 가격 판단은 최소 두 개 이상의 독립 경로로 교차검증한다.

| 포스처 | 1차 | 2차 | 필요 시 3차 |
|---|---|---|---|
| income | 직접환원·DCF | 조정 비교사례 | 토지가치 |
| owner_occupied | 매입·임차 NPV | 조정 비교사례 | 잔존·대체가치 |
| development | Residual Land Value | 토지 비교사례 | 현상유지 가치 |
| operating | GOP/NOI 가치 | 부동산 임대가치 | 사업 비교배수 |
| trading | 조정 비교사례 | Break-even Exit | 현금흐름 하방 |

### 12.2 권고 출력

외부 IM에서 단일 적정가격을 확정적으로 표시하지 않는다.

- Asking Price
- Base Underwritten Value
- Downside Value
- Maximum Bid 또는 Negotiation Range
- 가격이 성립하는 전제
- Walk-away Conditions

### 12.3 DCF 공통 계약

- 현금흐름 종류: 자산 또는 Equity
- 세전·세후
- 명목·실질
- 예측기간
- 임대성장률
- 공실·연체
- CAPEX
- Exit Cap 또는 Terminal Value
- 할인율
- 매각비용

현금흐름과 할인율의 basis는 일치해야 한다.

---

## 13. 비교사례 V2

5~16건이라는 건수 규칙을 최소요건으로 사용하지 않는다. 비교가능성과 검증 가능성을 우선한다.

### 13.1 필수 필드

- comp_id
- source
- source_tier
- identification_status
- transaction_or_asking
- transaction_date
- address_precision
- distance
- land_area
- gfa
- zoning
- road_condition
- corner
- completion_year
- current_use
- occupancy
- price
- unit_price_basis
- special_conditions
- comparability_score
- adjustment_items
- adopted_or_rejected
- analyst_note

### 13.2 조정표

비교사례는 다음 요인 중 적용 가능한 항목을 조정한다.

- 거래시점
- 입지·역거리
- 대로변·이면·코너
- 대지·연면적 규모
- 용도지역
- 건물연식·상태
- 임대수익·공실
- 명도·권리조건
- 개발 가능성
- 호가·실거래 차이

### 13.3 수용 기준

- 채택사례마다 채택 이유
- 제외사례마다 제외 이유
- 대상물건과 기준단위 일치
- 거래일·기준일 명시
- 평균값뿐 아니라 범위와 조정값 표시
- 마스킹 자료는 S2b 보강 전 확정사례로 사용 금지

---

## 14. Human-in-the-loop 승인 체계

### 14.1 공통 승인 게이트

| 게이트 | 승인 내용 | 기본 승인자 |
|---|---|---|
| H1 Identity | 주소·필지·건물·거래대상 | 중개인 |
| H2 Evidence | 원자료 완전성·충돌처리 | 중개인 + 분석가 |
| H3 Underwriting | NOI·비용·가치·민감도 | CRE 분석가 |
| H4 Strategy | 실행전략·비용·기간 | 중개인 + 분석가 |
| H5 Specialist | 법률·건축·세무·금융 | 해당 전문가 |
| H6 Release | 표현·공개범위·최종발행 | 책임자 |

### 14.2 승인 상태

- pending
- approved
- approved_with_conditions
- rejected
- expired

자료나 가정이 변경되면 해당 값을 참조하는 모든 승인과 페이지를 stale로 전환한다.

### 14.3 전문가 표시

전문가가 검토하지 않은 내용을 전문가 의견처럼 표기하지 않는다.

- AI Draft
- Broker Statement
- Analyst Assumption
- Analyst Reviewed
- Expert Reviewed
- Expert Certified

---

## 15. 발행 게이트 V2

### 15.1 공통 차단

| 코드군 | 검사 |
|---|---|
| ID | 자산·필지·건물 동일성 |
| SRC | 핵심 Claim의 evidence 존재 |
| TIME | 기준일·최신성 |
| REC | 합계·면적·금액 reconciliation |
| CALC | 공식·단위·버전 |
| BASIS | 수익률·단가·면적 basis |
| DISC | 가정·결손의 국소 표시 |
| DEC | 가격·조건의 근거 |
| HITL | 필요한 인간 승인 |
| ART | PPTX 텍스트·이미지·PII·오버플로 |

### 15.2 중요도별 검사율

결정 핵심 Claim은 샘플링하지 않는다.

| 중요도 | 검사 |
|---|---|
| Decision Critical | 결정론적 검사 100% + 인간 승인 |
| Financial | 공식·합계 검사 100% |
| Legal/Technical | 전문가 또는 명시적 미확인 |
| Narrative | 자동평가 + 표본 인간검수 |
| Cosmetic | 레이아웃 자동검사 |

LLM Judge 실패는 soft-fail이 아니라 해당 섹션을 review_required로 전환한다. 단, LLM Judge가 통과해도 결정론적 게이트를 대체하지 못한다.

---

## 16. 페이지 편성 V2

### 16.1 원칙

1. 12면 미만을 자동으로 채우지 않는다.
2. 16면 또는 18면을 넘었다고 핵심분석을 자르지 않는다.
3. 렌트롤·비교사례·계약 세부는 자동으로 부록 분할한다.
4. 본문은 한 질문에 한 페이지 원칙을 사용한다.
5. 같은 결론을 summary, thesis, closing에서 반복하지 않는다.
6. process와 closing은 한 면으로 통합 가능하다.
7. 토지와 건물은 단순자산에서 통합 가능하다.

### 16.2 초과 처리

    if main_pages > posture_main_max:
      move D3 sections to appendix
      recompute

    if decision_critical_pages still exceed max:
      stop build
      emit composition_overflow report

앞 N면 강제 슬라이스는 금지한다.

### 16.3 프리셋

기존 디자인 프리셋과 별도로 정보 편성 프리셋을 둔다.

- decision_first
- evidence_first
- income_value_add
- owner_use_case
- development_residual
- operating_turnaround
- trading_exit

디자인 테마와 정보 편성 프리셋을 분리한다.

---

## 17. 테스트와 평가

### 17.1 테스트 계층

| 계층 | 대상 | 예 |
|---|---|---|
| T1 Schema | 객체 필드 | Claim에 as_of 누락 |
| T2 Formula | 계산엔진 | NOI·IRR·Residual |
| T3 Reconciliation | 원장 대 요약 | 렌트롤 합계 |
| T4 Invariant | 의미 모순 | 만실 대 공실률 |
| T5 Section Contract | 데이터 준비도 | G22 입력 부족 |
| T6 Decision | 가격·조건 근거 | 최대가 계산 재현 |
| T7 Artifact | PPTX 실제 산출물 | 오버플로·PII |
| T8 Golden Deal | 사람이 승인한 표본 | 포스처별 회귀 |
| T9 Adversarial | 오류 주입 | 잘못된 계약만기 |

### 17.2 포스처별 골든 표본

각 포스처 최소 3건:

- 완전자료 정상딜
- 중요자료 결손딜
- 충돌·위험·엣지케이스 딜

상용 전 최소:

| 포스처 | 최소 실증 |
|---|---:|
| income | 5건 |
| owner_occupied | 3건 |
| development | 3건 + 건축사 검토 |
| operating | 업종별 3건 |
| trading | 3건 + 권리이력 |

### 17.3 품질 KPI

- Decision Critical Claim 출처 커버리지 100%
- 계산 재현율 100%
- 렌트롤·요약 합계 불일치 0
- unsupported numeric claim 0
- 기준일 누락 0
- 국소 경고 누락 0
- 필요한 인간 승인 누락 0
- PPTX 차단 위반 0
- 같은 입력 재생성 시 핵심 숫자 동일
- 동일 Claim의 전 페이지 값 동일

### 17.4 LLM 평가

LLM 평가는 다음 항목에 사용한다.

- 설명의 명료성
- 중복
- 투자자 질문 대응
- 과장·확정 표현
- 누락된 반론

LLM 평가를 다음 항목의 최종 검사로 사용하지 않는다.

- 숫자 정확성
- 계산
- 권리·적법성
- 세금
- 전문가 승인

---

## 18. 구현 로드맵

### Phase 0. 정본 수렴

| 작업 | 산출물 | 수용 기준 |
|---|---|---|
| 페이지 상한·절삭 정본 통합 | im.pages.yaml 단일화 | 문서·코드·테스트 값 일치 |
| 포스처별 순서 정본화 | posture sequences | income 외 4종 정의 |
| 디자인·정보 프리셋 분리 | preset schema | 상호 독립 |
| 문서 자동생성 | spec generator | 수기 중복 제거 |

### Phase 1. 증거·Claim 기반

| 작업 | 산출물 | 수용 기준 |
|---|---|---|
| Evidence/Fact/Claim 스키마 | 타입·DB | 핵심 Claim 추적 |
| 수치 Anchor 재설계 | canonical anchors | LLM 출력 참조 금지 |
| provenance V2 | 필드·주장 단위 | S1~S5 + 상태 |
| 기준일 모델 | time fields | stale 탐지 |
| Conflict Resolver | conflict register | 미해결 충돌 발행 제한 |

### Phase 2. Income G22 파일럿

| 작업 | 산출물 | 수용 기준 |
|---|---|---|
| Rent Roll V2 | 계약·수납 구조 | 합계 100% |
| Current/Normalized NOI | 브리지 | 재현 가능 |
| Value-add Action | 액션 원장 | 비용·기간·NOI |
| Price/Value | 가격범위 | 조건·하방 포함 |
| G22 덱 | 5개 실증 | 전문가 평가 통과 |

### Phase 3. Owner/Development

- Owner: Buy/Lease/Alternative NPV
- Development: Buildability, Programme, Cost, GDV, Residual
- 각 포스처 전문가 게이트
- 포스처별 골든 표본

### Phase 4. Operating/Trading

- 업종별 운영 KPI 팩
- GOP-to-NOI
- 권리·거래이력
- 유동성·보유비·Exit
- internal_only 해제 심사

### Phase 5. F35 전문가 협업

- 전문가 리뷰 큐
- 승인·반려·조건부 승인
- 변경 시 승인 무효화
- 전문가 의견 부록
- 최종 DD 데이터룸 인덱스

---

## 19. 우선순위 백로그

### P0 차단

1. im.pages.yaml과 deck-sequencer의 페이지 정책 충돌 해소
2. 강제 슬라이스 제거
3. LLM 서술에서 Numerical Anchor 생성 금지
4. Decision Critical Claim 100% 출처 검사
5. 중개인 입력을 confirmed로 자동 승격하는 로직 제거
6. 개발형 비교사례 suppress 제거
7. 고정 취득세·공사비·규제일자를 assumption으로 전환
8. 결손을 해당 주장 옆에 표시

### P1 Goldilocks

1. Current/Normalized NOI
2. 임차인별 밸류애드 원장
3. 가격상한·Walk-away
4. DD·LOI 조건
5. 포스처별 계산 Registry
6. Human Gate
7. Claim 기반 섹션 계약

### P2 완전형

1. 법률·건축·세무·금융 전문가 협업
2. 전문가 의견과 버전관리
3. 데이터룸 자동 인덱스
4. 매수자 Q&A 에이전트
5. 거래 후 Actual vs Underwriting 추적

---

## 20. 기존 섹션의 V2 매핑

| 기존 | V2 | 조치 |
|---|---|---|
| summary | decision_snapshot | 가격·조건·위험 추가 |
| land + building | asset_rights | 단순자산 통합 가능 |
| rentRoll | rent_roll_v2 | 면적·계약·수납·증거 확장 |
| stability | lease_risk | WALE·집중도·회수 |
| profit | noi_bridge | Current 대 Normalized |
| valueAdd | action_plan | 비용·기간·NOI·가치 |
| comps | adjusted_comps | 비교가능성·조정표 |
| thesis | 분산 배치 | 요약과 분석결과로 이동 |
| risk | risk_register | 국소 경고와 이중 표시 |
| checklist | dd_loi_conditions | 계약조건까지 확장 |
| process | execution_plan | 30·60·100일 |
| closing | disclosure_contact | process와 통합 가능 |
| dcf | posture_model | 자동 등급 확장 폐지 |
| tax | specialist_or_assumption | 거래구조별 전문가 검토 |

---

## 21. Definition of Done

### 제품

- 포스처별 매수자 핵심 질문이 정의돼 있다.
- 모든 본문 섹션이 하나 이상의 의사결정을 지원한다.
- 가격·수익·위험·조건·실행계획이 연결된다.
- 일반 마케팅 문구가 분석 결손을 대신하지 않는다.

### 데이터

- 모든 Decision Critical Claim에 evidence 또는 승인된 assumption이 있다.
- 데이터 기준일과 조회일이 분리된다.
- 충돌값은 숨기지 않고 해결상태를 기록한다.
- S1~S5와 verification status가 분리된다.

### 계산

- 모든 계산은 공식·단위·입력·버전을 가진다.
- LLM이 계산원장 역할을 하지 않는다.
- 시나리오와 민감도가 재현 가능하다.
- 가격범위와 철회조건을 계산 또는 증거로 방어한다.

### 승인

- 중개인·분석가·전문가·책임자의 승인범위가 구분된다.
- 변경된 입력은 관련 승인을 무효화한다.
- 전문가 미확인 내용을 확정적으로 표시하지 않는다.

### 렌더

- 핵심 분석의 자동 절삭이 없다.
- 부록 자동분할이 작동한다.
- PPTX 파싱 종단검사에서 차단 위반이 없다.
- 같은 Claim은 모든 페이지에서 동일한 값과 basis를 사용한다.

### 상용화

- 포스처별 최소 실증건수를 충족한다.
- 골든 표본과 오류 주입 표본을 모두 통과한다.
- 실제 중개인과 매수자 검수에서 핵심 질문 응답률 기준을 통과한다.
- 외부 서비스 명칭과 자문범위는 법률 검토를 거친다.

---

## 22. 최종 제품 원칙

1. 페이지를 만들기 전에 증거를 만든다.
2. 문장을 만들기 전에 계산을 확정한다.
3. 장점을 말하기 전에 성립조건을 밝힌다.
4. 가치상승을 말할 때 비용·기간·실패위험을 함께 말한다.
5. 적정가격을 말할 때 최대가격과 철회조건을 함께 말한다.
6. 결손은 숨기지 않고 해당 주장 옆에 표시한다.
7. LLM은 사실과 계산을 설명하지만 사실과 계산의 주인이 아니다.
8. 전문가 검토 전에는 전문가 결론처럼 표시하지 않는다.
9. 면수보다 의사결정 완결성을 우선한다.
10. Goldilocks는 잘 편집된 PPT가 아니라 방어 가능한 투자판단 패키지다.

---

## 부록 A. 개발팀 착수 질문

다음 질문에 답하기 전에는 구현을 시작하지 않는다.

1. 문서·YAML·코드 중 페이지 편성의 최종 소유자는 무엇인가?
2. DealIdentity의 불변키는 무엇인가?
3. 모든 수치 Anchor는 어느 저장소에서 오는가?
4. Claim과 Evidence는 N:M 관계인가?
5. 가정 변경 시 어떤 계산·Claim·승인이 stale이 되는가?
6. 포스처별 Decision Critical Claim 목록은 누가 승인하는가?
7. 전문가 검토가 필요한 기준은 무엇인가?
8. Goldilocks와 Full Advisory의 외부 표시 차이는 무엇인가?
9. 부록은 본문 페이지 상한에 포함하는가?
10. PPTX 외 Excel 모델·출처로그·DD 목록은 어디에서 생성하는가?

## 부록 B. 본 문서의 우선순위

정본 간 충돌 시 현재 정본을 임의로 덮어쓰지 않는다. 다음 순서로 처리한다.

1. 제품 책임자와 CRE 분석가가 본 문서의 의사결정·분석 요구를 승인
2. CATALOG와 im.ontology에 새 계약 등록
3. im.pages·im.bindings·im.gating·im.invariants 값 갱신
4. 코드와 테스트가 갱신된 정본을 참조
5. 05_POSTURE_SECTION_BLUEPRINT를 새 정본에서 재생성

이 문서는 기존 렌더·테스트 지시를 대체하지 않는다. 기존 문서가 산출물의 형식과 물리적 품질을 담당한다면, 본 문서는 **투자자문형 콘텐츠의 판단 적합성과 증거·계산·승인 요건**을 담당한다.
