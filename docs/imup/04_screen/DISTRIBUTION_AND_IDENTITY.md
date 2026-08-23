# CREDEAL — 배포 · 신원 · 추적 구현 가이드

> Basic 개별 발송과 Pro grant를 **무마찰로 실행하되 매칭에 쓸 수 있는 신원·조건을 확보**하기 위한 레포 규약.
> `AGENTS.md`(IM Studio)의 자매 문서입니다. IM이 *무엇을 만드는가*라면, 이 문서는 *그것이 누구에게 가고 무엇이 남는가*를 규정합니다.

| | |
|---|---|
| **패키지** | `packages/distribution` · `packages/identity` · `packages/matching` |
| **책임 범위** | 링크 발급 → 열람 추적 → 게이트 수집 → 조건 축적 → 크로스브로커 매칭 신호 |
| **책임 아님** | IM 조판(→ `AGENTS.md`), 메시지 발송 인프라(→ Solapi 어댑터), 결제 |
| **런타임** | Next.js(Node runtime) · Supabase Postgres + RLS · TypeScript 5.x |
| **최종 수정** | 2026-08-03 |

---

## 0. 이 문서를 읽는 에이전트에게

작업 전 반드시 확인하십시오.

1. **§1의 3층 신원 모델을 이해했는가.** Viewer / Recipient / Party를 섞으면 프로파일이 오염되고 되돌릴 수 없습니다.
2. **§9의 불변조건 6개를 읽었는가.** 이 중 하나라도 깨지면 개인정보보호법 또는 공인중개사법 위반 소지가 생깁니다. 기능 문제가 아니라 사업 중단 사유입니다.
3. **필드를 추가하려는가?** §5의 마찰 예산을 먼저 보십시오. "정보를 더 받자"는 이 시스템에서 가장 흔한 실패 원인입니다.

> **가장 중요한 한 줄**
> `MatchResult`에 매수자의 이름·연락처·식별자가 포함되면 **즉시 반려**입니다. 우리가 공유하는 것은 매수자가 아니라 매칭 신호뿐입니다.

---

## 1. 3층 신원 모델

세 개념을 사람들이 습관적으로 섞습니다. 코드에서는 절대 섞지 않습니다.

| 층 | 무엇인가 | 생성 시점 | 식별성 | 매칭 사용 |
|---|---|---|---|---|
| **Viewer** | 브라우저·기기 하나 | 첫 열람 | 익명 | ✗ (집계만) |
| **Recipient** | 브로커가 "이 사람에게 보낸다"고 선언한 대상 | 링크 발급 | 브로커만 앎 | ✗ |
| **Party** | 연락처·동의를 가진 검증된 당사자 | 게이트 제출 | 확정 | **○** |

### 결합 사슬

```
Viewer  ──(share token)──▶  Recipient  ──(gate 제출)──▶  Party
   ▲ 확률적 결합                          ▲ 확정적 결합
   전달되면 오염될 수 있음                  본인이 직접 제출
```

**규칙 — 확률적 결합의 산출물을 확정 데이터로 승격하지 않는다.**
토큰 링크로 추정한 Recipient의 행동은 `confidence: 'medium'` 이하로만 기록합니다. Party 확정 전까지 매칭 대상이 아닙니다.

### 왜 Viewer를 Party로 자동 병합하면 안 되는가

같은 기기에서 남편이 보고 아내가 게이트를 제출할 수 있습니다. 링크를 받은 사람이 지인에게 보여줄 수도 있습니다. 자동 병합하면 **A의 열람 이력이 B의 조건으로 기록**되고, 이 오염은 사후에 분리할 수 없습니다.

병합은 §6의 명시적 바인딩 이벤트를 통해서만 일어납니다.

---

## 2. 링크 3종

| 종류 | URL | 수신자 식별 | 용도 | 만료 |
|---|---|---|---|---|
| **티저** | `/d/{dealSlug}` | ✗ 익명 | 카카오톡 확산 | 없음 (딜 종료 시) |
| **Basic 개별** | `/d/{dealSlug}/r/{shareToken}` | △ 확률적 | 특정인 발송 | 30일 (연장 가능) |
| **Pro grant** | `/im/{grantToken}` | ○ 확정 | NDA 후 지정 열람 | 7일 |

