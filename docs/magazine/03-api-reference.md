# 03. API 레퍼런스 (API Reference)

> **감사 일시**: 2026-08-28 (§1 모닝 인텔리전스) · **2026-10-06 동기화 (§2~3 매거진, D-02)** | **감사 범위**: src/app/api 전체 모닝 인텔리전스 & 매거진 엔드포인트

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

## 2. 매거진 API (현행 · 2026-10-06 코드 기준)

> **D-02 동기화 (2026-10-06)**: 이 절은 `src/app/api/**` 실제 라우트를 기준으로 다시 작성했습니다. 이전 판(2026-08-28)의 소유자 리포트 계열(`/api/cron/owner-reports`, `/api/broker/reports/owner`)은 **폐기**되어 라우트가 존재하지 않습니다(§2.9). 오류 응답은 고정 문구만 사용하며 파서/DB 메시지를 노출하지 않습니다.
> 마이그레이션 미적용 환경에서는 일부 동작이 degrade 됩니다. 운영 DB 적용 현황은 [`supabase/MIGRATIONS.md`](../../supabase/MIGRATIONS.md) §8 참조 — 2026-10-06 기준 신규 마이그레이션(000005~000016)은 **SQL 파일만 있고 운영 미적용**입니다.

### 2.0 식별자 · 인증 규칙

| 규칙 | 내용 |
|:--|:--|
| URL 식별자 | **slug** (`/magazine/{slug}`, `/api/magazine/{slug}`). slug 는 브로커가 직접 설정하며 자동 발급하지 않음(DC 결정). 운영 `broker_profiles` 49건 중 slug NULL 25건 |
| 내부 키 | **`broker_user_id` (uuid)**. 저장·조인·권한 비교는 이 값. 레거시 `broker_id`(text: slug 또는 uuid 문자열 혼재)는 마이그레이션 000015 백필 대상 |
| 브로커 인증 | `requireBrokerContext()` (`src/lib/magazine/authz.ts`) — Bearer 세션 → `BrokerCtx`. 행 단위 소유권은 `assertOwnsRow()`; 타인 행은 존재 여부를 숨기기 위해 404(`notFoundResponse`) |
| 공개(비인증) | `withPublicGuard()` (`src/lib/magazine/public-guard.ts`) — 본문 크기(413) → IP 레이트리밋(429) → JSON(400) → zod(400) → 대상 레이트리밋. 카운터는 RPC `magazine_rl_hit`, 미적용 시 프로세스 메모리로 degrade(인스턴스당 한도) |
| 수신거부 | HMAC 토큰(`unsub-token`, `UNSUBSCRIBE_SECRET`) — 로그인 불필요, 토큰 검증 실패는 고정 문구 |
| Cron | `Authorization: Bearer ${CRON_SECRET}`. 미설정/불일치 401 |

### 2.1 인증 매트릭스 (route × method)

