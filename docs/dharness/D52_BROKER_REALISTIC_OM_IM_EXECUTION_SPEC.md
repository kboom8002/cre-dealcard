# D52 현실적 중개인형 OM/IM 통합 제작 방법론 및 실행 사양

> **문서 상태** D51·D49 정밀 평가를 반영한 후속 통합 제안 사양  
> **버전** v1.1 · 2026-08-30  
> **대상** CREDEAL 제품 책임자 · 중개 실무 책임자 · 도메인/백엔드/AI/PPTX/QA 개발팀  
> **제품 범위** 대한민국 소형 상업용 부동산, 중개인 단독 작성 가능 범위  
> **기본 산출물** 공부·현장·최소 임대정보·중개인 판단을 결합한 `Goldilocks OM`  
> **상위 산출물** 자료가 허용할 때만 생성하는 `Broker Analysis IM`  
> **비범위** 감정평가·법률·세무·건축·기술·회계·금융기관의 확정 의견  
> **선행 문서** D51 현실적 IM 제작 방법론, D49 포스처 5분법 적합성 검토, 07 Broker Goldilocks IM 제품 사양, 08 im-core 도메인 명세, 09 Golden IM 데이터 요구사항  
> **문서 역할** 설명서가 아니라 제품·데이터·판정·생성·검수의 공동 구현 계약

---

## 0. 한 페이지 결론

### 0.1 최종 판단

D51은 **제품의 기준점을 투자자문형에서 중개인 도달 가능 수준으로 낮춘 판단**, **출처 확보 가능성과 주장 허가를 분리한 판단**, **자료가 부족해도 현재 가능한 문서를 먼저 발행하고 보완 후 승급시키는 판단**이 정확하다. 이 세 가지는 그대로 채택해야 한다.

다만 D51과 기존 포스처 5분법을 그대로 런타임 정본으로 쓰기에는 다음 다섯 가지 구조적 공백이 있다.

1. `A~F`는 정보를 얻는 **경로**이지 자산정보의 MECE한 **내용 영역**이 아니다.
2. 원본 충돌을 발견한 뒤 무엇을 유효값으로 쓸지 정하는 **정정원장과 유효 스냅숏**이 없다.
3. 중개인 의견을 계산에서 완전히 배제하면 밸류애드 시나리오를 만들 수 없고, 반대로 바로 계산에 넣으면 의견이 사실로 위장된다.
4. 임대차 8개 주장만으로는 다필지, 사옥형, 개발형, 운영형, 가격 포지션의 발행 가능성을 결정할 수 없다.
5. `income/owner_occupied/development/operating/trading`은 자산의 물리형, 자료상태, 매수논리, 거래 내부정보를 한 필드에 섞고 있어 복합 논거와 재현 가능한 섹션 조립을 방해한다.

따라서 채택안은 다음과 같다.

> **A~F는 수집 라우팅에만 사용하고, 자산형태·거래범위·정보영역·품질벡터·투자렌즈·정정원장·주장 DAG·출력 번들을 별도 계층으로 둔다.**  
> **기본 목표는 Goldilocks OM, 상한은 Broker Analysis IM이며, 전문가형은 같은 데이터 계보 위에서 후속 협업으로 승격한다.**

### 0.2 목표 런타임

```mermaid
flowchart LR
    I[딜·매각범위 식별] --> O[원시 관측·증거 저장]
    O --> N[정규화·단위 통일]
    N --> X[충돌 탐지]
    X --> C[정정원장·승인]
    C --> S[유효 스냅숏]
    S --> D[정보영역 상태 프로필]
    S --> F[자산형태·거래범위 판정]
    D --> A[Claim 해당성 판정]
    F --> A
    L[투자렌즈·매수자 지시] --> A
    A --> G[주장 DAG·계산 허가]
    G --> R[발행등급·섹션 조립]
    R --> Q[수치·문구·PII·렌더 게이트]
    Q --> H[중개인 최종 승인]
    H --> P[불변 발행본·감사기록]
```

LLM은 추출 후보, 설명 초안, 의견 구조화, 리스크 후보, 문장 압축에 사용한다. 자산 식별, 값 채택, 합계, 수익률, 주장 허가, 발행등급, 공개 마스킹 판정은 결정론적 로직과 사람 승인으로 수행한다.

### 0.3 D51에 대한 정량 평가

평가점수는 문서의 설득력보다 **현재 팀이 일관되게 구현·운영할 수 있는가**를 기준으로 한다.

| 평가축 | 가중치 | 점수 | 판단 |
|---|---:|---:|---|
| 적합성 | 30% | 88/100 | 중개인 현실을 정점으로 삼고 과잉 자문을 억제한 방향이 적합 |
| 적용성 | 30% | 72/100 | 수집·주장 허가는 적용 가능하나 정정·다필지·포스처 분기가 빠짐 |
| 전문성 | 25% | 77/100 | 근거·기준일·반증가능성은 우수하나 용어·수익률 basis·증거권위가 덜 정교 |
| 효과성 | 15% | 78/100 | 중개인 부담을 줄이고 허위 정밀도를 억제하나 티어 판정과 보완 우선순위가 미완 |
| **가중 종합** | **100%** | **79.0/100** | **방향 채택, 런타임 구조는 D52로 보완 후 적용** |

---

## 1. 평가 범위와 판정 기준

### 1.1 검토한 체계

- D51의 출처 6축, 주장 단위 허가, 중개인 의견, 게이트 기록
- 07의 Broker Goldilocks 제품등급, 포스처별 모듈, 발행 게이트
- 08의 ClaimRegistry, FinancialCalculator, ReleaseTier, ActionCard, 한국 법정 항목
- 09의 Golden IM 데이터 요구사항과 DataAvailability 기반 덱 시퀀싱
- 실제 중상급 표본에서 확인된 당산동·상도동·양평동의 면적·임대료·관리비·만기·다필지 충돌

### 1.2 판정 질문

| 평가축 | 핵심 질문 |
|---|---|
| 적합성 | 한국 중개인이 통제할 수 있는 자료와 업무범위에 맞는가 |
| 적용성 | 입력자·시스템·승인자·예외처리까지 실제 운영 가능한가 |
| 전문성 | 수치 basis, 증거계보, 위험표현, 계산과 의견의 경계가 명확한가 |
| 효과성 | 더 짧은 입력으로 매수자의 문의·답사·자료요청·LOI 판단을 개선하는가 |

### 1.3 비평 원칙

- 높은 등급보다 **허용된 주장**을 우선한다.
- 많은 필드보다 **식별·정합·기준일·커버리지**를 우선한다.
- 중개인에게 전문가 역할을 요구하지 않는다.
- 면책문구로 데이터 오류를 덮지 않는다.
- 오류가 있는 원본을 삭제·덮어쓰지 않고 수정 이력을 보존한다.
- 자료 부족은 실패가 아니라 산출 범위를 정하는 입력이다.

---

## 2. D51에서 그대로 채택할 것

| 항목 | 평가 | 채택 결정 |
|---|---|---|
| 중개인 도달 가능 수준을 정점으로 재설정 | 가장 중요한 제품 판단 | 기본 목표를 Goldilocks OM, 상한을 Broker Analysis IM으로 고정 |
| A는 시스템, B·E는 중개인 중심 | 부담 배분이 현실적 | 자동조회와 현장·시장 판단 집중 원칙 유지 |
| D·F 부재를 기본 결손으로 세지 않음 | 정상적인 중개 초기단계를 존중 | `not_expected_at_stage` 상태 도입 |
| 등급이 아닌 주장별 전제 | 조합 폭발과 설명 불가를 해소 | 모든 계산·서술을 ClaimDefinition으로 관리 |
| 결손과 해당없음 분리 | 정확한 품질 표현 | `not_applicable`을 일급 상태로 사용 |
| 빈칸을 0으로 보지 않음 | 재무 왜곡 방지 | 숫자형 필드의 `unknown`, `zero`, `not_applicable` 분리 |
| 관리비 부과액과 순수익 분리 | 한국 소형 빌딩에서 필수 | 청구·수납·지출·순효과를 별도 필드로 분리 |
| 채권최고액과 대출잔액 분리 | 권리·금융 오표현 방지 | 별도 Claim과 라벨 사용 |
| 현재 가능한 문서를 먼저 발행 | 보완 대기 중 생산 중단 방지 | 불변 버전 발행 + 데이터 보완 후 새 버전 승급 |
| 보완 항목별 해제 효과 제시 | 중개인 행동 유도에 효과적 | Claim unlock 기반 HITL 작업목록 구현 |
| 의견의 화자·근거·범위·반증조건 | 의견의 책임성과 검증성 강화 | BrokerOpinion 필수 스키마로 채택 |
| 게이트의 관측값·규칙·입력 기록 | pass와 미실행을 구분 | GateDecision 이벤트로 영속화 |

---

## 3. 수정하지 않으면 실제 오류가 나는 부분

### 3.1 구조적 결함과 조치

| ID | 심각도 | D51 현재 표현 또는 공백 | 실제 위험 | D52 조치 |
|---|:---:|---|---|---|
| D51-01 | P0 | A~F로 정보를 분류 | 같은 임대료가 C·D에 동시에 존재하고 토지·권리 완성도를 설명 못함 | `수집경로`와 `정보영역`을 별도 축으로 분리 |
| D51-02 | P0 | A축은 누구나 100% 자동 확보 | API 미응답, 주소 모호성, 집합건물, 말소·다필지, 등기 유료·권한 문제 은폐 | A 자동화를 목표 SLO로 표현하고 실패·수동확인 상태 유지 |
| D51-03 | P0 | 중개인에게 B·E만 요구 | 매각대상 필지·건물과 매도인 진술의 의미는 시스템이 확정 불가 | 중개인은 `매각범위`, `C 진술`, `발행본`을 반드시 승인 |
| D51-04 | P0 | 충돌 탐지 후 유효값 결정 체계 없음 | 원본을 덮어쓰거나 임의 우선순위로 계산 | 원시 관측 → 정정원장 → 유효 스냅숏 도입 |
| D51-05 | P0 | 다필지 처리 없음 | 대표 필지의 용도지역·공시지가를 전체 필지에 전파 | ParcelSet과 주장별 면적 분모·커버리지 도입 |
| D51-06 | P0 | `rent_sum` 하나 | 매도인 제시액, 계약액, 실제수납액이 같은 숫자로 취급 | reported/contracted/collected rent를 별도 Claim으로 분리 |
| D51-07 | P0 | Gross Yield basis가 하나 | 보증금 차감 여부·VAT·관리비 포함 여부가 숨겨짐 | 분자·분모·제외항목을 이름과 각주에 강제 |
| D51-08 | P0 | D2+F1이면 decision_im | D2 정의에는 12개월 OPEX가 없고 F1 한 분야 의견이 전체 위험을 덮지 못함 | 필요한 Claim과 중대한 위험별 reviewer를 직접 요구 |
| D51-09 | P1 | 의견 수치는 어떤 계산에도 입력 금지 | 중개인 밸류애드 시나리오 자체가 불가능 | Opinion → AssumptionProposal → 사람승인 → Scenario의 단방향 변환 |
| D51-10 | P1 | 점추정 전면 금지 | 계산 가능한 Base 시나리오를 만들 수 없음 | 외부 의견은 범위, 계산은 승인된 Base/Low/High로 분리 |
| D51-11 | P1 | 만료 임대료 10% 단일 규칙 | 묵시갱신·점유·수납이 확인된 경우도 일괄 차단 | 만료상태와 현재 점유·수납 증거를 함께 판정 |
| D51-12 | P1 | A2+C1이면 analysis_im | 기준일·충돌·시장근거가 없어도 분석형으로 오판 | source 조합은 잠재 상한, 실제 tier는 Context별 ClaimBundle로 판정 |
| D51-13 | P1 | 허가의 최솟값이 IM 종류 결정 | 비필수 공실률 하나가 전체 문서를 과도하게 강등 | 각 tier의 필수·선택·금지 Claim 묶음으로 판정 |
| D51-14 | P1 | E2는 비교물건 3건 | 잘못 식별된 3건이 정확한 1건보다 높은 등급 | 식별·출처·시점·유사성·조정가능성을 함께 평가 |
| D51-15 | P1 | D1 주요 계약서 | ‘주요’가 자산별로 달라 커버리지 비교 불가 | 임대료·면적·최대임차인 가중 커버리지 사용 |
| D51-16 | P1 | 주장 8종이 임대에 집중 | 사옥·개발·운영·가격 포지션 발행 판정 불가 | 공통 Claim + 형태·렌즈·거래범위 Claim 카탈로그 도입 |
| D51-17 | P1 | `would_flip_if` 일괄 필수 | 형식·보안·렌더 게이트에는 부자연스럽고 형식 채우기 유발 | 고위험 판정에는 counterfactual, 모든 게이트에는 evaluated predicates 강제 |
| D51-18 | P1 | source grade가 신뢰도처럼 읽힘 | C3의 상세한 오정보가 C1보다 믿을 만한 것으로 오해 | 등급은 확보수준, 신뢰는 필드별 증거·정합 상태로 분리 |
| D51-19 | P2 | 고정 신선도 규칙 | 공부·임대·시장·현장 정보의 적정 수명이 다름 | 도메인별 TTL 정책과 `as_of/retrieved_at` 분리 |
| D51-20 | P2 | 외부 발행·개인정보 통제가 약함 | 임차인명·상호·번호판·연락처·계약서 정보 노출 | 공개정책·마스킹·배포등급·동의 로그 도입 |

