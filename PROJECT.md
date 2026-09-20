# Project: Basic IM PPTX Generation Zero-Defect Hardening & Adversarial Verification

## Architecture
- **Pipeline Flow**: SSOT / Payload -> `data-binder.ts` & `binder/*.ts` -> `deck-sequencer.ts` -> `MobileImPptxRenderer.render()` -> Slide Archetypes (`A01`~`A24`) -> `imlib.ts` geometry / formatting -> PPTX Binary Generation / Sharp Optimization.
- **Studio API Routes**: `/api/broker/basic-im-studio/...`, `/api/broker/pptx-studio/...` -> Orchestration & Binary Delivery.
- **Verification Harness**: `src/tests/adversarial/`, `src/tests/e2e/preflight-pipeline-audit.test.ts`, `src/tests/unit/`.

## Feature & Defect Inventory
| # | Defect / Feature | Description | Milestone | Source |
|---|------------------|-------------|-----------|--------|
| 1 | Test Typecheck Errors | 16 static compiler errors in test files blocking `tsc --noEmit` | M1 | Explorer 3 |
| 2 | Basic IM Adversarial Test Suite | Comprehensive 5-dimension chaos, fuzz, and stress tests for Basic IM | M1 | Explorer 3 |
| 3 | Concurrency Test Skip Rule 60 | Fix or complement skipped tests in `im-concurrency.test.ts` | M1 | Explorer 3 |
| 4 | Theme Concurrency Race in `imlib.ts` | Replace mutable global `C`, `CD`, `KR` with thread-safe scoped theme context | M2 | Explorer 2, 3, 1 |
| 5 | Active Poison Token Injection | Fix `premium-binders.ts` rendering literal `"잔여 null일"` | M2 | Explorer 2 |
| 6 | Evasive Phrase Sanitizer Injection | Fix `binder-utils.ts` injecting `[확인 필요]` and `실사 자료 확인 필요` | M2 | Explorer 2 |
| 7 | Hardcoded Evasive Fallbacks | Eradicate 50+ "확인 필요", "실사 필요", "등기부 확인 필요" across binders | M2 | Explorer 2 |
| 8 | Token Binder NaN / [object Object] | Fix `token-binder.ts` number formatting and object stringification | M2 | Explorer 2 |
| 9 | Basic IM Slide Pop Truncation Bug | Fix `deck-sequencer.ts` dropping `yieldFormula` & `rentRoll` instead of gallery | M2 | Explorer 2 |
| 10 | Rule 44 Violation in Studio Download | Refactor `pptx-studio/projects/[id]/download` to use `MobileImPptxRenderer` | M2 | Explorer 2 |
| 11 | Missing API Authentication | Add `requireBroker(req)` to `basic-im-studio/[id]` and `download` routes | M2 | Explorer 2 |
| 12 | OCC Lock Version in Batch Updates | Enforce `expectedLockVersion` in `slides/route.ts` batch updates | M2 | Explorer 2 |
| 13 | Sharp NaN Crop & Composite Crash | Guard `image-optimizer.ts` against NaN `w`, `h`, `cropL`, `cropT`, `latlngToPixel` | M3 | Explorer 1 |
| 14 | `imlib.ts` `stat()` TypeError | Null-coalesce `opt.value.length` when value is undefined | M3 | Explorer 1 |
| 15 | Division by Zero in Physics & Text | Guard `layout-physics.ts` & `text-budget.ts` for zero height or zero font size | M3 | Explorer 1 |
| 16 | A18 Checklist Bottom Collision | Adjust A18 card height/margins to eliminate 0.25" overlap with disclaimer | M3 | Explorer 1 |
| 17 | A04 Spec Rows Collision & `\\n` | Adjust A04 spec rows to prevent price box collision; fix literal `\\n` | M3 | Explorer 1 |
| 18 | A24 Ghost Slide Suppression Leak | Check `isSuppressed` before `addSlide()` in A24 to eliminate ghost slides | M3 | Explorer 1 |
| 19 | A22 High-Floor Footnote Overlap | Adjust A22 row height clamp so table does not exceed `y = 6.40"` | M3 | Explorer 1 |
| 20 | A02 NaN Lead Sentence Poisoning | Guard against `Number("NaN")` producing `"NaN억 원"` in A02 lead | M3 | Explorer 1 |
| 21 | A06, A07, A16, A01 Overlaps & Strings | Fix A06 note overlap, A07/A16/A01 string and layout defects | M3 | Explorer 1 |
| 22 | A19~A21 Registry Stubs | Add missing registry stubs in `basic-im-contract.ts` | M3 | Explorer 1 |
| 23 | E2E Adversarial Verification & Gate | Verify 100% pass across all tests, preflight 108+, build success, audit CLEAN | M4 | All |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Test Baseline & Adversarial Suite | Fix 16 test type errors, build 45+ case Basic IM adversarial test suite | None | DONE |
| M2 | Pipeline, Concurrency & API Hardening | Thread-safe theme isolation, poison token eradication, binder/sequencer/API hardening | M1 | DONE |
| M3 | Archetypes & Geometry Hardening | Sharp NaN guards, imlib stat null safety, visual overlap & collision eradication (A01~A24) | M1 | DONE |
| M4 | Gate & Forensic Integrity Audit | Multi-agent Review, Challenger empirical stress test, Forensic Integrity Audit, Build Gate | M2, M3 | DONE |

## Code Layout
- `src/domain/building/mobile-im/pptx/imlib.ts`: Core geometry, theme management, stat rendering
- `src/domain/building/mobile-im/pptx/binder/`: Data binders (`binder-utils.ts`, `premium-binders.ts`, `core-binders.ts`)
- `src/domain/building/mobile-im/pptx/data-binder.ts`: Main SSOT data binder
- `src/domain/building/mobile-im/pptx/deck-sequencer.ts`: Sequence builder and slide bounds
- `src/domain/building/mobile-im/pptx/archetypes/`: Slide archetypes A01~A24
- `src/domain/building/mobile-im/pptx/utils/image-optimizer.ts`: Image cropping and coordinates
- `src/domain/building/mobile-im/pptx/layout-physics.ts`, `text-budget.ts`: Math and layout physics
- `src/app/api/broker/basic-im-studio/`: Studio API endpoints
- `src/app/api/broker/pptx-studio/`: Studio projects API endpoints
- `src/tests/adversarial/`: Adversarial chaos and fuzzing test suites