| 엔드포인트 | Method | 인증 | 비고 |
|:--|:--|:--|:--|
| `/api/magazine/[brokerId]` | GET | 공개 | slug 로 발행본 조회, 공개용 마스킹(`maskIssueForPublic`). 미래 날짜 404 |
| `/api/magazine/[brokerId]` | POST | 브로커 (`requireBrokerContext` + `brokerKeyMatches`) | 본인 매거진 이슈 저장. 타 브로커 키 → 거부 |
| `/api/magazine/[brokerId]/[date]/image` | GET | 공개 | 날짜별 공유 이미지(PNG, Satori). 없는 에디션은 중립 이미지 |
| `/api/magazine/editions` | GET / POST / PATCH | 브로커 + `assertOwnsRow` | 에디션 목록/생성/수정. **에디션이 SSoT**(`magazine_editions`) |
| `/api/magazine/editions/draft` | POST | 브로커 | 초안 생성(`edition-draft`) |
| `/api/magazine/editions/[id]/publish` | POST | 브로커 + `assertOwnsRow` | 발행. 콘텐츠 스키마·품질 검수(`needsQualityReview`) 통과 필요. **발행 ≠ 발송** |
| `/api/broker/magazine/subscribers` | GET / POST | 브로커 | 구독자 조회 / 수동 추가(`source='manual'`) |
| `/api/broker/magazine/subscribers/[id]` | PATCH / DELETE | 브로커 + `assertOwnsRow` | 상태 변경(`active`/`paused`/`unsubscribed`), 삭제 |
| `/api/broker/magazine/subscribers/[id]/intent` | POST | 브로커 + `assertOwnsRow` | AutoIntent 태그 생성/병합 |
| `/api/broker/magazine/analytics` | GET | 브로커 | 본인 에디션 분석. 이벤트 `edition_id` 기반(analytics v2 적용 전 운영 이벤트는 `edition_id` NULL) |
| `/api/broker/magazine/distribute` | POST | 브로커 + `assertOwnsRow` | 발송 — **sendGate 경유**(§2.5) |
| `/api/broker/magazine/special` | GET / POST | 브로커 | 특별호(속보) 생성/발송 — sendGate 경유, 주 2회 상한 |
| `/api/public/magazine/subscribe` | POST | 공개 + 가드 | 구독 신청. **광고성 정보 수신 동의·개인정보 동의·14세 확인 필수**, 이중 확인(`confirm_status`) |
| `/api/public/magazine/confirm` | GET / POST | 공개 + 가드 | 이중 확인 토큰 처리(`PENDING_CONFIRM` → `confirmed`) |
| `/api/public/magazine/unsubscribe` | GET / POST | HMAC 토큰 | GET: 확인 페이지, POST: 해지(원클릭 `List-Unsubscribe` 대응) |
| `/api/public/magazine/analytics` | POST | 공개 + 가드 (+ `MAGAZINE_SID_SECRET` HMAC visitor id) | 비콘 이벤트. `MAGAZINE_TRACKING_ENABLED=false` 로 중지 가능 |
| `/api/public/magazine/poll` | GET / POST | 공개 | 설문 응답 저장 `magazine_poll_responses`(고정 목업 값 금지) |
| `/api/public/magazine/referral` | GET / POST | 공개 + 가드 | 레퍼럴(축소 운영 — 보상/바이럴 문구 제거) |
| `/api/og/magazine` | GET | 공개 | OG 이미지 1200×630. 폰트 `MAGAZINE_OG_FONT_PATH` |
| `/api/cron/weekly-magazine` | GET | `CRON_SECRET` (timing-safe) | **생성만** 수행(`needs_review`) — 발송 없음. `MAGAZINE_CRON_GENERATE_ENABLED=true` 일 때만 동작 |
| `/api/cron/retention-purge` | GET / POST | `CRON_SECRET` | 해지 30일 경과 구독자 익명화(`magazine_purge_unsubscribed`), 이벤트 365일 초과 삭제 |
| `/api/pulse/generate` | GET / POST | GET: 공개 목록(무인증) 또는 `Bearer CRON_SECRET` 시 주간 생성 위임(주차 중복 시 skip) / POST: 생성기 | Vercel cron 은 GET 만 호출하므로 GET 이 POST 로 위임 |

### 2.2 에디션 (SSoT)

- 에디션(`magazine_editions`)이 **단일 진실 원천**이며, 레거시 `magazine_issues` 는 호환 조회용입니다. 2026-10-06 운영 실측: `magazine_issues` 7행, `magazine_editions` 0행.
- 상태 흐름: `needs_review` → `published` (품질 검수 필요 시 `needs_review` 유지). 에디션 콘텐츠는 `edition-content.schema.ts` 로 검증됩니다.
- 세무 규칙(`tax-rules-2026.ts`)은 **UNREVIEWED** 상태 — 문서·화면 어디에도 "세무사 감수 완료" 문구를 쓰지 않습니다.

### 2.3 구독 · 동의

