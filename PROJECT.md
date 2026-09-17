# Project: Institutional Pro IM Investment Review Pipeline & PPTX Generation Engine

## Architecture
- **Domain Layer (`src/domain/building/im-core/`, `src/domain/financial/`, `src/domain/lease/`)**:
  - `dcf-sensitivity.ts` & `pro-financial-model.ts`: Multi-year line-item cash flow projection engine (PGI, Vacancy Allowance, EGI, OPEX Breakdown, CapEx Reserve, NOI, Debt Service, BTCF, Levered & Unlevered IRR via Newton-Raphson).
  - 2D Sensitivity Matrix (Exit Cap Rate vs Discount Rate) and Vacancy Stress-Testing scenarios.
  - Development Feasibility Budgeting: 5-tier budget structure (Land Acquisition & Carrying, Direct Construction Hard Costs, Indirect Soft Costs, Financing / PF Costs, Contingency Reserve).
  - Multi-Page Institutional Tenant Roster: `InstitutionalTenantRosterItem` supporting suite numbers, lease expirations, renewal options, statutory regimes (상임법 10년), and multi-page continuation.
  - SSoT Mathematical Consistency Gate: 6-point validator ensuring executive summary metrics match detail schedules (0.00% discrepancy).
- **Presentation & PPTX Rendering (`src/domain/building/mobile-im/pptx/`)**:
  - `archetypes/a25-chapter-divider.ts`: Standardized chapter cover slide with Roman numerals, chapter title, subtitle, and theme accent.
  - `pro-deck-sequencer.ts` / `deck-sequencer.ts`: `buildProDeckSequence()` generating 30~40 structured slides across the 5 core chapters, strictly isolating Basic IM's 16-page hard limit (`PAGE_HARD_LIMIT = 16`).
  - `data-binder.ts`: Extended data binding for 5 core chapters (Executive Summary, Asset Specs, Multi-Year DCF, Market Dynamics, Due Diligence Annexes).
- **Quality Assurance & Verification Harness (`src/assurance/im-harness/`, `src/tests/`)**:
  - `observers/pptx-binary-observer.ts` & `golden-test-utils.ts`: Enhanced binary inspection eliminating poison tokens (`/NaN|undefined|\bnull\b|\[object Object\]/`), evasive phrases ("추후 확인 필요", "미정", "상세 불명"), and mock data leaks.
  - `src/tests/e2e/pro-im-golden-pipeline.test.ts`: Automated golden test spec executing end-to-end Pro IM deck generation, verifying 30+ slides, 5 core chapters, mathematical consistency, and 9-fold binary assertions.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Multi-Year DCF Cash Flow Engine | Line-item cash flow (PGI, vacancy, EGI, OPEX, CapEx, NOI, debt service, BTCF, unlevered/levered IRR) | M1 | R2, Explorer 2 | DONE |
| 2 | 2D Sensitivity & Vacancy Stress | Exit Cap Rate vs Discount Rate matrix and vacancy stress-testing scenarios | M1 | R2, Explorer 2 | DONE |
| 3 | 5-Tier Dev Feasibility Budget | Land acquisition, hard costs, soft costs, PF financing, contingency reserve | M1 | R2, Explorer 2 | DONE |
| 4 | Multi-Page Tenant Roster Model | Roster with suite numbers, renewal options, statutory regimes, multi-page continuation | M1 | R2, Explorer 2 | DONE |
| 5 | Mathematical SSoT Consistency | 6-point mathematical validation across executive summary and detail schedules | M1 | R3, Explorer 2 | DONE |
| 6 | A25 Chapter Divider Archetype | Visual slide archetype for 5 core chapter title slides | M2 | R1, Explorer 1 | PLANNED |
| 7 | Pro IM Deck Sequencer (30+ slides) | `buildProDeckSequence()` assembling 30~40 slides across 5 chapters while isolating Basic IM | M2 | R1, Explorer 1 | PLANNED |
| 8 | Pro IM Data Binder Extensions | Bind DCF schedules, sensitivity tables, multi-page rosters, annexes in `data-binder.ts` | M2 | R1, Explorer 1 | PLANNED |
| 9 | Commercial Poison & Evasion Gate | Regex-hardened poison token (`NaN`, `undefined`, `null`, `[object Object]`), evasion phrases, mock leak checks | M3 | R3, Explorer 3 | PLANNED |
| 10 | Pro IM Automated Golden Test Spec | `src/tests/e2e/pro-im-golden-pipeline.test.ts` verifying 30+ slides, 5 chapters, mathematical consistency, binary gates | M4 | AC, Explorer 3 | PLANNED |
| 11 | Release Gate Verification | Verify `npm run preflight` (>=108/108), `npx tsc --noEmit` (0 error), `npm run build` (clean) | M4 | AC, Explorer 3 | PLANNED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Quantitative Modeling & Tenancy Breakdown | Features 1, 2, 3, 4, 5 (Multi-year DCF, 2D sensitivity, 5-tier dev budget, multi-page tenant roster, mathematical consistency) | none | DONE |
| 2 | M2: Pro IM Chapter Pipeline & Deck Layout | Features 6, 7, 8 (A25 Chapter Divider, Pro deck sequencer 30+ slides, data binder extensions) | M1 | PLANNED |
| 3 | M3: Quality Assurance & Poison Prevention Gates | Feature 9 (Enhanced binary inspection, poison token regex, evasive phrase detector, mock leak guard) | M2 | PLANNED |
| 4 | M4: Automated Golden Test Spec & Release Gates | Features 10, 11 (`pro-im-golden-pipeline.test.ts`, preflight 108/108, tsc 0 error, build clean) | M1, M2, M3 | PLANNED |

