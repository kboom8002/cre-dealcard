# Handoff Report: Milestone 1 Iteration 2 - Sensitivity Matrix & SSoT Consistency Remediation

- **Agent**: Remediation Explorer M1-2 (`remediation_explorer_m1_2`)
- **Archetype**: Teamwork Explorer (Investigation, Synthesis, Read-Only)
- **Parent**: Project Orchestrator 18 (`e35723a1-c26a-4c40-8dbb-cb35ae89889c`)
- **Working Directory**: `c:\Users\User\cre-dealcard\.agents\remediation_explorer_m1_2`
- **Target File**: `src/domain/building/im-core/pro-financial-model.ts`
- **Affected Tests**: 
  - `src/tests/adversarial/pro-financial-model-stress.test.ts` (Challenger M1-1)
  - `src/tests/adversarial/m1-2-tenancy-financial-stress.test.ts` (Challenger M1-2)
  - `src/tests/unit/pro-financial-model.test.ts`
- **Date**: 2026-09-17
- **Handoff Type**: Hard (Task Complete)

---

## 1. Observation

### 1.1 Baseline Test Executions
We executed the entire financial testing tier:
1. **Adversarial Stress Suite (Challenger M1-1)**:
   `npx vitest run src/tests/adversarial/pro-financial-model-stress.test.ts`
   - **Result**: 31 tests total: 25 passed, 6 failed.
   - Specifically, 2 failures belong directly to the sensitivity matrix and SSoT consistency validator:
     - `checks zero NOI in sensitivity matrix (division by zero guard for noiDeltaPct)` (Line 134)
     - `handles zero asking price and zero NOI without throwing` (Line 534)
2. **Tenancy & Consistency Adversarial Suite (Challenger M1-2)**:
   `npx vitest run src/tests/adversarial/m1-2-tenancy-financial-stress.test.ts`
   - **Result**: 18 passed (18 tests total) - tests in lines 262-345 deliberately asserted the *existing defective behavior* as empirical proof of failure during Challenger M1-2's review.
3. **Unit Test Suite**:
   `npx vitest run src/tests/unit/pro-financial-model.test.ts`
   - **Result**: 24 passed (24 tests total).
4. **TypeScript Strict Type Check**:
   `npx tsc --noEmit`
   - **Result**: Exit code 0, 0 errors.
5. **Preflight Pipeline Audit**:
   `npm run preflight`
   - **Result**: 3 test files passed, 108/108 tests passed.

---

### 1.2 Target Vulnerability 1: Sensitivity Matrix `noiDeltaPct` Division-by-Zero & Sign Inversion

- **Source File**: `src/domain/building/im-core/pro-financial-model.ts`, lines 640-670
- **Verbatim Code**:
  ```typescript
  640: const baseY1Noi = baseCf.noi[0];
  641:
  642: const vacancyStressScenarios: VacancyStressScenario[] = [
  643:   {
  644:     scenarioName: 'Base',
  645:     vacancyRatePct: baseVacancy,
  646:     year1NoiKrw: baseY1Noi,
  647:     noiDeltaPct: 0.0,
  648:     unleveredIrrPct: baseCf.metrics.unleveredIrrPct,
  649:     leveredIrrPct: baseCf.metrics.leveredIrrPct,
  650:     initialCapRatePct: baseCf.metrics.initialCapRatePct,
  651:   },
  652:   {
  653:     scenarioName: 'Moderate',
  654:     vacancyRatePct: modVacancy,
  655:     year1NoiKrw: modCf.noi[0],
  656:     noiDeltaPct: Number((((modCf.noi[0] - baseY1Noi) / baseY1Noi) * 100).toFixed(2)),
  657:     unleveredIrrPct: modCf.metrics.unleveredIrrPct,
  658:     leveredIrrPct: modCf.metrics.leveredIrrPct,
  659:     initialCapRatePct: modCf.metrics.initialCapRatePct,
  660:   },
  661:   {
  662:     scenarioName: 'Severe',
  663:     vacancyRatePct: sevVacancy,
  664:     year1NoiKrw: sevCf.noi[0],
  665:     noiDeltaPct: Number((((sevCf.noi[0] - baseY1Noi) / baseY1Noi) * 100).toFixed(2)),
  666:     unleveredIrrPct: sevCf.metrics.unleveredIrrPct,
  667:     leveredIrrPct: sevCf.metrics.leveredIrrPct,
  668:     initialCapRatePct: sevCf.metrics.initialCapRatePct,
  669:   },
  670: ];
  ```
