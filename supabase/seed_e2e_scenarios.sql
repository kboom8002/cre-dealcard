-- ============================================================
-- seed_e2e_scenarios.sql
-- cre-dealcard 꼬마빌딩 브로커 10대 시나리오 E2E 시딩
-- https://credeal.net 프로덕션 환경 테스트용
--
-- 데모 계정 (Supabase Auth 사전 생성 완료):
--   demo-broker@credeal.net   / Demo2026!Broker   (broker)  UUID: 702b8438-5dbc-4006-a0d0-909cfb00c36f
--   demo-broker2@credeal.net  / Demo2026!Broker2  (broker)  UUID: 4b4b5b94-cab9-4014-9486-7ec230b04eae
--   demo-admin@credeal.net    / Demo2026!Admin    (admin)   UUID: 771f8962-0dc4-44fb-b73d-462f817becb6
--   demo-public@credeal.net   / Demo2026!Public   (public)  UUID: 91a84de4-c4ca-4ed5-a4ab-94471fbc4cf0
--
-- 실행: Supabase Dashboard > SQL Editor > service_role 권한
-- 태그: [E2E] — 기존 [DEMO] 태그 데이터 교체
-- ============================================================

-- ================================================================
-- [STEP 0] 기존 DEMO/E2E 데이터 클린업
-- ================================================================

-- 의존성 역순으로 삭제
delete from match_failure_logs
  where match_result_id in (
    select id from match_results
    where building_ssot_lite_id in (
      select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
    )
  );

delete from pipeline_stage_transitions
  where building_ssot_lite_id in (
    select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
  );

delete from deal_pipeline_states
  where building_ssot_lite_id in (
    select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
  );

delete from match_results
  where building_ssot_lite_id in (
    select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
  );

delete from document_objects
  where building_id in (
    select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
  );

delete from building_signal_cards
  where building_id in (
    select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
  );

delete from owner_readiness_checks
  where building_id in (
    select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
  );

delete from gate_requests
  where building_id in (
    select id from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%'
  );

delete from activity_events where metadata->>'demo' = 'true' or metadata->>'tag' = 'E2E';

delete from building_ssot_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%';
delete from buyer_intent_lite where raw_input like '%[E2E]%' or raw_input like '%[DEMO]%';

-- 브로커 귀속 데이터 (데모 브로커 계정 기준)
delete from contact_history
  where broker_id in ('702b8438-5dbc-4006-a0d0-909cfb00c36f','4b4b5b94-cab9-4014-9486-7ec230b04eae');

delete from lease_match_results
  where lease_space_id in (
    select id from lease_spaces
    where broker_id in ('702b8438-5dbc-4006-a0d0-909cfb00c36f','4b4b5b94-cab9-4014-9486-7ec230b04eae')
  );

delete from tenant_intent
  where broker_id in ('702b8438-5dbc-4006-a0d0-909cfb00c36f','4b4b5b94-cab9-4014-9486-7ec230b04eae');

delete from lease_spaces
  where broker_id in ('702b8438-5dbc-4006-a0d0-909cfb00c36f','4b4b5b94-cab9-4014-9486-7ec230b04eae');

delete from broker_clients
  where broker_id in ('702b8438-5dbc-4006-a0d0-909cfb00c36f','4b4b5b94-cab9-4014-9486-7ec230b04eae');

delete from market_leading_indicators where region like '%[E2E]%';

-- ================================================================
-- [STEP 1] 변수 선언 (UUID 고정)
-- ================================================================
-- 브로커1: 이중개 (demo-broker@credeal.net)
-- 브로커2: 박팀장 (demo-broker2@credeal.net)
-- 브로커1 UUID: 702b8438-5dbc-4006-a0d0-909cfb00c36f
-- 브로커2 UUID: 4b4b5b94-cab9-4014-9486-7ec230b04eae

-- ================================================================
-- [STEP 2] 매물 SSoT 6건 시딩
-- 시나리오 #1 성수동 꼬마빌딩 (메인 딜카드 데모)
-- 시나리오 #6 건물 스튜디오 심화
-- 시나리오 #7 Owner Readiness 대상
-- 시나리오 #8 이 건물 딜 될까? 결과
-- + 대시보드 목록 풍성화용 2건
-- ================================================================

