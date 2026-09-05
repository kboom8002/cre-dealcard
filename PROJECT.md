# Project: CRE Dealcard IM Modernization — Sinsa-dong 590 & Seocho-dong 1364-28 Full Pipeline Calibration

## Architecture
- **Domain Layer (`src/domain/building/im-core/`)**:
  - `valuation-calc.ts`: 2-Method Valuation Engine (Sales Comparison + Income Capitalization, with explicit Cost Method exclusion note).
  - `broker-input-validator.ts`: Land price anomaly detection and high vacancy pro-forma normalization.
  - `claim-registry.ts`, `financial-calculator.ts`, `display-label.ts`, `release-tier.ts`, `approval-gate.ts`, `korean-legal.ts`, `target-hash.ts`.
  - `cross-channel-checker.ts`: Cross-channel numerical and physical consistency validation across 7 core metrics.
  - `approval/ledger-service.ts`: Immutable 2-stage approval ledger (`approval_events`, `release_records`) with PostgreSQL persistence and in-memory fallback.
- **Presentation & Rendering Engine (`src/domain/building/mobile-im/pptx/`)**:
  - `macro-transit-engine.ts`: Sharp SVG vector generator (1600x1200 px, 266.7 DPI) with GBD sub-district routing (`GBD_SINSA`, `GBD_SEOCHO`).
  - `data-binder.ts`: Binds SSoT, cadastral map, and `enrichment.macroTransitImage` to slide data maps; enforces 3-tier Key Facts hierarchy.
  - `deck-sequencer.ts`: Rule 10 16-slide body hard limit (`PAGE_HARD_LIMIT=16`) + appendix separation.
  - `pptx-theme.ts`: 5 Theme presets (`institutional_slate`, `institutional_dark_gold`, `corporate_clean_white`, `commercial_visual_grid`, `development_technical_blueprint`).
- **Assurance & Quality Harness (`src/assurance/im-harness/`)**:
  - `observers/pptx-binary-observer.ts`: `inspectPptxBinary` verifying 9 physical gates (Bleed 0, Residue 0, Broken 0, Rule 1 Persona 0, Rule 2 Lexicon 0, P0 Legal 0, G54 Defect Excuse 0, G55 AI Lecture 0, G56 System Rules 0) and 150+ DPI.
  - `extract-gate-context.ts`: Extracts gate metrics including G54-G56 violation counts from slide texts.
  - `profiles/pptx-profile.ts`: Quality gate profile evaluating all release rules.