- **Empirical Failure Trace**:
  ```text
  FAIL src/tests/adversarial/pro-financial-model-stress.test.ts > §1. 100% Vacancy Allowance (EGI = 0) > checks zero NOI in sensitivity matrix (division by zero guard for noiDeltaPct)
  AssertionError: noiDeltaPct should not be NaN when baseY1Noi is 0: expected true to be false
  - Expected: false
  + Received: true
  ```
- **Observed Defect Modes**:
  1. **Zero Base NOI (`baseY1Noi === 0`)**:
     When initial PGI is 0 or equals OPEX, `baseY1Noi === 0`.
     Line 656 and 665 perform `(modCf.noi[0] - 0) / 0`, yielding `NaN` (if numerator is 0) or `-Infinity`.
     `Number((NaN).toFixed(2))` evaluates to `NaN`.
     Poison token `NaN` leaks into `VacancyStressScenario.noiDeltaPct`, violating PROJECT.md § Architecture and § Feature 9: *"Complete elimination of poison tokens (`NaN`, `undefined`, `null`, `[object Object]`)"*.
  2. **Negative Denominator Sign Inversion (`baseY1Noi < 0`)**:
     When evaluating deeply distressed or operating-loss assets (e.g. `baseY1Noi = -100M KRW`), under moderate vacancy stress NOI drops further to `-150M KRW` (a negative change of -50M KRW).
     Because the divisor `baseY1Noi` is negative (-100M):
     `((-150M - (-100M)) / (-100M)) * 100 = (-50M / -100M) * 100 = +50.00%`.
     The calculation produces a POSITIVE +50.00% delta, incorrectly reporting a worsening financial deficit as positive growth.
  3. **Floating-Point Negative Zero (`-0`)**:
     A negative fractional delta near zero formats to `"-0.00"`, which evaluates to `-0` via `Number("-0.00")`, failing strict zero comparisons (`Object.is(0, -0) === false`).

---

### 1.3 Target Vulnerability 2: SSoT Validator Contradictory Fail State & Neutralized `tolerancePct`

- **Source File**: `src/domain/building/im-core/pro-financial-model.ts`, lines 888, 908, 952, 974, 1001
- **Verbatim Code**:
  ```typescript
  // Line 888 (Asking Price):
  passed: askingPriceDiffPct <= tolerancePct && askingPriceDiff <= 1,
  message:
    askingPriceDiff <= 1
      ? 'Executive Asking Price exactly matches Cash Flow Purchase Price.'
      : `Discrepancy detected: ${askingPriceDiff.toLocaleString()} KRW (${askingPriceDiffPct.toFixed(2)}%)`,

  // Line 908 (Year 1 NOI):
  passed: noiDiffPct <= tolerancePct && noiDiff <= 1,
  message:
    noiDiff <= 1
      ? 'Executive Year 1 NOI exactly matches Cash Flow Schedule NOI.'
      : `Discrepancy detected: ${noiDiff.toLocaleString()} KRW (${noiDiffPct.toFixed(2)}%)`,

  // Line 952 (Total Rent):
  passed: rentDiffPct <= tolerancePct && rentDiff <= 1,
  message:
    rentDiff <= 1
      ? 'Executive Total Rent exactly matches Tenant Roster Annual Rent sum.'
      : `Rent mismatch: ${rentDiff.toLocaleString()} KRW (${rentDiffPct.toFixed(2)}%)`,

  // Line 974 (Total Deposit):
  passed: depositDiffPct <= tolerancePct && depositDiff <= 1,
  message:
    depositDiff <= 1
      ? 'Executive Deposit exactly matches Tenant Roster Deposit sum.'
      : `Deposit mismatch: ${depositDiff.toLocaleString()} KRW (${depositDiffPct.toFixed(2)}%)`,

  // Line 1001 (Development Cost):
  passed: devDiffPct <= tolerancePct && devDiff <= 1,
  message:
    devDiff <= 1
      ? 'Executive Development Cost matches detailed 5-tier budget total.'
      : `Development cost mismatch: ${devDiff.toLocaleString()} KRW`,
  ```
