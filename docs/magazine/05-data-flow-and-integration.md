# 05. 데이터 플로우 & 통합 아키텍처 (Data Flow & Integration)

> **감사 일시**: 2026-08-28 | **감사 범위**: 전체 파이프라인 흐름, 크로스채널 분석, 피드백 루프
> **2026-10-06 D-02 동기화**: 현행 흐름은 **[§9](#9-d-02-동기화-2026-10-06--현행-흐름)** 참조 — §1 Phase 4(배포)·§3.4(방문자 식별)·§5(구독자)·§6(에디션 상태)는 §9 가 우선합니다.

---

## 1. 전체 시스템 데이터 플로우

```mermaid
graph TB
    subgraph Phase1["1️⃣ 데이터 수집 (매일 08:00 KST)"]
        CRON["Vercel Cron<br>/api/cron/morning-briefing"]
        CRAWL["market-crawlers.ts"]
        GOV["gov-premium-apis.ts"]
        CRON --> CRAWL
        CRON --> GOV
    end

    subgraph DataSources["외부 데이터소스"]
        RSS["6대 경제지 RSS"]
        BIGKINDS["BigKinds"]
        NAVER["네이버 뉴스"]
        YOUTUBE["유튜브 CRE"]
        MOLIT["국토교통부 API"]
        KRAB["한국부동산원 API"]
        SEMAS["소상공인진흥공단 API"]
        ENERGY["한국에너지공단 API"]
        COURT["대법원 경매"]
    end

    CRAWL --> RSS
    CRAWL --> BIGKINDS
    CRAWL --> NAVER
    CRAWL --> YOUTUBE
    CRAWL --> COURT
    GOV --> MOLIT
    GOV --> KRAB
    GOV --> SEMAS
    GOV --> ENERGY

    subgraph DB["Supabase DB (14개 테이블)"]
        NEWS["external_news"]
        TX["external_transactions"]
        AUCTION["auction_listings"]
        RENTAL["rental_market_data"]
        TREND["rental_trend_data"]
        LAND["official_land_prices"]
        DISTRICT["commercial_district"]
        PERMITS["construction_permits"]
        SOCIAL["social_sentiment"]
        YT["youtube_trends"]
        REPORTS["external_reports"]
        RATINGS["energy_ratings"]
    end

    RSS --> NEWS
    BIGKINDS --> NEWS
    NAVER --> NEWS
    YOUTUBE --> YT
    COURT --> AUCTION
    MOLIT --> TX
    MOLIT --> LAND
    MOLIT --> PERMITS
    KRAB --> TREND
    SEMAS --> DISTRICT
    ENERGY --> RATINGS

    subgraph Phase2["2️⃣ 모닝 인텔리전스 (브로커 접속)"]
        MI_API["GET /api/broker/<br>morning-intelligence"]
        LLM["LLM 브리핑 생성<br>(gpt-4o-mini / terra)"]
        SENTIMENT["복합 심리지수<br>(0~100)"]
    end

    DB --> MI_API
    MI_API --> LLM
    MI_API --> SENTIMENT

    subgraph Phase3["3️⃣ 매거진 생성 (주간)"]
        MAG_CRON["Vercel Cron<br>/api/cron/weekly-magazine"]
        GENERATOR["weekly-generator.ts"]
        QG["quality-gate.ts<br>(할루시네이션 검증)"]
        TEASER["magazine-teaser-cards.ts<br>(정보 보호 투영)"]
        EDITION["magazine_editions"]
    end

    DB --> MAG_CRON
    MAG_CRON --> GENERATOR
    GENERATOR --> QG
    GENERATOR --> TEASER
    QG --> EDITION
    TEASER --> EDITION

    subgraph Phase4["4️⃣ 배포 & 열람"]
        DIST["distribute-magazine.ts"]
        SOLAPI["Solapi 카카오 알림톡"]
        VIEWER["공개 웹 뷰어<br>/magazine/[brokerId]/[date]"]
    end

    EDITION --> DIST
    DIST --> SOLAPI
    SOLAPI --> VIEWER

    subgraph Phase5["5️⃣ 분석 & 피드백"]
        ANALYTICS["use-magazine-analytics.ts<br>(Beacon)"]
        EVENTS["magazine_analytics_events"]
        SCORE["cross-channel-score.ts"]
        HOTLEAD["hot-lead-alert.ts"]
    end

    VIEWER --> ANALYTICS
    ANALYTICS --> EVENTS
    EVENTS --> SCORE
    SCORE --> HOTLEAD
    HOTLEAD --> |"핫리드 알림"| MI_API
```

---

## 2. 모닝 인텔리전스 → 매거진 통합 플로우

```
┌──────────────────────────────────────────────────────────────────┐
│ 모닝 인텔리전스 대시보드 (MorningIntelligence.tsx)                │
│                                                                  │
│  [실거래 카드] ──── [📰 매거진 추가] ──┐                          │
│  [경매 카드] ─────  [📰 매거진 추가] ──┤                          │
│  [커스텀 브리핑] ── [📰 매거진 추가] ──┤                          │
│                                        │                         │
│                                        ▼                         │
│                             useMagazineDraft 훅                  │
│                             (5초 디바운스 자동저장)               │
│                                        │                         │
│                                        ▼                         │
│                       magazine_editions.content.draft_blocks      │
│                                        │                         │
│                                        ▼                         │
│                       매거진 에디터 (/broker/magazine-editor)     │
│                       (8탭 스튜디오)                              │
│                                        │                         │
│                                        ▼                         │
│                       발행 → 카카오 배포 → 공개 뷰어             │
└──────────────────────────────────────────────────────────────────┘
```

### useMagazineDraft 훅 상세

> 파일: [useMagazineDraft.ts](file:///c:/Users/User/cre-dealcard/src/hooks/useMagazineDraft.ts) (173 lines)

- 싱글톤 동기화 패턴
- 블록 유형: `news`, `deal`, `briefing`, `custom`
- 5초 디바운스 자동저장 → `magazine_editions.content.draft_blocks`
- 크로스뷰 동기화 (인텔리전스 ↔ 에디터)

---

## 3. 크로스채널 리드 스코어링 시스템

### 3.1 아키텍처

```mermaid
graph LR
    VC["Vibe Card<br>(디지털 명함)"] --> |"터치포인트"| SCORE
    MAG["Magazine<br>(매거진 열람)"] --> |"터치포인트"| SCORE
    IM["Mobile IM<br>(투자설명서)"] --> |"터치포인트"| SCORE

    SCORE["cross-channel-score.ts<br>(14일 윈도우)"] --> |"≥80점"| ALERT
    ALERT["hot-lead-alert.ts"] --> |"카카오 알림톡"| BROKER["브로커"]
```

### 3.2 점수 가중치

> 파일: [cross-channel-score.ts](file:///c:/Users/User/cre-dealcard/src/domain/analytics/cross-channel-score.ts)

| 터치포인트 | 점수 |
|-----------|------|
| `magazine_view` (매거진 열람) | +10 |
| `magazine_subscribe` (매거진 구독) | +20 |
| `magazine_to_im_click` (매거진→IM 클릭) | +25 |
| Vibe Card 열람 | +10 |
| Vibe Card 전화 클릭 | +15 |
| Mobile IM 열람 | +15 |
| Mobile IM 다운로드 | +20 |
| **멀티채널 보너스** (3채널 모두 터치) | **+30** |

### 3.3 핫리드 판정 기준

- **기준**: 14일 윈도우 내 점수 합계 ≥ 80
- **알림**: 24시간 방문자별 중복 제거
- **채널**: 카카오 알림톡 `TPL_HOT_LEAD`
- **내용**: 점수, 터치포인트 이력, 매물 조회수

### 3.4 이벤트 수집 메커니즘

> 파일: [use-magazine-analytics.ts](file:///c:/Users/User/cre-dealcard/src/hooks/use-magazine-analytics.ts)

| 기능 | 구현 |
|------|------|
| 방문자 식별 | `btoa(UA + screen resolution)` 익명 핑거프린트 |
| 페이지뷰 | 마운트 시 자동 `page_view` 이벤트 |
| 스크롤 추적 | 25%, 50%, 75%, 100% 임계값 `scroll_depth` 이벤트 |
| 체류 시간 | `beforeunload` 시 총 `dwell` 초 계산 |
| 전송 방식 | `navigator.sendBeacon()` — UI 블로킹 없는 안정적 전송 |
| 엔드포인트 | `POST /api/public/magazine/analytics` |

---

## 4. Mobile IM ↔ 매거진 브릿지

```mermaid
sequenceDiagram
    participant IM as Mobile IM
    participant Bridge as im-to-magazine-bridge.ts
    participant RPC as Supabase RPC
    participant Profile as broker_profiles
    participant Editor as Magazine Editor

    IM->>Bridge: extractMagazineSnippet()
    Bridge->>Bridge: 1줄 투자논거 추출
    Bridge->>RPC: append_magazine_deal_snippet(user_id, snippet)
    RPC->>Profile: pending_magazine_deals JSONB 추가
    Editor->>Profile: pending_magazine_deals 조회
    Editor->>Editor: 스니펫 임포트 → 에디션 콘텐츠에 반영
```

---

## 5. 구독자 생명주기

```mermaid
stateDiagram-v2
    [*] --> active: 구독 (manual/vibe_card/magazine/im)

    active --> paused: 일시 중지
    paused --> active: 재활성화
    active --> unsubscribed: 수신 거부
    paused --> unsubscribed: 수신 거부
    unsubscribed --> [*]

    note right of active
        소스: manual (브로커 직접 등록)
              vibe_card (명함 스캔)
              magazine (매거진 내 구독 폼)
              im (IM 열람 후 구독)
    end note
```

### 구독자 자동 등록 경로

| 경로 | 트리거 |
|------|--------|
| 브로커 수동 | `/api/broker/magazine/subscribers` POST |
| 고객 신규 등록 | `/broker/clients/new` 체크박스 "주간 매거진 자동 구독" |
| 공개 구독 폼 | `/api/public/magazine/subscribe` POST |
| Vibe Card 스캔 | 명함 열람 후 구독 CTA |
| Mobile IM 열람 | IM 뷰어 내 구독 CTA |

---

## 6. 매거진 에디션 상태 머신

```mermaid
stateDiagram-v2
    [*] --> draft: 자동 생성 (Cron) / 수동 생성

    draft --> editing: 에디터에서 편집 시작
    editing --> review: 편집 완료 → 검토 요청
    review --> needs_review: 품질 게이트 실패 (>20% 불일치)
    needs_review --> editing: 재편집
    review --> scheduled: 발행 예약
    review --> published: 즉시 발행
    scheduled --> published: 예약 시각 도래
    published --> archived: 보관
    editing --> published: 즉시 발행 (에디터에서)
    draft --> published: 1-클릭 발행

    note right of needs_review
        품질 게이트 위반:
        수치 불일치율 > 20%
        → 자동 플래그
    end note
```

---

## 7. 피드백 루프 (Closed-Loop Intelligence Flywheel)

```
                    ┌─────────────────────────────┐
                    │     데이터 수집              │
                    │ (Cron + 크롤러 + 공공API)   │
                    └─────────────┬───────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     모닝 인텔리전스          │
                    │ (AI 브리핑 + 개인화 액션)    │
                    └─────────────┬───────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     매거진 에디터 & 발행     │
                    │ (8탭 스튜디오 + 품질 게이트) │
                    └─────────────┬───────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     배포 & 열람              │
                    │ (카카오톡 + 웹 뷰어)         │
                    └─────────────┬───────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     독자 분석                │
                    │ (체류, 스크롤, 클릭 추적)    │
                    └─────────────┬───────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     핫리드 감지              │
                    │ (크로스채널 ≥80점)           │
                    └─────────────┬───────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     브로커 알림 & CRM        │
                    │ (카카오 알림 + 액션 리스트)  │
                    └─────────────┬───────────────┘
                                  │
                  ────────────────┘
                 │ 매거진 성과가 다음 모닝 인텔리전스에
                 │ 피드백 카드(MagazineInsightCard)로 반영
                 │
                 └──────────► 데이터 수집 (순환)
```

### 피드백 포인트

| 피드백 소스 | 소비자 | 데이터 |
|------------|--------|--------|
| `magazine_analytics_events` | 모닝 인텔리전스 API | 평균 조회수, 구독자 수, 최근 발행일 |
| `MagazineInsightCard` | 브로커 대시보드 | 매거진 성과 요약 위젯 |
| `RoiCard` | 브로커 대시보드 | 비용 절감 효과 (매거진 1건당 1.5시간 절감) |
| `cross-channel-score` | 핫리드 알림 | 투자자 참여 점수 및 터치포인트 |
| `subscriber-profile` | 매수자 의향 자동 생성 | 열람 패턴 → `AutoIntent` |

---

## 8. 외부 시스템 연동 맵

| 외부 시스템 | 프로토콜 | 용도 | 관련 파일 |
|-----------|---------|------|----------|
| 국토교통부 | REST API (XML) | 실거래, 공시지가, 건축허가 | `gov-premium-apis.ts` |
| 한국부동산원 | REST API | 임대동향 | `gov-premium-apis.ts` |
| SEMAS (소상공인진흥공단) | REST API | 상권분석 | `gov-premium-apis.ts` |
| 한국에너지공단 | REST API | 에너지효율등급 | `gov-premium-apis.ts` |
| BigKinds | REST API | 빅데이터 뉴스 검색 | `market-crawlers.ts` |
| 네이버 | 뉴스 검색 API | CRE 뉴스, 감성 분석 | `market-crawlers.ts` |
| YouTube | Data API | CRE 트렌드 영상 | `market-crawlers.ts` |
| 6대 경제지 | RSS XML | 실시간 뉴스 수집 | `market-crawlers.ts` |
| OpenAI | REST API | LLM 브리핑/요약/스코어링 | `llm-client.ts` |
| Solapi | REST API (HMAC-SHA256) | 카카오 알림톡 발송 | `notification-service.ts` |
| KakaoTalk | JS SDK | 피드 카드 공유 | `MorningIntelligence.tsx` |
| Vercel | Cron, OG Image | 스케줄링, 동적 OG 이미지 | `vercel.json`, `og/magazine` |

---

## 9. D-02 동기화 (2026-10-06) — 현행 흐름

> §1~8 은 2026-08-28 기준입니다. 아래 내용과 충돌하면 **이 절이 우선**합니다(특히 §1 Phase 4 배포, §3.4 방문자 식별, §5 구독자 생명주기, §6 에디션 상태 머신).
> 신규 마이그레이션(000005~000016)은 **SQL 파일만 있고 운영 미적용**입니다 — 적용 전에는 발송 원장 부재로 모든 실발송이 차단됩니다(안전 방향). 상세: `supabase/MIGRATIONS.md`.

### 9.1 생성 → 발행 → 발송 (분리된 3단계)

```mermaid
graph LR
    CRON["/api/cron/weekly-magazine<br/>(월 10:00 KST, 생성만)"] --> GEN["weekly-generator + quality-gate"]
    GEN --> NR["magazine_editions<br/>status=needs_review"]
    NR --> PUB["브로커 검토 후<br/>POST /editions/[id]/publish"]
    PUB --> PUBLISHED["status=published<br/>(공개 뷰어 노출)"]
    PUBLISHED --> SEND["브로커가 에디터에서<br/>POST /broker/magazine/distribute"]
    SEND --> GATE["sendGate<br/>(동의·수신거부·야간·표기·allowlist)"]
    GATE -->|"통과"| LEDGER["magazine_dispatch_logs<br/>(idempotency_key)"]
    LEDGER --> PROV["Resend(email) / Solapi(알림톡)"]
    GATE -->|"차단"| BLK["blocked_reason 기록"]
```

- **cron 은 발송하지 않습니다.** 자동 발송은 `MAGAZINE_AUTO_SEND_ALLOWED=false` + 브로커 명시 동의(구현 전)로 막혀 있습니다.
- **발행 ≠ 발송.** `MAGAZINE_SEND_ENABLED=false`(기본)이면 발행은 되고 발송은 `SEND_DISABLED` 로 중지됩니다.
- 구버전 문서의 `distribute-magazine.ts → Solapi` 직결 경로는 없습니다. 모든 발송은 sendGate → 원장 → provider 순서입니다. 공유 STUB(항상 true 반환) provider 는 매거진 경로에서 쓰지 않습니다(`NO_PROVIDER` 로 차단).
- 주간 Pulse 는 `/api/pulse/generate`(일 22:00 KST)가 먼저 생성하고, 같은 주 라벨이 이미 있으면 skip 합니다(주기 중복 방지).

### 9.2 에디션이 SSoT

- 공개 뷰어·분석·발송은 `magazine_editions` 를 기준으로 합니다. 레거시 `magazine_issues` 는 호환 조회용이며, §4 ER 도의 "dual-write" 는 점진 폐기 대상입니다.
- 식별자: URL = slug, 내부 키 = `broker_user_id` (uuid). 백필(000015)은 수정 후 적용(MIGRATIONS.md §6).

### 9.3 구독자 생명주기 (동의 게이트 반영)

```mermaid
stateDiagram-v2
    [*] --> pending: 공개 구독 신청 (동의 3종 + 14세)
    pending --> active: 이중 확인(confirm) 완료
    active --> paused: 일시 중지
    paused --> active: 재활성화
    active --> unsubscribed: 수신거부 (링크·원클릭)
    paused --> unsubscribed
    unsubscribed --> purged: 30일 경과 시 익명화(retention-purge)
    unsubscribed --> pending: 재구독은 본인 확인으로만
    purged --> [*]
```

- 발송 가능 조건: `status='active'` ∧ `marketing_consent_at IS NOT NULL` ∧ `confirm_status='confirmed'` ∧ 채널 동의 일치. 21~08시 KST 는 `night_consent` 필요.
- 운영 현황(2026-10-06): 구독자 6건 **전원 테스트 계정**, 동의 컬럼 자체가 아직 없음(000006 미적용). 기존 구독자는 백필 없이 `NO_CONSENT` 로 취급합니다.
- 구독자 등록 경로 중 `manual`(브로커 직접 입력)은 동의 증빙이 없으므로 발송 대상이 되려면 구독자 본인의 확인(confirm)을 거쳐야 합니다.

### 9.4 에디션 상태 (실제 사용)

`draft` / `needs_review`(생성 cron·품질 게이트 불합격) → `published` → `archived`. 그 외 표준 값은 000002 CHECK 참조. §6 다이어그램의 `editing`/`review`/`scheduled` 는 UI 단계 개념이며 DB `status` 값이 아닙니다(확인 필요 시 `edition-save.ts`).

### 9.5 분석 · 방문자 식별 (갱신)

- 방문자 식별은 `btoa(UA+screen)` 지문이 **아닙니다**. 브라우저가 `crypto.randomUUID()` 로 만든 1st-party 랜덤 ID 를 localStorage 에 13개월 보관하고(지문 폴백 금지 — 사용 불가면 추적 안 함), 서버가 `MAGAZINE_SID_SECRET` 기반 HMAC-SHA256 해시(`v2_…`)만 저장합니다.
- 레거시 방식은 같은 기종 브라우저가 같은 ID 가 되는 충돌이 있었고(운영 이벤트 2,334건이 단 3개 visitor_id), 분석 수치는 정리 전까지 신뢰하지 않습니다(`scripts/cleanup/18_visitor_id_conflict_mark.sql`).
- `MAGAZINE_TRACKING_ENABLED=false` 로 수집을 중지할 수 있습니다.

### 9.6 폐기된 흐름

소유자/매도자 리포트(`owner-reports` cron, `/api/broker/reports/owner`), rail dispatcher, `owner_reports` 테이블 — 삭제/폐기. §1 다이어그램에는 원래 나타나지 않으므로 별도 수정 없음.
