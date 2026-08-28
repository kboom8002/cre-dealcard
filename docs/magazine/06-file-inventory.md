# 06. 파일 인벤토리 (File Inventory)

> **감사 일시**: 2026-08-28 | **감사 범위**: 모닝 인텔리전스 & 매거진 관련 전체 파일

---

## 1. 도메인 로직 (src/domain/)

### 1.1 외부 데이터 수집 (`src/domain/external/`)

| 파일 | 크기 | 핵심 역할 |
|------|------|----------|
| [market-crawlers.ts](file:///c:/Users/User/cre-dealcard/src/domain/external/market-crawlers.ts) | 496 lines | 6대 경제지 RSS, BigKinds, 네이버 뉴스, 유튜브, 경매, 임대 크롤링 + LLM 스코어링/요약 |
| [gov-premium-apis.ts](file:///c:/Users/User/cre-dealcard/src/domain/external/gov-premium-apis.ts) | 282 lines | 국토부, 부동산원, SEMAS, 에너지공단, 세움터 공공 API 7종 연동 |

### 1.2 매거진 도메인 (`src/domain/magazine/`)

| 파일 | 크기 | 핵심 역할 |
|------|------|----------|
| [types.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/types.ts) | 265 lines | 시장온도, 에디션상태, 섹션ID, BrokerFieldNote, MagazineEdition 인터페이스, 헬퍼 |
| [weekly-generator.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/weekly-generator.ts) | 610 lines | 주간 매거진 오케스트레이터 (컨텍스트→LLM→품질검증→저장) |
| [quality-gate.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/quality-gate.ts) | 326 lines | 수치 할루시네이션 검증 (한국 부동산 단위 파싱, 원천 대비 검증) |
| [distribute-magazine.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/distribute-magazine.ts) | 130 lines | 카카오 알림톡 배포 (5건 배치 + 로깅) |
| [subscriber-profile.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/subscriber-profile.ts) | 73 lines | 참여 점수 + 자동 매수의향 생성 |
| [magazine-teaser-cards.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/magazine-teaser-cards.ts) | 34 lines | 딜 속성 → TeaserView 보안 투영 |
| [im-to-magazine-bridge.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/im-to-magazine-bridge.ts) | ~50 lines | IM 투자논거 → 매거진 스니펫 추출 |
| [owner-report-generator.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/owner-report-generator.ts) | 87 lines | 분기별 소유자 리포트 (호가 vs 유사거래) |
| [rail/dispatcher.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/rail/dispatcher.ts) | 67 lines | 유니버설 멀티에디션 디스패처 |
| [rail/seller-report-generator.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/rail/seller-report-generator.ts) | 52 lines | 매도자 HTML 성과 보고서 |

### 1.3 분석/알림 도메인

| 파일 | 핵심 역할 |
|------|----------|
| [src/domain/analytics/cross-channel-score.ts](file:///c:/Users/User/cre-dealcard/src/domain/analytics/cross-channel-score.ts) | 3채널 크로스 터치포인트 리드 스코어링 (14일 윈도우) |
| [src/domain/analytics/record-event.ts](file:///c:/Users/User/cre-dealcard/src/domain/analytics/record-event.ts) | 중앙 이벤트 기록 |
| [src/domain/analytics/roi-calculator.ts](file:///c:/Users/User/cre-dealcard/src/domain/analytics/roi-calculator.ts) | 브로커 ROI 계산 (매거진 포함) |
| [src/domain/notification/hot-lead-alert.ts](file:///c:/Users/User/cre-dealcard/src/domain/notification/hot-lead-alert.ts) | 핫리드 카카오 알림톡 (24시간 중복 제거) |
| [src/lib/notification/notification-service.ts](file:///c:/Users/User/cre-dealcard/src/lib/notification/notification-service.ts) | Solapi REST v4 HMAC-SHA256 클라이언트 |

### 1.4 IM 브릿지

| 파일 | 핵심 역할 |
|------|----------|
| [src/domain/building/mobile-im/im-to-magazine-bridge.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-to-magazine-bridge.ts) | Mobile IM → 매거진 스니펫 추출 |

---

## 2. API 라우트 핸들러 (src/app/api/)

### 2.1 모닝 인텔리전스

| 파일 | 크기 | 엔드포인트 |
|------|------|-----------|
| [broker/morning-intelligence/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/route.ts) | 472 lines | `GET /api/broker/morning-intelligence` |
| [broker/morning-intelligence/custom/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/custom/route.ts) | 151 lines | `GET/POST /api/broker/morning-intelligence/custom` |
| [broker/morning-intelligence/combine/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/combine/route.ts) | 141 lines | `POST /api/broker/morning-intelligence/combine` |
| [cron/morning-briefing/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/morning-briefing/route.ts) | 100 lines | `GET /api/cron/morning-briefing` |
| [pulse/morning-briefing/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/pulse/morning-briefing/route.ts) | 101 lines | `GET /api/pulse/morning-briefing` |
| [public/market-intelligence/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/market-intelligence/route.ts) | 99 lines | `GET /api/public/market-intelligence` |

### 2.2 매거진

| 파일 | 엔드포인트 |
|------|-----------|
| [magazine/[brokerId]/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/magazine/[brokerId]/route.ts) | `GET/POST /api/magazine/[brokerId]` |
| [magazine/editions/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/magazine/editions/route.ts) | `GET/POST/PATCH /api/magazine/editions` |
| [broker/magazine/subscribers/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/subscribers/route.ts) | `GET/POST /api/broker/magazine/subscribers` |
| [broker/magazine/subscribers/[id]/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/subscribers/[id]/route.ts) | `PATCH/DELETE /api/broker/magazine/subscribers/[id]` |
| [broker/magazine/analytics/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/analytics/route.ts) | `GET /api/broker/magazine/analytics` |
| [public/magazine/subscribe/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts) | `POST /api/public/magazine/subscribe` |
| [public/magazine/unsubscribe/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts) | `GET/POST /api/public/magazine/unsubscribe` |
| [public/magazine/analytics/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/analytics/route.ts) | `POST /api/public/magazine/analytics` |
| [cron/weekly-magazine/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/weekly-magazine/route.ts) | `GET /api/cron/weekly-magazine` |
| [cron/owner-reports/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/owner-reports/route.ts) | `GET /api/cron/owner-reports` |
| [og/magazine/route.tsx](file:///c:/Users/User/cre-dealcard/src/app/api/og/magazine/route.tsx) | `GET /api/og/magazine` |
| [broker/reports/owner/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/reports/owner/route.ts) | `POST /api/broker/reports/owner` |

---

## 3. 프론트엔드 페이지 (src/app/)

### 3.1 브로커 전용 페이지

| 파일 | 라우트 | 역할 |
|------|--------|------|
| [(broker)/broker/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/page.tsx) | `/broker` | 브로커 코크핏 (MorningIntelligence 주입) |
| [(broker)/broker/morning-detail/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/morning-detail/page.tsx) | `/broker/morning-detail` | 인텔리전스 상세 드릴다운 |
| [(broker)/broker/magazine-editor/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/magazine-editor/page.tsx) | `/broker/magazine-editor` | 8탭 매거진 에디터 |
| [(broker)/broker/clients/new/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/clients/new/page.tsx) | `/broker/clients/new` | 고객 등록 (매거진 자동구독 체크박스) |

### 3.2 공개 페이지

| 파일 | 라우트 | 역할 |
|------|--------|------|
| [(public)/magazine/[brokerId]/[date]/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(public)/magazine/[brokerId]/[date]/page.tsx) | `/magazine/[brokerId]/[date]` | 매거진 공개 뷰어 (SSR + ISR) |
| [(public)/magazine/[brokerId]/[date]/magazine-view.tsx](file:///c:/Users/User/cre-dealcard/src/app/(public)/magazine/[brokerId]/[date]/magazine-view.tsx) | - | 클라이언트 뷰어 컴포넌트 |
| [(public)/pulse/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(public)/pulse/page.tsx) | `/pulse` | 공개 시장 펄스 |
| [(public)/pulse/[region]/[period]/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(public)/pulse/[region]/[period]/page.tsx) | `/pulse/[region]/[period]` | 권역별 펄스 뷰어 |

---

## 4. UI 컴포넌트 (src/components/)

### 4.1 대시보드 컴포넌트

| 파일 | 역할 |
|------|------|
| [dashboard/MorningIntelligence.tsx](file:///c:/Users/User/cre-dealcard/src/components/dashboard/MorningIntelligence.tsx) | 모닝 인텔리전스 메인 (1,153 lines) |
| [dashboard/BrokerDashboardTabs.tsx](file:///c:/Users/User/cre-dealcard/src/components/dashboard/BrokerDashboardTabs.tsx) | 3단 탭 네비게이션 |
| [dashboard/MagazineInsightCard.tsx](file:///c:/Users/User/cre-dealcard/src/components/dashboard/MagazineInsightCard.tsx) | 매거진 성과 피드백 카드 |
| [dashboard/RoiCard.tsx](file:///c:/Users/User/cre-dealcard/src/components/dashboard/RoiCard.tsx) | ROI 계산 카드 (매거진 시간 절감) |

### 4.2 매거진 에디터 컴포넌트

| 파일 | 역할 |
|------|------|
| [magazine-editor/EditorAiAssistTab.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorAiAssistTab.tsx) | AI 코멘트 리라이트 |
| [magazine-editor/EditorOutreachTab.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorOutreachTab.tsx) | 소유자 진단, 공동중개 |
| [magazine-editor/NewsCurationPanel.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/NewsCurationPanel.tsx) | 뉴스 큐레이션 패널 |

### 4.3 매거진 공개 컴포넌트

| 파일 | 역할 |
|------|------|
| [magazine/SubscribeCard.tsx](file:///c:/Users/User/cre-dealcard/src/components/magazine/SubscribeCard.tsx) | 인라인 구독 폼 |

---

## 5. 커스텀 훅 (src/hooks/)

| 파일 | 역할 |
|------|------|
| [useMagazineDraft.ts](file:///c:/Users/User/cre-dealcard/src/hooks/useMagazineDraft.ts) | 매거진 초안 블록 관리 (싱글톤, 5초 디바운스) |
| [use-magazine-analytics.ts](file:///c:/Users/User/cre-dealcard/src/hooks/use-magazine-analytics.ts) | 독자 행동 추적 (핑거프린트, 스크롤, 체류, Beacon) |

---

## 6. 데이터베이스 마이그레이션 (supabase/migrations/)

| 파일 | 대상 테이블 |
|------|------------|
| [00034_poc_features.sql](file:///c:/Users/User/cre-dealcard/supabase/migrations/00034_poc_features.sql) | `external_news`, `external_transactions`, `auction_listings`, `rental_market_data`, `social_sentiment`, `youtube_trends` |
| [20260622_news_pipeline_upgrade.sql](file:///c:/Users/User/cre-dealcard/supabase/migrations/20260622_news_pipeline_upgrade.sql) | `external_news` 고도화 |
| [00054_magazine_issues.sql](file:///c:/Users/User/cre-dealcard/supabase/migrations/00054_magazine_issues.sql) | `magazine_issues` |
| [00063_weekly_magazine.sql](file:///c:/Users/User/cre-dealcard/supabase/migrations/00063_weekly_magazine.sql) | `magazine_editions`, `magazine_analytics_events`, `broker_profiles` 확장 |
| [00065_magazine_subscribers.sql](file:///c:/Users/User/cre-dealcard/supabase/migrations/00065_magazine_subscribers.sql) | `magazine_subscribers`, `append_magazine_deal_snippet` RPC |
| [0220_magazine_upgrade.sql](file:///c:/Users/User/cre-dealcard/supabase/migrations/0220_magazine_upgrade.sql) | Phase 3 확장 컬럼 |

---

## 7. 테스트 파일

| 파일 | 유형 | 커버리지 |
|------|------|---------|
| [src/tests/domain/market-crawlers.test.ts](file:///c:/Users/User/cre-dealcard/src/tests/domain/market-crawlers.test.ts) | 단위 | 뉴스/리포트 수집 검증 |
| [src/tests/e2e/mece-v2-pipeline-runner.ts](file:///c:/Users/User/cre-dealcard/src/tests/e2e/mece-v2-pipeline-runner.ts) | E2E | INTEL-01~03 인증 차단 검증 |

---

## 8. 기존 문서

| 파일 | 내용 |
|------|------|
| [docs/61-morning-intelligence-hub-guide.md](file:///c:/Users/User/cre-dealcard/docs/61-morning-intelligence-hub-guide.md) | 모닝 인텔리전스 시스템 가이드 |
| [docs/66-integrated-magazine-intelligence-user-guide-jsrealty.md](file:///c:/Users/User/cre-dealcard/docs/66-integrated-magazine-intelligence-user-guide-jsrealty.md) | 통합 매거진-인텔리전스 v3 워크플로우 |
| [docs/Mobile-Magazine-System-Architecture-and-Guide.md](file:///c:/Users/User/cre-dealcard/docs/Mobile-Magazine-System-Architecture-and-Guide.md) | 매거진 아키텍처 가이드 |
| [docs/personalized-magazine-standard-spec.md](file:///c:/Users/User/cre-dealcard/docs/personalized-magazine-standard-spec.md) | 개인화 매거진 표준 명세 |
| [docs/credal_v3/SDD-magazine.md](file:///c:/Users/User/cre-dealcard/docs/credal_v3/SDD-magazine.md) | 매거진 SDD |
| [docs/credal_v3/audit/magazine-architecture.md](file:///c:/Users/User/cre-dealcard/docs/credal_v3/audit/magazine-architecture.md) | 매거진 아키텍처 감사 |
| [docs/credal_v3/specs/magazine-upgrade-plan.md](file:///c:/Users/User/cre-dealcard/docs/credal_v3/specs/magazine-upgrade-plan.md) | 매거진 업그레이드 계획 |

---

## 9. 인프라 설정 파일

| 파일 | 관련 설정 |
|------|----------|
| [vercel.json](file:///c:/Users/User/cre-dealcard/vercel.json) | Cron 스케줄 (morning-briefing, weekly-magazine, owner-reports) |
| [package.json](file:///c:/Users/User/cre-dealcard/package.json) | 의존성 (ai-sdk, openai, supabase, solapi 등) |

---

## 10. 파일 수량 통계

| 카테고리 | 파일 수 |
|---------|--------|
| 도메인 로직 | 15 |
| API 라우트 | 18 |
| 프론트엔드 페이지 | 8 |
| UI 컴포넌트 | 8 |
| 커스텀 훅 | 2 |
| DB 마이그레이션 | 6 |
| 테스트 | 2 |
| 기존 문서 | 7 |
| 인프라 설정 | 2 |
| **합계** | **68** |
