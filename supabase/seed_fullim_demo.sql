-- ============================================================
-- cre-fullim / JS Full IM Studio 데모 시딩 SQL
-- Supabase SQL Editor (cre-dealcard 공유 프로젝트)에서 실행
--
-- 포함 내용:
--   handoff_source_snapshots: 핸드오프 토큰 레코드
--   building_ssot_full: 성수권역 복합 상업시설 B-SSoT
--   im_projects: readiness_score=81 데모 프로젝트
--   im_sections: 18개 섹션 (ai_draft 5개 + needs_expert_patch 2개)
--   expert_profiles: Demo Consultant
--   expert_assignments: NOI 섹션 배정
--   expert_patches: before/after 패치 레코드
--   golden_im_candidates: AI→전문가 패치 후보
-- ============================================================

-- 0. 기존 데모 데이터 초기화 (재실행 안전)
delete from golden_im_candidates  where id = '00000000-0000-0000-0000-000000000070';
delete from expert_patches         where id = '00000000-0000-0000-0000-000000000060';
delete from expert_assignments     where id = '00000000-0000-0000-0000-000000000050';
delete from im_sections            where project_id = '00000000-0000-0000-0000-000000000010';
delete from im_projects            where id = '00000000-0000-0000-0000-000000000010';
delete from building_ssot_full     where id = '00000000-0000-0000-0000-000000000020';
delete from handoff_source_snapshots where id = '00000000-0000-0000-0000-000000000030';
delete from expert_profiles        where id = '00000000-0000-0000-0000-000000000040';

-- 1. 핸드오프 스냅샷
insert into handoff_source_snapshots (
  id, handoff_id, source_app, contracts_version, payload_version,
  source_building_ssot_lite_id, source_objects, import_status
) values (
  '00000000-0000-0000-0000-000000000030',
  'demo-handoff-hof_demo_2026_sungsu_001',
  'js-building-ssot-mvp',
  '1.0.0', '1.0',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '{}',
  'imported'
);

-- 2. Building SSoT Full
insert into building_ssot_full (
  id, source_building_ssot_lite_id,
  created_by,
  asset_identity, physical_fact, legal_registry,
  lease_income, market_location, value_up_hypothesis,
  risk_unknown, buyer_fit, disclosure_gate,
  readiness_status
) values (
  '00000000-0000-0000-0000-000000000020',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  jsonb_build_object(
    'disclosure_name',         '성수권역 복합 상업시설',
    'area_signal',             '성동구 성수권역',
    'gross_area_sqm',          1850,
    'net_leasable_area_sqm',   1320,
    'building_type',           'mixed_use',
    'floors_above_ground',     6,
    'construction_year',       2018,
    'asking_price_krw',        9500000000
  ),
  jsonb_build_object(
    'elevator', true,
    'parking_count', 12,
    'condition_grade', 'B+'
  ),
  jsonb_build_object(
    'land_use_zone',      '일반상업지역',
    'floor_area_ratio',   0.82,
    'registry_confirmed', true
  ),
  jsonb_build_object(
    'lease_count',                  8,
    'anchor_tenant_type',           'F&B',
    'monthly_rent_total_krw',       38000000,
    'operating_expense_monthly_krw',4200000,
    'rent_roll_confirmed',          true
  ),
  jsonb_build_object(
    'district',         '성동구',
    'nearest_subway',   '성수역 도보 3분',
    'commercial_grade', '1급지'
  ),
  jsonb_build_object(
    'vacancy_floor',        '3층 일부',
    'value_add_potential',  'high',
    'repositioning_note',   '3층 공실 해소 시 NOI 15% 상향 가능'
  ),
  jsonb_build_object(
    'main_risk',   '3층 공실 해소 시점 불확실',
    'risk_level',  'medium'
  ),
  jsonb_build_object(
    'target_buyer',     '기관 투자자, 패밀리오피스',
    'min_budget_krw',   8000000000,
    'max_budget_krw',   11000000000
  ),
  jsonb_build_object(
    'gate_level',       'G3',
    'protected_fields', array['exact_address','tenant_name','unit_rent','owner_contact']
  ),
  'lite_imported'
);