### 2.1 티저는 익명이 정상이며, 이를 바꾸려 하지 마십시오

카카오톡 공유(`Kakao.Share.sendDefault`)는 **수신자를 서버로 반환하지 않습니다.** 카카오톡 공유 웹훅을 붙여도 "전달 성공" 사실만 오고 대상은 오지 않습니다. 우회 방법은 없습니다.

정책상으로도 막혀 있습니다. 수신자를 알기 위해 알림톡으로 바꾸면 **광고성으로 분류되어 반려**됩니다. 알림톡은 수신자 액션에 기반한 정보성 메시지만 허용됩니다.

그리고 이것이 문제가 아닙니다 — 티저의 목적은 식별이 아니라 확산입니다. 익명이라야 브로커가 부담 없이 뿌립니다.

### 2.2 토큰 생성 규칙

```ts
// packages/distribution/src/token.ts
import { customAlphabet } from 'nanoid';

// 혼동 문자 제외 (0/O, 1/l/I) — 구두 전달·수기 입력 사고 방지
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const newShareToken = customAlphabet(ALPHABET, 24);  // ≈143 bit
export const newGrantToken = customAlphabet(ALPHABET, 28);  // ≈167 bit
```

- **순차·추측 가능한 토큰 금지.** 열거 공격으로 타사 물건이 노출됩니다.
- 토큰은 URL에만 존재하고 로그·에러 리포트에 남기지 않습니다.
- `Referrer-Policy: no-referrer` 를 링크 페이지에 설정해 외부 유출을 막습니다.

### 2.3 전달 오염 탐지

토큰 링크는 재전달될 수 있습니다. A에게 준 링크를 A가 B에게 넘기면 B의 행동이 A로 기록됩니다.

```ts
// packages/distribution/src/contamination.ts
export const CONTAMINATION_POLICY = {
  maxDistinctViewers: 3,        // 4번째 새 기기가 열면 오염 판정
  windowDays: 30,
} as const;

export function evaluate(link: ShareLink, distinctViewers: number) {
  if (distinctViewers > CONTAMINATION_POLICY.maxDistinctViewers) {
    return {
      contaminated: true,
      // 이벤트는 계속 기록한다(감사 목적). 다만 Recipient 귀속을 끊는다.
      attributeToRecipient: false,
      notifyBroker: '이 링크가 다른 분께 전달된 것으로 보입니다.',
    };
  }
  return { contaminated: false, attributeToRecipient: true };
}
```

브로커 알림은 부작용이 아니라 기능입니다. 티저라면 확산 신호이고, Basic이라면 관리 필요 신호입니다.

---

## 3. 데이터 모델

