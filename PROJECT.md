# Project: im-core Domain Data to Mobile IM Pipeline Enhancement & Hardening

## Architecture
- **Domain Layer (`im-core`)**: Pure domain models (`ClaimRegistry`, `FinancialCalculator`, `DataAvailability`, `ReleaseTier`, `PermitZone`, `LeaseCalc`, `KoreanLegal`). Strictly 0 dependencies on View/Presentation (`mobile-im`, `components`, `app`) or external frameworks (`@supabase`, `next`, `react`).
- **Presentation/View Layer (`mobile-im`)**: Consumes `im-core` via public interfaces. Includes Orchestrated Writer (`writer.ts`), Section Generator (`im-section-generator.ts`), Template Fallback Engine (`premium-template-engine.ts`), Section Renderers (`title-rights-renderer.ts`, `land-detail-renderer.ts`, `comparables-renderer.ts`), and Web Mobile Viewer (`mobile-im-viewer.tsx`).
- **Terminology & Lexicon SSOT**: `credeal/ssot/im.d56-lexicon.yaml` (4,134 lines), `credeal/ssot/im.lexicon.yaml` (451 lines), `docs/D56_KOREAN_SMALL_COMMERCIAL_REAL_ESTATE_TERMINOLOGY_DICTIONARY.md`, and `.agents/rules/01-cre-lexicon.md`.
- **Verification Harness**:
  1. `src/tests/governance/architecture-boundaries.test.ts`: Native AST check asserting 0 reverse imports from `im-core` into presentation/view layers.
  2. `src/tests/domain/mobile-im-data-fidelity.test.ts`: 5-posture data fidelity test verifying 100% exact numeric match, rent roll completeness, 0 poison tokens, 0 persona leaks, and graceful missing data fallbacks.
  3. Preflight and domain test regression suite (`npm run preflight`, `npm run test:domain`).
  4. 4-Layer Release Gate: `preflight` -> `tsc --noEmit` -> `build`.
  5. Multi-agent review, challenger stress-testing, and Forensic Integrity Audit.

