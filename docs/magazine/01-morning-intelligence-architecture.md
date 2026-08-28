# 01. 모닝 인텔리전스 아키텍처 (Morning Intelligence Architecture)

> **감사 일시**: 2026-08-28 | **감사 범위**: src/components/dashboard, src/app/api/broker/morning-intelligence, src/domain/external

---

## 1. 개요

**Morning Intelligence Hub**는 CRE 1인 중개사가 매일 아침 하나의 대시보드 탭에서 권역별(성수, GBD, YBD) 시장 동향을 한눈에 파악하고, AI가 생성한 브리핑과 고객 상담 화법을 즉시 활용할 수 있는 인텔리전스 엔진입니다.

### 핵심 가치
- **콜드스타트 극복**: 플랫폼 내 거래 데이터 없이도 공공 빅데이터 + 웹 크롤링으로 즉시 작동
- **브로커 개인화**: 보유 매물·활성 매수자 데이터와 시장 실거래를 비교 분석하여 동적 액션 리스트 제공
- **매거진 에코시스템 통합**: 발견한 뉴스·경매를 버튼 하나로 주간 매거진 초안에 임베드
- **할루시네이션 가드**: LLM 프롬프트에 엄격한 수치 검증 및 데이터 부재 시 스킵 규칙 적용

---

## 2. 3대 운영 모드

### 2.1 🏢 HQ 브리핑 (자동 수집)

매일 Cron 및 공공/웹 크롤러로 집계된 데이터를 기반으로 LLM이 자동 생성:
- 5~7줄 소스태그별 시장 브리핑
- 매수자 카톡 상담 화법
- 오늘의 리스크 신호
- 개인화 액션 리스트

```
[08:00 KST Cron] → 11개 데이터소스 병렬 조회 → LLM 브리핑 합성 → 9개 위젯 카드 렌더링
```

### 2.2 📋 마이 인텔 (수동 수집/자료 복붙)

브로커가 복사한 뉴스/기사/카톡 메모(최대 10건)를 AI가 구조화:
- 항목별 1줄 요약 + 시장 의미
- 종합 인사이트
- 액션 아이템
- 감성 점수

### 2.3 🔗 커스텀 (HQ + 마이 인텔 결합)

HQ 브리핑과 마이 인텔을 AI가 결합:
- 중복 제거/통합 커스텀 브리핑
- 전화 스크립트
- 액션 리스트
- 매거진 에디터로 1-클릭 전송

---

## 3. 메인 UI 컴포넌트 구조

### [MorningIntelligence.tsx](file:///c:/Users/User/cre-dealcard/src/components/dashboard/MorningIntelligence.tsx) (1,153 lines)

모닝 인텔리전스의 핵심 클라이언트 컴포넌트:

| 영역 | 라인 | 설명 |
|------|------|------|
| `RichBriefing` | L41 | AI 리치 브리핑 렌더러 (마크다운, 태그별 하이라이트) |
| `CircleGauge` | L89 | 투자 심리 원형 게이지 (0~100) |
| `MiniBar` | L112 | 미니 바차트 (거래량·가격 추이) |
| 3탭 전환 | - | `hq` \| `my` \| `custom` 모드 |
| 권역 필터 | - | `seongsu`, `gbd`, `ybd` |
| `handleKakaoShare` | L282 | 카카오톡 피드 SDK 공유 |
| `handleShareLink` | L266 | Web Share API 공유 |
| `triggerCrawl` | L320 | 수동 크롤링 트리거 |
| `handleMyIntelProcess` | L326 | 마이 인텔 AI 정리 요청 |
| `handleCombine` | L354 | HQ+마이 결합 브리핑 생성 |

**9개 위젯 카드 그리드**:
1. 실거래 현황
2. 경매 신건
3. 임대·공실률
4. 투자 심리 지수 (Fear & Greed)
5. 상권 분석 (매출/유동인구)
6. 공시지가 추이
7. 인허가 동향
8. 글로벌 리포트
9. 유튜브 트렌드

