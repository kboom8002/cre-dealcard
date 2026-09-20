# 테스트 가이드 Part 1 — 딜카드·매수의향 생성 & AI 매칭 엔진

> **범위**: 딜카드 생성 → 매수의향 생성 → 3-Stage AI 매칭 엔진  
> **테스트 케이스**: TC-01 ~ TC-12  
> **선행 조건**: 브로커 계정 로그인, `credeal.net` 프로덕션 또는 로컬 환경  
> **관련 파일**: `src/domain/matching/`, `src/domain/buyer/`, `src/ai/agents/`

---

## 📋 테스트 픽스처

### FX-01: 딜카드 생성용 브로커 메모

```text
역삼동 테헤란로 인근 꼬마빌딩 매물 접수.
대지 85평, 연면적 320평, 지하1층~지상5층.
2003년 준공, 근린생활시설 및 업무시설.
현재 만실 상태. 보증금 총 8억, 월세 총 2,800만원.
매도 희망가 80억 (감정가 대비 약 10% 할인).
1층 카페, 2~3층 사무실, 4~5층 공유오피스 임차 중.
리모델링 이력 있음 (2019년 외벽+엘리베이터 교체).
위반건축물 해당 없음. 단독소유. 명도 불필요(만실).
```

### FX-02: 매수의향 — S등급 매칭 기대 (임대수익형)

```text
법인 매수자, 예산 60~100억.
강남·서초·역삼 권역 꼬마빌딩 선호.
임대수익형 투자 목적. 만실 또는 90% 이상 점유 매물 희망.
필수조건: 위반건축물 불가, 명도 불필요한 만실 매물.
수익률 4% 이상 기대. 대출 비율 50% 이내 예정.
리스크 허용도: 보수적.
```

### FX-03: 매수의향 — 지역 불일치 (Hard Filter 탈락)

```text
개인 매수자, 예산 50~80억.
마포·홍대·합정 권역 꼬마빌딩 선호.
임대수익형 투자 목적.
수익률 5% 이상 기대.
```

### FX-04: 매수의향 — 예산 불일치 (Hard Filter 탈락)

```text
개인 매수자, 예산 20~30억.
강남 권역 꼬마빌딩 선호.
사옥용 자가사용 목적.
```

### FX-05: 매수의향 — 개발형 (B/C등급 기대)

```text
디벨로퍼 법인, 예산 70~120억.
강남·서초 권역 토지 또는 노후 건물 선호.
철거 후 신축 개발 목적. 공실 또는 명도 가능 매물 선호.
필수조건: 단독소유, 대지 100평 이상.
리스크 허용도: 공격적.
```

### FX-06: 매수의향 — 증여/상속형

```text
자산가 가족 법인, 예산 50~80억.
서초·강남 권역 근린생활시설 선호.
증여·상속 세무 전략 목적.
안정적 임대 수익보다 세무 효율성 우선.
```

### FX-07: 매수의향 — 명도 조건 불일치

```text
법인 매수자, 예산 60~100억.
역삼·강남 권역 꼬마빌딩.
사옥용 자가사용 목적. 즉시입주 필요.
필수조건: 명도완료, 즉시입주 가능.
```

### FX-08: 이상적 매수자 페르소나 검증용 매물 요약

```json
{
  "areaSignal": "역삼동",
  "assetType": "꼬마빌딩",
  "priceBand": "80억대",
  "sizeSignal": "대지 85평 / 연면적 320평",
  "vacancyStatus": "만실",
  "investmentPosture": "income",
  "fitSummary": "강남권 만실 꼬마빌딩. 수익률 4.2%. 리모델링 완료.",
  "cautionSummary": "준공 20년 이상. 엘리베이터 교체 완료."
}
```

---

## TC-01: 딜카드 메모 입력 → SSoT Lite 생성

### 목적
브로커가 자연어 메모를 입력하면 AI가 매물 정보를 구조화(SSoT Lite)하는지 검증

