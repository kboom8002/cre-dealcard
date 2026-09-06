# Level 1 Draft - Test Guide

## Bottom Sheet Procedure
1. Posture: `development` 선택, devMode: `hold`
2. Address: `잠원동 26-14` 검색, PNU `1165010700100260014`, `1165010700100260016` 확인
3. Price: `242.27억` (purchaseCost)
4. Land: `616.10㎡` / `186.36평`
5. Zoning: `제2종일반주거지역`

## Expected Output
- Grade: C
- Negative Test: No targetUse or targetScalePyung in development spec, meaning development scale calculation will be blocked.
