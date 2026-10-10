/**
 * income 실매물 골든 — ig1-dangsan5ga-11-47 (corrected-pyeong)
 * corrected 와 같은 데이터, 렌트롤 xlsx 만 G9=평 (면적 칸 = ㎡ ÷ 3.305785, 소수 2자리) — 평 입력 표기 시험 (렌트롤 v1.5)
 * 실행: npx playwright test e2e/income-golden-ig1-corrected-pyeong.auth.spec.ts --project=authenticated
 */
import { registerIncomeGolden } from './helpers/income-golden';

registerIncomeGolden('ig1-dangsan5ga-11-47', 'corrected-pyeong');