### 3.2 기존 07·08·09 사양과의 충돌

| 기존 요소 | 문제 | 통합 결정 |
|---|---|---|
| 07의 BG가 계약 주요조건·시나리오를 사실상 요구 | 일반 중개인의 C1/D0 표준과 맞지 않음 | 표준 Goldilocks OM과 상위 Broker Analysis IM을 분리 |
| 08 `resolveTier({grade, dataAvailability})` | boolean 존재 여부가 충돌·기준일·커버리지를 무시 | ClaimBundle 기반 resolver로 교체 |
| 08 `FinancialCalculator`의 NOI·IRR 일괄 산출 | 입력이 존재한다는 이유만으로 금지 계산이 열릴 수 있음 | Claim permission이 calculator 호출 전후를 모두 제어 |
| 08 `trustWeight` | 신뢰도를 평균내어 진실처럼 만들 위험 | 표시 정렬용도도 금지하고 필드별 권위정책 사용 |
| 08 `KoreanLegalFields` boolean | `false`와 `미확인`을 구분 못함 | `yes/no/unknown/not_applicable` + 증거·기준일 |
| 08 ActionCard의 stabilized NOI 필수 | OPEX 없는 표준 OM에서 생성 불가 | 금액효과 nullable, 정성 액션도 허용 |
| 09 `hasX` 플래그 | 일부만 있어도 true가 되어 커버리지·충돌을 숨김 | DomainState와 ClaimEvaluation으로 대체 |
| 09 `llm_calculated` provenance | 계산 책임과 재현성이 불명확 | 계산은 deterministic engine만, LLM은 설명만 |
| 09 Golden IM을 모든 플래그 true로 설계 | 현실 결손·차단·강등 회귀를 검증하지 못함 | 정상본+결손본+충돌본+변종본을 한 세트로 관리 |
| 09 운영형 DCF를 GOP 기반으로 직접 계산 | 부동산 NOI·사업 GOP 경계 훼손 | 사업가치·부동산가치 분리, 전문가 협업 전 외부 확정 금지 |

### 3.3 D49 포스처 분석의 적합성 평가

| 평가항목 | 점수 | 판단 |
|---|---:|---|
| 현행 5분법 문제진단 | 92/100 | 포스처가 자산사실·매수의도·내부정보를 혼합한다는 지적이 정확 |
| 밸류애드 누락 지적 | 95/100 | 한국 소형 근생의 핵심 매수논리를 복원하는 중요한 보완 |
| 형태·자료·논거 3축 대안 | 84/100 | 기본 방향은 타당하나 형태축과 자료축 정의에 재혼합이 남음 |
| 런타임 적용성 | 76/100 | 마이그레이션 방향은 현실적이나 게이트 재부착과 자동판독을 보완해야 함 |
| 실증 충분성 | 61/100 | 5개 실물과 일부 합성 표본으로 분류 전체를 확정하기에는 부족 |
| **종합** | **83/100** | **핵심 진단은 채택하고, 대안은 6차원 모델로 정교화해 반영** |

#### 그대로 채택할 포인트

- 포스처는 매물의 고정 속성이 아니며 한 자산에 `yield + own_use + value_add + redevelop`이 동시에 성립할 수 있다.
- `value_add`는 여섯 번째 배타 포스처가 아니라 복수 선택 가능한 투자렌즈여야 한다.
- `operating`은 일반 근생과 같은 분류칸에 놓기보다 특수자산·사업양수도 범위로 분리해야 한다.
- `trading`의 매도사유·보유이력은 외부 IM 포스처가 아니라 공개통제되는 내부 Deal Context에 가깝다.
- 자료상태가 허용 분석과 면수에 큰 영향을 주며, 렌즈는 정확성 게이트를 완화할 수 없다.
- 실물표본 없이 포스처별 게이트를 계속 추가하는 방식은 중단해야 한다.

#### 수정해 채택할 포인트

1. **형태는 완전 자동확정이 아니다.** 건축물대장 주용도는 후보를 만들 수 있지만 복합용도, 다동, 집합건물, 실제사용 충돌이 있으므로 `system_inferred → broker_confirmed`가 필요하다.
2. **`land_or_teardown`은 분리한다.** 나대지는 물리형이지만 철거는 전략이다. `vacant_land`는 AssetForm, 철거·재개발은 `redevelop` Lens로 둔다.
3. **자료축은 단일값이 아니다.** S-A~S-F와 D-ID~D-BJ의 상태벡터로 표현하며, 자료등급이 Claim을 직접 허가하지 않는다.
4. **렌즈의 주관성은 재현성 실패가 아니다.** 선택자·선택시점·근거가 입력으로 저장되면 같은 승인 입력에서 같은 출력이 가능하다. 문제는 숨은 선택이다.
5. **렌즈는 무조건 페이지를 추가하지 않는다.** 필수 사실·위험은 삭제할 수 없지만, 선택 모듈을 활성화하고 우선순위를 바꾸며 페이지 예산 안에서 조립해야 한다.
6. **게이트를 form/source에 직접 재부착하지 않는다.** 게이트는 불변식 또는 Claim에 붙고, Claim의 해당성만 AssetForm·TransactionScope·Lens·BuyerMandate에서 결정한다.
7. **`special_use`는 하위유형이 필요하다.** 숙박·의료·주유소·물류는 지표와 규제가 다르므로 subtype과 사업 포함 여부를 별도로 둔다.
8. **단기보유 분석과 매도인 보유이력을 분리한다.** 전자는 특정 매수자의 `short_hold` Mandate가 될 수 있고, 후자는 내부정보다.

#### D49 대안을 그대로 적용할 때 생기는 두 번째 카테고리 오류

```text
land_or_teardown = 토지의 현재 상태 + 철거 전략
operating        = 자산형태 + 거래범위 + 분석모델
source           = 획득경로 + 데이터품질 + 발행등급
```

따라서 D52는 3축을 그대로 복사하지 않고 §5.5의 **6차원 모델**로 구현한다.

---

## 4. 목표 제품 체계

### 4.1 제품의 기준점

표준 사용자는 공인중개사 또는 중개법인 실무자다. 이 사용자는 공부를 직접 해석하는 전문가가 아니라 **대상 자산을 식별하고, 현장을 보고, 매도인 정보를 구조화하고, 시장의 거래 가능성을 설명하는 사람**으로 정의한다.

시스템은 다음을 책임진다.

- 주소·지번·PNU·건물 식별 후보 생성
- 공공자료 자동조회와 원본 보존
- 단위·날짜·금액 정규화
- 합계·면적·임대료·기준일 충돌 탐지
- 허용된 공식의 결정론적 계산
- 근거가 있는 문장만 조립
- 차단된 주장과 보완효과 제시
- PPTX/PDF/모바일 문서의 수치 일치와 렌더 검수

중개인은 다음을 책임진다.

- 실제 매각대상 필지·건물·지분·부속물 승인
- 매도인 진술의 의미와 기준일 확인
- 현장 관찰과 사진 공개범위 승인
- 비교사례 채택·제외 이유 승인
- 의견·가정·협상전략 승인
- 미확인·위험·면책을 포함한 최종 발행 승인

### 4.2 외부 산출물 4단계

| 코드 | 외부 명칭 | 목적 | 일반 면수 | 계산 상한 |
|---|---|---|---:|---|
| L0 | Internal Draft | 식별·충돌·자료요청용 | 가변 | 외부 표시 금지 |
| L1 | Broker Fact OM | 공부·가격·현장 사실 전달 | 7~9 | 단순 합계·면적·평당가 |
| **L2** | **Broker Goldilocks OM** | 문의·답사·자료요청·예비가격 검토 | **10~14** | 근거가 허용한 단순 임대수입·명시형 Gross Yield |
| L3 | Broker Analysis IM | 비교·만기·임대갭·실행안·시나리오 검토 | 14~18 | 승인 가정 시나리오, OPEX 충족 시 NOI/Cap |
| L4 | Expert Collaboration IM | 최종투심·법률·건축·세무·기술 검토 | 별도 | 전문가가 검토한 범위 |

`expert_required`는 문서 등급이 아니라 **특정 질문을 L4 협업으로 넘기는 workflow 상태**다.

### 4.3 기존 코드와의 호환 매핑

| D52 | 기존 ReleaseTier 임시 매핑 | 마이그레이션 규칙 |
|---|---|---|
| L0 | `internal_only` | 유지 |
| L1 | `fact_om` | 유지 |
| L2 | `analysis_im` + `edition=goldilocks_om` | 신규 edition 필드 추가 |
| L3 | `analysis_im` + `edition=broker_analysis_im` | `decision_im`으로 올리지 않음 |
| L4 | `decision_im` | reviewer scope 충족 시에만 사용 |
| 전문가 이관 | `expert_required` | tier가 아닌 `workflowStatus`로 이동 |

---

## 5. 분류체계: 수집경로와 정보영역을 분리한다

### 5.1 수집경로 Source Channel

경로코드는 ‘누구에게 무엇을 요청할지’를 정한다. Claim을 직접 허가하지 않는다.

| 코드 | 경로 | 담당 | 현실적 기준 | 주의 |
|---|---|---|---|---|
| S-A | 공부·공공시스템 | 시스템 수집, 중개인 식별승인 | 핵심 공부 자동조회 성공 | 자동조회 실패·다필지 모호성 허용 |
| S-B | 현장 관찰 | 중개인 | 날짜 있는 외관·출입·점유·주차 관찰 | 기술진단·적법성 결론 금지 |
| S-C | 매도인 진술 | 매도인, 중개인 구조화 | 가격·임대·사용현황의 기준일 있는 진술 | 상세도와 신뢰도를 혼동하지 않음 |
| S-D | 원본 문서 | 거래 단계의 매도인 | 계약서·수납·비용자료 일부 또는 전체 | 초기 D0은 정상 |
| S-E | 시장 자료·중개경험 | 중개인·공공시장데이터 | 의견 또는 식별된 비교사례 | 단순 건수로 품질 판단 금지 |
| S-F | 전문가 | 해당 전문가 | 쟁점별 검토 | F1 하나가 전체 문서를 보증하지 않음 |

### 5.2 정보영역 Information Domain

정보영역은 ‘무엇이 얼마나 준비됐는지’를 정한다.

| 코드 | 영역 | 핵심 객체·질문 |
|---|---|---|
| D-ID | 자산식별·매각범위 | 무엇을 파는가: 필지, 건물, 지분, 부속물, 제외대상 |
| D-LD | 토지·도시계획 | 필지별 면적, 지목, 용도지역, 도로, 공시지가, 규제 |
| D-BL | 건물·물리 | 동·층·용도·면적·구조·사용승인·주차·위반·현장상태 |
| D-RT | 권리·제약 | 소유권, 신탁, 근저당, 임차권, 알려진 분쟁·제약 |
| D-RR | 사용·임대차 | 점유, 공실, 임차, 보증금, 임대료, 관리비, 기간, 수납 |
| D-OP | 운영·비용·CAPEX | 공과금, 세금, 보험, 유지보수, 수선, 견적, 운영자료 |
| D-MK | 시장·비교사례 | 매매·임대·경쟁매물, 식별·유사성·시점·조정 |
| D-TX | 거래조건·매도인 의도 | 호가, 보증금 승계, 일정, 명도, 협상, 공개범위 |
| D-BJ | 중개인 판단·전략 | 투자논거, 반론, 매수자군, 액션, 협상·자료보완 전략 |

