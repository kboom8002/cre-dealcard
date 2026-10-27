# Project: CRE DealCard Zero-Friction Broker UX & IM Versioning v3

## Architecture
Next.js 16 (App Router) + TypeScript 5 + Supabase (PostgreSQL 15 / Auth / Storage) + PGlite local verification runner.
- **Data & Facts Layer**: Pure domain logic in `src/domain/building/im-core/facts/*` and `building_ssot_lite` isolated from heavy rendering runtimes (`sharp`, `pptxgenjs`, `fs`).
- **Read/Write Path Isolation**: Pure `readBuilding()` with `React.cache()` for all GET/OG/public routes vs. explicit `readWithMigration()` restricted to write-permitted broker mutation routes.
- **Server Flags & Security Guardrails**: `src/lib/flags.ts` with `ff_ws` cookie checking; zero client request-body flag overrides; P0-SEC ownership authorization (`assertBuildingOwner`, `assertDocOwner`).
- **Jobs v2 Pipeline**: Deterministic nested-key idempotency hashing, job claim RPC, heartbeat, sweeper, and cancel endpoint (`/api/broker/jobs/[id]/cancel`).
- **4-Item Deal Card & OG v2**: Single SSOT for price band and currency formatting; deterministic blind guards; SVG/PNG OG rendering at 1200×630 with local bundled font; mandatory pre-send confirmation sheet.
- **Workspace Architecture**: Semantic paper tokens (`--control-border: #64748B`, font scale 17/19/21, `reducedMotion="user"`); 4-Door Home Hub (`/broker`); 3-column `WorkspaceShell` (`/broker/w/dealcards`, `/broker/w/im`, `/broker/w/magazine`, `/broker/w/inbox`) with legacy 307 redirects.
- **IM Versioning & Three-Tier Hashes**:
  - `content_hash`: Canonical JSON of domain facts (excludes volatile timestamps); approval hash re-verification.
  - `doc_hash`: Canonical hash of `BasicImDocument` for PPTX/Mobile 10-section parity.
  - `file_sha256`: SHA-256 of generated PPTX binary in `im_renditions`.
  - Immutable version rows `v1, v2, ...` in `document_objects` linked to `im_series`; append-only `im_approvals` ledger; `resolveImVersion()` SSOT.