insert into building_ssot_lite (
  id, owner_id, created_by_role, input_type, raw_input,
  area_signal, asset_type, price_band, size_signal,
  current_use_signal, vacancy_signal,
  fit_summary, caution_summary, hidden_fields,
  layers, confidence, disclosure, status,
  lease_summary, layer_scores, disclosure_prefs,
  completeness_score, matched_buyer_count, promotion_score
)
values
-- [E2E-B1] 시나리오 #1,#3,#6 성수동 꼬마빌딩 (브로커1 소유)
(
  'e2e00000-0001-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'broker', 'broker_memo',
  '[E2E] 성수동 꼬마빌딩 | 대지 150평, 연면적 280평, 지상 4층 | 1층 F&B 임차(A카페, 월세 400) | 2~4층 사무 공실 | 엘리베이터 없음 | 2018년 전면 리모델링 | 주차 3대 | 매도인 양도세 이슈 급매 | 호가 78억 협의가능 | 주소 블라인드 요청',
  '성수동', '꼬마빌딩(근생+사무)', '70억~78억',
  '대지 150평 / 연면적 280평 / 지상 4층',
  '1층 F&B 카페 임차 중, 2~4층 사무 공실',
  '부분 공실 (2~4층)',
  '1층 고정 임대수익 선호 투자자, 사옥+임대 겸용 법인, 성수권역 꼬마빌딩 매수 경험자',
  '엘리베이터 없음(사무 임차 유치 제약), 2~4층 공실(단기 수익률 영향), 매도인 양도세 이슈(계약 구조 사전 검토 필요)',
  ARRAY['exact_address','seller_motivation','unit_rent'],
  jsonb_build_object(
    'location', jsonb_build_object(
      'district','성동구','neighborhood','성수동',
      'nearbyLandmarks', ARRAY['뚝섬역 도보 7분','성수 카페거리 인근','서울숲 도보 15분'],
      'transportScore', 72
    ),
    'building', jsonb_build_object(
      'landArea','150평','totalFloorArea','280평','floors',4,
      'builtYear',2018,'lastRenovation','2018년 전면 리모델링',
      'parkingSpots',3,'elevator',false,'condition','A-'
    ),
    'financials', jsonb_build_object(
      'askingPrice','78억','estimatedMarketPrice','70~73억',
      'grossYield','약 3.2% (1층 기준)','annualRent1F','4,800만원'
    ),
    'lease', jsonb_build_object(
      'floor1','F&B 카페(계약 만료 2026.12)','floor2to4','공실(사무용도)'
    )
  ),
  jsonb_build_object('overall',0.78,'price',0.82,'location',0.91,'lease',0.65),
  jsonb_build_object('addressBlind',true,'tenantBlind',true,'pricePublic',true),
  'public_signal_ready',
  jsonb_build_object(
    'tenants', jsonb_build_array(
      jsonb_build_object(
        'floor','1F','area_sqm',82,'tenant_type','f_and_b',
        'monthly_rent',400,'deposit',5000,'contract_end','2026-12',
        'is_anchor',true,'tenant_name',null
      ),
      jsonb_build_object(
        'floor','2F','area_sqm',75,'tenant_type','vacant',
        'monthly_rent',null,'deposit',null,'contract_end',null,
        'is_anchor',false,'tenant_name',null
      ),
      jsonb_build_object(
        'floor','3F','area_sqm',75,'tenant_type','vacant',
        'monthly_rent',null,'deposit',null,'contract_end',null,
        'is_anchor',false,'tenant_name',null
      ),
      jsonb_build_object(
        'floor','4F','area_sqm',75,'tenant_type','vacant',
        'monthly_rent',null,'deposit',null,'contract_end',null,
        'is_anchor',false,'tenant_name',null
      )
    ),
    'walt_months',5,
    'vacancy_rate',75,
    'gross_income_estimate',57600000
  ),
  jsonb_build_object(
    'building_register',20,'registry_docs',15,'land_use_plan',10,
    'rent_roll',18,'photos',10,'floor_plan',8,'repair_history',5,
    'vacancy_docs',5,'asking_price',5,'disclosure_policy',5,'total',101
  ),
  jsonb_build_object(
    'show_area_signal',true,'show_asset_type',true,'show_price_band',true,
    'show_tenant_count',true,'show_walt',false,'show_vacancy_rate',true,
    'hide_exact_address',true,'hide_tenant_names',true,'hide_unit_rent',true
  ),
  81, 3, 82
),

-- [E2E-B2] 시나리오 #8 공개 리포트용 (마포 합정 근생)
(
  'e2e00000-0001-0001-0001-000000000002',
  null,
  'public_user', 'address',
  '[E2E] 마포 합정 근생 | 대지 85평 3층 | 전층 임차 중 | 카페+미용실+사무 | 45억 | 매도인 이사 결정',
  '합정동', '근린생활시설', '43억~47억',
  '대지 85평 / 연면적 170평 / 지상 3층',
  '전층 임차 (카페·미용실·사무)',
  '없음(전층 임차)',
  '완전 임차 안정 수익물건 선호 투자자, 수익률 4%+ 소형 빌딩 투자자',
  '매도 타이밍 이슈, 노후화 리모델링 비용 예산 필요, 공동 소유 구조 확인 필요',
  ARRAY['exact_address'],
  '{}'::jsonb,
  jsonb_build_object('overall',0.71,'price',0.80,'location',0.75,'lease',0.90),
  jsonb_build_object('addressBlind',true,'tenantBlind',false,'pricePublic',true),
  'public_signal_ready',
  null,
  jsonb_build_object(
    'building_register',20,'registry_docs',15,'land_use_plan',10,
    'rent_roll',25,'photos',8,'floor_plan',0,'repair_history',0,
    'vacancy_docs',5,'asking_price',5,'disclosure_policy',0,'total',88
  ),
  null,
  88, 1, 68
),

-- [E2E-B3] 시나리오 #6 스튜디오 심화 / 강남 역삼 오피스
(
  'e2e00000-0001-0001-0001-000000000003',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'broker', 'broker_memo',
  '[E2E] 강남 역삼 꼬마빌딩 | 대지 120평 4층 | 사옥 매수 타겟 | 전층 오피스 일부 공실 | 120억',
  '역삼동', '꼬마빌딩(오피스)', '115억~125억',
  '대지 120평 / 연면적 380평 / 지상 4층',
  '전층 사무실 (1~2층 임차, 3~4층 공실)',
  '부분 공실 (3~4층)',
  '강남 사옥 수요 법인, 오피스 투자 기관, GBD 선호 패밀리오피스',
  '가격대 높음(사옥 수요 한정적), 주차 8대이나 인근 경쟁 주차 많음, 공시지가 대비 수익률 낮음',
  ARRAY['exact_address','seller_motivation'],
  jsonb_build_object(
    'location', jsonb_build_object(
      'district','강남구','neighborhood','역삼동',
      'nearbyLandmarks', ARRAY['선릉역 도보 3분','테헤란로 대로변'],
      'transportScore', 95
    ),
    'building', jsonb_build_object(
      'landArea','120평','totalFloorArea','380평','floors',4,
      'builtYear',2015,'parkingSpots',8,'elevator',true
    )
  ),
  jsonb_build_object('overall',0.62,'price',0.70,'location',0.95,'lease',0.45),
  jsonb_build_object('addressBlind',true,'tenantBlind',false,'pricePublic',true),
  'public_signal_ready',
  null, null, null,
  62, 0, 41
),

-- [E2E-B4] 시나리오 #7 Owner Readiness용 (용산 한강로)
(
  'e2e00000-0001-0001-0001-000000000004',
  '91a84de4-c4ca-4ed5-a4ab-94471fbc4cf0',
  'public_user', 'manual_form',
  '[E2E] 용산 한강로 근생빌딩 | 대지 95평 5층 | 4층 일부 공실 | 건물주 직접 매각 검토 | 65억',
  '한강로동', '근린생활시설', '62억~68억',
  '대지 95평 / 연면적 240평 / 지상 5층',
  '1~3층 임차, 4층 일부 공실, 5층 건물주 사용',
  '일부 공실 (4층 30%)',
  '임대+사옥 겸용 구매자, 용산 정비사업 기대 투자자',
  '5층 건물주 퇴거 일정 미확정, 4층 공실 해소 시점 불확실, 건물 외벽 수선 필요',
  ARRAY['asking_price'],
  '{}'::jsonb,
  jsonb_build_object('overall',0.55,'price',0.60,'location',0.80,'lease',0.58),
  '{}'::jsonb,
  'draft',
  null, null, null,
  55, 0, 35
),