- 동의 컬럼(마이그레이션 000006, **운영 미적용**): `privacy_consent_at`, `marketing_consent_at`, `consent_version`, `consent_channel`, `night_consent`, `consent_ip_hash`, `confirm_status`, `confirm_token_hash`, `unsubscribed_at`, `reconfirm_due_at`, `phone_e164`, `age_confirmed`, `broker_user_id`.
- 기존 구독자에 대한 동의 **백필 금지** — 동의 기록이 없는 구독자는 `NO_CONSENT` 로 발송에서 제외됩니다.
- 재구독은 본인 확인(confirm) 이후에만 가능합니다.

### 2.4 분석 이벤트

- 수집: `page_view`, `dwell`, `scroll_depth`, `click` (+ 설문/구독 관련). 처리 체인: `magazine_analytics_events` → `activity_events` → (비동기) 리드 스코어/핫리드 알림.
- 개선(000016, 미적용): 구독자 귀속·핫리드 상한 조회 인덱스, `increment_edition_views` 실행권한 회수(공개 RPC 로 조회수 조작 차단), `visitor_id` `v2_` = 서버 HMAC 해시. 마이그레이션 헤더 기준 코드는 미적용 상태에서도 동작합니다.
- 운영 실측(2026-10-06): 이벤트 2,334건 전량 `edition_id` NULL, 서로 다른 visitor_id 는 3개뿐 → 분석 수치는 신뢰 불가로 취급.

### 2.5 발송 (sendGate) · 플래그

발송 경로(`distribute`, `special`)는 모두 `src/domain/magazine/send-gate.ts` 를 통과합니다. 판정 순서:

`SEND_DISABLED` → `NOT_ALLOWLISTED` → `UNSUBSCRIBED` / `NO_CONSENT` / `PENDING_CONFIRM` / `CHANNEL_NOT_CONSENTED` → `QUIET_HOURS`(21~08시 KST, `night_consent` 없으면) → `MISSING_AD_LABEL` / `MISSING_UNSUB_LINK` / `MISSING_SENDER` → `NO_PROVIDER`(실발송만)

| 플래그 (env) | 기본 | 의미 |
|:--|:--|:--|
| `MAGAZINE_SEND_ENABLED` | false | false 면 DB·provider 접촉 없이 `SEND_DISABLED` |
| `MAGAZINE_SEND_DRY_RUN` | true | 판정·원장 기록만, provider 호출 없음 |
| `MAGAZINE_SEND_ALLOWLIST` | 빈 값 | **비어 있으면 allowlist 미적용(전체 허용)** — 실발송 전 반드시 설정 |
| `MAGAZINE_CRON_GENERATE_ENABLED` | false | 주간 생성 cron 활성 |
| `MAGAZINE_AUTO_SEND_ALLOWED` | false | 자동 발송(브로커 명시 동의 `magazine_settings.auto_send` 구현 전 금지) |
| `MAGAZINE_DAILY_CAP` | (수신자 수) | 브로커 일일 상한 오버라이드 |
| `MAGAZINE_ALLOW_LLM_MOCK` | false | LLM 실패 시 mock 콘텐츠 허용(운영 금지) |
| `MAGAZINE_TRACKING_ENABLED` | true | 분석 수집 |

원장: `magazine_dispatch_logs`(마이그레이션 000005, 미적용 시 모든 발송 `LEDGER_UNAVAILABLE` 차단). 활성화 절차: [`audit-2026-10-04/send-activation-checklist.md`](./audit-2026-10-04/send-activation-checklist.md).

### 2.6 신규 테이블 (SQL 파일만 · 운영 미적용)

`magazine_dispatch_logs`, `magazine_settings`, `magazine_cron_runs`, `magazine_rate_limits`(+ RPC `magazine_rl_hit`), `magazine_poll_responses`, `magazine_referrals`. 운영 REST 조회 시 PGRST205(2026-10-06 확인). 자세한 정의는 [04-database-schema.md](./04-database-schema.md).

### 2.7 Cron 스케줄 (`vercel.json`)