## Feature Inventory
| # | Feature / Remediation Item | Description | Milestone | Source |
|---|----------------------------|-------------|-----------|--------|
| 1 | Relocate Domain Types & Math from View to `im-core` | Move `ProvenanceKind`, `DataAvailability`, `Grade`, and pure financial calculation math (`calculateFinancials`) into `im-core` / `domain/ontology`. | M1 | Survey 2, 3 |
| 2 | Eliminate 7 Reverse Imports in `im-core` | Eradicate all `from '../mobile-im'` imports in `claim.ts`, `claim-registry.ts`, `display-label.ts`, `data-availability.ts`, `release-tier.ts`, `financial-calculator.ts`. | M1 | Survey 2, 3 |
| 3 | AST Architecture Boundary Verification Test | Implement `src/tests/governance/architecture-boundaries.test.ts` using TypeScript Compiler API to assert 0 reverse imports into `im-core`. | M1 | Survey 3 |
| 4 | Automated 5-Posture Data Fidelity Assertion Suite | Implement `src/tests/domain/mobile-im-data-fidelity.test.ts` verifying numeric parity, rent roll completeness, and negative invariants across 5 postures. | M2 | Survey 3 |
| 5 | Publish E2E Test Suite Contract | Create `TEST_INFRA.md` and publish `TEST_READY.md` for continuous verification across implementation milestones. | M2 | Dual Track |
| 6 | Wire Orphan Renderers into Section Generator | Wire `renderTitleRights` and `renderLandDetail` into `im-section-generator.ts`. | M3 | Survey 1 |
| 7 | Complete Missing Switch Cases in Template Engine | Add explicit cases for `title_rights`, `decision_snapshot`, `market_rent_gap`, `value_add_plan`, etc. in `premium-template-engine.ts`, eliminating `next_steps` fallthrough. | M3 | Survey 1 |
| 8 | Fix Financial Calculation Trigger & SSOT Bridge | Calculate financials when `floor_leases` present even if `monthly_rent_total_krw` missing; preserve KRW precision and map 8 missing domain layers in `ssot-to-im-bridge.ts`. | M3 | Survey 1 |
| 9 | Eradicate Fake Mock Numbers & Evasive Phrasing | Purge fake numbers (`120억`, `3800만`, `400만`, `26.7년`) in `premium-template-engine.ts`; replace `확인 필요` with `ClaimStatus='not_available'` and `formatNotAvailableReason()`. | M3 | Survey 1, 2 |
| 10 | View Synchronization & Default Open Section Fix | Fix section ID mismatch (`"01_overview"` vs `"property_overview"`) in `mobile-im-viewer.tsx` and align lock defense with domain release tier. | M3 | Survey 1 |
| 11 | Purge Slang & B2C Reversion from Prompts | Delete `B2C_LEXICON` ("내 돈", "세입자", "땅값 비중(원금 안전판)") and rewrite `GOLDEN_IM_EXAMPLES_BY_POSTURE` in `narrative-prompt.ts` to D56 standards. | M4 | Survey 2 |
| 12 | Elevate Investor Copywriting & Template Titles | Update section titles to D56 standard Korean terms; purge Rule 1 persona leaks ("자녀 세대 가업승계용") and banned hype terms ("우량", "극대화", "안전 마진") in `investor-copywriting.ts`. | M4 | Survey 2 |
| 13 | Connect Lexicon Normalizer to D56 SSOT | Harmonize `terminology-normalizer.ts` with `im.lexicon.yaml` and `im.d56-lexicon.yaml`, eliminating contradictory re-insertions of banned terms. | M4 | Survey 2 |
| 14 | 4-Layer Release Gate & Full Regression Pass | Verify 100% pass across `npm run preflight`, `npx vitest run src/tests/governance/architecture-boundaries.test.ts`, `npx vitest run src/tests/domain/mobile-im-data-fidelity.test.ts`, `npm run test:domain`, `npx tsc --noEmit`, `npm run build`. | M5 | Prompt |
| 15 | Adversarial Review, Stress Challenge & Forensic Audit | Reviewers, Challengers, and Forensic Integrity Auditor verify zero regressions, zero cheats, zero reverse dependencies, zero data loss. | M5 | Pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Clean Architecture Boundaries (Rule 12) & Domain Decoupling | Features 1, 2, 3: Relocate `ProvenanceKind`, `DataAvailability`, `Grade`, and pure financial calculation math into `im-core` / `ontology`. Eliminate all direct and transitive reverse imports. Implement AST architecture boundary test (`architecture-boundaries.test.ts`). | none | DONE |
| M2 | E2E Testing Track: Architecture & Data Fidelity Test Suite | Features 4, 5: Implement `src/tests/domain/mobile-im-data-fidelity.test.ts` across 5 postures and 5 verification dimensions. Publish `TEST_INFRA.md` and `TEST_READY.md`. | M1 | DONE |
| M3 | Data Mapping & Domain Missing Data Defense Pipeline (R1 & R3) | Features 6, 7, 8, 9, 10: Wire orphan renderers (`title_rights`, `land_detail`), add missing switch cases in template engine, fix financial calculation triggers and SSOT bridge, eradicate fake mock numbers (`120억`, `3800만`) and evasive phrasing (`확인 필요`), fix viewer initial open section. | M1 | DONE |
| M4 | D56 Terminology & High-Quality Text Copywriting (R2) | Features 11, 12, 13: Purge `B2C_LEXICON` from `narrative-prompt.ts`, rewrite `GOLDEN_IM_EXAMPLES_BY_POSTURE`, purge Rule 1 persona leaks and banned hype terms in `investor-copywriting.ts`, update section titles to D56 standards, align normalizer with YAML SSOT. | M3 | DONE |
| M5 | Full Release Gate, Adversarial Verification & Forensic Audit | Features 14, 15: Run 4-layer release gate (`preflight` -> `tsc --noEmit` -> `build`), run domain and E2E regression, execute adversarial review, challenger stress-testing, and Forensic Integrity Audit. | M2, M3, M4 | DONE |

## Interface Contracts

### 1. Domain Types Contract (`src/domain/ontology/provenance.ts` or `src/domain/building/im-core/claim.ts`)
```typescript
export type ProvenanceKind =
  | 'registry'
  | 'public_api'
  | 'public_api_identified'
  | 'broker_aug'
  | 'expert'
  | 'ledger'
  | 'seller'
  | 'broker'
  | 'derived'
  | 'assumed';
```

