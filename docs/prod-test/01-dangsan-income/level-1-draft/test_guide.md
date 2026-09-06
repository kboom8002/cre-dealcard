# Test Guide: Dangsan-dong (Level 1)

## Step-by-Step Procedure
1. Select Posture: **Income (수익형)**
2. Address Search: Search for `당산동5가 11-47`. Verify PNU `1156011500100110047` and building name `호산당빌딩`.
3. Financials:
   - Asking Price: 115억 (11,500,000,000 원)
   - Total Deposit: 2억 9,000만원 (290,000,000 원)
   - Monthly Rent: 1,946만원 (19,460,000 원)
4. Vacancy: Click `만실` (Full Occupancy) button.
5. Skip optional fields:
   - Mgmt Fee: Skip
   - Loan: Skip
   - Photos: Skip
   - Rent Roll: Skip

## Expected Results
- **Quality Grade**: `C`
- **Generated Sections**: Basic L1 sections (Address, PNU, Price only).
- **Suppressed Sections**: Rent roll, Photos, detailed financials.
- **Negative Test**: Attempt to upgrade to Pro tier. It should fail due to missing required data (no photos, no rent roll). G26 (min 3 photos) would normally block Pro tier.