-- [E2E-B5] 대시보드 목록용 (성북 길음)
(
  'e2e00000-0001-0001-0001-000000000005',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'broker', 'broker_memo',
  '[E2E] 성북 길음 상가주택 | 대지 70평 3층 | 1층 편의점 임차 | 26억',
  '길음동', '상가주택', '24억~28억',
  '대지 70평 / 연면적 150평 / 지상 3층',
  '1층 편의점, 2~3층 주거',
  '없음',
  '수익형 소형 빌딩 첫 구매자, 강북 선호 안정수익형 투자자',
  '주거 임차인 보호 이슈, 편의점 계약 만료 2027.03, 건물 노후화',
  ARRAY['exact_address'],
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'public_signal_ready',
  null, null, null,
  55, 1, 58
),

-- [E2E-B6] 대시보드 목록용 (광진 건대입구)
(
  'e2e00000-0001-0001-0001-000000000006',
  '4b4b5b94-cab9-4014-9486-7ec230b04eae',
  'broker', 'broker_memo',
  '[E2E] 광진 건대입구 복합 상업 | 대지 200평 5층 | 1~2층 리테일 3~5층 사무 | 98억',
  '화양동', '복합상업시설', '95억~103억',
  '대지 200평 / 연면적 580평 / 지상 5층',
  '1~2층 리테일(카페·편의점), 3~5층 사무(IT기업 임차)',
  '없음(전층 임차)',
  '기관 투자자, 패밀리오피스, 건대권역 선호 중형 빌딩 투자자',
  '앵커테넌트 만기 2026.06, 리테일 업종 변경 리스크, 높은 유지관리비',
  ARRAY['exact_address','unit_rent'],
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'public_signal_ready',
  null, null, null,
  71, 2, 75
)
on conflict (id) do update set
  raw_input = excluded.raw_input,
  area_signal = excluded.area_signal,
  asset_type = excluded.asset_type,
  price_band = excluded.price_band,
  status = excluded.status,
  updated_at = now();


-- ================================================================
-- [STEP 3] 블라인드 티저 + 딜 호기심 리포트 문서 시딩
-- ================================================================

