# CRE DealCard 뉴스레터(모바일 매거진) 정밀 감사 및 4-Wave SOTA 고도화 완료 보고서

**작성일**: 2026-10-29
**대상 도메인**: 모바일 매거진(뉴스레터) 생성·편집·배포·독자 열람·수지분석·DB/RLS 전 계층 (`src/domain/magazine/*`, `src/app/(broker)/broker/magazine-editor/*`, `src/app/(magazine)/magazine/[brokerId]/[date]/*`, `src/app/api/**/magazine/**`, `supabase/migrations/*`)

---

## 1. 감사 요약 및 4-Wave 아키텍처 개선 개요

본 감사는 개편된 브로커 통합 워크스페이스(`/broker/w/*`) 및 Basic IM 편집 스튜디오(`document_objects`, `_studioSlideOverrides`, `im_custom_data`)와의 **SSOT 정합성**, **60대 공인중개사 무마찰 UX**, **모바일 독자(건물주·투자자) 열람 가독성 및 수지분석 재무 정합성**, **DB/RLS/API 보안 무결성**의 4대 축(MECE)으로 수행되었습니다.

| Wave | 핵심 목표 | 주요 해결 과제 | 검증 결과 |
|:---|:---|:---|:---|
| **Wave 1 (R1)** | **Basic IM & Studio ↔ 매거진 SSOT 데이터 브릿지 및 재무 공식 통일** | `deal-adapter.ts` 신설(스튜디오 6대 오버라이드/YieldSet/대표사진/가격밴드 파싱), 호외(`special`) 실데이터 주입, 독자 ROI 계산기(`roi-calc.ts`) 실투자금 분모에서 보증금 차감(`연임대료 ÷ (매매가 − 보증금)`) | `deal-adapter.test.ts` (16건) + `wave1-magazine-adversarial-stress.test.ts` (34건) 100% 통과 |
| **Wave 2 (R2)** | **통합 워크스페이스 라우트 단일화 & Warm Paper Light 무마찰 에디터** | `/broker/w/magazine` 가짜 프로토타입 제거 및 `/broker/magazine-editor` 통합, `#FAF9F5` Warm Paper 고대비 테마 통일, 간편모드 8탭 숨김, 초안 미리보기 `?preview=1&edition=<id>`, AI 3줄 요약 전량 페이로드 전달, 카톡 단톡방 원클릭 복사 및 다건 연락처 일괄 붙여넣기 | `wave2-remediation.test.ts` + `wave2-adversarial-challenge.test.tsx` 100% 통과 |
| **Wave 3 (R3)** | **독자용 모바일 매거진 뷰어 (`360px~430px`) SOTA 리디자인** | 매물 카드 스펙 그리드(대지/연면적/층수/엘리베이터/보증금·임대료), `[📄 모바일 IM 열람]` 직결 및 `[🧮 이 매물 수지분석]` 프리필(`cre-prefill-roi`), ROI 결과 `1+2` 반응형 카드 및 한글 `만원` 파서(`parseKoreanManwonInput`), 14px~17px 가독성 상향, `TrackingNotice` 단일화, `SubscribeCard` 1단계 번호 확인 | `wave3-sota-viewer.test.tsx` + `wave3-adversarial-challenger.test.tsx` (31건) 100% 통과 |
| **Wave 4 (R4)** | **DB / Migration / RLS / API 무결성 하드닝** | `append_magazine_deal_snippet` RPC `service_role` 전용 격리(`20261029000001`), 레거시 중복 마이그레이션 `_archive` 이관, `PATCH /api/magazine/editions` 직접 발행 차단(400), `?edition=<id>` 호외/초안 정확 조회, `/api/public/magazine/poll` 가드 및 해시 통일, KST 날짜 슬라이싱 및 190일 온도계 조회, `sendGate` `recipient_hash` 멱등성 | `wave4-lockdown.test.ts` (11건) 및 전체 88개 매거진 테스트 파일 100% 통과 |

---

## 2. Wave별 주요 변경 파일 및 구현 상세

