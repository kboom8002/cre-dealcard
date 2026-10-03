# TEST_INFRA — im-core Domain Data to Mobile IM Test Infrastructure

> **Project**: im-core Domain Data to Mobile IM Pipeline Enhancement & Hardening  
> **Milestone**: M2 (E2E Testing Track)  
> **Author**: `test_writer_m2`  
> **Date**: 2026-09-29  
> **Target**: Orchestrator & Implementing Agents (`worker_m1`, `worker_m3`, `worker_m4`)  

---

## 1. Overview & Architecture

The Mobile IM Data Fidelity Test Infrastructure establishes an automated, deterministic verification harness to guarantee that raw domain data from `im-core` maps without loss, corruption, distortion, or leakage into the generated presentation sections across all 5 CRE investment postures.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    im-core Pure Domain Models & SSOT Data                    │
│  - ClaimRegistry / FinancialCalculator / LeaseCalc / KoreanLegal / Postures │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  Presentation & View Layer (mobile-im)                       │
│  - writer.ts (Orchestrated Generator)                                       │
│  - im-section-generator.ts (Section Assembly & Quality Gates)                │
│  - premium-template-engine.ts (Deterministic Fallback Engine)                │
│  - lease-adapter.ts (Rent Roll Normalization & Markdown Injection)          │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│      Automated 5-Posture Data Fidelity Assertion Suite (Milestone 2)         │
│             `src/tests/domain/mobile-im-data-fidelity.test.ts`               │
├──────────────────────────────────────────────────────────────────────────────┤
│  [Dimension 1] Exact Numeric Parity (Price, Land/Gross Area, Rent, Deposit)  │
│  [Dimension 2] Rent Roll Parity (Floor Completeness & Sum Equivalence)       │
│  [Dimension 3] Zero Negative Invariants (Poison, Persona, Evasion, Bands)    │
│  [Dimension 4] Proposal & Investment Thesis Integrity                        │
│  [Dimension 5] Missing Data Safety & Graceful Fallback Handling              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 5 Realistic Posture Fixtures

The suite defines five realistic CRE property fixtures representing the 5 core investment postures:

| Posture | Fixture Asset | Key Domain Parameters | Verification Focus |
|:---|:---|:---|:---|
| **income** | 수익형 당산동 빌딩 | 매각가 115억 원, 대지 330.5㎡ (100평), 연면적 991.7㎡ (300평), 월세 2,800만 원, 보증금 3억 원, 5개 층 임대차 | 매매가·면적 정확 일치, 5개 층 전수 렌트롤 테이블 반영, 월세 합산 일치 (2,800만원) |
| **development** | 개발형 대흥동 부지 | 매각가 85억 원, 대지 450.0㎡ (136.1평), 연면적 495.0㎡, 법정 용적률 200% 대비 현황 용적률 여력 | 토지비, 신축 사업수지 및 용적률 여력 분석, 정확 대지면적 반영 |
| **operating** | 운영형 신사동 근생/숙박 | 매각가 210억 원, 대지 660.0㎡, 연면적 2,400.0㎡, 연간 GOP 8.5억 원, OCC 78%, ADR 18만 원 | 직영 운영 스펙, GOP 마진 및 영업이익 수치 보존, 환각 수치 방지 |
| **owner_occupied** | 사옥형 서초동 오피스 | 매각가 180억 원, 대지 520.0㎡, 연면적 1,500.0㎡, 즉시 명도 가능 | 사옥 공간 스펙 (1,500㎡), 자가사용 vs 임차 비용 비교, 즉시 명도 조건 반영 |
| **trading** | 매매/차익형 역삼동 빌딩 | 매각가 140억 원, 대지 400.0㎡, 연면적 1,200.0㎡, 실거래가 분석 및 시세 대비 밸류 | 시장 포지셔닝, 140억 원 확정 매매가, 단기 차익(HPR) 시나리오 |
| **degenerate** | 결측치 테스트 케이스 | 주소·면적·금액·임대차 전량 결측 | 크래시 없음, 0 독소 토큰, 정제된 대체 안내 문구 표기 |