```sql
-- ── 열람 주체 (익명) ────────────────────────────────────────────
create table viewer (
  id            uuid primary key default gen_random_uuid(),
  ua_class      text,                       -- 'mobile-ios' 수준의 거친 분류만
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
comment on column viewer.ua_class is
  '오염 탐지 및 렌더 분기 전용. 재식별 가능한 지문 저장 금지.';

-- ── 수신 대상 (브로커 선언) ──────────────────────────────────────
create table recipient (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  broker_id     uuid not null,
  label         text not null,              -- 브로커가 부르는 호칭
  contact_hint  text,                       -- 마스킹 표시용 (끝 4자리 등)
  party_id      uuid,                       -- 게이트 통과 후 결합
  created_at    timestamptz not null default now()
);

-- ── 공유 링크 ──────────────────────────────────────────────────
create table share_link (
  token             text primary key,
  tenant_id         uuid not null,
  deal_id           uuid not null,
  deal_version      int  not null,
  tier              text not null check (tier in ('teaser','basic')),
  broker_id         uuid not null,
  recipient_id      uuid references recipient(id),   -- null = 익명 확산용
  distinct_viewers  int  not null default 0,
  contaminated      boolean not null default false,
  expires_at        timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index on share_link (deal_id, tier);
create index on share_link (recipient_id) where recipient_id is not null;

-- ── 검증된 당사자 ────────────────────────────────────────────────
create table party (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  owner_broker_id  uuid not null,           -- 이 매수자를 보유한 중개인
  name             text not null,
  phone_e164       text not null,
  email            text,
  entity_type      text check (entity_type in ('individual','corp','fund','agent')),
  consent_version  text not null,
  consent_at       timestamptz not null,
  retention_until  date not null,           -- 보유기간 만료일
  created_at       timestamptz not null default now(),
  unique (tenant_id, phone_e164)
);

-- ── 매수 조건 (스냅샷 누적, append-only) ─────────────────────────
create table buyer_condition (
  id           uuid primary key default gen_random_uuid(),
  party_id     uuid not null references party(id) on delete cascade,
  source       text not null check (source in ('gate_form','grant_form','slider','broker_note')),
  confidence   text not null check (confidence in ('high','medium','low')),
  budget_band  text,                        -- '100_200'
  regions      text[],                      -- ['gangnam','seocho']
  asset_types  text[],                      -- ['retail_bldg','office']
  purpose      text,                        -- 'value_add'
  financing    text,                        -- 'loan_required'
  observed_at  timestamptz not null default now()
);
create index on buyer_condition (party_id, observed_at desc);
comment on table buyer_condition is
  '갱신하지 않고 누적한다. 최신 = observed_at 최대 + confidence 최고 조합.';

-- ── Pro 열람권 ──────────────────────────────────────────────────
create table grant_pass (
  token          text primary key,
  tenant_id      uuid not null,
  deal_id        uuid not null,
  deal_version   int  not null,
  party_id       uuid not null references party(id),
  issued_by      uuid not null,
  nda_signed_at  timestamptz not null,
  watermark_ref  text not null,             -- 워터마크에 찍히는 식별번호
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- ── 추적 이벤트 (append-only, 월 파티션) ─────────────────────────
create table track_event (
  id           bigserial,
  tenant_id    uuid not null,
  deal_id      uuid not null,
  kind         text not null,
  viewer_id    uuid,
  share_token  text,
  grant_token  text,
  party_id     uuid,
  payload      jsonb not null default '{}',
  occurred_at  timestamptz not null default now()
) partition by range (occurred_at);

-- 파티션은 마이그레이션에서 3개월분을 선행 생성하고, 월 배치로 롤링 생성한다.
-- 파티션 테이블은 파티션 키를 포함하지 않는 유니크 제약을 걸 수 없으므로
-- id에 PRIMARY KEY를 선언하지 않았다. 이는 의도된 설계다.
create table track_event_2026_08 partition of track_event
  for values from ('2026-08-01') to ('2026-09-01');
```

> `tenant` · `broker` · `deal` 은 Core 스키마 소유이며 이 문서 범위 밖입니다. 위 DDL은 그 테이블들이 이미 존재한다고 가정합니다.

### 왜 `buyer_condition`을 갱신하지 않고 누적하는가

조건은 시간에 따라 변합니다. 6개월 전 "예산 100~200억"이 지금도 유효한지 알 수 없습니다. 덮어쓰면 그 사실을 잃습니다.

누적하면 **변화 자체가 신호**가 됩니다 — 예산대가 올라갔다면 매수 의지가 강해진 것이고, 6개월간 갱신이 없다면 비활성입니다. 매칭은 `observed_at`으로 최근성을 가중합니다.

---

## 4. 이벤트 스키마

```ts
// packages/distribution/src/events.ts
export type TrackEvent =
  | { kind: 'view.opened';   dealId: string; tier: Tier; referrer?: string }
  | { kind: 'view.section';  sectionId: string; dwellMs: number }
  | { kind: 'view.slider';   param: 'budget' | 'ltv'; value: number }
  | { kind: 'view.completed'; scrollPct: number }
  | { kind: 'intent.question'; }
  | { kind: 'intent.watch'; }
  | { kind: 'intent.detail_request'; }        // → Party 생성
  | { kind: 'grant.requested' }
  | { kind: 'grant.issued';  grantToken: string }
  | { kind: 'grant.opened' }
  | { kind: 'grant.expired' }
  | { kind: 'outcome.recorded'; result: 'closed' | 'lost' | 'held'; reason?: string };
```

### 수집 규칙

| 이벤트 | 발송 조건 | 이유 |
|---|---|---|
| `view.section` | IntersectionObserver 진입 후 **3초 이상** 체류 | 스크롤 통과를 열람으로 세지 않기 |
| `view.slider` | 조작 종료 후 **500ms 디바운스** | 드래그 중 수십 건 전송 방지 |
| `view.completed` | 스크롤 80% 도달 시 1회 | — |
| 그 외 | 즉시 | — |

