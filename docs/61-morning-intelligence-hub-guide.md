# 모닝 인텔리전스 허브 (Morning Intelligence Hub) — 시스템 가이드

> 최종 업데이트: 2026-06-04  
> 대상 독자: 개발자, 운영자, 제품 기획자

---

## 1. 개요

**모닝 인텔리전스 허브**는 상업용 부동산(CRE) 중개사가 **매일 아침 8시** 하나의 탭에서 시장 동향과 주요 정보를 한눈에 확인할 수 있는 데이터 대시보드입니다.

콜드스타트 문제(초기 사용자 부족)를 극복하기 위해 플랫폼 내부 데이터 없이도 **공공 빅데이터 + 웹 크롤링 + AI 메타 인텔리전스** 기반의 고부가가치 정보를 제공합니다.

### 핵심 가치 제안

| 문제 | 솔루션 |
|------|--------|
| 매일 아침 여러 사이트 순회 | 10개 피드를 하나의 탭에서 통합 |
| 복잡한 시장 뉴스 해석 어려움 | AI가 3줄 브리핑 + 고객 상담 화법 자동 생성 |
| 경매·공매 정보 파악 누락 | 법원 경매 신건 실시간 알림 |
| 투자 심리 파악 불가 | 소셜 감성 분석 기반 Fear & Greed Index |
| 공시지가·에너지등급 수동 조회 | 공공API 연동 자동 수집 및 비교 |

---

## 2. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                  브로커 대시보드 (Next.js)                 │
│                                                          │
│   [오늘의 현황]  [🌅 모닝 정보]  [🛡️ 안티프래질]  [📊 리포트] │
│                      ↑                                   │
│           BrokerDashboardTabs.tsx                        │
│                      ↑                                   │
│         MorningIntelligence.tsx (React Client)           │
└──────────────────────────┬───────────────────────────────┘
                           │ GET /api/broker/morning-intelligence
                           ▼
┌──────────────────────────────────────────────────────────┐
│          morning-intelligence/route.ts (API Layer)       │
│                                                          │
│  ① AI 브리핑 + 상담 화법 생성 (gpt-4o-mini)               │
│  ② 실거래 체결 알림 (external_transactions)               │
│  ③ 경매·공매 신건 알림 (auction_listings)                  │
│  ④ 권역별 공실률·임대료 (rental_market_data)               │
│  ⑤ 투자자 심리 지수 (social_sentiment)                    │
│  ⑥ 공시지가 변동 (official_land_prices)                   │
│  ⑦ 상권 분석 (commercial_district)                        │
│  ⑧ 신축·리모델링 동향 (hardcoded + permits)                │
│  ⑨ ESG/에너지 등급 분석 (energy_ratings)                  │
│  ⑩ 글로벌 리서치 리포트 요약 (external_reports)            │
└──────────────────────────┬───────────────────────────────┘
                           │
             ┌─────────────┼──────────────────┐
             ▼             ▼                  ▼
    ┌────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Supabase  │  │  OpenAI API  │  │ 크롤러/공공API │
    │  Database  │  │ (gpt-4o-mini)│  │ (market-intel) │
    └────────────┘  └──────────────┘  └──────────────┘
```

---

## 3. 데이터 파이프라인 (Data Pipeline)

### 3.1 데이터 수집 트리거

데이터 수집은 두 가지 방법으로 트리거됩니다:

**a. 수동 트리거 (UI 새로고침 버튼)**
```
MorningIntelligence.tsx → triggerCrawl()
  → GET /api/public/market-intelligence?action=crawl
  → market-crawlers.ts + gov-premium-apis.ts 병렬 실행
  → Supabase 테이블 업데이트
  → fetchIntelligence() 재호출 → 화면 갱신
```

**b. 자동 트리거 (운영 권장)**
- Supabase Edge Functions Cron 또는 외부 스케줄러로 매일 오전 7:30 `?action=crawl` 호출 설정 권장

### 3.2 데이터 수집 모듈 (`/api/public/market-intelligence`)

```
action=crawl 시 병렬 실행되는 크롤러:

