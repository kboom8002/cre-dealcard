-- ============================================================
-- Migration 00040: Vibe Card Demo Broker Seed Data
-- Adds 3 Korean demo brokers with complete VTI vectors, templates,
-- professional metrics, and mock deals.
-- ============================================================

-- 1. Create dummy users in auth.users (Supabase Auth)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES
  ('e1a12345-1234-1234-1234-123456789abc', '00000000-0000-0000-0000-000000000000', 'hong.demo@dealcard.kr', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"홍길동"}', now(), now(), 'authenticated', 'authenticated'),
  ('e2b12345-1234-1234-1234-123456789abc', '00000000-0000-0000-0000-000000000000', 'kim.demo@dealcard.kr', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"김철수"}', now(), now(), 'authenticated', 'authenticated'),
  ('e3c12345-1234-1234-1234-123456789abc', '00000000-0000-0000-0000-000000000000', 'lee.demo@dealcard.kr', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"이영희"}', now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- 2. Ensure profiles exist for these user IDs and set role, company, phone, tagline, photo_url
INSERT INTO public.profiles (id, role, display_name, company, phone, tagline, photo_url)
VALUES
  ('e1a12345-1234-1234-1234-123456789abc', 'broker', '홍길동', '한국상업부동산중개', '010-1234-5678', '성공적인 빌딩 매매를 위한 최적의 파트너', 'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/hong-gildong.png'),
  ('e2b12345-1234-1234-1234-123456789abc', 'broker', '김철수', '대박빌딩파트너스', '010-8765-4321', '강남 오피스 빌딩 임대차 시장의 핵심 리더', 'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/kim-chulsoo.png'),
  ('e3c12345-1234-1234-1234-123456789abc', 'broker', '이영희', '가온부동산투자자문', '010-5555-9999', '데이터 기반 분석으로 도출하는 중소형 빌딩 밸류업 솔루션', 'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/broker-avatars/demo/lee-younghee.png')
ON CONFLICT (id) DO UPDATE
SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  company = EXCLUDED.company,
  phone = EXCLUDED.phone,
  tagline = EXCLUDED.tagline,
  photo_url = EXCLUDED.photo_url;

-- Ensure corresponding broker_profiles rows exist
INSERT INTO public.broker_profiles (user_id)
SELECT id FROM public.profiles
WHERE id IN ('e1a12345-1234-1234-1234-123456789abc', 'e2b12345-1234-1234-1234-123456789abc', 'e3c12345-1234-1234-1234-123456789abc')
AND NOT EXISTS (
  SELECT 1 FROM public.broker_profiles WHERE user_id = profiles.id
);

-- 3. Populate broker_profiles (vibe vectors, specialties, templates, professional metrics, slugs, is_public)
UPDATE public.broker_profiles
SET 
  specialty_regions = '{"강남구 GBD", "서초구 GBD"}',
  specialty_assets = '{"오피스 빌딩", "중소형 빌딩"}',
  bio = '홍길동 중개사는 15년 경력의 상업용 부동산 전문가로, 테헤란로 일대의 대형 오피스 빌딩 매매 및 기업 사옥 이전을 성공적으로 조율해 왔습니다.',
  is_verified = true,
  vibe_vector = '{"warmth": 0.85, "energy": 0.35, "polish": 0.70, "authentic": 0.90, "heritage": 0.80, "futuristic": 0.20, "playful": 0.30}'::jsonb,
  vibe_vti = 'Calm-Care',
  vibe_complement = '{"warmth": 0.20, "energy": 0.80, "polish": 0.75, "authentic": 0.25, "heritage": 0.30, "futuristic": 0.85, "playful": 0.70}'::jsonb,
  vibe_template_id = 'CC-01',
  vibe_valence = 0.88,
  vibe_trust = 0.94,
  vibe_analyzed_at = now(),
  license_number = '11680-2024-00123',
  career_start_year = 2011,
  total_deal_count_self = 45,
  deal_size_range = '100억 ~ 500억',
  deal_specialty = '{"오피스 매매", "사옥 매입", "토지 개발"}',
  buyer_types = '{"일반 기업", "자산운용사", "고액 자산가"}',
  fee_policy = '법정수수료 준수 (협의 가능)',
  consult_methods = '{"전화", "대면 미팅", "카카오톡"}',
  response_time_hours = 2,
  kakao_channel = 'hong_broker_cre',
  naver_blog_url = 'https://blog.naver.com/hong_cre_deal',
  youtube_url = 'https://youtube.com/@hong_cre_tv',
  linkedin_url = 'https://linkedin.com/in/hong-gildong-cre',
  seo_summary = '홍길동 공인중개사는 GBD(강남 권역)를 기반으로 오피스 빌딩 매매 및 사옥 매입 신뢰도 높은 컨설팅을 제공합니다. 15년 경력의 베테랑 중개인.',
  slug = 'hong-gildong',
  is_public = true
WHERE user_id = 'e1a12345-1234-1234-1234-123456789abc';

