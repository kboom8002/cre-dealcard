# 06. 파일 인벤토리 (File Inventory)

> **감사 일시**: 2026-08-28 | **감사 범위**: 모닝 인텔리전스 & 매거진 관련 전체 파일
> **2026-10-06 D-02 동기화**: 폐기·삭제 파일은 취소선으로 표시했고, 신규 파일(발송 게이트·동의·분석 등)은 **[§11](#11-d-02-동기화-2026-10-06--신규현행-파일)** 에 정리했습니다. 줄 수는 2026-08 기준입니다.

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
| [distribute-magazine.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/distribute-magazine.ts) | 130 lines (2026-08 기준) | **현행: sendGate 경유 발송**(원장 기록·동의·수신거부·야간·표기 검사). 아래 §11 참조 |
| [subscriber-profile.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/subscriber-profile.ts) | 73 lines | 참여 점수 + 자동 매수의향 생성 |
| [magazine-teaser-cards.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/magazine-teaser-cards.ts) | 34 lines | 딜 속성 → TeaserView 보안 투영 |
| [im-to-magazine-bridge.ts](file:///c:/Users/User/cre-dealcard/src/domain/magazine/im-to-magazine-bridge.ts) | ~50 lines | IM 투자논거 → 매거진 스니펫 추출 |
| ~~owner-report-generator.ts~~ | — | **삭제됨(폐기)** — 소유자 리포트 기능 제거 |
| ~~rail/dispatcher.ts~~ | — | **삭제됨(폐기)** — 유니버설 멀티에디션 디스패처 |
| ~~rail/seller-report-generator.ts~~ | — | **삭제됨(폐기)** — 매도자 성과 보고서 |

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
| [cron/weekly-magazine/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/weekly-magazine/route.ts) | `GET /api/cron/weekly-magazine` (생성만, 발송 없음) |
| [cron/retention-purge/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/cron/retention-purge/route.ts) | `GET/POST /api/cron/retention-purge` |
| [pulse/generate/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/pulse/generate/route.ts) | `GET/POST /api/pulse/generate` (cron GET → POST 위임) |
| [magazine/editions/draft/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/magazine/editions/draft/route.ts) | `POST /api/magazine/editions/draft` |
| [magazine/editions/[id]/publish/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/magazine/editions/[id]/publish/route.ts) | `POST /api/magazine/editions/[id]/publish` |
| [magazine/[brokerId]/[date]/image/route.tsx](file:///c:/Users/User/cre-dealcard/src/app/api/magazine/[brokerId]/[date]/image/route.tsx) | `GET /api/magazine/[brokerId]/[date]/image` |
| [broker/magazine/subscribers/[id]/intent/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/subscribers/[id]/intent/route.ts) | `POST …/subscribers/[id]/intent` |
| [broker/magazine/distribute/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/distribute/route.ts) | `POST /api/broker/magazine/distribute` (sendGate) |
| [broker/magazine/special/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/magazine/special/route.ts) | `GET/POST /api/broker/magazine/special` (sendGate) |
| [public/magazine/confirm/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/confirm/route.ts) | `GET/POST /api/public/magazine/confirm` |
| [public/magazine/poll/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/poll/route.ts) | `GET/POST /api/public/magazine/poll` |
| [public/magazine/referral/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/referral/route.ts) | `GET/POST /api/public/magazine/referral` |
| [og/magazine/route.tsx](file:///c:/Users/User/cre-dealcard/src/app/api/og/magazine/route.tsx) | `GET /api/og/magazine` |
| ~~cron/owner-reports/route.ts~~ | **삭제됨(폐기)** `GET /api/cron/owner-reports` |
| ~~broker/reports/owner/route.ts~~ | **삭제됨(폐기)** `POST /api/broker/reports/owner` |

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
| [vercel.json](file:///c:/Users/User/cre-dealcard/vercel.json) | Cron 스케줄 (morning-briefing, weekly-magazine, pulse/generate, hold-expiry, retention-purge, circle-approval-timeout) — owner-reports 는 제거됨 |
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

---

## 11. D-02 동기화 (2026-10-06) — 신규·현행 파일

> 위 §1~10 의 줄 수·수량 통계는 2026-08 기준입니다. 현행 구조는 아래를 기준으로 합니다.

### 11.1 도메인 (`src/domain/magazine/`, 테스트 제외)

| 영역 | 파일 |
|:--|:--|
| 발송 | `send-gate.ts`(관문), `send-batch.ts`, `send-providers.ts`(Resend/Solapi), `distribute-magazine.ts`, `distribute-special-edition.ts` |
| 동의·해지 | `consent-service.ts`, `subscriber-consent-types.ts`, `unsub-token.ts`(HMAC 해지 토큰), `sid-token.ts`, `templates/opt-in-confirm.ts` |
| 생성·검수 | `weekly-generator.ts`, `special-edition-generator.ts`, `tax-clinic-generator.ts`, `quality-gate.ts`, `edition-content.schema.ts`, `tax-rules-2026.ts`(**UNREVIEWED**) |
| 분석 | `analytics-aggregate.ts`, `buyer-temperature.ts`, `subscriber-profile.ts` |
| 템플릿 | `email-template.tsx`, `templates/{format,kakao-text,kakao-template-codes,types,url-guard}.ts`, `templates/{flash,weekly}-issue.kakao.md`(알림톡 문안 원본, 심사 이력 기록) |
| IM 연계 | `im-to-magazine-bridge.ts`, `magazine-teaser-cards.ts` |

### 11.2 공용 라이브러리 (`src/lib/magazine/`)

`authz.ts`(요청 인증·소유권), `public-guard.ts`(공개 API 가드·레이트리밋), `resolve-broker.ts`, `slug.ts`, `send-flags.ts`(발송 플래그), `kst.ts`, `escape.ts`, `pii.ts`(전화 정규화·IP 해시), `visitor-id.ts` / `visitor-hash.ts`(방문자 ID), `analytics-event.ts`, `edition-draft.ts` / `edition-save.ts` / `editor-helpers.ts`, `get-published-issue.ts`, `public-page-data.ts`, `llm-guard.ts`, `og-*.ts(x)`, `share-urls.ts`, `kakao-share.ts`, `period-label.ts`, `poll-helpers.ts`, `subscriber-view.ts`, `subscriber-temperature.ts`, `tags.ts`, `user-message.ts` 등.

### 11.3 운영·검증 자산

| 경로 | 용도 |
|:--|:--|
| `supabase/migrations/20261004000001~16_*.sql` + `supabase/migrations/_rollback/` | 신규 마이그레이션(수동 적용) / 롤백. 적용 순서는 `supabase/MIGRATIONS.md` |
| `scripts/cleanup/` (00~21 + README) | C-03 데이터 정리 SQL(기본 dry-run, 사전 백업 포함). **운영 실행은 항목별 사용자 승인 후** |
| `scripts/magazine-health.sql` | 읽기 전용 운영 헬스 점검(O-01) |
| `scripts/magazine-poison-scan.mjs` + `magazine-poison-baseline.json` | 오염 토큰 스캔(CI 게이트) |
| `scripts/check-schema-drift.ts`, `scripts/check-dead-buttons.mjs` | 스키마 드리프트 / 죽은 버튼 검사(CI) |
| `.github/workflows/magazine-gates.yml` | 매거진 릴리즈 게이트(tsc·vitest·poison·drift·policy·env 동기화 등) |
| `src/tests/unit/magazine/` | 매거진 단위 테스트(54개 파일) |
| `docs/magazine/audit-2026-10-04/` | 감사·개선 계획·활성화 체크리스트 |

### 11.4 폐기·삭제

`owner-report-generator.ts`, `rail/dispatcher.ts`, `rail/seller-report-generator.ts`, `/api/cron/owner-reports`, `/api/broker/reports/owner`(코드 삭제 확인). `owner_reports` 테이블은 미사용.
