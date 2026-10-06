# 매거진 마이그레이션 적용 런북 (2026-10-04 audit / Wave 1 A1)

> SQL 은 **작성만** 되었고 운영 DB 에 적용되지 않았다. 사용자가 Supabase SQL Editor 에서 아래 순서로 직접 적용한다.
> 모든 파일은 idempotent(`if not exists`/동적 drop) + `begin/commit` + 자체 검증 DO 블록(실패 시 `raise exception` → 롤백) 구조이다.

## 1. 적용 순서 (권장)

| 순서 | 파일 | 결함 ID | 비고 |
|:--:|:--|:--|:--|
| 1 | `20261004000001_magazine_rls_lockdown.sql` | P0-01 | **최우선.** anon/public `true` 정책 제거, service_role 전용화 |
| 2 | `20261004000002_magazine_editions_check.sql` | F-02 | editions status/edition_type CHECK (기존값 ∪ 표준값 동적 합집합) |
| 3 | `20261004000003_magazine_poll_responses.sql` | F-02 | 폴 응답 (phone 컬럼 없음, service_role 전용) |
| 4 | `20261004000005_magazine_dispatch_logs.sql` | F-02 | 발송 로그 (idempotency_key unique) |
| 5 | `20261004000006_magazine_subscribers_consent.sql` | F-02 | 동의 컬럼 13개, 부분 unique(broker_id+phone_e164 / email_lc) |
| 6 | `20261004000007_magazine_settings.sql` | F-02 | 설정 |
| 7 | `20261004000010_magazine_rate_limit.sql` | F-04 | 테이블 + `magazine_rl_hit`/`magazine_rl_gc` (service_role execute 전용) |
| 8 | `20261004000012_magazine_cron_runs.sql` | F-04 | cron 실행 기록 |
| 9 | `20261004000013_magazine_editions_unique_kind.sql` | F-04 | unique (broker_id, edition_type, edition_label). **사전 중복 점검 쿼리 실행** |
| 10 | `20261004000014_magazine_retention.sql` | F-04 | `magazine_purge_unsubscribed(30)`, `magazine_purge_old_events(365)` — **000006 선행 필수** |
| 11 | `20261004000011_magazine_broker_user_id.sql` | F-04 | 5개 테이블 broker_user_id 컬럼+FK+인덱스 (폴 테이블 없으면 skip → 000003 이후) |
| 12 | `20261004000015_magazine_broker_user_id_backfill.sql` | F-04 | 백필. 000011 접두사 충돌 방지로 000015 번호 사용. **보류 가능** |
| 검토 후 | `20261004000008_broker_public_profiles_view.sql` | 전역 | `broker_profiles_public_read` anon 정책 drop + 공개 뷰. §4 경고 확인 |
| 검토 후 | `20261004000009_activity_events_anon_insert_drop.sql` | 전역 | `activity_events_insert_anon` drop. §4 경고 확인 |
| **보류** | `20261004000004_magazine_referrals.sql` | — | 제품 결정 후 적용 (헤더 참조) |

## 2. 단계별 절차

1. **사전 스냅샷**: `docs/magazine/audit-2026-10-04/db-snapshots/pg_policies_before.sql` 의 쿼리를 SQL Editor 에서 실행해 결과 저장
   (운영 `pg_policies` 는 REST 로 읽을 수 없음).
2. **백업** (데이터 변경 단계 직전, 예: 000001/000006/000013):
   ```sql
   create schema if not exists backup_20261004;
   create table backup_20261004.magazine_subscribers as table public.magazine_subscribers;
   create table backup_20261004.magazine_editions   as table public.magazine_editions;
   create table backup_20261004.magazine_analytics_events as table public.magazine_analytics_events;
   ```
3. 파일 내용 전체를 SQL Editor 에 붙여넣어 실행 (파일 자체가 begin/commit 포함). 에러 시 자동 롤백.
4. **사후 검증** (로컬):
   - `node scripts/rls-probe.mjs --out docs/magazine/audit-2026-10-04/db-snapshots/rls_probe_after.txt` → exit 0 기대
   - `node scripts/policy-scan.mjs` → PASS
