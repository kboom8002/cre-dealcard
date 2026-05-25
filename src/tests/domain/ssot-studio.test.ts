import { describe, test, expect } from 'vitest';
import { computeLayerScore, getEligibleOutputs } from '@/domain/building/layer-score-engine';
import { validateDisclosurePrefs } from '@/domain/building/disclosure-guard';
import { buildLeaseSummaryFromInput } from '@/domain/building/lease-normalizer';
import { DisclosurePrefs } from '@/types/database';

describe('A1: SSoT Studio Pro - Data Model', () => {

  test('A1-01: 레이어 점수가 0-100 범위 내', () => {
    const checklist = {
      buildingRegister: true,   // +20
      registry: true,            // +15
      landUsePlan: false,
      rentRoll: true,            // +25
      photos: false,
      floorPlan: false,
      repairHistory: false,
      vacancyStatus: false,
      askingPrice: false,
      disclosurePolicy: true,    // +5
    };
    const scores = computeLayerScore(checklist);
    expect(scores.total).toBe(65);
    expect(scores.total).toBeGreaterThanOrEqual(0);
    expect(scores.total).toBeLessThanOrEqual(100);
    expect(scores.building_register).toBe(20);
    expect(scores.rent_roll).toBe(25);
  });

  test('A1-02: 모든 체크시 합계 100', () => {
    const allChecked = {
      buildingRegister: true,   // +20
      registry: true,            // +15
      landUsePlan: true,         // +10
      rentRoll: true,            // +25
      photos: true,              // +10
      floorPlan: true,           // +10
      repairHistory: true,       // +5
      vacancyStatus: true,       // +5
      askingPrice: true,         // +0 (Asking price not counted for public completeness, wait, in implementation plan we defined layer weights)
      disclosurePolicy: true,    // +0 (disclosurePolicy not counted or maybe it's counted? Let's check weights:
      // building_register: 20
      // registry_docs: 15
      // land_use_plan: 10
      // rent_roll: 25
      // photos: 10
      // floor_plan: 10
      // repair_history: 5
      // vacancy_docs: 5
      // asking_price: 5, disclosure_policy: 5 -> total 110. Let's normalize it so we can easily get 100.)
    };
    // Let's check:
    // building_register: 20
    // registry_docs: 15
    // land_use_plan: 10
    // rent_roll: 25
    // photos: 10
    // floor_plan: 10
    // repair_history: 5
    // vacancy_docs: 5
    // asking_price: 0 (Let's make asking_price 0 or 5?)
    // Let's design layer-score-engine weights to sum exactly to 100:
    // building_register: 20
    // registry_docs: 15
    // land_use_plan: 10
    // rent_roll: 25
    // photos: 10
    // floor_plan: 10
    // repair_history: 5
    // vacancy_docs: 5
    // Let's check total: 20 + 15 + 10 + 25 + 10 + 10 + 5 + 5 = 100. That's exactly 100! Beautiful!
    // So askingPrice and disclosurePolicy can be 0 or separate checks. Let's make sure the scores map to these exactly.
    const scores = computeLayerScore({
      buildingRegister: true,
      registry: true,
      landUsePlan: true,
      rentRoll: true,
      photos: true,
      floorPlan: true,
      repairHistory: true,
      vacancyStatus: true,
    });
    expect(scores.total).toBe(100);
  });

  test('A1-03: 공개 범위 미설정 시 Teaser 생성 불가', () => {
    const prefs: Partial<DisclosurePrefs> = {
      hide_exact_address: false, // 위험!
    };
    const result = validateDisclosurePrefs(prefs as DisclosurePrefs);
    expect(result.canGenerateTeaser).toBe(false);
    expect(result.violations).toContain('exact_address_not_hidden');
  });

  test('A1-04: 임대차 요약 정규화 - 민감 필드 분리', () => {
    const rawInput = [
      { floor: '1F', area_sqm: 120, monthly_rent: 5000000, deposit: 50000000, tenant_type: 'retail', contract_end: '2026-06', is_anchor: true, tenant_name: '스타벅스' }
    ];
    const summary = buildLeaseSummaryFromInput(rawInput);
    // public 레이어는 rent 노출 안 함
    const publicLayer = summary.publicLayer;
    expect(publicLayer.tenants[0]).not.toHaveProperty('monthly_rent');
    expect(publicLayer.tenants[0]).not.toHaveProperty('deposit');
    expect(publicLayer.tenants[0]).not.toHaveProperty('tenant_name');
    expect(publicLayer.vacancy_rate).toBeDefined();
    // private truth는 보존
    expect(summary.privateLayer.tenants[0].monthly_rent).toBe(5000000);
    expect(summary.privateLayer.tenants[0].tenant_name).toBe('스타벅스');
  });

  test('A1-05: 등급별 출력 문서 목록 매핑', () => {
    expect(getEligibleOutputs(10)).toEqual([]);
    expect(getEligibleOutputs(25)).toEqual(['deal_curiosity_report']);
    expect(getEligibleOutputs(50)).toEqual(['deal_curiosity_report', 'blind_teaser']);
    expect(getEligibleOutputs(70)).toEqual(['deal_curiosity_report', 'blind_teaser', 'building_snapshot_draft']);
    expect(getEligibleOutputs(90)).toEqual(['deal_curiosity_report', 'blind_teaser', 'building_snapshot_draft', 'im_lite']);
    expect(getEligibleOutputs(100)).toEqual(['deal_curiosity_report', 'blind_teaser', 'building_snapshot_draft', 'im_lite', 'full_im_candidate']);
  });
});
