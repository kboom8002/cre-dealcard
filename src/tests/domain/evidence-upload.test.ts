import { describe, test, expect } from 'vitest';
import { computeCompletenessAfterUpload } from '@/domain/building/evidence-upload';

describe('A2: Evidence File Upload Domain', () => {

  test('A2-01: 등기부등본 업로드 시 completeness +20', () => {
    const mockCurrentScore = 0;
    const newScore = computeCompletenessAfterUpload(
      mockCurrentScore,
      'building_register',
      [] // 기존 카테고리 없음
    );
    expect(newScore).toBe(20);
  });

  test('A2-02: 중복 카테고리 업로드 시 점수 중복 가산 안 됨', () => {
    const mockCurrentScore = 20; // 이미 등기부등본 있음
    const newScore = computeCompletenessAfterUpload(
      mockCurrentScore,
      'building_register',
      ['building_register'] // 이미 해당 카테고리 있음
    );
    expect(newScore).toBe(20); // 변화 없어야 함
  });

  test('A2-03: 임대차 현황 업로드 시 completeness +25', () => {
    const score = computeCompletenessAfterUpload(0, 'rent_roll', []);
    expect(score).toBe(25);
  });

  test('A2-04: 모든 카테고리 업로드 시 합계 100', () => {
    const categories = [
      'building_register', 'registry_docs', 'land_use_plan',
      'rent_roll', 'photos', 'floor_plan', 'repair_history',
      'vacancy_docs', 'asking_price', 'disclosure_policy'
    ] as const;
    let score = 0;
    const uploaded: string[] = [];
    for (const cat of categories) {
      score = computeCompletenessAfterUpload(score, cat, uploaded);
      uploaded.push(cat);
    }
    expect(score).toBe(100);
  });
});
