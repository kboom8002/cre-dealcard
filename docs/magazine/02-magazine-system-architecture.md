# 02. 매거진 시스템 아키텍처 (Magazine System Architecture)

> **감사 일시**: 2026-08-28 | **감사 범위**: src/domain/magazine, src/app/api/magazine, src/components/magazine-editor

---

## 1. 개요

**CRE Mobile Magazine**은 상업용 부동산 1인 중개사를 위한 AI 기반 화이트라벨 콘텐츠 마케팅 플랫폼입니다. 주간 CRE 시장 인텔리전스, 지역 부동산 트렌드, 감성 지표, 활성 매물 티저를 자동/반자동으로 큐레이션하여 투자자에게 **카카오 알림톡** 및 **웹 뷰어**로 배포합니다.

### 아키텍처 파이프라인 (전체 주기)

```
데이터 집계 → AI 생성 → 품질 검증 → 티저 투영 → 배포 → 독자 분석 → 피드백 루프
```

---

## 2. 도메인 타입 시스템

> 파일: [types.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/types.ts) (265 lines)

### 2.1 시장 온도 (MarketTemperature)

| 온도 | 이모지 | 색상 | 설명 |
|------|--------|------|------|
| `적극 매수` | 🔥 | `#ef4444` | 강한 매수 신호 — 거래량 급증, 매물 소진 빠름 |
| `선별 매수` | 📈 | `#f59e0b` | 선별적 기회 — 입지·가격 따져 진입 가능 |
| `관망` | ⏸️ | `#6b7280` | 뚜렷한 방향 없이 거래 위축 |
| `조정 대기` | 📉 | `#3b82f6` | 조정 진행 중 — 급매 가능, 하락 리스크 상존 |
| `위기 경계` | 🚨 | `#dc2626` | 금리·경기 악재 집중, 신규 투자 보류 권고 |

### 2.2 에디션 상태 (EditionStatus)

```
draft → editing → review → needs_review → scheduled → published → archived
```

### 2.3 에디션 유형 (EditionType)

`daily` | `weekly` | `monthly` | `special`

### 2.4 브로커 현장 노트 (BrokerFieldNote)

| 필드 | 설명 |
|------|------|
| `question` | 이번 주 시장을 한 문장으로? |
| `buyerReaction` | 매수자 반응 |
| `sellerReaction` | 매도자 반응 |
| `marketJudgment` | 본인의 시장 판단 |
| `comment` | 독자에게 한마디 |

### 2.5 섹션 구성

**MVP 기본 6개 섹션** (`WEEKLY_SECTIONS_MVP`):

| 순서 | ID | 라벨 | 아이콘 |
|------|----|------|--------|
| 1 | `cover` | 커버 | 📰 |
| 2 | `ai_briefing` | AI 브리핑 | 🤖 |
| 3 | `field_note` | 현장 노트 | 📝 |
| 4 | `theme_of_week` | 금주의 테마 | 🎯 |
| 5 | `featured_deals` | 주목 매물 | 🏢 |
| 6 | `broker_profile` | 브로커 프로필 | 👤 |

**확장 5개 섹션** (`EXTRA_SECTIONS`, 접이식):

| 순서 | ID | 라벨 | 아이콘 |
|------|----|------|--------|
| 7 | `market_data` | 시장 데이터 | 📊 |
| 8 | `news_curation` | 뉴스 큐레이션 | 📋 |
| 9 | `auction_picks` | 경매 픽 | 🔨 |
| 10 | `reports` | 리포트 | 📄 |
| 11 | `sentiment_index` | 심리 지수 | 🌡️ |

---

## 3. 핵심 도메인 모듈 (`src/domain/magazine/`)

### 3.1 주간 매거진 생성기 — [weekly-generator.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/weekly-generator.ts) (610 lines)

핵심 오케스트레이터 함수 `generateWeeklyMagazine()` (L440-L609):

```
fetchBrokerContext()
    → Promise.all([Pulse, News, Transactions, Deals, Sentiment])
    → buildWeeklyCoverData()          // 시장 온도 결정
    → buildThemeOfWeek()              // LLM 주간 테마 생성
    → generateLLMContent()            // AI 브리핑 텍스트
    → generateMagazineTeaserCards()   // 티저 카드 보안 투영
    → runMagazineQualityGate()        // 수치 할루시네이션 검증
    → upsert magazine_editions        // DB 저장
    → dual-write magazine_issues      // 레거시 호환
```

**시장 온도 결정 로직** (`buildWeeklyCoverData`, L232-264):

