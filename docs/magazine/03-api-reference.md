# 03. API 레퍼런스 (API Reference)

> **감사 일시**: 2026-08-28 | **감사 범위**: src/app/api 전체 모닝 인텔리전스 & 매거진 엔드포인트

---

## 1. 모닝 인텔리전스 API

### 1.1 메인 인텔리전스 피드

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/broker/morning-intelligence` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/route.ts) (472 lines) |
| **인증** | Bearer Token (필수) |
| **쿼리 파라미터** | `region` (`seongsu` \| `gbd` \| `ybd`) |

**처리 로직**:
1. 11개 데이터소스 병렬 조회 (`Promise.all`, L51-87)
2. 브로커 보유 매물(`building_ssot_lite`) & 매수자 의향(`buyer_intent_lite`) & 매거진 성과(`magazine_editions`) 결합
3. LLM (`gpt-4o-mini` / `terra`, L164-239) 브리핑 생성
4. 복합 투자자 심리 지수 산출 (L336-369)
5. 브로커 공개 프로필 슬러그 자동 발급 + 매거진 공유 URL 반환

**응답 구조**:
```typescript
{
  briefing: RichBriefing;          // AI 시장 브리핑 (소스태그별)
  actionList: ActionItem[];         // 개인화 액션 리스트
  kakaoScript: string;             // 카톡 상담 화법
  riskSignals: RiskSignal[];       // 리스크 신호
  sentimentIndex: number;          // 0~100 복합 심리 지수
  widgets: {
    transactions: Transaction[];    // 최근 실거래
    auctions: Auction[];           // 경매 신건
    rentals: RentalData[];         // 임대/공실
    landPrices: LandPrice[];       // 공시지가
    permits: Permit[];             // 인허가
    commercialDistrict: District;  // 상권 분석
    reports: Report[];             // 글로벌 리포트
    youtube: VideoTrend[];         // 유튜브
    socialSentiment: Sentiment[];  // SNS 감성
  };
  magazineFeedback: {
    avgViews: number;
    subscriberCount: number;
    lastPublishDate: string;
  };
  brokerSlug: string;
  shareUrl: string;
}
```

---

### 1.2 마이 인텔리전스 (Custom)

| 항목 | 값 |
|------|----|
| **엔드포인트** | `POST /api/broker/morning-intelligence/custom` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/custom/route.ts) (151 lines) |
| **인증** | Bearer Token (필수) |

**POST 요청 본문**:
```typescript
{
  region: 'seongsu' | 'gbd' | 'ybd';
  items: string[];  // 1~10건 사용자 복붙 텍스트
}
```

**처리**: LLM(`luna`)으로 항목별 요약/의미, 종합 인사이트, 액션 아이템, 감성 점수 구조화 → `user_custom_intel` 저장

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/broker/morning-intelligence/custom` |
| **설명** | 최근 저장된 마이 인텔리전스 5건 조회 |

---

### 1.3 결합 브리핑 (Combine)

| 항목 | 값 |
|------|----|
| **엔드포인트** | `POST /api/broker/morning-intelligence/combine` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/combine/route.ts) (141 lines) |
| **인증** | Bearer Token (필수) |

**요청 본문**:
```typescript
{
  region: string;
  hqBriefing: string;     // HQ 브리핑 텍스트
  myIntelItems: object[];  // 마이 인텔 항목
}
```

**처리**: LLM(`terra`)으로 중복 제거 통합 → 커스텀 브리핑 + 전화 스크립트 + 액션 리스트 → `user_combined_briefing` 저장

---

### 1.4 모닝 브리핑 Cron

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/cron/morning-briefing` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/morning-briefing/route.ts) (100 lines) |
| **인증** | `CRON_SECRET` Bearer 토큰 |
| **스케줄** | 매일 UTC 23:00 (KST 08:00) |

**수행 작업**: `market-crawlers.ts` + `gov-premium-apis.ts` 전체 병렬 실행 (뉴스 6종 RSS, BigKinds, 네이버, 유튜브, 경매, 임대, 실거래 ETL, 임대동향, SEMAS, 공시지가, 건축허가, 에너지등급)

---

### 1.5 공개 마켓 인텔리전스

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/public/market-intelligence` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/market-intelligence/route.ts) (99 lines) |
| **인증** | 없음 (공개) |

- `?action=crawl`: 수동 크롤러 + 공공 API 즉시 가동
- 기본: 최근 수집 데이터 (뉴스/리포트/심리/유튜브/경매/임대) 반환

---

### 1.6 Pulse 모닝 브리핑 (공개)

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/pulse/morning-briefing` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/pulse/morning-briefing/route.ts) (101 lines) |
| **인증** | 없음 (공개) |

네이버 뉴스 + `market_sentiment_polls` + LLM(`terra`) → 공개 Pulse 페이지용 3줄 브리핑

---

## 2. 매거진 API

### 2.1 브로커별 매거진 (레거시)

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET/POST /api/magazine/[brokerId]` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/magazine/[brokerId]/route.ts) |
| **인증** | GET: 공개 / POST: 인증 필수 |

- **GET**: `magazine_issues` 캐시 또는 동적 `composeMagazineBriefing()` LLM 생성
- **POST**: 매거진 이슈 JSON 저장/업데이트

---

