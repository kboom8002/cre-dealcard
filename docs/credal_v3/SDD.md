# CREDEAL SDD — Stage 0~3 구현 명세서 (Spec-Driven Development)

> **버전**: v1.3 (2026-07-25) · **범위**: Stage 0(신뢰 복원) ~ Stage 3(생성 전환·사다리 완성), 주 1~13
> **v1.3 변경** (데이터 공급 감사 반영 — `audit/im-data-supply-audit.md` 필수 선독): 기구현 자산 재사용으로 전환(R1~R7 — 7 API 오케스트레이터·엑셀 렌트롤 임포터·바텀시트 허브·등기 API·readiness 부분점수) + 신규 리스크 태스크 4건(S0-T12 UI 산식 제거 · S1-T15 주소 폴백 가드 · S1-T16 캐시 TTL 차등 · S2-T11 엑셀 표준 접속)
> **v1.1 변경**: 문서 감사에서 확인된 확정 공백 5건(GAP-1~5)을 명시 태스크로 추가 — §0.5 참조. 신규·확장 태스크: S0-T11, S1-T0, S1-T5(산출물 추가), S1-T14, S3-T1(산출물 추가), S3-T17
> **v1.2 변경** (문서체계 고도화 계획 Part 2.1): S3-T18(tier별 맵 정책 — MI-1 편입, 좌표 노출 구멍 차단) · S3-T19(visitor_fp 단일화 — 공통 승격) · S1-T12 개정(수임 상태 1탭 분기·직행 전이·verbal) · S1-T13 주석(pitch_blocks 단독 생성) · 플래그/이벤트/DO NOT/§12.1 갱신. **태스크 착수 순서는 `TASKS.md`가 SSoT**
> **상위 문서**: 플랫폼 고도화 전략·단계별 로드맵 / DEV_SPEC v2.0 / 온톨로지 v0.1(`credeal-ontology-v0.1.yaml`) / 코어 스펙 4종(티저·IM 이원화·Full IM·Pitch)
> **문서 성격**: LLM 코딩 에이전트와 개발자가 태스크 단위로 구현하는 **단일 실행 명세(SSoT)**. 본 문서와 온톨로지 YAML이 충돌하면 YAML이 우선한다(스키마), 절차·정책은 본 문서가 우선한다.
> **대상 시스템**: credeal (Next.js App Router + Supabase/Postgres + 기존 `src/domain/building/mobile-im/` 29모듈)

---

# 0. 규약 (모든 태스크에 적용)

## 0.1 SDD 원칙

1. **스펙 우선**: 각 태스크는 본 문서의 명세를 구현한다. 명세에 없는 동작 추가는 스펙 개정(PR로 본 문서 수정) 후 구현한다.
2. **온톨로지 참조**: 필드 ID·enum 코드·제약·규칙은 `credeal-ontology-v0.1.yaml` 정의를 그대로 사용. 코드단 임의 추가 금지 — YAML 선개정.
3. **기존 모듈 존중**: `mobile-im/` 29개 모듈은 삭제·재작성하지 않는다. 명시된 **주입 지점**에 신모듈을 결합한다.
4. **URL 불변**: `/dc/{id}`, `/im-lite/{id}`, `/vibe-card/{slug}` 공개 스킴 변경 금지. 신규는 새 경로.
5. **Provenance 의무**: `assets.attrs` 쓰기는 반드시 `provenance[fieldId] = {tier, verified_at, source_ref}` 동반. 미동반 쓰기는 lint 에러.
6. **Feature Flag**: 모든 신규 기능은 `ff_s{stage}_{feature}` 플래그 하 배포. 롤백 = 플래그 off.
7. **상태 전이**: 명시적 전이 함수만 사용, 임의 뮤테이션 금지 (cre-fullim 규약 승격).
8. **수치 생성 금지**: 고객 대면 수치는 `financials.ts` 산출 + NLG 마스크 렌더링만. LLM 산문 내 수치 서술 금지(S3 이후 강제).

## 0.2 네이밍·구조

- 신규 도메인 디렉터리: `src/domain/asset/`, `src/domain/deal/`, `src/domain/deal/teaser/`, `src/domain/deal/pitch/`
- DB: snake_case 복수형. 마이그레이션: `supabase/migrations/NNNN_stageX_name.sql`
- 커밋: `feat(s1): ...` / `fix(im): ...` — 스테이지 태그
- 테스트: 모듈 옆 `__tests__/` (Vitest), E2E는 `e2e/` (Playwright)

## 0.3 신규 activity_events (본 SDD 범위)

```
Stage 0: constraint_violation_shown, constraint_violation_resolved
Stage 1: archetype_assigned, pitch_generated, pitch_sent, pitch_viewed
Stage 2: deal_lost_tagged, match_rejected_tagged, hotlead_ignored_tagged,
         im_edit_diff_captured, outcome_price_recorded, gam_note_saved,
         enrichment_completed, enrichment_failed, pitch_lost_tagged
Stage 3: teaser_published, teaser_reident_blocked, teaser_band_widened,
         teaser_view, teaser_section_dwell, teaser_slider_set,
         teaser_quickform_answer, teaser_cta_click, intent_draft_from_teaser,
         im_pro_requested, im_pro_broker_approved, im_pro_seller_approved,
         im_pro_nda_signed, im_pro_viewed, im_pro_expired, im_pro_revoked,
         partial_regen_executed, smarttalk_escalated, smarttalk_booking_created,
         match_reason_shown, copy_variant_click
```

## 0.4 Feature Flags 총목록

```
S0: ff_s0_constraint_gate, ff_s0_rag_hygiene, ff_s0_publish_unified,
    ff_s0_assumptions, ff_s0_dcf_grade_gate, ff_s0_vibe_optional
S1: ff_s1_deal_workspace, ff_s1_home_v2, ff_s1_public_enrich,
    ff_s1_archetype, ff_s1_pitch_warm, ff_s1_grade_engine
S2: ff_s2_ocr_leases, ff_s2_ocr_registry, ff_s2_memo_slots, ff_s2_massing_pdf,
    ff_s2_client_timeline, ff_s2_tacit_tagging, ff_s2_edit_diff, ff_s2_pitch_cold
S3: ff_s3_nlg_mask, ff_s3_dual_register, ff_s3_teaser_v2, ff_s3_reident_gate,
    ff_s3_teaser_slider, ff_s3_im_tiering, ff_s3_consent_chain,
    ff_s3_inbox_unified, ff_s3_smarttalk_lite, ff_s3_match_reasons,
    ff_s3_partial_regen, ff_s3_map_tier, ff_s3_visitor_fp   # v1.2
v1.3: ff_s0_ui_financials, ff_s1_addr_guard, ff_s1_cache_ttl, ff_s2_excel_bridge
```
- v1.2 이벤트 추가: `map_tier_rendered`, `map_fuzzy_expanded`, `mandate_recorded`, `visitor_fp_migrated`
- v1.3 이벤트 추가: `ui_calc_unified`, `addr_confidence_low_flagged`, `cache_stale_refreshed`, `excel_import_saved`

## 0.5 확정 공백(GAP) 태스크 — 어떤 스펙에도 없어 구현 중 확정해야 하는 것

| GAP | 공백 | 해소 태스크 | 산출물 (레포에 남길 것) |
|-----|------|-------------|--------------------------|
| GAP-1 | 공공 API 응답 필드 → 온톨로지 슬롯 매핑표 부재 (YAML §8은 API 단위까지만) | **S1-T5** (산출물 조항 추가) | `docs/ontology/api-slot-mapping.md` — API별 응답 필드↔슬롯↔변환 규칙 표 |
| GAP-2 | grade 가중치 확정표 미완 (required_for_grade 마킹만 존재) | **S1-T0** (신규 — S1-T7 선행) | 온톨로지 **YAML v0.1.1** — 자산군별 필드 가중치·등급 임계 확정 |
| GAP-3 | NLG 마스크 템플릿 본문 부족 (YAML §7 샘플 6종뿐) | **S3-T1** (산출물 조항 추가) | `docs/specs/nlg-mask-templates.md` — 섹션별 초기 템플릿 세트 (진화 대상임을 명시) |
| GAP-4 | 법정 문구·NDA·면책 원문 부재 (스펙은 "고정 문구 필수"까지만) | **S0-T11** (v0 플레이스홀더) + **S3-T17** (v1 확정) | `docs/legal/copy-pack.md` — 문구 ID별 원문·적용 위치·법률 검토 상태 |
| GAP-5 | 화면 와이어프레임 부재 (티저만 레이아웃 확정) | **S1-T14** (워크스페이스·홈) + S3 UI 태스크 내 병행 명시 | `docs/design/wireframes/` — 워크스페이스 5탭·홈 v2·인박스 |