| Pulse/Sentiment 점수 | 시장 온도 |
|----------------------|----------|
| ≥ 80 | 적극 매수 |
| ≥ 65 | 선별 매수 |
| ≥ 45 | 관망 |
| ≥ 25 | 조정 대기 |
| < 25 | 위기 경계 |

**주간 테마 생성** (`buildThemeOfWeek`, L271-334):
- 상위 뉴스 항목 + 활성 매물 교차 분석
- LLM으로 주간 포커스 스토리 추출

### 3.2 품질 게이트 — [quality-gate.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/quality-gate.ts) (326 lines)

**수치 할루시네이션 방지 시스템**:

| 함수 | 라인 | 설명 |
|------|------|------|
| `extractNumericClaims()` | L47-78 | 정규식으로 한국 부동산 수치+단위 추출 (`%`, `억`, `만원`, `평`, `㎡`, `건`, `호`, `층`, `세대`, `조`) |
| `validateAgainstSource()` | L185-254 | 원천 데이터 대비 재귀 검증 |
| `runMagazineQualityGate()` | L267-326 | 불일치율 산출 → >20% 시 `needs_review` 플래그 |

**허용 오차 (Tolerance Thresholds)**:

| 단위 | 허용 오차 |
|------|----------|
| `%` (비율) | ±2% |
| `억`, `만원` (금액) | ±5% |
| `건`, `호`, `층` (수량) | 정확 일치 |

### 3.3 티저 투영 — [magazine-teaser-cards.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/magazine-teaser-cards.ts)

`generateMagazineTeaserCards()`: 딜 속성을 `projectToTeaser()`를 통해 **TeaserView**로 변환
- 정확한 주소 → 권역/동 단위 마스킹
- 정확한 가격 → 대역 범위 (예: 50~60억대)
- 좌표 → 제거
- 민감 재무 정보 → 대역 투영

### 3.4 배포 엔진 — [distribute-magazine.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/distribute-magazine.ts)

`distributeMagazine()` (L10-130):
1. `magazine_subscribers`에서 활성 카카오 구독자 조회
2. 5건 단위 배치 청크 분할
3. `sendKakaoAlimtalk()` 호출 (템플릿: `TPL_MAGAZINE_NEW_ISSUE`)
4. `activity_events` 로깅 (`magazine_distributed`)
5. Rail Dispatcher를 통한 유니버설 배포

### 3.5 레일 디스패처 — [rail/dispatcher.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/rail/dispatcher.ts)

`dispatchEdition()` (L30-67): 유니버설 멀티에디션 디스패처
- 지원 유형: `weekly`, `seller_report`, `owner_report`
- `dispatch_logs` 테이블에 발송 로그 기록

### 3.6 매도자 리포트 — [rail/seller-report-generator.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/rail/seller-report-generator.ts)

`generateSellerReportHtml()`: 매물 매도자에게 전달하는 HTML 성과 보고서
- 조회수, 문의 건수, 시장 인사이트

### 3.7 소유자 리포트 — [owner-report-generator.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/owner-report-generator.ts)

`generateOwnerReport()` (L37-87): 분기별 소유자 리포트
- 현재 호가 vs 유사 거래 비교 분석
- 감정가 변화 산출
- 매도 적기 시그널 감지

### 3.8 구독자 프로파일링 — [subscriber-profile.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/subscriber-profile.ts)

| 함수 | 설명 |
|------|------|
| `computeEngagementScore()` (L39-52) | 열람 기사·자산유형·관심 권역·최근성 기반 0~100 참여 점수 |
| `generateAutoIntents()` (L57-73) | 열람 패턴 → 자동 매수 의향 초안 (`AutoIntent`) 생성 |

### 3.9 IM-매거진 브릿지

| 파일 | 함수 | 설명 |
|------|------|------|
| [im-to-magazine-bridge.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/im-to-magazine-bridge.ts) | `extractAndAppendDealSnippet()` | IM 개요에서 1줄 투자논거 추출 → `pending_magazine_deals` RPC 호출 |
| [mobile-im bridge](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-to-magazine-bridge.ts) | `extractMagazineSnippet()` | Mobile IM → 매거진 스니펫 추출 |

---

## 4. 에디터 UI (8탭 스튜디오)

> 페이지: [magazine-editor/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/magazine-editor/page.tsx)

