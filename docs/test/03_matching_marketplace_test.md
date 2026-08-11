# 03. 매칭·마켓플레이스·시장 인텔리전스 — 프로덕션 E2E 테스트
> 문서 버전: v1.0 | 최종 수정: 2026-08-10
> 대상 환경: Production (https://cre-dealcard.vercel.app)
> 테스터 요구사항: 브로커 계정 2개 (서클 테스트용), Pro 티어

## 1. 테스트 목적 및 범위
본 문서는 CREDEAL 플랫폼의 Pillar C(매칭 및 마켓플레이스)와 Pillar D(시장 인텔리전스) 기능의 안정성, 정확성 및 성능을 검증합니다. 자연어 기반 매수자/임차인 의도 추출, 3축 매칭 로직, 서클 기능, 시장 인텔리전스 수집 및 배포 기능이 주요 검증 대상입니다.

## 2. 가상 테스트 데이터 (Fixtures)

### 2.1. 매수자 의도 테스트셋 (5건)
```json
[
  {
    "id": "BUYER-01",
    "label": "강남 오피스 법인 매수자",
    "memo": "강남구 역삼동 또는 삼성동 사무용빌딩 찾습니다. 예산 100억 이내, 수익률 4.5% 이상, 만실 우선. 2024년 이후 준공 선호.",
    "expected_intent": {
      "assetType": "office_building",
      "regions": ["강남구"],
      "budgetMax": 10000000000,
      "minCapRate": 0.045,
      "vacancyPreference": "full_occupancy"
    }
  },
  {
    "id": "BUYER-02",
    "label": "영등포 근생 개인 매수자",
    "memo": "영등포구 당산동이나 양평동 근생빌딩 80억 이하로 찾아요. 1층 공실이어도 괜찮고 밸류애드 가능한 물건 선호합니다.",
    "expected_intent": {
      "assetType": "nbhd_building",
      "regions": ["영등포구"],
      "budgetMax": 8000000000,
      "investmentPosture": "VALUE_ADD"
    }
  },
  {
    "id": "BUYER-03",
    "label": "성수 개발용지 디벨로퍼",
    "memo": "성수동 준공업지역 개발가능한 토지 또는 노후건물 200억 이하. 용적률 여유분 있는 곳 우선.",
    "expected_intent": {
      "assetType": ["bare_land", "nbhd_building"],
      "regions": ["성동구"],
      "budgetMax": 20000000000,
      "investmentPosture": "DEVELOPMENT_SITE"
    }
  },
  {
    "id": "BUYER-04",
    "label": "기관 물류 투자자",
    "memo": "경기도 이천 또는 용인 물류센터 500억 규모 기관투자. 장기임차 3PL 우량 임차인 필수. 캡레이트 6% 이상.",
    "expected_intent": {
      "assetType": "logistics",
      "regions": ["이천시", "용인시"],
      "budgetMax": 50000000000,
      "minCapRate": 0.06,
      "investmentPosture": "INSTITUTIONAL_LOGI"
    }
  },
  {
    "id": "BUYER-05",
    "label": "자가사용 병원 매수자",
    "memo": "서초구 또는 강남구 병원용 건물 매입 희망. 지하1층~지상5층 이상, 주차 20대 이상. 150억 예산.",
    "expected_intent": {
      "assetType": "medical_facility",
      "regions": ["서초구", "강남구"],
      "budgetMax": 15000000000,
      "investmentPosture": "OWNER_OCCUPIED"
    }
  }
]
```

### 2.2. 임차인 의도 테스트셋 (3건)
```json
[
  {
    "id": "TENANT-01",
    "label": "성수 F&B 창업자",
    "memo": "성수동 1층 카페 창업 예정. 전용 25~35평, 보증금 5000만원 이내, 월차임 250만원 이내. 가스 필수, 주차 1대 이상.",
    "expected_intent": {
      "targetFloor": "1F",
      "businessType": "F&B",
      "areaRange": { "min_py": 25, "max_py": 35 },
      "maxDeposit": 50000000,
      "maxMonthlyRent": 2500000,
      "mustHave": ["가스", "주차"]
    }
  },
  {
    "id": "TENANT-02",
    "label": "강남 IT 스타트업",
    "memo": "강남역 도보 5분 이내 사무실. 전용 50평 이상, 월 관리비 포함 500만원 이내. 회의실 별도, 24시간 출입.",
    "expected_intent": {
      "businessType": "IT/Tech",
      "areaMin_py": 50,
      "maxTotalRent": 5000000,
      "mustHave": ["24시간출입", "회의실"]
    }
  },
  {
    "id": "TENANT-03",
    "label": "여의도 금융사 지점",
    "memo": "여의도 대로변 1층 금융 점포. 전용 40평, 보증금 1억, 월차임 400만원 이내. 전면 유리 파사드 필수.",
    "expected_intent": {
      "targetFloor": "1F",
      "businessType": "금융",
      "area_py": 40,
      "maxDeposit": 100000000,
      "maxMonthlyRent": 4000000,
      "mustHave": ["대로변", "유리파사드"]
    }
  }
]
```

### 2.3. 펀딩 투자자 프로필 테스트셋 (2건)
```json
[
  {
    "id": "INVESTOR-01",
    "label": "보수적 개인 투자자",
    "profile": {
      "investableAmount": 50000000,
      "riskTolerance": "low",
      "preferredHoldPeriod": "3-5년",
      "preferredReturnPct": 5.0,
      "kycVerified": true
    }
  },
  {
    "id": "INVESTOR-02",
    "label": "공격적 법인 투자자",
    "profile": {
      "investableAmount": 500000000,
      "riskTolerance": "high",
      "preferredHoldPeriod": "1-3년",
      "preferredReturnPct": 10.0,
      "kycVerified": true
    }
  }
]
```

### 2.4. 서클 테스트 시나리오 데이터
```json
{
  "circle": {
    "name": "영등포 딜클럽",
    "description": "영등포권역 50-100억 근생빌딩 전문",
    "regionFilter": "영등포구",
    "assetTypeFilter": "nbhd_building",
    "budgetRange": { "min": 5000000000, "max": 10000000000 }
  },
  "invitee_email": "partner-broker@test.com"
}
```

### 2.5. 펄스 감성 투표 데이터
```json
[
  { "region": "GBD", "sentiment": "bullish", "confidence": 0.7, "comment": "강남 오피스 공실률 하락 추세" },
  { "region": "YBD", "sentiment": "neutral", "confidence": 0.5, "comment": "여의도 재건축 불확실성" },
  { "region": "CBD", "sentiment": "bearish", "confidence": 0.6, "comment": "종로 오피스 임대료 하락" },
  { "region": "성수", "sentiment": "bullish", "confidence": 0.8, "comment": "성수 IT기업 유입 지속" }
]
```

---

## 3. 테스트 시나리오

### C1. 매수자 의도 → 매물 자동 매칭
**1. 사전 조건:** 브로커 계정 로그인 완료. 플랫폼 내에 강남구 오피스, 영등포구 근생 등 다양한 조건의 매물 데이터가 최소 10건 이상 등록되어 있어야 함.
**2. 테스트 절차:**
   1. 매수자 메모(BUYER-01)를 입력하여 의도 추출 API 호출.
   2. 추출된 의도(JSON)가 `expected_intent`와 일치하는지 확인.
   3. 추출된 의도를 기반으로 매물 매칭 API 호출.
   4. 추천된 매물 목록과 자연어 매칭 사유(Explainable AI) 확인.
**3. API 호출 예시:**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/broker/buyer-intents/from-memo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"memo": "강남구 역삼동 또는 삼성동 사무용빌딩 찾습니다. 예산 100억 이내, 수익률 4.5% 이상, 만실 우선. 2024년 이후 준공 선호."}'
```
**4. 기대 결과:** 
   - 의도 추출: assetType(자산유형), region(지역), budget(예산)의 3축 조건이 정확히 파싱됨.
   - 매칭 결과: 100억 이하, 강남구 오피스 매물이 상단 노출. 자연어로 작성된 추천 사유 제공.
**5. 검증 체크리스트 (L1-L4):**
   - [ ] [L1] API 200 OK 응답 확인
   - [ ] [L2] JSON 페이로드 파싱 정확도 95% 이상
   - [ ] [L3] 자연어 매칭 사유가 한글로 자연스럽게 생성됨
   - [ ] [L4] 의도와 무관한 매물(예: 200억 이상, 물류창고) 필터링 완벽 동작
**6. 결과 기록표:**
| 단계 | 예상 결과 | 실제 결과 | Pass/Fail | 비고 |
|---|---|---|---|---|
| 의도 추출 | 3축 매칭 데이터 생성 | | | |
| 매칭 추천 | 조건 부합 매물 리스트업 | | | |

### C2. 임차인 의도 → 공간 자동 매칭
**1. 사전 조건:** 브로커 계정 로그인 완료. 임대 매물 데이터(F&B, IT/Tech 용도 등) 등록 상태.
**2. 테스트 절차:**
   1. 임차인 메모(TENANT-01) 입력하여 의도 추출 API 호출.
   2. 면적 단위 변환(평 → ㎡) 정상 여부 확인.
   3. mustHave(가스, 주차)와 niceToHave 분리 확인.
   4. 추출 의도로 임대 매물 매칭 API 호출.
**3. API 호출 예시:**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/broker/tenant-intents/from-memo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"memo": "성수동 1층 카페 창업 예정. 전용 25~35평, 보증금 5000만원 이내..."}'
```
**4. 기대 결과:** 평 단위가 ㎡로 변환되어 저장. 필수조건(mustHave) 만족 매물만 필터링.
**5. 검증 체크리스트:**
   - [ ] [L1] 면적 환산식(평 * 3.3058) 적용 정확도
   - [ ] [L2] mustHave 요건 불충족 매물 100% 배제
   - [ ] [L3] niceToHave 요건에 따른 스코어링 정렬
