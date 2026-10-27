-- ============================================================================
-- 20261027000001_sec4_rls_public_read_lockdown.sql
-- 목적  : P0-SEC / SEC-4 — anon(공개) 키로 핵심 거래·임대·작업 데이터를 통째로 읽을 수 있던 RLS 정책 제거
-- 근거  : docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §1.1 SEC-4
-- 적용  : Supabase SQL Editor 에서 **수동** 적용 (운영). 저장소에는 마이그레이션 자동 러너가 없다.
--         (package.json 에 supabase 스크립트 없음, .github/workflows/* 는 mock Supabase URL 로 빌드/테스트만 수행,
--          `main` push → Vercel 배포는 앱 코드만 배포하고 DB 마이그레이션은 적용하지 않는다.)
--
-- ── 변경 요약 (before → after) ───────────────────────────────────────────────
--   assets        "Public read assets"        SELECT USING(true) roles={public} → DROP (service_role 전용; 서비스 키는 RLS 우회)
--   deals         "Public read deals"         SELECT USING(true) roles={public} → DROP
--   lease_units   "Public read lease units"   SELECT USING(true) roles={public} → DROP
--   deal_parties  "Public read deal parties"  SELECT USING(true) roles={public} → DROP (연락처 PII 포함)
--   im_edit_diffs "Public read edit diffs"    SELECT USING(true) roles={public} → DROP
--   im_generation_jobs "Service role full access" ALL USING(true) WITH CHECK(true) roles={public}
--                 → DROP (TO 절이 없어 anon 이 모든 작업 읽기/쓰기/삭제 가능했음. service_role 은 RLS 우회라 정책 불필요)
--   im_generation_jobs "Users can read own jobs" SELECT roles={public} → TO authenticated 로 축소 (조건 동일: auth.uid() = user_id)
--   gate_requests "gate_requests_anon_select_submitted" SELECT TO anon USING(status='submitted') → DROP
--   gate_requests "gate_requests_insert_anon" INSERT TO anon,authenticated → DROP 후
--                 "gate_requests_insert_own" INSERT TO authenticated WITH CHECK(requester_id = auth.uid()) 재생성
--                 (공개 요청 생성은 /api/gate-requests · /api/public/gate/submit 서버 라우트가 service_role 로 수행)
--   gate_requests + "gate_requests_select_building_owner" SELECT TO authenticated
--                 USING(target_broker_id = auth.uid() OR building_ssot_lite.owner_id = auth.uid())
--                 (브로커 브라우저 화면 GateRequestsInbox · funnel 이 자기 건물의 요청을 읽는 정당한 경로)
--   + 일반화 정리: 위 7개 테이블에서 roles ∩ {public, anon, authenticated} ≠ ∅ 이고 qual/with_check = 'true' 인
--     정책은 운영 정책명이 원본과 달라도 모두 DROP (NOTICE 로 출력)
--   ※ 0110/0121 의 "Service role full …" (USING auth.role()='service_role') 정책은 무해하므로 유지.
--
-- ── 코드 의존 점검 결과 (2026-10-27 grep, src/ 전체 `.from('<table>')` + 임베드 select) ──────────
--   * assets / deals / lease_units / deal_parties / im_edit_diffs / im_generation_jobs:
--       전부 createServiceClient() (service_role) 경유 — 브라우저/anon/세션 클라이언트 사용처 없음.
--       (lib/ssot-adapter.ts, domain/building/mobile-im/lease-adapter.ts, domain/matching/spec-matcher.ts,
--        api/broker/buildings/[id]/lease, api/public/gate/submit, api/public/im-pro/**, api/broker/im-lite/**)
--   * gate_requests 비-service 사용처 (둘 다 authenticated 세션 브라우저 클라이언트, anon 아님):
--       - src/app/(broker)/broker/deal-card/[id]/GateRequestsInbox.tsx:31  select * eq building_id
--       - src/app/(broker)/broker/funnel/page.tsx:77                       count by building_id ∈ 내 건물
--       → 기존에는 authenticated 용 owner 정책이 없어(select_own=요청자 본인, admin_select 만 존재) 일반 브로커에게는
--         0건이 보였을 가능성이 높다. 본 마이그레이션의 building_owner SELECT 정책으로 정상 동작한다.
--       - GateRequestsInbox.tsx:49 의 브라우저 직접 UPDATE 는 admin_update 정책만 있어 비관리자에겐 무효(0행) —
--         본 마이그레이션은 UPDATE 권한을 넓히지 않는다(감사로그 우회 방지). /api/gate-requests/[id]/review 로 전환 필요.
--   * 나머지 gate_requests 접근(admin, nda, inbox API, review, snapshot, domain/gate/*, cron) 은 모두 service_role.
--   * 외부 앱(cre-aipage / cre-fullim)이 anon 키로 위 테이블을 읽는지는 이 저장소에서 검증 불가 → 적용 전 확인 권장.
--
-- ── [적용 전] 스냅샷 쿼리 (결과를 저장해 두고 롤백 시 참조) ──────────────────────
--   select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('assets','deals','lease_units','deal_parties','im_edit_diffs','im_generation_jobs','gate_requests')
--   order by tablename, policyname;
--
-- ── 적용 절차 ───────────────────────────────────────────────────────────────
--   1. 위 [적용 전] 쿼리를 SQL Editor 에서 실행 → 결과 CSV 저장.
--   2. 이 파일 전체를 SQL Editor 에 붙여넣어 실행 (begin/commit 포함, 하단 DO 블록이 자동 단언 → 실패 시 전체 롤백).
--      출력 NOTICE 로 실제 DROP/ALTER 된 정책 목록 확인.
--   3. 아래 [적용 후] 쿼리 실행 → 기대 결과와 대조.
--   4. anon 키 수동 프로브 (데이터 변경 없음; 0행/빈 배열 기대):
--        curl "$SUPABASE_URL/rest/v1/deals?select=id&limit=1"            -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--        curl "$SUPABASE_URL/rest/v1/deal_parties?select=id&limit=1"     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--        curl "$SUPABASE_URL/rest/v1/im_generation_jobs?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--        curl "$SUPABASE_URL/rest/v1/gate_requests?select=id&limit=1"    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   5. 앱 스모크: 브로커 로그인 → 딜카드 상세 '자료 요청' 인박스, /broker/funnel, IM 생성(작업 상태 폴링), 공개 Gate 요청 제출.
--
-- ── [적용 후] 검증 쿼리 (기대값) ────────────────────────────────────────────────
--   select tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('assets','deals','lease_units','deal_parties','im_edit_diffs','im_generation_jobs','gate_requests')
--   order by 1, 2;
--   기대: assets/deals/lease_units/deal_parties/im_edit_diffs → "Service role full …" 만 남음
--         im_generation_jobs → "Users can read own jobs" (roles={authenticated}) 만 남음
--         gate_requests → select_own / admin_select / admin_update / insert_own / select_building_owner (anon 정책 0개)
--         어떤 행도 qual='true' 또는 with_check='true' 가 아님
--
-- [롤백]  supabase/migrations/_rollback/20261027000001_sec4_rls_public_read_lockdown_rollback.sql
--         (원본 정책 재생성 = 보안 구멍 재개방. 비상시에만. 운영이 원본과 달랐다면 [적용 전] 스냅샷으로 복원)
-- ============================================================================

begin;

-- ── 1. 일반화 정리: public/anon/authenticated 에 열린 `true` 정책 제거 (이름 불문) ─────────
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('assets','deals','lease_units','deal_parties','im_edit_diffs','im_generation_jobs','gate_requests')
      and (roles && array['public','anon','authenticated']::name[])
      and (qual = 'true' or with_check = 'true')
  loop
    raise notice 'DROP POLICY %.% (cmd=%, roles=%, qual=%, with_check=%)', r.tablename, r.policyname, r.cmd, r.roles, r.qual, r.with_check;
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ── 2. 이름 기반 명시 정리 + 재생성 (테이블이 없으면 건너뜀, 멱등) ──────────────────
do $$
begin
  -- 2-1. 0110_ontology_schema.sql:74-77
  if to_regclass('public.assets') is not null then
    execute 'drop policy if exists "Public read assets" on public.assets';
    execute 'alter table public.assets enable row level security';
  else
    raise notice 'public.assets 없음 → 건너뜀';
  end if;

  if to_regclass('public.deals') is not null then
    execute 'drop policy if exists "Public read deals" on public.deals';
    execute 'alter table public.deals enable row level security';
  else
    raise notice 'public.deals 없음 → 건너뜀';
  end if;

  if to_regclass('public.lease_units') is not null then
    execute 'drop policy if exists "Public read lease units" on public.lease_units';
    execute 'alter table public.lease_units enable row level security';
  else
    raise notice 'public.lease_units 없음 → 건너뜀';
  end if;

  if to_regclass('public.deal_parties') is not null then
    execute 'drop policy if exists "Public read deal parties" on public.deal_parties';
    execute 'alter table public.deal_parties enable row level security';
  else
    raise notice 'public.deal_parties 없음 → 건너뜀';
  end if;

  -- 2-2. 0121_edit_diffs.sql:17
  if to_regclass('public.im_edit_diffs') is not null then
    execute 'drop policy if exists "Public read edit diffs" on public.im_edit_diffs';
    execute 'alter table public.im_edit_diffs enable row level security';
  else
    raise notice 'public.im_edit_diffs 없음 → 건너뜀';
  end if;

  -- 2-3. 20260713003746_im_generation_jobs.sql:22-27
  if to_regclass('public.im_generation_jobs') is not null then
    execute 'drop policy if exists "Service role full access" on public.im_generation_jobs';
    execute 'drop policy if exists "Users can read own jobs" on public.im_generation_jobs';
    execute $p$create policy "Users can read own jobs" on public.im_generation_jobs
              for select to authenticated using (auth.uid() = user_id)$p$;
    execute 'alter table public.im_generation_jobs enable row level security';
  else
    raise notice 'public.im_generation_jobs 없음 → 건너뜀';
  end if;

  -- 2-4. 00002_rls_anon_patch.sql:15-31 (gate_requests)
  if to_regclass('public.gate_requests') is not null then
    execute 'drop policy if exists "gate_requests_anon_select_submitted" on public.gate_requests';
    execute 'drop policy if exists "gate_requests_insert_anon" on public.gate_requests';
    execute 'drop policy if exists "gate_requests_insert_own" on public.gate_requests';
    execute $p$create policy "gate_requests_insert_own" on public.gate_requests
              for insert to authenticated with check (requester_id = auth.uid())$p$;
    execute 'drop policy if exists "gate_requests_select_building_owner" on public.gate_requests';
    execute $p$create policy "gate_requests_select_building_owner" on public.gate_requests
              for select to authenticated using (
                target_broker_id = auth.uid()
                or exists (
                  select 1 from public.building_ssot_lite b
                  where b.id = gate_requests.building_id
                    and b.owner_id = auth.uid()
                )
              )$p$;
    execute 'alter table public.gate_requests enable row level security';
  else
    raise notice 'public.gate_requests 없음 → 건너뜀';
  end if;
end $$;

-- ── 3. 자동 검증 (실패 시 예외 → 트랜잭션 전체 롤백) ─────────────────────────────
do $$
declare
  bad int;
begin
  -- 3-1. 7개 테이블에 public/anon/authenticated 대상 `true` 정책 잔존 여부
  select count(*) into bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('assets','deals','lease_units','deal_parties','im_edit_diffs','im_generation_jobs','gate_requests')
    and (roles && array['public','anon','authenticated']::name[])
    and (qual = 'true' or with_check = 'true');
  if bad > 0 then
    raise exception '검증 실패: public/anon/authenticated true 정책 % 건 잔존', bad;
  end if;

  -- 3-2. 7개 테이블에 anon 대상 정책 0개
  select count(*) into bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('assets','deals','lease_units','deal_parties','im_edit_diffs','im_generation_jobs','gate_requests')
    and (roles && array['anon']::name[]);
  if bad > 0 then
    raise exception '검증 실패: anon 정책 % 건 잔존', bad;
  end if;

  -- 3-3. 원본 공개 정책명이 하나도 남지 않았는지
  select count(*) into bad
  from pg_policies
  where schemaname = 'public'
    and policyname in ('Public read assets','Public read deals','Public read lease units','Public read deal parties',
                       'Public read edit diffs','Service role full access','gate_requests_anon_select_submitted',
                       'gate_requests_insert_anon')
    and tablename in ('assets','deals','lease_units','deal_parties','im_edit_diffs','im_generation_jobs','gate_requests');
  if bad > 0 then
    raise exception '검증 실패: 원본 공개 정책 % 건 잔존', bad;
  end if;

  -- 3-4. RLS enabled (존재하는 테이블만)
  select count(*) into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('assets','deals','lease_units','deal_parties','im_edit_diffs','im_generation_jobs','gate_requests')
    and c.relkind = 'r'
    and not c.relrowsecurity;
  if bad > 0 then
    raise exception '검증 실패: RLS 비활성 테이블 % 개', bad;
  end if;
end $$;

commit;