crawlCreNews()         → external_news (한경/매경/조선비즈 RSS 시뮬레이션)
ingestGlobalReports()  → external_reports (CBRE/Cushman 리포트 구조화)
trackSocialSentiment() → social_sentiment (네이버카페/SNS 감성 분석)
trackYoutubeTrends()   → youtube_trends (유튜브 CRE 채널 트렌드)
crawlAuctions()        → auction_listings (법원경매/캠코공매 신건)
computeRentalMarketRates() → rental_market_data (권역별 임대 시세)

fetchRentalTrend()     → rental_trend_data (한국부동산원 API)
fetchEnergyRating()    → energy_ratings (에너지공단 API)
fetchCommercialDistrict() → commercial_district (소상공인 상권분석)
fetchOfficialLandPrice() → official_land_prices (공시지가 API)
```

> **현재 상태**: 모든 크롤러/API는 **구조화된 시뮬레이션 데이터**를 반환합니다. 실제 외부 API 연동은 Phase 2 로드맵에 포함되어 있습니다.

---

## 4. DB 테이블 스키마

Migration: `supabase/migrations/00034_poc_features.sql`

### 4.1 외부 정보 수집 테이블

| 테이블명 | 용도 | 주요 컬럼 | 유니크 제약 |
|---------|------|---------|-----------|
| `external_news` | CRE 뉴스 RSS | title, url, source, summary, sentiment | url |
| `external_reports` | CBRE/Cushman 리포트 | institution, title, structured_data(JSONB) | - |
| `social_sentiment` | SNS/카페 감성 분석 | keyword, sentiment_score, mention_count | - |
| `youtube_trends` | 유튜브 CRE 동향 | video_id, view_count, summary | video_id |
| `auction_listings` | 법원경매/공매 신건 | case_number, court, appraised_value, minimum_bid | case_number |
| `rental_market_data` | 권역별 임대 시세 | region, building_type, deposit_avg, vacancy_rate | - |

### 4.2 공공 API 연동 테이블

| 테이블명 | 용도 | 주요 컬럼 | 유니크 제약 |
|---------|------|---------|-----------|
| `rental_trend_data` | 한국부동산원 임대 지수 | region, quarter, rental_index | (region, quarter) |
| `land_use_plans` | 토지이음 용도지역 | pnu, zoning, restrictions | pnu |
| `energy_ratings` | 에너지공단 등급 | building_id, rating, annual_energy_consumption | - |
| `commercial_district` | 소상공인 상권 분석 | district_code, sales_volume_index, footfall_index | district_code |
| `official_land_prices` | 공시지가 | pnu, year, price_per_sqm | (pnu, year) |

---

## 5. API 상세

### 5.1 `GET /api/broker/morning-intelligence`

**인증**: Bearer Token 필수 (broker 또는 admin 역할)

**쿼리 파라미터**:
- `region`: `seongsu` | `gbd` | `ybd` (기본값: `gbd`)

**응답 구조**:
```typescript
{
  success: boolean;
  region: string;           // 선택된 권역 코드
  district: string;         // 한국어 지역명 (강남구, 성동구, 영등포구 등)
  data: {
    briefing: string;             // AI 생성 3줄 시장 브리핑
    counselScript: string;        // AI 생성 고객 상담 화법
    yesterdayTransactions: {      // 국토부 실거래 체결 내역
      title, desc, date, tag
    }[];
    auctions: {                   // 법원경매/캠코 신건
      title, desc, date, tag
    }[];
    rentalMarket: {               // 권역별 임대 현황
      type, deposit, rent, vacancy, source
    }[];
    sentiment: {                  // Fear & Greed Index
      score: number;              // 0~100
      status: string;             // "탐욕" | "보합" | "공포"
      description: string;
    };
    landPriceTrend: {             // 공시지가 변동
      pnu, latestYear, latestPrice, prevPrice, changePct
    };
    commercialDistrict: {         // 상권 분석
      name, salesIndex, footfallIndex
    };
    constructionPermits: {        // 신축·리모델링 동향
      text, detail
    }[];
    esgValueUp: {                 // ESG/에너지 등급
      grade, opportunity, benefit
    };
    globalReports: {              // 글로벌 리서치 요약
      institution, title, summary, url
    }[];
  };
  timestamp: string;
}
```

**AI 생성 로직**:
- `external_news` 최신 3건을 LLM 컨텍스트로 사용
- `gpt-4o-mini` (temperature=0.7, max_tokens=600)
- LLM 실패 시 권역별 하드코딩 fallback 자동 적용

### 5.2 `GET /api/public/market-intelligence`

**인증**: 불필요 (공개 API)

| 파라미터 | 값 | 동작 |
|---------|---|------|
| `action` | `crawl` | 모든 크롤러 + 공공 API 병렬 실행, DB 업데이트 |
| (없음) | - | DB에서 최신 데이터 조회하여 응답 |

### 5.3 `GET /api/pulse/morning-briefing`

**인증**: 불필요 (공개 API)

**쿼리 파라미터**: `region`

AI 기반 공개 모닝 브리핑 API. Pulse 페이지(`/pulse`)에서 활용. 내부 심리 지수(`market_sentiment_polls`)와 뉴스를 결합하여 브리핑 생성.

---

## 6. 프론트엔드 컴포넌트

### 6.1 진입 경로

```
URL: /broker  (로그인 후 리다이렉트)
  → BrokerDashboardTabs (탭 4개)
      ├── "오늘의 현황" → 기존 딜 파이프라인 뷰
      ├── "🌅 모닝 정보" → MorningIntelligence.tsx ← 여기
      ├── "🛡️ 안티프래질" → 리스크 분석 뷰
      └── "📊 리포트" → 주간 리포트 뷰
