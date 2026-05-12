-- JS부동산중개 데모를 위한 시딩 데이터 스크립트 (seed_demo.sql)
-- 주의: 데모 직전에 Supabase DB에 실행해 주세요.

-- 1. 중개인 프로필 시딩 (박팀장, 이대리)
-- auth.users 테이블에 사용자 생성 후 profiles 테이블에 연결 (로컬/테스트 환경용 더미)
insert into profiles (id, name, email, role, avatar_url, team_name)
values 
  ('00000000-0000-0000-0000-000000000001', '박팀장', 'park@js-realty.co.kr', 'broker', null, '상업용부동산 1팀'),
  ('00000000-0000-0000-0000-000000000002', '이대리', 'lee@js-realty.co.kr', 'broker', null, '상업용부동산 2팀')
on conflict (id) do nothing;

-- 2. Act 3 매수자 매칭 시연을 위한 이대리의 '매수 의향서(Buyer Intent)' 시딩
insert into buyer_intent_lite (
  id, owner_id, buyer_type, budget_min, budget_max, budget_display, 
  preferred_regions, asset_types, purchase_purpose, 
  must_have, risk_tolerance, visibility, raw_input
)
values 
  (
    '11111111-0000-0000-0000-000000000001', 
    '00000000-0000-0000-0000-000000000002', -- 이대리 소유
    '개인투자자 (홍○○)', 
    7000000000, 8500000000, '70억~85억',
    ARRAY['성동구', '마포구', '용산구'], 
    ARRAY['근린생활시설', '상가주택'], 
    '임대수익용 투자',
    ARRAY['1층 카페 또는 우량 임차인', '수익률 3% 이상', '엘리베이터 무관'],
    'medium', 
    'team',
    '홍○○ 고객님, 예산 80억 선에서 성수나 한남쪽 꼬마빌딩 찾으심. 1층에 카페 들어갈 수 있는 상가주택이나 근생 선호.'
  ),
  (
    '11111111-0000-0000-0000-000000000002', 
    '00000000-0000-0000-0000-000000000001', -- 박팀장 소유 (B등급 예시용)
    '법인 (김○○ 대표)', 
    6500000000, 7500000000, '65억~75억',
    ARRAY['성동구', '강남구'], 
    ARRAY['오피스', '근린생활시설'], 
    '사옥 + 일부 임대',
    ARRAY['주차 5대 이상', '대지면적 100평 이상'],
    'low', 
    'private',
    '김대표님 사옥용. 성수나 강남. 주차가 중요함.'
  )
on conflict (id) do nothing;

-- 3. Act 5 공실 마케팅 시연을 위한 조직(Organization) 및 건물 기본 데이터 시딩
insert into organizations (id, name, type)
values ('22222222-0000-0000-0000-000000000001', 'JS부동산중개', 'brokerage')
on conflict (id) do nothing;

-- 성수 알파타워 (기본 정보만 등록, 딜카드 SSoT는 데모 중 직접 생성)
insert into spaces (
  id, organization_id, name, address, 
  space_type, status, size_pyeong, floor
)
values (
  '33333333-0000-0000-0000-000000000001',
  '22222222-0000-0000-0000-000000000001',
  '성수 알파타워 2층',
  '서울시 성동구 성수동2가 273-13',
  'office',
  'vacant',
  75,
  '2'
)
on conflict (id) do nothing;