- **Observed Defect Modes**:
  1. **Contradictory Fail State on 1 KRW Difference**:
     When `executiveSummary.askingPriceKrw = 60_000_000_001` and `detailSchedule.purchasePrice = 60_000_000_000`:
     - `askingPriceDiff = 1 KRW`.
     - `askingPriceDiffPct = 1.6666666666666667e-9%`.
     - Under default `tolerancePct = 0.00`, `askingPriceDiffPct <= 0.00` evaluates to `false`.
     - Because of `&&`, `passed` evaluates to `false`.
     - However, the ternary on line 890 checks `askingPriceDiff <= 1` (`1 <= 1` is `true`), setting:
       `message = 'Executive Asking Price exactly matches Cash Flow Purchase Price.'`
     - Result: `passed` is `false` (overall gate rejected), yet `message` claims exact match!
  2. **Neutralization of Caller-Supplied `tolerancePct`**:
     When a caller explicitly specifies a non-zero tolerance, e.g. `validateProImFinancialConsistency(input, 0.5)` (0.5% tolerance, permitting up to 300M KRW variance on a 60B KRW asset), and an actual difference of 10,000 KRW exists:
     - `diff = 10,000 KRW`.
     - `diffPct = 0.000016% <= 0.5%` (well within tolerance).
     - But `diff <= 1` is `false` (`10000 <= 1` is `false`).
     - Because the expression mandates `&& diff <= 1`, `passed` evaluates to `false`.
     - The `tolerancePct` parameter is completely neutralized and bypassed for any discrepancy greater than 1 KRW.

---

### 1.4 Target Vulnerability 3: SSoT Validator Zero-Division `NaN` in Initial Cap Rate Formula

- **Source File**: `src/domain/building/im-core/pro-financial-model.ts`, lines 916-935
- **Verbatim Code**:
  ```typescript
  916: const derivedCapRatePct = Number(
  917:   (
  918:     (detailSchedule.cashFlowYear1.noi / detailSchedule.cashFlowYear1.purchasePrice) *
  919:     100
  920:   ).toFixed(2)
  921: );
  922: const capRateDiffPp = Math.abs(executiveSummary.initialCapRatePct - derivedCapRatePct);
  923: checks.push({
  924:   checkName: 'Initial Cap Rate Formula Consistency',
  925:   executiveValue: executiveSummary.initialCapRatePct,
  926:   detailValue: derivedCapRatePct,
  927:   discrepancyKrwOrUnit: Number(capRateDiffPp.toFixed(4)),
  928:   discrepancyPct: Number(capRateDiffPp.toFixed(4)),
  929:   tolerancePct: 0.01,
  930:   passed: capRateDiffPp <= 0.01,
  931:   message:
  932:     capRateDiffPp <= 0.01
  933:       ? 'Executive Initial Cap Rate matches derived (NOI / Purchase Price) formula.'
  934:       : `Cap rate mismatch: ${executiveSummary.initialCapRatePct}% vs ${derivedCapRatePct}%`,
  935: });
  ```
- **Empirical Failure Trace**:
  ```text
  FAIL src/tests/adversarial/pro-financial-model-stress.test.ts > §8. SSoT Consistency Validator Boundary Stress > handles zero asking price and zero NOI without throwing
  AssertionError: expected false to be true
  - Expected: true
  + Received: false
  ```