```

### 6.2 `MorningIntelligence.tsx` 구조

```
MorningIntelligence
├── [헤더] 지역 필터 (성수동 / 강남 GBD / 여의도) + 새로고침 버튼
├── [로딩] 스켈레톤 애니메이션 (pulse)
└── [데이터 로드 완료]
    ├── Card A: AI 마켓 에디터 브리핑 (gpt-4o-mini, indigo 그라디언트)
    │   └── 💬 오늘의 권장 상담 화법 (클립보드 복사 기능)
    └── Grid 2열 레이아웃
        ├── 🏠 오늘의 실거래 체결 알림
        ├── 🔨 경매 & 공매 신건 알림
        ├── 📊 권역별 임대 및 공실 현황 (테이블)
        ├── 🌡️ 투자자 감성 & 심리 지수 (시각적 게이지)
        ├── 📈 대표 지번 공시지가 변동률
        ├── 🗺️ 상권 분석 인덱스 (F&B 매출/유동인구)
        ├── 🏗️ 신축 및 리모델링 인허가 동향
        ├── ⚡ 에너지 등급 & ESG 가치 투자
        └── 🌐 글로벌 부동산 컨설팅 리포트 요약 (전체 너비)
```

### 6.3 지원 지역 (Region Code)

| UI 레이블 | region 파라미터 | district 매핑 |
|-----------|--------------|-------------|
| 성수동 | `seongsu` | 성동구 |
| 강남 GBD | `gbd` | 강남구 |
| 여의도 | `ybd` | 영등포구 |

---

## 7. 데이터 플로우 다이어그램

```
[사용자] → 탭 클릭 "🌅 모닝 정보"
    │
    ▼
MorningIntelligence.tsx useEffect() 실행
    │
    ▼
