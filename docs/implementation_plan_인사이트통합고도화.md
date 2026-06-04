# 시장 대응 전략 + 빌딩 레이더 통합 고도화 계획

> **목표**: 플랫폼 내부 mock 데이터 → 공공 실데이터 + RAG + 피드백 루프 기반의 신뢰 가능한 시장 인텔리전스로 전환

---

## 현황 진단 (As-Is)

```
현재 데이터 흐름:

market_indicator_engine.ts
  ├── Layer 3: 플랫폼 내부 데이터 ← 지금 여기만 실작동
  ├── Layer 2: external_transactions (MOLIT) ← ETL 구현됨, 데이터 미유입
  └── Layer 1: social_sentiment ← 크롤러 구현됨, mock 데이터

gov-premium-apis.ts  ← 6개 API 클라이언트 모두 dummy 데이터
market-crawlers.ts   ← 6개 크롤러 모두 dummy 데이터
building-radar.ts    ← AI 단독 호출, 컨텍스트 없음
```

---

## 축 1. 데이터 파이프라인 — 실데이터 연결 (MECE)

> 코드 구조는 완성. 실 API 키 + 실 데이터 삽입만 필요.

### 1-A. 정부 공공 API (즉시 연결 가능)

| # | 데이터 | API | 현재 상태 | 작업 내용 |
|---|--------|-----|----------|----------|
| ① | **실거래가** | 국토부 RTMSOBJSvc | ✅ ETL 구현, DB 테이블 있음 | `MOLIT_API_KEY` 환경변수 설정 + cron 트리거 작성 |
| ② | **건축물대장** | data.go.kr/건축HUB | ✅ API 구현, fire-and-forget | **AI 호출 전** 조회 순서로 변경 |
| ③ | **공시지가** | data.go.kr | ✅ 클라이언트 구현, mock | `DATA_GO_KR_API_KEY`로 실 데이터 연결 |
| ④ | **토지이용계획** | 토지e음 API | ✅ 클라이언트 구현, mock | 동일 키로 연결 가능 |
| ⑤ | **한국부동산원 임대동향** | 부동산원 OpenAPI | ✅ 클라이언트 구현, mock | 별도 API 키 필요 |
| ⑥ | **소상공인 상권분석** | 소상공인진흥공단 | ✅ 클라이언트 구현, mock | 동일 키로 연결 가능 |

**필요 환경 변수:**
```
MOLIT_API_KEY=             # 국토부 실거래가
DATA_GO_KR_API_KEY=        # 건축물대장, 공시지가, 토지e음, 상권분석
JUSO_CONFIRM_KEY=          # 도로명주소 해석
KAB_API_KEY=               # 한국부동산원 (신규)
```

### 1-B. 크롤링 데이터 (구조 완성, 실 소스 연결)

| # | 크롤러 | 현재 | 실 소스 |
|---|--------|------|---------|
| ① | CRE 뉴스 (`crawlCreNews`) | dummy 3건 | 한경 집코노미/매경/조선비즈 **RSS 피드 URL** 연결 |
| ② | CBRE/Cushman 보고서 (`ingestGlobalReports`) | dummy | PDF 파싱 or 공개 요약 페이지 스크래핑 |
| ③ | 소셜 센티먼트 (`trackSocialSentiment`) | dummy | 네이버 카페 부동산 스터디/갤러리 크롤링 |
| ④ | 경매 정보 (`crawlAuctions`) | dummy | 대법원 경매정보 공개 API or 스크래핑 |
| ⑤ | 임대 시장 데이터 (`computeRentalMarketRates`) | dummy | 한국부동산원 통계 API |

### 1-C. 데이터 갱신 스케줄 (신규 구현)