## Interface Contracts
### 1. Quantitative Pro IM Financial Model Contract
- `MultiYearCashFlow`:
  - `years: number[]` (e.g. Year 1 to 10)
  - `pgi: number[]` (Potential Gross Income)
  - `vacancyAllowance: number[]`
  - `egi: number[]` (Effective Gross Income = PGI - Vacancy)
  - `opex: { managementFee: number[]; propertyTax: number[]; insurance: number[]; maintenance: number[]; total: number[] }`
  - `capexReserve: number[]`
  - `noi: number[]` (Net Operating Income = EGI - OPEX - CapEx)
  - `debtService?: { principal: number[]; interest: number[]; total: number[] }`
  - `btcf?: number[]` (Before-Tax Cash Flow = NOI - Debt Service)
  - `exitAssumptions: { holdingPeriodYears: number; exitCapRatePct: number; grossSalePrice: number; dispositionCosts: number; netProceeds: number }`
  - `metrics: { unleveredIrrPct: number; leveredIrrPct?: number; initialCapRatePct: number; averageCashOnCashPct?: number }`
- `SensitivityMatrix2D`:
  - `exitCapRates: number[]` (rows)
  - `discountRates: number[]` (cols)
  - `unleveredIrrGrid: number[][]`
  - `npvGridKrw: number[][]`
- `DevelopmentFeasibilityBudget`:
  - `landAcquisitionKrw: number`
  - `hardCostsKrw: number`
  - `softCostsKrw: number`
  - `financingPfKrw: number`
  - `contingencyKrw: number`
  - `totalDevelopmentCostKrw: number`
  - `projectedGrossRevenueKrw: number`
  - `projectIrrPct: number`
  - `equityIrrPct: number`

### 2. Multi-Page Institutional Tenant Roster Contract
- `InstitutionalTenantRosterItem`:
  - `floor: string`
  - `unitNumber: string`
  - `tenantName: string`
  - `industry: string`
  - `leasedAreaM2: number`
  - `leasedAreaPyeong: number`
  - `depositKrw: number`
  - `monthlyRentKrw: number`
  - `monthlyMaintenanceKrw: number`
  - `leaseStartDate: string`
  - `leaseEndDate: string`
  - `renewalOption?: string`
  - `statutoryProtection10Y: boolean`
- Multi-page chunking: 12~14 tenants per slide, with running subtotals and Grand Total on final page.

### 3. Chapter Structure Contract (5 Core Chapters, 30+ Slides)
- Front Matter:
  - Slide 1: Executive Cover (`a01-cover`)
  - Slide 2: Table of Contents / Agenda (`a15-toc-agenda`)
- Chapter 1: Executive Summary & Investment Thesis (min 5 slides):
  - Slide 3: Ch.1 Divider (`a25-chapter-divider`: "I. EXECUTIVE SUMMARY & INVESTMENT THESIS")
  - Slide 4: Key Facts & Asset Profile (`a02-key-facts`)
  - Slide 5: Core Investment Thesis (`a15-hero-stat-trio`)
  - Slide 6: Acquisition Highlights & Pricing Matrix (`a04-comparison-cards`)
  - Slide 7: Location & Accessibility Overview (`a16-regional-macro-map`)
  - Slide 8: Tenant & Cash Flow Snapshot (`a09-proforma-waterfall`)
