-- ============================================================
-- JS부동산중개 데모 전용 완전 시딩 스크립트 v2
-- supabase/seed_demo_v2.sql
--
-- ⚠️  주의사항:
--   1. Supabase SQL Editor에서 service_role 권한으로 실행
--   2. 데모 직전 또는 로컬 환경 초기화 시 실행
--   3. 모든 owner_id는 NULL (RLS 우회 — service role로 서버에서 조회)
-- ============================================================

-- ================================================================
-- [STEP 0] 기존 데모 데이터 클린업 (중복 방지)
-- ================================================================
delete from match_results
  where building_ssot_lite_id in (
    select id from building_ssot_lite
    where raw_input like '%[DEMO]%'
  );

delete from document_objects
  where building_id in (
    select id from building_ssot_lite
    where raw_input like '%[DEMO]%'
  );

delete from building_signal_cards
  where building_id in (
    select id from building_ssot_lite
    where raw_input like '%[DEMO]%'
  );

delete from activity_events
  where metadata->>'demo' = 'true';

delete from building_ssot_lite where raw_input like '%[DEMO]%';
delete from buyer_intent_lite where raw_input like '%[DEMO]%';

-- ================================================================
-- [STEP 1] 매물 SSoT — 성수동 꼬마빌딩 (Act 2 메인 매물)
-- ================================================================
insert into building_ssot_lite (
  id,
  owner_id,
  created_by_role,
  input_type,
  raw_input,
  area_signal,
  asset_type,
  price_band,
  size_signal,
  current_use_signal,
  vacancy_signal,
  fit_summary,
  caution_summary,
  hidden_fields,
  layers,
  confidence,
  disclosure,
  status,
  matched_buyer_count,
  promotion_score
)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  null,
  'broker',
  'broker_memo',
  '[DEMO] 성수동 꼬마빌딩 | 대지 150평, 연면적 280평, 지상 4층 | 1층 카페 임차 중 (A임차인, 월세 400) | 2~4층 사무실 공실 | 엘리베이터 없음 | 2018년 리모델링 | 주차 3대 | 매도인 양도세 이슈로 급매 | 호가 78억 협의가능 실거래 70~73억 예상 | 주소 블라인드 원함',
  '성수동',
  '꼬마빌딩(근생+사무)',
  '70억~78억',
  '대지 150평 / 연면적 280평 / 지상 4층',
  '1층 카페 임차 중, 2~4층 사무실 공실',
  '부분 공실',
  '임대수익 투자자 (1층 카페 고정 수입), 사옥 겸 투자 목적 법인, 성수동 꼬마빌딩 선호 매수자',
  '엘리베이터 없음, 2~4층 공실 위험, 매도인 양도세 이슈 (협상 시 유의)',
  ARRAY['exact_address', 'seller_motivation', 'unit_rent'],
  jsonb_build_object(
    'location', jsonb_build_object(
      'district', '성동구',
      'neighborhood', '성수동',
      'nearbyLandmarks', ARRAY['뚝섬역 도보 7분', '성수 카페거리 인근'],
      'transportScore', 72
    ),
    'building', jsonb_build_object(
      'landArea', '150평',
      'totalFloorArea', '280평',
      'floors', 4,
      'builtYear', 2018,
      'lastRenovation', '2018년 전면 리모델링',
      'parkingSpots', 3,
      'elevator', false
    ),
    'financials', jsonb_build_object(
      'askingPrice', '78억',
      'estimatedMarketPrice', '70~73억',
      'grossYield', '약 3.2% (1층 카페 기준)',
      'annualRent1F', '4,800만원 (월세 400)'
    ),
    'lease', jsonb_build_object(
      'floor1', '카페 (A임차인, 계약 만료 2026.12)',
      'floor2to4', '공실 (사무실 용도 분류)'
    )
  ),
  jsonb_build_object('overall', 0.78, 'price', 0.82, 'location', 0.91, 'lease', 0.65),
  jsonb_build_object('addressBlind', true, 'tenantBlind', false, 'pricePublic', true),
  'public_signal_ready',
  2,   -- 매칭된 매수자 수 (Act 3용)
  74   -- 프로모션 점수
);