UPDATE public.broker_profiles
SET 
  specialty_regions = '{"영등포구 YBD", "마포구 YBD"}',
  specialty_assets = '{"프라임 오피스", "상가 빌딩"}',
  bio = '김철수 중개사는 여의도 금융권 오피스 임대차 시장의 핵심 리더로, 복잡한 임대차 구조를 명확한 숫자로 조율하고 기업의 임차 비용을 극대화하여 절감해 줍니다.',
  is_verified = true,
  vibe_vector = '{"warmth": 0.30, "energy": 0.85, "polish": 0.95, "authentic": 0.40, "heritage": 0.60, "futuristic": 0.80, "playful": 0.20}'::jsonb,
  vibe_vti = 'Focus-Competent',
  vibe_complement = '{"warmth": 0.80, "energy": 0.35, "polish": 0.30, "authentic": 0.85, "heritage": 0.65, "futuristic": 0.30, "playful": 0.75}'::jsonb,
  vibe_template_id = 'FC-01',
  vibe_valence = 0.76,
  vibe_trust = 0.89,
  vibe_analyzed_at = now(),
  license_number = '11560-2023-00456',
  career_start_year = 2016,
  total_deal_count_self = 68,
  deal_size_range = '50억 ~ 300억',
  deal_specialty = '{"사무실 임대차", "리테일 MD 구성", "건물 통임대"}',
  buyer_types = '{"스타트업", "외국계 기업", "프랜차이즈 본사"}',
  fee_policy = '자산관리 수수료 별도 협의',
  consult_methods = '{"전화", "이메일", "대면 미팅"}',
  response_time_hours = 4,
  kakao_channel = 'kim_office_partners',
  naver_blog_url = 'https://blog.naver.com/ybd_office_kim',
  youtube_url = 'https://youtube.com/@ybd_office_master',
  linkedin_url = 'https://linkedin.com/in/kim-chulsoo-office',
  seo_summary = '김철수 공인중개사는 YBD(여의도 권역) 전문으로 사무실 임대차 및 리테일 MD 구성 등 기업 임차 자문을 수행합니다.',
  slug = 'kim-chulsoo',
  is_public = true
WHERE user_id = 'e2b12345-1234-1234-1234-123456789abc';

UPDATE public.broker_profiles
SET 
  specialty_regions = '{"중구 CBD", "종로구 CBD"}',
  specialty_assets = '{"지식산업센터", "물류창고"}',
  bio = '이영희 중개사는 전통적인 도심권 빌딩 시장의 노하우를 바탕으로 최신 물류 자산과 지식산업센터 등 신규 상업 자산 밸류업에 특화된 컨설팅을 제공합니다.',
  is_verified = true,
  vibe_vector = '{"warmth": 0.45, "energy": 0.90, "polish": 0.80, "authentic": 0.50, "heritage": 0.30, "futuristic": 0.95, "playful": 0.65}'::jsonb,
  vibe_vti = 'Bold-Futurist',
  vibe_complement = '{"warmth": 0.85, "energy": 0.25, "polish": 0.40, "authentic": 0.80, "heritage": 0.85, "futuristic": 0.20, "playful": 0.45}'::jsonb,
  vibe_template_id = 'BF-01',
  vibe_valence = 0.82,
  vibe_trust = 0.85,
  vibe_analyzed_at = now(),
  license_number = '11110-2022-00789',
  career_start_year = 2018,
  total_deal_count_self = 32,
  deal_size_range = '200억 ~ 800억',
  deal_specialty = '{"물류센터 매매", "지산 통매입", "리모델링 개발"}',
  buyer_types = '{"시행사", "물류기업", "시공사"}',
  fee_policy = '법정 요율 준수',
  consult_methods = '{"전화", "대면 미팅", "줌 화상 미팅"}',
  response_time_hours = 6,
  kakao_channel = 'lee_logistics_cre',
  naver_blog_url = 'https://blog.naver.com/cbd_logistics_lee',
  youtube_url = 'https://youtube.com/@cbd_building_expert',
  linkedin_url = 'https://linkedin.com/in/lee-younghee-cre',
  seo_summary = '이영희 공인중개사는 CBD(도심 권역) 및 전국 물류 창고, 지식산업센터 매매 및 개발을 전문으로 자문하는 밸류업 파트너입니다.',
  slug = 'lee-younghee',
  is_public = true
WHERE user_id = 'e3c12345-1234-1234-1234-123456789abc';

-- 4. Insert mock deals into building_ssot_lite referencing the broker IDs
INSERT INTO public.building_ssot_lite (id, owner_id, created_by_role, input_type, raw_input, area_signal, asset_type, price_band, status)
VALUES
  ('f1111111-1111-1111-1111-111111111111', 'e1a12345-1234-1234-1234-123456789abc', 'broker', 'manual_form', '테헤란로 랜드마크 오피스 빌딩 매매', '강남구 GBD', '오피스 빌딩', '450억', 'public_signal_ready'),
  ('f1111111-1111-1111-1111-222222222222', 'e1a12345-1234-1234-1234-123456789abc', 'broker', 'manual_form', '서초동 사옥용 밸류업 중소형 빌딩', '서초구 GBD', '중소형 빌딩', '180억', 'public_signal_ready'),
  ('f2222222-2222-2222-2222-111111111111', 'e2b12345-1234-1234-1234-123456789abc', 'broker', 'manual_form', '여의도 국제금융로 프라임 오피스 전층 임대', '영등포구 YBD', '프라임 오피스', '보증금 15억 / 월세 1.2억', 'public_signal_ready'),
  ('f3333333-3333-3333-3333-111111111111', 'e3c12345-1234-1234-1234-123456789abc', 'broker', 'manual_form', '종로 우정국로 밸류업용 지식산업센터 통매각', '중구 CBD', '지식산업센터', '580억', 'public_signal_ready')
ON CONFLICT (id) DO NOTHING;