한 값은 하나의 정보영역에 속하되 여러 수집경로의 증거를 가질 수 있다. 예를 들어 월세는 `D-RR`이고, 매도인 엑셀은 S-C, 계약서는 S-D, 현장 점유는 S-B다.

### 5.3 영역별 품질벡터

단일 점수로 진실을 판정하지 않는다. 각 영역은 다음 벡터를 유지한다.

```text
DomainState = {
  maturity: G0|G1|G2|G3,
  resolution: H0|H1|H2|H3,
  coverage: 0.00..1.00|unknown,
  freshness: current|aging|stale|unknown,
  conflict: none|resolved|open_nonmaterial|open_material|critical,
  verification: stated|broker_checked|document_checked|independent,
  applicability: applicable|not_applicable|undetermined
}
```

| 축 | 단계 | 의미 |
|---|---|---|
| 성숙도 G | G0 없음 · G1 진술/요약 · G2 구조화/대조 · G3 원본/독립확인 | 정보의 검증 깊이 |
| 해상도 H | H0 없음 · H1 자산합계 · H2 필지/층/호/임차인 · H3 계약/이벤트/시계열 | 정보의 세분화 수준 |
| 커버리지 | 대상 분모 대비 확인된 비율 | 누락 범위 |
| 신선도 | 영역별 TTL에 따른 상태 | 시점 적합성 |
| 충돌 | 미해결 모순의 중요도 | 계산·서술 차단 여부 |
| 검증 | 누가 어떤 증거로 확인했는가 | 표현 라벨 |

표시 예시는 `D-RR G2-H2 / cov 0.91 / aging / material-conflict / seller-stated`다. 이 문자열은 설명용이며 Claim 허가식은 원시 필드를 직접 평가한다.

### 5.4 영역별 신선도 기본정책

| 영역 | current | aging | stale 기본값 | 비고 |
|---|---:|---:|---:|---|
| 매각조건 D-TX | 30일 이내 | 31~90일 | 90일 초과 | 호가·일정은 변동이 빠름 |
| 임대·점유 D-RR | 90일 이내 | 91~180일 | 180일 초과 | 중대한 만기·공실 이벤트가 있으면 즉시 재확인 |
| 현장 D-BL/S-B | 90일 이내 | 91~180일 | 180일 초과 | 공실·공사 시 더 짧게 적용 |
| 공부 D-ID/D-LD/D-BL | 30일 이내 발급 | 31~90일 | 90일 초과 | 계약 단계에서는 재발급 |
| 시장 D-MK | 180일 이내 | 181~365일 | 365일 초과 | 사례 발생일과 수집일을 모두 저장 |
| 운영비 D-OP | 최근 연속 12개월 | 6~11개월 또는 12개월 초과 노후 | 그 외 | 계절성 자산은 24~36개월 권장 |

TTL은 정책 버전으로 관리하고 자산 이벤트가 있으면 강제로 만료시킨다.

### 5.5 기존 포스처를 대체하는 6차원 모델

문서 구조와 분석범위를 하나의 `posture` 필드가 결정하지 않는다.

| 차원 | 질문 | 성격 | 단·복수 | 결정 주체 |
|---|---|---|---|---|
| `assetForm` | 물리적으로 어떤 자산인가 | 자산 사실 | 주형 1 + 구성요소 복수 | 시스템 후보, 중개인 확인 |
| `transactionScope` | 무엇이 거래되는가 | 거래 사실 | 1개 | 중개인·매도인 승인 |
| `evidenceProfile` | 무엇이 얼마나 확인됐나 | 자료 상태 | 영역별 벡터 | 시스템 계산 |
| `investmentLenses[]` | 어떤 매수논리를 강조할까 | 마케팅·분석 판단 | 0~3개 | 시스템 제안, 중개인 승인 |
| `buyerMandate` | 특정 매수자가 무엇을 원하는가 | 매수자 요구 | 선택 1개 | 매수자·중개인 입력 |
| `internalDealContext` | 공개하지 않을 거래 맥락은 무엇인가 | 내부정보 | 복합 | 권한 있는 중개인 |

이 구분으로 다음이 가능해진다.

```text
같은 당산동 자산
  assetForm        = neighborhood_building
  transactionScope = real_estate_only
  lenses           = [yield, value_add, own_use]
  buyerMandate     = null                # 공개용 매물 OM

특정 의원 매수자에게 재생성
  같은 Snapshot·Fact·Claim 유지
  buyerMandate     = medical_owner_user
  lensPriority     = [own_use, value_add]
```

사실은 그대로고 강조·추가분석만 바뀐다. 따라서 데이터 재현성과 매수자 맞춤성을 동시에 확보한다.

### 5.6 AssetForm

`assetForm`은 공부·물리현황에서 판독하는 문서의 기본 뼈대다. `primaryForm` 하나와 `components[]`를 둬 복합자산을 표현한다.

| primaryForm | 판독 기준 | 기본 모듈 |
|---|---|---|
| `neighborhood_building` | 근린생활시설 중심 일반건축물 | 층별 사용·임대, 가시성, 접근·주차 |
| `office_building` | 업무시설 중심 | 층판·전용성·승강기·사무수요 |
| `mixed_residential_commercial` | 주거와 근생이 함께 중요 | 주거/상가 분리 현황·권리·임대 |
| `vacant_land` | 건축물 없음 또는 거래범위상 토지만 | ParcelSet·도로·규제 |
| `strata_unit` | 집합건물 전유부 거래 | 전유/공용, 대지권, 관리단·관리비 |
| `special_purpose` | 숙박·주유·의료·물류 등 특수용도 | subtype별 규제·설비·운영경계 |
| `multi_asset` | 서로 다른 형태의 필지·건물이 동등하게 포함 | 구성요소별 모듈 + 통합 매각범위 |

추가 필드:

```yaml
assetForm:
  primary: neighborhood_building
  components:
    - { buildingId: B-01, form: neighborhood_building, weightBasis: gfa }
    - { parcelId: P-03, form: vacant_land, role: parking }
  specialPurposeSubtype: null
  inference:
    status: broker_confirmed
    confidence: 0.86
    rules: [FORM-R01, FORM-R07]
    evidenceRefs: [OBS-BUILDING-USE, OBS-FIELD-USE]
  conflicts: []
```

`confidence`는 발행등급을 올리는 점수가 아니라 확인이 필요한 후보의 불확실성을 표시한다. 주용도 없음, 복합용도, 공부·현장 충돌, 다동 자산이면 중개인 확인 전 확정하지 않는다.

### 5.7 TransactionScope

운영형을 올바르게 분리하려면 물건형태만으로 부족하다.

| 값 | 의미 | 외부 문서 영향 |
|---|---|---|
| `real_estate_only` | 토지·건물·임대차 승계 | 표준 OM/IM |
| `real_estate_plus_business` | 부동산과 운영사업·영업권·FF&E 포함 | 별도 운영자료 모듈, 전문가 이관 가능성 큼 |
| `equity_or_trust_interest` | 법인주식·수익권·신탁 관련 거래 | 중개인형 외부 확정 제한 |
| `strata_interest` | 집합건물 전유부·대지권 | 집합건물 전용 ClaimBundle |
| `partial_interest` | 일부 지분·일부 필지·일부 건물 | 매각범위·권리 P0 게이트 강화 |

`special_purpose + real_estate_only`이면 부동산 사실 중심 OM을 만들 수 있다. `special_purpose + real_estate_plus_business`이면 Seller-provided Operating Review를 별도 제품 모듈로 켜고, 부동산가치와 사업가치를 합산하지 않는다.

### 5.8 InvestmentLens

렌즈는 0~3개까지 복수 선택한다. 시스템은 사실에서 후보를 제안할 수 있지만 중개인이 채택·제외 사유와 함께 승인한다.

| Lens | 핵심 질문 | 활성화 후보조건 | 허용 모듈 |
|---|---|---|---|
| `yield` | 현재 수입이 얼마나 지속되는가 | 임대공간·렌트롤 존재 | 수입 basis, 만기, 공실, 임차안정성 |
| `value_add` | 임대·공실·건물을 무엇으로 개선할 수 있는가 | 시장격차·공실·만기집중·노후·저활용 | Rent Gap, 원인, Action Card, 비용·기간·Downside |
| `own_use` | 실사용 후보에게 맞는가 | 명도 가능 공간·사용성 | 공간·접근·주차, 명도 가능시점 |
| `redevelop` | 신축·대수선 검토 가치가 있는가 | 나대지·저이용·노후·개발문의 | ParcelSet, 이론규모, 명도, 전문가 질문 |
| `preservation` | 현 상태의 안정적 보유가 유리한가 | 장기임차·낮은 변동·낮은 CAPEX | 안정성·유지 리스크 |
| `succession` | 자산이전 검토가 필요한가 | 사용자 요청 | **내부 노트만**, 세무·법률 결론 금지 |

렌즈 규칙:

- 렌즈는 Claim 전제를 완화하지 않는다.
- 자산에 해당하는 핵심 Fact·경제 Claim은 Lens와 무관하게 평가하고, Lens는 표시 우선순위만 바꾼다.
- Lens 전용 Action·Scenario Claim만 해당 Lens 승인 여부를 applicability 조건으로 사용할 수 있다.
- 렌즈는 필수 사실·위험·면책 모듈을 삭제하지 않는다.
- 렌즈는 선택 모듈의 활성화·우선순위·페이지 예산을 결정한다.
- 선택된 렌즈, 선택자, 근거, 반대 대안, `revisit_if`를 저장한다.
- `own_use` 렌즈만으로 Buy/Lease 계산을 열지 않는다. 특정 `buyerMandate`가 필요하다.
- `redevelop` 렌즈가 있어도 실제 건축 가능규모를 확정하지 않는다.

```yaml
lensDecision:
  decisionId: LENS-001
  candidates:
    - { lens: yield, signals: [rentroll_present] }
    - { lens: value_add, signals: [expiry_concentration, market_rent_gap_candidate] }
    - { lens: own_use, signals: [owner_occupied_floor, near_term_expiry] }
  selected: [yield, value_add]
  rejected:
    - { lens: own_use, reason: "불특정 매수자용 OM이며 명도 가능범위 미확인" }
  revisitIf:
    - "특정 실사용 매수자 요구가 접수됨"
    - "건축사 예비검토 요청이 접수됨"
  approvedBy: broker-017
  approvedAt: 2026-08-30T15:30:00+09:00
```

### 5.9 BuyerMandate와 InternalDealContext

`buyerMandate`가 없으면 불특정 매수자용 OM이다. 이때 own-use는 일반 사용가능성만 다룬다.

```yaml
buyerMandate:
  mandateId: BM-001
  purpose: medical_owner_use
  requiredAreaSqm: { min: 450, max: 650 }
  occupancyDate: 2027-03-01
  parkingMinimum: 8
  holdYears: 10
  financingAssumptionsApproved: false
  disclosureScope: buyer_specific
```

Buy/Lease, 단기보유, 특정 업종 적합성 같은 분석은 이 객체가 있을 때만 허가한다.

`internalDealContext`에는 매도사유, 급매성, 보유이력, 내부 협상범위, 관계정보를 둔다. 기본값은 외부발행 금지다.

```yaml
internalDealContext:
  sellerMotivation: confidential
  holdingHistory: []
  urgency: internal_only
  negotiationFloor: restricted
  shortHoldBuyerAnalysis: null
  disclosurePolicy: deny_by_default
```

`trading`은 제거하되 두 부분으로 보존한다.

- 매도인의 보유·매도 맥락 → `internalDealContext`
- 특정 매수자의 단기보유·Exit 분석 → `buyerMandate.strategy=short_hold`, 외부 공개 OM이 아닌 제한 분석

### 5.10 문서 조립의 결정식