insert into document_objects (
  id, owner_id, source_type, source_id, building_id,
  document_type, visibility, status, title, body, markdown
)
values
-- [E2E-B1] 블라인드 티저 (시나리오 #1)
(
  'e2e00000-0002-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'building_ssot_lite',
  'e2e00000-0001-0001-0001-000000000001',
  'e2e00000-0001-0001-0001-000000000001',
  'blind_teaser', 'public_blind', 'broker_reviewed',
  '성수 뚝섬역권 꼬마빌딩 — 1층 고정수입 + 공실 밸류애드',
  jsonb_build_object(
    'title', '성수 뚝섬역권 꼬마빌딩 — 1층 고정수입 + 공실 밸류애드',
    'shortSummary', '뚝섬역 도보 7분, 2018년 리모델링 완료 4층 꼬마빌딩. 1층 F&B 앵커 테넌트로 월세 400만원 고정 확보, 2~4층 공실은 직접 활용하거나 추가 임대로 전환 가능. 급매 조건으로 시세 대비 5~8% 할인 기회.',
    'dealPoints', ARRAY[
      '1층 F&B 앵커 임차 고정 (월 400만원 / 계약 2026.12 보장)',
      '2018년 전면 리모델링 완료 — 즉시 입주 가능 컨디션',
      '뚝섬역 도보 7분, 성수 카페거리 핵심 배후지',
      '대지 150평 / 연면적 280평 — 성수동 꼬마빌딩 평균 대비 20% 큰 규모',
      '급매 사유 명확 (매도인 사정) — 호가 78억 대비 70~73억 협의 가능'
    ],
    'cautionPoints', ARRAY[
      '엘리베이터 없음 — 사무 임차 유치 시 제약 요인',
      '2~4층 공실 상태 — 단기 수익률 직접 영향',
      '매도인 세금 관련 이슈 — 계약 구조 사전 전문가 검토 필요'
    ],
    'hiddenInfoNotice', ARRAY[
      '정확한 주소는 G1 관심 등록 후 확인 가능합니다.',
      '매도인 사정 및 협상 조건은 담당 중개인 문의 바랍니다.',
      '호실별 임대료 세부 내역은 G2 인증 후 제공됩니다.'
    ],
    'gateMessage', 'AI 초안 · 브로커 검토 완료',
    'kakaoText', E'[JS부동산 블라인드 딜]\n\n📍 성수권역 꼬마빌딩 (주소 블라인드)\n💰 70억~78억 (급매 협의)\n🏢 지상 4층 / 대지 150평 / 연면적 280평\n☕ 1층 F&B 임차 (월 400만원 고정)\n📋 2~4층 공실 (사옥 활용 or 추가 임대)\n\n✅ 2018 리모델링 완료\n✅ 뚝섬역 도보 7분\n⚠️ 엘베 없음 / 세금 이슈 사전 확인 필요\n\n관심 있으시면 연락 주세요.',
    'boundaryNote', '이 자료는 공개 데이터와 중개인 입력 정보를 바탕으로 AI가 초안 작성한 예비 검토 자료입니다. 가격, 수익률, 세금, 법률 사항은 전문가 확인이 필요하며 투자 판단의 유일한 근거로 사용하지 마십시오.'
  ),
  E'## 성수 뚝섬역권 꼬마빌딩\n\n**1층 고정수입 + 공실 밸류애드 기회**\n\n> 뚝섬역 도보 7분 | 대지 150평 | 70억~78억\n\n### 딜 포인트\n- 1층 F&B 임차 월 400만원 고정\n- 2018년 전면 리모델링 완료\n- 급매 조건 — 시세 대비 5~8% 할인 가능\n\n### 유의사항\n- 엘리베이터 없음\n- 2~4층 공실\n- 세금 이슈 사전 확인 필요'
),
-- [E2E-B1] 딜 호기심 리포트 (시나리오 #8)
(
  'e2e00000-0002-0001-0001-000000000002',
  null,
  'building_ssot_lite',
  'e2e00000-0001-0001-0001-000000000002',
  'e2e00000-0001-0001-0001-000000000002',
  'deal_curiosity_report', 'public', 'disclosure_checked',
  '합정동 근생 — 딜 될까? 리포트',
  jsonb_build_object(
    'oneDiagnosis', '완전 임차 안정 수익형 물건. 수익률 4.1% 수준으로 마포권 꼬마빌딩 평균(3.5~4.0%)을 소폭 상회. 매도인의 신속 매각 의지가 확인되어 협상 여지 있음.',
    'riskQuestions', ARRAY[
      '3개 임차인의 계약 만기 구조와 동시 만료 리스크는?',
      '건물 외벽 노후화 정도와 예상 수선비 규모는?',
      '공동 소유 구조 여부 및 의사결정 지연 가능성은?',
      '매도인의 양도세 부담 구조가 가격 협상에 미치는 영향은?'
    ],
    'dealScore', 68,
    'signalSummary', '전층 임차 안정성 고점, 리모델링 필요 가능성 있음, 마포 선호 수요 탄탄',
    'disclaimer', '이 리포트는 투자 추천이 아니며, 가격을 보장하지 않습니다.'
  ),
  E'# 합정동 근생 — 딜 될까?\n\n## 한 줄 진단\n완전 임차 안정 수익형 물건. 수익률 4.1%로 마포권 평균 상회.\n\n## 리스크 질문\n1. 3개 임차인 계약 만기 구조?\n2. 외벽 노후화 및 수선비 규모?\n3. 공동 소유 여부?\n4. 매도인 양도세 협상 영향?'
),
-- [E2E-B3] 역삼 블라인드 티저 (스튜디오용)
(
  'e2e00000-0002-0001-0001-000000000003',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'building_ssot_lite',
  'e2e00000-0001-0001-0001-000000000003',
  'e2e00000-0001-0001-0001-000000000003',
  'blind_teaser', 'public_blind', 'draft',
  '강남 선릉역권 꼬마빌딩 — 사옥 또는 프라임 오피스 투자',
  jsonb_build_object(
    'title', '강남 선릉역권 꼬마빌딩 — 사옥 또는 프라임 오피스 투자',
    'shortSummary', '선릉역 도보 3분 테헤란로 인근. 4층 오피스 빌딩, 주차 8대. 1~2층 임차 중, 3~4층 사옥 활용 또는 추가 임차 유치 가능.',
    'dealPoints', ARRAY[
      '선릉역 도보 3분 테헤란로 초역세권',
      '주차 8대 — GBD 오피스 빌딩 중 최상위 수준',
      '엘리베이터 있음, 층고 3.8m 개방감 우수',
      '1~2층 현재 임차 중 (안정 수입 확보)'
    ],
    'cautionPoints', ARRAY[
      '3~4층 공실 — 사옥 전용 또는 임차 유치 필요',
      '120억 이상 — 사옥 수요 법인 타겟, 매수층 한정',
      '주변 대형 오피스 빌딩 대비 소규모 (독립 운영 비용 고려)'
    ],
    'hiddenInfoNotice', ARRAY['정확한 주소는 G1 후 공개'],
    'gateMessage', 'AI 초안 (브로커 검토 전)',
    'kakaoText', E'[JS부동산 블라인드딜]\n\n📍 선릉역권 오피스 꼬마빌딩 (주소 블라인드)\n💰 115억~125억\n🏢 4층 / 대지 120평 / 주차 8대 / 엘베 있음\n✅ 1~2층 임차 중\n📋 3~4층 사옥 or 추가 임차 가능\n관심 있으시면 연락 주세요.',
    'boundaryNote', 'AI 초안 — 투자 추천 아님'
  ),
  null
)
on conflict (id) do update set body = excluded.body, updated_at = now();


-- ================================================================
-- [STEP 4] 건물 신호 카드 (시나리오 #3 매칭 + 대시보드)
-- ================================================================

insert into building_signal_cards (
  id, building_id, owner_id, title,
  area_signal, asset_type, price_band,
  deal_points, caution_points, buyer_fit_types,
  visibility, status, body, deal_curiosity_score
)
values
(
  'e2e00000-0003-0001-0001-000000000001',
  'e2e00000-0001-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  '성수 뚝섬역권 꼬마빌딩 — 급매 딜카드',
  '성수동', '꼬마빌딩(근생+사무)', '70억~78억',
  ARRAY[
    '1층 F&B 임차 (월 400만원 고정)',
    '2018년 전면 리모델링',
    '뚝섬역 도보 7분',
    '급매 — 시세 대비 5~8% 할인 가능'
  ],
  ARRAY[
    '엘리베이터 없음',
    '2~4층 공실',
    '매도인 세금 이슈 확인 필요'
  ],
  ARRAY['1층 고정수입 투자자', '사옥+임대 겸용 법인', '성수 선호 매수자'],
  'public_blind', 'broker_reviewed',
  jsonb_build_object('teaser_id','e2e00000-0002-0001-0001-000000000001'),
  82
)
on conflict (id) do update set updated_at = now();


-- ================================================================
-- [STEP 5] 매수자 의향서 4건 (시나리오 #2, #3)
-- ================================================================

insert into buyer_intent_lite (
  id, owner_id, raw_input,
  buyer_type, budget_min, budget_max, budget_display,
  preferred_regions, asset_types, purchase_purpose,
  must_have, nice_to_have, risk_tolerance, financing_note,
  visibility, normalized
)
values
-- S등급 예정: 홍대표 (70~85억, 성동/마포/용산, 투자)
(
  'e2e00000-0004-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  '[E2E] 홍대표님 상담 메모: 예산 70~85억, 성동구/마포구/용산구 꼬마빌딩. 1층 카페나 우량 임차인 있는 건물 선호. 공실 있어도 무관. 엘베 없어도 괜찮다고 하심. 실투자 목적.',
  '개인 투자자 (홍○○ 대표)',
  7000000000, 8500000000, '70억~85억',
  ARRAY['성동구','마포구','용산구'],
  ARRAY['꼬마빌딩','근린생활시설','상가주택'],
  '임대수익 투자',
  ARRAY['1층 카페 또는 우량 임차인','수익률 3% 이상'],
  ARRAY['리모델링 완료 건물 우대','대지 100평 이상'],
  'medium',
  '자기자금 50억, LTV 50% 대출 예정. 금리 4.5% 이하 조건.',
  'anonymous_matchable',
  jsonb_build_object(
    'missingQuestions', ARRAY['취득세 계획 확인 필요','임차인 변경 의향 여부'],
    'privacyNotes', ARRAY['고객 성명 내부 식별용 — 외부 공유 금지']
  )
),
-- A등급 예정: 김대표 법인 (65~75억, 성동/강남, 사옥+임대)
(
  'e2e00000-0004-0001-0001-000000000002',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  '[E2E] 김○○ 대표 상담: 사옥+일부 임대 겸용. 65~75억. 성수나 강남구. 주차 중요. 법인 명의. 엘베 있으면 좋고 신축 or 리모델링 선호.',
  '법인 (김○○ 대표)',
  6500000000, 7500000000, '65억~75억',
  ARRAY['성동구','강남구'],
  ARRAY['꼬마빌딩','오피스'],
  '사옥 + 일부 임대',
  ARRAY['주차 3대 이상','대지면적 120평 이상'],
  ARRAY['엘리베이터 우대','신축 또는 최근 리모델링'],
  'low',
  '법인 자금 60억 + 은행 대출 15억 계획.',
  'anonymous_matchable',
  jsonb_build_object(
    'missingQuestions', ARRAY['층별 사용 계획 구체화 필요'],
    'privacyNotes', ARRAY['법인명 외부 공개 금지']
  )
),
-- B등급 예정: 이○○ 개인 (75~80억, 강북 선호, 완전임차 필수)
(
  'e2e00000-0004-0001-0001-000000000003',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  '[E2E] 이○○님: 80억 내외, 수익형 꼬마빌딩. 강북 선호. 공실 없는 건물 원함. 역세권 필수.',
  '개인 투자자 (이○○)',
  7500000000, 8000000000, '75억~80억',
  ARRAY['마포구','은평구','서대문구'],
  ARRAY['꼬마빌딩','상가주택'],
  '임대수익',
  ARRAY['완전 임차 상태','수익률 4% 이상'],
  ARRAY['역세권'],
  'low',
  null,
  'anonymous_matchable',
  jsonb_build_object(
    'missingQuestions', ARRAY['지역 범위 조정 가능 여부'],
    'privacyNotes', ARRAY[]::text[]
  )
),
-- C등급: 박○○ (예산 미스매치)
(
  'e2e00000-0004-0001-0001-000000000004',
  '4b4b5b94-cab9-4014-9486-7ec230b04eae',
  '[E2E] 박○○님: 55~65억, 성수 선호이나 예산 한정. 전층 임차 필수. 리노베이션 있어도 상관없다고 함.',
  '개인 투자자 (박○○)',
  5500000000, 6500000000, '55억~65억',
  ARRAY['성동구'],
  ARRAY['꼬마빌딩','근린생활시설'],
  '임대수익',
  ARRAY['완전 임차 상태'],
  ARRAY[]::text[],
  'low',
  null,
  'anonymous_matchable',
  '{}'::jsonb
)
on conflict (id) do update set raw_input = excluded.raw_input, updated_at = now();


-- ================================================================
-- [STEP 6] 매칭 결과 4건 (시나리오 #3)
-- ================================================================

insert into match_results (
  id, building_ssot_lite_id, buyer_intent_lite_id, broker_id,
  grade, score, stage1_passed, stage2_similarity, stage3_score,
  reasoning, purpose_weight_profile, created_at
)
values
-- S등급: 홍대표 (89점)
(
  'e2e00000-0005-0001-0001-000000000001',
  'e2e00000-0001-0001-0001-000000000001',
  'e2e00000-0004-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'S', 89, true, 0.91, 87,
  '예산(70~85억)·지역(성동구)·자산유형(꼬마빌딩) 3개 조건 완벽 일치. 1층 F&B 임차 선호 조건 충족. 엘리베이터 없음도 무관하다고 명시. 시맨틱 유사도 0.91 최고 수준. 즉시 연락 권장.',
  '투자',
  now() - interval '3 hours'
),
-- A등급: 김대표 법인 (76점)
(
  'e2e00000-0005-0001-0001-000000000002',
  'e2e00000-0001-0001-0001-000000000001',
  'e2e00000-0004-0001-0001-000000000002',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'A', 76, true, 0.74, 78,
  '예산(65~75억) 하단 — 매물 가격(70~78억)과 부분 겹침. 성동구 포함 지역 일치. 사옥 목적이라 엘리베이터 없음 약점이나 주차 3대 확보로 보완. 대지 150평으로 120평 이상 조건 충족.',
  '사옥',
  now() - interval '2 hours'
),
-- B등급: 이○○ (54점)
(
  'e2e00000-0005-0001-0001-000000000003',
  'e2e00000-0001-0001-0001-000000000001',
  'e2e00000-0004-0001-0001-000000000003',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'B', 54, true, 0.58, 51,
  '예산(75~80억) 범위 내 있으나 완전임차 필수 조건에서 2~4층 공실로 감점. 지역도 마포/은평/서대문으로 성동구와 거리 있음. 지역 범위 조정 시 재검토 가능.',
  '투자',
  now() - interval '1 hour'
),
-- C등급: 박○○ (32점)
(
  'e2e00000-0005-0001-0001-000000000004',
  'e2e00000-0001-0001-0001-000000000001',
  'e2e00000-0004-0001-0001-000000000004',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'C', 32, false, 0.28, 30,
  '예산(55~65억) — 매물 가격(70~78억) 하단과 5~15억 이상 격차 발생. Stage1 예산 필터 통과 실패. 완전임차 필수 조건도 미충족. 이 물건은 부적합.',
  '투자',
  now() - interval '30 minutes'
)
on conflict (id) do update set reasoning = excluded.reasoning, updated_at = now();


-- ================================================================
-- [STEP 7] 임대차 물건 2건 + 임차인 의향 2건 + 임대 매칭 1건 (시나리오 #4)
-- ================================================================

insert into lease_spaces (
  id, building_id, broker_id, deal_type, floor, area_sqm,
  space_type, deposit, monthly_rent, maintenance_fee,
  available_from, lease_term_months, incentives, restrictions,
  status, is_marketplace_listed, hidden_fields
)
values
-- [E2E-L1] 성수역 2층 임대 (활성)
(
  'e2e00000-0006-0001-0001-000000000001',
  'e2e00000-0001-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'lease', '2F', 148.76,
  'retail', 10000, 650, 50,
  '2026-08-01', 24,
  jsonb_build_object('rent_free_months',2,'fit_out_allowance',false,'interior_succession',true),
  ARRAY['고급 카페', '브랜드 쇼룸', '고급 리테일', '뷰티/헬스'],
  'active', true,
  ARRAY['exact_address','landlord_identity']
),
-- [E2E-L2] 역삼 3층 분리 임대 (계약완료)
(
  'e2e00000-0006-0001-0001-000000000002',
  'e2e00000-0001-0001-0001-000000000003',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'lease', '3F', 247.93,
  'office', 30000, 1200, 120,
  '2026-05-01', 24,
  jsonb_build_object('rent_free_months',0,'fit_out_allowance',false),
  ARRAY[]::text[],
  'contracted', false,
  ARRAY['exact_address']
)
on conflict (id) do update set updated_at = now();

insert into tenant_intent (
  id, broker_id, business_type,
  preferred_regions, area_min, area_max,
  budget_deposit_max, budget_monthly_max,
  preferred_floors, move_in_target,
  must_have, nice_to_have
)
values
-- [E2E-T1] 카페 브랜드 임차 의향
(
  'e2e00000-0007-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  '카페/F&B',
  ARRAY['성동구','광진구'],
  100, 200,
  15000, 800,
  ARRAY['1F','2F'], '2026-09-01',
  ARRAY['주차 가능','층고 3m 이상'],
  ARRAY['테라스 공간','렌트프리']
),
-- [E2E-T2] IT 스타트업 임차 의향
(
  'e2e00000-0007-0001-0001-000000000002',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  '소프트웨어/IT',
  ARRAY['성동구','강남구','서초구'],
  150, 300,
  30000, 1500,
  ARRAY['3F','4F','5F'], '2026-10-01',
  ARRAY['광케이블 300Mbps 이상','엘리베이터'],
  ARRAY['주차 2대 이상','개방형 구조']
)
on conflict (id) do update set updated_at = now();

-- 임대 매칭 결과
insert into lease_match_results (
  lease_space_id, tenant_intent_id, grade, score, reasoning, created_at
)
values
(
  'e2e00000-0006-0001-0001-000000000001',
  'e2e00000-0007-0001-0001-000000000001',
  'S', 91,
  '면적(148㎡ ∈ 100~200㎡) 완벽 일치. 권역(성동구) 일치. 업종 카페 허용 및 층고 확인 가능. 렌트프리 2개월 제공으로 추가 인센티브 충족. 즉시 연락 권장.',
  now() - interval '1 hour'
)
on conflict do nothing;


-- ================================================================
-- [STEP 8] 고객 CRM 4건 + 연락 이력 8건 (시나리오 #5)
-- ================================================================

insert into broker_clients (
  id, broker_id, client_type, display_name, company, phone, email,
  tier, tags, notes, linked_building_ids, linked_buyer_intent_ids
)
values
-- VIP 매수고객
(
  'e2e00000-0008-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'buyer', '홍○○ 대표', '홍앤컴퍼니', '010-1234-5678', 'hong@example.com',
  'vip', ARRAY['성수선호','70억대','임대수익형'],
  '엘베 없어도 무관. 카페 입주 좋아함. 빠른 의사결정 가능.',
  ARRAY['e2e00000-0001-0001-0001-000000000001'::uuid],
  ARRAY['e2e00000-0004-0001-0001-000000000001'::uuid]
),
-- 일반 매수고객 (법인)
(
  'e2e00000-0008-0001-0001-000000000002',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'buyer', '김○○ 대표', 'KJ테크', '010-2345-6789', null,
  'normal', ARRAY['법인','사옥+임대','강남선호'],
  '법인 명의 매입. 이사회 의결 필요. 결정 2~3주 소요.',
  ARRAY[]::uuid[],
  ARRAY['e2e00000-0004-0001-0001-000000000002'::uuid]
),
-- 일반 매도고객
(
  'e2e00000-0008-0001-0001-000000000003',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'seller', '박○○ 사장', null, '010-3456-7890', null,
  'normal', ARRAY['성수동','꼬마빌딩','급매'],
  '양도세 이슈로 빠른 매각 원함. 78억 호가이나 70억대 협의 의향.',
  ARRAY['e2e00000-0001-0001-0001-000000000001'::uuid],
  ARRAY[]::uuid[]
),
-- 잠재 고객
(
  'e2e00000-0008-0001-0001-000000000004',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'both', '이○○', null, '010-4567-8901', null,
  'potential', ARRAY['강북선호','소규모빌딩'],
  '아직 적극적이지 않음. 주기적 팔로업 필요.',
  ARRAY[]::uuid[],
  ARRAY['e2e00000-0004-0001-0001-000000000003'::uuid]
)
on conflict (id) do update set updated_at = now();

insert into contact_history (
  broker_id, client_id, contact_type, summary, completed_at, metadata
)
values
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000001', 'phone',   '성수동 매물 첫 소개. 관심 표명, 엘베 없어도 된다고 함.', now() - interval '5 days',  jsonb_build_object('duration_min',15,'result','interested')),
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000001', 'kakao',   '블라인드 딜카드 카카오 공유. 긍정 반응.',                now() - interval '4 days',  jsonb_build_object('channel','kakao')),
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000001', 'meeting', '현장 방문. 1층 카페 상태 확인. 가격 협의 시작.',         now() - interval '2 days',  jsonb_build_object('location','성수동','duration_min',60)),
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000001', 'note',    '72억 하단 협의 가능성 타진 중. 세무사 상담 후 의향 재확인 예정.', now() - interval '1 day', '{}'::jsonb),
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000002', 'phone',   '역삼 오피스 물건 소개. 이사회 검토 필요하다고 함.',      now() - interval '7 days',  jsonb_build_object('duration_min',20)),
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000002', 'email',   '역삼 블라인드 딜카드 이메일 발송.',                      now() - interval '6 days',  jsonb_build_object('channel','email')),
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000003', 'phone',   '매각 조건 재확인. 양도세 계산 후 68~70억도 검토 의향.', now() - interval '3 days',  jsonb_build_object('duration_min',30,'result','considering')),
('702b8438-5dbc-4006-a0d0-909cfb00c36f', 'e2e00000-0008-0001-0001-000000000004', 'kakao',   '성북 길음 물건 공유. 반응 미지근.관심 여부 재확인 필요.',  now() - interval '10 days', jsonb_build_object('channel','kakao','result','cold'))
on conflict do nothing;


-- ================================================================
-- [STEP 9] Gate 요청 3건 (시나리오 #9)
-- ================================================================

insert into gate_requests (
  id, building_id, requester_id, target_broker_id,
  requested_level, requested_fields, reason, status,
  reviewer_id, reviewed_at
)
values
-- submitted (검토 대기)
(
  'e2e00000-0009-0001-0001-000000000001',
  'e2e00000-0001-0001-0001-000000000001',
  '91a84de4-c4ca-4ed5-a4ab-94471fbc4cf0',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'G1', ARRAY['area_signal','price_band','asset_type'],
  '매입 검토를 위해 권역 정보와 가격대를 확인하고 싶습니다.',
  'submitted', null, null
),
-- approved (승인됨)
(
  'e2e00000-0009-0001-0001-000000000002',
  'e2e00000-0001-0001-0001-000000000001',
  '91a84de4-c4ca-4ed5-a4ab-94471fbc4cf0',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'G2', ARRAY['area_signal','price_band','asset_type','current_use_signal'],
  '상세한 임대 현황과 수익률 검토를 원합니다. 사전 실사 목적입니다.',
  'approved', '771f8962-0dc4-44fb-b73d-462f817becb6', now() - interval '2 hours'
),
-- rejected (거절됨)
(
  'e2e00000-0009-0001-0001-000000000003',
  'e2e00000-0001-0001-0001-000000000001',
  '91a84de4-c4ca-4ed5-a4ab-94471fbc4cf0',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'G3', ARRAY['exact_address','tenant_name','unit_rent'],
  '정확한 주소와 임차인 명단이 필요합니다.',
  'rejected', '771f8962-0dc4-44fb-b73d-462f817becb6', now() - interval '1 day'
)
on conflict (id) do nothing;


-- ================================================================
-- [STEP 10] Owner Readiness 체크 1건 (시나리오 #7)
-- ================================================================

insert into owner_readiness_checks (
  id, owner_id, building_id,
  checklist, readiness_score, available_outputs,
  missing_data, next_recommended_action
)
values
(
  'e2e00000-0010-0001-0001-000000000001',
  '91a84de4-c4ca-4ed5-a4ab-94471fbc4cf0',
  'e2e00000-0001-0001-0001-000000000004',
  jsonb_build_object(
    'buildingRegister', true,
    'registry', true,
    'landUsePlan', true,
    'rentRoll', false,
    'photos', true,
    'floorPlan', false,
    'repairHistory', false,
    'vacancyStatus', true,
    'askingPrice', false,
    'disclosurePolicy', false
  ),
  60,
  ARRAY['deal_curiosity_report','blind_teaser'],
  ARRAY['임대차 현황 요약표','평면도','수선 이력','희망 매각가','공개 범위 결정'],
  '블라인드 딜카드 생성이 가능한 단계입니다. 임대차 현황 요약표를 추가 제출하면 Snapshot 초안 생성이 가능합니다.'
)
on conflict (id) do update set
  readiness_score = excluded.readiness_score,
  updated_at = now();


-- ================================================================
-- [STEP 11] 딜 파이프라인 3건 + 단계 전환 이력 (시나리오 #10)
-- ================================================================

insert into deal_pipeline_states (
  id, building_ssot_lite_id, broker_id, stage, entered_at, metadata
)
values
-- 성수 꼬마빌딩: gate_requested 단계
(
  'e2e00000-0011-0001-0001-000000000001',
  'e2e00000-0001-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'gate_requested',
  now() - interval '2 days',
  jsonb_build_object('buyer_count',3,'top_grade','S','note','홍대표 현장 방문 완료')
),
-- 합정 근생: deal_card_created 단계
(
  'e2e00000-0011-0001-0001-000000000002',
  'e2e00000-0001-0001-0001-000000000002',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'deal_card_created',
  now() - interval '5 days',
  jsonb_build_object('note','딜카드 생성 완료, 매수자 탐색 중')
),
-- 역삼 오피스: memo_input 단계 (초기)
(
  'e2e00000-0011-0001-0001-000000000003',
  'e2e00000-0001-0001-0001-000000000003',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'deal_card_created',
  now() - interval '7 days',
  jsonb_build_object('note','역삼 오피스 딜카드 초안 완성')
)
on conflict (id) do update set stage = excluded.stage, updated_at = now();

insert into pipeline_stage_transitions (
  broker_id, building_ssot_lite_id,
  from_stage, to_stage, transition_reason, hold_days, metadata
)
values
-- 성수 꼬마빌딩: memo_input → deal_card_created
(
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'e2e00000-0001-0001-0001-000000000001',
  'memo_input', 'deal_card_created',
  '브로커 메모로 딜카드 생성',
  0,
  jsonb_build_object('tag','E2E')
),
-- 성수 꼬마빌딩: deal_card_created → gate_requested
(
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'e2e00000-0001-0001-0001-000000000001',
  'deal_card_created', 'gate_requested',
  '매수자 관심 등록 후 Gate G1 요청',
  3,
  jsonb_build_object('tag','E2E','gate_level','G1')
),
-- 합정: memo_input → deal_card_created
(
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'e2e00000-0001-0001-0001-000000000002',
  'memo_input', 'deal_card_created',
  '공개 리포트에서 딜카드 전환',
  1,
  jsonb_build_object('tag','E2E')
),
-- 역삼: memo_input → deal_card_created
(
  '702b8438-5dbc-4006-a0d0-909cfb00c36f',
  'e2e00000-0001-0001-0001-000000000003',
  'memo_input', 'deal_card_created',
  '메모 입력 후 딜카드 생성',
  0,
  jsonb_build_object('tag','E2E')
)
on conflict do nothing;


-- ================================================================
-- [STEP 12] 시장 선행 지표 (시나리오 #10 대시보드)
-- ================================================================

insert into market_leading_indicators (
  region, asset_type, period_start, period_end,
  demand_score, supply_score, avg_hold_days, conversion_rate,
  price_resistance_band, absorption_rate, trend_direction
)
values
(
  '[E2E] 성동구 성수권역', '꼬마빌딩',
  '2026-05-01', '2026-05-31',
  78, 42, 23.5, 0.38,
  jsonb_build_object('min',0.06,'max',0.12),
  0.42, 'up'
)
on conflict do nothing;


-- ================================================================
-- [STEP 13] 활동 이벤트 로그 (애널리틱스 대시보드용)
-- ================================================================

insert into activity_events (
  building_ssot_lite_id, actor_id, actor_role,
  event_type, entity_type, entity_id, metadata, created_at
)
values
-- 딜카드 생성 이벤트들
(
  'e2e00000-0001-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f', 'broker',
  'deal_card_created', 'building_ssot_lite',
  'e2e00000-0001-0001-0001-000000000001',
  jsonb_build_object('tag','E2E','source','broker_memo'),
  now() - interval '6 hours'
),
-- 매칭 계산 이벤트 (S등급)
(
  'e2e00000-0001-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f', 'broker',
  'match_computed', 'match_result',
  'e2e00000-0005-0001-0001-000000000001',
  jsonb_build_object('tag','E2E','grade','S','score',89),
  now() - interval '3 hours'
),
-- 매칭 계산 이벤트 (A등급)
(
  'e2e00000-0001-0001-0001-000000000001',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f', 'broker',
  'match_computed', 'match_result',
  'e2e00000-0005-0001-0001-000000000002',
  jsonb_build_object('tag','E2E','grade','A','score',76),
  now() - interval '2 hours'
),
-- Gate G1 요청 이벤트
(
  'e2e00000-0001-0001-0001-000000000001',
  '91a84de4-c4ca-4ed5-a4ab-94471fbc4cf0', 'public_user',
  'gate_requested', 'gate_request',
  'e2e00000-0009-0001-0001-000000000001',
  jsonb_build_object('tag','E2E','level','G1'),
  now() - interval '4 hours'
),
-- 블라인드 딜카드 생성 (합정)
(
  'e2e00000-0001-0001-0001-000000000002',
  '702b8438-5dbc-4006-a0d0-909cfb00c36f', 'broker',
  'deal_card_created', 'building_ssot_lite',
  'e2e00000-0001-0001-0001-000000000002',
  jsonb_build_object('tag','E2E','source','address'),
  now() - interval '5 days'
),
-- Building radar 조회
(
  'e2e00000-0001-0001-0001-000000000002',
  null, 'public_user',
  'building_radar_generated', 'document_object',
  'e2e00000-0002-0001-0001-000000000002',
  jsonb_build_object('tag','E2E','purpose','buy_consideration'),
  now() - interval '5 days'
),
-- 매수자 등록
(
  null,
  '702b8438-5dbc-4006-a0d0-909cfb00c36f', 'broker',
  'buyer_intent_created', 'buyer_intent_lite',
  'e2e00000-0004-0001-0001-000000000001',
  jsonb_build_object('tag','E2E'),
  now() - interval '1 day'
)
on conflict do nothing;


-- ================================================================
-- [STEP 14] 검증 쿼리
-- ================================================================

do $$
declare
  cnt_buildings integer;
  cnt_docs      integer;
  cnt_buyers    integer;
  cnt_matches   integer;
  cnt_clients   integer;
  cnt_leases    integer;
  cnt_gates     integer;
  cnt_pipeline  integer;
begin
  select count(*) into cnt_buildings from building_ssot_lite where raw_input like '%[E2E]%';
  select count(*) into cnt_docs      from document_objects   where building_id in (select id from building_ssot_lite where raw_input like '%[E2E]%');
  select count(*) into cnt_buyers    from buyer_intent_lite  where raw_input like '%[E2E]%';
  select count(*) into cnt_matches   from match_results      where building_ssot_lite_id in (select id from building_ssot_lite where raw_input like '%[E2E]%');
  select count(*) into cnt_clients   from broker_clients     where broker_id = '702b8438-5dbc-4006-a0d0-909cfb00c36f';
  select count(*) into cnt_leases    from lease_spaces       where broker_id = '702b8438-5dbc-4006-a0d0-909cfb00c36f';
  select count(*) into cnt_gates     from gate_requests      where building_id in (select id from building_ssot_lite where raw_input like '%[E2E]%');
  select count(*) into cnt_pipeline  from deal_pipeline_states where broker_id = '702b8438-5dbc-4006-a0d0-909cfb00c36f';

  raise notice '============================================';
  raise notice 'E2E 시딩 완료 검증 결과:';
  raise notice '  매물 SSoT:         % 건', cnt_buildings;
  raise notice '  문서(티저/리포트): % 건', cnt_docs;
  raise notice '  매수자 의향서:     % 건', cnt_buyers;
  raise notice '  매칭 결과:         % 건', cnt_matches;
  raise notice '  CRM 고객:          % 명', cnt_clients;
  raise notice '  임대 물건:         % 건', cnt_leases;
  raise notice '  Gate 요청:         % 건', cnt_gates;
  raise notice '  파이프라인:        % 건', cnt_pipeline;
  raise notice '============================================';
  raise notice '브로커1 (이중개): demo-broker@credeal.net / Demo2026!Broker';
  raise notice '브로커2 (박팀장): demo-broker2@credeal.net / Demo2026!Broker2';
  raise notice '관리자:           demo-admin@credeal.net / Demo2026!Admin';
  raise notice '공개사용자:       demo-public@credeal.net / Demo2026!Public';
  raise notice '============================================';
  raise notice '10대 시나리오 URL 목록:';
  raise notice '  #1 딜카드 생성: https://credeal.net/broker/deal-card/new';
  raise notice '  #1 딜카드 결과: https://credeal.net/broker/deal-card/e2e00000-0001-0001-0001-000000000001';
  raise notice '  #2 매수자 등록: https://credeal.net/broker/buyer-intents/new';
  raise notice '  #3 매칭 센터:   https://credeal.net/broker/matching';
  raise notice '  #4 임대차 카드: https://credeal.net/broker/lease-card/new';
  raise notice '  #5 고객 CRM:    https://credeal.net/broker/clients';
  raise notice '  #6 스튜디오:    https://credeal.net/broker/buildings/e2e00000-0001-0001-0001-000000000001/studio';
  raise notice '  #7 매각준비도:  https://credeal.net/owner-readiness';
  raise notice '  #8 딜 될까?:    https://credeal.net/building-radar';
  raise notice '  #9 관리자:      https://credeal.net/admin/gate-requests';
  raise notice '  #10 대시보드:   https://credeal.net/broker';
  raise notice '============================================';
end $$;
