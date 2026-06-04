# 23-poc-api-integration-guide.md
# PoC v2 8대 축 47개 기능 API 및 연동 규격서

이 문서는 상업용 부동산(CRE) DealCard 프로젝트의 소구력 강화 v2 고도화에서 구현된 47개 신규 기능(썸트렌드 E1 제외)의 API 엔드포인트 규격 및 데이터 연동 아키텍처를 정의합니다.

---

## 1. 데이터베이스 인프라 구조 (00034_poc_features)

새롭게 추가된 22개 테이블의 스키마 명세 및 용도 요약입니다.

| 분류 | 테이블명 | 용도 | 핵심 필드 |
|---|---|---|---|
| **설문 & 분석 (⑦)** | `poc_surveys` | 온보딩/중간/종료 3단계 인앱 설문 데이터 저장 | `step_index` (1~3), `answers` (JSONB) |
| | `market_sentiment_polls` | 현장 중개사 주간 경기 체감 투표 | `score` (0~100), `sentiment` (bullish/neutral/bearish) |
| | `content_share_events` | 큐레이션 공유 링크 열람 및 클릭 트래킹 | `share_id` (UUID), `event_type` (view/click/scroll/cta_click) |
| | `lead_scores` | 고객 관심도 점수 (Lead Scoring) 집계 | `score` (0~100), `engagement_count`, `metadata` (JSONB) |
| | `content_curations` | 브로커 뉴스레터/큐레이션 마스터 테이블 | `broker_id` (UUID), `title` |
| | `curation_items` | 뉴스레터 내 포함된 매물/뉴스/커스텀 항목 관계 | `item_type` (dealcard/news/report/custom), `sort_order` |
| | `content_ab_tests` | 동일 큐레이션의 A/B 대안 테스트 성과 지표 | `variant` (A/B), `views`, `clicks` |
| **외부 데이터 (⑤)** | `external_news` | 부동산 전문 뉴스 매체 크롤링 데이터 | `url` (Unique), `title`, `summary`, `sentiment` |
| | `external_reports` | CBRE/쿠시먼 등 글로벌 분기 보고서 핵심 통계 | `institution`, `structured_data` (JSONB) |
| | `social_sentiment` | 네이버 부동산 카페 등 소셜 버즈 분석 지표 | `keyword`, `sentiment_score`, `mention_count` |
| | `youtube_trends` | CRE 전문 유튜버 인기 영상 토픽 | `video_id` (Unique), `view_count`, `summary` |
| | `auction_listings` | 대법원 경매 및 캠코 공매 물건 목록 | `case_number` (Unique), `appraised_value`, `minimum_bid` |
| | `rental_market_data` | 네이버부동산 호가 및 외부 실거래 혼합 시세 | `region`, `deposit_avg`, `monthly_rent_avg`, `vacancy_rate` |
| **공공 API (①)** | `rental_trend_data` | 한국부동산원 권역별 분기 공식 임대동향 | `region`, `quarter`, `vacancy_rate`, `rental_index` |
| | `land_use_plans` | 토지e음 토지이용계획 규제 및 용적률 | `pnu` (Unique), `zoning`, `restrictions` |
| | `energy_ratings` | 에너지공단 건물 연간 에너지 효율 및 등급 | `building_id` (UUID), `rating`, `annual_energy_consumption` |
| | `commercial_district` | 소상공인시장진흥공단 핵심 상권 지수 | `district_code` (Unique), `sales_volume_index`, `footfall_index` |
| | `official_land_prices` | 국토부 연도별 공시지가 정보 | `pnu`, `year`, `price_per_sqm` (Composite PK) |
| **생태계 & 스튜디오**| `co_brokerage_requests`| 브로커 간 공동중개 제안 및 수수료 분배서 | `building_id`, `commission_split`, `status` (pending/accepted) |
| | `buyer_wishlists` | 매수자의 투자 목적 및 선호 권역 매칭 조건 | `buyer_id`, `regions` (TEXT[]), `budget_max` |
| | `vendor_reviews` | 빌딩 리모델링/세무/설계 협력 벤더 평가 | `vendor_id`, `rating` (1~5), `review_text` |
| | `share_pages` | 큐레이션 화이트라벨 모바일 페이지 설정 | `curation_id`, `custom_subdomain` (Unique), `theme_color` |

---

## 2. API 엔드포인트 명세

### 2-1. G1-G7: 설문, 이벤트 트래킹 및 체감 지수 API

#### 📋 G1: PoC 3단계 인앱 설문 API
* **엔드포인트**: `POST /api/public/surveys`
* **설명**: 온보딩(1단계), 중간(2단계), 종료(3단계) 설문 응답을 저장합니다.
* **Request Body**:
  ```json
  {
    "userId": "d3b07384-d113-4a1b-bc5b-439589d97034",
    "stepIndex": 1,
    "answers": {
      "preferredRegion": "seongsu",
      "monthlyDealsCount": 5,
      "expectations": "60초 만에 작성되는 블라인드 매물장"
    }
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": { "id": "survey-uuid", "step_index": 1, ... }
  }
  ```