### 사전 조건
- 브로커 계정 로그인 상태

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | `/broker/deal-card/new` 접속 | 딜카드 생성 페이지 표시 |
| 2 | 메모 입력란에 **FX-01** 전체 붙여넣기 | 텍스트 입력 완료 |
| 3 | **"AI 분석 시작"** 버튼 클릭 | 로딩 스피너 → AI 분석 진행 |
| 4 | 분석 완료 대기 (10~30초) | 구조화된 매물 정보 카드 표시 |
| 5 | 결과에서 **지역** 확인 | `역삼동` 또는 `강남구 역삼동` |
| 6 | **자산유형** 확인 | `꼬마빌딩` |
| 7 | **가격대** 확인 | `80억` 또는 `80억대` |
| 8 | **공실 상태** 확인 | `만실` |
| 9 | **적합성 요약** 확인 | AI 생성 텍스트 (핵심 투자 포인트 포함) |
| 10 | **주의사항 요약** 확인 | AI 생성 텍스트 (리스크 포인트 포함) |
| 11 | **"저장"** 클릭 | `building_ssot_lite` 행 생성, 딜카드 상세 페이지 이동 |

### 검증 포인트 (API/DB)

```bash
# API 호출 확인 (브라우저 Network 탭)
POST /api/broker/deal-card/from-memo
→ 응답: { buildingId: "uuid", ... }

# DB 확인 (Supabase Dashboard)
SELECT * FROM building_ssot_lite WHERE id = '{buildingId}';
→ area_signal = '역삼동', asset_type LIKE '%꼬마빌딩%', price_band LIKE '%80억%'

# 자동 매칭 트리거 확인
SELECT * FROM match_results WHERE building_ssot_lite_id = '{buildingId}';
→ 기존 buyer_intent_lite가 있으면 매칭 결과가 자동 생성됨
```

### 판정 기준
- ✅ SSoT Lite 행이 정상 생성되고, 지역/자산유형/가격이 메모와 일치
- ✅ `runAutoMatch()` 비동기 트리거 발동 (match_results에 결과 존재)
- ❌ 구조화 실패 시 에러 메시지 표시

---

## TC-02: 이상적 매수자 페르소나 3종 생성

### 목적
매물 기반으로 AI가 3종의 이상적 매수자 페르소나를 생성하는지 검증

### 사전 조건
- TC-01 완료 (딜카드 존재)

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | `/broker/deal-card/{id}` 접속 | 딜카드 상세 페이지 |
| 2 | **"이상적 매수자 페르소나"** 섹션으로 스크롤 | 섹션 표시 |
| 3 | **"페르소나 생성"** 버튼 클릭 (또는 자동 로드) | AI 분석 시작 |
| 4 | 결과 대기 (5~15초) | 3개 페르소나 카드 표시 |
| 5 | 페르소나 1 확인 | `label` (예: "임대수익 추구 법인"), `buyerType`, `budgetRange`, `motivation`, `coreNeeds[]` |
| 6 | 페르소나 2 확인 | 다른 유형 (예: "사옥 이전 기업") |
| 7 | 페르소나 3 확인 | 또 다른 유형 (예: "자산 포트폴리오 다각화 개인투자자") |

### 검증 포인트

```bash
# API 호출
POST /api/broker/deal-card/{id}/personas
→ 응답: { personas: [{ label, buyerType, budgetRange, motivation, coreNeeds[], purposeProfile }, ...] }

# 각 페르소나의 purposeProfile이 유효한 WeightProfile인지 확인
# 유효값: 'income' | 'owner_occupied' | 'development' | 'operating' | 'trading' | 'gift' | 'default'
```

### 판정 기준
- ✅ 3개 페르소나가 서로 다른 유형으로 생성됨
- ✅ 각 페르소나에 `budgetRange`, `motivation`, `coreNeeds[]`, `purposeProfile` 존재
- ✅ `purposeProfile`이 유효한 7종 WeightProfile 중 하나

---

## TC-03: 매수의향 메모 입력 → AI 정규화

