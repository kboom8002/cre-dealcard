# CREDEAL 모바일 매거진 — 기능 및 활용 명세 가이드

> **문서 버전**: v1.0 (2026-09-20)  
> **대상 독자**: 개발자, PM, 운영자  
> **감사 범위**: `src/domain/magazine/`, `src/app/api/magazine/`, `src/app/api/public/magazine/`, `src/app/api/broker/magazine/`, `src/app/(public)/magazine/`, `src/app/(broker)/broker/magazine-editor/`, `src/components/magazine-editor/`, `src/components/magazine/`, `src/hooks/`

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [MECE 산출물 목록](#2-mece-산출물-목록)
3. [E2E 파이프라인 상세](#3-e2e-파이프라인-상세)
   - 3.1 주간 매거진 생성 파이프라인
   - 3.2 긴급 속보(Special Edition) 파이프라인
   - 3.3 구독 & 구독 해지 파이프라인
   - 3.4 배포(Distribution) 파이프라인
   - 3.5 열람 & 텔레메트리 파이프라인
   - 3.6 바이어 온도 & 리드 스코어링 파이프라인
   - 3.7 레퍼럴(전달) 바이럴 파이프라인
   - 3.8 이미지 에셋 생성 파이프라인
4. [도메인 모듈 명세](#4-도메인-모듈-명세)
5. [API 엔드포인트 레퍼런스](#5-api-엔드포인트-레퍼런스)
6. [매거진 뷰어 섹션 명세](#6-매거진-뷰어-섹션-명세)
7. [매거진 에디터 탭 명세](#7-매거진-에디터-탭-명세)
8. [DB 테이블 의존 맵](#8-db-테이블-의존-맵)
9. [품질 게이트 & 안전장치](#9-품질-게이트--안전장치)

---

## 1. 시스템 개요

CREDEAL 모바일 매거진은 **중개사가 고객(투자자/건물주)에게 매주 자동 발행하는 AI 맞춤형 부동산 인텔리전스 리포트**입니다.

```
┌─────────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────────┐
│  데이터 수집  │ →  │  AI 콘텐츠 생성 │ →  │  에디터 편집/QC  │ →  │  다채널 배포   │
│  (12개 소스)  │    │  (gpt-5.4)    │    │  (8-Tab 에디터)  │    │  (카톡+이메일) │
└─────────────┘    └──────────────┘    └────────────────┘    └──────────────┘
                                                                    ↓
                                              ┌──────────────────────────────┐
                                              │  독자 열람 & 행동 추적         │
                                              │  (텔레메트리 → 바이어 온도 →    │
                                              │   핫리드 알림 → CRM 연동)      │
                                              └──────────────────────────────┘
```

**핵심 흐름**: 매주 월요일 KST 07:00, Vercel Cron이 활성 브로커별 주간 매거진을 자동 생성 → 품질 게이트 통과 시 구독자에게 카카오 알림톡 + 이메일 즉시 배포 → 독자 열람 행동 실시간 추적 → 바이어 온도 자동 분류 → 핫리드 브로커 즉시 알림.

---

## 2. MECE 산출물 목록

| # | 산출물 | 유형 | 생성 주기 | 트리거 | 배포 채널 |
|---|--------|------|----------|--------|----------|
| **A** | 주간 매거진 (Weekly Edition) | 인터랙티브 웹 + 이메일 HTML | 매주 월요일 | Cron 자동 / 에디터 수동 | 카카오 알림톡, 이메일 |
| **B** | 긴급 속보 (Special Edition) | 단독 매물 속보 | 수시 (급매 접수 시) | 브로커 수동 발행 | 카카오 플래시, 이메일 |
| **C** | 매거진 아카이브 페이지 | 과거 에디션 목록 | 상시 | URL 접근 | 웹 |
| **D** | 구독 랜딩 페이지 | 구독 신청 폼 | 상시 | QR/링크/CTA | 웹 |
| **E** | 매거진 OG 이미지 | 소셜 공유 카드 (1200×630) | 매거진 발행 시 | URL 접근 | 카카오/SNS |
| **F** | 매거진 프로모션 이미지 | 스토리(1080×1920) / 카드(1080×1080) / OG(1200×630) | 매거진 발행 시 | 에디터 다운로드 | 인스타그램, 카톡 |
| **G** | 구독 QR 코드 | 인쇄용 300DPI PNG | 수동 생성 | 에디터 QR 모달 | 명함, 현장 사인 |
| **H** | 구독자 분석 대시보드 | KPI/바이어온도/핫리드 | 실시간 | 에디터 성과 탭 | 브로커 전용 |
| **I** | 건물주 성과 리포트 (Owner Report) | 분기 실적 보고서 | 분기별 | Cron/수동 | 이메일 |
| **J** | 매도자 진단 리포트 (Seller Report) | 매도 적정성 분석 | 수시 | 아웃리치 탭 | 이메일 |

---

## 3. E2E 파이프라인 상세

### 3.1 주간 매거진 생성 파이프라인

```
[Cron GET /api/cron/weekly-magazine]
  │ (매주 월 KST 07:00, CRON_SECRET 인증)
  │
  ├─ 1. broker_profiles 조회 (subscription_active = true)
  │
  └─ 브로커별 순회 (55초 타임아웃 가드)
       │
       ├─ 2. fetchBrokerContext
       │    └─ broker_profiles → profiles → building_ssot_lite (활성 딜 수)
       │
       ├─ 3. 병렬 데이터 수집 (12개 소스)
       │    ├─ cre_pulses (주간 시장 펄스)
       │    ├─ external_news (뉴스 10건)
       │    ├─ external_transactions (실거래 10건)
       │    ├─ building_ssot_lite (활성 매물 10건)
       │    ├─ social_sentiment (투자 심리 5건)
       │    ├─ auction_listings (경매 5건)
       │    ├─ external_reports (리서치 5건)
       │    ├─ rental_trend_data (임대 트렌드)
       │    ├─ commercial_district (상권 분석)
       │    ├─ summarizeMonthlyTransactions (월간 거래 집계)
       │    ├─ generateMagazineTeaserCards (블라인드 딜 카드)
       │    └─ generateTaxClinicScenario (세무 클리닉)
       │
       ├─ 4. AI 콘텐츠 생성 (gpt-5.4)
       │    ├─ buildWeeklyCoverData → 시장 온도 5단계 결정, 키워드 3개 선정
       │    ├─ buildThemeOfWeek → 금주의 테마 제목 + 본문 + 매칭 딜
       │    └─ generateLLMContent → AI 브리핑 + 인터랙티브 설문
       │
       ├─ 5. 품질 게이트 (runMagazineQualityGate)
       │    ├─ 수치 주장 추출 (%, 억, 평, 건 등)
       │    ├─ 소스 데이터 교차 검증
       │    └─ 20% 이상 불일치 → status='needs_review' (배포 차단)
       │
       ├─ 6. DB 저장
       │    ├─ magazine_editions UPSERT (정규)
       │    └─ magazine_issues UPSERT (호환용 듀얼 라이트)
       │
       └─ 7. 배포 (품질 게이트 통과 시만)
            └─ distributeMagazine → 카카오 알림톡 + 이메일 (5건 배치)
```

**입력 데이터 → 산출 콘텐츠 매핑**:

| 데이터 소스 | 매거진 섹션 |
|------------|-----------|
| `cre_pulses` | 시장 온도 뱃지, 커버 키워드 |
| `external_news` | AI 브리핑, 금주의 테마, 뉴스 큐레이션 |
| `external_transactions` | 실거래 동향 테이블, 월간 요약 |
| `building_ssot_lite` | 추천 매물 카드, 테마 매칭 딜 |
| `social_sentiment` | 투자 심리 지수 (0-100) |
| `auction_listings` | 경매 매물 카드 |
| `external_reports` | 리서치 리포트 카드 |
| `rental_trend_data` | 공실률 · 임대료 지수 |
| `commercial_district` | 상권 매출 · 유동인구 |
| LLM (gpt-5.4) | AI 브리핑, 테마 본문, 설문, 세무 클리닉 |

---

### 3.2 긴급 속보(Special Edition) 파이프라인

```
[브로커 에디터 → SpecialEditionModal]
  │
  ├─ GET /api/broker/magazine/special?buildingId=xxx
  │    ├─ 매물 조회 (building_ssot_lite)
  │    ├─ 관심 매칭 구독자 필터링
  │    └─ 프리뷰 (targetCount, hotLeadCount, matchedPreview)
  │
  └─ POST /api/broker/magazine/special
       ├─ generateSpecialEdition
       │    ├─ 블라인드 티저 카드 생성
       │    ├─ LLM (gpt-5.4) → [단독 속보] 헤드라인 + 3문단 긴급 브리핑
       │    └─ magazine_editions UPSERT (edition_type='special', theme_color='#ef4444')
       │
       └─ distributeSpecialEdition (autoDistribute=true)
            ├─ 관심사 매칭 구독자 필터링
            ├─ 카카오 플래시 알림 (TPL_MAGAZINE_FLASH_ISSUE)
            └─ 이메일 발송
```

---

### 3.3 구독 & 구독 해지 파이프라인

```
[구독 신청]
  ├─ /magazine/{brokerId}/subscribe (서버 컴포넌트)
  │    └─ SubscribeFormClient (클라이언트 폼)
  │         ├─ 이름(선택), 전화(필수), 권역 관심(멀티), 자산 관심(멀티)
  │         └─ POST /api/public/magazine/subscribe
  │              ├─ magazine_subscribers UPSERT (on_conflict: broker_id, subscriber_phone)
  │              └─ activity_events INSERT (event_type: 'magazine_subscribe')
  │
  ├─ SubscribeCard (매거진 인라인 구독 위젯)
  │    ├─ 채널 선택 (카카오/이메일/둘다)
  │    └─ POST /api/public/magazine/subscribe + 레퍼럴 체크
  │
  └─ 브로커 수동 등록
       └─ POST /api/broker/magazine/subscribers
            └─ magazine_subscribers UPSERT (source: 'manual')

[구독 해지]
  └─ GET /api/public/magazine/unsubscribe?token=xxx
       ├─ HMAC-SHA256 토큰 검증
       ├─ 확인 UI 렌더링
       └─ POST → magazine_subscribers UPDATE (status: 'unsubscribed')
              └─ activity_events INSERT (event_type: 'magazine_unsubscribed')
```

---

### 3.4 배포(Distribution) 파이프라인

```
[distributeMagazine / distributeSpecialEdition]
  │
  ├─ 1. 활성 구독자 조회 (status='active')
  ├─ 2. 타겟 세그먼트 필터 (all / buyer / seller / owner)
  ├─ 3. 개인화 삽입문 생성 (generatePersonalizedInsert, gpt-5.4)
  │      └─ 구독자 interest_tags 기반 2-3줄 맞춤 안내문
  ├─ 4. 5건 배치 발송
  │      ├─ 카카오 알림톡 (TPL_MAGAZINE_NEW_ISSUE / TPL_MAGAZINE_FLASH_ISSUE)
  │      └─ 이메일 (buildMagazineHtml → 반응형 다크모드 HTML)
  ├─ 5. activity_events 로깅 (event_type: 'magazine_distributed')
  └─ 6. dispatch_logs 기록 (dispatchEdition 레일)
```

---

### 3.5 열람 & 텔레메트리 파이프라인

```
[독자 매거진 열람]
  │
  ├─ useMagazineAnalytics 훅 (클라이언트)
  │    ├─ 방문자 핑거프린트 (userAgent + screen 해시)
  │    ├─ page_view 즉시 발화
  │    ├─ scroll_depth (25% / 50% / 75% / 100% 마일스톤)
  │    ├─ dwell_time (beforeunload 시 초 단위)
  │    ├─ section_view (IntersectionObserver, threshold 0.3)
  │    ├─ click (IM/프로필/딜 링크 클릭)
  │    └─ navigator.sendBeacon → POST /api/public/magazine/analytics
  │
  └─ POST /api/public/magazine/analytics
       ├─ magazine_analytics_events INSERT
       ├─ activity_events INSERT (중앙 감사 로그)
       ├─ calculateLeadScore (비동기)
       └─ isHotLead → checkAndSendHotLeadAlert (즉시 브로커 알림)
```

---

### 3.6 바이어 온도 & 리드 스코어링 파이프라인

```
[buyer-temperature.ts]
  │
  ├─ computeEngagementScore(profile)
  │    ├─ min(readArticleCount × 5, 50)
  │    ├─ + assetTypes.length × 10
  │    ├─ + regions.length × 5
  │    └─ + recencyBonus (7일 내: +30, 30일 내: +15)
  │
  └─ getBuyerTemperature(profile, crossChannelScore)
       ├─ composite = engagement × 0.4 + crossChannel × 0.6
       └─ 5단계 분류:
            ├─ ≥80: 🔥 적극검토 (빨강)
            ├─ ≥60: 📈 관심 (초록)
            ├─ ≥40: ⏸️ 관망 (노랑)
            ├─ ≥20: ❄️ 냉각 (회색)
            └─ <20: ⚪ 미확인 (짙은 회색)

[자동 온도 상승 경로]
  ├─ 매거진 열람 → readArticleCount +1 (section_view당)
  ├─ 설문 투표 → readArticleCount +3 (+15점 즉시 상승)
  ├─ IM 열람 클릭 → crossChannelScore 가중
  └─ 선택지 3번 → segment 자동 'seller' 변경
```

---

### 3.7 레퍼럴(전달) 바이럴 파이프라인

```
[독자 매거진 하단 → 전달하기 섹션]
  │
  ├─ "카카오톡으로 전달하기" → Kakao.Share.sendDefault
  ├─ "링크 복사" → ref=forward 쿼리 파라미터
  │
  └─ 전달받은 독자 → 구독 신청 시
       └─ POST /api/public/magazine/referral
            ├─ magazine_referrals INSERT (중복 방지: 23505 무시)
            └─ 마일스톤 체크:
                 ├─ 1명: 비공개 시장 분석 리포트
                 ├─ 3명: 엑셀 수지분석기
                 ├─ 5명: 비공개 딜 시트 열람권
                 └─ 10명: 브로커 1:1 전화 자문 30분

[소셜 프루프 카운터]
  └─ GET /api/public/magazine/referral?brokerId=xxx
       └─ totalForwardedSubscribers → 매거진 하단에 표시
```

---

### 3.8 이미지 에셋 생성 파이프라인

| 이미지 에셋 | API 경로 | 크기 | 용도 |
|------------|---------|------|------|
| **매거진 OG** | `GET /api/og/magazine?brokerId=&date=` | 1200×630 | 카카오/SNS 공유 프리뷰 |
| **프로모션 스토리** | `GET /api/magazine/{brokerId}/{date}/image?format=story` | 1080×1920 | 인스타그램 스토리 |
| **프로모션 카드** | `GET /api/magazine/{brokerId}/{date}/image?format=card` | 1080×1080 | SNS 정사각형 카드 |
| **프로모션 OG** | `GET /api/magazine/{brokerId}/{date}/image?format=og` | 1200×630 | 블로그/포럼 공유 |
| **구독 QR** | MagazineQrModal (클라이언트) | 300DPI PNG | 명함, 현장 사인 |

모든 이미지는 `@vercel/og` ImageResponse 엔진으로 서버사이드 실시간 렌더링됩니다.

---

## 4. 도메인 모듈 명세

`src/domain/magazine/` 디렉터리 전체 파일 목록:

| 파일 | 줄 수 | 핵심 역할 |
|------|------|----------|
| [`types.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/types.ts) | 274 | 도메인 타입 정의: MarketTemperature, EditionStatus, EditionType, SectionDef, MagazineEdition 등 |
| [`weekly-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/weekly-generator.ts) | 712 | 주간 매거진 생성 메인 오케스트레이터 |
| [`special-edition-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/special-edition-generator.ts) | 228 | 긴급 속보 매거진 생성기 |
| [`tax-clinic-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/tax-clinic-generator.ts) | 105 | 세무 클리닉 시나리오 AI 생성기 (5개 토픽 풀) |
| [`magazine-teaser-cards.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/magazine-teaser-cards.ts) | 52 | 블라인드 딜 카드 생성 (projectToTeaser 래핑) |
| [`buyer-temperature.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/buyer-temperature.ts) | 80 | 5단계 바이어 온도 분류 엔진 |
| [`subscriber-profile.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/subscriber-profile.ts) | 76 | 구독자 프로필, 참여 점수, AutoIntent 생성 |
| [`quality-gate.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/quality-gate.ts) | 327 | 수치 주장 추출 & 소스 교차검증 품질 게이트 |
| [`distribute-magazine.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/distribute-magazine.ts) | 213 | 주간 매거진 다채널 배포 (카톡 + 이메일) |
| [`distribute-special-edition.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/distribute-special-edition.ts) | 210 | 긴급 속보 스마트 타겟 배포 |
| [`email-template.tsx`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx) | 201 | 반응형 다크모드 이메일 HTML 빌더 |
| [`im-to-magazine-bridge.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/im-to-magazine-bridge.ts) | 63 | IM → 매거진 딜 스니펫 연동 브릿지 |
| [`owner-report-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/owner-report-generator.ts) | 105 | 건물주 분기 성과 리포트 생성 |
| [`rail/dispatcher.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/rail/dispatcher.ts) | 126 | 범용 배포 레일 (주간/매도/건물주 리포트) |
| [`rail/seller-report-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/magazine/rail/seller-report-generator.ts) | 53 | 매도자 성과 리포트 HTML 생성 |

---

## 5. API 엔드포인트 레퍼런스

### 퍼블릭 API (비인증)

| Method | 경로 | 용도 |
|--------|------|------|
| `POST` | `/api/public/magazine/subscribe` | 구독 신청 (UPSERT magazine_subscribers) |
| `GET/POST` | `/api/public/magazine/unsubscribe` | HMAC 토큰 기반 구독 해지 |
| `POST` | `/api/public/magazine/poll` | 설문 투표 + 바이어 온도 자동 상승 |
| `GET` | `/api/public/magazine/poll` | 설문 결과 집계 조회 |
| `POST` | `/api/public/magazine/referral` | 전달 레퍼럴 기록 + 마일스톤 체크 |
| `GET` | `/api/public/magazine/referral` | 전달 통계 조회 (totalForwardedSubscribers) |
| `POST` | `/api/public/magazine/analytics` | 열람 텔레메트리 수신 (sendBeacon) |
| `GET` | `/api/magazine/{brokerId}` | 금일 매거진 데이터 (캐시 → 미스 시 실시간 생성) |
| `POST` | `/api/magazine/{brokerId}` | 매거진 수동 저장 |
| `GET` | `/api/og/magazine` | OG 이미지 생성 (1200×630) |
| `GET` | `/api/magazine/{brokerId}/{date}/image` | 프로모션 이미지 (story/card/og) |

### 브로커 전용 API (인증 필요)

| Method | 경로 | 용도 |
|--------|------|------|
| `GET` | `/api/broker/magazine/analytics` | 대시보드 KPI (뷰/완독률/핫리드/온도분포/섹션히트맵/설문) |
| `GET` | `/api/broker/magazine/analytics?subscriberId=` | 개별 구독자 드릴다운 행동 분석 |
| `GET` | `/api/broker/magazine/subscribers` | 구독자 목록 (바이어 온도 포함) |
| `POST` | `/api/broker/magazine/subscribers` | 수동 구독자 추가 |
| `PATCH` | `/api/broker/magazine/subscribers/{id}` | 구독자 프로필 수정 |
| `DELETE` | `/api/broker/magazine/subscribers/{id}` | 구독자 완전 삭제 |
| `POST` | `/api/broker/magazine/subscribers/{id}/intent` | 구독 행동 → AutoIntent 변환 (buyer_intent_lite 생성) |
| `GET` | `/api/broker/magazine/special?buildingId=` | 긴급 속보 프리뷰 (타겟 구독자 매칭) |
| `POST` | `/api/broker/magazine/special` | 긴급 속보 발행 + 배포 |
| `GET` | `/api/magazine/editions` | 에디션 목록 조회 |
| `POST` | `/api/magazine/editions` | 신규 에디션 생성 (generateWeeklyMagazine 호출) |
| `PATCH` | `/api/magazine/editions` | 에디션 수정 (title, content, status, theme 등 화이트리스트) |

### Cron API

| Method | 경로 | 스케줄 | 용도 |
|--------|------|--------|------|
| `GET` | `/api/cron/weekly-magazine` | 매주 월 KST 07:00 | 전 브로커 주간 매거진 자동 생성 + 배포 |

---

## 6. 매거진 뷰어 섹션 명세

파일: [`magazine-view.tsx`](file:///c:/Users/User/cre-dealcard/src/app/(public)/magazine/[brokerId]/[date]/magazine-view.tsx) (1,234줄)

### 렌더링 섹션 목록 (16개)

| # | 섹션 ID | 렌더 함수 | 설명 | 타겟 필터 |
|---|---------|----------|------|----------|
| 1 | `cover` | (인라인) | 커버 히어로: 브로커 프로필, 시장 온도 뱃지, 키워드 태그, 핵심 지표 카드, 완독 시간 | 전체 |
| 2 | `ai_briefing` | `renderAiBriefing` | AI 마켓 에디터 주간 브리핑 (마크다운) | 전체 |
| 3 | `field_note` | `renderFieldNote` | 브로커 현장 노트 (시장/매수/매도 반응, 시장 판단, 한마디) | 전체 |
| 4 | `theme_of_week` | `renderThemeOfWeek` | 금주의 테마 분석 + 관련 매물 링크 | 전체 |
| 5 | `featured_deals` | `renderFeaturedDeals` | 추천 매물 수평 스냅 스크롤 카드 | 전체 |
| 6 | `poll` | `renderPoll` | 인터랙티브 1-클릭 설문 (투표 후 결과 막대 + 중개사 상담 CTA) | 전체 |
| 7 | `subscribe_cta` | `renderSubscribeCard` | 인라인 구독 위젯 (SubscribeCard) | 전체 |
| 8 | `broker_profile` | `renderBrokerProfile` | 브로커 프로필 카드 (FlatProfileCard) | 전체 |
| 9 | `market_data` | `renderMarketData` | 실거래 테이블, 임대 트렌드, 상권 분석, 월간 요약 (접이식) | 전체 (seller 시 확장) |
| 10 | `news_curation` | `renderNewsCuration` | 뉴스 6건 큐레이션 (감성 도트: 강세/약세/중립) | 전체 |
| 11 | `auction_picks` | `renderAuctionPicks` | 경매 매물 할인율 + 진행 바 + 일정 (접이식) | 전체 |
| 12 | `reports` | `renderReports` | 리서치 리포트 요약 카드 (접이식) | 전체 |
| 13 | `sentiment_index` | `renderSentimentIndex` | CRE 투자 심리 지수 (0-100 게이지) | 전체 |
| 14 | `tax_clinic` | `renderTaxClinic` | 세무 클리닉 대안 A/B 비교 + 전문가 코멘트 + CTA | seller/owner만 |
| 15 | `roi_calculator` | `renderRoiCalculator` | 수지분석 계산기 (6개 슬라이더, Cap/CoC/월현금흐름) | 전체 |
| 16 | `referral` | `renderReferral` | 전달하기 CTA + 소셜 프루프 카운터 + 마일스톤 | 전체 |
| — | `powered_by_badge` | `PoweredByBadge` | "Data Verified by CREDEAL" 역바이럴 뱃지 | 전체 (자동 말미) |

### 섹션 순서 로직 (`buildSections`)

| 타겟 | 순서 |
|------|------|
| **buyer** | ai_briefing → field_note → featured_deals → theme → poll → subscribe → profile → market → news → auction → reports → sentiment → tax → roi → referral → badge |
| **seller** | ai_briefing → field_note → **market**(확장) → sentiment → featured_deals → theme → poll → subscribe → profile → news → auction → reports → tax → roi → referral → badge |
| **default (all)** | ai_briefing → field_note → theme → featured_deals → poll → subscribe → profile → market → news → auction → reports → sentiment → tax → roi → referral → badge |
| **custom** | `data.section_order` 배열 순서 → subscribe → profile → badge |

---

## 7. 매거진 에디터 탭 명세

파일: [`broker/magazine-editor/page.tsx`](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/magazine-editor/page.tsx) (1,470줄)

| 탭 키 | 탭 이름 | 컴포넌트 | 주요 기능 |
|--------|--------|---------|----------|
| `cover` | 커버 | `EditorCoverTab` | 시장 온도 5단계 선택, 키워드 3개 입력, 헤드라인, AI 브리핑 편집, 커버 이미지 업로드 |
| `field_note` | 필드노트 | `EditorFieldNoteTab` | 5개 구조화 프롬프트: 시장 요약, 매수 반응, 매도 반응, 시장 판단, 독자 한마디 |
| `theme_deals` | 테마&매물 | `EditorThemeDealsTab` | 테마 제목/본문 편집, 활성 매물 체크박스 연결 |
| `news` | 뉴스 | `NewsCurationPanel` | 외부 뉴스 토글 on/off, AI 요약/중요도/감성 표시 |
| `ai_assist` | AI비서 | `EditorAiAssistTab` | 거친 메모 → AI 전문 코멘터리 변환 |
| `outreach` | 아웃리치 | `EditorOutreachTab` | 구독자 관리(검색/온도필터/QR/수동추가/태그편집/AutoIntent), 매도자 진단 발송, 공동중개 제안 |
| `publish` | 발행설정 | (인라인) | 에디션 정보, 테마 컬러, 타겟 세그먼트, 1-Click 설문 설정, 섹션 재배치, 스토리 이미지 다운로드, 초안 저장 & 발행 |
| `analytics` | 성과 | `EditorAnalyticsTab` | 4 KPI 카드, 설문 분포, 5단계 온도 필터, 핫리드 피드, 섹션 히트맵, 에디션 추이, "전화 오프닝 치트시트" AI 생성 |

**레이아웃**: 좌측 460px 에디터 패널 + 우측 iPhone 14 Pro 프리뷰 (`MagazinePhonePreview`, 375×812).

**자동 저장**: 30초 디바운스, 발행 전 상태에서만 PATCH `/api/magazine/editions` 호출.

---

## 8. DB 테이블 의존 맵

```
magazine_editions (정규 에디션 저장소)
├─ broker_id, edition_type, edition_label, status, content, title
├─ market_temp, cover_keywords, featured_deal_ids, cover_image_url
├─ theme_color, field_note, theme_title, theme_body_md
└─ published_at, created_at, updated_at

magazine_issues (호환용 듀얼 라이트)
├─ broker_id, issue_date, content
└─ created_at

magazine_subscribers (구독자)
├─ broker_id, subscriber_phone, subscriber_email, subscriber_name
├─ channel ('kakao'|'email'|'both'), status, source, segment
├─ interest_tags (JSON), interest_profile (JSON), client_id
└─ subscribed_at, unsubscribed_at

magazine_analytics_events (열람 텔레메트리)
├─ edition_id, visitor_id, event_type, section_id
├─ target_url, target_param, dwell_seconds, scroll_pct
└─ metadata (JSON)

magazine_poll_responses (설문 투표)
├─ broker_id, edition_date, choice, subscriber_phone
└─ created_at

magazine_referrals (전달 레퍼럴)
├─ broker_id, referrer_phone, referred_phone
└─ created_at (unique: broker_id, referrer_phone, referred_phone)

activity_events (중앙 감사 로그 — 매거진 관련 이벤트)
├─ event_type: 'magazine_subscribe' | 'magazine_unsubscribed' | 'magazine_distributed'
│              'magazine_view' | 'magazine_to_im_click' | 'magazine_to_vibe_click'
│              'poll_vote'
└─ actor_id, entity_type, entity_id, metadata, created_at

dispatch_logs (배포 추적)
├─ edition_type, edition_id, target_id, channel, status
└─ sent_at
```

---

## 9. 품질 게이트 & 안전장치

### 9.1 AI 콘텐츠 품질 게이트 (`quality-gate.ts`)

| 단계 | 동작 | 실패 시 |
|------|------|---------|
| 수치 추출 | 한국어 CRE 수치 패턴 (%, 억, 만원, 평, ㎡, 건) 자동 추출 | — |
| 소스 검증 | 소스 데이터 플래트닝 → 20% 편차 허용 범위 교차 검증 | 불일치 이슈 기록 |
| 판정 | matchedClaims / totalClaims 비율 계산 | **≤80% → status='needs_review'** |
| 배포 차단 | Cron 루프에서 `needs_review` 에디션 자동 SKIP | 브로커에게 검토 알림 |

### 9.2 에러 복원력

| 구간 | 장애 대응 |
|------|----------|
| 데이터 소스 fetch 실패 | 개별 try/catch, null/빈배열 반환 → 해당 섹션만 비어서 렌더링 |
| LLM 호출 실패 | 뉴스 기반 폴백 헤드라인/브리핑 자동 합성 |
| 세무 클리닉 LLM 실패 | 하드코딩된 증여/상속 기본 시나리오 반환 |
| magazine_editions 저장 실패 | Fatal Error throw (배포 방지) |
| magazine_issues 듀얼 라이트 실패 | Non-blocking warning 로깅 |
| 구독자 배포 실패 | 개별 catch, 실패 카운트 집계 반환 |
| Cron 55초 초과 | 타임아웃 가드 루프, 나머지 브로커 다음 주기로 이연 |

### 9.3 보안

| 항목 | 메커니즘 |
|------|---------|
| 구독 해지 | HMAC-SHA256 토큰 (SUPABASE_SERVICE_ROLE_KEY 기반) |
| Cron 인증 | `CRON_SECRET` Bearer 토큰 |
| 브로커 API | Supabase Auth 세션 + `broker_id = user.id` 소유권 검증 |
| 블라인드 보호 | projectToTeaser → 지번/소유자 마스킹, 가격 밴딩 |