문서 구조를 결정하는 것은 어느 한 축이 아니다.

| 결정요소 | 실제 결정권 |
|---|---|
| AssetForm | 필수 사실 스키마와 기본 시각화 |
| TransactionScope | 부동산·사업·지분 중 분석·면책 경계 |
| EvidenceProfile | 허용 Claim과 분석 깊이의 상한 |
| InvestmentLens | 선택 분석의 우선순위와 설득 초점 |
| BuyerMandate | 특정 매수자용 계산·적합성 분석 허가 |
| Claim/Gate | 개별 문장·수치·섹션의 최종 허가·차단 |

```text
Mandatory Core
+ AssetForm Modules
+ TransactionScope Modules
+ Allowed Claim Modules from EvidenceProfile
+ Prioritized Lens Modules
+ Buyer-specific Modules if BuyerMandate exists
- Modules blocked by Claims/Gates
→ Page-budget Optimizer
→ Release Candidate
```

우선순위는 다음과 같다.

1. 매각범위·가격·핵심 사실·위험·DD·면책
2. 해당 자산형태의 필수 모듈
3. 매수판단 영향이 큰 허용 Claim
4. 승인 렌즈의 핵심 모듈
5. 보조 사진·일반 설명

렌즈가 여러 개여서 페이지가 넘치면 렌즈 수가 아니라 모듈의 의사결정 중요도와 증거수준으로 절삭한다. 차단된 Claim을 페이지 수를 맞추려고 되살리지 않는다.

### 5.11 기존 posture 마이그레이션

| 기존 값 | 신규 Context | 자동변환 한계 |
|---|---|---|
| `income` | `investmentLenses += yield` | 저임대·만기집중·공실이면 `value_add`도 후보 제안, 자동승인 금지 |
| `owner_occupied` | `investmentLenses += own_use` | 특정 매수자 분석은 BuyerMandate가 있어야 함 |
| `development` | `investmentLenses += redevelop` | 자산형태는 별도 판독; 기존 건물이 있으면 vacant_land로 바꾸지 않음 |
| `operating` | `assetForm=special_purpose` 후보 + TransactionScope 확인 | 일반 임대형 특수자산과 사업포함 거래를 사람에게 구분 요청 |
| `trading` | InternalDealContext로 이동 | 매수자 단기보유 분석은 별도 BuyerMandate가 있을 때만 생성 |

파괴적 일괄변환을 하지 않는다.

1. 기존 `posture`를 `legacyPosture`로 보존한다.
2. 신규 Context를 shadow mode로 계산한다.
3. 기존·신규 섹션, Claim, gate 차이를 실제 표본에서 비교한다.
4. 중개인이 AssetForm과 Lens 후보를 승인한다.
5. 차이가 승인된 표본에서만 신규 composer를 켠다.
6. 모든 consumer 전환 후 `legacyPosture`를 읽기 전용으로 내린다.

### 5.12 온톨로지 전환 착수조건

D49의 ‘배선과 대조군이 불안정한 상태에서 온톨로지를 먼저 바꾸지 말라’는 지적을 채택한다. 다음 조건 전에는 신규 구조를 production 판정에 사용하지 않는다.

- 현행 파이프라인의 핵심 입력→Claim→PPTX 데이터계보가 문서화됨
- 기존 게이트의 `PASS/FAIL/NOT_RUN`이 구분됨
- 당산·상도·양평 표본의 현재 출력과 알려진 결함이 baseline fixture로 고정됨
- 최소 18개 변종의 기대 판정이 정의됨
- legacy/new dual evaluation 결과를 같은 화면에서 비교 가능

조건 충족 전에는 스키마와 shadow evaluator만 구현하고 외부 발행 결과를 바꾸지 않는다.

---

## 6. 데이터 계보, 충돌, 정정원장

### 6.1 절대 원칙

원본에서 읽은 값은 수정하지 않는다. 다음 객체를 분리한다.

1. `Observation`: 원본·진술·현장에서 관측한 값
2. `Normalization`: 단위·표기·날짜 형식을 기계적으로 통일한 값
3. `Conflict`: 서로 양립할 수 없는 관측의 묶음
4. `CorrectionEvent`: 어느 관측을 왜 바로잡았는지에 대한 승인 이벤트
5. `EffectiveFact`: 특정 기준일에 계산과 문서가 사용할 유효값
6. `Assumption`: 미래 시나리오용 승인 가정

`CorrectionEvent`와 `Assumption`을 섞지 않는다. 정정은 과거 입력오류를 고치고, 업데이트는 현실의 새 상태를 추가하며, 가정은 아직 사실이 아닌 미래값을 만든다.

### 6.2 정정 등급과 승인

| 코드 | 유형 | 예 | 승인 |
|---|---|---|---|
| CR0 | 형식 정규화 | 3,000만원 → 30,000,000원 | 자동, 로그 필수 |
| CR1 | 합계·산술 오류 | 층별 합계와 표지 합계 불일치 | 시스템 제안 + 중개인 승인 |
| CR2 | 경제조건 | 월세·보증금·관리비·계약기간 | 증거 요청 + 중개인 승인, 핵심이면 원본 필요 |
| CR3 | 법률·물리·매각범위 | 필지·면적·위반·지분·포함범위 | 외부 발행 차단, 권위자료와 사람 승인 |

상태는 `detected → proposed → evidence_requested → approved|rejected → applied → superseded`로 관리한다.

### 6.3 필드별 우선 증거

일반적인 ‘출처 신뢰도 점수’는 사용하지 않는다. 필드마다 권위자료가 다르다.

| 필드 | 1순위 | 2순위 | 보조·관찰 |
|---|---|---|---|
| 필지·공부 면적 | 발급 공부·공공 원시응답 | 매도인 문서 | 중개인 입력 |
| 실제 매각범위 | 중개인·매도인 승인 매각범위 | 등기·목록 | 주소 자동추론 |
| 공부상 용도 | 건축물대장 | 발급 사본 | 현장 관찰은 충돌 증거 |
| 실제 사용·점유 | 날짜 있는 현장확인 | 매도인 진술 | 공부상 용도 |
| 계약 경제조건 | 임대차계약·변경합의 | 기준일 있는 렌트롤 | 구두 진술 |
| 실제 수납 | 입금내역·수납원장·세금계산 | 매도인 확인 | 계약액 |
| 운영비 | 12개월 원장·고지·세금자료 | 항목별 매도인 자료 | 비율 가정은 시나리오 전용 |
| 비교사례 | 식별 가능한 실거래·계약사례 | 출처 있는 경쟁매물 | 중개인 범위 의견 |

권위자료가 있다고 자동 채택하지 않는다. 기준일과 대상 식별이 달라 충돌할 수 있기 때문이다.

### 6.4 유효 스냅숏

```text
EffectiveSnapshot(revision, asOf)
  = Raw Observations
  + approved CR0/CR1/CR2/CR3
  + later Updates valid at asOf
  - rejected/superseded observations
```

모든 Claim과 문서는 하나의 `effectiveSnapshotId`만 참조한다. 렌트롤을 보완하면 이전 PPTX를 덮어쓰지 않고 새 스냅숏과 새 발행본을 만든다.

---

## 7. 다필지·다건물 표준

### 7.1 객체 경계

- `Parcel`은 토지사실의 최소 단위다.
- `Building`은 건축물대장 식별 단위다.
- `AssetScope`는 이번 거래에 포함되는 Parcel·Building·지분·부속물의 집합이다.
- 주소 문자열이 아니라 PNU와 건물 식별자를 기준키로 쓴다.

### 7.2 필지별 필수 필드

```yaml
parcel:
  parcelId: P-001
  pnu: "..."
  jibunAddress: "..."
  areaSqm: 0
  ownershipShare: "1/1"
  includedInSale: true
  role: building_site | access | parking | vacant | excluded
  zoning: []
  officialLandPrice: null
  roadAccess: unknown
  linkedBuildingIds: []
  evidenceRefs: []
```

### 7.3 서로 다른 네 개의 면적 분모

| 분모 | 용도 | 금지 |
|---|---|---|
| 매각대상 토지면적 | 토지 평당 매각가 | 제외 필지를 포함하지 않음 |
| 건축물대장상 대지면적 | 현재 BCR/FAR | 매각대상 합계로 자동 대체 금지 |
| 개발 검토 유효면적 | 이론 개발규모 | 건축사 검토 전 실제 가능면적으로 표현 금지 |
| 임대가능·임대기재 면적 | 공실률·임대단가 | 연면적과 자동 동일시 금지 |

### 7.4 다필지 Claim 허가

| Claim | 필수조건 |
|---|---|
| 총 매각토지면적 | 포함여부 확정 + 포함필지 면적 coverage 100% |
| 토지 평당 매각가 | 총 매각토지면적 허가 + 매매가 basis 확정 |
| 가중 공시지가 | 포함필지 공시지가 면적 coverage 100% |
| 통합 용도지역 서술 | 필지별 용도지역 coverage 100%, 차이는 분리표시 |
| 현재 BCR/FAR | 건축물과 공식 대지의 연결 확인 |
| 이론 개발규모 | 개발 관련 필지·도로·규제 coverage 100% + 경고문 |

대표 필지 한 장의 토지이용계획을 전체 필지에 복제하는 행위는 P0 차단이다.

---

## 8. 렌트롤: 표시등급과 주장 허가를 분리한다

### 8.1 외부 표시용 렌트롤 수준

| 표시 | 의미 | 대표 입력 | 주의 |
|---|---|---|---|
| RR-N/A | 임대가 해당 없음 | 나대지, 완전 자가사용 | 결손으로 세지 않음 |
| RR0 | 없음·사용불가 | 임대현황 미제공 | 임대 주장 차단 |
| RR1 | 최소 | 층/호, 사용상태, 보증금, 월세 | 매도인 제시 현황 중심 |
| RR2 | 표준 | RR1 + 관리비, 면적, 계약기간 일부 | 커버리지·충돌에 따라 주장별 허가 |
| RR3 | 완전 | RR2 + 계약, 수납, VAT, 인상·해지, OPEX 연계 | 원본·기준일이 있어야 실질 RR3 |

RR 등급은 UI와 자료요청에만 사용한다. 동일한 RR2라도 충돌과 기준일에 따라 허용 Claim은 다르다.

### 8.2 렌트롤 행 상태

```text
occupancy = leased | vacant | owner_occupied | free_use | unknown
leaseStatus = active | expired_holdover_verified | expired_unverified | terminated | unknown
paymentStatus = collected_verified | seller_reported_current | delinquent | unknown
mgmtFeeStatus = billed | collected | pass_through | net_income_verified | unknown
```

빈칸은 `unknown`이고 0원은 `zeroConfirmed=true`가 있어야 한다.

### 8.3 커버리지 분모

우선순위는 다음과 같다.

1. 확인된 임대가능면적
2. 공부·도면과 대조된 임대대상 면적
3. 렌트롤 전체 행 수

분모가 행 수이면 `coverageBasis=row_count`를 표시하고 면적 기반 공실률·단가를 허용하지 않는다. 자가사용은 임대료 커버리지 분모에서 제외하되, 전체 면적 충돌 검사에서는 제외하지 않는다.

### 8.4 Claim 카탈로그