### 절대 수집하지 않는 것

- 정확한 위치(GPS)
- 재식별 가능한 디바이스 지문 조합 (오염 탐지에 필요한 최소치를 초과하는 것)
- 열람 페이지 외부의 행동
- 매수자가 입력하지 않은 개인 속성의 추정값(연령·소득 등)

---

## 5. 무마찰 게이트 설계

### 5.1 마찰을 결정하는 것은 필드 수가 아니다

**"무엇을 요구하는가"가 아니라 "대가로 무엇을 주는가"가 이탈률을 결정합니다.** 5개를 물어도 대가가 명확하면 통과하고, 2개를 물어도 대가가 없으면 이탈합니다.

| 단계 | 요구 | 대가 | 목표 이탈률 |
|---|---|---|---|
| 티저 열람 | 없음 | 밴딩된 개요 | — |
| 슬라이더 조작 | 없음 (자발적) | 개인화된 실투자금 | — |
| 관심 등록 | 연락처 1개 | 조건 변경 알림 | < 20% |
| **상세 요청 (G2)** | 칩 4 + 연락처 + 이름 | Basic IM 전문 | **< 30%** |
| **Pro grant (G3)** | 신원 확인 + NDA 서명 | 렌트롤 · 권리 · DCF | < 40% |

### 5.2 매칭 축은 전부 단일 탭 칩으로

자유입력은 마찰이 높고 데이터 품질도 낮습니다. 매칭에 쓰는 필드는 **예외 없이 enum**입니다.

```ts
// packages/identity/src/gate-schema.ts
export const GATE_G2 = {
  budgetBand: { kind: 'chip', required: true, options:
    ['~50억', '50~100억', '100~200억', '200~300억', '300억~', '미정'] },
  purpose:    { kind: 'chip', required: true, options:
    ['실사용(사옥)', '임대수익', '밸류애드', '개발', '자산배분'] },
  financing:  { kind: 'chip', required: true, options:
    ['전액 자기자본', '대출 병행', '대출 필수', '미정'] },
  entityType: { kind: 'chip', required: true, options:
    ['개인', '법인', '조합·펀드', '대리인'] },
  name:       { kind: 'text',  required: true, maxLen: 20 },
  phone:      { kind: 'phone', required: true },
} as const;
```

**탭 4번 + 이름 + 전화번호. 목표 완료 시간 20초.** 이 네 축이면 매칭에 필요한 최소 차원이 확보됩니다.

### 5.3 마찰 예산 — 필드를 늘리려는 모든 시도에 적용

새 필드를 넣기 전에 셋 다 답해야 합니다.

1. 이 필드 없이 매칭이 **불가능한가?** (있으면 좋은 정도면 기각)
2. 단일 탭으로 답할 수 있는가? (자유입력이면 기각)
3. 게이트 이탈률이 30%를 넘지 않는다는 근거가 있는가?

> 게이트 이탈률은 **제품 지표**입니다. 30%를 넘으면 필드를 늘린 쪽이 아니라 줄이는 쪽으로 되돌립니다.

### 5.4 Pro grant는 별도 폼을 만들지 않는다

grant 발급은 브로커가 하지만, 필요한 정보는 **NDA를 보내기 위해 어차피 입력해야 하는 것**(이름·연락처)입니다. 여기에 매칭용 필드를 추가하지 마십시오. 이미 G2에서 받았습니다.

grant 폼에서 새로 얻는 것은 `entity_type` 확정과 자금 조달 계획 정도이며, 이는 브로커가 통화 중 확인한 내용을 **선택 칩으로 갱신**하는 형태여야 합니다.

---

## 6. 조건 축적 — 소급 바인딩

슬라이더는 익명 Viewer 단계에서 발생합니다. 게이트 통과 시 **같은 viewer_id에 한해** 소급 연결합니다.