### [BrokerDashboardTabs.tsx](file:///c:/Users/User/cre-dealcard/src/components/dashboard/BrokerDashboardTabs.tsx) (82 lines)

브로커 대시보드 3단 탭 네비게이션:
1. ⚡ 지금 처리 (액션 큐)
2. 📊 현황 (파이프라인)
3. 📈 인텔리전스 → `MorningIntelligence` 렌더링

### [morning-detail/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/morning-detail/page.tsx) (239 lines)

인텔리전스 상세 드릴다운 페이지 (`/broker/morning-detail?region={region}&section={section}`):
- 섹션별 심층 테이블 및 차트: `transactions`, `auctions`, `rentals`, `permits`, `briefing`
- 공공데이터포털 및 대법원 경매정보 외부 링크
- "이 소식으로 매거진 작성하기" CTA 버튼

---

## 4. 데이터 수집 파이프라인

### 4.1 웹 & 뉴스 크롤러 — [market-crawlers.ts](file:///c:/Users/User/cre-dealcard/src/domain/external/market-crawlers.ts) (496 lines)

| 함수 | 데이터소스 | 산출물 |
|------|-----------|--------|
| `crawlCreNews()` | 한경, 매경, 이데일리, 조선비즈, 서경, 머니투데이 RSS + BigKinds + 네이버 뉴스 | `external_news` |
| `scoreNewsBatch()` | LLM 배치 | CRE 적합도(1~10), 권역, 토픽(8종), 감성 태깅 |
| `enhancedSummarize()` | 7점↑ 중요 뉴스 | 팩트/임플리케이션/액션 3줄 요약 |
| `ingestGlobalReports()` | CBRE, 쿠시먼, 부동산플래닛, 알스퀘어 | `external_reports` |
| `trackSocialSentiment()` | 네이버 카페/커뮤니티 | `social_sentiment` |
| `trackYoutubeTrends()` | 유튜브 CRE 채널 | `youtube_trends` |
| `crawlAuctions()` | 네이버 경매 뉴스 → LLM 구조화 | `auction_listings` |
| `computeRentalMarketRates()` | 권역별 임대/공실 뉴스 → LLM | `rental_market_data` |

### 4.2 정부 공공 API — [gov-premium-apis.ts](file:///c:/Users/User/cre-dealcard/src/domain/external/gov-premium-apis.ts) (282 lines)

| 함수 | API 출처 | 대상 테이블 |
|------|---------|-------------|
| `fetchCommercialTransactions()` | 국토부 `RTMSDataSvcSh` | `external_transactions` |
| `fetchRentalTrend()` | 한국부동산원 `OfcMktService` | `rental_trend_data` |
| `fetchLandUsePlan()` | 토지이음 | `land_use_plans` |
| `fetchEnergyRating()` | 한국에너지공단 `BldrgEnergyRatingService` | `energy_ratings` |
| `fetchCommercialDistrict()` | SEMAS `sdsc2` | `commercial_district` |
| `fetchOfficialLandPrice()` | 국토부 `fetchLandPrice` | `official_land_prices` |
| `fetchConstructionPermits()` | 국토부 세움터 `ArchPmsService` | `construction_permits` |

---

## 5. 복합 투자 심리 지수 (Fear & Greed Index)