```
Daily Cron (매일 오전 5시):
  ├── fetchMolitTransactions()      ← 전일 실거래가
  ├── crawlCreNews()                ← 전일 CRE 뉴스
  └── trackSocialSentiment()        ← 소셜 키워드 감성

Weekly Cron (매주 월요일):
  ├── fetchRentalTrend()            ← 주간 임대 동향
  ├── fetchCommercialDistrict()     ← 상권 분석
  └── ingestGlobalReports()         ← 주간 리포트

On-Demand (건물 입력 시):
  ├── resolveAddressToComponents()  ← 주소 해석
  ├── fetchBuildingRegister()       ← 건축물대장 (AI 호출 전)
  ├── fetchOfficialLandPrice()      ← 공시지가
  └── fetchLandUsePlan()            ← 토지이용계획
```

**구현 파일:** 신규 `src/app/api/cron/daily-data-sync/route.ts`

---

## 축 2. 지표 엔진 고도화 — 산출 근거 투명화 (MECE)

### 2-A. 수요 점수 (demandScore) 개선

**현재 문제:** S등급 매칭 수 × 12 + 45 → 플랫폼 내부 데이터만 반영

**개선 공식 (가중평균):**
```
demandScore = 
  내부_매칭강도 (40%) + 공공_거래량지수 (35%) + 뉴스_센티먼트 (25%)

  ├── 내부_매칭강도: (S매칭×12 + A매칭×6) / max_expected × 100
  ├── 공공_거래량지수: 최근 30일 해당 구 거래 건수 / 전분기 평균 × 100
  └── 뉴스_센티먼트: bullish 기사 비율 × 100 (external_news 테이블)
```

**데이터 근거 표시:** UI에 "근거 데이터: 국토부 실거래가 32건 + 매칭 이력 8건 + 뉴스 센티먼트 bullish 67%" 형태로 투명하게 표시

### 2-B. 공급 점수 (supplyScore) 개선

**현재 문제:** 플랫폼 등록 매물 수만 카운트 → 전체 시장 미반영

**개선 공식:**
```
supplyScore = 
  플랫폼_등록 (30%) + 공공_신축허가 (40%) + 경매_공급 (30%)

  ├── 플랫폼_등록: 등록 매물/임대 공간 수 (building_ssot_lite + lease_spaces)
  ├── 공공_신축허가: 해당 구 건축 허가 건수 (국토부 인허가 API)
  └── 경매_공급: auction_listings 경매 물건 수 (court auction 크롤링)
```

### 2-C. 가격 저항선 (priceResistanceBand) 개선

**현재 문제:** match_failure_logs 데이터 없으면 하드코딩 (8.5%, 15%)

**개선 방안:**
```
가격저항선 = 
  1. 플랫폼 매칭 실패 로그의 price_gap_pct 평균 (실데이터)
  2. external_transactions 호가 vs 실거래가 갭 (MOLIT 데이터)
  3. 부동산원 임대동향 vacancy_rate 기반 추정

→ 3개 소스 중 데이터 있는 소스의 가중평균
```

**브로커 피드백 루프:** 중개인이 "매수자가 X억에서 협상 결렬" 버튼 클릭 시 → `trackMatchFailure()` 자동 호출 → 다음 스냅샷에 반영

### 2-D. 트렌드 방향 (trendDirection) 개선

**현재 문제:** `if (demandScore - supplyScore > 10)` 단순 차이

**개선 방안 — 5신호 종합 판단:**
```
trendSignal = {
  demandSupplyGap: demand - supply,          // 현재 방식
  priceResistanceTrend: 저항선 3개월 변화,   // 신규
  holdDaysTrend: 체류일 전월 대비 변화,      // 신규
  newsTrend: 최근 2주 sentimentRatio,        // 신규
  transactionVolumeTrend: 거래량 전년 대비,  // 신규
}

→ 5개 시그널의 방향성 투표 → 3개 이상 "up" → trendDirection = "up"
```

### 2-E. 지표 신뢰도 메타데이터 (신규)

각 지표에 신뢰도 표시 추가:
```typescript
interface MarketIndicatorWithConfidence {
  demandScore: number;
  demandScoreSource: 'internal_only' | 'public_data' | 'full_composite';
  demandScoreDataAge: number; // 데이터 기준일로부터 경과 일수
  demandScoreConfidence: 'low' | 'medium' | 'high';
}
```