**GAP 공통 규칙**: GAP 산출물은 코드와 같은 PR 사이클로 관리한다(문서도 리뷰 대상). GAP-4의 법률 검토 전 배포는 플레이스홀더 문구 + `ff_legal_copy_v0` 플래그로만 허용하며, 대외 발행물(티저·Pitch·Pro)의 정식 오픈은 v1 확정이 조건이다.

---

# 1. 목표 아키텍처 (Stage 3 종료 시점)

```
┌─ L4 표면 ────────────────────────────────────────────────────────┐
│ 5탭 IA: 홈(액션큐) · 딜(파이프라인+워크스페이스) · 고객 · 인박스 · 더보기  │
│ 공개 뷰어: /dc(티저 v2) · /im-lite(Basic) · /im-pro/{grant} · /p/{pitch} │
├─ L3 서비스 ──────────────────────────────────────────────────────┤
│ S1 메모·CRM │ S2 딜 워크스페이스 │ S3 유통·추적·스마트톡 │ S4 매칭       │
├─ L2 암묵지 ──────────────────────────────────────────────────────┤
│ tacit_labels · im_edit_diffs · outcome 회귀 · (환류는 Stage 4)        │
├─ L1 데이터 ──────────────────────────────────────────────────────┤
│ deals·assets(온톨로지)·lease_units·deal_parties(역할 예약)             │
│ 충전 5경로 · 4-tier provenance · grade-engine · constraint-validator  │
└──────────────────────────────────────────────────────────────────┘
AI 파이프라인: writer(기존) + [G4 검증게이트]→[G5 아키타입]→[G2 마스크]→
               [기존 4중 가드레일+법정문구]→[G8 diff 수집], RAG는 G3 위생 적용
```

**AS-IS → TO-BE 핵심 델타**: ① building_ssot_lite 중심 → deals/assets(온톨로지) 중심 ② readiness 점수 → grade-engine 커버리지 ③ 수치 자유 생성+사후 검출 → 마스크 주입+2차 안전망 ④ 단일 IM → 사다리(Pitch·티저 v2·Basic/Pro) ⑤ 전 생성물 인덱싱 → 승인본만.

---

# 2. 데이터 모델 (전체 DDL)

## 2.1 Stage 0 마이그레이션 (`0100_stage0_foundation.sql`)

```sql
-- 가정값 외부화 (G7)
CREATE TABLE assumptions (
  key text PRIMARY KEY,              -- 'opex_ratio.office' | 'opex_ratio.logistics' | 'remodel_cost_per_m2' | 'wacc.base' | 'loan_rate.range' ...
  value_low numeric, value_base numeric, value_high numeric,
  unit text NOT NULL, as_of date NOT NULL, source_note text
);
-- 시드: 기존 financials.ts 하드코딩 값을 base로, ±범위 부여

-- RAG 인덱스 위생 (G3): im_documents 메타 확장
ALTER TABLE im_documents ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'draft';
  -- 'golden' | 'approved' | 'draft'
ALTER TABLE im_documents ADD COLUMN IF NOT EXISTS source_building_id uuid;
-- 1회 정리: status!='published' 문서 행 삭제 또는 provenance='draft' 마킹 후 검색 제외
```

## 2.2 Stage 1 마이그레이션 (`0110_stage1_deal_core.sql`)

```sql
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL CHECK (asset_type IN ('smallBuilding','logisticsCenter','landSite')),
  pnu text,
  region_code text,
  zoning_region text,                        -- enum:zoningRegion (C10: 필지당 1)
  attrs jsonb NOT NULL DEFAULT '{}',         -- 온톨로지 슬롯 {fieldId: value}
  provenance jsonb NOT NULL DEFAULT '{}',    -- {fieldId: {tier, verified_at, source_ref, override?}}
  data_grade char(1) CHECK (data_grade IN ('A','B','C','D')),
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE INDEX ix_assets_pnu ON assets(pnu);
CREATE INDEX ix_assets_region_type ON assets(region_code, asset_type);

CREATE TABLE deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES auth.users(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  pipeline_stage text NOT NULL DEFAULT 'sourcing' CHECK (pipeline_stage IN
    ('sourcing','analysis','pitch','marketing','negotiation','contract','closed','lost')),
  mandate_type text CHECK (mandate_type IN ('exclusive','open')),
  seller_consent_mode text DEFAULT 'per_request' CHECK (seller_consent_mode IN ('delegated','per_request')),
  archetypes text[] DEFAULT '{}',
  asking_price_krw bigint, outcome_price_krw bigint,
  lost_reason text CHECK (lost_reason IN ('price','loan','eviction','change_of_mind','permit','other')),
  lost_reason_note text,
  network_visible boolean DEFAULT false,     -- Stage 4에서 사용, 스키마만 선반영
  created_at timestamptz DEFAULT now(), closed_at timestamptz
);
CREATE INDEX ix_deals_broker_stage ON deals(broker_id, pipeline_stage);

CREATE TABLE lease_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  floor text NOT NULL, tenant_sector text, area_pyung numeric,
  deposit_krw bigint, monthly_rent_krw bigint, mgmt_fee_krw bigint,
  lease_start date, lease_end date, opposing_power boolean,
  source_tier text NOT NULL DEFAULT 'broker_input'
);

CREATE TABLE deal_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('seller','buyer_candidate','co_broker','professional')),
  profession text CHECK (profession IN ('tax','architect','legal','appraiser')),
  user_id uuid, client_id uuid,
  permissions jsonb DEFAULT '{}'
);

CREATE TABLE zoning_ordinance (
  sigungu_code text NOT NULL, zoning_region text NOT NULL,
  bcr_max numeric, far_max numeric, effective_date date,
  PRIMARY KEY (sigungu_code, zoning_region)
);
-- 시드: 서울 25개 구 조례값 (수집 태스크 S1-T8), fallback은 온톨로지 시행령 상한

CREATE TABLE location_hierarchy (
  code text PRIMARY KEY,             -- 법정동코드
  name text NOT NULL,
  level text NOT NULL CHECK (level IN ('dong','gu','si')),
  parent_code text REFERENCES location_hierarchy(code),
  region_code text                   -- GBD | SEONGSU | ... (온톨로지 region enum)
);
-- 시드: 서울 전체 + 경기 주요 (법정동코드 공공데이터)

CREATE TABLE pitches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  mode text NOT NULL CHECK (mode IN ('cold','warm')),
  blocks jsonb NOT NULL,
  price_opinion jsonb,               -- {low, high, comparables[], method_note} — cold는 NULL 강제(체크는 앱 레벨)
  status text DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','meeting','won','lost')),
  lost_reason text,
  seller_contact jsonb,
  share_token text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- 기존 building_ssot_lite → assets 브릿지 (점진 이관)
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES assets(id);
```

**이관 전략**: Stage 1에서 신규 딜은 assets 직행. 기존 building_ssot_lite 레코드는 조회 시 lazy 이관(어댑터 `ssot-lite-adapter.ts`가 읽기 시점에 assets 행 생성·연결). 이중 쓰기 금지 — 쓰기는 항상 assets.

## 2.3 Stage 2 마이그레이션 (`0120_stage2_tacit.sql`)