- **Observed Defect Mode**:
  When `detailSchedule.cashFlowYear1.purchasePrice === 0`:
  - `detailSchedule.cashFlowYear1.noi / 0` evaluates to `NaN` (if noi === 0) or `Infinity` (if noi > 0).
  - `derivedCapRatePct` evaluates to `NaN`.
  - `capRateDiffPp = Math.abs(0 - NaN)` evaluates to `NaN`.
  - `passed: capRateDiffPp <= 0.01` evaluates to `false`.
  - `checks` item is populated with `detailValue: NaN`, `discrepancyKrwOrUnit: NaN`, `discrepancyPct: NaN`, and `message: 'Cap rate mismatch: 0% vs NaN%'`.
  - Unhandled `NaN` poison tokens contaminate the validation output, causing false failures on zero-priced/pre-acquisition assets.

---

## 2. Logic Chain

1. **Premise 1 (Poison Token Immunity)**:
   PROJECT.md § Architecture, § Interface Contracts, and § Feature 9 mandate absolute zero tolerance for poison tokens (`NaN`, `undefined`, `null`, `[object Object]`). Any division operation where the denominator can be 0 or negative MUST be guarded.
2. **Premise 2 (Mathematical Consistency Gate Invariant)**:
   In commercial real estate valuation, integer amounts (KRW) rounded to the nearest won frequently carry 0 or 1 KRW rounding artifacts. A difference <= 1 KRW is an exact match. If a caller explicitly defines a percentage tolerance (`tolerancePct > 0`), differences whose percentage error is within that threshold MUST pass.
3. **Step 1 — Deducing the Sensitivity Matrix Fix**:
   - For `baseY1Noi === 0`, percentage change is mathematically undefined. Returning `0.0` prevents `NaN`/`Infinity` and ensures finite values throughout the stress grid.
   - For `baseY1Noi < 0`, the denominator must be absolute magnitude:
     delta% = ((NOI_stressed - NOI_base) / |NOI_base|) * 100
     This guarantees that a worsening loss (e.g. -100M to -150M) produces a negative percentage delta (-50%), preserving directional physical reality.
   - Normalizing `-0` via `Object.is(pct, -0) ? 0.0 : pct` eliminates IEEE-754 signed zero divergence.
4. **Step 2 — Deducing the SSoT Validator Boolean Condition**:
   - The condition must evaluate to `true` if EITHER condition holds:
     `passed = diff <= 1 || (tolerancePct > 0 && diffPct <= tolerancePct);`
   - When `diff <= 1`, it passes as an exact match regardless of `tolerancePct`.
   - When `diff > 1` and `tolerancePct > 0`, it passes if `diffPct <= tolerancePct`.
   - When `diff > 1` and `tolerancePct === 0.00`, it fails.
   - The `message` property must be branch-aligned with `passed`:
     - If `diff <= 1`: Exact match message.
     - If `passed` (via tolerance): Within tolerance message.
     - If `!passed`: Discrepancy detected message.
5. **Step 3 — Deducing the Cap Rate Zero-Division Fix**:
   - When `detailSchedule.cashFlowYear1.purchasePrice === 0`, `derivedCapRatePct` must evaluate safely to `0.0` (not `NaN` or `Infinity`).
   - `safeCapRateDiff = Math.abs(executiveSummary.initialCapRatePct - derivedCapRatePct)`.
   - If both are 0, difference is 0 and check passes cleanly with 0 discrepancy.
   - If executive specifies 4.5% while detail has 0, difference is 4.5%p and check fails cleanly with numbers `4.5% vs 0%` (zero poison tokens).
6. **Step 4 — Deducing Test Suite Interoperability**:
   - Applying these fixes directly solves 2 of the 6 failures in Challenger M1-1's `pro-financial-model-stress.test.ts`.
   - In Challenger M1-2's `m1-2-tenancy-financial-stress.test.ts`, tests in lines 262-345 were authored to document the pre-remediation bugs. Updating those 3 test assertions to verify the remediated positive behavior ensures both test suites pass 100% simultaneously as permanent regression guardians.

---

## 3. Caveats

1. **Worker Implementation Scope**:
   Remediation Explorer M1-2 operates strictly in read-only analysis mode. Source code in `src/domain/building/im-core/pro-financial-model.ts` must be applied by Worker M1.