---

## 3. 5 Assertion Dimensions & Contract

The assertion suite exports standard validation functions and a unified report generator:

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

### 3.1 `assertNumericParity(input, sections)`
- **Asking Price**: Matches exact KRW or 억 원 amount (e.g. `115억 원`, `11,500,000,000`).
- **Land & Gross Area**: Matches exact ㎡ (e.g. `330.5㎡`, `991.7㎡`) and pyeong conversions (`100평`, `300평`).
- **Monthly Rent & Deposit**: Matches input figures without truncation, multiplication errors, or displacement.
- **Operating Metrics**: Validates GOP (`8.5억 원`), OCC (`78%`), and ADR (`18만 원`) for operating assets.

### 3.2 `assertRentRollParity(input, sections)`
- **Floor Representation**: Asserts every floor (`1F`, `2F`, `3F`, `4F`, `5F`) in `floor_leases` is represented in markdown tables.
- **Rent Sum Parity**: Computes $\sum \text{rent\_manwon}$ across floor leases and asserts exact mathematical equivalence with `monthly_rent_total_krw`.
- **Table Integrity**: Confirms normalized markdown table blocks with rent totals render in `lease_status`.

### 3.3 `assertNegativeInvariants(sections)`
- **Poison Tokens**: 0 occurrences of `NaN`, `undefined`, `null`, `[object Object]`, `NaN%`, `NaN원`.
- **Persona Isolation (Rule 1)**: 0 occurrences of explicit persona tags (`60대 자산가`, `60대 자산가를 위한`, `법인 대표 맞춤`, `개인 투자자 맞춤`, `은퇴 자산가`, `초보 투자자용`, `자녀 세대 가업승계용`).
- **Evasion Phrases (Rule 37)**: 0 occurrences of evasive deferral strings (`본문을 참조`, `별도 안내 예정`, `추후 확인`, `상세...별첨`, `구체적인 수치는 본문을 참조`, `자문 후 확정`).
- **Price Band Blocking (Rule 52)**: 0 occurrences of approximate price bands (`\d+억대`, e.g. `200억대`, `100억대`) in narrative bodies; exact prices are mandatory.

### 3.4 `assertProposalIntegrity(proposals, sections)`
- Asserts that broker-confirmed value-add / investment thesis points (and `ProposalUnit` instances where `approvalState === 'broker_confirmed'`) appear in the output sections without omission.

### 3.5 `assertMissingDataSafety(emptyInput, sections)`
- Verifies that when degenerate or incomplete inputs are passed, the pipeline runs gracefully without unhandled exceptions.
- Guarantees 0 poison tokens and clean, institutional fallback indicators (`확인 필요`, `담당 브로커에게 문의`, `-`).

---

## 4. Test Execution & Release Verification Commands

```powershell
# 1. Run 5-Posture Data Fidelity Assertion Suite
npx vitest run src/tests/domain/mobile-im-data-fidelity.test.ts

# 2. Run Pre-flight Pipeline Audit Regression (108 tests)
npm run preflight

# 3. Combined Milestone Verification Command
npx vitest run src/tests/domain/mobile-im-data-fidelity.test.ts ; npm run preflight

# 4. Full Domain Test Suite
npm run test:domain
```

---

## 5. Test Pyramids & Quality Gate Integration

| Layer | Target | Tests | Command |
|:---|:---|:---:|:---|
| **Layer 1** | Pure Domain Unit Tests & Preflight Audit | 108 | `npm run preflight` |
| **Layer 2** | 5-Posture Data Fidelity & Negative Invariants | 13 | `npx vitest run src/tests/domain/mobile-im-data-fidelity.test.ts` |
| **Layer 3** | Architecture Boundaries & Domain Decoupling | 1 | `npx vitest run src/tests/governance/architecture-boundaries.test.ts` |
| **Layer 4** | E2E Golden Pipelines & Artifact Inspection | Suite | `npx playwright test` / `src/tests/e2e/` |