```sql
CREATE TABLE tacit_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL,
  deal_id uuid, asset_id uuid, match_id uuid,
  label_kind text NOT NULL CHECK (label_kind IN
    ('deal_lost','match_rejected','hotlead_ignored','rule_toggle',
     'golden_adopt','golden_reject','gam_note','pitch_lost')),
  label_value text NOT NULL,
  context jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
-- RLS: broker_id 본인만 R/W. 집계는 서비스 롤 뷰만.

CREATE TABLE im_edit_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL, section_type text NOT NULL, broker_id uuid NOT NULL,
  ai_text text NOT NULL, final_text text NOT NULL,
  edit_distance_norm numeric NOT NULL,       -- 0~1 정규화 Levenshtein
  judge_score numeric,
  consented boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE client_notes (                   -- 통화 메모 등 수동 타임라인 항목
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL, broker_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'call',
  body text NOT NULL, created_at timestamptz DEFAULT now()
);

CREATE VIEW v_client_timeline AS             -- activity_events + client_notes 통합 (client_id 기준)
  SELECT ... ;  -- 구현 시 확정
```

## 2.4 Stage 3 마이그레이션 (`0130_stage3_ladder.sql`)

```sql
CREATE TABLE teaser_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id),
  version int NOT NULL DEFAULT 1,
  band_overrides jsonb DEFAULT '{}',
  photo_ids uuid[] DEFAULT '{}',
  hook_copy text,
  curiosity_slot text,
  reident_result jsonb,                       -- {candidate_count, risky_slots[], checked_at}
  status text DEFAULT 'draft' CHECK (status IN ('draft','published','paused')),
  published_at timestamptz
);

CREATE TABLE teaser_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teaser_id uuid NOT NULL REFERENCES teaser_configs(id),
  visitor_fp text NOT NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ix_teaser_events ON teaser_events(teaser_id, event_type, created_at);

CREATE TABLE im_pro_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id),
  requester_name text NOT NULL,
  requester_phone text NOT NULL,             -- 인증 완료 번호
  requester_reason text,
  client_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','pending_broker','pending_seller','granted','active',
     'seller_denied','broker_denied','expired','revoked')),
  nda_signed_at timestamptz,
  expires_at timestamptz,
  watermark_seed text NOT NULL DEFAULT encode(gen_random_bytes(8),'hex'),
  created_at timestamptz DEFAULT now()
);

-- chat_rooms 확장 (스마트톡-lite)
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES deals(id);
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS ai_policy text NOT NULL DEFAULT 'cite_only'
  CHECK (ai_policy IN ('off','cite_only','cite_and_book'));
-- sender_type CHECK 확장: 'broker'|'guest'|'ai'|'co_broker'|'professional' (후자 2종은 예약)

-- 매수 의향 초안 (티저 퀵폼·행동 유래)
ALTER TABLE buyer_intents ADD COLUMN IF NOT EXISTS draft boolean DEFAULT false;
ALTER TABLE buyer_intents ADD COLUMN IF NOT EXISTS origin text; -- 'manual'|'teaser_quickform'|'behavior'
```

---

# 3. 도메인 모듈 명세

## 3.1 디렉터리 구조 (Stage 3 종료 시점)

```
src/domain/
├── asset/
│   ├── asset-ontology.ts          # S1: YAML 로더 → Zod 스키마·enum 상수·필드 메타
│   ├── constraint-validator.ts    # S0: C01~C12
│   ├── grade-engine.ts            # S1: 커버리지 → A~D (readiness 치환)
│   ├── archetype-classifier.ts    # S1: R01~R10
│   ├── provenance.ts              # S1: tier 기록·조회·override 처리
│   ├── ssot-lite-adapter.ts       # S1: 구 스키마 lazy 이관
│   └── enrichment/
│       ├── public-api-enricher.ts # S1: PNU 조인 자동충전 (~30슬롯)
│       ├── derived-enricher.ts    # S1: farHeadroomPp·subwayWalkMin·평당가 등
│       ├── ocr-enricher.ts        # S2: 계약서→lease_units, 등기부→seniorLoanKrw
│       ├── memo-slot-mapper.ts    # S2: MemoParser 출력→슬롯 후보(확인 칩)
│       └── massing-pdf-parser.ts  # S2: 외부 규모검토 PDF→buildableFloorArea
├── deal/
│   ├── deal-service.ts            # S1: 전이 함수(명시적)·결과 회귀·무산 태깅 훅
│   ├── pitch/
│   │   ├── pitch-generator.ts     # S1(warm)·S2(cold)
│   │   ├── price-opinion.ts       # S1: 비교사례 선정(슬롯 거리)+접면 보정+범위
│   │   └── pitch-templates.ts
│   └── teaser/
│       ├── teaser-projector.ts    # S3: SSoT→TeaserView (정밀값 타입 부재)
│       ├── banding.ts             # S3: 밴딩 함수
│       ├── reident-simulator.ts   # S3: k-익명성 역질의
│       ├── photo-safety.ts        # S3: 외관·간판 검출
│       └── teaser-insight.ts      # S3: 이벤트 집계·intent 초안
├── tacit/
│   └── tacit-service.ts           # S2: 라벨 기록·태깅 요청 큐
└── building/mobile-im/            # 기존 29모듈 + 추가:
    ├── nlg-mask-engine.ts         # S3: 마스크 템플릿·렌더
    ├── im-renderer.ts             # S3: tier(basic|pro)·register(b2b|b2c) 렌더
    └── regen-planner.ts           # S3: 필드→섹션 의존성·부분 재생성
```

## 3.2 핵심 인터페이스

```typescript
// ---------- asset-ontology.ts (S1) ----------
export type FieldId = string;                       // 온톨로지 property id
export type ProvenanceTier = 'public_data'|'expert_verified'|'broker_input'|'ai_inferred';
export interface AssetRecord {
  id: string; assetType: 'smallBuilding'|'logisticsCenter'|'landSite';
  pnu?: string; regionCode?: string; zoningRegion?: string;
  attrs: Record<FieldId, unknown>;
  provenance: Record<FieldId, { tier: ProvenanceTier; verifiedAt: string; sourceRef?: string; override?: boolean }>;
  dataGrade?: 'A'|'B'|'C'|'D';
}
export function loadOntology(): OntologyDef;         // YAML→메모리 (빌드 시 생성 검증)
export function zodFor(assetType: string): ZodSchema;
export function fieldMeta(id: FieldId): FieldDef;    // ko/en·unit·enum·grade 가중치

// ---------- constraint-validator.ts (S0) ----------
export interface Violation { id: `C${string}`; severity: 'error'|'warning'|'info'|'policy';
  message: string; fieldIds: FieldId[]; }
export function validateAsset(a: AssetRecord, ords: OrdinanceLookup): Violation[];
// error(C01,C05,C06,C10) → 생성·발행 차단 / warning → UI 경고 / policy(C11,C12) → 시스템 게이트

// ---------- grade-engine.ts (S1) ----------
export function computeGrade(a: AssetRecord): {
  grade: 'A'|'B'|'C'|'D'; coverage: number; missingForNextGrade: FieldId[]; };
// readiness.ts·data-quality-badge.ts는 deprecated 주석 후 이 함수에 위임

// ---------- archetype-classifier.ts (S1) ----------
export function classifyArchetypes(a: AssetRecord, m: MarketContext): {
  archetypes: DealArchetype[]; evidences: Record<DealArchetype, string[]>; };

// ---------- enrichment 공통 (S1~S2) ----------
export interface EnrichResult { filled: Record<FieldId, unknown>; tier: ProvenanceTier;
  failures: { fieldId: FieldId; reason: string }[]; }
// 실행 규칙: 비동기 Job·non-blocking·tier 우선 충돌 해소(§DEV_SPEC A1.3)·OCR은 확인 화면 경유

// ---------- nlg-mask-engine.ts (S3) ----------
export interface MaskTemplate { id: string; slotIds: FieldId[];
  register: 'b2b'|'b2c'; sectionTypes: SectionType[];
  render(a: AssetRecord, f: Financials): string; }
export function renderMaskedBlocks(s: SectionType, a: AssetRecord, f: Financials,
  register: 'b2b'|'b2c'): MaskedBlock[];   // 각 블록에 provenance 배지 문자열 포함
// 프롬프트 계약: "[MASKED:n] 블록은 원문 그대로 배치, 블록 밖 수치 서술 금지"

// ---------- im-renderer.ts (S3) ----------
export type ImTier = 'basic'|'pro';
export function renderIM(docId: string, tier: ImTier, opts: {
  register: 'b2b'|'b2c'; grantId?: string; personalization?: BuyerProfile; }): RenderedIM;
// 타입 보장: RenderedIM<'basic'>에 gated 슬롯 필드가 존재하지 않음 (컴파일 타임)

// ---------- teaser-projector.ts (S3) ----------
export function projectTeaser(a: AssetRecord, d: DealRecord, c: TeaserConfig): TeaserView;
// TeaserView: 밴드 문자열·라벨만. number 타입 정밀값 필드 부재.

// ---------- reident-simulator.ts (S3) ----------
export async function simulateReidentification(v: TeaserView): Promise<{
  candidateCount: number; riskySlots: FieldId[];
  suggestions: { fieldId: FieldId; newBand: string; resultCount: number }[]; }>;
// K 기본 20 (권역 밀도별 설정). 발행 API가 이 결과 없이는 published 전이 거부.

// ---------- regen-planner.ts (S3) ----------
export const FIELD_SECTION_DEPS: Record<FieldId, SectionType[]>;
export async function regenerateSections(docId: string, changed: FieldId[]): Promise<RegenResult>;

// ---------- deal-service.ts (S1) ----------
export function transitionDeal(dealId: string, to: PipelineStage, meta?: {
  outcomePriceKrw?: number; lostReason?: LostReason; }): Promise<void>;
// 'closed' 전이 → outcomePriceKrw 요구(모달) / 'lost' 전이 → lostReason 요구 → tacit_labels 기록
```