-- ================================================================
-- [STEP 2] 딜카드 블라인드 티저 문서 (Act 2 결과 화면 시딩)
-- ================================================================
insert into document_objects (
  id,
  owner_id,
  source_type,
  source_id,
  building_id,
  document_type,
  visibility,
  status,
  title,
  body,
  markdown
)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  null,
  'building_ssot_lite',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'blind_teaser',
  'public_blind',
  'broker_reviewed',
  '성수 황금 입지 꼬마빌딩 — 1층 고정 수입 + 공실 업사이드',
  jsonb_build_object(
    'title', '성수 황금 입지 꼬마빌딩 — 1층 고정 수입 + 공실 업사이드',
    'shortSummary', '뚝섬역 도보권 리모델링 4층 꼬마빌딩. 1층 카페 고정 월세 400만원 확보, 2~4층 공실은 직접 활용하거나 추가 임대 수익으로 전환 가능. 급매 조건으로 시세 대비 5~8% 할인 매입 기회.',
    'dealPoints', ARRAY[
      '1층 A급 카페 임차 고정 (월 400만원 / 계약 2026.12까지 보장)',
      '2018년 전면 리모델링 — 당장 추가 투자 없이 사용 가능',
      '뚝섬역 도보 7분, 성수 카페거리 핵심 배후지',
      '대지 150평 / 연면적 280평 — 성수동 꼬마빌딩 평균 대비 20% 큰 규모',
      '급매 이유 명확 (매도인 사정) — 호가 78억 대비 70~73억 협의 진행 가능'
    ],
    'cautionPoints', ARRAY[
      '엘리베이터 없음 — 사무 임차 유치 시 제약 요인',
      '2~4층 공실 상태 — 단기 임대 수익률 영향',
      '매도인 세금 관련 이슈 — 계약 구조 사전 검토 필요 (세무사 확인 권장)'
    ],
    'hiddenInfoNotice', ARRAY[
      '정확한 주소는 G1 관심 등록 후 확인 가능합니다.',
      '매도인 사정 및 협상 조건은 담당 중개인 문의 필요합니다.',
      '호실별 임대료 세부 내역은 G2 인증 후 제공됩니다.'
    ],
    'gateMessage', 'AI 초안 · 담당 중개인 검토 완료',
    'kakaoText', E'[JS부동산 블라인드 딜]\n\n📍 성수동 꼬마빌딩 (주소 블라인드)\n💰 70억~78억 (급매 협의)\n🏢 지상 4층 / 대지 150평 / 연면적 280평\n☕ 1층 카페 임차 (월세 400 고정)\n📋 2~4층 공실 (직접 활용 or 추가 임대)\n\n✅ 2018 리모델링 완료\n✅ 뚝섬역 도보 7분\n⚠️ 엘베 없음 / 세금 이슈 사전 확인 필요\n\n관심 있으시면 연락주세요.',
    'boundaryNote', '이 자료는 공개 데이터와 중개인 입력 정보를 기반으로 AI가 초안 작성한 예비 검토 자료입니다. 가격, 수익률, 세금, 법률 사항은 전문가 확인이 필요하며 투자 판단의 유일한 근거로 사용하지 마십시오.'
  ),
  E'## 성수 황금 입지 꼬마빌딩\n\n**1층 고정 수입 + 공실 업사이드 기회**\n\n> 뚝섬역 도보 7분 | 대지 150평 | 70억~78억\n\n### 딜 포인트\n- 1층 카페 임차 월 400만원 고정\n- 2018년 전면 리모델링 완료\n- 급매 조건 — 시세 대비 5~8% 할인 가능\n\n### 유의사항\n- 엘리베이터 없음\n- 2~4층 공실\n- 세금 이슈 사전 확인 필요'
);

-- ================================================================
-- [STEP 3] 매수자 의향서 3건 시딩 (Act 3 매칭 시연용)
-- ================================================================