```ts
// packages/identity/src/bind.ts
export async function bindViewerHistory(viewerId: string, partyId: string) {
  const sliders = await getSliderEvents(viewerId, { withinDays: 30 });
  if (sliders.length < 2) return;            // 1회 조작은 우발적일 수 있음

  const budgets = sliders.filter(s => s.param === 'budget').map(s => s.value);
  if (budgets.length === 0) return;

  await insertCondition({
    partyId,
    source: 'slider',
    confidence: 'medium',                    // ← gate_form보다 낮게
    budgetBand: toBand(median(budgets)),
    observedAt: sliders[sliders.length - 1].occurredAt,
  });
}
```

### confidence 등급 기준

| source | confidence | 근거 |
|---|---|---|
| `gate_form` | high | 매수자 본인이 명시적으로 제출 |
| `grant_form` | high | NDA 단계, 브로커가 통화로 확인 |
| `slider` | medium | 자발적이나 탐색적 조작일 수 있음 |
| `broker_note` | low | 브로커의 주관적 기억 |

매칭 점수는 `confidence × 최근성`으로 가중합니다. **low 단독으로는 매칭에 반영하지 않습니다.**

---

## 7. 매칭 계약

### 7.1 출력에 매수자 식별정보가 없어야 한다

```ts
// packages/matching/src/types.ts
export interface MatchQuery {
  dealId: string;
  scope: 'own' | 'org';            // 자기 매수자 / 조직 전체
}

export interface MatchResult {
  brokerId: string;
  brokerName: string;
  matchCount: number;              // 조건 부합 매수자 수
  strength: 'high' | 'medium';
  lastActivityBand: string;        // '1개월 이내' — 정확한 날짜 아님
  // ⛔ partyId · name · phone · email 은 존재해서는 안 된다
}
```

`scope: 'org'` 결과는 **"귀하 물건 조건에 부합하는 매수자를 보유한 중개인 3명"**까지만 보여줍니다. 이후 접촉은 중개인 대 중개인입니다.

이것이 법적 필수 요건입니다 — 플랫폼이 매수자를 직접 연결하면 무등록 중개 소지가 생기지만, **중개인 간 공동중개 연결은 정상 관행**입니다.

### 7.2 매칭 축과 가중

```ts
export const MATCH_AXES = {
  budget:  { weight: 0.35, kind: 'band-overlap' },
  region:  { weight: 0.25, kind: 'set-intersect' },
  asset:   { weight: 0.20, kind: 'set-intersect' },
  purpose: { weight: 0.20, kind: 'compat-matrix' },  // 밸류애드 물건 ↔ 밸류애드 목적
} as const;

export const RECENCY_DECAY = {
  within1m: 1.00, within3m: 0.85, within6m: 0.60, over6m: 0.30,
} as const;
```

`financing`은 매칭 축이 아니라 **경고 신호**로 씁니다. 역레버리지 물건에 "대출 필수" 매수자가 매칭되면 매칭 결과에 주의 표시를 붙입니다. 권역 무산 사유 1위가 매수자 대출 조건(34%)이므로, 이 조합을 미리 거르는 것이 성사율에 직접 기여합니다.

### 7.3 상호주의 게이트

```sql
create or replace view contribution_score as
select
  b.id as broker_id,
  count(distinct p.id) filter (
    where p.created_at > now() - interval '6 months') as recent_parties,
  count(distinct e.id) filter (
    where e.occurred_at > now() - interval '6 months'
      and e.kind = 'grant.issued')                    as recent_grants
from broker b
left join party p       on p.owner_broker_id = b.id
left join track_event e on e.payload->>'broker_id' = b.id::text
group by b.id;
```

`recent_parties < 3` 이면 `scope: 'org'` 조회를 차단합니다. `scope: 'own'` 은 항상 허용합니다.

무임승차를 막지 않으면 아무도 기여하지 않습니다.

---

## 8. RLS 정책

```sql
alter table party           enable row level security;
alter table buyer_condition enable row level security;
alter table recipient       enable row level security;

-- 매수자는 보유 중개인만 접근한다. 조직 조회조차 직접 허용하지 않는다.
create policy party_owner_only on party
  for all
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and owner_broker_id = auth.uid()
  );

create policy condition_via_party on buyer_condition
  for all
  using (
    exists (
      select 1 from party p
      where p.id = buyer_condition.party_id
        and p.owner_broker_id = auth.uid()
    )
  );
```

