<!-- BEGIN:cre-prod-web-rules -->
# CRE Production Web & 5-Layer MECE Rules (2026-09-06 교훈)

### 17. 포스처별 필수 Claim 분기 원칙 (Posture-Aware Claim Validation)
- `runApprovalGate()`의 `REQUIRED_SUBJECTS`는 모든 포스처에 일률적으로 적용하지 않습니다.
- `gross_yield`(임대수익률)는 수익형(`income`, `trading`, `operating`)에서만 필수입니다.
- 사옥형(`owner_occupied`) 및 개발형(`development`)은 자가사용 또는 신축 부지이므로 `gross_yield`를 필수로 단언하지 않으며, 가격/면적 중심 필수 지표를 검증합니다.

### 18. 클라이언트-서버 타임아웃 패리티 및 폴링 상한 (Client-Server Timeout Parity)
- 프론트엔드의 비동기 폴링, `setTimeout`, 백엔드 세그먼트 `maxDuration`, 도메인 하드 타임아웃(`thresholds.ts` `IM_HARD_TIMEOUT_MS: 180s`)은 전구간 일치해야 합니다.
- 클라이언트의 모든 폴링 루프(바텀시트, 관리 패널 등)는 무한 요청 누수를 방지하기 위해 반드시 `MAX_POLL_MS = 300_000`(5분) 상한 가드를 둡니다.

### 19. 시스템 자동 생성 에셋 vs 사용자 업로드 사진 분리 (Generated vs Uploaded Separation)
- 지적도(V-World WMS)와 위치 지도(Kakao Static Map)는 좌표/PNU 기반 시스템 API 자동 생성 에셋입니다.
- `photos_v2` 배열에는 중개인이 직접 촬영/업로드하는 실 매물 사진(외관, 입구, 로비, 내부, 주차장, 옥상 등 G1~G4)만 포함하며, 지도류를 사진 에셋에 강제 업로드하지 않습니다.
- PPTX 갤러리 플래너(`gallery-planner.ts`)는 `category !== 'map'`으로 지도 사진의 갤러리 슬라이드 침투를 원천 차단합니다.

### 20. 승인 프로토콜 해시 무결성 (Strict Hash-Bound Approval)
- 승인 요청(`approve/route.ts`)은 위변조 방지를 위해 `expectedHash: "sha256:..."`를 필수로 검증합니다.
- 클라이언트 UI(`im-approval-client.tsx`)는 섹션 저장/수정 응답으로 반환된 최신 `targetHash`를 반드시 취득하여 승인 요청 바디에 실어 보내야 합니다.

### 21. LLM 재시도 루프 타이머 잠식 방어 (Timer-Budgeted Retry)
- LLM 순차 호출 또는 지수 백오프 재시도 루프(`MAX_RETRIES`)는 루프 진입 전 반드시 `stageTimer.shouldAbortOptional()` 잔여 시간 예산을 점검합니다.
- 단일 섹션 실패로 인한 재시도가 전체 180초 예산을 고갈시켜 후속 필수 섹션이 절삭되는 2차 피해를 방지합니다.

### 22. Writer 산출물 Claim 체인 영속화 (Full-Chain Claim Persistence)
- `writer.ts`의 `FinancialCalculator`가 계산한 `claimRegistry.getAll()`은 반드시 `generateMobileIM` 리턴 객체와 DB(`document_objects.body.claims`)에 영속 저장되어 승인 게이트로 직결되어야 합니다.
- 레거시 요약값(`ssot_summary`)에만 의존한 수화(rehydration)를 지양하고 확정된 Claim 원장을 유지합니다.

### 23. Playwright E2E 서버 컴포넌트 제약 (Server Component Boundary)
- Next.js Server Component는 서버에서 Supabase를 직접 호출하므로, `page.route()`로 모킹이 **불가능**합니다.
- Playwright 테스트 대상은 **클라이언트 렌더링 페이지**로 한정합니다:
  * ✅ `/broker/deal-card/new` (클라이언트 컴포넌트)
  * ✅ `/im-lite/[id]` (Zero-DB fixture `fe5cbadd-...` 사용)
  * ❌ `/broker/deal-card/[id]` (서버 컴포넌트 — `createServiceClient()` 호출)
  * ❌ `/broker/im-approval/[id]` (서버 컴포넌트)
- 서버 컴포넌트 페이지를 테스트해야 할 경우, API 레벨 또는 도메인 함수 직접 호출(vitest)을 사용합니다.

### 24. Goldilocks 16면 절삭 인식 테스트 작성 (Goldilocks-Aware Assertions)
- `deck-sequencer.ts`의 goldilocks 알고리즘은 본문 슬라이드를 `PAGE_HARD_LIMIT=16`으로 절삭합니다.
- 테스트에서 **특정 optional 슬라이드(DCF, sensitivity, loan, rentRoll 등)가 최종 시퀀스에 존재한다고 단언하지 않습니다**.
- Grade A vs B 비교 시 `toBeGreaterThan` 대신 `toBeGreaterThanOrEqual`을 사용합니다 (둘 다 16면으로 잘릴 수 있음).
- Protected 슬라이드(cover, summary, closing, risk, checklist, process, thesis, **location**)만 존재 단언이 안전합니다.
- **지도(location) 슬라이드는 모든 포스처에서 필수**입니다. 카카오 지도 + 랜드마크 + 고해상도 렌더링은 CRE IM의 핵심 자산이므로 goldilocks 절삭 대상에서 절대 제외합니다.

### 25. PPTX 렌더링 테스트 타임아웃 (PPTX Render Timeout)
- PPTX 렌더링 테스트는 CPU 집약적이며 전체 스위트 실행 시 리소스 경합으로 지연됩니다.
- 단일 PPTX 렌더: `30_000ms`, 5개 포스처 동시 렌더: `60_000ms` 이상 명시적 타임아웃을 설정합니다.
- vitest의 기본 타임아웃(5s)에 의존하지 않습니다.
<!-- END:cre-prod-web-rules -->