2. **Other Failures in Challenger M1-1**:
   Challenger M1-1's test suite has 4 additional numerical failures (Newton-Raphson `NaN` rejection, Newton-Raphson `-0` normalization, 100% LTV `averageCashOnCashPct` division by zero, and zero exit cap rate). These are analyzed in detail by peer explorer `remediation_explorer_m1_1` and must be applied together by Worker M1 for a complete 31/31 pass.
3. **Floating Point Mantissa Precision**:
   At the 60B KRW institutional scale, differences < 0.000013 KRW fall below the double-precision machine epsilon (6e10 * 2.22e-16) and naturally evaluate to 0. This is expected IEEE-754 behavior.

---

## 4. Conclusion & Exact Fix Specifications

### 4.1 Specification 1: `generate2DSensitivityMatrix` in `src/domain/building/im-core/pro-financial-model.ts`

**Location**: Lines 640-675

**Code Changes**:
Add a dedicated `calcNoiDeltaPct` helper and update `modCf` and `sevCf` scenario mappings:
```typescript
  const baseY1Noi = baseCf.noi[0];

  const calcNoiDeltaPct = (stressedNoi: number, baseNoi: number): number => {
    const denom = Math.abs(baseNoi);
    if (denom === 0) return 0.0;
    const pct = Number((((stressedNoi - baseNoi) / denom) * 100).toFixed(2));
    return Object.is(pct, -0) ? 0.0 : pct;
  };

  const vacancyStressScenarios: VacancyStressScenario[] = [
    {
      scenarioName: 'Base',
      vacancyRatePct: baseVacancy,
      year1NoiKrw: baseY1Noi,
      noiDeltaPct: 0.0,
      unleveredIrrPct: baseCf.metrics.unleveredIrrPct,
      leveredIrrPct: baseCf.metrics.leveredIrrPct,
      initialCapRatePct: baseCf.metrics.initialCapRatePct,
    },
    {
      scenarioName: 'Moderate',
      vacancyRatePct: modVacancy,
      year1NoiKrw: modCf.noi[0],
      noiDeltaPct: calcNoiDeltaPct(modCf.noi[0], baseY1Noi),
      unleveredIrrPct: modCf.metrics.unleveredIrrPct,
      leveredIrrPct: modCf.metrics.leveredIrrPct,
      initialCapRatePct: modCf.metrics.initialCapRatePct,
    },
    {
      scenarioName: 'Severe',
      vacancyRatePct: sevVacancy,
      year1NoiKrw: sevCf.noi[0],
      noiDeltaPct: calcNoiDeltaPct(sevCf.noi[0], baseY1Noi),
      unleveredIrrPct: sevCf.metrics.unleveredIrrPct,
      leveredIrrPct: sevCf.metrics.leveredIrrPct,
      initialCapRatePct: sevCf.metrics.initialCapRatePct,
    },
  ];
```

---

### 4.2 Specification 2: `validateProImFinancialConsistency` in `src/domain/building/im-core/pro-financial-model.ts`

**Location**: Lines 873-1008

**Code Changes**:
1. **Asking Price Consistency (lines 873-894)**:
   ```typescript
   const askingPriceDiff = Math.abs(
     executiveSummary.askingPriceKrw - detailSchedule.cashFlowYear1.purchasePrice
   );
   const askingPriceDenom = Math.abs(executiveSummary.askingPriceKrw);
   const askingPriceDiffPct =
     askingPriceDenom > 0 ? (askingPriceDiff / askingPriceDenom) * 100 : 0;
   const askingPricePassed =
     askingPriceDiff <= 1 || (tolerancePct > 0 && askingPriceDiffPct <= tolerancePct);
   checks.push({
     checkName: 'Asking Price Consistency',
     executiveValue: executiveSummary.askingPriceKrw,
     detailValue: detailSchedule.cashFlowYear1.purchasePrice,
     discrepancyKrwOrUnit: askingPriceDiff,
     discrepancyPct: Number(askingPriceDiffPct.toFixed(4)),
     tolerancePct,
     passed: askingPricePassed,
     message:
       askingPriceDiff <= 1
         ? 'Executive Asking Price exactly matches Cash Flow Purchase Price.'
         : askingPricePassed
           ? `Executive Asking Price matches Cash Flow Purchase Price within tolerance (${askingPriceDiff.toLocaleString()} KRW, ${askingPriceDiffPct.toFixed(4)}%).`
           : `Discrepancy detected: ${askingPriceDiff.toLocaleString()} KRW (${askingPriceDiffPct.toFixed(2)}%)`,
   });
   ```