| ID | 주장 | 핵심 전제 | 외부 라벨 |
|---|---|---|---|
| RR-C01 | 매도인 제시 월세 합계 | 행 존재, 월세 coverage≥80%, 합계충돌 없음, 기준일 존재 | 매도인 제시 현행 월세 |
| RR-C02 | 계약상 월세 합계 | RR-C01 + 계약증거 coverage≥80%, 통합계약 배분 완료 | 계약확인 월세 |
| RR-C03 | 실제 수납 월세 합계 | 수납증거 coverage≥80%, 기간 명시, 연체 분리 | 최근 수납확인 월세 |
| RR-C04 | 보증금 합계 | 보증금 coverage≥80%, 충돌 없음 | 제시/계약확인 basis 표시 |
| RR-C05 | 공실률 | 사용상태 coverage 100%, 자가사용 분리, 면적분모 확인 | 면적/호실 기준 공실률 |
| RR-C06 | 면적당 임대료 | 월세와 면적 coverage≥90%, 면적대조, 통합계약 배분 | 임대면적 ㎡·평 기준 |
| RR-C07 | 만기 스케줄 | 계약기간 coverage≥95%, 최대 임차인 기간 확인 | 계약확인 만기 일정 |
| RR-C08 | WALE | RR-C07 + 가중 basis 확정 | 임대료/면적 가중 WALE |
| RR-C09 | 관리비 청구합계 | 관리비 coverage≥80%, 청구 basis 확인 | 월 관리비 청구액 |
| RR-C10 | 관리비 순수익 | 청구·수납·관련지출 모두 확인 | 관리비 순효과 |
| RR-C11 | 단순 Gross Yield | 허용 월세 Claim + 매매가 + basis + 신선도·만기 정책 | 분자·분모를 제목에 명시 |
| RR-C12 | EGI | 임대수입 + 실제/승인 공실·연체 + 기타수입 | 유효총수입 |
| RR-C13 | NOI | RR-C12 + 최근 12개월 실제 OPEX + 누락항목 점검 | 순영업소득 |
| RR-C14 | Cap Rate | RR-C13 + 매매가 basis | 현재 NOI 기준 Cap Rate |
| RR-C15 | 안정화 시나리오 | 승인 Assumption + 액션·기간·비용·위험 | 분석가정 시나리오 |

### 8.5 Gross Yield 명칭과 공식

`Gross Yield`라는 단일 라벨을 금지한다. 다음 중 실제 산식을 제목에 표시한다.

```text
호가기준 단순 임대수익률
= 연 계약상 기본임대료(VAT·관리비 제외) / 매도 희망가

보증금차감 호가기준 단순 임대수익률
= 연 계약상 기본임대료(VAT·관리비 제외)
  / (매도 희망가 - 승계 보증금)
```

- 매도인 제시액만 있으면 ‘계약상’ 대신 `매도인 제시 현행 월세 기준`으로 표시한다.
- 보증금 차감 여부, VAT, 관리비, 자가사용, 공실, 연체의 처리방식을 각주에 표시한다.
- 관리비는 순수익이 확인되기 전 분자에 넣지 않는다.
- 분모가 0 이하이거나 보증금 승계범위가 불명확하면 보증금차감 수익률을 차단한다.

### 8.6 만료계약 처리

D51의 ‘만료계약 임대료 10%’는 유용한 경고규칙이지만 단일 진실규칙으로 사용하지 않는다.

| 상태 | 허용 |
|---|---|
| 만료 없음 | 일반 Claim 규칙 적용 |
| 만료 후 점유·현재납부가 확인됨 | 매도인 제시/수납 basis Claim 허용, 계약상 만기·WALE는 제한 |
| 만료 미확인 비중 0% 초과~10% | 단순수익률은 경고부 허용 가능, 해당 금액과 영향을 공개 |
| 만료 미확인 비중 >10% | 현재 수입·수익률 차단, 재확인 우선과제 |
| 최대 임차인이 만료 미확인 | 비중과 무관하게 만기·안정성·시나리오 차단 |

임계값은 정책버전으로 관리하며 실물 표본 검증 후 조정한다.

---

## 9. 중개인 의견과 분석가정의 안전한 연결

### 9.1 세 객체를 분리한다

| 객체 | 의미 | 계산 사용 |
|---|---|:---:|
| BrokerOpinion | 중개인의 시장 판단 | 금지 |
| AssumptionProposal | 의견·사례에서 도출한 가정 후보 | 금지 |
| ApprovedAssumption | 사람에게 승인된 시나리오 입력 | 시나리오에서만 허용 |

의견이 사실 계산으로 직접 흘러가는 길은 없다. 다만 중개인이 의도적으로 승인한 가정은 사실 KPI와 물리적으로 분리된 시나리오 계산에 사용할 수 있다.

### 9.2 BrokerOpinion 필수항목

- 화자와 소속
- 작성일·유효범위·대상범위
- 관찰 또는 판단
- 셀 수 있거나 식별 가능한 근거
- 값이 있으면 범위
- 반증조건 또는 철회조건
- 업역상 전문가 확인 필요 여부
- 공개 가능 여부

### 9.3 가정 승인 규칙

```text
BrokerOpinion
  → AssumptionProposal(low, base, high, evidenceRefs, reason)
  → H-B05 중개인 승인
  → ApprovedAssumption(version, approver, approvedAt)
  → Scenario Calculator
  → Scenario Claim(label="분석가정", factKpi=false)
```

외부 의견 문장은 범위를 기본으로 쓴다. Base 값이 필요한 계산은 Low/Base/High와 민감도를 함께 표시하고, 단일 값만 전면에 내세우지 않는다.

### 9.4 Action Card 최소구조

| 항목 | 필수조건 |
|---|---|
| 대상 | 필지·층·호·설비 등 구체 객체 |
| 현재상태 | 허용 Fact 또는 명시된 Opinion |
| 행위 | 누가 무엇을 하는가 |
| 선행조건 | 계약, 공실, 동의, 전문가 검토 |
| 기간 | 범위와 시작조건 |
| 비용 | 견적·승인가정·미확인 구분 |
| 효과 | 정성 또는 승인 시나리오 값 |
| 위험·철회조건 | 무엇이 틀리면 중단하는가 |
| 책임자·다음행동 | 자료요청, 실사, 협상 |

OPEX가 없으면 `stabilizedNOI`를 필수로 요구하지 않는다. 정성적 임대정비·마케팅 액션도 유효하다.

---

## 10. Claim 엔진과 발행등급 판정

### 10.1 Claim 상태

```text
not_applicable      자산형태·거래범위·렌즈상 해당 없음
allowed             전제 충족
allowed_with_warning 전제는 충족하나 공개할 한계 존재
blocked             필수 전제 미충족 또는 중대한 충돌
not_evaluated       엔진 미실행·정의 누락
```

`blocked=[]`와 `not_evaluated`는 절대 같은 결과가 아니다.

### 10.2 ClaimDefinition

각 Claim은 다음을 정본으로 가진다.

```yaml
id: RR-C11-ASKING-GROSS-YIELD
version: 1.0.0
appliesWhen:
  transactionScopes: [real_estate_only, real_estate_plus_business]
  assetPredicate: "asset.hasLeasableSpace && !asset.fullyOwnerOccupied"
modulePriorityWhen:
  lensesAny: [yield, value_add]
requires:
  all: [RR-C02, TX-C01-ASKING-PRICE]
  predicates:
    - rentroll.freshness in [current, aging]
    - conflicts.material == 0
formula: annualContractRentExVat / askingPrice
label: 호가기준 단순 임대수익률
warningRules:
  - expiredUnverifiedRentShare > 0
blockRules:
  - expiredUnverifiedRentShare > 0.10
outputFields: [value, numerator, denominator, basis, asOf, evidenceRefs]
```

### 10.3 발행은 ‘전체 Claim의 최솟값’이 아니라 필수 묶음으로 판정한다

| 등급 | 공통 필수 ClaimBundle | 형태·범위·렌즈 추가조건 |
|---|---|---|
| L1 Fact OM | 매각범위, 가격, 핵심 공부, 현장/사진 상태, 기준일, 출처, 위험·미확인 | 분석 Claim 불필요 |
| L2 Goldilocks OM | L1 + 현재 사용/임대상태 또는 N/A + 가격 basis + 시장근거/의견 + 결정스냅숏 + DD | AssetForm 필수모듈 충족, `yield`면 RR-C01 또는 임대 N/A, `redevelop`이면 이론검토 경고 |
| L3 Broker Analysis IM | L2 + 활성 렌즈 핵심분석 2개 이상 + 비교사례 품질 + Action Card + 승인 시나리오 또는 명시적 불가사유 | NOI는 필수 아님; 허용될 때만 포함, Buyer 전용 분석은 BuyerMandate 필요 |
| L4 Expert Collaboration | L3 + 거래결정에 중대한 전문 Claim별 reviewer approval | 전문가 한 명의 포괄승인 금지 |

### 10.4 렌즈·거래범위별 현실적 상한

| 렌즈·범위 | L2 표준 내용 | L3 추가 내용 | 전문가 이관 조건 |
|---|---|---|---|
| `yield` | 현 임대현황, 명시형 단순수익, 시장 포지션 | 만기, 임대단가, 안정성, 비교그리드 | 임대차 분쟁, 세후·정밀가치 |
| `value_add` | 공실·저활용·시장격차와 개선가설 | 원인분석, 액션·비용·기간·Downside | 구조변경, 대규모 CAPEX, 용도변경 |
| `own_use` | 일반 공간·접근·주차·명도 가능성 | BuyerMandate 기반 적합성·Buy/Lease | 설비용량·적법성·세무가 핵심 |
| `redevelop` | 필지·규제·도로·이론상한, 상품 가설 | 토지/Exit 사례, 단순 스트레스 | 실제 건축가능규모·인허가·공사비 확정 |
| `real_estate_plus_business` | 매도인 제공 운영현황과 부동산/사업 경계 | 기간자료·KPI·정상화 가정·손익분기 | 회계정상화·영업권·인허가 승계가 핵심 |
| `short_hold BuyerMandate` | 외부 공개 OM에는 미적용 | 권리·총원가·보유기간·Exit 검증 시 제한 | 분쟁·명도·세후수익·금융확약 |

### 10.5 발행등급 resolver 의사코드

```text
if identityCriticalUnknown or piiFailure or releaseApprovalMissing:
    return L0

effective = materializeApprovedSnapshot()
context = resolveContext(
    assetForm,
    transactionScope,
    evidenceProfile,
    approvedInvestmentLenses,
    buyerMandate
)
claims = evaluateApplicableClaimGraph(effective, context)

for tier in [L4, L3, L2, L1]:
    bundle = composeRequiredBundle(tier, context)
    if bundle.requiredClaims all allowed-or-warning
       and bundle.prohibitedClaims absent
       and bundle.gates pass:
        return tier

return L0
```

Source Profile, AssetForm, Lens는 resolver의 해당성과 묶음 구성을 돕지만 어느 것도 단독으로 tier를 반환하지 않는다.

---

## 11. 실무 워크플로와 HITL

### 11.1 12단계 표준 흐름

| 단계 | 시스템 | 중개인 | 산출 |
|---:|---|---|---|
| 1 | 주소·파일 수집 | 딜 생성 | Raw Intake |
| 2 | PNU·필지·건물·AssetForm 후보 | 매각범위·형태 승인 | AssetScope + AssetForm |
| 3 | 공부·공공자료 조회 | 조회실패·대상 확인 | S-A Observations |
| 4 | 렌트롤·표·PPT 추출 | 매도인 진술 구분 | S-C/S-D Observations |
| 5 | 단위·합계 정규화 | — | Normalization |
| 6 | 면적·가격·임대·기준일 충돌 | 정정·추가자료 승인 | Correction Ledger |
| 7 | 현장 질문·사진 체크 | 관찰 입력·공개 승인 | S-B Evidence |
| 8 | 비교후보·Lens 후보·시장질문 생성 | 사례·Lens·의견 승인 | S-E + LensDecision + Opinion |
| 9 | 유효 스냅숏·Context·Claim 평가 | 가정·BuyerMandate 승인 | Claims + Assumptions |
| 10 | 현재 tier·보완효과 계산 | 발행/보완 선택 | ReleaseDecision |
| 11 | 섹션 조립·렌더·QA | 문구·마스킹 확인 | Release Candidate |
| 12 | 불변 버전 저장 | 최종승인 | Published OM/IM |

### 11.2 중개인에게 요구할 최소 행동

D51의 ‘B·E만 요구’는 다음처럼 수정한다.

1. 매각대상 필지·건물 확인
2. 현장사진과 실제 사용·공실 확인
3. 매도인 렌트롤·가격·일정의 기준일 확인
4. 시장의견 또는 비교사례 승인
5. 위험·미확인·공개범위를 포함한 발행 승인

공부 필드를 다시 타이핑하게 하지는 않는다. 자동조회 결과가 어느 물건에 해당하는지는 확인하게 한다.

### 11.3 보완 우선순위

긴 결손목록 대신 다음 순서로 최대 3개만 전면 제시한다.

1. P0 위험 또는 중대한 오표현을 해소하는 항목
2. 현재 목표 tier의 필수 Claim을 가장 많이 여는 항목
3. 매수자의 핵심 질문에 가장 큰 영향을 주는 항목