- **IM Simple Mode & Mobile IM Parity**: Single progressive-disclosure form with R1 Rent Roll TSV paste grid; `quick-generate` endpoint; continuous 10-section Mobile IM viewer.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | P0 Defect: Eliminate OG hardcoded/dummy values | Remove fake `3.6%`, `35%`, `1,800만원` and unconditional verification badge | M1 | WP-P0-01 |
| 2 | P0 Defect: Fix ogTitle schema drop & og:title priority | Fix Zod schema dropping `ogTitle`; enforce `og:title` priority over defaults | M1 | WP-P0-02 |
| 3 | P0 Defect: Broker Home duplicate widget cleanup | Remove duplicate `overviewContent` in `broker/page.tsx` | M1 | WP-P0-03 |
| 4 | P0 Defect: Scope activity_events queries | Filter activity queries by broker/actor ID to prevent leaking cross-broker activity | M1 | WP-P0-04 |
| 5 | P0 Defect: Await clipboard copy & mobile toast | Ensure clipboard promise is awaited before Kakao share; remove desktop Ctrl+V message | M1 | WP-P0-05 |
| 6 | P0 Defect: Fix IM view tracking schema mismatch | Correct columns in `api/public/im-lite/[buildingId]/view/route.ts` to standard schema | M1 | WP-P0-06 |
| 7 | P0.5 Foundation: Pure readBuilding() with React.cache() | Implement pure read path with zero DB writes on GET/OG/public routes | M1 | WP-P05-01 |
| 8 | P0.5 Foundation: Server Feature Flags (src/lib/flags.ts) | Centralized flags with `ff_ws` cookie checking; reject client request body overrides | M1 | WP-P05-02 |
| 9 | P0.5 Foundation: Jobs v2 with nested idempotency hash | Deterministic nested-key sorting hash; claim RPC, heartbeat, sweeper, cancel route | M1 | WP-P05-03 |
| 10 | P0.5 Foundation: PGlite dry-run & reversible migrations | Local migration testing with `@electric-sql/pglite` and rollback scripts | M1 | WP-P05-04 |
| 11 | P0.5 Foundation: Workspace autosave hook | `useWorkspaceAutosave` with 3s debounce, optimistic version check, and offline queue | M1 | WP-P05-05 |
| 12 | P0.5 Foundation: building_ssot_lite PNU generated column | Stored generated column `pnu` and unique constraint on `(owner_id, pnu)` | M1 | WP-P05-06 |
| 13 | P0.5 Foundation: Global Job Tray | Real server job stages, progress tracking, cancel button, and notifications | M1 | WP-P05-07 |
| 14 | P0.5 Foundation: Contrast & Reduced Motion tokens | `--control-border: #64748B` (4.8:1) and `MotionConfig reducedMotion="user"` in layouts | M1 | WP-P05-08 |
| 15 | Price Band & Currency SSOT | `formatPriceRange`, `parseLegacyBand`, `formatKrw` under unified SSOT | M2 | WP-P1-01 |
| 16 | Blind-Guard & k-anonymity validation | Deterministic blind point validation with auto dong→gu fallback notice | M2 | WP-P1-02 |
| 17 | Card4Schema & atomic update RPC | 4 items (`region`, `use`, `priceBand`, `points`) with `card4_version` optimistic locking | M2 | WP-P1-03 |
| 18 | Fast-fill extraction endpoint | Auto-generate initial 4 items from building facts with provenance tags | M2 | WP-P1-04 |
| 19 | 4-item confirmation card UI | High-legibility senior card displaying only 4 items with inline edit controls | M2 | WP-P1-05 |
| 20 | KakaoTalk OG v2 image rendering | Local bundled font, 1200×630, large high-contrast typography (`용도 · 권역 · 금액구간`) | M2 | WP-P1-06 |
| 21 | OG v2 cache versioning (?v=card4_hash) | `302 / s-maxage=31536000` immutable caching with deterministic card4_hash | M2 | WP-P1-07 |
| 22 | HTML KakaoTalk bubble preview | 1:1 and mobile 255px bubble simulation preview | M2 | WP-P1-08 |
| 23 | Pre-Send Confirmation Sheet | Mandatory pre-send checklist (`저장 → 해시 → 블라인드 → 발송`) | M2 | WP-P1-09 |
| 24 | Send-to-self & Kakao direct share | `나에게 먼저 보내기`, `고객에게 보내기`, `링크 복사` with real-time feedback | M2 | WP-P1-10 |
| 25 | Deal Card legacy route redirects | 307 redirects from `/broker/deal-card/*` to `/broker/w/dealcards/*` | M2 | WP-P1-11 |
| 26 | Semantic paper design tokens | High contrast tokens, min 14px caption, 17/19/21 font scale, ≥48px touch targets | M3 | WP-P2-01 |
| 27 | 3-Column WorkspaceShell | Column 1 (List), Column 2 (Editor), Column 3 (Preview) with responsive collapse | M3 | WP-P2-02 |
| 28 | Mobile push navigation & bottom tabs | Mobile push views and 5-tab bottom bar below 1024px | M3 | WP-P2-03 |
| 29 | Broker Home 4-Door Hub | 4 task doors (`딜카드`, `IM`, `뉴스레터`, `소통함`), no GNB, live status badges | M3 | WP-P2-04 |
| 30 | Broker Home 1-line resume bar | "이어서 하기" recent work quick-resume bar | M3 | WP-P2-05 |
| 31 | Workspace navigation & state sync | Shared query param state sync (`?buildingId=`, `?tab=`) across columns | M3 | WP-P2-06 |
| 32 | Unified Undo/Confirm Toast system | Senior-friendly toast with undo action and high-contrast styling | M3 | WP-P2-07 |
| 33 | Broker Home data query optimization | Single aggregated RPC replacing 9 parallel queries | M3 | WP-P2-08 |
| 34 | 2-Tier IM Versioning DB schema | `im_series`, `document_objects` versioning columns (`version_no`, `content_hash`) | M4 | WP-P4a1-01 |
| 35 | Append-only im_approvals ledger | Approval records that never mutate `document_objects.body` in-place | M4 | WP-P4a1-02 |
| 36 | Sealed version immutability | Prevent editing approved/sealed versions; enforce "새 버전으로 복사해서 고치기" | M4 | WP-P4a1-03 |
| 37 | Three-tier hash computation | Separate `content_hash` (approval), `doc_hash` (parity), `file_sha256` (binary) | M4 | WP-P4a1-04 |
| 38 | im_renditions & file_sha256 pinning | Store generated PPTX renditions with SHA-256 hash in `im_renditions` table | M4 | WP-P4a1-05 |
| 39 | im_share_links (pinned vs follow-latest) | Share links with mode switch (pin to specific version or track latest approved) | M4 | WP-P4a1-06 |
| 40 | resolveImVersion() SSOT resolver | Unify all ~10 divergent latest-IM queries under a single canonical function | M4 | WP-P4a1-07 |
| 41 | Split write-back policy | Building physical facts auto-sync to SSOT; deal terms require explicit opt-in | M4 | WP-P4a1-08 |
| 42 | Backward-compatible DB fallback | Graceful fallback when new versioning tables are not yet migrated in remote DB | M4 | WP-P4a1-09 |
| 43 | Pure domain facts extraction | Extract `src/domain/building/im-core/facts/*` free of `sharp`/`pptxgenjs`/`fs` | M4 | WP-P4a2-01 |
| 44 | buildBasicImDocument() SSOT builder | Canonical document model generator shared by PPTX renderer and Mobile IM viewer | M4 | WP-P4a2-02 |
| 45 | PPTX Basic IM renderer refactoring | Adapt PPTX generation to consume `BasicImDocument` | M4 | WP-P4a2-03 |
| 46 | Mobile IM data adapter refactoring | Adapt Mobile IM fetcher to consume `BasicImDocument` | M4 | WP-P4a2-04 |
| 47 | Numeric parity assertion suite | Zero-divergence verification of numbers between PPTX and Mobile IM across 5 postures | M4 | WP-P4a2-05 |
| 48 | IM Simple Mode Workspace (/broker/w/im) | Single progressive-disclosure form (`주소 + 매도가 + 렌트롤` top, details below) | M5 | WP-P3-01 |
| 49 | Interactive R1 Rent Roll grid | Excel-like grid with floor prefill from building register | M5 | WP-P3-02 |
| 50 | Rent Roll direct TSV clipboard paste | Multi-cell clipboard paste parsing, unit mistake warning, Korean currency readout | M5 | WP-P3-03 |
| 51 | Quick-generate API endpoint | `POST /api/broker/im-lite/quick-generate` creating building + v1 IM + Deal Card | M5 | WP-P3-04 |
| 52 | Mobile rent roll floor cards | Mobile-friendly collapsible floor card editor for rent roll entry | M5 | WP-P3-05 |
| 53 | Flexible lease expiry date parser | Support various Korean date formats (`2027.05`, `27년 5월`, `만기 2년`) | M5 | WP-P3-06 |
| 54 | Rent roll vision OCR (optional fallback) | OCR photo parser fallback with graceful error handling | M5 | WP-P3-07 |
| 55 | Mobile IM continuous 10-section scroll | Replace accordion with continuous scroll and sticky section navigation chips | M5 | WP-P4b-01 |
| 56 | 100% 10-section Basic IM content parity | Full 10 sections rendered in Mobile IM with identical data points to PPTX | M5 | WP-P4b-02 |
| 57 | Mobile IM version switcher & diff UI | Version picker (`v1 ↔ v2`) and visual field difference highlights | M5 | WP-P4b-03 |
| 58 | Mobile IM print & PDF stylesheet | Clean print/export stylesheet matching commercial IM presentation | M5 | WP-P4b-04 |
| 59 | Legacy IM lite route redirects | 307 redirects from `/broker/buildings/[id]/im-lite` to `/broker/w/im` | M5 | WP-P4b-05 |
| 60 | Workspace: Broker Inbox (/broker/w/inbox) | Cursor pagination, owner read state, hot-lead open timeline (`🔥 지금 전화`) | M5 | WP-P5-01 |
| 61 | Inbox share queue & link revoke | Per-recipient share queue, copy link, and instant link revoke/correction banner | M5 | WP-P5-02 |
| 62 | Workspace: Weekly Magazine (/broker/w/magazine) | 3-column magazine workspace with past-issue drawer and 1-click deal insertion | M5 | WP-P5-03 |
| 63 | Comprehensive E2E Verification & Release | Pass 100% E2E suites, PGlite dry run, `tsc`, `npm run build`, git commit & push | M6 | WP-P6-01 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | P0 Defect Cleanup & P0.5 Platform Foundations | WP-P0-01 ~ WP-P0-06, WP-P05-01 ~ WP-P05-08 | none | DONE |
| M2 | 4-Item Deal Card, KakaoTalk OG v2 & Pre-Send Sheet | WP-P1-01 ~ WP-P1-11 | M1 | DONE |
| M3 | Broker Home 4-Door Hub & 3-Column WorkspaceShell | WP-P2-01 ~ WP-P2-08 | M1 | DONE |
| M4 | IM Version Management & Shared Basic IM Document SSOT | WP-P4a1-01 ~ WP-P4a1-09, WP-P4a2-01 ~ WP-P4a2-05 | M1 | DONE |
| M5 | IM Simple Mode, Mobile 10-Section Parity & Workspaces | WP-P3-01 ~ WP-P3-07, WP-P4b-01 ~ WP-P4b-05, WP-P5-01 ~ WP-P5-06 | M2, M3, M4 | DONE |
| M6 | Final Verification, Adversarial Hardening & Release Gate | WP-P6-01, 100% E2E tests, build gate, git commit & push | M5, TEST_READY | DONE |