- Chapter 2: Detailed Asset & Building Specifications (min 6 slides):
  - Slide 9: Ch.2 Divider (`a25-chapter-divider`: "II. DETAILED ASSET & BUILDING SPECIFICATIONS")
  - Slide 10: Architectural & Physical Specifications (`a04-comparison-cards`)
  - Slide 11: Zoning, Land Registry & Legal Status (`a04-comparison-cards`)
  - Slide 12: Floor-by-Floor Stacking Plan (`a22-stacking-plan`)
  - Slide 13: Detailed Tenant Roster - Part 1 (`a03-rentroll-breakdown`)
  - Slide 14: Detailed Tenant Roster - Part 2 / Expiration Schedule (`a03-rentroll-breakdown`)
  - Slide 15: Facility & MEP Systems Condition (`a14-swot-grid`)
- Chapter 3: Comprehensive Financial Modeling (min 7 slides):
  - Slide 16: Ch.3 Divider (`a25-chapter-divider`: "III. COMPREHENSIVE FINANCIAL MODELING")
  - Slide 17: Multi-Year NOI / DCF Projections Schedule (`a08-table-schedule`)
  - Slide 18: Revenue & OPEX Line-Item Breakdown (`a03-rentroll-breakdown`)
  - Slide 19: Exit Cap Rate & DCF Valuation Matrix (`a23-dcf-valuation`)
  - Slide 20: 2D Sensitivity Matrix: Exit Cap vs Discount Rate (`a05-split-photo-card`)
  - Slide 21: Vacancy & Downside Stress Analysis (`a08-table-schedule`)
  - Slide 22: Capital Structure & Debt Financing Simulation (`a08-table-schedule`)
- Chapter 4: Market Dynamics & Comparable Transactions (min 6 slides):
  - Slide 23: Ch.4 Divider (`a25-chapter-divider`: "IV. MARKET DYNAMICS & COMPARABLE TRANSACTIONS")
  - Slide 24: Macro Submarket Overview (GBD/YBD/CBD) (`a05-split-photo-card`)
  - Slide 25: Submarket Rental Rates & Vacancy Trends (`a06-quad-photo-grid`)
  - Slide 26: Micro-Location Catchment & Transit Connectivity (`a07-trio-accent-cards`)
  - Slide 27: Recent Comparable Asset Transactions (`a03-rentroll-breakdown`)
  - Slide 28: Comp Valuation Multiples & Price per Pyeong Benchmarking (`a08-table-schedule`)
- Chapter 5: Legal, Technical & Due Diligence Annexes (min 6 slides):
  - Slide 29: Ch.5 Divider (`a25-chapter-divider`: "V. LEGAL, TECHNICAL & PHYSICAL DUE DILIGENCE ANNEXES")
  - Slide 30: Cadastral Map & Land Boundaries (`a12-cadastral-map`)
  - Slide 31: Title Ownership & Encumbrance Status (`a04-comparison-cards`)
  - Slide 32: Building Code, FAR/BCR Compliance & Expansion Potential (`a18-development-feasibility`)
  - Slide 33: Environmental & Physical Due Diligence Summary (`a18-development-feasibility`)
  - Slide 34: Investment Committee Decision Matrix & Next Steps (`a10-disclaimer-contact`)
- Total Slides: 34 slides (Exceeds 30+ slide requirement across all 5 core chapters).

### 4. Binary Assertion Gate Contract
- 0 poison tokens: `/NaN|undefined|\bnull\b|\[object Object\]/` across all slide XMLs and inline text runs.
- 0 evasive phrases: `/(추후\s*확인\s*필요|미정|상세\s*불명|확인\s*불가|자료\s*없음)/` in required fields.
- 0 mock leaks: strictly no leakage of dummy NH Capital / mock tenant names when real data is present.
- Mathematical consistency: Ch1 summary figures match Ch3 DCF schedules with 0.00% difference.

## Code Layout
- `src/domain/building/im-core/`:
  - `pro-financial-model.ts`: Multi-year DCF, 2D sensitivity, 5-tier dev budget, mathematical consistency gate.
  - `pro-tenant-roster.ts`: Multi-page institutional tenant roster and expiration schedule.
- `src/domain/building/mobile-im/pptx/`:
  - `archetypes/a25-chapter-divider.ts`: Chapter divider visual slide archetype.
  - `pro-deck-sequencer.ts`: Dedicated Pro IM 30+ slide sequence assembler.
  - `data-binder.ts`: Extended data binding for Pro IM chapters.
- `src/assurance/im-harness/`:
  - `observers/pptx-binary-observer.ts`: Enhanced poison token & evasion phrase detection.
- `src/tests/e2e/`:
  - `pro-im-golden-pipeline.test.ts`: Automated Pro IM golden test spec (fast Vitest runner).