정렬용 점수는 진실 판정에 사용하지 않는다.

```text
unlockValue
= Σ(unlockedClaim buyerImportance × sectionImpact)
  / effortCost
```

화면에는 `현재 가능한 산출`, `한 항목의 직접효과`, `목표 tier 최소조합`, `담당자`, `예상 노력`을 같이 표시한다.

### 11.4 자료요청 패킷

시스템은 결손코드를 사람말로 바꾸어 담당자별 요청서를 만든다.

- 매도인: 기준일 있는 최신 렌트롤, 계약 변경내역, 공실·연체, 관리비 처리
- 중개인: 매각범위 확인, 층별 실제사용, 사진, 시장사례, 의견
- 거래단계: 계약서·수납·OPEX·권리문서
- 전문가: 특정 쟁점과 필요한 답의 범위

‘전체 계약서 주세요’보다 ‘현재 월세 2,964만원과 요약 3,049만원 중 어느 값이 기준일 현재 유효한지 확인해 주세요’처럼 충돌 단위로 요청한다.

---

## 12. 구현용 핵심 스키마

### 12.1 Observation

```yaml
observationId: OBS-20260830-0001
dealId: DEAL-001
domain: D-RR
subjectPath: rentRoll.rows[3].monthlyBaseRent
value: 3200000
unit: KRW_PER_MONTH
basis: EXCL_VAT_EXCL_MGMT
sourceChannel: S-C
evidenceRef:
  artifactId: ART-003
  locator: "sheet=임대현황,row=7,col=월세"
asOf: 2026-08-30
retrievedAt: 2026-08-30T10:20:00+09:00
observedBy: broker-017
rawValue: "320만원"
status: active
```

### 12.2 Conflict와 CorrectionEvent

```yaml
conflictId: CON-RR-001
subjectPath: rentRoll.summary.monthlyRent
observationIds: [OBS-SUMMARY-01, OBS-ROWSUM-01]
values: [30490000, 29640000]
severity: material
status: open
dependentClaimIds: [RR-C01, RR-C11]

correctionId: COR-RR-001
type: CR2
conflictId: CON-RR-001
decision: adopt
adoptedObservationId: OBS-ROWSUM-02
reason: "매도인 2026-08-30 재확인 및 수정 렌트롤 수령"
evidenceRefs: [ART-009]
approvedBy: broker-017
approvedAt: 2026-08-30T15:00:00+09:00
```

### 12.3 ClaimEvaluation

```yaml
claimId: RR-C11-ASKING-GROSS-YIELD
definitionVersion: 1.0.0
snapshotId: SNAP-001-R3
applicability: applicable
status: allowed_with_warning
value: 0.0358
displayValue: "3.58%"
label: "매도인 제시 현행 월세·호가기준 단순수익률"
formulaId: FY-GROSS-ASKING-01
inputs:
  annualRent: { value: 355680000, claimId: RR-C01 }
  askingPrice: { value: 9930000000, claimId: TX-C01 }
warnings: ["만료 미확인 임대료 6.2% 포함"]
evidenceRefs: [OBS-ROWSUM-02, OBS-ASK-01]
evaluatedAt: 2026-08-30T15:01:00+09:00
```

### 12.4 Opinion과 Assumption

```yaml
opinionId: OPN-001
speaker: { brokerId: broker-017, office: "..." }
scope: "1층 신규 임대, 대상 반경 500m, 향후 12개월"
statement: "현 임대료보다 높은 범위에서 신규 협상이 가능할 것으로 봄"
range: { low: 92000, high: 105000, unit: KRW_PER_SQM_MONTH }
evidenceRefs: [COMP-01, COMP-02, COMP-03]
falsifier: "마케팅 6개월 후 유효문의가 없거나 동일권역 체결단가가 하단 미만"
asOf: 2026-08-30
publicApproved: true

assumptionId: ASM-001
originOpinionId: OPN-001
scenarioOnly: true
low: 92000
base: 98000
high: 105000
approvedBy: broker-017
approvedAt: 2026-08-30T16:00:00+09:00
```

### 12.5 PublicationManifest

```yaml
publicationId: PUB-001-R1
dealId: DEAL-001
snapshotId: SNAP-001-R3
releaseTier: L2
edition: goldilocks_om
context:
  assetForm: neighborhood_building
  transactionScope: real_estate_only
  investmentLenses: [yield, value_add]
  buyerMandateId: null
claimDefinitionSet: claims-1.0.0
policySet: korea-small-cre-1.0.0
sectionBlueprint: neighborhood-yield-valueadd-1.0.0
gateReportId: GATE-001
approvedBy: broker-017
approvedAt: 2026-08-30T17:00:00+09:00
artifactHashes:
  pptx: "sha256:..."
  pdf: "sha256:..."
```

---

## 13. 게이트와 감사기록

### 13.1 게이트 효과

| 효과 | 의미 | 예 |
|---|---|---|
| BLOCK_RELEASE | 외부 발행 전체 차단 | 매각대상 불명, PII 노출, 최종승인 없음 |
| DOWNGRADE | 상위 tier만 차단 | 렌트롤 충돌로 L2/L3 불가, L1 가능 |
| BLOCK_CLAIM | 특정 계산·서술 차단 | OPEX 없어 NOI 차단 |
| WARN | 주장 허용하되 한계 공개 | 소액 만료 미확인 포함 |
| PASS | 실행 및 전제 충족 | 관측·규칙·입력기록 존재 |
| NOT_RUN | 게이트 미실행 | PASS로 간주 금지 |

### 13.2 GateDecision 필수기록

```yaml
gateId: G-RR-EXPIRY-01
ruleVersion: 1.1.0
status: BLOCK_CLAIM
observed:
  expiredUnverifiedRentShare: 0.37
evaluatedPredicates:
  - expression: "expiredUnverifiedRentShare > 0.10"
    result: true
counterfactual:
  wouldAllowIf: "expiredUnverifiedRentShare <= 0.10 or currentPaymentCoverage >= 0.80"
inputs:
  snapshotId: SNAP-001-R2
  claimIds: [RR-C01]
  observationIds: [OBS-...]
fallbackUsed: false
override: null
evaluatedAt: 2026-08-30T15:10:00+09:00
```

`would_flip_if`는 고위험·주장 게이트에 유지하되 형식·렌더 게이트에는 실패 predicate와 기대값을 기록한다. 모든 게이트는 `ruleVersion`, `status`, `inputs`, `observed`, `evaluatedPredicates`, `fallbackUsed`를 가져야 한다.

### 13.3 P0 외부 발행 차단

- 대상 필지·건물·가격 단위가 불명
- 대표 필지 자료를 전체 필지 사실로 전파
- 핵심 금액·면적의 중대한 충돌이 열린 상태에서 해당 값을 사용
- Gross Yield를 NOI Cap Rate로 표기
- 관리비 청구액을 순수익으로 합산
- 채권최고액을 대출잔액으로 표기
- 개발 이론상한을 실제 건축 가능규모로 표기
- 매도인 진술을 계약서 확인으로 표기
- LLM이 만든 숫자를 계산 근거로 사용
- 임차인 PII·계약서·연락처·번호판 등의 공개정책 위반
- 문서 내 동일 KPI의 값·단위·기준일 불일치
- 중개인 최종승인 또는 게이트 실행기록 없음

### 13.4 단계 간 무결성

각 단계는 입력·출력 digest를 저장한다. 다음 단계가 받은 digest를 재계산하여 다르면 발행을 차단한다. 타임아웃, 빈 응답, fallback, 수동 override, 일부 skip은 정상 로그와 별도 필드로 기록한다.

### 13.5 기존 포스처 게이트 26개의 재분류

D49의 ‘게이트를 버리지 않고 새 축에 재부착’은 다음 방식으로 수정한다. 게이트는 축에 직접 붙이지 않고 **보호하려는 불변식·Claim·공개정책**에 붙인다.

| 재분류 | 적용대상 | 예 |
|---|---|---|
| Global Invariant | 모든 자산·문서 | 단위, 기준일, 주소, PII, 동일 KPI |
| Domain Gate | 정보영역 | 렌트롤 합계, Parcel coverage, 권리표현 |
| Claim Gate | 특정 계산·서술 | NOI, WALE, 이론 개발규모 |
| Form Applicability | Claim 해당성 결정 | 집합건물 대지권, 나대지 렌트롤 N/A |
| Scope/Disclosure Gate | 거래·공개범위 | 사업손익, 매도사유, 지분거래 |
| Lens Module Gate | 선택 모듈 진입 | value_add Action Card, own_use Buy/Lease |

마이그레이션 절차:

1. 26개 게이트마다 보호 대상 Claim 또는 불변식을 적는다.
2. 보호대상이 없고 posture 문자열만 검사하면 근거 없는 게이트 후보로 표시한다.
3. 적용대상이 자산형태에 따라 달라질 때만 Form Applicability를 둔다.
4. Lens는 게이트를 완화하지 않고 모듈의 해당성만 만든다.
5. legacy와 신규 게이트 결과를 shadow 비교하고 차이의 이유를 승인한다.

---

## 14. 섹션 조립과 페이지 블루프린트

### 14.1 페이지 계약

모든 페이지는 다음 다섯 요소를 가진다.

1. 매수자가 답을 얻을 질문 한 개
2. 한 문장의 핵심 결론 또는 ‘현재 판단 불가’
3. 결론을 지지하는 표·지도·사진·계산 한 개
4. 출처·기준일·basis
5. 다음 확인 또는 의사결정 행동

자료가 없으면 빈 페이지를 만들지 않는다. 차단사유는 Evidence Status와 DD/확인사항에 합친다.

### 14.2 공통 모듈

| 모듈 | L1 | L2 | L3 | 생성조건 |
|---|:---:|:---:|:---:|---|
| Cover | ● | ● | ● | 매각범위·주소 허가 |
| Decision Snapshot | 축약 | ● | ● | 허용 Claim만 사용 |
| Evidence Status | ● | ● | ● | 항상 |
| Asset Scope·공부 | ● | ● | ● | D-ID 허가 |
| Parcel·Building Detail | 선택 | ● | ● | H2 또는 다필지 |
| Location·Access | ● | ● | ● | 지도·거리 basis 표시 |
| Use/Rent Status | 선택 | ● | ● | 해당성에 따라 |
| Income/Price Basis | — | 조건부 | ● | Claim 허가 시 |
| Market Position | — | 의견 또는 사례 | 조정 비교그리드 | D-MK 상태에 따라 |
| Broker Opinion | — | 1~2건 | 구조화 다수 | 공개승인 의견만 |
| Action Card·Scenario | — | 선택 | ● | 승인 가정 또는 정성 액션 |
| Risk·Unknown·DD | ● | ● | ● | 차단 Claim 자동 연결 |
| Contact·Disclosure | ● | ● | ● | 항상 |

### 14.3 `yield/value_add` 중심 근생빌딩 권장 시퀀스

**L1 Fact OM 7~9면**

1. 표지
2. 핵심 제원·매각조건
3. 매각범위·공부
4. 입지·접근
5. 현재 사용·임대현황 사실
6. 현장사진
7. 위험·확인사항·출처
8. 연락처·면책

**L2 Goldilocks OM 10~14면**

1. 표지
2. 매수검토 스냅숏
3. 증거·기준일·확인상태
4. 매각범위·필지·건물
5. 입지·시장 맥락
6. 층별 사용·임대현황
7. 허용된 임대수입·단순수익률
8. 가격 포지션
9. 중개인 의견·매수자 소구점
10. 핵심 위험·반론
11. 추가자료·현장·LOI 확인조건
12. 사진·연락처·면책

**L3 Broker Analysis IM 14~18면**은 L2에 만기, 임대단가 비교, 조정된 비교사례, Action Card, 승인 시나리오, Downside를 추가한다. OPEX가 없으면 NOI·Cap Rate 페이지를 넣지 않는다.

### 14.4 형태·렌즈·거래범위별 모듈 조립