### 2.1 Wave 1 — Basic IM & Studio ↔ Magazine SSOT Data Bridge (`R1`)
- **신규 SSOT 어댑터 (`src/domain/magazine/deal-adapter.ts`)**:
  - `adaptBuildingToMagazineDeal()`: `buildings.meta` + 최신 `document_objects`(`kind='im'`)를 결합하여 매거진 `DealHighlight` 및 호외 `featuredDeal`을 생성합니다.
  - 우선순위 체인: `_studioSlideOverrides` (`coverSubtitle`, `brokerOpinion`, `locationAdvantages`, `yieldRate`, `askingPrice`) → `im_custom_data` (`customHeadline`, `editedNarratives`, `coverPhotoUrl`, `selectedPhotoIds`) → `YieldSet` (`yield.capRate`, `depositManwon`, `monthlyRentManwon`) → `buildings.meta` 폴백.
  - 대표 사진 자동 선택(`resolveCoverPhoto`): `isCover === true` → `isExterior === true` → `customPhotoUrls[0]` → 첫 번째 건물 사진 순으로 엄격 선별.
  - 호가/추정가 파싱(`parsePriceBandToWon`): `"45억 5,000만"`, `"120억"`, `"85억 ~ 92억"` 등 한국어 금액 표기를 정확한 원(`KRW`) 단위 숫자로 변환.
- **주간호 & 호외 생성기 연동 (`src/domain/magazine/weekly-generator.ts`, `src/domain/magazine/special-edition-generator.ts`)**:
  - 주간호/호외 생성 시 `document_objects`를 일괄 조회하여 IM 스튜디오 편집본이 즉시 매거진 매물 카드와 호외 스포트라이트에 반영되도록 통합.
- **독자용 수지분석기 공식 통일 (`src/components/magazine/roi-calc.ts`, `src/components/magazine/RoiCalculator.tsx`)**:
  - Basic IM `YieldSet` 및 한국 상업용 부동산 관행과 동일하게 `보증금(만원)` 입력란 추가 및 실투자금 분모에서 보증금 차감:
    $$\text{실투자금(자기자본)} = \text{매매가} - \text{대출금} - \text{보증금}$$
    $$\text{무대출 Cap Rate} = \frac{\text{연임대료}}{\text{매매가} - \text{보증금}} \times 100$$

### 2.2 Wave 2 — 브로커 통합 워크스페이스 & Warm Paper Light 무마찰 에디터 (`R2`)
- **워크스페이스 라우트 단일화 (`src/components/workspace/WorkspaceShell.tsx`, `src/components/workspace/WorkspaceBottomNav.tsx`, `src/app/(broker)/broker/w/magazine/page.tsx`)**:
  - 상단/하단 `'📰 뉴스레터'` 탭을 `/broker/magazine-editor`로 직결하고, `/broker/w/magazine` 접근 시 쿼리 파라미터(`?buildingId=...` 등)를 보존하여 `/broker/magazine-editor`로 즉시 리다이렉트.
- **Warm Paper Light 고대비 테마 및 UX 무마찰화 (`src/app/(broker)/broker/magazine-editor/page.tsx`, `SimpleEditor.tsx`, `SimpleDealPicker.tsx`, `AutoFilledStrip.tsx`)**:
  - 에디터 셸과 로딩/에러 화면을 `#FAF9F5` / `#FFFFFF` 배경 + `#0F172A` 고대비 텍스트로 통일.
  - `mode === "simple"`일 때 8개 고급 탭 바를 숨기고 상단 고정 모드 전환 세그먼트 제공.
  - 초안 미리보기 링크에 `?preview=1&edition=${editionId}`를 부여하여 미발행 초안도 404 없이 즉시 검수 가능.
  - `autoSummaryDoneRef` 조기 잠금 버그를 제거하고 `/api/broker/magazine/simple-summary` 호출 시 `dealHighlights` 및 `topNews` 전체 컨텍스트를 전달.
- **배포/구독자 관리 고도화 (`MagazineShareModal.tsx`, `outreach/AddSubscriberForm.tsx`)**:
  - 카카오톡 단톡방용 `[매거진 제목 + AI 3줄 요약 + 열람 링크]` 원클릭 복사 및 모바일 `sms:` 앱 실행 버튼 추가.
  - 엑셀/연락처 다건 텍스트(`홍길동 010-1234-5678`) 붙여넣기 자동 파싱 및 일괄 등록 지원.

### 2.3 Wave 3 — 독자용 모바일 매거진 뷰어 SOTA 리디자인 (`R3`)
- **매물 하이라이트 & 호외 스포트라이트 (`src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx`)**:
  - 호외(`edition_type === 'special'`) 전용 상단 `"🚨 긴급 호외 · 단독 매물 브리핑"` 배너 및 `featuredDeal` 카드 렌더링.
  - 매물별 핵심 스펙 배지(대지면적·연면적 `평/㎡`, 층수, 승강기, 보증금/월임대료, IM 편집 배지) 표시.
  - `deal.imUrl` 존재 시 `[📄 모바일 IM 열람]` 버튼 노출, `[🧮 이 매물 수지분석]` 클릭 시 `cre-prefill-roi` 커스텀 이벤트를 발행하여 하단 ROI 계산기에 매매가·보증금·임대료를 자동 프리필하고 부드럽게 스크롤 이동.