### 2.2 에디션 CRUD

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET/POST/PATCH /api/magazine/editions` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/magazine/editions/route.ts) |
| **인증** | 인증 필수 |

- **GET**: `broker_id`, `type`, `status` 필터로 에디션 목록 조회
- **POST**: 인증 사용자에 대해 `generateWeeklyMagazine()` 트리거
- **PATCH**: `title`, `field_note`, `status`, `market_temp` 등 필드 업데이트, `published_at` 설정

---

### 2.3 구독자 관리

| 엔드포인트 | Method | 설명 |
|-----------|--------|------|
| `/api/broker/magazine/subscribers` | GET | 브로커 구독자 페이지네이션 조회 |
| `/api/broker/magazine/subscribers` | POST | 구독자 수동 추가/업서트 (`source='manual'`) |
| `/api/broker/magazine/subscribers/[id]` | PATCH | 구독자 상태 변경 (`active`→`paused`→`unsubscribed`) |
| `/api/broker/magazine/subscribers/[id]` | DELETE | 구독자 하드 삭제 |

**파일**: [subscribers/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/subscribers/route.ts), [subscribers/[id]/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/subscribers/[id]/route.ts)

---

### 2.4 매거진 분석

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/broker/magazine/analytics` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/analytics/route.ts) |
| **인증** | 인증 필수 |

**응답**: 30일 분석 — 총 조회수, 고유 방문자, 평균 체류 시간(초), 스크롤 완독률

---

### 2.5 공개 구독/해지

| 엔드포인트 | Method | 인증 | 설명 |
|-----------|--------|------|------|
| `/api/public/magazine/subscribe` | POST | 없음 | 공개 구독 폼 (전화번호+이름) |
| `/api/public/magazine/unsubscribe` | GET | HMAC 토큰 | HTML 수신거부 페이지 렌더링 |
| `/api/public/magazine/unsubscribe` | POST | HMAC 토큰 | `unsubscribed` 상태 업데이트 + 로깅 |

**파일**: [subscribe/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts), [unsubscribe/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts)

---

### 2.6 공개 분석 이벤트 수집

| 항목 | 값 |
|------|----|
| **엔드포인트** | `POST /api/public/magazine/analytics` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/analytics/route.ts) |
| **인증** | 없음 (Beacon) |

**이벤트 유형**: `page_view`, `dwell`, `scroll_depth`, `click`

**처리 체인**:
1. `magazine_analytics_events` 기록
2. `activity_events` (중앙 이벤트) 기록
3. 비동기: `calculateLeadScore()` → `checkAndSendHotLeadAlert()` 호출

---

### 2.7 주간 매거진 Cron

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/cron/weekly-magazine` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/weekly-magazine/route.ts) |
| **인증** | `CRON_SECRET` |
| **스케줄** | 매주 일요일 UTC 22:00 (KST 07:00) |

모든 활성 브로커 → `generateWeeklyMagazine()` → `distributeMagazine()`

---

### 2.8 소유자 리포트 Cron

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/cron/owner-reports` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/owner-reports/route.ts) |
| **스케줄** | `0 9 1 1,4,7,10 *` (분기 첫째날 UTC 09:00 = KST 18:00) |

---

### 2.9 OG 이미지 생성

| 항목 | 값 |
|------|----|
| **엔드포인트** | `GET /api/og/magazine` |
| **파일** | [route.tsx](file:///c:/Users/User/cre-dealcard/src/app/api/og/magazine/route.tsx) |
| **인증** | 없음 (공개) |

`@vercel/og` 기반 1200×630 동적 OpenGraph 이미지 (브로커 브랜딩 + 시장 온도 + 핵심 통계)

---

### 2.10 소유자 리포트 수동 트리거

| 항목 | 값 |
|------|----|
| **엔드포인트** | `POST /api/broker/reports/owner` |
| **파일** | [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/reports/owner/route.ts) |
| **인증** | 인증 필수 |

수동으로 소유자 리포트 생성 및 발송 트리거

---

## 3. API 엔드포인트 전체 요약 매트릭스

| # | 엔드포인트 | Method | 인증 | 유형 |
|---|-----------|--------|------|------|
| 1 | `/api/broker/morning-intelligence` | GET | Bearer | 인텔리전스 |
| 2 | `/api/broker/morning-intelligence/custom` | GET, POST | Bearer | 인텔리전스 |
| 3 | `/api/broker/morning-intelligence/combine` | POST | Bearer | 인텔리전스 |
| 4 | `/api/cron/morning-briefing` | GET | CRON_SECRET | Cron |
| 5 | `/api/public/market-intelligence` | GET | 없음 | 공개 |
| 6 | `/api/pulse/morning-briefing` | GET | 없음 | 공개 |
| 7 | `/api/magazine/[brokerId]` | GET, POST | 혼합 | 매거진 |
| 8 | `/api/magazine/editions` | GET, POST, PATCH | Bearer | 매거진 |
| 9 | `/api/broker/magazine/subscribers` | GET, POST | Bearer | 매거진 |
| 10 | `/api/broker/magazine/subscribers/[id]` | PATCH, DELETE | Bearer | 매거진 |
| 11 | `/api/broker/magazine/analytics` | GET | Bearer | 매거진 |
| 12 | `/api/public/magazine/subscribe` | POST | 없음 | 공개 |
| 13 | `/api/public/magazine/unsubscribe` | GET, POST | HMAC | 공개 |
| 14 | `/api/public/magazine/analytics` | POST | 없음 | 공개 |
| 15 | `/api/cron/weekly-magazine` | GET | CRON_SECRET | Cron |
| 16 | `/api/cron/owner-reports` | GET | CRON_SECRET | Cron |
| 17 | `/api/og/magazine` | GET | 없음 | 공개 |
| 18 | `/api/broker/reports/owner` | POST | Bearer | 매거진 |
