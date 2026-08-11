# 04. 온톨로지·데이터 품질·크로스-시스템 통합 — 프로덕션 E2E 테스트
> 문서 버전: v1.0 | 최종 수정: 2026-08-10
> 대상 환경: Production (https://cre-dealcard.vercel.app)
> 테스터 요구사항: 브로커 계정 (Pro 티어), 신규 가입 테스트용 이메일

본 문서는 CREDEAL 플랫폼의 핵심인 온톨로지 기반 SSoT 데이터 품질 검증과 전체 사용자 여정(E2E), 그리고 크로스 시스템 통합을 테스트하기 위한 시나리오를 정의합니다.

---

## E1. SSoT 스튜디오 편집 & 등급 실시간 계산

### 1. 테스트 목적 및 범위
빌딩 상세 페이지의 SSoT 스튜디오에서 슬롯 데이터를 편집할 때, 데이터 충실도 점수(ScorePct)와 데이터 등급(Grade)이 카테고리-슬롯 매핑(CATEGORY_SLOTS)에 따라 실시간으로 재계산되는지 검증합니다. 또한 최신성(Freshness decay - 등기 12개월, 대장 3개월, 렌트롤 6개월)이 올바르게 반영되는지 확인합니다.

### 2. 가상 테스트 데이터
```json
{
  "test_building_id": "TEST-STUDIO-001",
  "initial_state": {
    "building_name": "테스트 빌딩 A",
    "address_road": "서울시 마포구 양화로 100",
    "asset_type": "nbhd_building",
    "asking_price_krw": 6000000000,
    "grade": "C",
    "scorePct": 45,
    "filled_slots": ["building_name", "address", "asset_type", "asking_price", "year_built", "floors"],
    "missing_slots": ["gfa_m2", "land_area_m2", "rent_roll", "vacancy_rate", "cap_rate", "noi", "debt_info", "building_register", "deed_info"]
  },
  "step1_add_area": {
    "gfa_m2": 991.74,
    "land_area_m2": 264.46,
    "expected_grade": "C",
    "expected_scorePct": 52
  },
  "step2_add_rentroll": {
    "rent_roll": [
      { "floor": "1F", "tenant": "커피숍", "deposit": 30000000, "monthly": 2000000 },
      { "floor": "2F", "tenant": "미용실", "deposit": 20000000, "monthly": 1500000 },
      { "floor": "3F", "tenant": "사무실", "deposit": 20000000, "monthly": 1500000 }
    ],
    "vacancy_rate": 0,
    "expected_grade": "B",
    "expected_scorePct": 68
  },
  "step3_add_financials": {
    "cap_rate": 0.05,
    "noi_krw": 300000000,
    "debt_amount_krw": 3000000000,
    "expected_grade": "A",
    "expected_scorePct": 85
  }
}
```

### 3. 테스트 절차
**사전 조건**: Pro 티어 브로커 계정으로 로그인 후 `TEST-STUDIO-001` 빌딩 상세 페이지 접속
1. `/broker/buildings/{id}/studio` 페이지로 이동합니다.
2. 초기 상태의 등급(C)과 점수(45점)를 확인합니다.
3. [Step 1] '면적' 섹션에서 연면적(991.74)과 대지면적(264.46)을 입력하고 저장합니다.
4. [Step 2] '임대차' 섹션에서 1~3층 렌트롤 정보와 공실률(0%)을 입력하고 저장합니다.
5. [Step 3] '수익/금융' 섹션에서 캡레이트(5%), NOI(3억), 대출금액(30억)을 입력하고 저장합니다.
6. (선택) 등기부등본 업데이트 일자를 13개월 전으로 설정해 데이터 최신성 감가(Freshness decay)가 적용되어 점수가 하락하는지 확인합니다.

### 4. 기대 결과 및 API 호출 예시
* **Step 1 이후**: 점수가 52점으로 상승하며 등급은 'C' 유지
* **Step 2 이후**: 점수가 68점으로 상승하며 등급이 'B'로 변경
* **Step 3 이후**: 점수가 85점으로 상승하며 등급이 'A'로 변경
* API Payload:
  ```json
  // PATCH /api/buildings/TEST-STUDIO-001
  {
    "rent_roll": [ { "floor": "1F", "tenant": "커피숍", "deposit": 30000000, "monthly": 2000000 }, ... ],
    "vacancy_rate": 0
  }
  ```

### 5. 평가 기준
* **L1**: 데이터 입력 시 UI 멈춤 없이 서버 저장
* **L2**: 점수(ScorePct)가 즉시 재계산됨
* **L3**: 등급(Grade) 임계치 도달 시 뱃지 애니메이션과 함께 변경됨
* **L4**: 6개월 이상 된 렌트롤 데이터에 대해 최신성 경고 표시

### 6. 결과 기록표
| 항목 | 예상 결과 | 실제 결과 | Pass/Fail | 비고 (이슈 번호) |
|---|---|---|---|---|
| Step 1 (면적 추가) | 52점 / C등급 | | | |
| Step 2 (렌트롤 추가) | 68점 / B등급 | | | |
| Step 3 (수익 추가) | 85점 / A등급 | | | |
| 최신성 감가 검증 | 경고 노출 및 점수 차감 | | | |

---

## E2. 제약 조건 검증 규칙 C01~C22

### 1. 테스트 목적 및 범위
빌딩 데이터 입력 시 발생하는 물리적, 재무적 모순을 실시간으로 감지하고 severity 수준(error/warning/info)에 맞는 피드백을 제공하는지 검증합니다.

### 2. 가상 테스트 데이터
```json
[
  {
    "id": "CONSTRAINT-C02",
    "label": "용적률 한도 초과",
    "input": { "use_area": "제2종일반주거지역", "legal_far_limit": 200, "actual_far": 350 },
    "expected": { "rule": "C02", "severity": "error", "message": "실제 용적률(350%)이 법정 용적률(200%)을 초과합니다" }
  },
  {
    "id": "CONSTRAINT-C11",
    "label": "DCF Grade A 필수",
    "input": { "dataGrade": "B", "dcfRequested": true },
    "expected": { "rule": "C11", "severity": "error", "message": "DCF 분석은 Grade A 데이터에서만 수행 가능합니다" }
  },
  {
    "id": "CONSTRAINT-C13",
    "label": "주소 신뢰도 경고",
    "input": { "addressSource": "fallback", "addressConfidence": 0.65 },
    "expected": { "rule": "C13", "severity": "warning", "message": "주소 정보의 신뢰도가 낮습니다 (65%)" }
  },
  {
    "id": "CONSTRAINT-C15",
    "label": "환산보증금 불일치",
    "input": { "deposit_krw": 50000000, "monthly_rent_krw": 2000000, "stated_converted_deposit": 300000000 },
    "expected": { "rule": "C15", "severity": "info", "message": "환산보증금 불일치: 계산값 250,000,000원 vs 입력값 300,000,000원" }
  },
  {
    "id": "CONSTRAINT-LEVERAGE",
    "label": "레버리지 과다 경고",
    "input": { "asking_price_krw": 8000000000, "senior_debt_krw": 6000000000, "total_deposits_krw": 3500000000 },
    "expected": { "rule": "LEVERAGE", "severity": "warning", "message": "선순위 대출+보증금 합계가 매매가의 110%를 초과합니다" }
  }
]
```

### 3. 테스트 절차
**사전 조건**: 신규 매물 등록 화면 또는 SSoT 스튜디오 진입
1. C02 용적률 한도 초과: '제2종일반주거지역' 선택 후 실제 용적률을 350%로 입력합니다.
2. C11 DCF 분석 시도: Grade가 B인 상태에서 'DCF 분석 요청' 토글을 켭니다.
3. C15 환산보증금 불일치: 보증금 5,000만원, 월차임 200만원 입력 후, 기재된 환산보증금에 3억을 입력합니다.
4. LEVERAGE 과다: 매매가 80억, 대출 60억, 총보증금 35억을 입력합니다.

### 4. 기대 결과 및 평가 기준
* **L1**: 데이터 입력 즉시 제약 조건 로직이 실행됨
* **L2**: 각 케이스별로 지정된 severity 색상(Error=Red, Warning=Orange, Info=Blue) 배지가 표시됨
* **L3**: Error 발생 시 '저장' 버튼이 비활성화되거나, 강제 저장 시 에러 다이얼로그 표시됨
* **L4**: Info/Warning은 사용자 무시(Dismiss) 처리가 가능함

### 5. 결과 기록표
| 케이스 ID | 룰 ID | 기대 Severity | 실제 알림 UI 표시 (Pass/Fail) | 비고 |
|---|---|---|---|---|
| C02 | 법정 용적률 초과 | Error | | |
| C11 | DCF 등급 제한 | Error | | |
| C13 | 주소 신뢰도 | Warning | | |
| C15 | 환산보증금 불일치 | Info | | |
| LEV | 레버리지 과다 | Warning | | |

---

## E3. 공공 데이터 교차 검증

### 1. 테스트 목적 및 범위
입력된 데이터가 건축물대장 오픈 API(`GET /api/public/building-register`)의 내용과 일치하는지 대조하고, 오차 범위를 초과할 경우 불일치 경고를 노출하는지 확인합니다.

### 2. 가상 테스트 데이터
```json
{
  "test_cases": [
    {
      "id": "GOV-MATCH",
      "label": "정상 일치",
      "ai_parsed": { "gfa_m2": 1487.6, "mainPurpose": "제2종근린생활시설" },
      "gov_register": { "gfa_m2": 1490.2, "mainPurpose": "제2종근린생활시설" },
      "expected": "match"
    },
    {
      "id": "GOV-AREA-MISMATCH",
      "label": "면적 30% 초과 불일치",
      "ai_parsed": { "gfa_m2": 1000 },
      "gov_register": { "gfa_m2": 1500 },
      "expected": "mismatch",
      "mismatch_pct": 50
    },
    {
      "id": "GOV-USE-MISMATCH",
      "label": "용도 불일치",
      "ai_parsed": { "mainPurpose": "제1종근린생활시설" },
      "gov_register": { "mainPurpose": "제2종근린생활시설" },
      "expected": "mismatch"
    }
  ]
}
```

### 3. 테스트 절차
**사전 조건**: 공공 API 연동 모의(Mock) 서버가 설정되어 있거나, 실제 존재하는 주소 정보를 준비
1. 빌딩 상세에서 '건축물대장 연동 갱신' 버튼을 클릭합니다.
2. 시스템이 `GOV-AREA-MISMATCH` 사례처럼 AI 추출 연면적(1000)과 대장상 연면적(1500)을 대조하도록 테스트 데이터를 강제 주입합니다.
3. 용도 불일치(`GOV-USE-MISMATCH`) 사례를 테스트하기 위해 추출된 주용도를 수동 조작하여 재검증을 수행합니다.

### 4. 기대 결과 및 평가 기준
* **L1**: 공공 API 호출이 성공적으로 이루어짐(Fall-back 로직 작동 확인 포함)
* **L2**: 면적 오차가 임계치(30%) 이내인 경우 Match 처리됨 (예: 1487.6 vs 1490.2)
* **L3**: 면적 오차가 30% 초과 시 '면적 불일치 경고' UI 표시됨
* **L4**: 주용도 불일치 감지 시 스튜디오에서 사용자가 양측 데이터 중 하나를 채택할 수 있도록 유도함

### 5. 결과 기록표
| 테스트 항목 | 입력값 / API 응답 | 기대 결과 | 실제 결과 (Pass/Fail) | 비고 |
|---|---|---|---|---|
| 정상 일치 | 1487.6 / 1490.2 | Match (경고 없음) | | |
| 면적 30% 초과 | 1000 / 1500 | Mismatch Warning | | |
| 용도 불일치 | 제1종 / 제2종 | Mismatch Warning | | |
| API 실패 롤백 | Timeout 유도 | Fallback 유지 | | |

---

## F1. 온보딩 → 첫 딜카드 → IM → 매칭 (풀 저니 E2E)

### 1. 테스트 목적 및 범위
신규 가입한 사용자가 온보딩을 거쳐 첫 딜카드를 생성하고, 이를 기반으로 IM(Investment Memorandum)을 만든 후 매수자와 매칭되어 외부 공유하기까지의 10단계 핵심 여정을 결함 없이 완주할 수 있는지 확인합니다.

### 2. 가상 테스트 데이터
```json
{
  "new_user": {
    "email": "e2e-tester-{timestamp}@credeal-test.com",
    "password": "Test!2026Secure",
    "name": "테스트 중개인",
    "company": "(주)테스트부동산",
    "license_number": "12345-2026-67890",
    "region_focus": ["영등포구", "마포구"]
  },
  "first_memo": "마포구 합정동 근생빌딩 대지 90평 연면적 350평 5층 2010년 준공 월수입 2800만원 매도호가 65억",
  "expected_journey_steps": 10
}
```

### 3. 테스트 절차 (10단계 여정)
1. **Signup**: 제공된 이메일과 비밀번호로 회원가입 및 이메일 인증 진행
2. **Onboarding**: 중개인 프로필, 자격번호, 관심 지역(마포구) 설정
3. **Cockpit**: 콕핏(대시보드)에 진입하여 '새 딜카드 만들기' 클릭
4. **DealCard**: 가상 데이터의 `first_memo` 텍스트를 입력하고 AI(Sol 모델) 파싱을 요청
5. **Review**: 파싱된 데이터(매도호가 65억, 월수입 2800만원 등)가 스튜디오에 정상 입력되었는지 확인 후 승인
6. **IM Generation**: 생성된 딜카드에서 'IM 만들기' 클릭
7. **Approve**: 생성된 웹 IM 초안의 레이아웃을 확인하고 '최종 승인' 클릭
8. **PPTX Export**: 'PPTX 다운로드' 버튼을 클릭하여 파일 정상 다운로드 및 양식 깨짐 확인
9. **Match**: '매칭 찾기' 탭으로 이동, 마포구 60억대 매물을 찾는 가상 매수자 리스트가 뜨는지 확인
10. **Share / Public View**: IM 공유 링크를 생성하여, 비로그인 시크릿 창에서 정상 조회되는지 확인

### 4. 평가 기준
* **L1**: 여정 중간에 에러 페이지나 무한 로딩이 발생하지 않음
* **L2**: 자연어 메모(`first_memo`)에서 주요 파라미터 5개 이상 정확히 추출됨
* **L3**: 다운로드된 PPTX 파일이 오피스 프로그램에서 정상적으로 열림
* **L4**: Public View 링크가 토큰 인증과 함께 비로그인 환경에서 정상 렌더링됨

### 5. 결과 기록표
| Step | 단계 | 검증 포인트 | Pass/Fail | 비고 |
|---|---|---|---|---|
| 1-3 | 가입/온보딩 | 지역 및 자격 설정 저장 여부 | | |
| 4-5 | 파싱/딜카드 | 메모 추출 정확도 및 DB 적재 | | |
| 6-7 | IM 생성/승인 | 웹 IM 레이아웃 정상 렌더링 | | |
| 8 | PPTX 추출 | 파일 다운로드 및 무결성 | | |
| 9-10 | 매칭/공유 | 매수자 추천 및 Public View | | |

---

## F2. 구독 티어 게이트 & 사용량 추적

### 1. 테스트 목적 및 범위
`tier-gate.ts` 및 `usage-tracker.ts`를 기반으로, Free/Pro/Enterprise 티어별 기능 제한과 월별 사용량 쿼터(Quota)가 정상적으로 추적되고 차단되는지 검증합니다.

### 2. 가상 테스트 데이터
```json
{
  "tiers": {
    "free": {
      "dealCardLimit": 5,
      "imLiteLimit": 3,
      "matchLimit": 10,
      "blockedFeatures": ["im_pro", "pptx_preset", "magazine", "circle"]
    },
    "pro": {
      "dealCardLimit": 50,
      "imLiteLimit": 30,
      "matchLimit": 100,
      "blockedFeatures": []
    },
    "enterprise": {
      "dealCardLimit": -1,
      "imLiteLimit": -1,
      "matchLimit": -1,
      "blockedFeatures": []
    }
  }
}
```

### 3. 테스트 절차
**사전 조건**: `free` 티어 계정 준비
1. 딜카드를 연속으로 5회 생성합니다.
2. 6번째 딜카드를 생성 시도합니다.
3. IM Pro 기능(예: `pptx_preset` 고급 템플릿 사용) 접근을 시도합니다.
4. 관리자 API를 통해 해당 계정을 `pro` 티어로 업그레이드합니다.
5. 6번째 딜카드 생성을 다시 시도하고 성공하는지 확인합니다.
6. (선택) 시스템 날짜를 다음 달 1일로 모의 변경하여 `retention-purge` 크론에 의해 사용량이 초기화되는지 확인합니다.

### 4. 기대 결과 및 평가 기준
* **L1**: Free 티어에서 제한 횟수 도달 시 결제 유도(Paywall) 모달이 표시됨
* **L2**: 차단된 기능(`im_pro` 등) 접근 시 Tier Gate가 방어하고 접근 거부(403 또는 모달) 처리됨
* **L3**: Pro 티어로 업그레이드 즉시 쿼터 한도가 변경되어 이전에 막힌 기능이 활성화됨
* **L4**: 월간 크론 잡 작동 시 남은 횟수/사용량이 0으로 올바르게 리셋됨

### 5. 결과 기록표
| 티어 상태 | 테스트 액션 | 기대 결과 | 실제 결과 (Pass/Fail) | 비고 |
|---|---|---|---|---|
| Free | 6번째 딜카드 생성 | Paywall 노출 차단 | | |
| Free | 고급 PPTX 템플릿 | 기능 비활성화 | | |
| 업그레이드 | Pro로 티어 변경 | 실시간 한도 증가 | | |
| Pro | 6번째 딜카드 생성 | 성공 (Quota 6/50) | | |
| Cron | 월간 초기화 | Quota 0/50 리셋 | | |
