# Test Guide: Dangsan-dong (Level 2)

## Step-by-Step Procedure
1. Select Posture: **Income (수익형)**
2. Address Search: Search for `당산동5가 11-47`. Verify PNU and building name `호산당빌딩`.
3. Financials:
   - Asking Price: 115억 (11,500,000,000 원)
   - Total Deposit: 2억 9,000만원 (290,000,000 원)
   - Monthly Rent: 1,946만원 (19,460,000 원)
   - Mgmt Fee: 285만원 (2,850,000 원)
   - Loan Amount: 46억 (4,600,000,000 원), Status: `confirmed`
4. Vacancy: Click `만실` (Full Occupancy) button.
5. Photos Upload: Upload 3 images (exterior, entrance, lobby). Need to add 2 more placeholders if prompt requires up to 5, but 3 satisfies minimum for Grade B.
6. Rent Roll Upload: Upload the provided rent roll excel file (.xlsx).

## Expected Results
- **Quality Grade**: `B`
- **Generated Sections**: Address, Price, Basic Rent Roll, Financial Details, Photos (3+).
- **Expected Gates**:
  - G04 (Address Validated) - PASS
  - G26 (Min 3 Photos) - PASS
  - G40 (LTV/Financial Check) - WARNING (if leverage implies negative yield or high risk)