**6. 결과 기록표:**
| 단계 | 예상 결과 | 실제 결과 | Pass/Fail | 비고 |
|---|---|---|---|---|
| 의도 추출 | 면적 변환 및 mustHave 식별 | | | |
| 공간 매칭 | 적합 공간 스코어링 리스트 | | | |

### C3. 펀딩 투자자 ↔ 프로젝트 매칭
**1. 사전 조건:** 관리자 권한. 펀딩 프로젝트 다수 존재. KYC 인증 완료된 투자자 프로필 존재.
**2. 테스트 절차:**
   1. `INVESTOR-01`, `INVESTOR-02` 프로필을 이용하여 매칭 API 호출.
   2. 리스크 허용도(Risk Tolerance)에 따른 프로젝트 필터링 확인.
   3. KYC 게이트 미통과 계정으로 호출 시 403 에러 확인.
**3. API 호출 예시:**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/funding/match \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"investorId": "INVESTOR-01"}'
```
**4. 기대 결과:** 
   - 보수적 투자자에게는 Core/Core+ 자산 위주 추천.
   - 공격적 투자자에게는 Value-Add/Opportunistic 개발 사업 추천.
   - KYC 미인증시 차단.
**5. 검증 체크리스트:**
   - [ ] [L1] 투자성향 기반 프로젝트 매칭 로직 작동
   - [ ] [L2] 목표수익률/투자금액 필터링
   - [ ] [L4] KYC 및 보안 권한 게이트 정상 작동
**6. 결과 기록표:**
| 투자자 성향 | 매칭된 프로젝트 리스크 | Pass/Fail | 비고 |
|---|---|---|---|
| 보수적 (low) | Core 급 매칭 여부 | | |
| 공격적 (high)| Value-add 급 매칭 여부| | |

### C4. 서클(비공개 거래망) 생성 & 매물 공유
**1. 사전 조건:** 브로커 계정 A(소유자), 브로커 계정 B(초대 대상).
**2. 테스트 절차:**
   1. 브로커 A가 '영등포 딜클럽' 서클 생성.
   2. 브로커 A가 초대 링크(Invite-link) 생성 후 브로커 B에게 발송.
   3. 브로커 B가 링크를 통해 가입 신청 (join) 후 A가 승인 (approve).
   4. 서클 내 매물 매칭 공유.
   5. 비멤버(브로커 C)가 서클 매물 접근 시도.
**3. API 호출 예시:**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/circles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN_A>" \
  -d '{"name": "영등포 딜클럽", "regionFilter": "영등포구"}'
```
**4. 기대 결과:** 초대 및 승인 플로우 정상 동작. 비멤버 접근시 HTTP 403 Forbidden 응답.
**5. 검증 체크리스트:**
   - [ ] [L2] 서클 CRUD 동작
   - [ ] [L3] 초대 링크 기반 워크플로우 정상 동작
   - [ ] [L4] 비멤버 접근 403 차단 완벽성