GET /api/broker/morning-intelligence?region=seongsu
    │
    ├─── [DB 조회] external_news (최신 3건)
    ├─── [LLM] gpt-4o-mini 브리핑 + 화법 생성
    │     └─── [실패 시] 권역별 fallback 텍스트
    ├─── [DB 조회] external_transactions (해당 구 최신 3건)
    ├─── [DB 조회] auction_listings (주소 ILIKE 검색, 2건)
    ├─── [DB 조회] rental_market_data (region=seongsu, 3건)
    ├─── [DB 조회] social_sentiment (전체 평균 점수)
    ├─── [DB 조회] official_land_prices (PNU 기반 2년치)
    ├─── [DB 조회] commercial_district (지역 코드 D001/D002)
    ├─── [하드코딩] constructionPermits (권역별 템플릿)
    ├─── [DB 조회] energy_ratings (1건)
    └─── [DB 조회] external_reports (최신 2건)
    │
    ▼
JSON 응답 → 컴포넌트 렌더링
```

---

## 8. 권역별 PNU 매핑

공시지가 조회 시 사용하는 토지 고유 번호(PNU):

| 권역 | PNU | 설명 |
|------|-----|------|
| GBD (강남) | `1168010100101230045` | 강남구 삼성동 대표 필지 |
| 성수동 | `1120011400100450012` | 성동구 성수동 대표 필지 |
| YBD (여의도) | `1156011000100340001` | 영등포구 여의도동 대표 필지 |

---

## 9. 운영 가이드

### 9.1 데이터 갱신 주기

| 데이터 유형 | 권장 갱신 주기 | 방법 |
|------------|-------------|------|
| CRE 뉴스 | 매일 1회 (오전 7:30) | Cron → `?action=crawl` |
| 경매 신건 | 매일 1회 | Cron → `?action=crawl` |
| 임대 시세 | 주 1회 (월요일) | Cron → `?action=crawl` |
| 공시지가 | 연 1회 (1월) | 수동 업데이트 |
| AI 브리핑 | 요청 시 실시간 생성 | LLM 호출 (캐시 없음) |

### 9.2 운영 체크리스트

```
□ 매일 아침 7:30 크롤러 Cron 정상 실행 확인
□ external_news 테이블 최신 데이터 3건 이상 존재 확인
□ OpenAI API 키 유효성 확인 (AI 브리핑 핵심)
□ Supabase Service Role Key 환경변수 확인
□ auction_listings 중복 case_number 충돌 모니터링
```

### 9.3 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=...       # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...  # Supabase 익명 키
SUPABASE_SERVICE_ROLE_KEY=...      # 서비스 롤 키 (크롤러 사용)
OPENAI_API_KEY=...                 # AI 브리핑 생성 (gpt-4o-mini)
```

### 9.4 오류 처리 및 Fallback 전략

| 오류 상황 | Fallback 동작 |
|----------|-------------|
| LLM API 실패 | 권역별 하드코딩 브리핑 텍스트 반환 |
| DB 빈 테이블 | 권역별 시뮬레이션 데이터 반환 |
| 인증 실패 | 401 에러 + 로그인 리다이렉트 |
| 전체 API 오류 | 500 에러 + 에러 메시지 표시 |
| 크롤러 부분 실패 | 성공한 항목만 DB 저장 |

---

## 10. 콜드스타트 해결 전략

모닝 인텔리전스 허브는 초기 사용자 수에 관계없이 **독립적으로 가치를 제공**합니다:

### 10.1 플랫폼 독립 데이터 소스

```
공공 빅데이터 레이어:
  ├── 국토부 실거래가 API → external_transactions
  ├── 한국부동산원 임대 지수 → rental_trend_data
  ├── 공시지가 API → official_land_prices
  ├── 소상공인 상권 분석 → commercial_district
  └── 에너지공단 효율 등급 → energy_ratings

웹 크롤링 레이어:
  ├── CRE 뉴스 RSS (한경/매경/조선비즈) → external_news
  ├── 법원경매 신건 → auction_listings
  ├── 유튜브 CRE 트렌드 → youtube_trends
  └── SNS/카페 감성 분석 → social_sentiment

메타 인텔리전스 레이어:
  ├── CBRE/Cushman 리포트 구조화 → external_reports
  └── gpt-4o-mini AI 종합 분석 → 실시간 브리핑
```

### 10.2 성숙도별 진화 경로