### 목적
브로커가 매수자 조건 메모를 입력하면 AI가 구조화된 `buyer_intent_lite`를 생성하는지 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | `/broker/buyer-intents/new` 접속 | 매수의향 생성 페이지 |
| 2 | 메모 입력란에 **FX-02** 전체 붙여넣기 | 텍스트 입력 |
| 3 | **"AI 분석"** 클릭 | 로딩 → AI 정규화 진행 |
| 4 | 결과 확인: **매수자 유형** | `법인` |
| 5 | **예산 범위** | `60억 ~ 100억` |
| 6 | **선호 지역** | `강남`, `서초`, `역삼` (배열) |
| 7 | **자산 유형** | `꼬마빌딩` |
| 8 | **매수 목적** | `임대수익` 관련 |
| 9 | **필수조건 (mustHave)** | `위반건축물불가`, `만실` 관련 조건 포함 |
| 10 | **리스크 허용도** | `보수적` 또는 `conservative` |
| 11 | **"저장"** 클릭 | `buyer_intent_lite` 행 생성 |

### 검증 포인트

```bash
# API
POST /api/broker/buyer-intents/from-memo
→ { buyerIntentId: "uuid", summary: { budgetDisplay, preferredRegions, purchasePurpose, mustHave } }

# DB
SELECT * FROM buyer_intent_lite WHERE id = '{buyerIntentId}';
→ buyer_type = '법인', budget_min = 6000000000, budget_max = 10000000000
→ preferred_regions @> '["강남"]', asset_types @> '["꼬마빌딩"]'
→ visibility = 'anonymous_matchable'

# AI 감사 로그
SELECT * FROM ai_runs WHERE input_ref->>'buyer_intent_id' = '{buyerIntentId}';
→ run_type = 'buyer_intent_normalizer', status = 'completed'

# 자동 매칭 트리거
SELECT * FROM match_results WHERE buyer_intent_lite_id = '{buyerIntentId}';
→ runAutoMatchForBuyer() 결과 존재
```

### 판정 기준
- ✅ 구조화 필드 전부 올바르게 파싱
- ✅ `ai_runs` 감사 로그 기록
- ✅ `activity_events`에 `buyer_intent_created` 이벤트 기록
- ✅ `runAutoMatchForBuyer()` 자동 트리거 (match_results에 결과)

---

## TC-04: 자동 매칭 — 딜카드 생성 트리거

### 목적
딜카드 생성 시 기존 모든 `buyer_intent_lite`와 자동 매칭이 실행되는지 검증

### 사전 조건
- FX-02, FX-03, FX-04, FX-05, FX-06으로 매수의향 5건 사전 등록

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **FX-01** 메모로 새 딜카드 생성 | 딜카드 생성 완료 |
| 2 | 30초 대기 (비동기 매칭) | 자동 매칭 완료 |
| 3 | 딜카드 상세 → **"매칭된 매수자"** 섹션 확인 | 매칭 결과 목록 표시 |
| 4 | FX-02 매수의향 매칭 확인 | **S 또는 A 등급** (지역·예산·자산 일치) |
| 5 | FX-03 매수의향 매칭 확인 | **C 등급** (지역 불일치 → Stage 1 탈락) |
| 6 | FX-04 매수의향 매칭 확인 | **C 등급** (예산 불일치 → Stage 1 탈락) |
| 7 | FX-05 매수의향 매칭 확인 | **B 또는 C 등급** (개발형 vs 임대수익 매물) |
| 8 | FX-06 매수의향 매칭 확인 | 등급 확인 (증여형 가중치 적용) |

### 검증 포인트

```bash
# 매칭 결과 전수 조회
SELECT grade, score, stage1_passed, reasoning, purpose_weight_profile
FROM match_results
WHERE building_ssot_lite_id = '{newBuildingId}'
ORDER BY score DESC;

# 기대:
# FX-02 → grade='S'/'A', stage1_passed=true, purpose_weight_profile='income'
# FX-03 → grade='C', stage1_passed=false, reasoning LIKE '%지역 불일치%'
# FX-04 → grade='C', stage1_passed=false, reasoning LIKE '%가격대 불일치%'
# FX-05 → stage1_passed=true, purpose_weight_profile='development'
# FX-06 → purpose_weight_profile='gift'

# CasePack 생성 (S/A 등급만)
SELECT * FROM deal_casepacks WHERE building_id = '{newBuildingId}';

# Activity Event (S/A 등급만)
SELECT * FROM activity_events
WHERE event_type = 'deal_card.matched'
  AND metadata->>'building_id' = '{newBuildingId}';
```