5. **스키마 스냅샷 재생성** (적용 후): `node --no-warnings scripts/schema-snapshot.ts --applied 20261004000001,20261004000002,...` →
   `node --no-warnings scripts/check-schema-drift.ts --update-baseline --write-magazine-report`.
6. 적용 기록 남기기(선택): `create table if not exists public.schema_migration_log(name text primary key, applied_at timestamptz default now());` 후 insert.

## 3. 롤백
`supabase/migrations/_rollback/<동일파일명>_rollback.sql` (파일당 1개). 000001 롤백은 보안을 다시 여는 것이므로 비상시에만 사용.
데이터 파괴 롤백(테이블 drop)은 헤더에 경고가 있다.

## 4. 적용 전 경고 / 의존성 점검 결과

- **000001 이후 `src/app/(broker)/broker/clients/new/page.tsx:64`** 가 브라우저에서 `magazine_subscribers` upsert(`Public subscribe` 정책 의존, 오류 무시) → **조용히 실패**. 서버 API 전환 필요(I-03/P0-03 담당).
- `magazine_issues` 는 운영에 `status` 컬럼이 없어 anon SELECT 를 **완전 제거**(서버 전용). 발행 공개 읽기가 필요하면 컬럼 추가 후 별도 정책.
- **000008**: 소스 내 broker_profiles anon 의존 없음(공개 페이지는 service client). 외부 앱(cre-aipage/cre-fullim, `NEXT_PUBLIC_AIPAGE_URL`)은 검증 불가 → **확인 후 적용**.
- **000009**: `SurveyProvider`(`src/components/feedback/SurveyProvider.tsx:39`, `src/app/layout.tsx:52` 전역 마운트)가 로그인 확인 없이 브라우저 클라이언트로 `activity_events` insert → 비로그인 설문 이벤트가 조용히 실패. 서버 API 이전 후 적용.
- 중복 prefix(`0230`, `20260828` 등) 기존 마이그레이션은 이름 변경하지 않음.
- `supabase/supabase/config.toml` 중첩 디렉터리 존재 — CLI 사용 시 경로 주의.

## 5. 스크립트 사용법 (npm script 는 coordinator 가 package.json 에 추가)

| 목적 | 명령 | 제안 npm script |
|:--|:--|:--|
| 스키마 스냅샷 | `node --no-warnings scripts/schema-snapshot.ts [--applied a,b]` | `schema:snapshot` |
| 드리프트 검사 | `node --no-warnings scripts/check-schema-drift.ts [--update-baseline] [--write-magazine-report] [--strict-magazine] [--no-overlay] [--json]` | `schema:drift` |
| RLS 프로브 | `node scripts/rls-probe.mjs [--out f] [--with-insert-probe]` | `rls:probe` |
| 정책 스캔 | `node scripts/policy-scan.mjs [--all]` | `policy:scan` |

(`tsx` 는 로컬 미설치. Node 24 는 `.ts` 를 직접 실행한다.)

---

## 6. Wave 2 증보 섹션 (E5 골격 — 신규 마이그레이션은 `000016+` 에 추가)

> Wave 2 에서 E4(분석)가 `000016` 을 추가했다. 이후 번호는 조율자 예약표를 따른다. **새 마이그레이션 파일이 생기면 아래 표에 한 줄을 추가**하고 §7 검증 체크리스트의 해당 항목을 갱신한다.

| 순서 | 파일 | 담당 | 내용 | 선행 | 비고 |
|:--:|:--|:--|:--|:--|:--|
| 13 | `20261004000016_magazine_analytics_v2.sql` | E4 | 구독자별 이벤트 조회 인덱스(`metadata->>'subscriber_id'`) · `activity_events (broker_id, event_type, created_at)` 인덱스 · `increment_edition_views` 보강(search_path 고정·anon/authenticated 실행 권한 회수) · `visitor_id` 의미 주석(v2_ = 서버 HMAC) | 000011(권장) | 롤백: `_rollback/…000016_magazine_analytics_v2_rollback.sql`. 미적용 상태에서도 코드는 동작(RPC 는 기존 함수 그대로). **적용하면 anon 의 `increment_edition_views` 직접 호출이 막힌다** — 호출 경로는 `/api/public/magazine/analytics`(서비스 키)뿐인지 확인 |
| 14 | `2026100400001x_…` | (예약) | (신규 추가 시 기입) | | |