### 2. Data Availability & Grade Contract (`src/domain/building/im-core/data-availability.ts`)
```typescript
export type Grade = 'A' | 'B' | 'C';

export interface DataAvailability {
  hasCadastralMap: boolean;
  hasBuildingLedger: boolean;
  hasLandLedger: boolean;
  hasLandUsePlan: boolean;
  hasRentRoll: boolean;
  hasActualLeaseContract: boolean;
  hasRentReceiptProof: boolean;
  hasDisclosedPrice: boolean;
  hasAppraisalReport: boolean;
  hasFloorPlan: boolean;
  hasPhotos: boolean;
  hasCommercialDistrictAnalysis: boolean;
  hasMarketComps: boolean;
  hasCreditRating: boolean;
}
```

### 3. Financial Calculation Contract (`src/domain/building/im-core/financial-calculator.ts`)
```typescript
export interface FinancialInputs {
  purchasePriceKrw: number;
  monthlyRentKrw: number;
  depositKrw: number;
  maintenanceFeeKrw?: number;
  monthlyOperatingExpensesKrw?: number;
  annualPropertyTaxKrw?: number;
  loanAmountKrw?: number;
  annualInterestRate?: number;
  totalAreaSqm?: number;
  landAreaSqm?: number;
}

export interface FinancialOutputs {
  grossRentalYield: number;
  noiKrw: number;
  capRate: number;
  cashOnCashReturn: number;
  monthlyDebtServiceKrw: number;
  dscr: number;
  pricePerPyeongLandKrw: number;
  pricePerPyeongBuildingKrw: number;
}

export function calculateFinancials(inputs: FinancialInputs): FinancialOutputs;
```

### 4. Architecture Boundary Checker Contract (`src/tests/governance/architecture-boundaries.test.ts`)
```typescript
// Verifies that NO file inside src/domain/building/im-core/ imports from:
// - ../mobile-im
// - ../../components
// - ../../app
// - @supabase
// - next
// - react
export function scanDomainReverseImports(domainDir: string): Array<{
  file: string;
  importedModule: string;
  line: number;
}>;
```

### 5. Data Fidelity Assertion Contract (`src/tests/domain/mobile-im-data-fidelity.test.ts`)
```typescript
export interface DataFidelityAssertionReport {
  posture: string;
  numericParityPassed: boolean;
  rentRollPassed: boolean;
  zeroPoisonTokensPassed: boolean;
  zeroPersonaLeaksPassed: boolean;
  zeroPriceBandsPassed: boolean;
  missingDataHandledGracefully: boolean;
  failures: string[];
}
```

## Code Layout
- `src/domain/building/im-core/`: Pure domain logic (claim, claim-registry, data-availability, release-tier, financial-calculator, lease-calc, permit-zone, korean-legal).
- `src/domain/ontology/`: Shared ontology definitions (provenance.ts, d56-labels.ts).
- `src/domain/building/mobile-im/`:
  - `writer.ts`: Orchestrated mobile IM generation coordinator.
  - `im-section-generator.ts`: Section generator with AI or template branching.
  - `premium-template-engine.ts`: Deterministic template generator with D56 copy.
  - `investor-copywriting.ts`: Headline & investment thesis copy generator.
  - `narrative-prompt.ts`: LLM prompt builder and posture examples.
  - `terminology-normalizer.ts`: D56 lexicon normalizer and text hygiene.
  - `lease-adapter.ts`: Rent roll formatting and lease calculation binding.
  - `section-renderers/`:
    - `title-rights-renderer.ts`: Title & rights section renderer.
    - `land-detail-renderer.ts`: Land detail & zoning section renderer.
    - `comparables-renderer.ts`: Market comparables section renderer.
  - `pptx/`: PPTX presentation generation modules.
- `src/app/(public)/im-lite/[buildingId]/`:
  - `mobile-im-viewer.tsx`: Client viewer component with D56 section navigation.
  - `fetch-im-data.ts`: Server-side data fetcher and section assembly.
- `src/tests/governance/`:
  - `architecture-boundaries.test.ts`: Automated Rule 12 static boundary test.
- `src/tests/domain/`:
  - `mobile-im-data-fidelity.test.ts`: Automated 5-posture data fidelity assertion suite.
