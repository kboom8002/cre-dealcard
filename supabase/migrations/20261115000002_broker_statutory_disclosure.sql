-- ============================================================================
-- 20261115000002_broker_statutory_disclosure.sql
-- 목적: 공인중개사법 제18조의2 및 시행령 제17조의2 5대 법정 표시의무 지원을 위한
--       `broker_profiles` 컬럼 보강(`representative_name`, `office_address`) 및
--       공개 뷰 `public.broker_public_profiles` 안전 갱신(기존 컬럼 순서 보존 + 법정 컬럼 추가).
-- ============================================================================
begin;

ALTER TABLE public.broker_profiles
  ADD COLUMN IF NOT EXISTS representative_name text,
  ADD COLUMN IF NOT EXISTS office_address text;

do $$
declare
  fallback_candidates text[] := array[
    'id','slug','name','card_name','card_title','bio','seo_summary','is_verified','is_public',
    'specialty_regions','specialty_assets','deal_specialty','deal_types_ratio','buyer_types','preferred_price_range','deal_size_range',
    'languages','fee_policy','consult_methods','response_time_hours','career_start_year','total_deal_count_self',
    'association','license_number','office_reg_number','office_address','office_district','office_dong',
    'logo_company_url','logo_partner_url','avatar_url','photo_url','magazine_cover_image',
    'kakao_channel','naver_blog_url','youtube_url','linkedin_url','faq_items','vibe_vti','vibe_template_id',
    'created_at','updated_at',
    'representative_name'
  ];
  statutory_append text[] := array['office_address', 'office_reg_number', 'representative_name'];
  ordered_cols text[] := array[]::text[];
  col_name text;
  cols_sql text;
begin
  if to_regclass('public.broker_profiles') is null then
    raise exception '20261115000002 중단: public.broker_profiles 가 없습니다.';
  end if;

  if to_regclass('public.broker_public_profiles') is not null then
    -- 기존 view 의 컬럼 순서를 그대로 보존하여 CREATE OR REPLACE VIEW(42P16) 충돌 방지
    select coalesce(array_agg(c.column_name::text order by c.ordinal_position), array[]::text[])
      into ordered_cols
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'broker_public_profiles';

    foreach col_name in array statutory_append loop
      if not (col_name = any (ordered_cols))
         and exists (
           select 1
           from information_schema.columns bp
           where bp.table_schema = 'public'
             and bp.table_name = 'broker_profiles'
             and bp.column_name = col_name
         )
      then
        ordered_cols := array_append(ordered_cols, col_name);
      end if;
    end loop;
  else
    select coalesce(array_agg(c.column_name::text order by array_position(fallback_candidates, c.column_name::text)), array[]::text[])
      into ordered_cols
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'broker_profiles'
      and c.column_name = any (fallback_candidates);
  end if;

  select string_agg(quote_ident(u.col), ', ' order by u.ord)
    into cols_sql
  from unnest(ordered_cols) with ordinality as u(col, ord);

  execute format(
    'create or replace view public.broker_public_profiles as select %s from public.broker_profiles where is_public = true',
    cols_sql
  );
end $$;

revoke all on public.broker_public_profiles from public, anon, authenticated;
grant select on public.broker_public_profiles to anon, authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'broker_public_profiles'
      and column_name in ('user_id','pending_magazine_deals','contact_email','vibe_vector','vibe_complement')
  ) then
    raise exception '검증 실패: broker_public_profiles 에 비공개 컬럼이 포함되었습니다.';
  end if;
end $$;

commit;
