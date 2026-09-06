# Test Guide: Dangsan-dong (Level 3)

## Step-by-Step Procedure
1. Select Posture: **Income (수익형)**
2. Address Search: `당산동5가 11-47`. Verify PNU and building name `호산당빌딩`.
3. Financials:
   - Asking Price: 115억 (11,500,000,000 원)
   - Total Deposit: 2억 9,000만원 (290,000,000 원)
   - Monthly Rent: 1,946만원 (19,460,000 원)
   - Mgmt Fee: 285만원 (2,850,000 원)
   - Loan Amount: 46억 (4,600,000,000 원), Status: `confirmed`
4. Vacancy: Click `만실` (Full Occupancy) button. (Self-use B1 and 4F partial are counted as occupied).
5. Photos Upload: Upload 4 images (exterior, aerial, entrance, lobby).
6. Rent Roll Upload: Upload full rent roll with complete lease start/end dates.
7. Manual Comps: Input 3 nearby manual comps.

## Expected Results
- **Quality Grade**: `A`
- **Expected Gates**:
  - G04 (Address Validated)
  - C19 (Area Discrepancy) - Blocking check for discrepancy between 1141.15㎡ and 1441.15㎡
  - G40 (LTV / Negative Leverage) - Warning check

## Negative Test Scenarios
1. **Area discrepancy 1141 vs 1441**: Expected cross-validation warning or C19 block.
2. **4F lease expired (2025-04-30)**: Expected renewal risk flag because the date has passed or is imminent.
3. **LTV 50% negative leverage**: Verify G40 warning is triggered if yield is lower than loan interest.
4. **Group B integrated contract**: Verify no double-counting of 1F and 2F deposit/rent (14,000 / 883).
5. **Self-use units excluded from vacancy**: Verify vacancy rate stays exactly at 0.0% even with owner-occupied units.