2. **Year 1 NOI Consistency (lines 895-914)**:
   ```typescript
   const noiDiff = Math.abs(
     executiveSummary.year1NoiKrw - detailSchedule.cashFlowYear1.noi
   );
   const noiDenom = Math.abs(executiveSummary.year1NoiKrw);
   const noiDiffPct = noiDenom > 0 ? (noiDiff / noiDenom) * 100 : 0;
   const noiPassed = noiDiff <= 1 || (tolerancePct > 0 && noiDiffPct <= tolerancePct);
   checks.push({
     checkName: 'Year 1 NOI Consistency',
     executiveValue: executiveSummary.year1NoiKrw,
     detailValue: detailSchedule.cashFlowYear1.noi,
     discrepancyKrwOrUnit: noiDiff,
     discrepancyPct: Number(noiDiffPct.toFixed(4)),
     tolerancePct,
     passed: noiPassed,
     message:
       noiDiff <= 1
         ? 'Executive Year 1 NOI exactly matches Cash Flow Schedule NOI.'
         : noiPassed
           ? `Executive Year 1 NOI matches Cash Flow Schedule NOI within tolerance (${noiDiff.toLocaleString()} KRW, ${noiDiffPct.toFixed(4)}%).`
           : `Discrepancy detected: ${noiDiff.toLocaleString()} KRW (${noiDiffPct.toFixed(2)}%)`,
   });
   ```

3. **Initial Cap Rate Formula Consistency (lines 915-936)**:
   ```typescript
   const purchasePrice = detailSchedule.cashFlowYear1.purchasePrice;
   const derivedCapRatePct =
     purchasePrice > 0
       ? Number(
           ((detailSchedule.cashFlowYear1.noi / purchasePrice) * 100).toFixed(2)
         )
       : 0.0;
   const capRateDiffPp = Math.abs(
     executiveSummary.initialCapRatePct - derivedCapRatePct
   );
   const safeCapRateDiff = Object.is(capRateDiffPp, -0) ? 0.0 : capRateDiffPp;
   const capRatePassed = safeCapRateDiff <= 0.01;
   checks.push({
     checkName: 'Initial Cap Rate Formula Consistency',
     executiveValue: executiveSummary.initialCapRatePct,
     detailValue: derivedCapRatePct,
     discrepancyKrwOrUnit: Number(safeCapRateDiff.toFixed(4)),
     discrepancyPct: Number(safeCapRateDiff.toFixed(4)),
     tolerancePct: 0.01,
     passed: capRatePassed,
     message:
       capRatePassed
         ? 'Executive Initial Cap Rate matches derived (NOI / Purchase Price) formula.'
         : `Cap rate mismatch: ${executiveSummary.initialCapRatePct}% vs ${derivedCapRatePct}%`,
   });
   ```

