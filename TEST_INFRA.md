# E2E Test Infra: CRE DealCard Zero-Friction Broker UX & IM Versioning v3

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Tests are derived strictly from `ORIGINAL_REQUEST.md` (§ 2026-10-27T04:28:40Z) and `docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md`, testing through public APIs, domain interfaces, and UI flows without reliance on internal transient states.
- **Hermetic & Reversible**: Zero network requests or remote database mutation during test runs. Database migrations are verified locally via `@electric-sql/pglite` with rollback verification.
- **Strict Integrity Forensics**: Zero mock data bypasses, zero hardcoded test pass values, zero client-controlled security overrides.
- **Methodology**: 4-Tier Test Pyramid (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, and Real-World Broker Workload Testing).

## Feature Inventory & Test Coverage Mapping
| # | Feature Area | Tier 1 (Unit/Feature) | Tier 2 (Boundary/Edge) | Tier 3 (Pairwise/Combo) | Tier 4 (E2E Scenario) |
|---|--------------|:---------------------:|:----------------------:|:-----------------------:|:---------------------:|
| 1 | P0 OG dummy cleanup & og:title priority | `p0-og-no-dummy.test.ts` | Edge text length, empty subtitle | Combined with Kakao preview | OG image crawl scenario |
| 2 | Pure `readBuilding` vs `readWithMigration` | `readbuilding-no-write.test.ts` | Non-existent ID, null fields | Read during concurrent write | Anonymous buyer /dc link view |
| 3 | Server Feature Flags (`src/lib/flags.ts`) | `flags-no-client-override.test.ts` | Unknown flag, bad cookie | Cookie cohort + env fallback | Flag-gated workspace rollout |
| 4 | Jobs v2 Idempotency & Lifecycle | `jobs-v2-idempotency.test.ts` | Duplicate key, expired lock | Claim race + cancel + retry | Async quick-generate with poll |
| 5 | PGlite Migrations & Rollback Dry-Run | `pglite-migrations-dryrun.test.ts` | Replay migration twice, rollback | Schema drift assertion | Full migration cycle |
| 6 | Price Band SSOT & Blind Guard | `price-band-ssot.test.ts`, `blind-guard.test.ts` | Negative price, 0, >1000억 | Dong→gu fallback + blind points | Deal Card pre-send validation |
| 7 | 4-Item Deal Card & Kakao OG v2 | `card4-roundtrip.test.ts`, `og-kakao-v2.test.ts` | 3 items, long text, special chars | Card4 version bump + OG cache ?v | Broker send-to-self & buyer click |
| 8 | WorkspaceShell & Broker 4-Door Hub | `workspace-shell.test.tsx`, `home-v2.test.tsx` | Viewport <640px, rail collapse | Badge count sync + tab switch | Broker daily morning routine |
| 9 | IM Versioning Lifecycle & Immutability | `im-version-lifecycle.test.ts`, `approval-hash-immutability.test.ts` | Sealed edit rejection, concurrent v2 | Fork v2 + approve + diff v1 | Broker amends deal terms after seal |
| 10 | Shared `BasicImDocument` & Parity | `basic-im-document-parity.test.ts`, `facts-isolation.test.ts` | Zero-rent unit, mixed postures | 5 postures PPTX ↔ Mobile IM | Full Basic IM 10-section generation |
| 11 | IM Simple Mode & R1 Rent Roll Grid | `rent-roll-tsv-paste.test.ts`, `quick-generate-idempotency.test.ts` | Malformed TSV, unit mismatch | TSV paste + building facts auto-sync | 3-minute quick IM creation |
| 12 | Mobile IM 10-Section Parity Viewer | `mobile-im-10section-parity.test.tsx` | Missing optional sections, print view | Continuous scroll + version diff | Client reviews mobile IM on phone |
| 13 | Inbox & Magazine Workspaces | `inbox-magazine-workspace.test.tsx` | Empty inbox, revoked share link | Open timeline + warm callout | Client views link → broker calls |

## Test Architecture
- **Test Runner**: Vitest (`npx vitest run`) with JSDOM environment for UI components and Node environment for domain/backend tests.
- **Database Isolation**: In-memory PostgreSQL instance powered by `@electric-sql/pglite`.
- **Static Guards**: AST-based static analysis tests ensuring `readWithMigration` is absent in authz/GET/OG routes and `sharp`/`pptxgenjs`/`fs` are absent in `facts/*`.
- **Directory Layout**:
  - `src/tests/foundations/`: P0 defects, `readBuilding`, flags, Jobs v2, PGlite dry-runs.
  - `src/tests/deal-card/`: Price band SSOT, blind guards, Card4Schema, Kakao OG v2.
  - `src/tests/workspace/`: Design tokens, WorkspaceShell, 4-Door Hub.
  - `src/tests/im-versioning/`: IM version lifecycle, approval hash immutability, resolver, facts isolation.
  - `src/tests/im-simple/`: R1 rent roll TSV paste, quick-generate idempotency.
  - `src/tests/mobile-im/`: 10-section parity assertion across 5 postures, continuous scroll.
  - `src/tests/e2e/`: Tier 4 end-to-end broker workflow scenarios.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Target Workflow |
|---|----------|--------------------|-----------------|
| S1 | Broker creates 4-item Deal Card and shares via Kakao | Feature 6, 7, 8 | Broker inputs building → auto-fills 4 items → verifies blind guard → checks bubble preview → sends to Kakao with deterministic OG |
| S2 | Quick IM creation with R1 Rent Roll TSV paste | Feature 4, 10, 11 | Broker pastes Excel rent roll → auto-corrects units → triggers quick-generate → receives v1 IM and Deal Card |
| S3 | IM Versioning: Approval seal and version amendment | Feature 9, 10, 12 | Broker approves v1 IM (hash sealed) → buyer requests revised terms → system creates v2 copy → v1 remains intact with audit trail |
| S4 | Client views Mobile IM & Broker follows up in Inbox | Feature 12, 13 | Buyer opens Mobile IM link (continuous 10 sections) → inbox logs open event → hot-lead alert triggers warm follow-up template |
| S5 | Complete 5-Posture Basic IM Parity Assertion | Feature 10, 12 | Verify exact numerical and structural equality between PPTX renderer output and Mobile IM viewer across all 5 standard postures |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature area.
- Tier 2: Boundary value coverage for all inputs, numbers, dates, and currency conversions.
- Tier 3: Pairwise interaction coverage for cross-module dependencies.
- Tier 4: ≥5 full real-world scenarios.
- Strict release criteria: 100% test pass, 0 TypeScript errors (`tsc --noEmit`), 0 Next.js build errors (`npm run build`).