| 조건 | L2 핵심 모듈 | L3 핵심 모듈 |
|---|---|---|
| `assetForm=strata_unit` | 전유·공용·대지권·관리현황 | 집합건물 비용·권리·비교사례 |
| `assetForm=vacant_land` | ParcelSet, 도로·규제, 현장 | 토지·Exit 비교, 승인된 개발 스크리닝 |
| `lens=own_use` | 공간·접근·주차·현 사용성 | BuyerMandate 기반 Buy/Lease 승인 가정 비교 |
| `lens=value_add` | 현 임대·공실·저활용과 시장격차 | Action Card, 비용·기간·시나리오·Downside |
| `lens=redevelop` | ParcelSet, 도로·규제, 이론상한, 기존 점유 | 토지·Exit 비교, 상품가설, 비용·기간 스트레스 |
| `transactionScope=real_estate_plus_business` | 자료범위, 부동산/사업 경계, 매도인 제공 KPI | 월별 추이, 정상화 가정, 손익분기, 운영의존 위험 |
| `buyerMandate.strategy=short_hold` | 공개 OM에는 추가하지 않음 | 권리·총원가·Carry·Exit가 모두 허가될 때 제한 분석 |

---

## 15. 작성 방법론

### 15.1 문장 생성 순서

```text
허용된 Fact/Claim
→ 그 사실이 매수자에게 갖는 의미
→ 성립조건·반론
→ 다음 확인 또는 행동
```

예시:

> 매도인 제시 기준 월 임대료는 2,964만원이며 호실별 합계와 일치합니다. 다만 기준일 이후 만료된 계약의 임대료 비중이 37%여서 현재 수입으로 단정하지 않았습니다. 갱신·묵시갱신·최근 수납을 확인하면 단순수익률 분석을 다시 열 수 있습니다.

### 15.2 숫자 표기 규칙

- 모든 핵심 숫자는 값, 단위, basis, 기준일, 출처를 가진다.
- 원/만원/억원과 ㎡/평 변환은 중앙 계산 Registry에서 한 번만 한다.
- 평당가는 토지·연면적·임대면적 중 분모를 제목에 쓴다.
- 매매가, 보증금, 월세, 관리비, VAT는 서로 다른 필드다.
- 현재·계약·수납·정상화 숫자를 색이나 위치만으로 구분하지 않고 텍스트 라벨을 붙인다.
- 범위의 중간값을 쓸 때는 `Base 가정`이라고 표시한다.

### 15.3 가격 포지션

가격을 한 점의 적정가로 확정하지 않는다. 다음을 병렬로 제시한다.

- 매도 희망가와 협상조건
- 토지 또는 연면적 평당가 basis
- 식별된 매매 비교사례 범위
- 허용된 수익기준 지표
- 중개인 의견 범위와 반증조건
- 범위가 성립하지 않는 경우

비교사례의 최소 품질 필드는 `대상 식별`, `거래/호가 구분`, `기준시점`, `면적 basis`, `입지·용도·연식`, `채택/제외 이유`, `조정 여부`다.

### 15.4 위험과 DD

위험은 일반론이 아니라 Claim·Conflict·Action과 연결한다.

```text
위험 사실/미확인
→ 가격·수입·일정에 미치는 영향
→ 확인할 자료 또는 현장점검
→ LOI/계약 조건에 반영할 방법
→ 담당자와 기한
```

---

## 16. 실제 표본에 적용한 판정 예

이 절의 수치는 기존 표본에서 관측된 충돌을 설명하기 위한 테스트 케이스이며 최신 실매물 사실을 확정하는 내용이 아니다.

### 16.1 당산동

권장 Context 후보는 `AssetForm=neighborhood_building`, `Lenses=[yield, value_add]`이며 자가사용층과 만기집중 때문에 `own_use`도 후보로 남긴다. 불특정 매수자용 OM에서는 BuyerMandate가 없으므로 Buy/Lease 계산은 만들지 않는다.

| 관측 | 판정 | 시스템 조치 |
|---|---|---|
| 층별 연면적 합계와 요약 면적 차이 약 300㎡ | D-BL material conflict | 해당 면적·평당가·임대단가 차단, CR1/CR3 확인 |
| 과거 기준일과 다수 만료계약 | D-RR stale/expired | 현재수입·Gross Yield 차단 또는 과거기준 라벨 |
| OPEX 없음 | 정상 D0 | NOI·Cap만 차단, 문서 전체 결손으로 보지 않음 |
| 시장정보 E0 | 중개인 부가가치 누락 | 비교후보 또는 구조화 의견 1건을 최우선 요청 |

현재는 L1 Fact OM이 안전하다. 면적 충돌을 해소하고 최신 렌트롤 기준일·현재 점유를 확인하며 E1 의견을 승인하면 L2 Goldilocks OM으로 승급한다. `value_add` 렌즈는 현 수익률을 미화하지 않고 만기·공실·시장임대료 격차를 확인할 질문과 Action Card를 우선시한다. 12개월 OPEX가 없으면 L3에서도 NOI를 만들지 않는다.

### 16.2 상도동

| 관측 | 판정 | 시스템 조치 |
|---|---|---|
| 요약 월세 3,049만원 vs 행합계 2,964만원 | CR2 material | RR-C01과 모든 종속 수익률 차단 |
| 관리비 잉여 45만원 vs 공란/0 | blank≠zero, 경제조건 충돌 | 청구·수납·지출 분리 후 RR-C09/10 재평가 |
| 만료 계약 다수 | expired_unverified | 현재 점유·수납 확인 요청 |
| 위반건축물 해당 | 중대 위험 Fact | 스냅숏·위험·DD에 국소 표시, 적법성 결론 금지 |
| 78억 채권최고 | 권리 Fact | ‘대출잔액’ 표현 금지, 등기상 채권최고액으로만 표시 |

월세 충돌이 해소되기 전에는 L1이 상한이다. 위반건축물은 문서 전체를 자동 폐기하는 것이 아니라 매수판단에 영향·확인자료·전문가 이관조건을 명확히 만드는 요인이다.

### 16.3 양평동 다필지

권장 Context 후보는 실제 공부상 용도를 확인한 `AssetForm`과 `Lenses=[yield, value_add]`다. 다필지라는 사실은 Lens가 아니라 AssetScope·ParcelSet의 핵심 구조다.

| 관측 | 판정 | 시스템 조치 |
|---|---|---|
| 3필지 총 518.7㎡ 제시, 대표필지 자료만 확인 | Parcel coverage 부족 | 대표필지 용도지역·공시지가의 전체 전파 금지 |
| 건축물대장 대지면적이 총면적과 유사 | 건물-필지 연결 후보 | 관련지번 공식 연결 확인 전 현재 FAR 분모 확정 금지 |
| 표지 행정구 오기 | D-ID critical presentation conflict | 표지·본문 주소 중앙 바인딩, 발행 차단 |
| 월세·보증금·관리비·면적 충돌 | D-RR material | 임대수입 Claim 차단, 정정원장 요청 |

3개 PNU와 매각포함 여부, 필지별 면적·용도지역·도로·공시지가, 건축물 관련지번을 먼저 확정한다. 이 작업 전에는 ‘총 토지 평당가’ 외에도 통합 규제·가중 공시지가·개발여력 표현을 제한한다.

---

## 17. AI 에이전트와 결정론적 엔진의 역할

### 17.1 허용

| 구성요소 | 역할 | 출력상태 |
|---|---|---|
| Intake Agent | 파일 분류·표/문장 추출 후보 | draft observation |
| Identity Resolver | 주소·PNU·건물 후보와 모호성 | candidate, 사람 승인 전 미확정 |
| Public Data Worker | API 조회·원시응답 저장 | observation |
| Rent Roll Normalizer | 행 구조화·단위·날짜 후보 | draft normalization |
| Conflict Detector | 합계·단위·기준일·범위 모순 | conflict |
| Deterministic Calculator | 합계·단가·수익률·민감도 | calculation claim |
| Market Assistant | 비교후보·유사성 항목 수집 | draft comp |
| Strategy Assistant | 의견·액션·반론 후보 | draft opinion/action |
| Writer | 허용 Claim을 페이지 계약에 맞게 서술 | narrative draft |
| Artifact QA | 수치앵커·PII·오버플로·왜곡 검사 | gate events |

### 17.2 금지

- LLM이 빈 월세·OPEX·공사비·금리·공실률을 일반값으로 채우기
- 문장에서 숫자를 다시 파싱해 정본으로 삼기
- 합계가 다를 때 조용히 한 값을 선택하기
- 의견 범위를 Fact 테이블에 삽입하기
- 근거 없는 ‘우량’, ‘안전’, ‘확실’, ‘개발 가능’ 표현 만들기
- `hasRentRoll=true`만 보고 수익률 페이지 생성하기
- 면책문구가 있으므로 차단된 Claim을 포함하기

### 17.3 권한

AI는 CR0 제안과 비중대한 서식수정을 자동화할 수 있다. CR1~CR3, 매각범위, 비교사례 채택, 가정, 최종발행은 사람이 승인한다. 전문가 Claim은 자격·업무범위가 기록된 reviewer만 승인한다.

---

## 18. 테스트 전략과 품질 기준

### 18.1 테스트 피라미드

| 층 | 대상 | 필수 예 |
|---|---|---|
| T1 단위 | 변환·합계·공식·상태 | 빈칸/0, 원/만원, ㎡/평, VAT, 보증금 차감 |
| T2 규칙 | Claim·게이트 | OPEX 없음, 만료 9%/11%, 최대임차인 만료 |
| T3 도메인 | 다필지·정정·유효스냅숏 | 대표필지 전파 차단, superseded correction |
| T4 파이프라인 | 입력→발행 | L1/L2/L3 승급·강등, digest 불일치 |
| T5 산출물 | PPTX/PDF/모바일 | 동일 KPI, 출처각주, PII, overflow, DPI |
| T6 사람검수 | 중개인·매수자 | 입력가능성, 이해도, 다음행동 도출 |

### 18.2 필수 변종 세트

1. 요약 월세와 행합계 불일치
2. 관리비 공란을 0으로 변경
3. 관리비 청구액을 NOI에 더함
4. 채권최고액을 대출잔액으로 변경
5. 계약만기일을 과거로 이동
6. 기준일 제거
7. 자가사용 면적을 공실 분모에 삽입
8. 주차·기계실을 임대면적에 삽입
9. 통합계약을 호실별로 이중계상
10. 대표필지 용도지역을 전체에 복제
11. 매각제외 필지를 토지면적에 포함
12. 표지 주소와 본문 주소 변경
13. 보증금 차감 basis를 라벨에서 제거
14. LLM 생성 숫자를 계산 입력에 삽입
15. 게이트를 실행하지 않고 빈 `failed=[]` 반환
16. PII 마스킹 승인 제거
17. 유효 스냅숏 이후 원본을 변경
18. 의견값을 승인 없이 Base 시나리오에 삽입
19. 같은 자산에 `yield + value_add`를 함께 선택했을 때 한 렌즈를 덮어쓰기
20. `development` 마이그레이션 시 기존 건물을 `vacant_land`로 오분류
21. BuyerMandate 없이 Buy/Lease 또는 단기보유 결론 생성
22. InternalDealContext의 매도사유·협상하한을 외부 문서에 노출

각 변종은 기대하는 `BLOCK_RELEASE`, `DOWNGRADE`, `BLOCK_CLAIM`, `WARN`을 명시한다.

### 18.3 외부 발행 합격 기준

- 근거 없는 핵심 숫자 0건
- 열린 critical conflict를 사용한 페이지 0건
- 핵심 숫자의 snapshot·Claim·evidence 계보 100%
- 수익률의 분자·분모·basis·기준일 표시 100%
- PII 정책 위반 0건
- 동일 KPI 값·단위 불일치 0건
- 렌더 overflow·중대한 겹침·종횡비 왜곡 0건
- 필수 게이트 `NOT_RUN` 0건
- 중개인 발행승인 100%

`Golden`은 모든 데이터가 있는 문서만 뜻하지 않는다. **결손을 정확히 차단하고 정직하게 낮은 tier를 내는 문서도 Golden fixture**다.

### 18.4 제품 효과 KPI

