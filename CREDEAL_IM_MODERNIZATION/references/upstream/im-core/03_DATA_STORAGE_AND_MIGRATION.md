# 데이터 저장·마이그레이션 설계

> 설계 ID: `IC-DATA-001`  
> 원칙: 추가형·불변버전·RLS·구자료 호환

---

# 1. 저장전략

v1은 과도한 정규화를 피하면서도 사실정본과 발행본을 분리하기 위해 다섯 표를 추가한다.

| 표 | 역할 | 변경가능성 |
|---|---|---|
| `im_case_snapshots` | 원자료·불일치·정정·유효값의 불변 기준본 | INSERT 전용 |
| `im_publication_packages` | 산출항목 평가·위험·제안·사진·게이트의 공통 발행묶음 | INSERT 전용 |
| `im_publication_projects` | 모바일/PPTX 편집 작업과 현재 포인터 | 명시적 상태전이 |
| `im_publication_versions` | 채널별 불변 내용·렌더결과·발행이력 | INSERT 전용 |
| `im_approval_events` | 특정 해시에 대한 사람승인·거절·철회 | INSERT 전용 |

`document_objects`는 과도기 호환표다. 신규 사실정본을 `body`에만 저장하지 않는다.

---

# 2. 제안 DDL

마이그레이션 파일명 후보: `supabase/migrations/20260901_im_core_publication_v1.sql`. 실제 적용일에 저장소 규칙에 맞춰 번호를 확정한다.

## 2.1 im_case_snapshots

```sql
create table if not exists im_case_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  case_ref_type text not null check (case_ref_type in ('building_ssot_lite','asset','deal')),
  case_ref_id uuid not null,
  sequence_no integer not null check (sequence_no > 0),
  status text not null check (status in ('valid','superseded','invalidated')),
  as_of timestamptz not null,
  asset_scope jsonb not null,
  observations jsonb not null,
  conflicts jsonb not null,
  corrections jsonb not null,
  effective_values jsonb not null,
  materializer_version text not null,
  source_policy_versions jsonb not null default '{}',
  snapshot_hash text not null,
  invalidated_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique(case_ref_type, case_ref_id, sequence_no),
  unique(snapshot_hash)
);
```

인덱스:

- `(owner_id, case_ref_type, case_ref_id, sequence_no desc)`
- `(case_ref_type, case_ref_id) where status='valid'`
- `snapshot_hash unique`

## 2.2 im_publication_packages

```sql
create table if not exists im_publication_packages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  snapshot_id uuid not null references im_case_snapshots(id),
  package_version text not null,
  target_level text not null check (target_level in ('L0','L1','L1.5','L2','L3','L4')),
  eligible_levels jsonb not null,
  claim_evaluations jsonb not null,
  proposal_units jsonb not null default '[]',
  risks jsonb not null default '[]',
  dd_requests jsonb not null default '[]',
  loi_conditions jsonb not null default '[]',
  media_bindings jsonb not null default '[]',
  content_units jsonb not null default '[]',
  gate_report jsonb not null,
  policy_versions jsonb not null,
  package_hash text not null unique,
  created_at timestamptz not null default now()
);
```

## 2.3 im_publication_projects

```sql
create table if not exists im_publication_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  package_id uuid not null references im_publication_packages(id),
  channel text not null check (channel in ('mobile','pptx')),
  status text not null check (status in (
    'draft','composing','ready_for_review','revision_needed',
    'machine_blocked','machine_passed','approved','published',
    'invalidated','archived'
  )),
  target_level text not null check (target_level in ('L1','L1.5','L2','L3','L4')),
  brief jsonb not null default '{}',
  working_content jsonb not null default '{}',
  current_version_id uuid,
  revision_no integer not null default 0,
  lock_version integer not null default 0,
  invalidated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

낙관적 잠금은 `lock_version`으로 처리한다. PUT/PATCH는 클라이언트가 읽은 버전을 보내고 서버가 일치할 때만 갱신한다.

## 2.4 im_publication_versions

```sql
create table if not exists im_publication_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  project_id uuid not null references im_publication_projects(id),
  package_id uuid not null references im_publication_packages(id),
  channel text not null check (channel in ('mobile','pptx')),
  version_no integer not null check (version_no > 0),
  target_level text not null,
  content_plan jsonb not null,
  rendered_content jsonb not null,
  channel_gate_report jsonb not null,
  core_gate_report_hash text not null,
  content_hash text not null,
  copy_hash text not null,
  photo_plan_hash text not null,
  layout_hash text,
  artifact_storage_path text,
  artifact_hash text,
  publication_status text not null check (publication_status in (
    'draft','machine_blocked','machine_passed','approved','published','invalidated','archived'
  )),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id, version_no)
);
```

`current_version_id` 외래키는 이 표 생성 후 추가한다.

## 2.5 im_approval_events

```sql
create table if not exists im_approval_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  case_snapshot_id uuid references im_case_snapshots(id),
  proposal_unit_id text,
  publication_version_id uuid references im_publication_versions(id),
  approval_type text not null check (approval_type in (
    'factual_snapshot','broker_opinion','photo_disclosure',
    'editorial_mobile','editorial_pptx','artifact_final'
  )),
  action text not null check (action in ('approve','reject','withdraw','invalidate')),
  target_hash text not null,
  scope jsonb not null,
  notes text,
  actor_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
