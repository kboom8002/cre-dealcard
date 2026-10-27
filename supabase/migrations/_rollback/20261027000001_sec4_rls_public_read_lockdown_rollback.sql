-- ROLLBACK for 20261027000001_sec4_rls_public_read_lockdown.sql
-- ⚠️ 원본 공개 정책(0110:74-77, 0121:17, 20260713003746:22-27, 00002:15-31)을 그대로 복원한다
--    = anon 키로 assets/deals/lease_units/deal_parties/im_edit_diffs 전체 읽기, im_generation_jobs 전체 읽기·쓰기,
--      submitted gate_requests 읽기가 다시 열린다. 비상 복구용으로만 사용.
--    운영이 원본과 달랐다면 마이그레이션 헤더의 [적용 전] pg_policies 스냅샷으로 복원할 것.
--    (일반화 정리(1번)로 이름이 다른 `true` 정책이 drop 됐다면 NOTICE 로그/스냅샷을 보고 수동 재생성)
begin;

do $$
begin
  if to_regclass('public.assets') is not null then
    execute 'drop policy if exists "Public read assets" on public.assets';
    execute 'create policy "Public read assets" on public.assets for select using (true)';
  end if;
  if to_regclass('public.deals') is not null then
    execute 'drop policy if exists "Public read deals" on public.deals';
    execute 'create policy "Public read deals" on public.deals for select using (true)';
  end if;
  if to_regclass('public.lease_units') is not null then
    execute 'drop policy if exists "Public read lease units" on public.lease_units';
    execute 'create policy "Public read lease units" on public.lease_units for select using (true)';
  end if;
  if to_regclass('public.deal_parties') is not null then
    execute 'drop policy if exists "Public read deal parties" on public.deal_parties';
    execute 'create policy "Public read deal parties" on public.deal_parties for select using (true)';
  end if;
  if to_regclass('public.im_edit_diffs') is not null then
    execute 'drop policy if exists "Public read edit diffs" on public.im_edit_diffs';
    execute 'create policy "Public read edit diffs" on public.im_edit_diffs for select using (true)';
  end if;

  if to_regclass('public.im_generation_jobs') is not null then
    execute 'drop policy if exists "Service role full access" on public.im_generation_jobs';
    execute 'create policy "Service role full access" on public.im_generation_jobs for all using (true) with check (true)';
    execute 'drop policy if exists "Users can read own jobs" on public.im_generation_jobs';
    execute 'create policy "Users can read own jobs" on public.im_generation_jobs for select using (auth.uid() = user_id)';
  end if;

  if to_regclass('public.gate_requests') is not null then
    execute 'drop policy if exists "gate_requests_select_building_owner" on public.gate_requests';
    execute 'drop policy if exists "gate_requests_insert_own" on public.gate_requests';
    execute 'drop policy if exists "gate_requests_insert_anon" on public.gate_requests';
    execute $p$create policy "gate_requests_insert_anon" on public.gate_requests
              for insert to anon, authenticated
              with check (requester_id is null or requester_id = auth.uid())$p$;
    execute 'drop policy if exists "gate_requests_anon_select_submitted" on public.gate_requests';
    execute $p$create policy "gate_requests_anon_select_submitted" on public.gate_requests
              for select to anon using (status = 'submitted')$p$;
  end if;
end $$;

commit;