**6. 결과 기록표:**
| 기능 | 예상 결과 | 실제 결과 | Pass/Fail | 비고 |
|---|---|---|---|---|
| 서클 생성 | 서클 ID 반환 | | | |
| 초대/승인 | 브로커 B 서클 진입 | | | |
| 권한 제어 | 브로커 C 접근시 403 | | | |

### D1. 모닝 인텔리전스 & 커스텀 브리핑
**1. 사전 조건:** 유저 프로필에 관심 키워드(예: "성수동", "물류센터") 설정됨.
**2. 테스트 절차:**
   1. 수동으로 크론(Cron) API 트리거하여 브리핑 생성.
   2. 생성된 모닝 인텔리전스 조회 API 호출.
   3. 사용자 커스텀 키워드가 반영된 내용인지 확인.
**3. API 호출 예시:**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/cron/morning-briefing
curl -X GET https://cre-dealcard.vercel.app/api/broker/morning-intelligence -H "Authorization: Bearer <TOKEN>"
```
**4. 기대 결과:** 매일 아침 개인화된 시장 요약 리포트(HTML/Markdown 형태)가 성공적으로 렌더링됨.
**5. 검증 체크리스트:**
   - [ ] [L1] Cron Job 에러 없이 완료
   - [ ] [L2] 설정된 관심 키워드 기반 컨텍스트 반영
   - [ ] [L3] 생성형 AI 요약 문장 자연스러움
**6. 결과 기록표:**
| 단계 | 예상 결과 | 실제 결과 | Pass/Fail | 비고 |
|---|---|---|---|---|
| 크론 트리거 | 성공(200) | | | |
| 인텔리전스 조회 | 키워드 포함 리포트 렌더 | | | |

### D2. 펄스 감성 투표 & 시장 심리 지수
**1. 사전 조건:** 다수의 사용자 계정 준비.
**2. 테스트 절차:**
   1. GBD, YBD, CBD, 성수 권역에 대해 감성 투표(vote) API 반복 호출.
   2. 통계(stats) API 호출하여 권역별 어그리게이션 확인.
   3. 히스토리(history) API로 시계열 변화 확인.
**3. API 호출 예시:**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/pulse/sentiment/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"region": "GBD", "sentiment": "bullish", "comment": "강남 오피스 공실률 하락 추세"}'
```
**4. 기대 결과:** 투표 데이터가 실시간으로 집계되며, 각 권역별(GBD/CBD/YBD/성수) 긍정/부정(bullish/bearish) 비율 지수가 정확히 계산됨.
**5. 검증 체크리스트:**
   - [ ] [L1] 투표 등록 처리 속도 및 동시성 문제 없음
   - [ ] [L2] 권역별 통계 Aggregation 정합성 (비율 합 100%)
   - [ ] [L3] 댓글(Comment) 기반 AI Confidence 지수 매핑 적절성