UI에 "⚠️ 공공데이터 연결 후 정확도 향상 예정" vs "✅ 국토부 실거래가 기반" 배지 표시

---

## 축 3. 빌딩 레이더 RAG 통합 (MECE)

### 3-A. 데이터 수집 선행 처리 (Pre-Generation Enrichment)

```
현재:  입력 → AI 호출 → (비동기) 건축물대장 조회
개선:  입력 → 병렬 데이터 수집 → AI 호출 (데이터 컨텍스트 포함)
```

**병렬 수집 파이프라인 (신규):**
```typescript
// src/domain/building/building-data-collector.ts (신규)
async function collectBuildingContext(input: string): Promise<BuildingDataContext> {
  const address = await resolveAddressToComponents(input);
  
  const [register, transactions, landPrice, landUse, similarDeals, regionPulse] = 
    await Promise.allSettled([
      fetchBuildingRegister(address),           // 건축물대장
      fetchRecentTransactions(address.district), // 실거래가 최근 5건
      fetchOfficialLandPrice(address.pnu),      // 공시지가
      fetchLandUsePlan(address.pnu),             // 토지이용계획
      findSimilarDeals({ areaSignal, assetType }), // CasePack RAG
      getCRESignalSnapshot(address.district),    // CRE Pulse
    ]);
  
  return { register, transactions, landPrice, landUse, similarDeals, regionPulse };
}
```

### 3-B. 프롬프트 컨텍스트 구조화 (신규)

```typescript
// src/ai/prompts/deal-curiosity-report.ts 개선
const DATA_CONTEXT_TEMPLATE = `
## 확인된 공공 데이터 (AI 분석의 팩트 기반)

### 건축물대장 (국토부)
- 주용도: {mainPurpose}
- 연면적: {totalFloorArea}㎡ ({pyung}평)
- 지상/지하: {floors}F / B{undergroundFloors}
- 준공년도: {buildYear}년
- 주구조: {mainStructure}
- 건폐율/용적률: {bcr}% / {far}%

### 최근 실거래가 (국토부 MOLIT, {district})
{transactions} ← 최근 3건 나열

### 공시지가 ({year}년 기준)
- 평당 공시지가: {pricePerSqm}만원
- 시세 대비 추정 비율: {ratio}%

### 토지이용계획
- 용도지역: {zoning}
- 주요 규제: {restrictions}

### 플랫폼 유사 딜 참조 (RAG)
{similarDeals} ← 상위 2건의 knowledge/warning

### {district} 권역 시장 현황 (credeal.net)
- 수요 강도: {demandScore}/100
- 공급 지수: {supplyScore}/100  
- 시장 방향: {trendDirection}
- 평균 매물 체류일: {avgHoldDays}일

※ 위 데이터를 팩트로 활용하여 분석하되, 가격/수익률/법률 확정 금지
`;
```

### 3-C. 루브릭 기반 점수 엔진 (신규)

```typescript
// src/domain/building/deal-curiosity-scorer.ts (신규)
function computeDealCuriosityScore(context: BuildingDataContext): RubricScore {
  return {
    location: scoreLocation(context),      // 0-25점: 역세권, 상권, 개발호재
    assetClarity: scoreAsset(context),     // 0-20점: 건축물대장 완성도
    pricingSignal: scorePricing(context),  // 0-20점: 실거래가 대비 합리성
    demandEvidence: scoreDemand(context),  // 0-20점: 매수자 관심도
    storyStrength: scoreStory(context),    // 0-15점: 딜 시나리오 구체성
    total: 합산,
    rationale: { 각 항목별 근거 텍스트 }
  };
}
```

---

## 축 4. 시장 대응 전략 UX 고도화 (MECE)

### 4-A. 지표 투명성 개선 (신규 컴포넌트)

```
현재: "수요 강도 85 pts" → 숫자만 표시
개선: "수요 강도 85 pts" + 툴팁(?) 클릭 시 근거 표시
  └── "국토부 실거래가 32건 (40%) + S/A매칭 8건 (35%) + 뉴스 bullish 67% (25%)"
```

