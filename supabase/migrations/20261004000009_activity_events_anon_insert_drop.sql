-- ============================================================================
-- 20261004000009_activity_events_anon_insert_drop.sql       ★ 전역 영향 — 검토 후 적용 ★
-- 목적  : activity_events 의 `activity_events_insert_anon` (00002_rls_anon_patch.sql:37-40,
--         TO anon, authenticated WITH CHECK (true)) 제거 → 익명 키로 이벤트 위조·스팸 INSERT 차단.
--         authenticated 용 `events_insert_authenticated`(00001:566) 는 유지(없으면 재생성).
-- 결함  : S2-08 (전역)
--
-- ⚠ 적용 전 "IM·딜카드 공개 페이지 의존 확인":
--   * 이 저장소 점검 결과(2026-10-05) — anon(비로그인) 키로 activity_events 를 INSERT 하는 코드:
--       - 서버 라우트/도메인의 INSERT 는 전부 createServiceClient(RLS 우회): api/public/magazine/{subscribe,unsubscribe},
--         api/broker/{memo,buildings/[id]/enrich-from-leasing}, domain/{magazine/distribute-*, matching/auto-matcher,
--         notification/hot-lead-alert, notification/im-view-alert}
--       - 브라우저(authenticated 세션) INSERT 3곳은 `events_insert_authenticated` 로 계속 동작:
--         (broker)/broker/magazine-editor/page.tsx:720, (broker)/broker/funnel(select), components/feedback/SurveyProvider.tsx:39
--       - ⚠ SurveyProvider.tsx:39 는 로그인 여부를 확인하지 않고 browser client 로 INSERT 한다. SurveyProvider 는
--         src/app/layout.tsx:52 에서 **전역 마운트**되므로 비로그인 방문자(IM·딜카드·매거진 공개 페이지)의 설문/피드백 이벤트가
--         이 마이그레이션 후 조용히 실패(42501)한다. → 적용 전에 SurveyProvider INSERT 를 서버 API(서비스 키)로 옮기거나,
--         설문 이벤트 손실을 감수한다는 결정이 필요 (소유자: IM/공통 UI 담당에게 요청).
--   * **저장소 밖**(IM 창/외부 앱)이 anon 키로 activity_events 에 INSERT 하는지는 확인 불가 → 적용 전 IM 창에 확인.
--
-- [적용 전 확인 쿼리]
--   select policyname, roles, cmd, with_check from pg_policies where tablename = 'activity_events';
--   select source_app, count(*) from public.activity_events group by 1 order by 2 desc limit 20;   -- 이벤트 출처 파악
-- [적용 후 검증 쿼리]
--   select policyname, roles, cmd from pg_policies where tablename = 'activity_events';  -- anon 정책 없음, events_insert_authenticated 존재
--   -- anon 키로 insert 시도 → 42501 (scripts/rls-probe.mjs 확장 프로브 또는 수동)
-- [롤백]  supabase/migrations/_rollback/20261004000009_activity_events_anon_insert_drop_rollback.sql
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.activity_events') is null then
    raise exception '000009 중단: public.activity_events 가 없습니다.';
  end if;
end $$;

drop policy if exists "activity_events_insert_anon" on public.activity_events;

-- 일반화: anon/public 대상 INSERT true 정책 잔존 시 제거 (운영 정책명이 달라도 잡는다)
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'activity_events' and cmd = 'INSERT'
      and (roles && array['public','anon']::name[]) and with_check = 'true'
  loop
    raise notice 'DROP POLICY activity_events.%', r.policyname;
    execute format('drop policy if exists %I on public.activity_events', r.policyname);
  end loop;

  -- authenticated INSERT 보장 (00001 원본)
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='activity_events'
                 and policyname='events_insert_authenticated') then
    create policy "events_insert_authenticated" on public.activity_events
      for insert to authenticated with check (true);
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='activity_events'
             and cmd in ('INSERT','ALL') and (roles && array['public','anon']::name[])) then
    raise exception '검증 실패: activity_events 에 public/anon INSERT 정책이 남아 있습니다.';
  end if;
end $$;

commit;