## 3.3 writer.ts 주입 지점 (기존 파이프라인 변경 최소화)

```typescript
// TO-BE 의사코드 — 변경점만 (기존 로직 유지)
const asset = await loadAssetRecord(buildingId);                    // [S1] 어댑터 경유
const violations = validateAsset(asset, ords);                      // [S0]
if (hasError(violations)) return blockWithGuidance(violations);
const grade = computeGrade(asset);                                  // [S1]
const fin = calculateFinancials(asset, await loadAssumptions());    // [S0] 상수→테이블
const { archetypes, evidences } = classifyArchetypes(asset, mkt);   // [S1]
const ragCtx = await searchSimilarIMs({ facets: {...}, provenanceIn: ['golden','approved'] }); // [S0/S1]
for (const section of SECTIONS) {
  const masked = ffOn('s3_nlg_mask', section)                        // [S3] 섹션별 플래그
    ? renderMaskedBlocks(section, asset, fin, register) : [];
  const prompt = buildNarrativeUserPrompt(section, asset, masked, evidences, ...);
  // ... 기존 생성·가드레일·Judge 유지 (가드레일에 법정 문구 패턴 추가 [S0])
}
runCrossValidation(sections);                                        // 유지 — 2차 안전망
if (grade === 'A') attachDCF(fin);                                   // [S0] C11
await indexIMSections({ onlyIf: 'published_and_approved' });         // [S0] G3
```

---

# 4. API 계약 (신규·변경 전체)

| Stage | Method·Path | 요청 → 응답 (요지) | 비고 |
|---|---|---|---|
| S0 | POST `/api/broker/deal-doc/{id}/publish` | 통합 발행: 투자요약+OG 저장→검증→발행. `{ violations[] }` 반환 시 409 | 기존 이중 저장 API deprecated |
| S1 | POST `/api/broker/deals` | `{ address \| pnu, assetType }` → deal+asset 생성, enrich Job 트리거 | |
| S1 | GET `/api/broker/deals/{id}` | 워크스페이스 5탭 데이터 (개요·데이터·문서·관계자·활동) | |
| S1 | PATCH `/api/broker/assets/{id}/attrs` | `{ fields: {id: value}, tier }` → provenance 동반 저장, grade 재계산, violations 반환 | tier 누락 400 |
| S1 | POST `/api/broker/deals/{id}/transition` | `{ to, outcomePriceKrw?, lostReason? }` | 명시적 전이만 |
| S1 | POST `/api/broker/pitch` | `{ mode:'warm', dealId }` → blocks 초안 | cold는 S2 |
| S1 | POST `/api/broker/pitch/{id}/send` / GET `/api/public/p/{token}` | 발송·매도인 열람(추적) | |
| S2 | POST `/api/broker/assets/{id}/ocr` | multipart(계약서·등기부) → 파싱 결과(확인용, 미저장) | 확인 API로 저장 |
| S2 | POST `/api/broker/assets/{id}/ocr/confirm` | 수정·확인된 슬롯 → 저장(tier=broker_input, sourceRef=ocr) | |
| S2 | POST `/api/broker/tacit` | `{ labelKind, labelValue, dealId? ... }` | 1탭 태깅 공용 |
| S2 | POST `/api/broker/pitch` (mode:'cold') | `{ address }` → asset 자동 생성+공공충전+콜드 블록 | price_opinion 생성 거부 |
| S2 | GET `/api/broker/clients/{id}/timeline` / POST `.../notes` | 타임라인·통화 메모 | |
| S3 | POST `/api/broker/deals/{id}/teaser` / `.../teaser/publish` | 구성 저장 / 재식별 게이트→발행. 게이트 실패 시 `{ suggestions[] }` 409 | |
| S3 | GET `/api/public/teaser/{id}` | TeaserView | 정밀값 无 |
| S3 | POST `/api/public/teaser/{id}/event` / `.../interest` | 이벤트 수집 / 관심 등록+퀵폼→intent 초안 | |
| S3 | POST `/api/public/im-lite/{id}/pro-request` | `{ name, phone(인증), reason }` → grant(pending) | |
| S3 | POST `/api/broker/pro-grants/{id}/approve\|deny\|revoke\|extend` | 동의 체인 전이 | |
| S3 | POST `/api/public/pro-grants/{id}/seller-consent` | 매도인 원클릭(서명 토큰) | |
| S3 | POST `/api/public/im-pro/{grantId}/nda-sign` / GET `/api/public/im-pro/{grantId}` | NDA → active / Pro 렌더(워터마크) | |
| S3 | POST `/api/broker/im/{docId}/regen` | `{ changedFields[] }` → 부분 재생성 | |
| S3 | POST `/api/public/chat/{roomId}/message` | 스마트톡 — ai_policy에 따라 cite_only 응답 or 에스컬레이션 | |

공통 에러 규격: `{ code: 'VALIDATION_ERROR'|'CONSTRAINT_VIOLATION'|'REIDENT_BLOCKED'|'UNAUTHORIZED'|'GRANT_INVALID', detail }`.

---

# 5. Stage 0 — 신뢰 복원 (주 1~3)

**목표**: 수치·검증·인덱싱·발행의 신뢰 기반. 모든 후속 스테이지의 전제.

## 5.1 태스크 분해

