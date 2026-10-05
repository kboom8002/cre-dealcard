-- ============================================================================
-- scripts/magazine-health.sql — 매거진 주간 운영 헬스 체크 (O-01, 읽기 전용)
-- 실행 : Supabase SQL Editor 에 통째로 붙여넣어 실행(주 1회, 월요일 weekly-magazine cron 직후 권장). 결과는 한 표.
-- 안전 : SELECT 만 수행한다. 세션 임시 함수(pg_temp)만 만들며 public 스키마·데이터는 변경하지 않는다.
-- 상태 : OK | WARN | INFO | NOT_MIGRATED(해당 테이블/컬럼이 아직 운영에 없음 — to_regclass/information_schema 가드) | ERROR(조회 실패, hint 참고)
-- PII  : 건수·비율만 출력한다(이름·전화·이메일 미출력).
-- 임계값은 각 항목 hint 에 명시. 임계 초과(WARN)가 2주 연속이면 remediation_plan §19 리스크 레지스터에 올린다.
-- ============================================================================
create or replace function pg_temp.magazine_health()
returns table(o_n int, o_metric text, o_value text, o_status text, o_hint text)
language plpgsql
as $fn$
declare
  v_run int;           v_v numeric;     v_total bigint; v_null bigint; v_pct numeric;
  v_cnt bigint;        v_txt text;      v_has boolean;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  -- 1) 동일 sentiment 연속 N일 (social_sentiment 일 평균이 같은 값으로 연속된 일수 — 수집 정지/폴백 상수 감지)
  begin
    if to_regclass('public.social_sentiment') is null then
      return query select 1, 'sentiment 동일값 연속 일수', null::text, 'NOT_MIGRATED', 'social_sentiment 테이블 없음';
    else
      with d as (select analysis_date, round(avg(sentiment_score), 2) as v
                   from public.social_sentiment group by analysis_date order by analysis_date desc limit 14),
           r as (select v, row_number() over (order by analysis_date desc) as rn from d)
      select coalesce((select min(rn) - 1 from r where v is distinct from (select v from r where rn = 1)), (select count(*) from r))::int,
             (select v from r where rn = 1)
        into v_run, v_v;
      return query select 1, 'sentiment 동일값 연속 일수 (최근 14일 내)', coalesce(v_run::text, '0') || '일 (값 ' || coalesce(v_v::text, '-') || ')',
                          case when coalesce(v_run, 0) >= 3 then 'WARN' else 'OK' end, '3일 이상 동일이면 수집 정지·폴백 상수 의심(D2-02)';
      select count(*) filter (where mention_count = 340), count(*) into v_cnt, v_total from public.social_sentiment;
      return query select 1, 'mention_count=340 비율(추정 상수 잔존)', v_cnt || '/' || v_total,
                          case when v_cnt > 0 then 'WARN' else 'OK' end, '0 이어야 함(정리 C03-09 후)';
    end if;
  exception when others then
    return query select 1, 'sentiment 동일값 연속 일수', null::text, 'ERROR', sqlerrm;
  end;

  -- 2) edition_id NULL 비율 (analytics_events)
  begin
    if to_regclass('public.magazine_analytics_events') is null then
      return query select 2, 'analytics edition_id NULL 비율', null::text, 'NOT_MIGRATED', 'magazine_analytics_events 테이블 없음';
    else
      select count(*), count(*) filter (where edition_id is null) into v_total, v_null from public.magazine_analytics_events;
      v_pct := case when v_total = 0 then 0 else round(100.0 * v_null / v_total, 1) end;
      return query select 2, 'analytics edition_id NULL 비율(전체)', v_null || '/' || v_total || ' (' || v_pct || '%)',
                          case when v_total = 0 then 'INFO' when v_pct > 20 then 'WARN' else 'OK' end, '20% 초과면 에디션 귀속 실패(D2-25). 0건이면 이벤트 수집 자체 없음';
      select count(*), count(*) filter (where edition_id is null) into v_total, v_null
        from public.magazine_analytics_events where created_at >= now() - interval '7 days';
      v_pct := case when v_total = 0 then 0 else round(100.0 * v_null / v_total, 1) end;
      return query select 2, 'analytics edition_id NULL 비율(최근 7일)', v_null || '/' || v_total || ' (' || v_pct || '%)',
                          case when v_total = 0 then 'INFO' when v_pct > 5 then 'WARN' else 'OK' end, '신규 유입분이 5% 초과면 E-04 수정 미반영';
    end if;
  exception when others then
    return query select 2, 'analytics edition_id NULL 비율', null::text, 'ERROR', sqlerrm;
  end;

  -- 3) uuid 키 구독자 수 (magazine_subscribers.broker_id 가 uuid 형식)
  begin
    if to_regclass('public.magazine_subscribers') is null then
      return query select 3, 'uuid 키 구독자 수', null::text, 'NOT_MIGRATED', 'magazine_subscribers 테이블 없음';
    else
      select count(*) filter (where broker_id ~* uuid_re), count(*) into v_cnt, v_total from public.magazine_subscribers;
      return query select 3, 'uuid 키 구독자 수(broker_id 가 uuid)', v_cnt || '/' || v_total,
                          case when v_cnt > 0 then 'WARN' else 'OK' end, '0 이어야 함. slug 배포 경로에서 제외됨(D2-08, 정리 C03-10/000015)';
    end if;
  exception when others then
    return query select 3, 'uuid 키 구독자 수', null::text, 'ERROR', sqlerrm;
  end;

  -- 4) slug NULL 브로커 수
  begin
    if to_regclass('public.broker_profiles') is null then
      return query select 4, 'slug NULL 브로커 수', null::text, 'NOT_MIGRATED', 'broker_profiles 테이블 없음';
    else
      select count(*) filter (where slug is null), count(*) into v_cnt, v_total from public.broker_profiles;
      return query select 4, 'slug NULL 브로커 수', v_cnt || '/' || v_total,
                          case when v_cnt > 0 then 'WARN' else 'OK' end, '브로커 본인이 SlugSetupGate 로 설정. 활성 브로커(공개 매거진 사용자)가 NULL 이면 우선 안내(D2-20)';
    end if;
  exception when others then
    return query select 4, 'slug NULL 브로커 수', null::text, 'ERROR', sqlerrm;
  end;

  -- 5) 이벤트 0건 브로커 — 최근 28일 내 발행된 에디션이 있으나 그 에디션들에 analytics 이벤트가 0건인 브로커
  begin
    if to_regclass('public.magazine_editions') is null or to_regclass('public.magazine_analytics_events') is null then
      return query select 5, '이벤트 0건 브로커(최근 28일 발행)', null::text, 'NOT_MIGRATED', 'magazine_editions 또는 analytics 테이블 없음';
    else
      select count(*) into v_cnt from (
        select e.broker_id
          from public.magazine_editions e
         where e.status = 'published' and e.published_at >= now() - interval '28 days'
         group by e.broker_id
        having not exists (select 1 from public.magazine_analytics_events ev
                            join public.magazine_editions e2 on e2.id = ev.edition_id
                           where e2.broker_id = e.broker_id and ev.created_at >= now() - interval '28 days')
      ) x;
      select count(distinct broker_id) into v_total from public.magazine_editions
       where status = 'published' and published_at >= now() - interval '28 days';
      return query select 5, '이벤트 0건 브로커(최근 28일 발행 에디션 기준)', v_cnt || '/' || v_total,
                          case when v_total = 0 then 'INFO' when v_cnt > 0 then 'WARN' else 'OK' end, '발행했는데 조회 이벤트 0 이면 비콘(visitor/edition 귀속) 고장 의심(D2-25)';
    end if;
  exception when others then
    return query select 5, '이벤트 0건 브로커', null::text, 'ERROR', sqlerrm;
  end;

  -- 6) dispatch blocked 사유 분포 (최근 7일)
  begin
    if to_regclass('public.magazine_dispatch_logs') is null then
      return query select 6, 'dispatch blocked 사유 분포(7일)', null::text, 'NOT_MIGRATED', '000005 magazine_dispatch_logs 미적용 — 적용 전에는 발송이 전부 LEDGER_UNAVAILABLE 로 차단됨(정상)';
    else
      select coalesce(string_agg(coalesce(blocked_reason, '(null)') || '=' || c, ', ' order by c desc), '(없음)')
        into v_txt
        from (select blocked_reason, count(*) as c from public.magazine_dispatch_logs
               where status = 'blocked' and created_at >= now() - interval '7 days' group by blocked_reason) b;
      select count(*) into v_cnt from public.magazine_dispatch_logs
       where status = 'blocked' and created_at >= now() - interval '7 days' and blocked_reason in ('LEDGER_UNAVAILABLE','NO_PROVIDER','MISSING_UNSUB_LINK');
      return query select 6, 'dispatch blocked 사유 분포(7일)', v_txt,
                          case when v_cnt > 0 then 'WARN' else 'INFO' end, 'LEDGER_UNAVAILABLE/NO_PROVIDER/MISSING_UNSUB_LINK 는 설정 결함. NO_CONSENT 대량은 정상(동의 백필 금지)';
      select count(*) into v_cnt from public.magazine_dispatch_logs where status = 'queued' and created_at < now() - interval '10 minutes';
      return query select 6, 'dispatch queued 10분 초과(발송 중 장애 의심)', v_cnt::text,
                          case when v_cnt > 0 then 'WARN' else 'OK' end, '0 이어야 함';
    end if;
  exception when others then
    return query select 6, 'dispatch blocked 사유 분포', null::text, 'ERROR', sqlerrm;
  end;

  -- 7) cron_runs 실패 (최근 7일)
  begin
    if to_regclass('public.magazine_cron_runs') is null then
      return query select 7, 'cron_runs 실패(7일)', null::text, 'NOT_MIGRATED', '000012 magazine_cron_runs 미적용 — cron 은 로그만 남김';
    else
      select count(*) filter (where status = 'failed'), count(*) into v_cnt, v_total
        from public.magazine_cron_runs where created_at >= now() - interval '7 days';
      select coalesce(string_agg(coalesce(reason, '(null)') || '=' || c, ', ' order by c desc), '(없음)') into v_txt
        from (select reason, count(*) as c from public.magazine_cron_runs
               where status = 'failed' and created_at >= now() - interval '7 days' group by reason order by c desc limit 5) f;
      return query select 7, 'cron_runs 실패(7일)', v_cnt || '/' || v_total || ' — ' || v_txt,
                          case when v_cnt > 0 then 'WARN' when v_total = 0 then 'INFO' else 'OK' end, '실패 사유 상위 5. 실행 0건이면 cron 미동작/비활성(MAGAZINE_CRON_GENERATE_ENABLED)';
    end if;
  exception when others then
    return query select 7, 'cron_runs 실패(7일)', null::text, 'ERROR', sqlerrm;
  end;

  -- 8) 22P02 / 42703 관련 지표 — DB 로그는 SQL 로 못 읽으므로 원인 지표를 대신 측정
  begin
    -- 8a) 42703(없는 컬럼) 위험: 코드가 쓰는 핵심 컬럼 중 운영에 없는 것 개수
    select count(*) into v_cnt from (values
        ('magazine_subscribers','broker_user_id'), ('magazine_subscribers','privacy_consent_at'), ('magazine_subscribers','marketing_consent_at'),
        ('magazine_subscribers','confirm_status'), ('magazine_subscribers','phone_e164'), ('magazine_subscribers','night_consent'),
        ('magazine_issues','broker_user_id'), ('magazine_editions','broker_user_id'), ('magazine_analytics_events','broker_user_id')
      ) as want(t, c)
     where to_regclass('public.' || want.t) is not null
       and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = want.t and column_name = want.c);
    return query select 8, '42703 위험: 기대 컬럼 미적용 수(테이블 존재 기준)', v_cnt::text,
                        case when v_cnt > 0 then 'WARN' else 'OK' end, '>0 이면 000006/000011 미적용 — 해당 컬럼을 쓰는 코드는 503/NOT_MIGRATED 로 degrade 해야 함';
    -- 8b) 22P02(uuid 컬럼에 slug 투입) 위험: uuid 컬럼 activity_events.broker_id 에 매거진 이벤트가 귀속 없이 쌓이는 비율
    select count(*) filter (where broker_id is null), count(*) into v_null, v_total from public.activity_events where event_type like 'magazine%';
    return query select 8, '22P02 흔적: magazine_* activity_events broker_id NULL', v_null || '/' || v_total,
                        case when v_null > 0 then 'WARN' else 'OK' end, 'slug 를 uuid 컬럼에 넣다 실패하던 경로의 흔적(D2-15/I-04). 0 이어야 함';
    return query select 8, '22P02/42703 실제 로그 카운트', '(SQL 로 조회 불가)', 'INFO',
                        'Supabase Dashboard → Logs Explorer(Postgres): select count(*) from postgres_logs cross join unnest(metadata) m cross join unnest(m.parsed) p where event_message ~ ''22P02|42703'' and timestamp > now() - interval ''7 days'' / Vercel Logs 에서 "invalid input syntax for type uuid" · "does not exist" 검색';
  exception when others then
    return query select 8, '22P02/42703 지표', null::text, 'ERROR', sqlerrm;
  end;
end
$fn$;

select o_n as n, o_metric as metric, o_value as value, o_status as status, o_hint as hint
  from pg_temp.magazine_health()
 order by o_n, o_status desc, o_metric;
