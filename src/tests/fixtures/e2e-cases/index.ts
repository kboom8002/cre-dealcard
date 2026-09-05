import { CASE_01_SPEC, type TestCaseSpec } from './case01-seocho-medical';
import { CASE_02_SPEC } from './case02-seongsu-hq';
import { CASE_03_SPEC } from './case03-yeoksam-dev';
import { CASE_04_SPEC } from './case04-sinsa-value-add';
import { CASE_05_SPEC } from './case05-icheon-logistics';
import { CASE_06_SPEC } from './case06-yongsan-mixed';

export type { TestCaseSpec };

export {
  CASE_01_SPEC,
  CASE_02_SPEC,
  CASE_03_SPEC,
  CASE_04_SPEC,
  CASE_05_SPEC,
  CASE_06_SPEC,
};

export const ALL_E2E_CASES: TestCaseSpec[] = [
  CASE_01_SPEC,
  CASE_02_SPEC,
  CASE_03_SPEC,
  CASE_04_SPEC,
  CASE_05_SPEC,
  CASE_06_SPEC,
];
