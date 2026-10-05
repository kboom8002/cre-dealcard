-- ============================================================================
-- 20261004000008_broker_public_profiles_view.sql           ★ 전역 영향 — 검토 후 적용 ★
-- 목적  : broker_profiles 의 anon 직접 SELECT(`broker_profiles_public_read`, 00039:52 — is_public=true 행의 **전체 50컬럼**,
--         user_id·pending_magazine_deals·vibe_* 내부값 포함)를 제거하고, 공개 컬럼만 담은 view `broker_public_profiles` 로 대체.
-- 결함  : S2-19 (전역, IM·딜카드 공개 페이지 영향 가능)
--
-- ⚠ 적용 전 반드시 "IM·딜카드 공개 페이지 의존 확인" (아래 grep 결과 + IM 창 확인):
--   * 이 저장소(src/**) 점검 결과(2026-10-05): anon 키·cookie 세션 없이 broker_profiles 를 읽는 코드 **없음**.
--       - 공개 페이지/검색/sitemap/매거진/IM 공개 API 는 전부 createServiceClient (RLS 우회) 사용:
--         (public)/hub, (public)/search, api/public/search, sitemap.ts, api/public/im-lite/**/export, magazine/**
--       - 브라우저(authenticated 세션) 직접 조회 3곳은 `broker_profiles_select_own`(본인 행) 정책으로 계속 동작:
--         magazine-editor/page.tsx:219·344, StageComplete.tsx:51, hooks/useMagazineDraft.ts:50
--       - cookie(server) 클라이언트 5곳도 로그인 사용자의 본인 행 조회: (broker)/broker/page.tsx, actions/auth.ts,
--         api/broker/morning-intelligence, api/broker/profile/logo, api/broker/schedule/confirm
--   * **저장소 밖** 소비자는 확인 불가: 같은 Supabase 프로젝트를 쓰는 외부 앱(NEXT_PUBLIC_AIPAGE_URL / FULLIM / Vercel 별도 배포 등)이
--     anon 키로 broker_profiles 를 직접 읽고 있다면 깨진다 → 적용 전 IM 창·타 앱 담당에게 확인.
--   * 조치 가능 대안: 문제가 생기면 롤백 파일로 정책 복원(즉시).
--
-- [적용 전 확인 쿼리]
--   select policyname, roles, cmd, qual from pg_policies where tablename = 'broker_profiles';
--   select count(*) filter (where is_public) as public_rows, count(*) as all_rows from public.broker_profiles;
-- [적용 후 검증 쿼리]
--   select count(*) from public.broker_public_profiles;                         -- = public_rows
--   select column_name from information_schema.columns where table_name='broker_public_profiles' order by 1;  -- user_id / pending_magazine_deals / vibe_vector 없음
--   -- anon 키로:  GET /rest/v1/broker_profiles?select=slug&limit=1  → []   ,  GET /rest/v1/broker_public_profiles?select=slug&limit=1 → 행 반환
-- [롤백]  supabase/migrations/_rollback/20261004000008_broker_public_profiles_view_rollback.sql
-- ============================================================================
begin;

do $$
declare
  -- 공개 명함/매거진에 필요한 컬럼 후보. 실제 존재하는 컬럼만 view 에 포함(운영 컬럼 차이 흡수).
  -- 제외(비공개): user_id, pending_magazine_deals, contact_email, vibe_vector, vibe_complement, vibe_valence, vibe_trust, vibe_analyzed_at
  candidates text[] := array[
    'id','slug','name','card_name','card_title','bio','seo_summary','is_verified','is_public',
    'specialty_regions','specialty_assets','deal_specialty','deal_types_ratio','buyer_types','preferred_price_range','deal_size_range',
    'languages','fee_policy','consult_methods','response_time_hours','career_start_year','total_deal_count_self',
    'association','license_number','office_reg_number','office_address','office_district','office_dong',
    'logo_company_url','logo_partner_url','avatar_url','photo_url','magazine_cover_image',
    'kakao_channel','naver_blog_url','youtube_url','linkedin_url','faq_items','vibe_vti','vibe_template_id',
    'created_at','updated_at'
  ];
  cols text;
begin
  if to_regclass('public.broker_profiles') is null then
    raise exception '000008 중단: public.broker_profiles 가 없습니다.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='broker_profiles' and column_name='is_public') then
    raise exception '000008 중단: broker_profiles.is_public 컬럼이 없습니다.';
  end if;

  select string_agg(quote_ident(c.column_name), ', ' order by array_position(candidates, c.column_name::text))
    into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'broker_profiles' and c.column_name = any (candidates);

  execute format('create or replace view public.broker_public_profiles as select %s from public.broker_profiles where is_public = true', cols);
end $$;

-- view 는 소유자 권한으로 실행(RLS 우회) → anon/authenticated 에는 view SELECT 만 부여
revoke all on public.broker_public_profiles from public, anon, authenticated;
grant select on public.broker_public_profiles to anon, authenticated, service_role;

-- 원본 anon 직접 조회 정책 제거
drop policy if exists "broker_profiles_public_read" on public.broker_profiles;

do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='broker_profiles' and cmd in ('SELECT','ALL')
             and (roles && array['public','anon']::name[])) then
    raise exception '검증 실패: broker_profiles 에 public/anon SELECT 정책이 남아 있습니다.';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='broker_public_profiles'
               and column_name in ('user_id','pending_magazine_deals','contact_email','vibe_vector','vibe_complement')) then
    raise exception '검증 실패: view 에 비공개 컬럼이 포함되었습니다.';
  end if;
end $$;

commit;