| ID | 태스크 | 대상 | 내용 | 의존 | 테스트 |
|----|--------|------|------|------|--------|
| S0-T1 | NOI 공식 단일화 | `financials.ts` + 문서 | `NOI = 연 임대수입 − OPEX` 확정. 관리비 처리 명문화(임차인 부담=수입/소유주 부담=비용). 모든 산출 경로·툴팁·가이드 문구 일치 | — | 단위: 기준 케이스 12종 |
| S0-T2 | assumptions 테이블·연동 | 신규 테이블, `financials.ts`, `value-add-engine.ts` | 하드코딩 상수(OPEX율·리모델링 단가·WACC) → 테이블 조회. 산출 표시에 범위+`⚙ 가정` 배지+기준연도 | T1 | 단위: 범위 산출·배지 문자열 |
| S0-T3 | DCF A등급 게이트 (C11) | `writer.ts`, `dcf-sensitivity.ts` | grade<A 시 DCF·NPV·민감도 미첨부, "데이터 보강 시 제공" 문구 | T5 | 단위+스냅샷 |
| S0-T4 | constraint-validator | 신규 `asset/constraint-validator.ts` | C01~C12 구현 (C02·C03은 ordinance 조회, 없으면 시행령 상한). 상태 머신 `data_collection→property_overview` 게이트 삽입 | — | 단위: 규칙별 위반/통과 24케이스 |
| S0-T5 | grade 임시 산정 | 기존 readiness 확장 | Stage 1 grade-engine 전까지 기존 readiness에 'A 조건' 추가(임시) — T3 게이트용 | — | 단위 |
| S0-T6 | RAG 인덱싱 위생 (G3) | `im-embedding-indexer.ts`, RPC | `published+approved`만 upsert. provenance 컬럼·랭킹 가중(golden>approved). 자기 buildingId 제외. 기존 인덱스 정리 마이그레이션 | 2.1 DDL | 통합: 미승인 문서 인덱싱 0 검증 |
| S0-T7 | 발행 단일 플로우 | 신규 publish API, 승인 페이지 UI | 투자요약+OG 통합 저장·발행 1버튼·제목→OG 자동 동기화·`?v=` 캐시 버스팅. 발행 전 violations 표시 | T4 | E2E: 편집→발행→카톡 미리보기 |
| S0-T8 | 법정 문구 가드레일 | `guardrails.ts` | 법정 보수 요율 미표시·중개대상물 표시 의무 등 준수 체크 패턴 추가(P1 경고) + Pitch용 감정평가·보장 표현 패턴 선반영 | — | 단위: 패턴 12종 |
| S0-T9 | Vibe 성격분석 선택화 | 온보딩 플로우 | 온보딩 필수 단계에서 제거 → 설정 내 선택. 명함은 경력·자격 중심 유지 | — | E2E: 신규 가입 플로우 |
| S0-T10 | 이벤트·플래그 ·롤백 | 공통 | 0.3 이벤트(S0분)·0.4 플래그 등록, 플래그 off 롤백 경로 문서화 | 전체 | CI |
| S0-T11 | 법무 카피 팩 v0 (GAP-4) | 신규 `docs/legal/copy-pack.md` | 문구 ID 체계 수립(LC-001~) + 플레이스홀더 원문 작성(감정평가 부인·보수 요율·면책·NDA 초안) + 적용 위치 매핑(가드레일 패턴 ID와 연결) + 법률 검토 의뢰 목록·상태 트래킹. `ff_legal_copy_v0` | T8 | 단위: 문구 ID 참조 무결성 |
| S0-T12 | UI 내 재무 산식 제거 (v1.3 — D5) | `im-data-bottom-sheet.tsx`·financials.ts | 바텀시트 Cap 역산기·"예상 Cap Rate" 표시의 인라인 산식을 financials.ts 단일 호출로 교체. Gross Cap 단독 표시 금지 — "운영경비 미반영" 병기 또는 범위 표시. **S0-T1과 동일 스프린트 필수** (수치 경로 단일화의 완결) | T1 | 단위: UI 표시값=엔진 산출값 일치 · ci #13 |

## 5.2 Stage 0 DoD