#### 📡 G2: 활동 이벤트 및 공유 트래킹 API
* **엔드포인트**: `POST /api/public/events`
* **설명**: 큐레이션 링크 열람, 클릭, 스크롤 행동(share_event) 및 일반 기능 활성화(G2 퍼널)를 저장합니다.
* **Request Body (큐레이션 열람 추적)**:
  ```json
  {
    "type": "share_event",
    "shareId": "cf37bd94-3453-488f-9a1c-83b9d031c104",
    "viewerId": "anonymous-or-client-id",
    "eventType": "click",
    "metadata": {
      "element": "seongsu-80b-dealcard",
      "durationSeconds": 45
    }
  }
  ```
* **Request Body (G2 일반 기능 퍼널 기록)**:
  ```json
  {
    "type": "activity_event",
    "eventType": "kakao_copy_clicked",
    "entityType": "building_ssot_lite",
    "entityId": "building-uuid",
    "metadata": { "channel": "mobile_kakao" }
  }
  ```

#### 📈 G7: 경기 체감 투표 및 종합 체감 지수 산출 API
* **엔드포인트**: `POST /api/public/sentiment-poll`
* **설명**: 주 1회 중개사의 현장 경기 투표(0~100점)를 저장합니다.
* **Request Body**:
  ```json
  {
    "brokerId": "broker-uuid",
    "score": 90,
    "sentiment": "bullish",
    "comment": "성수 권역 임차 수요 상승 지속"
  }
  ```
* **엔드포인트**: `GET /api/public/sentiment-poll`
* **설명**: 전체 중개사 투표 데이터를 집계하여 '현장 경기 체감지수' 및 감성 분포 백분율을 반환합니다.
* **Response (200 OK)**:
  ```json
  {
    "index": 68,
    "totalResponses": 45,
    "bullishPct": 60,
    "neutralPct": 25,
    "bearishPct": 15
  }
  ```

---

### 2-2. E2-E7: 외부 데이터 크롤링 및 인텔리전스 API

#### 🗞️ E2-E7: 외부 부동산 인텔리전스 수집/조회 API
* **엔드포인트**: `GET /api/public/market-intelligence?action=crawl`
* **설명**: 한경/매경 크롤링 뉴스(E2), CBRE/쿠시먼 보고서(E3), 카페 감성(E4), 유튜브 트렌드(E5), 법원 경매(E6), 평균 임대 호가(E7) 수집 파이프라인을 기동합니다.
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "summary": {
      "newsFetched": 3,
      "reportsFetched": 2,
      "sentimentsFetched": 3,
      "youtubeFetched": 2,
      "auctionsFetched": 2,
      "rentalsFetched": 3
    }
  }
  ```
* **엔드포인트**: `GET /api/public/market-intelligence` (Default)
  * **설명**: 수집된 6대 마켓 인텔리전스 데이터를 통합 반환하여 펄스(Pulse) 대시보드 화면에 주입합니다.

#### 🌞 B3: AI 데일리 모닝 브리핑 API
* **엔드포인트**: `GET /api/pulse/morning-briefing?region=seongsu`
* **설명**: 해당 권역의 수집 기사 및 경기 체감지수를 조합하여 LLM(또는 폴백 알고리즘)이 중개사용 3줄 요약 모닝 브리핑을 조립합니다.
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "region": "seongsu",
    "sentimentIndex": 68,
    "briefing": "🌞 오늘의 SEONGSU 모닝 브리핑:\n1. 성수/강남 권역의 리모델링 빌딩 매수세가 여전히 뜨겁습니다.\n2. 현장 브로커 체감 심리지수는 68로 '상승(Bullish)'을 보이고 있습니다.\n3. [권장 행동] 매수 문의가 오기 전에 NDA 서류와 밸류애드 리포트를 미리 발송할 준비를 하세요.",
    "timestamp": "2026-05-31T14:20:00.000Z"
  }
  ```

---

### 2-3. A1-A6: 공공데이터 프리미엄 연동 API