-- 3. IM 프로젝트
insert into im_projects (
  id, building_ssot_full_id,
  created_by,
  project_type, target_output, package_intent,
  status, readiness_score,
  title
) values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000000',
  'ai_expert_review',
  'buyer_ready_full_im',
  'ai_expert_review',
  'outline_generated',
  81,
  '성수권역 복합 상업시설 — Full IM Draft'
);

-- 4. 18개 IM 섹션
insert into im_sections (id, project_id, section_type, section_order, title, status, confidence, risk_level, requires_expert_patch, content_json) values
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'cover_confidentiality',              1,  '표지 및 기밀유지 안내',      'planned',            'unknown',        'low',    false, '{}'),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', 'executive_summary',                  2,  '핵심 요약',                  'ai_draft',           'inferred',       'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','본 자산은 성수권역 핵심 상권에 위치한 우량 복합상업시설입니다. 연면적 1,850㎡, 6층 규모로 2018년 리모델링 완료되었으며, F&B 앵커 테넌트를 포함해 8개 임차인이 운영 중입니다.'))))),
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010', 'investment_thesis_buyer_fit',        3,  '투자 논거 및 매수자 적합성', 'ai_draft',           'inferred',       'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','성수권역 급등 지역 내 밸류애드 포텐셜이 높은 기관 투자자 적합 자산입니다. 3층 공실 해소 시 NOI 15% 추가 상승 여력이 있습니다.'))))),
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000010', 'property_fact_sheet',                4,  '물건 기본 팩트 시트',        'ai_draft',           'confirmed',      'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','연면적 1,850㎡ / 대지 350㎡ / 지상 6층 / 2018년 리모델링 / 주차 12대 / 엘리베이터 있음'))))),
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000010', 'location_market_context',            5,  'Location & Market Context',  'ai_draft',           'confirmed',      'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','성수역 도보 3분, 성동구 일반상업지역, 인근 복합문화시설 집적으로 유동인구 급증 중. 2025년 기준 권역 평균 실거래 단가 3,200만원/㎡.'))))),
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000010', 'building_condition_physical_review', 6,  '건물 상태 및 물리적 검토',   'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000010', 'rent_roll_lease_quality',            7,  '임대 현황 및 임대차 품질',   'needs_expert_patch', 'needs_evidence', 'high',   true,  '{}'),
('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000010', 'income_noi_yield_analysis',          8,  '임대수입·NOI·수익률 분석',  'needs_expert_patch', 'needs_evidence', 'high',   true,  jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','NOI는 약 4억원으로 추정되며 수익률이 보장됩니다.'))))),
('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000010', 'operating_expense_noi',              9,  'Operating Expense & NOI',    'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000010', 'valuation_logic_comparables',        10, '가치평가 논리 및 비교사례',  'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000010', 'value_add_repositioning_scenario',   11, '가치상승·리포지셔닝 시나리오','planned',           'unknown',        'low',    false, '{}'),
('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000010', 'debt_sensitivity_cash_flow',         12, '대출 민감도 및 현금흐름',    'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-000000000010', 'risk_factors_dd_checklist',          13, '리스크 요인 및 DD 체크리스트','ai_draft',          'inferred',       'medium', false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','주요 리스크: ① 3층 공실 해소 시점 불확실, ② 앵커테넌트 임대차 만기 2026년 10월. DD 시 임대차계약서 원본 확인 필수.'))))),
('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-000000000010', 'tax_structure_note',                 14, 'Tax Structure Note',         'planned',            'unknown',        'high',   true,  '{}'),
('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0000-000000000010', 'land_zoning_legal_constraints',      15, '토지·용도지역·법적 제약',    'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000116', '00000000-0000-0000-0000-000000000010', 'appendix_evidence_index',            16, '부록: 증거 자료 인덱스',     'planned',            'unknown',        'low',    false, '{}'),
('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0000-000000000010', 'deal_process_next_steps',            17, '딜 프로세스 및 다음 단계',   'ai_draft',           'confirmed',      'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','인수의향서(LOI) 접수 후 상세 자료 제공. 실사(DD) 기간 4주, 계약 체결 목표일 2026년 7월 31일.'))))),
('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0000-000000000010', 'disclaimer_contact',                 18, '면책 사항 및 연락처',        'planned',            'unknown',        'low',    false, '{}')
on conflict (project_id, section_type) do nothing;