### 판정 기준
- ✅ 5건 매수의향 모두에 대해 매칭 결과 생성
- ✅ Hard Filter 통과/탈락이 기대대로 분류
- ✅ S/A 등급에만 `deal_casepacks` + `activity_events` 생성
- ✅ `promotion_score` 갱신

---

## TC-05: 자동 매칭 — 매수의향 생성 트리거

### 목적
매수의향 생성 시 기존 모든 `building_ssot_lite`와 자동 매칭이 실행되는지 검증

### 사전 조건
- TC-01 딜카드 1건 이상 존재

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **FX-02** 메모로 새 매수의향 생성 | 매수의향 생성 완료 |
| 2 | 30초 대기 | `runAutoMatchForBuyer()` 비동기 실행 |
| 3 | `/broker/buyer-intents/{id}` 접속 | 매수의향 상세 페이지 |
| 4 | **"매칭 이력"** 섹션 확인 | 기존 매물에 대한 매칭 결과 목록 |
| 5 | TC-01 매물과의 매칭 등급 확인 | S 또는 A 등급 |

### 검증 포인트

```bash
SELECT grade, score, reasoning
FROM match_results
WHERE buyer_intent_lite_id = '{newIntentId}'
ORDER BY score DESC;
```

---

## TC-06: 3-Stage 매칭 엔진 수동 실행

### 목적
매칭 API를 직접 호출하여 3-Stage 결과 상세를 검증

### 테스트 절차 (API 직접 호출)

```bash
# cURL 또는 Postman으로 직접 호출
curl -X POST https://credeal.net/api/broker/match \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "buildingId": "{TC-01에서 생성한 buildingId}",
    "buyerIntentId": "{FX-02로 생성한 intentId}"
  }'
```

### 기대 응답

```json
{
  "grade": "S",
  "score": 87.5,
  "stage1Passed": true,
  "stage2Similarity": 0.82341,
  "stage3Score": 87.5,
  "reasoning": "[S] 최우선 매칭 (즉시 연락 권장) | 시맨틱 유사도 82.3% | 목적 프로파일: income",
  "purposeWeightProfile": "income",
  "stage1Details": {
    "region": true,
    "budget": true,
    "asset": true,
    "schedule": true,
    "packSlots": true
  },
  "stage3Weights": {
    "market": 0.20,
    "financial": 0.40,
    "vacancy": 0.15,
    "semantic": 0.25
  }
}
```

### 검증 포인트

| 필드 | 검증 |
|------|------|
| `stage1Passed` | `true` (모든 Hard Filter 통과) |
| `stage1Details` | 5개 필드 전부 `true` |
| `stage2Similarity` | 0.0~1.0 범위, 0.7 이상이면 높은 유사도 |
| `stage3Score` | 0~100 범위 |
| `purposeWeightProfile` | FX-02가 임대수익형이므로 `income` |
| `stage3Weights` | `income` 프로파일 가중치와 일치 |
| `grade` | 점수에 따른 등급 (≥85=S, ≥70=A, ≥50=B, <50=C) |

---

## TC-07: Hard Filter 탈락 시나리오 (4종)

### 목적
Stage 1 Hard Filter의 각 탈락 조건을 개별 검증

### 7-A: 지역 불일치

| 입력 | 값 |
|------|---|
| 매물 지역 | 역삼동 |
| 매수의향 지역 | 마포·홍대·합정 (**FX-03**) |

**기대**: `stage1Passed: false`, `reasoning` ∋ "지역 불일치", `grade: 'C'`, `score: 0`

### 7-B: 예산 초과

| 입력 | 값 |
|------|---|
| 매물 가격 | 80억 |
| 매수의향 예산 상한 | 30억 (**FX-04**) |
| 초과 비율 | 80 > 30 × 1.2 = 36 → **탈락** |

**기대**: `reasoning` ∋ "가격대 불일치: 80억 > 예산 상한 30억 × 1.2"