| 경로 | 스케줄(UTC) | KST | 비고 |
|:--|:--|:--|:--|
| `/api/cron/morning-briefing` | `0 23 * * *` | 매일 08:00 | |
| `/api/cron/weekly-magazine` | `0 1 * * 1` | 월 10:00 | 생성만(이전 문서의 "일 22:00 UTC" 는 오류) |
| `/api/pulse/generate` | `0 13 * * 0` | 일 22:00 | 주간 Pulse. 주간 매거진보다 먼저 생성되도록 배치 |
| `/api/cron/hold-expiry` | `*/5 * * * *` | 5분마다 | |
| `/api/cron/retention-purge` | `0 18 * * *` | 매일 03:00 | |
| `/api/cron/circle-approval-timeout` | `0 0 * * *` | 매일 09:00 | |

### 2.8 OG 이미지

`GET /api/og/magazine` — [route.tsx](file:///c:/Users/User/cre-dealcard/src/app/api/og/magazine/route.tsx). `@vercel/og`/Satori 기반 1200×630. 폰트는 `MAGAZINE_OG_FONT_PATH`(기본: 번들 폰트). CDN 캐시 갱신이 필요하면 `scripts/cleanup/21_cdn_purge.md` 참조.

### 2.9 폐기된 API (참고)

| 항목 | 상태 |
|:--|:--|
| `GET /api/cron/owner-reports` | **폐기** — 라우트 삭제, `vercel.json` 에서도 제거 |
| `POST /api/broker/reports/owner` | **폐기** — 라우트 삭제 |
| 소유자/매도자 리포트, rail dispatcher | **폐기**(데드 코드 정리 대상). `owner_reports` 테이블은 더 이상 사용하지 않음 |

> `POST /api/owner-readiness/check` 는 매거진과 무관한 별도 기능이며 폐기 대상이 아닙니다.

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
| 7 | `/api/pulse/generate` | GET, POST | 혼합(GET 공개 목록 / cron 위임) | Cron·공개 |
| 8 | `/api/magazine/[brokerId]` | GET, POST | 혼합(GET 공개 / POST 브로커) | 매거진 |
| 9 | `/api/magazine/[brokerId]/[date]/image` | GET | 없음 | 공개 |
| 10 | `/api/magazine/editions` | GET, POST, PATCH | 브로커 | 매거진 |
| 11 | `/api/magazine/editions/draft` | POST | 브로커 | 매거진 |
| 12 | `/api/magazine/editions/[id]/publish` | POST | 브로커 | 매거진 |
| 13 | `/api/broker/magazine/subscribers` | GET, POST | 브로커 | 매거진 |
| 14 | `/api/broker/magazine/subscribers/[id]` | PATCH, DELETE | 브로커 | 매거진 |
| 15 | `/api/broker/magazine/subscribers/[id]/intent` | POST | 브로커 | 매거진 |
| 16 | `/api/broker/magazine/analytics` | GET | 브로커 | 매거진 |
| 17 | `/api/broker/magazine/distribute` | POST | 브로커 (sendGate) | 매거진 |
| 18 | `/api/broker/magazine/special` | GET, POST | 브로커 (sendGate) | 매거진 |
| 19 | `/api/public/magazine/subscribe` | POST | 공개+가드 | 공개 |
| 20 | `/api/public/magazine/confirm` | GET, POST | 공개+가드 | 공개 |
| 21 | `/api/public/magazine/unsubscribe` | GET, POST | HMAC | 공개 |
| 22 | `/api/public/magazine/analytics` | POST | 공개+가드 | 공개 |
| 23 | `/api/public/magazine/poll` | GET, POST | 공개 | 공개 |
| 24 | `/api/public/magazine/referral` | GET, POST | 공개+가드 | 공개 |
| 25 | `/api/og/magazine` | GET | 없음 | 공개 |
| 26 | `/api/cron/weekly-magazine` | GET | CRON_SECRET | Cron |
| 27 | `/api/cron/retention-purge` | GET, POST | CRON_SECRET | Cron |