#### 🏛️ A1-A6: 정부 부동산 프리미엄 통계 수집/조회 API
* **엔드포인트**: `GET /api/public/gov-data?action=verify&region=seongsu&pnu=1120011400100450012&buildingId=test-building&districtCode=D001`
* **설명**: 한국부동산원 임대동향(A1), 토지e음 토지이용계획(A2), 에너지효율(A4), 소상공인 상권분석(A5), 공시지가(A6) 실시간 갱신을 실행하고 등기부등본 스텁(A3)과 함께 구조화하여 반환합니다.
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "rentalTrend": { "quarter": "2026 Q1", "vacancy_rate": 1.5, "rental_index": 112.1 },
      "landUse": { "zoning": "준공업지역", "restrictions": "용적률 400% 이하" },
      "registerSummary": {
        "ownerships": ["소유자: 김*수 (지분 100%)"],
        "collaterals": ["신한은행 근저당설정 48억원"],
        "cleannessScore": 92
      },
      "energyRating": { "rating": "1++등급 (우수)", "annual_energy_consumption": 145.2 },
      "district": { "district_name": "성수역 카페거리", "sales_volume_index": 8.5 },
      "officialPrice": { "year": 2026, "price_per_sqm": "8500000" }
    }
  }
  ```

---

## 3. 프론트엔드 연동 가이드

### 3-1. 🛠️ Curation & Tools 화면 (`/insight/tools`)
* **목적**: 매수 의향이 있는 자산가나 대리인에게 계산기와 체크리스트를 활용해 신뢰도를 주는 전문 콘텐츠 뷰입니다.
* **포함된 기능**:
  1. **매수 수지 시뮬레이터 (C5)**: LTV 60% 가정을 토대로 취득세(지방세 포함 4.6%), 임대수익 총액, 양도세를 시뮬레이션하여 실제 투입 에쿼티 산출.
  2. ** Due Diligence 실사 체크리스트 (C4)**: 법률(등기부), 공학(건축물대장), 행정(토지이용), 임대(임대차계약), 시설(에너지효율) 등 필수 6대 항목 진척도 및 체크 UI.
  3. **뜨는 권역 분석 (C1) 및 아고라 세무 팁 (C2)**: 양도세 기준 및 용도변경 인허가 폭증 권역 데이터 전시.

### 3-2. 🎨 브로커 콘텐츠 스튜디오 화면 (`/broker/studio`)
* **목적**: 브로커의 일상적 큐레이션 작성, AI 화법 보정, 화이트라벨 모바일 페이지 발송 및 추적 통합 관리자 뷰입니다.
* **포함된 기능**:
  1. **큐레이션 편집기 (F1)**: 보관함 내의 딜카드(블라인드 매물)와 외부 뉴스(E2)를 마우스 클릭만으로 뉴스레터 콘텐츠로 조립.
  2. **AI 말투 비서 (F6)**: 브로커가 적은 투박한 메모("성수 리모델링 강추")를 전문적이고 신뢰도 높은 한글 안내 서한으로 자동 변환.
  3. **화이트라벨 빌더 (F4)**: 개인 서브도메인(예: `kim-broker.dealcard.kr`) 및 브랜드 테마 색상을 대입해 NDA 유도 버튼이 포함된 모바일용 딜카드 공유 링크 자동 제작.
  4. **성과 및 관심도 분석 (F5 / F3)**: 발송한 링크의 열람율과 클릭 수치를 기반으로 어떤 매수 고객(리드)이 현재 높은 의사를 보이는지 스코어링(Lead Score) 보드 노출.
  5. **공동중개 허브 (D1)**: 타 브로커에게 공동중개 수수료 분할 비율(50:50 등)과 함께 매물/매수 매칭 요청 메시지 전송.

---

## 4. 데이터 플라이휠 및 CRM 시나리오 (G4-G6)

```
[ 매수자/고객 반응 ] ──► [ content_share_events 트래킹 ]
                                     │
                                     ▼ (G5 실시간 연동)
[ lead_scores 누적 ] ──► [ 브로커 CRM 대시보드 스코어 반영 ]
                                     │
                                     ▼ (G6 배치/요청)
[ 주간 운영진 보고서 ] ◄── [ G4 A/B 성과 + G1 설문 NPS 집계 ]
```

1. **A/B 성과 트래킹 (G4)**:
   * 메인 큐레이션 발송 시 variant A/B 헤드라인을 무작위 배분합니다.
   * 고객이 열람 시 `logAbVariantView`, 클릭 시 `logAbVariantClick`을 호출하여 어떤 제목/설명이 성과(Click-Through Rate)가 높았는지 분석하여 콘텐츠 최적화에 기여합니다.
2. **CRM 자동 반영 (G5)**:
   * 공유 페이지 열람이나 CTA 버튼 클릭 시 `syncClientReactionToCrm` 서비스가 즉각 트리거됩니다.
   * `lead_scores` 테이블에 해당 고객의 가중치 점수가 더해지고, 브로커 전용 CRM 화면의 "우선 집중 통화 목록"에 실시간 등재됩니다.
3. **운영진 주간/월간 리포트 생성 (G6)**:
   * 배치 작업이나 관리자 요청에 의해 `generateWeeklyAdminInsightReport`가 동작합니다.
   * PoC 3단계 설문의 순추천지수(NPS) 추이, 현장 체감지수(Sentiment Index) 변동성, 텔레메트리 히트맵 분석을 종합한 운영진 보고서를 조립하여 사업 스케일업 및 투자 유치 IR 자료로 연동합니다.