### 7-C: 명도 조건 불일치

| 입력 | 값 |
|------|---|
| 매물 공실 상태 | 만실 (명도 불필요) |
| 매수의향 (**FX-07**) | `mustHave: ["명도완료", "즉시입주"]` |
| 매물 vacatePlan | `pre_vacate` 일 때만 탈락 |

> ⚠️ 주의: FX-01 매물은 만실(명도 불필요)이므로 vacatePlan이 설정되어 있지 않을 수 있음. vacatePlan이 `pre_vacate` 또는 `contested`인 매물에 대해 테스트 필요.

### 7-D: 위반건축물 불가

| 입력 | 값 |
|------|---|
| 매물 | `illegalExtension: true` |
| 매수의향 mustHave | `["위반건축물불가"]` |

**기대**: `reasoning` ∋ "위반건축물 조건 불일치"

### 검증 절차
각 시나리오에서 `/api/broker/match` POST 호출 후:
- `stage1Passed === false`
- `grade === 'C'`
- `score === 0`
- `reasoning`에 해당 탈락 사유 문자열 포함

---

## TC-08: 목적별 가중치 프로파일 검증

### 목적
매수 목적(purchasePurpose)에 따라 올바른 WeightProfile이 적용되는지 검증

### 테스트 매트릭스

| 매수의향 픽스처 | purchasePurpose 키워드 | 기대 프로파일 | 기대 가중치 |
|---------------|----------------------|-------------|-----------|
| FX-02 | 임대수익 | `income` | financial=0.40 (최대) |
| FX-05 | 철거 후 신축 개발 | `development` | semantic=0.45 (최대) |
| FX-06 | 증여·상속 세무 전략 | `gift` | tax=0.50 (최대) |
| FX-07 | 사옥용 자가사용 | `owner_occupied` | market=0.35 (최대) |

### 검증 방법

```bash
# 각 매수의향으로 매칭 실행 후
SELECT purpose_weight_profile, stage3_weights
FROM match_results
WHERE buyer_intent_lite_id = '{intentId}';
```

| 확인 항목 | 기준 |
|----------|------|
| `purpose_weight_profile` | 기대 프로파일 문자열과 일치 |
| `stage3_weights` | `PURPOSE_WEIGHTS[profile]` 테이블과 정확히 일치 |

---

## TC-09: S/A/B/C 등급 경계값 검증

### 목적
등급 임계값(85/70/50)이 정확히 적용되는지 검증

### 테스트 방법
TC-04에서 생성된 매칭 결과 전체를 조회하여 점수-등급 매핑을 검증:

```bash
SELECT score, grade,
  CASE
    WHEN score >= 85 THEN 'S_expected'
    WHEN score >= 70 THEN 'A_expected'
    WHEN score >= 50 THEN 'B_expected'
    ELSE 'C_expected'
  END AS expected_grade
FROM match_results
WHERE building_ssot_lite_id = '{buildingId}';
```

### 판정 기준
- ✅ `grade`와 `expected_grade`가 모든 행에서 일치
- ✅ 점수 84.9 → `A`, 점수 85.0 → `S` (경계값 정확)

---

## TC-10: Explainable Matcher — 설명 가능 매칭

### 목적
`matchBuyerWithDeal()` 함수의 `mismatchReasons[]` + `matchHighlights[]` 출력을 검증

### 테스트 절차 (API 또는 단위 테스트)

```typescript
// 테스트 코드 (src/tests/domain/stage3.test.ts 참조)
import { matchBuyerWithDeal } from '@/domain/matching/explainable-matcher';

const buyer = {
  maxBudgetKrw: 10_000_000_000, // 100억
  minYieldPct: 4.0,
  targetRegions: ['강남', '역삼'],
  preferredArchetypes: ['STABLE_INCOME'],
};

const deal = {
  dealId: 'test-deal-1',
  askingPriceKrw: 8_000_000_000, // 80억
  capRatePct: 4.2,
  regionName: '역삼동',
  archetype: 'STABLE_INCOME',
};

const result = matchBuyerWithDeal(buyer, deal);
```