메인 API 라우트 ([route.ts L336-369](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/route.ts#L336-L369))에서 산출:

```
복합 심리 지수 = (뉴스 감성 × 40%) + (경매 최저가율 × 30%) + (거래량 변화율 × 30%)
```

| 구성 요소 | 가중치 | 산출 방식 |
|-----------|--------|----------|
| 뉴스 감성 | 40% | 수집된 뉴스의 bullish/bearish/neutral 비율 가중 평균 |
| 경매 최저가율 | 30% | 감정가 대비 최저 입찰가 비율의 권역 평균 |
| 거래량 변화율 | 30% | 최근 30일 vs 이전 30일 실거래 건수 증감률 |

**결과**: 0~100 수치 → `CircleGauge` 위젯으로 시각화

---

## 6. LLM 브리핑 생성

### 메인 브리핑 (HQ)
- **모델**: `gpt-4o-mini` / `terra`
- **입력**: 11개 DB 테이블 병렬 조회 + 브로커 보유 매물 + 매수자 의향 + 매거진 성과
- **산출물**:
  1. 소스태그별 5~7줄 시장 브리핑
  2. 카카오톡 상담 화법 (클립보드 복사용)
  3. 리스크 신호
  4. 개인화 액션 리스트 ("오늘 누구에게 전화해야 하는지")

### 마이 인텔 (Custom)
- **모델**: `luna`
- **입력**: 사용자 복붙 1~10건 텍스트
- **산출물**: 항목별 요약/의미, 종합 인사이트, 액션 아이템, 감성 점수

### 결합 브리핑 (Combine)
- **모델**: `terra`
- **입력**: HQ 텍스트 + 마이 인텔 항목
- **산출물**: 중복 제거 통합 브리핑, 전화 스크립트, 액션 리스트

---

## 7. Cron 스케줄링

[vercel.json](file:///c:/Users/User/cre-dealcard/vercel.json) 설정:

```json
{
  "path": "/api/cron/morning-briefing",
  "schedule": "0 23 * * *"
}
```

| 항목 | 값 |
|------|----|
| 실행 시간 | 매일 UTC 23:00 = **KST 08:00 AM** |
| 보안 | `CRON_SECRET` Bearer 토큰 검증 |
| 수행 작업 | `market-crawlers.ts` + `gov-premium-apis.ts` 전체 병렬 실행 |
| 핸들러 | [/api/cron/morning-briefing/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/morning-briefing/route.ts) (100 lines) |

---

## 8. 공개 Pulse 연동

| 엔드포인트 | 설명 |
|-----------|------|
| [/api/pulse/morning-briefing](file:///c:/Users/User/cre-dealcard/src/app/api/pulse/morning-briefing/route.ts) | 네이버 뉴스 + `market_sentiment_polls` + LLM → 공개 3줄 브리핑 |
| [/pulse/\[region\]/\[period\]](file:///c:/Users/User/cre-dealcard/src/app/(public)/pulse/[region]/[period]/page.tsx) | 공개 시장 펄스 뷰어 |
| [/api/public/market-intelligence](file:///c:/Users/User/cre-dealcard/src/app/api/public/market-intelligence/route.ts) | `?action=crawl` 수동 트리거 / 기본: 수집 데이터 반환 |

---

## 9. 테스트 커버리지

### 단위/도메인 테스트
- [market-crawlers.test.ts](file:///c:/Users/User/cre-dealcard/src/tests/domain/market-crawlers.test.ts): 뉴스/리포트 수집 검증

### E2E 파이프라인 회귀 테스트
[mece-v2-pipeline-runner.ts L281-295](file:///c:/Users/User/cre-dealcard/src/tests/e2e/mece-v2-pipeline-runner.ts#L281-L295):

| 테스트 ID | 시나리오 | 기대 결과 |
|-----------|---------|----------|
| `INTEL-01` | `GET /api/broker/morning-intelligence` 비인가 | 401 |
| `INTEL-02` | `POST /api/broker/morning-intelligence/custom` 비인가 | 401 |
| `INTEL-03` | `GET /api/cron/morning-briefing` 비인가 | 401 |

---

## 10. 매거진 연동 포인트

| 연동 지점 | 설명 |
|-----------|------|
| `useMagazineDraft` 훅 | 인텔리전스 카드의 `[📰 매거진 추가]` 클릭 시 매거진 초안에 즉시 저장 |
| `MagazineInsightCard` | 인텔리전스 상단에 매거진 성과 지표 피드백 카드 렌더링 |
| `weekly-generator.ts` | 주간 매거진 생성 시 `external_news`, `auction_listings`, `external_transactions` 테이블을 원천 데이터로 활용 |
| morning-detail CTA | "이 소식으로 매거진 작성하기" 버튼으로 에디터 연결 |
