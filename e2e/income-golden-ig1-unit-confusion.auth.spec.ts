/**
 * income 실매물 골든 — ig1-dangsan5ga-11-47 (unit-confusion)
 * G9=평 인데 면적 칸에 ㎡ 숫자 → 임포터가 V12(AREA_UNIT_MISMATCH, 연면적의 330.6%)로 차단 →
 * 골든 팩토리가 해제 사유('골든 테스트: 의도된 중개인 면적 오기 재현')를 입력해 해제 → 생성 진행 (렌트롤 v1.5)
 * 실행: npx playwright test e2e/income-golden-ig1-unit-confusion.auth.spec.ts --project=authenticated
 */
import { registerIncomeGolden } from './helpers/income-golden';

registerIncomeGolden('ig1-dangsan5ga-11-47', 'unit-confusion');