-- 매수자 A: 홍○○ (이대리 고객) — S등급 예정
insert into buyer_intent_lite (
  id, owner_id, raw_input,
  buyer_type, budget_min, budget_max, budget_display,
  preferred_regions, asset_types, purchase_purpose,
  must_have, nice_to_have, risk_tolerance, financing_note,
  visibility, normalized
)
values (
  'cccccccc-0000-0000-0000-000000000001',
  null,
  '[DEMO] 홍○○ 고객님 상담 메모: 예산 70~85억, 성동구/마포구/용산구 꼬마빌딩. 1층 카페나 우량 임차인 있는 건물 선호. 공실 있어도 무관. 엘베 없어도 괜찮다 하심. 실거래 투자용.',
  '개인 투자자 (홍○○)',
  7000000000, 8500000000, '70억~85억',
  ARRAY['성동구', '마포구', '용산구'],
  ARRAY['꼬마빌딩', '근린생활시설', '상가주택'],
  '임대수익 투자',
  ARRAY['1층 카페 또는 우량 임차인', '수익률 3% 이상'],
  ARRAY['리모델링 완료 건물 우대', '대지 100평 이상'],
  'medium',
  '자기자금 50억, LTV 50% 대출 예정. 금리 4.5% 이하 조건.',
  'anonymous_matchable',
  jsonb_build_object(
    'missingQuestions', ARRAY['정확한 취득세 계획 확인 필요', '임차인 변경 의향 여부'],
    'privacyNotes', ARRAY['고객 성명 내부 식별용 — 외부 공유 금지']
  )
),
-- 매수자 B: 김○○ 대표 (박팀장 고객) — A등급 예정
(
  'cccccccc-0000-0000-0000-000000000002',
  null,
  '[DEMO] 김○○ 대표 상담: 사옥 + 일부 임대 겸용. 65~75억 선. 성수나 강남구. 주차 중요. 법인 명의.',
  '법인 (김○○ 대표)',
  6500000000, 7500000000, '65억~75억',
  ARRAY['성동구', '강남구'],
  ARRAY['꼬마빌딩', '오피스'],
  '사옥 + 일부 임대',
  ARRAY['주차 3대 이상', '대지면적 120평 이상'],
  ARRAY['엘리베이터 우대', '신축 또는 최근 리모델링'],
  'low',
  '법인 자금 60억 + 은행 대출 15억 계획.',
  'anonymous_matchable',
  jsonb_build_object(
    'missingQuestions', ARRAY['층별 사용 계획 구체화 필요'],
    'privacyNotes', ARRAY['법인명 외부 공개 금지']
  )
),
-- 매수자 C: 이○○ (신규 고객) — B등급 예정
(
  'cccccccc-0000-0000-0000-000000000003',
  null,
  '[DEMO] 이○○님: 80억 내외, 수익형 꼬마빌딩. 강북 선호. 공실 없는 건물 원함.',
  '개인 투자자 (이○○)',
  7500000000, 8000000000, '75억~80억',
  ARRAY['마포구', '은평구', '서대문구'],
  ARRAY['꼬마빌딩', '상가주택'],
  '임대수익',
  ARRAY['완전 임차 상태', '수익률 4% 이상'],
  ARRAY['역세권'],
  'low',
  null,
  'anonymous_matchable',
  jsonb_build_object(
    'missingQuestions', ARRAY['지역 범위 조정 가능 여부'],
    'privacyNotes', ARRAY[]::text[]
  )
)
on conflict (id) do nothing;

-- ================================================================
-- [STEP 4] 매칭 결과 시딩 (Act 3 핵심 — 자동 매칭 결과 화면)
-- ================================================================

insert into match_results (
  id,
  building_ssot_lite_id,
  buyer_intent_lite_id,
  broker_id,
  grade,
  score,
  stage1_passed,
  stage2_similarity,
  stage3_score,
  reasoning,
  purpose_weight_profile,
  created_at
)
values
-- 홍○○: S등급 (89점) — 가장 핵심 Jaw Drop 장면
(
  'dddddddd-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  null,
  'S',
  0.89,
  true,
  0.91,
  0.87,
  '예산(70~85억)·지역(성동구)·자산유형(꼬마빌딩/근생) 3개 조건 완벽 일치. 1층 카페 임차 선호 조건까지 충족. 엘리베이터 없음도 무관하다고 명시. 시맨틱 유사도 0.91로 최고 수준. 즉시 연락 권장.',
  '투자',
  now() - interval '2 hours'
),
-- 김○○: A등급 (76점)
(
  'dddddddd-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002',
  null,
  'A',
  0.76,
  true,
  0.74,
  0.78,
  '예산(65~75억) 하단 — 매물 가격(70~78억)과 부분 겹침. 성동구 포함으로 지역 일치. 사옥 목적이라 엘리베이터 없음이 약점이나 주차 3대 확보로 보완. 대지 150평으로 120평 이상 조건 충족.',
  '사옥',
  now() - interval '1 hour'
),
-- 이○○: B등급 (54점)
(
  'dddddddd-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000003',
  null,
  'B',
  0.54,
  true,
  0.58,
  0.51,
  '예산(75~80억) 범위 내에 있으나 완전 임차 상태 필수 조건에서 2~4층 공실로 인해 감점. 지역도 마포/은평/서대문으로 성동구와 다소 거리 있음. 추가 상담 후 지역 범위 조정 가능성 있음.',
  '투자',
  now() - interval '30 minutes'
)
on conflict (id) do nothing;