| KPI | 파일럿 목표 |
|---|---:|
| 첫 L2 입력 중앙시간 | 매도인 대기 제외 60분 이하 |
| 반복 사용자의 L2 입력 중앙시간 | 35분 이하 |
| 공부 핵심필드 자동수집 성공 | 85% 이상, 실패는 명시적 수동경로 제공 |
| 발견된 material conflict 미처리 발행 | 0건 |
| 매수자 핵심 5문항 이해율 | 80% 이상 |
| 보완요청 후 Claim unlock 전환율 | 측정 후 기준선 대비 개선 |
| 중개인 수동 재입력 필드 | 기존 대비 50% 이상 감소 |

핵심 5문항은 `무엇을 사는가`, `얼마인가`, `현재 무엇이 확인됐나`, `무엇이 틀릴 수 있나`, `다음에 무엇을 확인하나`다.

---

## 19. 구현 순서

### Phase -1. 현행 배선·대조군 고정

**목표** 온톨로지 변경 전에 현재 시스템이 무엇을 실행하고 무엇을 놓치는지 재현한다.

- 입력→정규화→Claim→섹션→PPTX의 실제 호출경로 확인
- 현행 게이트의 `PASS/FAIL/NOT_RUN` 분리
- 당산·상도·양평 baseline fixture와 알려진 오답 고정
- 핵심 18개 변종의 기대 차단효과 정의
- 신규 Context evaluator를 production과 분리된 shadow mode로 준비

**종료조건** 같은 입력의 현행 결과를 반복 재현할 수 있고, 신규 구조가 바꾼 차이만 별도로 관찰할 수 있다.

### Phase 0. 용어·정본 동결

**목표** 서로 다른 문서의 grade, tier, provenance, source 용어 충돌 제거.

- S-A~S-F, D-ID~D-BJ, L0~L4 용어 승인
- 기존 `posture`를 AssetForm·TransactionScope·EvidenceProfile·InvestmentLens·BuyerMandate·InternalDealContext로 분해
- `land_or_teardown`을 `vacant_land` 형태와 `redevelop` 렌즈로 분리
- `operating`을 특수자산/사업포함 거래범위로, `trading`을 내부정보/BuyerMandate로 이동
- `expert_required`를 workflow status로 분리
- Gross Yield 2개 공식과 관리비·채권최고 표기정책 승인
- 기존 필드·코드 마이그레이션 맵 작성

**종료조건** 같은 용어가 UI·YAML·TypeScript·PPTX에서 하나의 뜻만 가진다.

### Phase 1. Identity·Observation·Correction 기반

- AssetScope, ParcelSet, BuildingSet
- Observation/EvidenceRef 원본 저장
- Normalization, Conflict, CorrectionEvent
- EffectiveSnapshot materializer
- 기준일·단위·blank/zero 공통 타입

**종료조건** 양평동 다필지와 당산동 면적충돌을 원본 훼손 없이 재현·차단한다.

### Phase 2. 임대·수익 Claim Engine

- Rent Roll V3 행상태·커버리지
- RR-C01~RR-C15
- 명시형 Gross Yield·NOI/Cap gate
- 만료·자가사용·관리비·수납 규칙
- Claim DAG와 block reason

**종료조건** 당산동·상도동 변종 테스트의 기대 판정이 100% 일치한다.

### Phase 3. Goldilocks OM 생성

- L1/L2 ClaimBundle resolver
- Evidence Status, Decision Snapshot, Risk/DD 자동조립
- BrokerOpinion·Assumption 승인 흐름
- HITL unlock 상위 3개
- PPTX·PDF·모바일 공통 PublicationManifest

**종료조건** 중개인 표준 입력으로 10~14면 L2를 생성하고 모든 핵심 숫자를 역추적한다.

### Phase 4. Broker Analysis IM과 형태·렌즈 확장

- L3 비교그리드·Action Card·Scenario
- AssetForm 판독기와 broker confirmation
- `value_add` 렌즈 우선 구현
- `own_use` + BuyerMandate
- `redevelop` + Parcel/Screening
- `real_estate_plus_business` + Seller-provided Review
- 쟁점별 Expert Handoff

**종료조건** 전문가 결론 없이 허용범위 안에서 L3를 생성하고, 이관 질문을 구체화한다.

### Phase 5. 파일럿·운영

- 실제 표본 최소 10건: 근생 4, 업무 1, 상가주택 2, 나대지 2, 구분상가 1; 특수용도·사업포함 거래는 별도 파일럿
- 복수 렌즈 중첩 검증: `yield` 5건, `value_add` 4건, `own_use` 2건, `redevelop` 2건 이상이며 한 표본의 중복계상 허용
- 정상·결손·충돌·변종 세트 동시 검수
- 중개인 입력시간과 매수자 이해도 측정
- 정책 임계값·페이지 조립 튜닝

**종료조건** §18.3 합격기준과 파일럿 KPI를 충족하거나, 미충족 항목의 차단·개선계획이 승인된다.

---

## 20. 정본 파일 제안

| 정본 | 역할 |
|---|---|
| `im.axes.yaml` | 6차원 Context의 코드·버전·하위 정본 참조를 묶는 최상위 registry |
| `im.asset_forms.yaml` | AssetForm 판독규칙·복합자산·확인정책 |
| `im.transaction_scopes.yaml` | 거래대상·사업포함·지분거래 범위 |
| `im.investment_lenses.yaml` | 복수 렌즈·후보조건·모듈 우선순위 |
| `im.buyer_mandates.yaml` | 특정 매수자 요구·전용 분석조건 |
| `im.internal_deal_context.yaml` | 매도사유·보유이력·협상정보 공개통제 |
| `im.source_channels.yaml` | S-A~S-F 수집경로·담당·요청정책 |
| `im.domains.yaml` | D-ID~D-BJ 필드·성숙도·해상도 |
| `im.field_authority.yaml` | 필드별 우선 증거와 충돌정책 |
| `im.freshness.yaml` | 영역·이벤트별 TTL |
| `im.corrections.yaml` | 정정유형·중요도·승인정책 |
| `im.parcel_claims.yaml` | 다필지·면적분모 Claim |
| `im.rentroll_claims.yaml` | RR-C01~RR-C15 |
| `im.lens_claims.yaml` | yield·value_add·own_use·redevelop 등 Lens Claim |
| `im.asset_family_claims.yaml` | 집합건물·특수용도·사업포함 거래 Claim |
| `im.opinions.yaml` | BrokerOpinion·금지표현·공개정책 |
| `im.assumptions.yaml` | 가정 승인·시나리오 격리정책 |
| `im.release_bundles.yaml` | L0~L4 Context별 필수·선택·금지 Claim 합성규칙 |
| `im.sections.yaml` | Claim 기반 섹션 트리거·페이지 계약 |
| `im.gates.yaml` | 차단·강등·경고·감사기록 |
| `im.disclosure.yaml` | 출처라벨·면책·PII·배포정책 |

YAML은 정책 정본, TypeScript/Python은 실행기, MD는 판단 근거다. 세 계층의 ID와 버전이 일치해야 하며 MD 문구를 런타임에서 파싱하지 않는다.

---

## 21. RACI

| 작업 | 시스템 | 중개인 | 매도인 | 전문가 | 제품/QA |
|---|:---:|:---:|:---:|:---:|:---:|
| 주소·PNU 후보 | R | A | I | — | C |
| 매각범위 확정 | C | A/R | C | — | I |
| AssetForm 확정 | R(후보) | A | I | 쟁점별 C | C |
| InvestmentLens 선택 | R(후보) | A/R | I | — | C |
| BuyerMandate 입력 | C | A/R | — | — | I |
| InternalDealContext 공개통제 | C | A/R | I | — | C |
| 공부 수집 | R | A(대상확인) | I | — | C |
| 임대 진술 | C | A(구조화) | R | — | I |
| 원본 계약·수납 | C | A(연결) | R | — | I |
| 현장 관찰 | C | A/R | I | — | I |
| 비교사례 채택 | C | A/R | I | — | C |
| 정정 CR1~CR3 | C | A | C/R | 쟁점별 C | I |
| BrokerOpinion | C | A/R | I | — | I |
| 전문 Claim | C | I | I | A/R | C |
| 발행 승인 | C | A/R | I | 범위별 C | I |
| 정책·게이트 | R | C | I | C | A |

`A`는 최종 책임, `R`은 수행, `C`는 협의, `I`는 통보 대상이다.

---

## 22. Definition of Done

### 22.1 방법론

- 수집경로와 정보영역이 코드·UI·문서에서 분리됐다.
- 자산형태·거래범위·자료상태·투자렌즈·매수자 요구·내부정보가 서로 다른 객체다.
- 하나의 자산에 여러 InvestmentLens를 적용할 수 있고, 렌즈 선택·근거·승인이 기록된다.
- `operating`과 `trading`이 더 이상 배타 포스처 값으로 쓰이지 않는다.
- 등급이 Claim을 직접 허가하지 않는다.
- 해당없음, 미확인, 0, 미실행이 서로 다른 상태다.
- 전문가 필요는 tier가 아니라 쟁점별 workflow 상태다.

### 22.2 데이터

- 모든 핵심값이 Observation과 EvidenceRef로 역추적된다.
- 원본은 불변이고 정정·업데이트·가정 이력이 분리된다.
- 하나의 발행본은 하나의 EffectiveSnapshot만 사용한다.
- 다필지 자산은 PNU별 커버리지와 면적분모가 검증된다.

### 22.3 계산·분석

- LLM은 수치 계산과 Claim 허가를 수행하지 않는다.
- Gross Yield·NOI·Cap Rate의 basis와 전제가 재현된다.
- Opinion은 직접 계산에 들어가지 않고 승인된 Assumption만 시나리오에 들어간다.
- 막힌 Claim은 원인·담당자·해제조건·열리는 섹션을 반환한다.

### 22.4 산출물

- L1/L2/L3가 고정 앞 N면이 아니라 Claim 기반 모듈로 조립된다.
- AssetForm은 기본 뼈대, TransactionScope는 거래경계, Lens는 선택 모듈 우선순위만 결정한다.
- Lens는 필수 사실·위험을 삭제하거나 Claim 게이트를 완화하지 않는다.
- BuyerMandate가 없는 공개 OM은 특정 매수자의 Buy/Lease·단기보유 결론을 만들지 않는다.
- 빈 페이지와 그럴듯한 fallback이 없다.
- 위험·확인사항이 실제 충돌·차단 Claim과 연결된다.
- PPTX·PDF·모바일의 핵심 숫자·기준일·출처가 동일하다.
- 불변 발행본과 승인·정책·게이트 버전이 보존된다.

### 22.5 운영

- 중개인은 공부를 재입력하지 않고 대상만 승인한다.
- 발행 전에 최대 3개의 고효율 보완과제를 이해할 수 있다.
- 실제 표본과 변종 테스트가 함께 회귀 실행된다.
- 중개인 작성시간과 매수자 이해도가 측정된다.

---

## 23. 최종 채택 지침

### 즉시 채택

- 중개인 도달 가능 수준을 제품 기준점으로 삼기
- 주장별 허가와 현재 가능한 문서 우선 발행
- 빈칸≠0, 관리비≠순수익, 채권최고≠대출잔액
- 의견의 화자·근거·범위·반증조건
- 게이트의 관측·규칙·입력·실행상태 기록

### 수정 후 채택

- A~F: 정보분류가 아니라 수집경로로 한정
- A 자동화: 100% 보장이 아니라 목표 SLO와 수동경로
- 의견 계산 방화벽: 승인 가정으로만 시나리오 연결
- 만료 10%: 점유·수납·최대임차인 조건을 포함한 정책으로 개선
- tier: source 조합이나 전체 최솟값이 아니라 Context별 ClaimBundle로 결정

### 폐기

- `hasX=true`만으로 섹션·수익률을 여는 방식
- source grade 또는 trustWeight 평균으로 진실을 판정하는 방식
- D2+F1 같은 단순 조합으로 decision_im을 여는 방식
- LLM 계산값과 문장 파싱값을 정본으로 쓰는 방식
- 대표 필지·대표 임차인·대표 사례를 전체 자산에 무표시 전파하는 방식

---

## 24. 한 문장 원칙

> **좋은 중개인형 OM/IM은 없는 자료를 전문가처럼 채운 문서가 아니라, 무엇을 사고 무엇이 확인됐으며 무엇이 아직 틀릴 수 있는지를 가장 짧고 재현 가능하게 보여 주는 문서다.**