| 탭 # | ID | 라벨 | 핵심 기능 |
|-------|-----|------|----------|
| 1 | `cover` | 커버 | 시장 온도, 키워드, 커버 이미지, 브로커 메시지 |
| 2 | `field_note` | 현장 노트 | 5필드 브로커 직접 코멘트 |
| 3 | `theme_deals` | 테마/매물 | 주간 테마 설정, 추천 매물 선택 |
| 4 | `news` | 뉴스 | 중요도·감성 기반 뉴스 토글 선택 |
| 5 | `ai_assist` | AI 비서 | AI 코멘트 리라이트 (러프 → 전문 CRE 코멘트) |
| 6 | `outreach` | 아웃리치 | 소유자 진단, 공동중개 제안, 벤더 연결 |
| 7 | `publish` | 발행 | 상태 전환 (draft→published), 카카오 공유 트리거 |
| 8 | `analytics` | 성과분석 | 30일 조회수, 고유 방문자, 체류 시간, 스크롤 완독률 |

**주요 기능**:
- 라이브 모바일 프리뷰 (사이드바이사이드)
- 30초 디바운스 자동저장
- Pending IM 스니펫 임포트
- 카카오 공유 직접 트리거

### 에디터 보조 컴포넌트

| 컴포넌트 | 설명 |
|---------|------|
| [EditorAiAssistTab.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorAiAssistTab.tsx) | AI 코멘트 리라이트 (러프 아이디어 → 전문 CRE 코멘트) |
| [EditorOutreachTab.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorOutreachTab.tsx) | 소유자 매도 준비 진단, 공동중개 제안서, 벤더 링크 |
| [NewsCurationPanel.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/NewsCurationPanel.tsx) | 뉴스 중요도·감성 태그, 포함/제외 토글 |

---

## 5. 공개 뷰어

### 페이지 라우트
```
/magazine/[brokerId]/[date]
```

### 서버 컴포넌트 — [page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(public)/magazine/[brokerId]/[date]/page.tsx)
- ISR: `revalidate = 1800` (30분)
- 동적 OpenGraph 메타데이터 생성
- `magazine_issues` 또는 `magazine_editions`에서 캐시 조회

### 클라이언트 뷰어 — [magazine-view.tsx](file:///c:/Users/User/cre-dealcard/src/app/(public)/magazine/[brokerId]/[date]/magazine-view.tsx)

**렌더링 구성**:
1. 커버/히어로: 시장 온도 뱃지, 키워드, 브로커 브랜딩
2. 6 MVP 섹션 + 5 확장 접이식 섹션
3. 하단 고정 액션 바: 전화 상담, IM 열람, 카카오/네이티브 공유

**페르소나 적응형 레이아웃** (L624-681):
- `?target=buyer` → 딜 + 테마 우선 배치
- `?target=seller` → 시장 실거래 우선 배치

### 구독 카드 — [SubscribeCard.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine/SubscribeCard.tsx)
- 인라인 전화번호·이름 옵트인 폼
- `/api/public/magazine/subscribe` 제출

---

## 6. Cron 스케줄링

[vercel.json](file:///c:/Users/User/cre-dealcard/vercel.json) 설정:

| 크론 | 스케줄 | KST 시간 | 설명 |
|------|--------|---------|------|
| `/api/cron/weekly-magazine` | `0 22 * * 0` | 매주 일요일 07:00 | 모든 활성 브로커 주간 매거진 생성 + 배포 |
| `/api/cron/owner-reports` | `0 9 1 1,4,7,10 *` | 분기 첫째날 18:00 | 소유자 분기 리포트 생성 |

---

## 7. 알림 시스템 통합

### 카카오 알림톡 템플릿

**`TPL_MAGAZINE_NEW_ISSUE`** (신규 매거진 발행 알림):
```
[CRE Deal] 📰 신규 주간 매거진 발행
#{subscriberName}님, #{brokerName} 중개인이 발행한 위클리 CRE 시장 인사이트 매거진이 도착했습니다.
이번 주 핵심 매물 정보와 시장 동향을 확인해 보세요!
👉 #{magazineUrl}
수신 거부: #{unsubscribeUrl}
```

**`TPL_HOT_LEAD`** (핫리드 알림):
- 브로커에게 핫리드 감지 시 자동 발송
- 점수, 터치포인트, 매물 조회수 포함

### 수신 거부 처리
- HMAC-SHA256 토큰 검증 (`subscriberId.brokerId.signature`)
- GET: HTML 수신거부 페이지 렌더링
- POST: `unsubscribed` 상태 업데이트 + 이벤트 로깅

---

## 8. OpenGraph 동적 이미지

[/api/og/magazine](file:///c:/Users/User/cre-dealcard/src/app/api/og/magazine/route.tsx):
- 1200×630 동적 OG 프리뷰 이미지
- `@vercel/og` (Satori) 활용
- 브로커 브랜딩, 시장 온도, 핵심 통계 포함