**6. 결과 기록표:**
| 권역 | Bullish 비율 | Bearish 비율 | Pass/Fail | 비고 |
|---|---|---|---|---|
| GBD | | | | |
| 성수 | | | | |

### D3. 시세 크롤러 & 비교사례 수집
**1. 사전 조건:** 외부 공공데이터 포털 연동 준비.
**2. 테스트 절차:**
   1. 특정 지역(예: 강남구 테헤란로) 비교사례 수집 API 호출.
   2. 외부 연동 실패 상황(Timeout 설정) 시뮬레이션 및 Fallback 핸들링 확인.
   3. 정상 수집 시, 시세 크롤링 데이터 확인.
**3. API 호출 예시:**
```bash
curl -X GET "https://cre-dealcard.vercel.app/api/public/market-intelligence?region=강남구" \
  -H "Authorization: Bearer <TOKEN>"
```
**4. 기대 결과:** 정상 시 최신 거래 사례(Comparable) 목록 반환. 외부 API 장애 시 캐시된 최신 데이터 반환 또는 우아한 에러 메시지(Fallback) 제공.
**5. 검증 체크리스트:**
   - [ ] [L1] 공공/외부 API 연동 성공률
   - [ ] [L3] 타임아웃 발생 시 Fallback 로직 정상 동작 (500 에러 미발생)
   - [ ] [L2] 수집된 거래 사례의 평단가(NOI/Cap rate) 계산식 정합성
**6. 결과 기록표:**
| 테스트 조건 | 예상 결과 | 실제 결과 | Pass/Fail | 비고 |
|---|---|---|---|---|
| 정상 API 호출 | 최신 사례 N건 반환 | | | |
| 외부 연동 타임아웃 | 캐시 데이터 또는 알림 메시지 | | | |

---
**최종 평가 코멘트:**
- (테스트 진행 후 테스터 작성란)