- **SSoT Fixtures (`docs/test/real-broker-im/`)**:
  - `sinsa-590-fixture.json`: Single Source of Truth for 신사동 590 ICL 빌딩 (760억 원).
  - `seocho-1364-28-fixture.json`: Single Source of Truth for 서초동 1364-28 FM 빌딩 (230억 원).

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | SSoT Fixture: Sinsa 590 | Create standalone `sinsa-590-fixture.json` with 4 mandatory specs & 3-tier Key Facts | M1 | Survey 1 (R1) | DONE |
| 2 | SSoT Fixture: Seocho 1364-28 | Create standalone `seocho-1364-28-fixture.json` with 4 specs, 3-tier Key Facts & pro-forma | M1 | Survey 1 (R1) | DONE |
| 3 | 4 Mandatory Specs Binding | Bind `archAreaM2`, `completionDate`, `parkingCount`/`parking`, `elevatorCount` in pipeline | M1 | Survey 1 (R1) | DONE |
| 4 | 3-Tier Key Facts Hierarchy | Standardize Tier 1 (대상지), Tier 2 (토지), Tier 3 (건물) in SSoT & data binder | M1 | Survey 1 (R1) | DONE |
| 5 | Seocho Vacancy Pro-forma Model | Codify 3 vacant floors (259.4평) normalization (1.15% -> 2.30% Cap Rate, +1.15%p upside) | M1 | Survey 1 (R1) | DONE |
| 6 | GBD 2-Method Valuation Integration | Integrate `valuation-calc.ts` with 5 comps (Sinsa) & 4 comps (Seocho) + 2.5%~3.5% market cap rate | M2 | Survey 1 (R2) | DONE |
| 7 | Explicit Cost Method Exclusion | Record explicit reason note (`원가법 제외: 노후도 감가 및 도심 역세권...`) in valuation reports | M2 | Survey 1 (R2) | DONE |
| 8 | Broker Input Anomaly Validation | Assert 0 critical discrepancies for clean SSoT, and assert critical error on raw memo | M2 | Survey 1 (R2) | DONE |
| 9 | GBD Macro Transit Sub-District Engine | Implement `GBD_SINSA` (Dosan-daero, Wirye-Sinsa) & `GBD_SEOCHO` (Yangjae, GTX-C) in `macro-transit-engine.ts` | M3 | Survey 2 (R3) | IN_PROGRESS |
| 10 | Macro Transit Pipeline Data Binding | Bind `enrichment.macroTransitImage` to `dataMap['location']` in `data-binder.ts` | M3 | Survey 2 (R3) | IN_PROGRESS |
| 11 | Catchment Demand Domain Isolation | Strictly isolate internal tenants to rent roll/stacking; external drivers to catchment | M3 | Survey 2 (R3) | IN_PROGRESS |
| 12 | G54~G56 Regex Expansion | Broaden regexes in `pptx-binary-observer.ts` to detect shorthand '산출불가', '미확보', '비워둠' | M4 | Survey 2 (R4) | PLANNED |
| 13 | Gate Metric Extraction Logic | Populate `defectExcuseCount`, `preachyToneCount`, `internalRuleLeakCount` in `extract-gate-context.ts` | M4 | Survey 2 (R4) | PLANNED |
| 14 | Evaluator Rules in PPTX Profile | Register G54, G55, G56 evaluator rules in `src/assurance/im-harness/profiles/pptx-profile.ts` | M4 | Survey 2 (R4) | PLANNED |
| 15 | Rule 10 Slide Limit Verification | Verify body slides <= 16 with appendix separation in `inspectPptxBinary` and test suites | M4 | Survey 2 (R4) | PLANNED |
| 16 | S50 Gate Check Precondition Enforcement | Require `S50_GATE_CHECK` before `S60_EDITORIAL_APPROVAL` in `StudioApprovalService` & API route | M5 | Survey 3 (R5) | PLANNED |
| 17 | Omni-Channel 7 Core Metrics Sync | Verify 0 discrepancies across title, asking_price, total_area, land_area, cap_rate, total_deposit, monthly_rent | M5 | Survey 3 (R5) | PLANNED |
| 18 | Rule 7 Negative Pair Test Hardening | Add negative assertion pairs to `real-broker-im-pipeline.test.ts` and `pptx-publication-flow.test.ts` | M5 | Survey 3 (R5) | PLANNED |
| 19 | Production Build & Full Pipeline Verification | Achieve clean `vitest` pass, `benchmark-real-broker-im.ts` 0 defects, and `npm run build` exit code 0 | M5 | Survey 3 (R5) | PLANNED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: SSoT Fixtures & 4 Building Specs | Features 1, 2, 3, 4, 5 (sinsa-590-fixture.json, seocho-1364-28-fixture.json, 4 specs, 3-tier key facts, vacancy pro-forma) | none | DONE |
| 2 | M2: GBD 2-Method Valuation Integration | Features 6, 7, 8 (valuation-calc integration, 3~5 comps, market cap rate 2.5%~3.5%, cost method exclusion, broker input validation) | M1 | DONE |
| 3 | M3: GBD Macro Transit Vector & Catchment Isolation | Features 9, 10, 11 (GBD sub-district engine, data-binder image binding, catchment demand isolation) | M1 | IN_PROGRESS |
| 4 | M4: G54~G56 Governance & 9 Physical Binary Gates | Features 12, 13, 14, 15 (regex expansion, gate context extraction, profile rules, Rule 10 slide limits) | M1, M3 | PLANNED |
| 5 | M5: Studio Approval Ledger & Omni-Channel Verification | Features 16, 17, 18, 19 (S50 gate enforcement, 7 metrics sync, Rule 7 negative pairs, test runners, production build) | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### 1. SSoT Fixture Schema (`docs/test/real-broker-im/*.json`)
- `archAreaM2: number`
- `completionDate: string` (YYYY-MM-DD)
- `parking: string`, `parkingCount: number`
- `elevatorCount: number`
- `keyFacts3Tier: { tier1_subject: [string, string][]; tier2_land: [string, string][]; tier3_building: [string, string][] }`
- `proForma?: { vacantFloorCount: number; vacantAreaPyeong: number; currentCapRatePct: number; estimatedFullOccupancyCapRatePct: number; upsideCapRatePp: number; proFormaMonthlyRentKrw: number; proFormaAnnualNoiKrw: number }`
- `salesComparisonComps: SalesComp[]`
- `incomeCapitalization: { marketCapRateRangePct: [number, number]; costMethodExcludedNote: string; ... }`