- **반응형 ROI 계산기 & 한글 금액 파서 (`src/components/magazine/RoiCalculator.tsx`)**:
  - `360px` 화면에서 숫자 잘림을 방지하는 `1(연간 순수익 풀폭) + 2(자기자본 수익률 · 무대출 Cap Rate)` 카드 레이아웃 적용.
  - `"1,200만"`, `"1억 2000만"` 등 한글 금액 입력을 즉시 파싱하는 `parseKoreanManwonInput` 적용.
- **독자 신뢰도 및 가독성 강화 (`DealInquirySheet.tsx`, `SubscribeCard.tsx`)**:
  - 매물 문의 시트 하단에 중개사 실명·사무소·연락처 카드 및 `[📞 전화 바로 걸기]`(`tel:`) 제공.
  - `TrackingNotice` 하단 중복 렌더링 제거, `SubscribeCard` 1단계 번호 확인 단계 도입으로 오타 등록 방지.

### 2.4 Wave 4 — DB / Migration / RLS / API 무결성 하드닝 (`R4`)
- **보안 마이그레이션 (`supabase/migrations/20261029000001_lockdown_magazine_rpc_and_cleanup.sql`)**:
  - `append_magazine_deal_snippet` RPC에 `SET search_path = public` 설정 및 `PUBLIC`/`anon`/`authenticated` 실행 권한 회수(`service_role` 전용).
  - 스키마 충돌을 유발하던 레거시 `20260828_magazine_*.sql` 2개 파일을 `supabase/migrations/_archive/`로 격리.
- **발행 상태머신 및 에디션 식별 (`src/app/api/magazine/editions/route.ts`, `src/lib/magazine/public-page-data.ts`, `src/domain/magazine/distribute-special-edition.ts`)**:
  - `PATCH /api/magazine/editions`를 통한 `status: "published"` 우회 변경을 차단(400 반환)하여 반드시 정식 발행 파이프라인을 거치도록 강제.
  - `?edition=<editionId>` 쿼리 파라미터를 지원하여 동일 일자 다중 에디션(주간호 + 호외) 및 초안 미리보기를 정확히 식별.
- **열람실 통계/투표/발송 게이트 정합성 (`src/app/api/public/magazine/poll/route.ts`, `src/app/api/broker/magazine/analytics/route.ts`, `src/domain/magazine/send-gate.ts`)**:
  - 공개 투표 API에 `withPublicGuard`(레이트리밋 + 봇 차단) 및 표준 `computeVisitorHash` 적용.
  - 열람실 일별 차트 KST(`UTC+9`) 날짜 기준 집계, 온도계 190일 조회 윈도우 확장, 영문 역할명(`"Investor"` → `"매수·투자자"`) 한국어화.
  - `sendGate` 멱등성 키를 `subscriber_id` 대신 `recipient_hash` 기준으로 통일하여 일괄 발송 시 멱등성 보장.
- **신규 고객 등록 연동 (`src/app/(broker)/broker/clients/new/page.tsx`)**:
  - 클라이언트 직접 `magazine_subscribers` INSERT(RLS 차단 및 `phone_hash` 누락 위험)를 제거하고 `/api/broker/magazine/subscribers` 서버 API 경유로 일원화.

---

## 3. 전체 검증 게이트 결과

1. **Magazine Unit / Workspace / Adversarial Test Suite**:
   - `src/tests/unit/magazine/*`, `src/tests/unit/magazine-distribution-tier.test.ts`, `src/tests/workspace/inbox-magazine-workspace.test.tsx`, `src/tests/adversarial/wave1-magazine-adversarial-stress.test.ts` 전량 통과 (`0` failures).
2. **Preflight Audit Gate**:
   - `npm run preflight`: **112 / 112 Assertions PASS**.
3. **TypeScript Compiler Gate**:
   - `npx tsc --noEmit`: **Exit Code 0 (에러 0건)**.
4. **Isolated Worktree Production Build Gate**:
   - `scripts/release/worktree-build.ps1`: **BUILD_EXIT=0**, `node_modules` 센티넬(`pino`, `sharp`, `jsdom`) 무결성 확인 완료.