적용 순서 요약(전체): `000001 → 000002 → 000003 → 000005 → 000006 → 000007 → 000010 → 000012 → 000013 → 000014 → 000011 → 000015(보류 가능) → 000016` 이후 `000008`/`000009`(검토 후), `000004`(보류).

> ✅ **000015 백필 수정됨 (2026-10-06, E5 pglite 지적 반영)**: `magazine_analytics_events` 는 운영에 `broker_id` 컬럼이 없다(컬럼: id, edition_id, visitor_id, event_type, section_id, target_url, dwell_seconds, scroll_pct, metadata, target_param, created_at, visitor_fp).
> 수정 후 000015 는 broker_id 컬럼 유무를 검사해, 없는 테이블은 `edition_id → magazine_editions.broker_user_id` 로 매핑한다(editions 가 먼저 백필되도록 순서 고정). uuid/slug 혼재는 `::uuid` 캐스트 없이 `bp.user_id::text = lower(x.broker_id)` 텍스트 비교 후 slug 비교로 처리한다.
> 000011·000012·000013·000014 도 존재하지 않는 컬럼/위험 캐스트 없음을 재점검했다(schema-snapshot.json 기준). 로컬에 `@electric-sql/pglite` 가 설치돼 있지 않아 A1 은 pglite 실행 검증을 못 했다 — coordinator/E5 가 pglite 로 000015 재검증 필요.

## 7. 전체 적용 후 검증 체크리스트

마이그레이션 묶음을 적용한 직후 **순서대로** 확인한다. 하나라도 실패하면 다음 단계로 가지 않는다.