```

---

# 3. 불변성과 상태전이

## 3.1 INSERT 전용 표

`im_case_snapshots`, `im_publication_packages`, `im_publication_versions`, `im_approval_events`는 애플리케이션 사용자에게 UPDATE 권한을 주지 않는다.

잘못된 정보는 다음으로 처리한다.

- 스냅샷: 새 스냅샷 + 이전본 `superseded` 사건
- 패키지: 새 패키지
- 발행버전: 새 버전
- 승인: `withdraw` 또는 `invalidate` 사건

상태 필드 갱신이 필요하면 보안정의 함수 또는 서비스 역할의 명시적 전이함수만 사용하고 사건을 함께 남긴다.

## 3.2 삭제

불변은 영구보존을 뜻하지 않는다. 개인정보 삭제·계약상 보존기간 종료는 별도 관리함수로 처리한다.

- 소유권 확인
- 삭제사유와 범위 기록
- 공개 링크 회수
- 파일저장소 삭제
- 연쇄 삭제 전 영향 발행본 목록 확인

일반 UI에서 직접 DELETE를 노출하지 않는다.

---

# 4. RLS

모든 표에 RLS를 켠다.

기본정책:

```text
SELECT: owner_id = auth.uid() 또는 조직 멤버십 권한
INSERT: owner_id = auth.uid()
UPDATE: im_publication_projects만 owner 또는 허용된 조직 편집자
DELETE: 일반 사용자 금지
```

공개 뷰어는 신규 표를 직접 읽지 않고 공개투영 서비스가 `published` 버전만 반환한다.

승인행위는 다음을 검사한다.

- 인증
- 프로젝트 소유·조직권한
- 대상 상태
- expectedHash
- 최신 버전 여부
- 기계검사 통과
- 필요한 선행승인

---

# 5. document_objects 호환

## 5.1 신규 발행본 쓰기

신경로에서 발행되면 `document_objects`에는 다음 최소 참조를 저장한다.

```json
{
  "im_engine": "im_core_v1",
  "publication_version_id": "uuid",
  "package_id": "uuid",
  "snapshot_id": "uuid",
  "channel": "mobile",
  "legacy_projection": {}
}
```

기존 공개 뷰어가 필요한 `title`, `body.sections`, `slug`는 호환 투영으로 제공하되 정본으로 취급하지 않는다.

## 5.2 구문서 읽기

`LegacyDocumentObjectAdapter`는 구문서를 다음 중 하나로 분류한다.

- `legacy_read_only`: 과거 자료 그대로 표시·다운로드
- `legacy_convertible`: 원자료가 충분해 새 스냅샷 후보 생성 가능
- `legacy_requires_review`: 근거·기준일·매각범위가 부족해 자동변환 금지

구문서 변환은 외부발행을 자동승인하지 않는다.

---

# 6. 이관단계

## M0 기준선

- 현재 스키마·제약·RLS 덤프
- document_objects status/document_type 실제값 분포
- 모바일·PPTX 최신 30건의 body 구조 샘플
- 승인 API와 공개 URL 회귀시험

## M1 표 추가

- 다섯 표·인덱스·RLS·상태전이 함수
- 기존 동작 변경 없음
- 기능깃발 off

## M2 이중기록

- 신경로를 켠 내부 거래건만 snapshot/package/version 기록
- document_objects 호환 쓰기 유지
- 값·해시·상태 차이를 관측

## M3 읽기전환

- 내부 검토화면부터 신규 표 읽기
- 공개 모바일은 거래건별 기능깃발
- PPTX Studio 베타는 신규 표만 사용

## M4 기본전환

- 신규 거래건은 CORE v1 기본
- 기존 구문서는 read-only
- 구형 생성은 긴급 롤백용

## M5 폐기

- 모바일 body→PPTX 신규변환 금지
- 사용량 0을 2개 릴리스 이상 확인
- 구코드 삭제는 별도 승인

---

# 7. 데이터 검증

필수 제약·CI:

- JSON Schema 검증 후 INSERT
- `snapshot_hash`, `package_hash` 서버 재계산
- publication version의 `package_id`와 project의 package 일치
- channel과 approval_type 조합 검사
- published에는 `artifact_hash` 또는 모바일 `content_hash` 필요
- approved/published에는 유효한 approval event 필요
- invalidated 버전 신규 공개링크 발급 금지
- snapshot/package 삭제참조 무결성

---

# 8. 롤백

- 기능롤백: 관련 기능깃발 off, 신규 데이터 유지
- 읽기롤백: document_objects 호환 투영으로 복귀
- 쓰기롤백: 신규 표 이중기록만 중지
- 스키마롤백: 표·컬럼 삭제 금지, deprecated 표시
- 공개링크: 기존 published 발행본 유지, 새 발행만 구경로

롤백 훈련은 P4 전환 전에 스테이징에서 한 번 실행하고 시간을 기록한다.