| Phase | 데이터 소스 | 상태 |
|-------|----------|------|
| **Phase 1 (현재)** | 시뮬레이션 데이터 + AI 브리핑 | ✅ 구현 완료 |
| **Phase 2** | 실제 공공 API 연동 (국토부, 부동산원) | 🔜 로드맵 |
| **Phase 3** | 실시간 웹 크롤러 (뉴스 RSS, 경매 사이트) | 🔜 로드맵 |
| **Phase 4** | 플랫폼 내부 거래 데이터 통합 | 🔜 로드맵 |

---

## 11. 실제 외부 API 연동 준비 가이드 (Phase 2)

### 11.1 공공데이터포털 API 신청 목록

| API | 제공 기관 | 엔드포인트 예시 |
|-----|----------|--------------|
| 국토부 실거래가 | data.go.kr | `/RTMSDataSvcNrgTrade` |
| 한국부동산원 임대 지수 | reb.or.kr | 별도 신청 필요 |
| 공시지가 (표준지) | data.go.kr | `/KobIsLandStdService` |
| 소상공인 상권 분석 | data.go.kr | `/SbFlpStatsUploadService` |
| 에너지 효율 등급 | data.go.kr | (에너지공단 OpenAPI) |

### 11.2 연동 교체 절차

1. `src/domain/external/gov-premium-apis.ts` 내 각 함수의 `dummyData` 객체를 실제 API 호출로 교체
2. `.env.local`에 각 API 키 추가
3. 실패 시 fallback은 기존 시뮬레이션 데이터 유지 (graceful degradation)

### 11.3 웹 크롤러 실제화 절차

1. `src/domain/external/market-crawlers.ts` 내 `dummyNews` 등을 실제 fetch/파싱으로 교체
2. 아래 RSS 피드 활용 가능:
   - 한경 부동산: `https://www.hankyung.com/feed/realestate`
   - 매경 부동산: RSS 피드 확인 후 적용
3. 법원경매 정보: 대법원 e-court 또는 지지옥션 크롤링 고려

---

## 12. 소스코드 파일 맵

| 역할 | 파일 경로 |
|------|---------|
| UI 컴포넌트 | `src/components/dashboard/MorningIntelligence.tsx` |
| 탭 컨테이너 | `src/components/dashboard/BrokerDashboardTabs.tsx` |
| 메인 API | `src/app/api/broker/morning-intelligence/route.ts` |
| 크롤러 트리거 API | `src/app/api/public/market-intelligence/route.ts` |
| 공개 브리핑 API | `src/app/api/pulse/morning-briefing/route.ts` |
| 크롤러 도메인 | `src/domain/external/market-crawlers.ts` |
| 공공 API 클라이언트 | `src/domain/external/gov-premium-apis.ts` |
| DB 마이그레이션 | `supabase/migrations/00034_poc_features.sql` |

---

## 13. 향후 개선 아이디어 (Backlog)

### 단기 (1~2주)
- [ ] 모닝 브리핑 카카오톡/SMS 푸시 알림 발송 기능
- [ ] 브리핑 히스토리 아카이브 뷰 (날짜별 조회)
- [ ] 지역 필터 저장 (사용자 선호 권역 기억)

### 중기 (1~2개월)
- [ ] 실제 공공 API 연동 (국토부, 부동산원)
- [ ] 나의 매물과 연결된 개인화 브리핑
- [ ] 권역 추가: 판교, 마포, 용산

### 장기 (3개월+)
- [ ] 예측 모델 기반 "이 주 주목 매물" 자동 추천
- [ ] 중개사 커뮤니티 연동 (아고라) 실시간 집단 지성 반영
- [ ] 글로벌 CRE 지수 연동 (JLL, Knight Frank)

---

*이 문서는 cre-dealcard 프로젝트의 `docs/` 디렉토리에서 관리됩니다.*  
*관련 문서: `docs/23-poc-api-integration-guide.md`, `docs/21-pulse-oiticle-operations-guide.md`*