-- 5. 전문가 프로필
insert into expert_profiles (id, user_id, expert_role, display_name, organization, status) values (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000000',
  'cre_consultant',
  '김민준 CRE 컨설턴트',
  'JS Advisory',
  'active'
) on conflict do nothing;

-- 6. 전문가 배정
insert into expert_assignments (
  id, project_id, section_id, expert_id, expert_role,
  assignment_type, status, instructions, created_by
) values (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000108', -- income_noi_yield_analysis
  '00000000-0000-0000-0000-000000000040',
  'cre_consultant',
  'section_patch',
  'assigned',
  'NOI 추정치 및 Cap Rate 근거 검토 후 가드레일 준수 여부 확인 요망. "수익률 보장" 표현 반드시 수정 필요.',
  '00000000-0000-0000-0000-000000000000'
) on conflict do nothing;

-- 7. 전문가 패치 (before/after 준비)
insert into expert_patches (
  id, project_id, section_id, expert_id, expert_role,
  patch_type,
  before_text, after_text,
  edit_tags, rationale,
  visibility_after_review,
  status
) values (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000108',
  '00000000-0000-0000-0000-000000000040',
  'cre_consultant',
  'financial_assumption_fix',
  'NOI는 약 4억원으로 추정되며 수익률이 보장됩니다.',
  '공개 임대수익(연간 약 4.56억원) 및 추정 운영비(연간 약 0.5억원) 기준 NOI는 약 4억원 내외로 추정됩니다. 실제 수익률은 임대조건, 공실기간, 운영비 변동에 따라 달라질 수 있으며, 별도 실사를 통해 확인하시기 바랍니다.',
  array['overclaim_removed','risk_balance_added','financial_assumption_added'],
  '"수익률이 보장됩니다" 표현은 부동산거래신고법 위반 소지. 추정치임을 명확히 하고 실사 조건부 문구로 교체.',
  'buyer_ready',
  'approved'
) on conflict do nothing;

-- 8. Golden Dataset 후보
insert into golden_im_candidates (
  id, project_id, section_id,
  section_type,
  ai_draft, expert_revision,
  edit_tags,
  redaction_status, training_rights, review_status
) values (
  '00000000-0000-0000-0000-000000000070',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000108',
  'income_noi_yield_analysis',
  'NOI는 약 4억원으로 추정되며 수익률이 보장됩니다.',
  '공개 임대수익(연간 약 4.56억원) 및 추정 운영비(연간 약 0.5억원) 기준 NOI는 약 4억원 내외로 추정됩니다. 실제 수익률은 임대조건, 공실기간, 운영비 변동에 따라 달라질 수 있으며, 별도 실사를 통해 확인하시기 바랍니다.',
  array['overclaim_removed','risk_balance_added','financial_assumption_added'],
  'redacted',
  'allowed_anonymized',
  'candidate'
) on conflict do nothing;

-- 완료 확인
do $$
begin
  raise notice '✅ cre-fullim 데모 시딩 완료!';
  raise notice '  - IM 프로젝트 ID: 00000000-0000-0000-0000-000000000010';
  raise notice '  - 성수권역 복합 상업시설 (readiness_score=81)';
  raise notice '  - 18개 섹션: ai_draft 5개 / needs_expert_patch 2개 / planned 11개';
  raise notice '  - NOI 섹션 전문가 패치 준비 완료';
  raise notice '';
  raise notice '⚡ 다음 단계:';
  raise notice '  1. studio.credeal.net/im-projects 에서 프로젝트 확인';
  raise notice '  2. 프로젝트 클릭 → Readiness 실행 (81점 확인)';
  raise notice '  3. 18-섹션 아웃라인 → 섹션 상태 확인';
end $$;