4. **Total Rent Consistency (lines 937-958)**:
   ```typescript
   const rentDiff = Math.abs(
     executiveSummary.totalAnnualRentKrw - detailSchedule.tenantRosterTotal.totalAnnualRent
   );
   const rentDenom = Math.abs(executiveSummary.totalAnnualRentKrw);
   const rentDiffPct = rentDenom > 0 ? (rentDiff / rentDenom) * 100 : 0;
   const rentPassed =
     rentDiff <= 1 || (tolerancePct > 0 && rentDiffPct <= tolerancePct);
   checks.push({
     checkName: 'Tenant Roster vs Executive Total Rent Consistency',
     executiveValue: executiveSummary.totalAnnualRentKrw,
     detailValue: detailSchedule.tenantRosterTotal.totalAnnualRent,
     discrepancyKrwOrUnit: rentDiff,
     discrepancyPct: Number(rentDiffPct.toFixed(4)),
     tolerancePct,
     passed: rentPassed,
     message:
       rentDiff <= 1
         ? 'Executive Total Rent exactly matches Tenant Roster Annual Rent sum.'
         : rentPassed
           ? `Executive Total Rent matches Tenant Roster Annual Rent sum within tolerance (${rentDiff.toLocaleString()} KRW, ${rentDiffPct.toFixed(4)}%).`
           : `Rent mismatch: ${rentDiff.toLocaleString()} KRW (${rentDiffPct.toFixed(2)}%)`,
   });
   ```

5. **Total Deposit Consistency (lines 959-980)**:
   ```typescript
   const depositDiff = Math.abs(
     executiveSummary.totalDepositKrw - detailSchedule.tenantRosterTotal.totalDeposit
   );
   const depositDenom = Math.abs(executiveSummary.totalDepositKrw);
   const depositDiffPct = depositDenom > 0 ? (depositDiff / depositDenom) * 100 : 0;
   const depositPassed =
     depositDiff <= 1 || (tolerancePct > 0 && depositDiffPct <= tolerancePct);
   checks.push({
     checkName: 'Tenant Roster vs Executive Deposit Consistency',
     executiveValue: executiveSummary.totalDepositKrw,
     detailValue: detailSchedule.tenantRosterTotal.totalDeposit,
     discrepancyKrwOrUnit: depositDiff,
     discrepancyPct: Number(depositDiffPct.toFixed(4)),
     tolerancePct,
     passed: depositPassed,
     message:
       depositDiff <= 1
         ? 'Executive Deposit exactly matches Tenant Roster Deposit sum.'
         : depositPassed
           ? `Executive Deposit matches Tenant Roster Deposit sum within tolerance (${depositDiff.toLocaleString()} KRW, ${depositDiffPct.toFixed(4)}%).`
           : `Deposit mismatch: ${depositDiff.toLocaleString()} KRW (${depositDiffPct.toFixed(2)}%)`,
   });
   ```

6. **Development Budget Consistency (lines 981-1007)**:
   ```typescript
   if (
     executiveSummary.totalDevelopmentCostKrw !== undefined &&
     detailSchedule.developmentBudgetTotalKrw !== undefined
   ) {
     const devDiff = Math.abs(
       executiveSummary.totalDevelopmentCostKrw -
         detailSchedule.developmentBudgetTotalKrw
     );
     const devDenom = Math.abs(executiveSummary.totalDevelopmentCostKrw);
     const devDiffPct = devDenom > 0 ? (devDiff / devDenom) * 100 : 0;
     const devPassed =
       devDiff <= 1 || (tolerancePct > 0 && devDiffPct <= tolerancePct);
     checks.push({
       checkName: 'Development Feasibility Budget Total Consistency',
       executiveValue: executiveSummary.totalDevelopmentCostKrw,
       detailValue: detailSchedule.developmentBudgetTotalKrw,
       discrepancyKrwOrUnit: devDiff,
       discrepancyPct: Number(devDiffPct.toFixed(4)),
       tolerancePct,
       passed: devPassed,
       message:
         devDiff <= 1
           ? 'Executive Development Cost matches detailed 5-tier budget total.'
           : devPassed
             ? `Executive Development Cost matches detailed 5-tier budget total within tolerance (${devDiff.toLocaleString()} KRW, ${devDiffPct.toFixed(4)}%).`
             : `Development cost mismatch: ${devDiff.toLocaleString()} KRW`,
     });
   }
   ```

---

### 4.3 Specification 3: Regression Test Harmonization in `src/tests/adversarial/m1-2-tenancy-financial-stress.test.ts`

**Location**: Lines 262-345