## Interface Contracts
### M1 ↔ Downstream (Read Path & Flags)
- `readBuilding(id: string): Promise<BuildingData | null>`: Pure read from `building_ssot_lite` without DB mutations, wrapped in `React.cache()`.
- `getServerFeatureFlag(flag: FeatureFlagKey, requestHeaders?: Headers): Promise<boolean>`: Resolves flags server-side using `ff_ws` cookie; ignores request body overrides.
- `JobsV2`: `createJob({ type, idempotencyKey, payload, ownerId })`, `claimJob(workerId)`, `heartbeatJob(jobId, stage, percent)`, `cancelJob(jobId, ownerId)`.

### M2 ↔ M3/M5 (4-Item Deal Card)
- `Card4Schema`: `{ region: string, use: string, priceBand: string, points: [string, string, string], provenance: { points: ('public' | 'broker' | 'ai')[] }, version: number, hash: string }`.
- `formatPriceRange(price: number, bandType: 'standard' | 'coarse'): string` & `validateBlindPoints(points: string[]): BlindValidationResult`.

### M4 ↔ M5 (IM Version Management & Shared Basic IM Document SSOT)
- `resolveImVersion(buildingId: string, options?: { version?: number, shareToken?: string, role?: string }): Promise<ResolvedImVersion>`.
- `buildBasicImDocument(facts: PureBuildingFacts, options?: ImBuildOptions): BasicImDocument`.
- Three-Tier Hash Matrix:
  - `computeContentHash(facts: PureBuildingFacts): string`
  - `computeDocHash(doc: BasicImDocument): string`
  - `computeFileSha256(buffer: Buffer): string`

## Code Layout
- `src/domain/building/im-core/facts/`: Pure domain facts calculators (zero `sharp`, `pptxgenjs`, `fs`).
- `src/lib/flags.ts`: Central server-side feature flags engine.
- `src/lib/jobs/`: Jobs v2 pipeline (idempotency, claim, heartbeat, sweeper).
- `src/lib/deal-card/`: Price band SSOT, blind guards, Card4Schema.
- `src/components/workspace/`: `WorkspaceShell.tsx`, `GlobalJobTray.tsx`, unified toasts.
- `src/app/(broker)/broker/w/`: 4 core workspaces (`dealcards`, `im`, `magazine`, `inbox`).
- `supabase/migrations/`: Canonical SQL migrations + `_rollback/*.sql`.
- `src/tests/`: Hermetic Vitest test suites (PGlite dry runs, security guards, parity tests).