- [ ] 수치 관련 수정 요청 0건 (베타 주간 리포트 기준)
- [ ] 입력 모순(C-error) 통과 0건 · violations 이벤트 기록 100%
- [ ] UI 내 인라인 재무 산식 0건 (S0-T12 — ci #13 통과)
- [ ] `im_documents`에 미승인 문서 신규 유입 0
- [ ] 발행 소요(생성 완료→발행) 중앙값 50%↓ · 카카오 캐시 수동 초기화 안내 제거
- [ ] 기존 공개 URL 전수 회귀 테스트 통과

---

# 6. Stage 1 — 딜 중심 재조립 (주 4~7)

**목표**: 온톨로지 데이터 레이어 + 딜 워크스페이스 + 공공 자동충전 + Pitch 웜 모드.

## 6.1 태스크 분해

| ID | 태스크 | 대상 | 내용 | 의존 | 테스트 |
|----|--------|------|------|------|--------|
| S1-T0 | grade 가중치 확정 (GAP-2) | 온톨로지 YAML v0.1.1 | 자산군별 필드 가중치표·등급 임계(A/B/C/D) 확정 — 베타 브로커 검증 항목과 대조 후 YAML 개정. **S1-T7 착수 전 완료 필수** | — | YAML 스키마 검증 CI |
| S1-T1 | 온톨로지 로더 | 신규 `asset-ontology.ts` + CI | YAML→Zod·enum·필드 메타 생성. CI: YAML↔코드 diff 0 검증 스크립트 | T0 | 단위+CI |
| S1-T2 | Stage1 DDL·RLS | `0110` 마이그레이션 | §2.2 전체 + RLS(브로커 소유 행만) | T1 | 마이그레이션 테스트 |
| S1-T3 | ssot-lite 어댑터 | `ssot-lite-adapter.ts` | 구 레코드 lazy 이관·이중 쓰기 금지 가드 | T2 | 통합: 왕복 일관성 |
| S1-T4 | provenance 서비스 (v1.3 — R6 구체화) | `provenance.ts` + PATCH attrs API | tier 동반 저장·충돌 해소(tier 우선·override 플래그)·lint 규칙. **lint 명시 대상 1호: handler.ts의 `...(directData ?? {})` spread 병합** — 필드별 tier 기록 병합으로 교체 (무출처 덮어쓰기의 현행 사례) | T2 | 단위: 충돌 6케이스 + directData 병합 회귀 |
| S1-T5 | 공공데이터 온톨로지 어댑터 (v1.3 전면 개정 — R1·GAP-1) | 기존 `external-data-orchestrator.ts`·`enrich-by-pnu.ts` + 신규 `enrichment/ontology-adapter.ts` | **신설 아님 — 기존 7 API 오케스트레이터(대장·공시지가·토지이용·실거래·POI·등기·상권, 병렬·fault-tolerant·캐시)의 산출을 온톨로지 슬롯에 매핑**: ExternalDataEnrichmentResult → assets.attrs(provenance=public_data) 어댑터. vworld 토지특성(형상·고저·도로접면)만 신규 API 추가. 기존 폴백 순서·캐시 재사용. **산출물: `docs/ontology/api-slot-mapping.md`** — 기존 7 API 응답 필드 기준 매핑표. 선독: `audit/im-data-supply-audit.md` §4 | T4 | 통합: 실주소 5건 스냅샷 + 매핑표↔코드 일치 + 기존 캐시 히트 경로 회귀 |
| S1-T6 | derived-enricher | 동 디렉터리 | farHeadroomPp(조례 상한−현재)·subwayWalkMin(카카오 POI)·평당가·regionCode(계층 테이블) | T5, T8 | 단위 |
| S1-T7 | grade-engine (v1.3 — R5 계승 명시) | `grade-engine.ts` | 자산군별 필드 가중 커버리지→A~D·missingForNextGrade. readiness·quality-badge 위임 전환. S0-T5 임시 로직 제거. **기존 readiness의 부분 점수 규칙(지번 미확정 감점 등)과 바텀시트 실시간 게이지 UI를 계승** — '신뢰도 하향' 개념으로 일반화(S1-T15와 동일 패턴) | T1 | 단위: 자산군×등급 12케이스 + 부분점수 회귀 |
| S1-T8 | 조례·행정계층 시드 | zoning_ordinance·location_hierarchy | 서울 25구 조례값·법정동코드 시드 스크립트 | T2 | 데이터 검증 |
| S1-T9 | archetype-classifier | `archetype-classifier.ts` | R01~R10 + evidences. writer 주입(investment_thesis 근거 블록)·deals.archetypes 저장·`archetype_assigned` | T1, T7 | 단위: 규칙별 10케이스 |
| S1-T10 | 딜 워크스페이스 5탭 (v1.3 — R4 재사용 명시) | `/broker/deal/{id}` UI + GET API | 개요(단계·지표·아키타입 뱃지)·데이터(슬롯 편집기+자동채움 표시+violations+missing)·문서(생성 버튼 4종—티저·IM은 기존 연결)·관계자·활동. **데이터 탭은 그린필드 아님 — 바텀시트(1,056줄: 주소검색+PNU·엑셀 임포트·사진 12장·물류 17필드·게이지)의 컴포넌트 승격·개편**. 바텀시트는 'IM 생성 직전 1회 입력'에서 '딜 상시 데이터 허브'의 숏컷으로 위상 변경 | T2~T9 | E2E: 딜 생성→충전→편집 + 바텀시트 경로 회귀 |
| S1-T11 | TO-BE 홈 (액션 큐) | `/broker` v2 | 우선순위 큐(Hot Lead·Gate 대기·일정·정체 딜)·브리핑 카드(모닝인텔 흡수)·파이프라인 스냅샷. 구 대시보드 병행(플래그) | T10 | E2E |
| S1-T12 | deal-service 전이 (v1.2 개정) | `deal-service.ts` + 딜 생성 UI | 명시적 전이·closed→outcome 모달·lost→사유 모달(기록은 S2 tacit 연결 전 임시 컬럼). **v1.2 추가**: ①딜 생성 직후 수임 상태 1탭 분기(이미 수임/경쟁 중/접촉 전) — '이미 수임'은 mandate_type+seller_consent_mode 2탭 기록 후 마케팅 직행 ②`analysis→marketing` 직행 전이 유효(제안 단계 skippable) ③`mandate_type='verbal'` 허용 + 수임 확인서 발송 제안(비강제) | T2 | 단위: 전이 매트릭스(직행 포함)·분기 3경로 E2E |
| S1-T13 | Pitch 웜 모드 | `pitch/` 3모듈 + API + 공개 뷰어 | 6블록 생성(가격 의견: 비교사례 슬롯 거리+접면 보정+범위+감정평가 부인 문구[LC 참조])·모바일/PDF·열람 추적·S0-T8 가드레일 적용. **v1.2 주석**: `pitch_blocks` 부분 재사용 API 유지 — Pitch 미생성 딜에서도 주간 매각 리포트·가격 의견 블록 단독 생성 가능(수임 후 보고·호가 조정용) | T5, T9, S0-T11 | 단위(price-opinion)+E2E(생성→발송→열람) |
| S1-T14 | 와이어프레임: 워크스페이스·홈 (GAP-5) | `docs/design/wireframes/` | 딜 워크스페이스 5탭·TO-BE 홈(액션 큐)의 와이어프레임 — T10·T11 개발과 병행(선행 1주). 베타 2인 페이퍼 테스트 후 확정. **설계 기준 문서: `docs/specs/pipeline-uiux.md`** (3고도 구조·카드 4행 문법·다음 액션 1개 원칙·탭 수 상한 — v1.2 지정) | — | 리뷰 승인 + 탭 수 상한 준수 |
| S1-T15 | 주소 폴백 신뢰도 가드 (v1.3 — D6) | handler 3단계 폴백·constraint-validator | 3차 폴백(raw_input 정규식·`"서울시 {area_signal}"` 조합)으로 얻은 주소의 자동충전에 `address_confidence='low'` 마킹 → 해당 public_data 슬롯에 "주소 확인 필요" 배지·**C13 신설**(발행 시 경고). 오건물 공부 데이터가 ✓ 배지로 실리는 것을 구조적 차단 | T5 | 단위: 폴백 3경로별 confidence · E2E-10 |
| S1-T16 | 캐시 TTL 소스별 차등 (v1.3 — D10) | external_data_cache | 일괄 30일 → 대장·용도지역 30일 / 공시지가 90일 / **등기 7일+발행 시 재검증** / 실거래 14일 / POI·상권 30일. 발행 게이트에 스테일 체크(등기 초과 시 재조회 후 발행) | T5 | 단위: TTL 매트릭스 · 발행 스테일 케이스 |

## 6.2 Stage 1 DoD

- [ ] 베타 10인 TO-BE 워크스페이스 전환 (구화면 사용률 주간 감소 추세)
- [ ] 신규 딜의 공공 자동충전 성공률 90%+ (주소 유효 기준) · 자동 슬롯 ~30개 충전
- [ ] 아키타입 뱃지 표시 100% · thesis에 근거 블록 포함 100%
- [ ] Pitch 실사용 5건+ · 가격 의견 부인 문구(LC 참조) 100%
- [ ] provenance 누락 쓰기 0 (lint CI)
- [ ] GAP 산출물: YAML v0.1.1(가중치 확정) · `api-slot-mapping.md` · 워크스페이스·홈 와이어프레임 승인 완료
- [ ] v1.3: 3차 폴백 주소 딜의 confidence 마킹 100% · 캐시 TTL 매트릭스 적용 · 기존 오케스트레이터 캐시 히트 경로 회귀 통과

---

# 7. Stage 2 — 충전·암묵지 (주 8~10)

**목표**: 입력 병목 해소(OCR·음성·PDF) + 암묵지 수집 가동 + Pitch 콜드.

## 7.1 태스크 분해

| ID | 태스크 | 대상 | 내용 | 의존 | 테스트 |
|----|--------|------|------|------|--------|
| S2-T1 | 렌트롤 3채널 통합 — OCR 추가 (v1.3 개정 R2) | `ocr-enricher.ts` + 기존 `rent-roll-importer.tsx` | **엑셀 임포터가 1차 채널**(실무: 관리사무소·매도인이 엑셀 제공 — 기존 파서의 헤더 탐지·단위 자동 감지·공실 판정 보존). ②계약서 촬영 OCR(신규 보완 채널) ③음성(S2-T3). 전 채널 확인 화면(1탭 수정) 경유·C08 위반 하이라이트 | S1-T4, **T11** | 통합: 엑셀 5종+계약서 10종 정확도 |
| S2-T2 | 등기 데이터 이중화 (v1.3 개정 R3) | 기존 등기정보 API + OCR 보완 | **등기정보 API(기연동)가 1차** — 근저당 채권최고액(✓ public_data). OCR은 API 미커버·최신성 확인 보완. 실 대출 잔액은 매도인 고지(👤)로 구분 저장 — Pro 렌더의 이중 표기 근거 | T1 | 통합 |
| S2-T3 | memo-slot-mapper (v1.3 — R7 구체화) | `memo-slot-mapper.ts` | **기존 MemoParser(PII 마스킹→LLM→복원·Zod 검증) 위의 슬롯 매핑 레이어 — 파서 재작성 금지.** 출력→온톨로지 슬롯 후보→확인 칩 UI("매각가 85억으로 채울까요?"). `ambiguousFields`("가격대: 추정")를 확인 칩 우선 노출로, `detectedSensitiveFields`는 hidden_fields→disclosure 정책 연결 | S1-T1 | 단위: 발화 20종 + PII 회귀 |
| S2-T4 | massing-pdf-parser | `massing-pdf-parser.ts` | 디스코·밸류맵 규모검토 PDF→buildableFloorArea·massingSource. 실패 시 수동 입력 유도 | S1-T4 | 통합: 샘플 PDF 3종 |
| S2-T5 | tacit-service + 1탭 태깅 | `tacit/` + UI 모달 | deal lost(5택1)·match rejected(4택1)·hotlead ignored. 모달 규칙: 선택지≤5·스킵 가능·재요청 1회(홈 액션 큐) | S1-T12 | E2E: lost 전이→태깅→기록 |
| S2-T6 | 편집 diff 수집 (G8) | save-sections API·`im_edit_diffs` | 정규화 편집거리 계산·consented 동의 UI·Judge 점수 연결. 주간 상관 리포트 배치(관리자) | 2.3 DDL | 단위+배치 검증 |
| S2-T7 | 고객 타임라인 | `v_client_timeline`·client_notes·UI | activity_events(client_id 집계)+통화 메모. 고객 상세 탭 | S1-T2 | E2E |
| S2-T8 | '감' 필드 | memo 플로우 | 구조화 실패 감성 표현→`attrs.gam_notes[]`+`gam_note` 라벨 | T3 | 단위 |
| S2-T9 | 위반건축물 슬롯 | 온톨로지 v0.1.1 + enricher | `violationStatus`(public_data — 대장 위반 표기) 추가·리스크 섹션 자동 반영(Basic 노출 원칙) | S1-T5 | 통합 |
| S2-T10 | Pitch 콜드 모드 | pitch-generator 확장 | 주소만→asset 자동 생성+공공충전+4블록(가격 의견 생성 **거부**). 10분 목표 타이머 계측 | S1-T13 | E2E: 주소→발송 10분 검증 |
| S2-T11 | 엑셀 임포터 표준 접속 (v1.3 신규 — N4) | 기존 `rent-roll-importer.tsx`·`lease-adapter.ts` | 기존 파서 산출(FloorLeaseInput[])→**lease_units 테이블 저장**(현재는 바텀시트 상태로만 존재)+provenance(broker_input·sourceRef='excel')+C08 sanity 하이라이트+임포트 이력. 파서 인텔리전스(헤더 탐지·단위 감지·공실 판정)·양식 API 보존. 단위 변환은 기존 lease-adapter 재사용 | S1-T2, S1-T4 | 통합: 실무 엑셀 5종 → lease_units 왕복 |

## 7.2 Stage 2 DoD

- [ ] A등급 IM 비율 50%+ (grade-engine 기준)
- [ ] OCR 렌트롤: 확인 화면 경유율 100% (무확인 저장 0)
- [ ] 태깅 응답률 60%+ · diff 동의율 80%+ (베타 기준)
- [ ] 콜드 Pitch 주소→발송 가능 10분 이내 (E2E 타이머)
- [ ] 위반건축물 표기 100% (해당 자산)

---

# 8. Stage 3 — 생성 전환·사다리 완성 (주 11~13+)

**목표**: NLG 마스크·티저 v2·IM 이원화·인박스·스마트톡-lite·설명 가능 매칭·부분 재생성.

## 8.1 태스크 분해

| ID | 태스크 | 대상 | 내용 | 의존 | 테스트 |
|----|--------|------|------|------|--------|
| S3-T1 | nlg-mask-engine (GAP-3 포함) | 신규 모듈 | 마스크 템플릿(히어로·income_analysis 우선)·register 이중화·provenance 배지·단위/반올림 정책 내장. **산출물 의무: `docs/specs/nlg-mask-templates.md`** — 섹션별 초기 템플릿 세트(히어로 6·수익분석 8·임대차 4 이상), 브로커 편집으로 진화하는 문서임을 명시 | S1-T1, S0-T2 | 단위: 템플릿별 렌더 스냅샷 |
| S3-T2 | writer 마스크 결합 | `narrative-prompt.ts`·`writer.ts` | [MASKED] 블록 계약·블록 외 수치 서술 탐지(기존 Hallucination Guard 확장)·섹션별 플래그 | T1 | 통합: 마스크 구간 수치 오류 0 |
| S3-T3 | cross-validator 격하 | `cross-validator.ts` | 마스크 적용 섹션은 2차 안전망 모드(경고만)·미적용 구간 유지 | T2 | 회귀 |
| S3-T4 | im-renderer (이원화) | `im-renderer.ts` | basic/pro 렌더 정책·타입 수준 gated 부재·B2B/B2C register·개인화 훅 | T1 | 타입 테스트+스냅샷 |
| S3-T5 | 동의 체인 | `im_pro_grants`·API 5종·인박스 연동 | 8상태 전이·SLA(브로커 24h 리마인드·매도인 48h 에스컬레이션)·NDA 전자서명·만료·회수 | 2.4 DDL | 단위: 전이 매트릭스 / E2E: 요청→NDA→열람 |
| S3-T6 | Pro 열람 제어 | `/im-pro/{grantId}` 뷰어 | grant URL·번호 재인증(24h 세션)·워터마크(뷰어+PDF)·재공유 감지(fp 상이→일시정지) | T5 | E2E+스냅샷 |
| S3-T7 | Pro 개인화 모듈 | 렌더러 확장 | 대출 시뮬(assumptions 범위·밴드·가정 배지·확정 표현 금지)·세금 표준 3시나리오·면책 고정 문구 | T4, S0-T2 | 가드레일 테스트 |
| S3-T8 | 티저 프로젝터·밴딩 | `teaser/` 2모듈 | TeaserView(정밀값 타입 부재)·밴딩 기본값·band_overrides | S1-T1 | 타입+단위 |
| S3-T9 | 재식별 시뮬레이터 | `reident-simulator.ts` + publish API | 자체 공공 DB 역질의·K=20(권역별 설정)·suggestions·발행 게이트(우회 불가)·`reident_result` 스냅샷 | T8, S1-T5 | 통합: 실데이터 후보 수 검증 10케이스 |
| S3-T10 | photo-safety | `photo-safety.ts` | 외관 전경·간판 OCR 검출→티저 제외(IM용 보존) | — | 단위: 사진 세트 20장 |
| S3-T11 | 티저 v2 뷰어·인터랙션 | `/dc/{id}` v2 | 골디락스 레이아웃(§티저 스펙 2.1)·궁금증 갭·CTA 3단·슬라이더('내 조건으로 보기' — assumptions 범위 내)·퀵폼·유사 딜 2건 | T8~T10 | E2E |
| S3-T12 | teaser-insight | `teaser-insight.ts` | 이벤트 집계(깔때기·슬라이더 분포)·intent 초안 생성(quickform·행동)·브로커 인사이트 API | T11 | 단위+통합 |
| S3-T13 | 인박스 통합 | `/broker/inbox` v2 | 3필터(요청/열람·반응/채팅)·인라인 처리(Gate·Pro grant·전화·답장) | T5 | E2E |
| S3-T14 | 스마트톡-lite | chat 확장·응답 엔진 | ai_policy=cite_only(검증 슬롯+마스크 인용+출처 배지)·신규 계산 금지·에스컬레이션 템플릿·부재 모드(안내+예약+아침 요약)·@명령 브로커 전용(전송 버튼 경유) | T1 | 가드레일 테스트: 금지 질의 20종 |
| S3-T15 | 설명 가능 매칭 | `match-engine.ts` 확장 | 3단(하드 enum→아키타입→유사도)·match_reasons 표시 의무·R09 감점 경고·거절 태깅 연결(S2-T5) | S1-T9 | 단위: 매칭 12케이스 |
| S3-T16 | 부분 재생성 | `regen-planner.ts` | FIELD_SECTION_DEPS·영향 섹션만 재생성·앵커 갱신·`partial_regen_executed` | T2 | 통합: 필드 변경→섹션 범위 검증 |
| S3-T17 | 법무 카피 팩 v1 확정 반영 (GAP-4) | `docs/legal/copy-pack.md` + 적용 지점 전수 | 법률 검토 완료 원문으로 교체(NDA 원문·감정평가 부인·면책·보수 요율 표기)·문구 ID 참조 지점 전수 치환·`ff_legal_copy_v0` 제거. **티저·Pitch·Pro의 정식(비베타) 오픈 전제조건** | S0-T11, 법률 검토 | 단위: 문구 ID 무결성 + 스냅샷 전수 |
| S3-T18 | tier별 맵 렌더 정책 (v1.2 — MI-1 편입) | `map-tier-renderer.ts`(신규)·im-renderer·teaser-projector·뷰어 맵 | 티저=권역 폴리곤(핀 없음·딥링크 없음) / Basic=서버 오프셋 퍼지 원(±150m·반경 400m·**시드 딜별 고정**) / Pro=정확 핀+POI 주석+딥링크(현행). 재식별 게이트에 맵 표현 포함(후보<K 시 원 반경 확대 제안). 선독: `docs/specs/map-image-upgrade.md` §MI-1 | T4, T8, T9 | 네트워크 테스트: Basic 이하 응답에 정확 좌표 부재 / 타입 테스트 / 오프셋 시드 고정성 |
| S3-T19 | visitor_fp 단일화 (v1.2 — 공통 승격) | `visitor-fingerprint.ts`(신규 공용)·티저/매거진/IM 열람 수집부 | 핑거프린트 알고리즘 단일 구현(해시 규격 통일)·기존 visitor_id 병행 기록→전환 마이그레이션. 소비자: 리드 스코어·teaser_events·매거진 분석(MG-A4)·이미지 반응(Stage 4 MI-8) | — | 단위: fp 결정성·크로스 채널 조인 정합 |

## 8.2 Stage 3 DoD

- [ ] 마스크 적용 섹션 수치 오류 0 · cross-validator critical 80%↓ (적용 구간)
- [ ] 티저 발행의 재식별 게이트 경유율 100% · 후보<K 발행 0건
- [ ] TeaserView·RenderedIM(basic) 타입 테스트 통과 (정밀값 필드 부재)
- [ ] Pro: NDA 전 gated 렌더 0 · 워터마크 100% · 기존 `/im-lite` 링크 무변경 동작
- [ ] 야간 문의 자동 응대율 90%+ · 에스컬레이션 누락 0
- [ ] 매칭 사유 표시 100% · 부분 재생성 비용 70%↓ (전체 대비)
- [ ] GAP 산출물: `nlg-mask-templates.md`(섹션별 초기 세트) 등재 · 법무 카피 팩 v1 확정 반영(S3-T17) — 미완 시 대외 발행물은 베타 한정 유지

---

# 9. 테스트 전략

| 계층 | 도구 | 핵심 케이스 |
|------|------|-------------|
| 단위 | Vitest | 재무 공식 12 · 제약 C01~12 각 2 · 아키타입 R01~10 각 1 · 밴딩·마스크 렌더 스냅샷 · 전이 매트릭스(딜·grant) |
| 타입 | tsc 테스트 | TeaserView·RenderedIM(basic)에 정밀값 필드 부재 (컴파일 실패 케이스로 검증) |
| 통합 | Vitest+Supabase 로컬 | enrichment 실주소 · OCR 샘플 정확도 · RAG 인덱싱 조건 · 재식별 후보 수 |
| 가드레일 | 전용 스위트 | 금지 표현(투자보장·감정평가·대출확정) · 마스크 외 수치 · 스마트톡 금지 질의 20종 · N<5 집계 |
| E2E | Playwright | 딜 생성→충전→편집→발행 / Pitch 콜드 10분 / 티저 발행(게이트 실패→제안 적용→성공) / Pro 요청→동의→NDA→열람 / URL 회귀 |
| CI 게이트 | GitHub Actions | 온톨로지 YAML↔코드 diff 0 · provenance lint · 라우트 스냅샷 · 플래그 등록 검증 |

# 10. 마이그레이션·롤백

- **마이그레이션 순서**: 0100(S0) → 0110(S1) → 0120(S2) → 0130(S3). 각각 독립 롤백 스크립트 동반
- **데이터 이관**: building_ssot_lite→assets는 lazy(읽기 시점) — 빅뱅 이관 금지. 이관 완료율 대시보드(관리자)
- **롤백 원칙**: 기능 롤백=플래그 off (데이터는 유지). 스키마 롤백은 additive-only 원칙으로 최소화(컬럼 삭제 금지, deprecated 마킹)
- **기존 API deprecated 절차**: 신 API 배포→구 API에 Deprecation 헤더→베타 전환 확인→2주 후 내부 라우팅 전환(외부 URL 불변)

# 11. DO NOT (기계 판독 — 리뷰 반려 사유)

```yaml
forbidden:
  # 데이터·타입
  - "provenance tier 미지정 assets.attrs 쓰기"
  - "온톨로지 enum·필드의 코드단 임의 추가 (YAML 선개정 필수)"
  - "TeaserView / RenderedIM(basic) 외 경로로 정밀값·gated 슬롯 공개 응답 포함"
  - "building_ssot_lite 신규 쓰기 (어댑터 이관 후)"
  - "OCR 결과의 확인 화면 미경유 자동 저장"
  # 생성·수치
  - "LLM 산문 내 고객 대면 수치 생성 ([MASKED] 블록 외)"
  - "grade < A 자산의 DCF/NPV/민감도 노출"
  - "assumptions 범위 밖 신규 정밀 계산의 고객 노출 (슬라이더·개인화 포함)"
  - "status != published+approved 문서의 RAG 인덱싱"
  # 사다리·공개
  - "재식별 시뮬레이터 게이트 우회 발행"
  - "외관 전경·간판 포함 사진의 티저 노출"
  - "IM-Pro의 딜 단위 공유 URL 발급 (grant 단위만)"
  - "NDA 서명 전 gated 슬롯 렌더"
  - "매도인 동의 없는 Pro 발급 (delegated 모드 포함 확인)"
  - "콜드 Pitch의 가격 의견(범위 포함) 생성"
  - "'감정가'·'평가액'·'보장'·'대출 가능' 확정 표현"
  # 플랫폼
  - "기존 공개 URL(/dc,/im-lite,/vibe-card) 스킴 변경"
  - "Basic 이하 tier 응답에 정확 좌표 포함 (퍼지 오프셋은 서버 적용, 시드 고정)"   # v1.2
  - "티저·Basic의 지도 딥링크 (좌표 노출 경로)"                                  # v1.2
  - "feature flag 없는 신규 기능 배포"
  - "명시적 전이 함수 외 딜·grant 상태 뮤테이션"
  - "tacit_labels 개인 데이터의 크로스 브로커 노출 (집계 N<5 포함)"
  - "@명령 결과의 고객 자동 전송 (브로커 확인 버튼 미경유)"
  - "스마트톡 ai가 assumptions 기반 신규 계산을 고객에게 직접 전송"
  - "OWL/트리플스토어 의존성 도입"
```

# 12. 부록 — 문서 대조·용어

| 본 SDD | 근거 스펙 |
|--------|-----------|
| §2 DDL·§3 모듈 | DEV_SPEC v2.0 Part A + 코어 스펙 4종의 DDL 통합·정합화 |
| §5 Stage 0 | 고도화 전략 Stage 0 + 감사 G3·G4·G6·G7 |
| §6 Stage 1 | 기획안 v2.0 S2 + 온톨로지 v0.1 + Pitch 스펙(웜) |
| §7 Stage 2 | DEV_SPEC A3(암묵지) + G8 + Pitch 스펙(콜드) |
| §8 Stage 3 | 티저 스펙 v1.0 + IM 이원화 스펙 v1.0 + G2·G9·G10 + 스마트톡 MVP 컷 |
| 용어 | WALT로 통일(WALE는 export alias) · '검증 슬롯'=provenance tier≠ai_inferred · 'gated'=disclosure_policy.gated |
| GAP 산출물 (v1.1) | `docs/ontology/api-slot-mapping.md`(S1-T5) · YAML v0.1.1(S1-T0) · `docs/specs/nlg-mask-templates.md`(S3-T1) · `docs/legal/copy-pack.md`(S0-T11→S3-T17) · `docs/design/wireframes/`(S1-T14) |

## 12.1 필수 동봉 문서 번들 (본 SDD 단독 개발 불가 — README 참조)

| 구분 | 문서 | 역할 |
|------|------|------|
| 필수 | `credeal-ontology-v0.1.yaml` | 스키마 SSoT — 없으면 S1-T1 이하 전부 불가 |
| 필수 | 티저 딜카드 스펙 v1.0 | 밴딩 기본값·레이아웃·공개 정책 원문 (S3-T8~T12) |
| 필수 | IM 이원화 스펙 v1.0 | 렌더 정책 슬롯 목록·동의 체인 세부 (S3-T4~T7) |
| 필수 | Pitch 스펙 v1.0 | 블록 구성·가격 의견 방법·가드레일 문구 (S1-T13, S2-T10) |
| 필수 | `docs/specs/pipeline-uiux.md` | S1-T10/T11/T14의 설계 기준 (GAP-5 와이어프레임 기준 문서) — v1.2 |
| 필수 | `docs/specs/map-image-upgrade.md` §MI-1 | S3-T18의 정책 원문 — v1.2 |
| 권장 | DEV_SPEC v2.0 · 온톨로지 정의서 · Mobile-IM 기술 감사 · 매거진/맵 현행 감사 2종 | 맥락·근거·기존 모듈 지도 |
| 제외 | Full IM 스펙(Stage 4)·전략/사업 문서군 | 구현 입력 아님 — 개발 컨텍스트에서 제외 권장 |

> **구현 시작점**: S0-T1부터. 각 태스크는 독립 PR, PR 설명에 태스크 ID·플래그·DoD 항목을 명시한다. 스테이지 DoD 미충족 시 다음 스테이지 배포 금지(설계·개발은 병행 가능). — 이 문서의 목적은 속도가 아니라 **순서의 규율**이다: 믿을 수 있게 → 채우기 쉽게 → 더 잘 설득하게.