**Rationale**:
Challenger M1-2 wrote lines 262-345 during the audit to assert the buggy state (`expect(chk.passed).toBe(false)` on 1 KRW, `expect(Number.isNaN(capChk.detailValue)).toBe(true)` on 0 purchase price).
Once Worker M1 fixes `pro-financial-model.ts`, Worker M1 must adjust these 3 assertions to assert the remediated correct state:

1. **Line 262 (1 KRW Difference)**:
   ```typescript
   it('verifies 1 KRW difference passes cleanly as exact match without contradiction', () => {
     const testInput: ProImFinancialConsistencyInput = {
       ...baseInput,
       executiveSummary: {
         ...baseInput.executiveSummary,
         askingPriceKrw: 60_000_000_001, // 1 KRW difference
       },
     };

     const res = validateProImFinancialConsistency(testInput, 0.00);
     const chk = res.checks.find(c => c.checkName === 'Asking Price Consistency')!;

     expect(chk.passed).toBe(true);
     expect(chk.message).toBe('Executive Asking Price exactly matches Cash Flow Purchase Price.');
     expect(res.passed).toBe(true);
   });
   ```

2. **Line 282 (Tolerance Respect)**:
   ```typescript
   it('verifies that tolerancePct > 0 allows discrepancies within threshold', () => {
     const testInput: ProImFinancialConsistencyInput = {
       ...baseInput,
       executiveSummary: {
         ...baseInput.executiveSummary,
         askingPriceKrw: 60_000_010_000, // 10,000 KRW diff
       },
     };

     const res = validateProImFinancialConsistency(testInput, 0.5);
     const chk = res.checks.find(c => c.checkName === 'Asking Price Consistency')!;

     expect(chk.discrepancyPct).toBeLessThan(0.5);
     expect(chk.passed).toBe(true);
     expect(res.passed).toBe(true);
   });
   ```

3. **Line 320 (Zero Purchase Price Poison Guard)**:
   ```typescript
   it('verifies that zero purchasePrice is safely guarded without NaN poison tokens', () => {
     const testInput: ProImFinancialConsistencyInput = {
       ...baseInput,
       detailSchedule: {
         ...baseInput.detailSchedule,
         cashFlowYear1: {
           purchasePrice: 0,
           noi: 0,
           pgi: 0,
         },
       },
     };

     const res = validateProImFinancialConsistency(testInput);
     const capChk = res.checks.find(c => c.checkName === 'Initial Cap Rate Formula Consistency')!;

     expect(Number.isNaN(capChk.detailValue)).toBe(false);
     expect(capChk.detailValue).toBe(0.0);
     expect(Number.isNaN(capChk.discrepancyKrwOrUnit)).toBe(false);
     expect(Number.isNaN(capChk.discrepancyPct)).toBe(false);
     expect(capChk.message).not.toContain('NaN%');
     expect(/NaN/.test(capChk.message ?? '')).toBe(false);
   });
   ```

---

## 5. Verification Method

Once Worker M1 applies the code modifications from `proposed_fixes.patch` and `proposed_m1_2_test.patch`:

1. **Verify Challenger M1-1 Stress Test Suite**:
   ```bash
   npx vitest run src/tests/adversarial/pro-financial-model-stress.test.ts
   ```
   *Expected*: `checks zero NOI in sensitivity matrix` and `handles zero asking price and zero NOI without throwing` PASS.
   *(When combined with Explorer M1-1 fixes for IRR/LTV/ExitCap, all 31/31 tests pass).*

2. **Verify Challenger M1-2 Stress Test Suite**:
   ```bash
   npx vitest run src/tests/adversarial/m1-2-tenancy-financial-stress.test.ts
   ```
   *Expected*: 18/18 tests pass with 0 failures.

3. **Verify Baseline Unit Test Suite**:
   ```bash
   npx vitest run src/tests/unit/pro-financial-model.test.ts
   ```
   *Expected*: 24/24 tests pass with 0 regressions.

4. **Verify Preflight Pipeline Audit**:
   ```bash
   npm run preflight
   ```
   *Expected*: 108/108 tests pass cleanly.

5. **Verify TypeScript Strict Compilation**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected*: Exit code 0, 0 type errors.