조직 단위 매칭은 **`security definer` 함수를 통해 집계값만** 반환합니다. 아래는 시그니처 골격이며 본문은 구현 대상입니다.

```sql
create or replace function match_org(p_deal_id uuid)
returns table (broker_id uuid, match_count int, strength text)
language sql
security definer
set search_path = public
as $func$
  -- 내부에서 party·buyer_condition을 읽되, 반환 컬럼은 위 3개로 고정한다.
  -- party 식별자를 select 목록에 추가하는 순간 §9-1 위반이다.
  select p.owner_broker_id,
         count(*)::int,
         case when max(c.score) >= 0.7 then 'high' else 'medium' end
  from candidate_condition c
  join party p on p.id = c.party_id
  where c.deal_id = p_deal_id
  group by p.owner_broker_id;
$func$;
revoke all on function match_org(uuid) from public;
grant execute on function match_org(uuid) to authenticated;
```

> `security definer` 함수는 RLS를 우회하므로, **반환 컬럼에 party 식별자가 들어가지 않는지 리뷰에서 반드시 확인**합니다. 이 함수는 코드 오너를 지정해 변경 시 승인을 강제하십시오.

---

## 9. 불변조건 — 위반 시 출시 불가

1. `MatchResult` 및 `match_org()` 반환값에 매수자 이름·연락처·식별자가 포함되지 않는다.
2. `party` 테이블에 소유 중개인 외 직접 접근 경로가 없다.
3. 개인정보 수집 시 목적·항목·보유기간을 고지하고 동의를 `consent_version`과 함께 기록한다.
4. 매도인용 리포트에 개별 매수자를 식별할 수 있는 정보가 들어가지 않는다. 집계값만 표시한다.
5. 오염(`contaminated=true`) 판정된 링크의 행동은 `buyer_condition`에 반영되지 않는다.
6. 토큰은 로그·에러 리포트·분석 도구에 평문으로 남지 않는다.

### 보유기간과 파기

```ts
export const RETENTION = {
  party:          { months: 24, from: 'last_activity' },
  buyerCondition: { months: 24, from: 'observed_at' },
  trackEvent:     { months: 12, then: 'aggregate_and_purge' },
} as const;
```

`retention_until` 도래 시 자동 파기하고 파기 사실을 감사 로그에 남깁니다. 매수자의 삭제 요청은 즉시 처리하며, 이미 반영된 매칭 집계에서도 제거합니다.

---

## 10. 발송 채널

| 채널 | 단계 | 수신자 식별 | 정책 제약 |
|---|---|---|---|
| 카카오톡 공유 | 티저 | ✗ | 수신자 미반환 (SDK 한계) |
| 문자(LMS) + 토큰 링크 | Basic 개별 | △ | 광고성이면 야간 발송 금지·수신거부 의무 |
| **알림톡** | G2 이후 회신 | ○ | **정보성만 가능** · 템플릿 사전심사 영업일 2~3일 |
| 이메일 | Basic · Pro | △ | — |

### 알림톡 정보성 요건

수신자 액션에 기반해야 합니다. 실무적으로는 이렇게 갈립니다.

| 상황 | 판정 |
|---|---|
| 상세 요청에 대한 자료 회신 | ○ 정보성 |
| 전속 매도인에게 주간 매각 리포트 | ○ 정보성 (계약 기반 고지) |
| grant 발급·만료 안내 | ○ 정보성 |
| 불특정 매수 후보에게 신규 매물 안내 | **✗ 광고성 — 반려** |

신규 매물 안내는 친구톡 또는 광고성 문자로만 가능하며, 별도 수신 동의가 필요합니다. **템플릿 설계 단계에서 이 구분을 하지 않으면 심사에서 반려되어 일정이 밀립니다.**

Solapi 어댑터는 채널 전환 시 동일 인터페이스를 유지합니다.

```ts
export interface MessageAdapter {
  send(msg: {
    to: string;                       // E.164
    channel: 'alimtalk' | 'lms' | 'email';
    templateId?: string;              // 알림톡 필수
    vars: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ receiptId: string }>;
}
```

---

## 11. 안티패턴 — PR 체크리스트

### 신원·프라이버시