-- ================================================================
-- [STEP 5] 건물 신호 카드 (Act 2 딜카드 상세 화면 보완)
-- ================================================================
insert into building_signal_cards (
  id,
  building_id,
  owner_id,
  title,
  area_signal,
  asset_type,
  price_band,
  deal_points,
  caution_points,
  buyer_fit_types,
  visibility,
  status,
  body,
  deal_curiosity_score
)
values (
  'eeeeeeee-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  null,
  '성수 황금 입지 꼬마빌딩 — 급매 딜카드',
  '성수동',
  '꼬마빌딩(근생+사무)',
  '70억~78억',
  ARRAY[
    '1층 카페 임차 (월 400만원 고정)',
    '2018년 전면 리모델링',
    '뚝섬역 도보 7분',
    '급매 — 시세 대비 5~8% 할인 가능'
  ],
  ARRAY[
    '엘리베이터 없음',
    '2~4층 공실',
    '매도인 세금 이슈 확인 필요'
  ],
  ARRAY['임대수익 투자자', '사옥 겸 투자 법인', '성수 선호 매수자'],
  'public_blind',
  'broker_reviewed',
  jsonb_build_object(
    'teaser_id', 'bbbbbbbb-0000-0000-0000-000000000001'
  ),
  82
)
on conflict (id) do nothing;

-- ================================================================
-- [STEP 6] 활동 이벤트 시딩 (건물주 리포트용)
-- ================================================================
insert into activity_events (
  building_ssot_lite_id,
  broker_id,
  event_type,
  metadata,
  created_at
)
values
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  null,
  'deal_card_created',
  jsonb_build_object('demo', 'true', 'source', 'broker_memo'),
  now() - interval '3 hours'
),
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  null,
  'match_computed',
  jsonb_build_object('demo', 'true', 'grade', 'S', 'score', 0.89, 'buyer_intent_id', 'cccccccc-0000-0000-0000-000000000001'),
  now() - interval '2 hours'
),
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  null,
  'match_computed',
  jsonb_build_object('demo', 'true', 'grade', 'A', 'score', 0.76, 'buyer_intent_id', 'cccccccc-0000-0000-0000-000000000002'),
  now() - interval '1 hour'
),
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  null,
  'match_computed',
  jsonb_build_object('demo', 'true', 'grade', 'B', 'score', 0.54, 'buyer_intent_id', 'cccccccc-0000-0000-0000-000000000003'),
  now() - interval '30 minutes'
);

-- ================================================================
-- [STEP 7] 추가 매물 2건 (브로커 대시보드 목록 풍성화용)
-- ================================================================
insert into building_ssot_lite (
  id, owner_id, created_by_role, input_type, raw_input,
  area_signal, asset_type, price_band, current_use_signal,
  vacancy_signal, fit_summary, caution_summary, hidden_fields,
  layers, confidence, disclosure, status, matched_buyer_count, promotion_score
)
values
(
  'aaaaaaaa-0000-0000-0000-000000000002',
  null, 'broker', 'broker_memo',
  '[DEMO] 마포 합정 근생 3층, 대지 85평, 전층 임차, 45억, 매도인 이사 결정',
  '합정동',
  '근린생활시설',
  '43억~47억',
  '전층 임차 (카페+미용실+사무)',
  '없음',
  '완전 임차 안정 수익물건. 수익률 4.1%. 전세 세입자 구성 우량.',
  '매도 타이밍 이슈, 추가 리모델링 예산 필요',
  ARRAY['exact_address'],
  '{}', '{}', '{}',
  'public_signal_ready', 1, 68
),
(
  'aaaaaaaa-0000-0000-0000-000000000003',
  null, 'broker', 'broker_memo',
  '[DEMO] 강남 역삼 꼬마빌딩, 대지 120평 4층, 사옥 매수 희망자 타겟, 120억',
  '역삼동',
  '꼬마빌딩(오피스)',
  '115억~125억',
  '전층 사무실 (일부 공실)',
  '부분 공실',
  '강남 사옥 수요 법인 타겟. 층고 높고 주차 8대.',
  '가격대 높음, 사옥 수요 한정적',
  ARRAY['exact_address', 'seller_motivation'],
  '{}', '{}', '{}',
  'draft', 0, 41
)
on conflict (id) do nothing;

-- ================================================================
-- 완료 메시지
-- ================================================================
do $$
begin
  raise notice '✅ JS부동산 데모 시딩 완료!';
  raise notice '  - 매물 SSoT: 3건 (성수/합정/역삼)';
  raise notice '  - 매수자 의향서: 3건 (홍○○ S등급, 김○○ A등급, 이○○ B등급)';
  raise notice '  - 매칭 결과: 3건 시딩';
  raise notice '  - 딜카드 접속 URL: /broker/deal-card/aaaaaaaa-0000-0000-0000-000000000001';
end $$;