**UI 변경:** `AntifragileMode.tsx`에 각 지표 카드에 `데이터 근거` 아이콘 추가

### 4-B. 나의 포트폴리오 맞춤 (개인화)

```
현재: 고정 지역/자산유형 (trend?.region ?? "성동구 성수동")
개선: 브로커의 활성 매물 분포에서 자동 선택
  └── 예: 강남구 오피스 3건, 서초구 근생 2건 → "강남구 오피스" 기준 지표
```

**구현:** `page.tsx`에서 `building_ssot_lite` 통계 집계 후 최빈 region/assetType 자동 선택

### 4-C. 시계열 트렌드 시각화 (신규)

```
현재: 스냅샷 단일 값 표시
개선: 최근 8주 추이 스파크라인 차트
  └── market_leading_indicators 테이블 history 활용
```

**UI 추가:** 수요/공급 스코어 아래 미니 스파크라인 (SVG/Recharts)

### 4-D. 행동 지침 구체화 (신규 로직)

```
현재: 시장 방향에 따라 고정 텍스트 2종 (up/down)
개선: 지표 조합에 따른 8가지 시나리오
```

| 시나리오 | 조건 | 핵심 행동 |
|---------|------|---------|
| 🚀 전속질주 | demand>70, supply<40, trend=up | "지금 블라인드 티저 발송" |
| ⚡ 속도 우선 | demand>60, holdDays<15 | "매칭 피드백 24h 내 회신" |
| 🎯 선별 집중 | demand>60, supply>60 | "S등급 매수자만 집중 접촉" |
| ⚖️ 정보 우위 | flat 시장 | "데이터 시트 먼저 공유" |
| 💰 가격 조정 | 저항선>10%, holdDays>30 | "매도인 가격 재협상 제안" |
| 🔑 임대 전환 | demand<40, trend=down | "임대차 딜카드 전환" |
| 📊 대기 관리 | supply>70, demand<40 | "매수 대기 고객 업데이트" |
| 🛡️ 리스크 방어 | demand<30, trend=down | "포트폴리오 점검" |

### 4-E. 알림 시스템 연동 (신규)

```
트리거 조건:
  - trendDirection 변경 시 → 푸시 알림 "시장 방향이 up→flat으로 변경"
  - avgHoldDays 30일 초과 → "매물 {X} 장기 체류 경고"
  - 가격 저항선 15% 초과 → "가격 조정 제안 시기"
  
구현: activity_events → webhook → FCM/카카오 알림
```

---

## 축 5. 피드백 루프 — 지표 자기개선 시스템 (MECE)

### 5-A. 브로커 행동 → 데이터 피드백

```
브로커 액션 → 데이터 축적 경로:

매칭 수락/거절 → match_results.grade
  └── demandScore 자동 보정

가격 협상 결렬 클릭 → match_failure_logs.price_gap_pct
  └── priceResistanceBand 자동 보정

파이프라인 단계 이동 → deal_pipeline_states
  └── avgHoldDays 자동 보정

딜카드 조회 후 Gate 요청 → activity_events
  └── 매수자 관심도 → demandScore 보정
```

**핵심 구현:** 중개인이 "매수 거절, 가격 이슈" 버튼 1클릭으로 `trackMatchFailure()` 호출

### 5-B. AI 품질 피드백 루프

```
이미 구현됨:
  └── hallucination-detector.ts: 가격이상, 지역환각, Zod 붕괴율 감지

추가 필요:
  └── 브로커가 "AI 분석이 틀렸어요" 신고 버튼
  └── 신고 시 → ai_runs.anomaly_flags에 'broker_rejection' 추가
  └── 누적 rejection 10% 이상 → 프롬프트 자동 알림
```

### 5-C. 지표 정확도 사후 검증

```
매주 실행:
  - market_leading_indicators.trend_direction = "up" 예측 건 중
  - 실제 deal_pipeline_states.stage = "closed" 달성 건 비율 계산
  - 정확도 < 60% → 운영자 알림 "지표 모델 재검토 필요"
```