- [ ] `MatchResult`에 party 식별정보가 없는가
- [ ] `security definer` 함수 반환 컬럼을 확인했는가
- [ ] Viewer를 Party로 **자동** 병합하지 않았는가 (§6의 명시적 바인딩만)
- [ ] 오염 판정 링크의 행동을 조건에 반영하지 않았는가
- [ ] 매도인 리포트에 개별 매수자 정보가 없는가
- [ ] 동의 없이 조건을 제3자에게 제공하지 않았는가
- [ ] 토큰이 로그·Sentry·분석 도구에 남지 않는가

### 마찰

- [ ] 새 필드가 §5.3의 세 질문을 통과했는가
- [ ] 매칭 축을 자유입력으로 받지 않았는가
- [ ] 게이트 이탈률 측정이 붙어 있는가
- [ ] Pro grant 폼에 G2와 중복되는 질문을 넣지 않았는가

### 구현

- [ ] 토큰이 추측 불가능한가 (순차·타임스탬프 기반 금지)
- [ ] `Referrer-Policy: no-referrer` 가 설정됐는가
- [ ] `view.section`이 3초 임계를 지키는가
- [ ] `view.slider`가 디바운스되는가
- [ ] `buyer_condition`을 UPDATE하지 않고 INSERT하는가
- [ ] 알림톡 템플릿이 정보성 요건을 만족하는가
- [ ] 발송에 `idempotencyKey`가 있는가

---

## 12. 성능 · 운영

| 항목 | 예산 | 초과 시 |
|---|---|---|
| 링크 열람 TTFB | 300 ms | 딜 스냅샷 캐시 |
| 이벤트 수집 API | 50 ms (fire-and-forget) | 큐 삽입만 하고 즉시 응답 |
| `match_org()` | 500 ms | 조건 인덱스 점검 · 사전 집계 |
| `track_event` | 월 파티션 | 12개월 후 집계 후 원본 파기 |

이벤트 수집은 **열람 경험을 절대 막지 않습니다.** 실패해도 조용히 삼키고 재시도 큐에 넣습니다. 추적이 콘텐츠보다 우선할 수 없습니다.

---

## 13. 검증 시나리오

각 항목은 `tests/e2e/`에 픽스처로 존재해야 합니다.

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 티저를 카톡 공유 → 3명이 열람 | Viewer 3건, Recipient 결합 없음, 조건 미생성 |
| 2 | Basic 토큰 링크를 1명이 열람 → 게이트 제출 | Party 1건 생성, `gate_form` 조건 1건, confidence=high |
| 3 | Basic 토큰이 4개 기기에서 열림 | `contaminated=true`, 조건 미반영, 브로커 알림 발송 |
| 4 | 슬라이더 3회 조작 후 게이트 제출 | `slider` 조건이 confidence=medium으로 소급 생성 |
| 5 | 슬라이더 1회만 조작 후 제출 | slider 조건 **미생성** (임계 미달) |
| 6 | 기여 매수자 2명인 브로커가 org 매칭 조회 | 차단, own 매칭은 허용 |
| 7 | grant 발급 → 7일 경과 | 열람 차단, `grant.expired` 기록 |
| 8 | 매수자 삭제 요청 | party·condition 즉시 파기, 매칭 집계에서 제거 |
| 9 | `match_org()` 응답 검사 | 반환 JSON에 이름·전화·이메일 키 부재 |
| 10 | 역레버리지 물건 ↔ "대출 필수" 매수자 | 매칭되되 주의 표시 부착 |

---

## 14. 참고

- [카카오톡 공유 JavaScript 가이드](https://developers.kakao.com/docs/ko/kakaotalk-share/js-link)
- [카카오톡 공유 웹훅](https://developers.kakao.com/docs/latest/ko/kakaotalk-share/callback) — 전달 성공 사실만 수신, 대상 미포함
- [SOLAPI 알림톡 가이드](https://solapi.com/guides/kakao-ata-guide)
- [알림톡 템플릿 관리](https://bizmessage.zendesk.com/hc/ko/articles/11599105673999-3-%EC%95%8C%EB%A6%BC%ED%86%A1-%ED%85%9C%ED%94%8C%EB%A6%BF-%EA%B4%80%EB%A6%AC)
- 자매 문서 — `AGENTS.md` (IM Studio 조판 규약)