### 2. GBD Macro Transit Sub-District Engine Contract (`macro-transit-engine.ts`)
- `options.subDistrict?: 'GBD_SINSA' | 'GBD_SEOCHO' | 'GBD_TEHERAN'`
- Detection: `/신사|도산대로|압구정|논현/` -> `GBD_SINSA`; `/서초|양재|남부순환/` -> `GBD_SEOCHO`
- Output: 1600x1200 px, 266.7 DPI effective in 5.60" x 4.50" box (passes G32 >= 150 DPI).
- Data Binder: `bindFromExternalData` binds `enrichment.macroTransitImage` to `dataMap['location']`.

### 3. Physical Binary 9 Gates Contract (`pptx-binary-observer.ts`)
- `issues.length === 0`
- `placeholderResidueCount === 0`
- `bleedCount === 0`
- `brokenImageCount === 0`
- `personaViolationCount === 0`
- `lexiconViolationCount === 0`
- `legalRiskViolationCount === 0`
- `defectExcuseViolationCount === 0` (G54: checks shorthand '산출불가', '미확보', '비워둠')
- `preachyViolationCount === 0` (G55: checks '표면 수익률만으로 판단하지 마십시오')
- `internalRuleViolationCount === 0` (G56: checks 'Rule 10', '내부 시스템 규칙', 'P-PPTX-RELEASE')
- `minEffectiveDpi >= 150`

### 4. Studio Approval Precondition Contract (`studio-approval-service.ts`)
- `approveEditorial`: Strictly requires `project.stage === 'S50_GATE_CHECK'`.
- `approveFile`: Strictly requires `project.stage === 'S60_EDITORIAL_APPROVAL'`.
- Transition to `PUBLISHED` generates release record with SHA-256 target hash.

### 5. Cross-Channel Checker Invariants (`cross-channel-checker.ts`)
- `title`: Trimmed match or mutual containment
- `asking_price`: diff <= 0.1%
- `total_area`: diff <= 0.05 ㎡
- `land_area`: diff <= 0.05 ㎡
- `cap_rate`: diff <= 0.05%p
- `total_deposit`: diff <= 1 KRW
- `monthly_rent`: diff <= 1 KRW

## Code Layout
- `docs/test/real-broker-im/`: Standalone SSoT fixtures (`sinsa-590-fixture.json`, `seocho-1364-28-fixture.json`)
- `src/domain/building/im-core/`: Pure domain logic (`valuation-calc.ts`, `broker-input-validator.ts`, `cross-channel-checker.ts`, `approval/`)
- `src/services/macro-transit-engine.ts`: GBD transit vector engine (Sharp SVG)
- `src/domain/building/mobile-im/pptx/`: PPTX renderer, `data-binder.ts`, `deck-sequencer.ts`, `quality-gates-v02.ts`, `extract-gate-context.ts`
- `src/assurance/im-harness/`: `observers/pptx-binary-observer.ts`, `profiles/pptx-profile.ts`
- `src/tests/`: E2E test suites (`real-broker-im-pipeline.test.ts`, `pptx-publication-flow.test.ts`, `cross-channel-invalidation.test.ts`)
- `scripts/`: `benchmark-real-broker-im.ts`