---

## 실행 로드맵

```
Priority = Impact × (1/Effort) × Urgency
```

### Phase 1 — 데이터 연결 + 투명성 (1주)
> 코드 변경 최소, 환경변수 설정 + 데이터 흐름 변경

```
[ ] 1-1. MOLIT_API_KEY + DATA_GO_KR_API_KEY Vercel 환경변수 설정
[ ] 1-2. cron/daily-data-sync/route.ts 신규 작성 (MOLIT 실거래가 일별 갱신)
[ ] 1-3. building-radar.ts: 건축물대장 fire-and-forget → AI 호출 전으로 순서 변경
[ ] 1-4. deal-curiosity-report.ts: 데이터 컨텍스트 섹션 추가
[ ] 1-5. AntifragileMode.tsx: 지표 근거 툴팁 UI 추가
[ ] 1-6. page.tsx: 포트폴리오 기반 region/assetType 자동 선택
```

**기대 효과:** 빌딩 레이더 → 팩트 기반 분석으로 품질 향상. 시장 지표 → 실거래가 연동.

### Phase 2 — 지표 엔진 + RAG (2~3주)
> 기존 모듈 연결 + 신규 모듈 작성

```
[ ] 2-1. market-indicator-engine.ts: 5신호 종합 트렌드 판단 로직
[ ] 2-2. market-indicator-engine.ts: demandScore 3소스 가중평균 개선
[ ] 2-3. building-data-collector.ts 신규 작성 (병렬 수집 파이프라인)
[ ] 2-4. deal-curiosity-scorer.ts 신규 작성 (루브릭 기반 점수 엔진)
[ ] 2-5. AntifragileMode.tsx: 8가지 시나리오 행동 지침
[ ] 2-6. AntifragileMode.tsx: 스파크라인 트렌드 차트 추가
[ ] 2-7. news RSS 크롤러 실소스 연결 (한경 집코노미 RSS)
```

**기대 효과:** 수요/공급 지수의 과학적 근거 확보. RAG로 유사 딜 인사이트 제공.

### Phase 3 — 피드백 루프 + 알림 (3~4주)
> 브로커 행동 데이터 수집 → 지표 자기개선

```
[ ] 3-1. 매칭 화면에 "가격 이슈로 거절" 버튼 + trackMatchFailure() 연결
[ ] 3-2. 파이프라인 단계별 체류 시간 자동 기록
[ ] 3-3. 지표 정확도 사후 검증 weekly 리포트
[ ] 3-4. 알림 시스템: trendDirection 변경 → 브로커 알림
[ ] 3-5. AI 분석 "틀렸어요" 신고 UI + anomaly_flags 연동
[ ] 3-6. 한국부동산원 임대동향 API 실연결
```

---

## Open Questions

> [!IMPORTANT]
> **Q1. API 키 현황**: `DATA_GO_KR_API_KEY`, `MOLIT_API_KEY`가 이미 발급되어 있나요? 발급 여부에 따라 Phase 1 시작 시점이 달라집니다.

> [!IMPORTANT]
> **Q2. 구현 우선순위**: Phase 1 (데이터 연결) vs Phase 2 (지표 개선) 중 어디에 더 집중할까요?
> - Phase 1 우선: 빌딩 레이더 품질 즉시 향상 효과
> - Phase 2 우선: 대시보드 시장 지표 신뢰도 향상

> [!WARNING]
> **Q3. 뉴스 크롤링 법적 검토**: 네이버 부동산, 네이버 카페 크롤링은 이용약관 검토 필요. RSS 피드(한경 집코노미, 매경) 활용은 가능하나 상업적 이용 조건 확인 필요.

> [!NOTE]
> **Q4. 실거래가 표시 범위**: UI에서 "서초구 최근 거래가 평당 4,200만원 수준"처럼 구체적 숫자 표시 시, 부동산 중개 관련 법적 면책 조항이 추가로 필요할 수 있습니다.