### 기대 결과

```json
{
  "dealId": "test-deal-1",
  "matchScore": 100,
  "matchTier": "S",
  "isHardFilterPassed": true,
  "mismatchReasons": [],
  "matchHighlights": [
    "예산 범위 부합",
    "희망 권역(역삼동) 부합",
    "선호 아키타입(STABLE_INCOME) 일치",
    "목표 수익률(4%) 달성 (현재 4.2%)"
  ]
}
```

### DISQUALIFIED 시나리오

```typescript
const poorBuyer = {
  maxBudgetKrw: 3_000_000_000, // 30억
  targetRegions: ['마포'],
};
const result2 = matchBuyerWithDeal(poorBuyer, deal);
// → matchTier: 'DISQUALIFIED', matchScore: 30
// → mismatchReasons: ["예산 초과: 희망 예산 대비 167% 높음", "지역 불일치: 희망 지역(마포) 미포함"]
```

---

## TC-11: 중복 매칭 방지

### 목적
동일 건물-매수의향 쌍에 대해 중복 매칭이 발생하지 않는지 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | FX-01 딜카드 + FX-02 매수의향 매칭 실행 | 1건 match_results 생성 |
| 2 | 동일 조합으로 매칭 재실행 | **신규 행 생성 없음** (스킵) |
| 3 | DB 확인 | 동일 `building_ssot_lite_id` + `buyer_intent_lite_id` 조합은 1건만 존재 |

### 검증 포인트

```bash
SELECT COUNT(*)
FROM match_results
WHERE building_ssot_lite_id = '{buildingId}'
  AND buyer_intent_lite_id = '{intentId}';
→ 1 (중복 없음)
```

---

## TC-12: 지역 계층 매칭 (Region Hierarchy)

### 목적
`matchRegion()` 함수의 구-동 계층 매칭이 올바르게 작동하는지 검증

### 테스트 매트릭스

| 매물 지역 | 매수의향 선호 지역 | 기대 결과 |
|----------|------------------|----------|
| `역삼동` | `["강남"]` | ✅ 매칭 (역삼동 ⊂ 강남구) |
| `역삼동` | `["역삼"]` | ✅ 매칭 (직접 일치) |
| `역삼동` | `["서초"]` | ❌ 불일치 |
| `역삼동` | `["강남", "서초"]` | ✅ 매칭 (OR 조건) |
| `논현동` | `["강남"]` | ✅ 매칭 (논현동 ⊂ 강남구) |
| `합정동` | `["강남"]` | ❌ 불일치 (합정동 ⊂ 마포구) |

### 검증 방법

```bash
# 기존 테스트 실행
npx vitest run src/domain/matching/__tests__/region-hierarchy.test.ts
```

---

## 📊 Part 1 테스트 요약

| TC | 제목 | 유형 | 우선순위 |
|----|------|------|---------|
| TC-01 | 딜카드 메모 → SSoT Lite | E2E | 🔴 필수 |
| TC-02 | 이상적 매수자 페르소나 | E2E | 🟡 권장 |
| TC-03 | 매수의향 메모 → AI 정규화 | E2E | 🔴 필수 |
| TC-04 | 자동 매칭 (딜카드 트리거) | E2E | 🔴 필수 |
| TC-05 | 자동 매칭 (매수의향 트리거) | E2E | 🔴 필수 |
| TC-06 | 3-Stage 엔진 수동 실행 | API | 🔴 필수 |
| TC-07 | Hard Filter 탈락 4종 | API | 🔴 필수 |
| TC-08 | 목적별 가중치 프로파일 | API | 🟡 권장 |
| TC-09 | S/A/B/C 등급 경계값 | DB 검증 | 🟡 권장 |
| TC-10 | Explainable Matcher | 단위 | 🟡 권장 |
| TC-11 | 중복 매칭 방지 | DB 검증 | 🔴 필수 |
| TC-12 | 지역 계층 매칭 | 단위 | 🟡 권장 |

> **다음**: [Part 2: 서클 공동중개 E2E 테스트](./TEST_GUIDE_PART2_CIRCLE_COBROKERAGE.md)