| # | 검증 | 명령/쿼리 | 기대 |
|:-:|:--|:--|:--|
| 1 | 적용 전 스냅샷·백업 완료 | §2 단계 1~2 | `db-snapshots/*_before.*` 저장, `backup_20261004` 스키마 존재 |
| 2 | **RLS probe**(anon) | `node scripts/rls-probe.mjs --out docs/magazine/audit-2026-10-04/db-snapshots/rls_probe_after.txt` | exit 0 (PASS). (선택) `--with-insert-probe` 는 23502/42501 확인용 — 행 생성 없음 |
| 3 | 정책 스캔 | `node scripts/policy-scan.mjs` | PASS (`USING(true)` PUBLIC 쓰기 정책 0) |
| 4 | 스키마 스냅샷 재생성 | `node --no-warnings scripts/schema-snapshot.ts --applied <적용한 prefix 목록>` | `supabase/schema-snapshot.json` 갱신, 신규 테이블·컬럼 포함 |
| 5 | **schema drift** | `node --no-warnings scripts/check-schema-drift.ts --write-magazine-report` (목표: `--strict-magazine` 로 매거진 위반 0) | 증가분 0, `magazine_drift_current.md` 의 매거진 위반 감소 |
| 6 | **헬스 SQL** | Supabase SQL Editor 에서 `scripts/magazine-health.sql` 실행 | 적용한 테이블의 `NOT_MIGRATED` 가 사라짐(미적용 항목만 남음). `WARN` 항목은 `scripts/cleanup/` 로 정리 |
| 7 | 객체 존재 확인 | `select to_regclass('public.magazine_dispatch_logs'), to_regclass('public.magazine_settings'), to_regclass('public.magazine_cron_runs'), to_regclass('public.magazine_rate_limits'), to_regclass('public.magazine_poll_responses');` | 전부 NOT NULL |
| 8 | RPC 권한 | `select has_function_privilege('anon','public.magazine_rl_hit(text,integer,integer)','execute'), has_function_privilege('service_role','public.magazine_rl_hit(text,integer,integer)','execute');` | `false`, `true` |
| 9 | 동의 컬럼 | `select column_name from information_schema.columns where table_name='magazine_subscribers' and column_name in ('privacy_consent_at','marketing_consent_at','confirm_status','phone_e164','night_consent','broker_user_id');` | 6행 |
| 10 | 앱 스모크 | 뷰어 · 구독(`503` 아님) · OG · 에디터 로드 · `/broker/*` 봇 UA 307 · cron 무비밀 401 | 모두 정상(`remediation_plan §18.1`) |
| 11 | 발송 비활성 유지 확인 | Vercel env `MAGAZINE_SEND_ENABLED` 가 `false`/미설정 | 마이그레이션 적용만으로 발송이 켜지지 않음(함정 #1·#3) |
| 12 | 기록 | 아래 §8 표에 적용 일시·적용자·검증 결과 기입 | |

> 적용 후 `schema:drift` 가 `appliedMigrations` 를 알도록 스냅샷 재생성(#4)을 **반드시** 한다 — 안 하면 적용된 컬럼도 '적용 예정 오버레이'로만 취급된다.

## 8. 적용 기록

백업 스키마 `backup_20261004`(subscribers 6 / editions 2 / analytics_events 2361 / issues 8) 생성 후 적용. 000001은 SQL Editor(5b 수정본), 나머지는 Supabase CLI(`db query --linked -f`)로 순차 적용, 전부 오류 0.

| 파일 | 적용 일시(KST) | 적용자 | 검증(#2~#9) | 비고 |
|:--|:--|:--|:--|:--|
| 000001 magazine_rls_lockdown | 2026-10-06 | 사용자(SQL Editor) | [x] rls-probe PASS · policy-scan PASS | PUBLIC ALL 정책 4건은 5b 단계에서 `authenticated`로 전환 |
| 000002 magazine_editions_check | 2026-10-06 | 에이전트(CLI) | [x] | 가드 통과 |
| 000003 magazine_poll_responses | 2026-10-06 | 에이전트(CLI) | [x] 테이블 존재 | |
| 000005 magazine_dispatch_logs | 2026-10-06 | 에이전트(CLI) | [x] 테이블 존재 | |
| 000006 magazine_subscribers_consent | 2026-10-06 | 에이전트(CLI) | [x] 동의 컬럼 6종 존재 | 중복 가드 통과 |
| 000007 magazine_settings | 2026-10-06 | 에이전트(CLI) | [x] 테이블 존재 | |
| 000010 magazine_rate_limit | 2026-10-06 | 에이전트(CLI) | [x] anon 실행권한 false / service_role true | |
| 000012 magazine_cron_runs | 2026-10-06 | 에이전트(CLI) | [x] 테이블 존재 | |
| 000013 magazine_editions_unique_kind | 2026-10-06 | 에이전트(CLI) | [x] | 중복 가드 통과 |
| 000014 magazine_retention | 2026-10-06 | 에이전트(CLI) | [x] | |
| 000011 magazine_broker_user_id | 2026-10-06 | 에이전트(CLI) | [x] `broker_user_id` 컬럼 존재 | |
| 000015 magazine_broker_user_id_backfill | (보류) | | [ ] | 정리 16/10 후 적용 |
| 000016 magazine_analytics_v2 | 2026-10-06 | 에이전트(CLI) | [x] | |
| 000008 broker_public_profiles_view (검토 후) | | | [ ] | |
| 000009 activity_events_anon_insert_drop (검토 후) | | | [ ] | |

## 9. 운영 데이터 정리(C-03)와의 순서

- 정리 SQL 은 `scripts/cleanup/`(README 에 순서·승인 체크리스트). **미적용 상태의 기존 컬럼만 사용**하므로 마이그레이션 전/후 어느 쪽에서도 실행 가능하다.
- 권장 순서: ① 코드 선행(C-01/C-05/P0-05/P0-06) 배포 → ② 마이그레이션 000001~000014 적용 → ③ 정리 01~19 → ④ 000015 백필(uuid 키 구독자 4명, 모두 테스트 계정 소속) → ⑤ 발송 활성화 단계(`send-activation-checklist.md`).
- 정리 16번(테스트 구독자 삭제)·10번(uuid 키 정규화)은 000015 백필 **전**에 끝내면 백필 대상이 줄어든다.
