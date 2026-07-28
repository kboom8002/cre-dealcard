# CREDEAL 개발 참조 스펙 (Repo Spec) v2.0

> **문서 성격**: LLM 코딩 에이전트(Claude Code 등)와 개발자가 구현 시 직접 참조하는 단일 스펙 문서(SSoT).
> **버전**: v2.0 (2026-07-23) — 「플랫폼 재구성·서비스 기획안 v2.0 통합 고도화판」의 구현 확장본.
> **구성**: Part 0(사용법·규약) / Part A(플랫폼·서비스 구현 스펙) / Part B(모바일 IM 고도화 — 기술 감사 기반 정밀 분석, 통합·정합판) / Part C(수용 기준·금지 규칙).
> **동반 파일**: `credeal-ontology-v0.1.yaml` — 온톨로지는 이 파일이 SSoT이며 본 문서는 중복 정의하지 않고 참조만 한다.

---

# Part 0. 문서 사용법·공통 규약

## 0.1 LLM 개발 지침 (반드시 준수)

1. **온톨로지 참조 원칙**: 자산 필드·enum·제약·규칙은 `credeal-ontology-v0.1.yaml`의 정의를 그대로 사용한다. 필드 ID·enum 코드를 임의로 변경·추가하지 않는다. 추가가 필요하면 YAML을 먼저 개정(버전 업)한 뒤 코드에 반영한다.
2. **기존 모듈 존중**: `src/domain/building/mobile-im/` 하위 29개 모듈은 검증된 자산이다. 삭제·재작성 대신 **주입 지점에 새 모듈을 끼워 넣는 방식**으로 개선한다 (각 섹션에 통합 지점 명시).
3. **수치 생성 금지 원칙**: 고객 대면 문서·응답에서 재무 수치는 LLM이 생성하지 않는다. `financials.ts` 산출값을 `nlg-mask-engine`으로 렌더링만 한다.
4. **URL 불변 원칙**: `/dc/{id}`, `/im-lite/{id}`, `/vibe-card/{slug}` 등 이미 배포된 공개 URL 스킴은 절대 변경하지 않는다. 신규 기능은 새 경로로 추가한다.
5. **Provenance 의무**: Asset의 모든 필드 쓰기 작업은 `source_tier`(public_data | expert_verified | broker_input | ai_inferred)를 함께 기록한다. tier 미지정 쓰기는 lint 에러로 취급한다.
6. **Feature Flag**: 본 스펙의 모든 신규 기능은 플래그 하에 배포한다. 플래그 네이밍: `ff_{milestone}_{feature}` (예: `ff_m4_nlg_mask`).

## 0.2 네이밍·이벤트 규약

- 신규 모듈 파일: kebab-case, 도메인 디렉터리 하위 (예: `src/domain/deal/archetype-classifier.ts`)
- 신규 DB 테이블: snake_case 복수형 (`deals`, `tacit_labels`)
- 신규 activity_events 타입 (기존 58종에 추가):
  `deal_lost_tagged`, `match_rejected_tagged`, `hotlead_ignored_tagged`, `rule_toggled`, `im_edit_diff_captured`, `price_adjustment_recorded`, `outcome_price_recorded`, `pitch_generated`, `pitch_sent`, `constraint_violation_shown`, `constraint_violation_resolved`, `archetype_assigned`, `partial_regen_executed`, `smarttalk_escalated`, `smarttalk_booking_created`, `network_optin_toggled`, `cross_match_proposed`, `cross_match_gate_approved`
- 커밋 컨벤션: `feat(m3): ...`, `fix(im): ...` — 마일스톤 태그 포함

## 0.3 아키텍처 4레이어 (전체 지도)

```
L4 표면    : 5탭 IA (홈·딜·고객·인박스·더보기) + 공개 뷰어군
L3 서비스  : S1 메모·CRM / S2 딜 워크스페이스 / S3 유통·추적·스마트톡 /
             S4 매칭 / S5 공동중개 네트워크 / S6 전문가 딜룸
L2 암묵지  : 행동 라벨·1탭 태깅·결과 회귀·편집 diff·규칙 토글 → 집합 지식 환류
L1 데이터  : Deal 객체 모델 + 온톨로지 v0.1 (~70슬롯·enum 14계열·제약 C01~12·규칙 R01~10)
             + 충전 파이프라인 5경로 + 4-tier Provenance
```

---

# Part A. 플랫폼·서비스 구현 스펙

## A1. 데이터 레이어 (L1)

### A1.1 신규 테이블 DDL (Postgres/Supabase — 스케치)

```sql
-- 딜: 모든 것의 허브. 기존 building_ssot_lite는 assets로 이관·매핑
CREATE TABLE deals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id      uuid NOT NULL REFERENCES auth.users(id),
  asset_id       uuid NOT NULL REFERENCES assets(id),
  pipeline_stage text NOT NULL DEFAULT 'sourcing',
    -- 'sourcing'|'analysis'|'pitch'|'marketing'|'negotiation'|'contract'|'closed'|'lost'
  mandate_type   text,              -- 'exclusive'|'open'
  archetypes     text[] DEFAULT '{}',  -- enum:dealArchetype (R01~R10 산출, 복수 가능)
  lost_reason    text,              -- 'price'|'loan'|'eviction'|'change_of_mind'|'permit'|'other'
  lost_reason_note text,
  asking_price_krw   bigint,        -- 만원
  outcome_price_krw  bigint,        -- 만원, closed 시 기록 (결과 회귀용)
  created_at     timestamptz DEFAULT now(),
  closed_at      timestamptz
);

-- 자산: 온톨로지 v0.1 슬롯. 핫패스 필드는 컬럼, 나머지는 attrs JSONB
CREATE TABLE assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type     text NOT NULL,     -- 'smallBuilding'|'logisticsCenter'|'landSite'
  pnu            text,              -- 공공 API 조인 키
  region_code    text,              -- enum:region (location_hierarchy 파생)
  zoning_region  text,              -- enum:zoningRegion — C10: 필지당 1개
  attrs          jsonb NOT NULL DEFAULT '{}',   -- 온톨로지 슬롯 (id → value)
  provenance     jsonb NOT NULL DEFAULT '{}',   -- 슬롯 id → {tier, verified_at, source_ref}
  data_grade     char(1),           -- 'A'|'B'|'C'|'D' — grade-engine 산출
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ux_assets_pnu_zoning ON assets(pnu) WHERE zoning_region IS NOT NULL; -- C10 보조

-- 렌트롤 (LeaseUnit — 온톨로지 참조)
CREATE TABLE lease_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  floor text NOT NULL, tenant_sector text, area_pyung numeric,
  deposit_krw bigint, monthly_rent_krw bigint, mgmt_fee_krw bigint,
  lease_start date, lease_end date, opposing_power boolean,
  source_tier text NOT NULL DEFAULT 'broker_input'
);

-- 딜 관계자: 역할 예약이 루프3 확장의 핵심
CREATE TABLE deal_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  role text NOT NULL,  -- 'seller'|'buyer_candidate'|'co_broker'|'professional'
  profession text,     -- role='professional': 'tax'|'architect'|'legal'
  user_id uuid, client_id uuid,
  permissions jsonb DEFAULT '{}'   -- 섹션 단위 열람·기고 권한 (S6)
);

-- 암묵지 라벨 (L2 — 모든 1탭 태깅·행동 라벨의 단일 저장소)
CREATE TABLE tacit_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL,
  deal_id uuid, asset_id uuid, match_id uuid,
  label_kind text NOT NULL,
    -- 'deal_lost'|'match_rejected'|'hotlead_ignored'|'rule_toggle'|'golden_adopt'|'golden_reject'|'gam_note'
  label_value text NOT NULL,       -- enum 값 또는 자유 짧은 텍스트
  context jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 조례 상한 (온톨로지 zoning enum의 시행령 상한을 override)
CREATE TABLE zoning_ordinance (
  sigungu_code text NOT NULL, zoning_region text NOT NULL,
  bcr_max numeric, far_max numeric, effective_date date,
  PRIMARY KEY (sigungu_code, zoning_region)
);

-- 행정구역·권역 계층 (isLocatedIn 전이성의 관계형 구현)
CREATE TABLE location_hierarchy (
  code text PRIMARY KEY,           -- 법정동코드
  name text NOT NULL, level text NOT NULL,  -- 'dong'|'gu'|'si'
  parent_code text REFERENCES location_hierarchy(code),
  region_code text                 -- enum:region 매핑 (GBD, SEONGSU, ...)
);

-- 편집 diff (G8 — 골든셋 후보·Judge 캘리브레이션 공용)
CREATE TABLE im_edit_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL, section_type text NOT NULL, broker_id uuid NOT NULL,
  ai_text text NOT NULL, final_text text NOT NULL,
  edit_distance int NOT NULL,      -- 정규화 Levenshtein
  judge_score numeric,             -- 해당 섹션 Judge 점수 (있으면)
  consented boolean NOT NULL DEFAULT false,  -- 골든셋 활용 동의
  created_at timestamptz DEFAULT now()
);
```

기존 유지 테이블: `im_golden_sets`, `im_documents`(인덱스 — A2.3 위생 규칙 적용), `gate_requests`, `magazine_subscribers`, `bookings`, `chat_rooms`/`chat_messages`(S3에서 확장).

### A1.2 신규 모듈: 온톨로지 코어

```
src/domain/asset/
├── asset-ontology.ts        # YAML 로더 + Zod 스키마 생성 + enum 상수 export
├── constraint-validator.ts  # C01~C12 (G4)
├── archetype-classifier.ts  # R01~R10 (G5)
├── grade-engine.ts          # 자산군별 필드 커버리지 → A~D (G6, readiness.ts 대체)
├── provenance.ts            # 4-tier 기록·조회 (기존 data-provenance.ts 확장 이전)
└── enrichment/              # 충전 파이프라인 5경로
    ├── public-api-enricher.ts   # PNU 조인: 대장·토지이음·vworld·공시지가 (~30슬롯)
    ├── derived-enricher.ts      # farHeadroomPp·subwayWalkMin·icDistanceKm·평당가 (~10)
    ├── ocr-enricher.ts          # 임대차계약서→lease_units, 등기부→seniorLoanKrw (~12)
    ├── memo-slot-mapper.ts      # 기존 MemoParser 출력 → 온톨로지 슬롯 (~8)
    └── massing-pdf-parser.ts    # 외부 규모검토 PDF → buildableFloorArea 등
```

핵심 인터페이스:

```typescript
// constraint-validator.ts
export type Violation = {
  id: string;                    // 'C01'...'C12'
  severity: 'error'|'warning'|'info'|'policy';
  message: string; fieldIds: string[];
};
export function validateAsset(asset: AssetRecord): Violation[];
// error → 발행 차단 / warning·info → UI 경고 + activity_events 기록 / policy → 시스템 동작 게이트

// archetype-classifier.ts
export function classifyArchetypes(asset: AssetRecord, market: MarketContext): {
  archetypes: DealArchetype[];
  evidences: Record<DealArchetype, string[]>;  // 매칭 사유·thesis 뼈대 겸용 (S4와 공유)
};

// grade-engine.ts
export function computeGrade(asset: AssetRecord): {
  grade: 'A'|'B'|'C'|'D';
  coverage: number;
  missingForNextGrade: FieldId[];   // 데이터 탭 "다음 등급까지" UI에 사용
};
```

### A1.3 충전 파이프라인 실행 규칙

- 트리거: 주소/PNU 확정 시 `public-api-enricher` + `derived-enricher` 자동 실행 (비동기 Job, non-blocking)
- 우선순위 충돌: 동일 슬롯에 복수 소스 → tier 우선(public > expert > broker > ai). 단 broker가 public을 **명시적으로 override**하면 `provenance.override=true` 기록 + UI에 "공부와 다름" 뱃지
- OCR 결과는 확인 화면(1탭 수정) 경유 후에만 저장 — 무확인 자동 저장 금지
- 실패는 전부 non-blocking: 실패 슬롯은 미충전으로 남기고 `enrichment_failures` 로그

## A2. 서비스 레이어 구현 스펙 (S1~S6)

### S1. 메모·고객 CRM

- `memo-slot-mapper.ts`: MemoParser 분류 결과에서 온톨로지 슬롯 후보 추출 → 확인 칩 UI("매각가 85억으로 채울까요?") → 승인 시 assets.attrs 병합(tier=broker_input)
- '감' 필드: `assets.attrs.gam_notes: string[]` — 구조화 실패 감성 표현 보존. `tacit_labels(label_kind='gam_note')` 동시 기록
- 고객 타임라인: `activity_events`를 `client_id`로 집계하는 뷰 `v_client_timeline` + 통화 메모 수동 추가 API
- API: `GET /api/broker/clients/{id}/timeline`, `POST /api/broker/clients/{id}/notes`

### S2. 딜 워크스페이스

- 라우트: `/broker/deal/{dealId}` — 5탭 (개요·데이터·문서·관계자·활동)
- **데이터 탭**: 온톨로지 슬롯 편집기 — 충전 현황(자동 채움 뱃지·접힘), `missingForNextGrade` 강조, Violation 인라인 표시
- **문서 탭**: 문서 4종 생성 버튼. 전부 동일 Asset 스냅샷에서 파생, `documents.version` 관리
- **발행 단일 플로우**: `POST /api/broker/deal/{id}/publish` — ①투자요약+OG 통합 저장 ②OG 자동 동기화(제목 수정 시 기본값 전파) ③공유 URL에 `?v={version}` 캐시 버스팅 ④발행 전 Violation(error) 체크
- **수임 제안서(Pitch)**: `pitch-generator.ts` — Asset + 비교 실거래 + archetype evidences + 마케팅 계획(딜카드·IM 샘플 + 열람 추적 데모 스크린샷) + 집합 지식 인용(권역 평균 사이클·무산 사유 분포 — `v_collective_insights` 뷰). 산출: 모바일 페이지 + PDF
- 결과 회귀: `pipeline_stage → 'closed'` 전이 시 `outcome_price_krw` 입력 모달(1필드) → `outcome_price_recorded` 이벤트
- 무산 태깅: `→ 'lost'` 전이 시 사유 5택1 모달 → `tacit_labels(deal_lost)` + `deal_lost_tagged`

### S3. 유통·추적·인박스·스마트톡-lite

- 인박스 통합: `/broker/inbox` — 3필터(요청/열람·반응/채팅), 기존 소통관리함 + chat 알림 병합
- **chat_rooms 확장** (기존 스키마 유지 + 컬럼 추가):

```sql
ALTER TABLE chat_rooms ADD COLUMN deal_id uuid REFERENCES deals(id);
-- sender_type CHECK 확장: 'broker'|'guest'|'ai'|'co_broker'|'professional'  (지금 예약, S5·S6에서 활성화)
ALTER TABLE chat_rooms ADD COLUMN ai_policy text DEFAULT 'cite_only';
  -- 'off'|'cite_only'|'cite_and_book'  ('cite_only': 검증 슬롯 인용+출처만)
```

- **자동응답 정책 (하드 룰)**:
  1. 답변 소스는 해당 딜 Asset의 검증 슬롯(provenance tier ≠ ai_inferred 우선) + NLG 마스크 렌더링만
  2. 신규 재무 계산 금지 — "대출 40%면 수익률?" 류는 즉시 에스컬레이션 템플릿("중개인이 확인 후 답변드립니다") + 예약 CTA
  3. 부재 모드: 정보 안내 + `booking` 접수 + 익일 아침 요약(기존 요약 파이프라인 재사용)
  4. 모든 자동응답 메시지에 출처 배지 문자열 포함 (예: "✓ 건축물대장 기준")
- @명령(브로커 전용): `@계산`·`@비교`·`@추천` 결과는 **브로커에게만 표시 → [고객에게 전송] 버튼 경유** (직접 전송 금지)
- CTA 위계: IM 뷰어 하단 — ①채팅 ②프라이빗 IM 신청 ③Gate 요청 순서 고정

### S4. 매칭 (설명 가능)

- `match-engine.ts` 개선: 기존 S/A/B/C 스코어에 `archetype-classifier.evidences`를 병합해 `match_reasons: string[]` 반환 — UI 사유 표시 의무화
- R09(HIGH_RISK_EVICTION)는 감점 + 결과 카드에 경고 뱃지
- 규칙 토글: `broker_rule_prefs(broker_id, rule_id, enabled, threshold_overrides jsonb)` — 변경 시 `tacit_labels(rule_toggle)` 기록
- 매칭 거절: 결과 카드 [거절] → 4택1(가격/입지/명도/시기) → `tacit_labels(match_rejected)`

### S5. 공동중개 네트워크 (M5 — 파일럿 우선)

- 옵트인: `deals.network_visible boolean DEFAULT false` + 공개 범위 프리셋(블라인드 요약 = 온톨로지 표준 슬롯 중 비민감 서브셋: region, assetType, priceBand, capRate 밴드, archetypes)
- 크로스 매칭: 옵트인 딜 ↔ 타 브로커 buyer_intents를 동일 `match-engine`으로 — 상대에게는 익명 요약만
- Gate 단계 공개: 기존 gate_requests 재사용, `stage: 'region'→'detail'→'address'` 3단계
- 수수료 배분 합의: 템플릿 문서 생성만 (플랫폼은 배분에 **비개입** — 법률 구조 확정 전 수익화 금지)
- 평판 v1: `broker_reputation(broker_id, closed_cross_deals int, avg_response_hours numeric, ratings jsonb)`
- **M5 이전에는 UI 없이 운영자 수동 중개로 파일럿** — 이벤트만 기록해 관행 학습

### S6. 전문가 딜룸 (분기 3~4 — 스키마만 선반영)

- `deal_parties.role='professional'` 활성화 + 섹션 단위 권한: `permissions: {sections: ['risk_check'], can_contribute: true}`
- 기고 모듈: `expert_contributions(id, deal_id, party_id, section_type, content_md, credential_display, signed_at)` → IM 렌더링 시 해당 섹션에 실명·자격 뱃지 삽입, 관련 슬롯 provenance는 `expert_verified`로 승격

## A3. 암묵지 레이어 (L2) 구현

- 수집: 전부 `tacit_labels` 단일 테이블 + activity_events 이중 기록 (분석 파이프라인 단순화)
- 1탭 태깅 UI 규칙: 모달 1개·선택지 ≤5·스킵 가능·동일 딜 재요청 금지. 스킵된 태깅은 홈 액션 큐에 1회만 재노출
- 환류: 야간 배치 → `v_collective_insights(region_code, asset_type, avg_cycle_days, lost_reason_dist jsonb, top_selling_points jsonb)` (익명·집계 최소 N=5 미만 구간은 미노출) → 홈 브리핑 카드·pitch-generator 소비
- 개인정보·격리: tacit_labels는 broker_id 단위 RLS. 집계 뷰만 크로스 접근 허용

## A4. 마일스톤 ↔ 모듈 매핑 (구현 순서)

| 스프린트 | 신규/변경 모듈 | 플래그 |
|----------|----------------|--------|
| **M1** | asset-ontology, constraint-validator, grade-engine(치환: readiness), financials 가정 외부화(`assumptions` 테이블), publish 단일 플로우, RAG 인덱싱 위생(Part B G3), Vibe 온보딩 선택화 | ff_m1_* |
| **M2** | deals/assets 마이그레이션, 딜 워크스페이스 5탭, public-api/derived-enricher, pitch-generator, archetype-classifier, TO-BE 홈 | ff_m2_* |
| **M3** | ocr-enricher, memo-slot-mapper, 고객 타임라인, massing-pdf-parser, tacit_labels+1탭 태깅, im_edit_diffs 수집 | ff_m3_* |
| **M4** | 인박스 통합, chat_rooms 확장+자동응답 정책, nlg-mask-engine(Part B G2 — 히어로·income_analysis부터), B2B/B2C 렌더 프로파일, match_reasons, 부분 재생성 | ff_m4_* |
| **M5** | network_visible+크로스 매칭+평판 v1(파일럿 후), v_collective_insights 환류, 유료 플랜 | ff_m5_* |

---

# Part B. 모바일 IM 고도화 — 기술 감사 기반 정밀 분석 (통합·정합판)

> 원문: 「모바일 IM 고도화 개선 방안 — 기술 감사 기반 정밀 분석 v1.0」. 본 판은 Part A의 모듈 명칭·테이블·마일스톤과 정합하도록 갱신됨. 대상 시스템: `src/domain/building/mobile-im/` 29개 모듈(~260KB).

## B0. 총평

현 시스템은 **"텍스트를 잘 다루는" 세계 수준의 파이프라인**이다. 다음 단계는 텍스트 아래에 **"개념을 아는" 온톨로지 레이어(Part A1)**를 까는 것 — 환각 방어가 '탐지'에서 '원천 차단'으로, 품질이 '확률'에서 '구조'로 바뀐다.

### 세계 수준으로 평가 — 유지·존중할 것

| 요소 | 근거 |
|------|------|
| 재무의 프로그래밍 방식 사전계산 (`financials.ts`) | NOI·Cap·IRR(Newton-Raphson)·DCF·WALE를 코드로 계산 후 주입 — 숫자를 LLM 밖으로 빼낸 올바른 설계 |
| SectionContext 앵커링 + 교차 검증 (`writer.ts`, `cross-validator.ts`) | 사전(수치 앵커 전파)+사후(578줄 검증) 양면 방어 |
| 4중 가드레일 + LLM-as-Judge (`guardrails.ts`, `cre-quality-gate.ts`, `im-judge.ts`) | Hallucination→Regex→LLM Semantic→Disclosure + 5차원 가중 평가 + 확률적 샘플링 |
| Golden IM 자기진화 루프 (`golden-im-manager.ts`, `fewshot-tracker.ts`, `golden-ingestion/`) | 생성→Judge≥4.5→승인→등록→재사용→효과 분석·도태 |
| Fail-safe 일관성 | 모든 AI 호출에 fallback (Premium Template·fail-open·non-blocking) |
| Forward-only 상태 머신 (`im-generation-state-machine.ts`) | 맥락 전파의 전제를 구조로 보장 |

### 구조적 공백 — 공통 뿌리

정규화(`terminology-normalizer.ts`)·검증(`cross-validator.ts`)·검색(`cre-rag-service.ts`)·출처(`data-provenance.ts` 8개 포인트)가 모두 **문자열 레벨**에서 작동한다. 시스템은 "450평=1,487.6㎡"는 알지만 "중로각지 접면·3종일반주거·명도 미완료 자산"이라는 개념 구조는 모른다. 이 공백이 아래 G1~G10의 공통 원인이다.

## B1. 레이어별 정밀 진단

| 레이어 | 현재 | 한계 → 대응 Gap |
|--------|------|-----------------|
| Readiness (`readiness.ts`) | 범용 7포인트 40점 컷 | 자산군별 핵심 필드(렌트롤·명도·도로접면·물류스펙) 미반영 — "생성 가능"과 "설득 가능"의 괴리 → **G6** |
| 입력 정규화 (`normalizeSsotLite`) | flat↔중첩 변환 | 입력 모순(용적률>상한, 보증금+대출>매각가) 무검증 통과 → **G4** |
| 용어 정규화 | 3-tier(함수형+DB+하드코딩) | 단방향·단일 레지스터 — B2C 역방향 어휘 부재 → **G10** |
| Hybrid RAG | Vector+Tag(2축)+BM25 | ①패싯 부족(가격대·명도·도로접면 필터 불가) ②**전 생성물 인덱싱 → 자기 오염 순환** → **G1·G3** |
| Golden Few-shot | 자산유형·가격대 2축 검색 | 딜 유형(아키타입) 축 부재 → **G5 연계** |
| Judge/A-B | 5차원 + 무작위 A/B | 동일 LLM 계열 자기 선호 편향, 인간 그라운드 트루스 부재 → **G8** |
| cross-validator | 6지표 정규식 추출·비교 | 사후 고고학 — 표현 변형 취약·유지비 578줄 → **G2**로 원천 차단 후 2차 안전망화 |
| 재무 엔진 | 유형별 OPEX율·리모델링 30만원/㎡·WACC 하드코딩 | 가정값 무배지·무범위, DCF 등급 무관 노출 → **G7·G6** |
| 상태 머신 | Forward-only 전체 재생성 | 필드 1개 수정에도 7섹션 전체 재생성(30~60초) → **G9** |

## B2. Gap 10선 및 구현 스펙

### G1. 문자열 정규화 → 개념 정규화 `P1` `M1~M2`
- Part A1의 `asset-ontology.ts`가 해답. mobile-im 모듈은 `AssetRecord`(온톨로지 타입)를 입력으로 받도록 `writer.ts` 진입부 어댑터 교체
- RAG 확장: `im_documents`에 패싯 컬럼 추가 — `asset_type, region_code, price_band, archetypes text[], eviction_status` → `match_im_documents` RPC에 패싯 필터 파라미터 추가

### G2. 수치 '탐지' → '주입' — NLG 마스크 엔진 `P2` `M4`
```
src/domain/building/mobile-im/nlg-mask-engine.ts
```
```typescript
export type MaskTemplate = {
  id: string; slotIds: FieldId[];       // 사용 슬롯 (provenance 배지 자동 부착)
  register: 'b2b'|'b2c';
  render: (asset: AssetRecord, fin: Financials) => string;  // 수치·단위·반올림 정책 내장
};
export function renderMaskedSentences(sectionType: SectionType, asset, fin, register): MaskedBlock[];
```
- 적용 순서: 히어로 카드 → `income_analysis` → `lease_status` → 나머지 (섹션별 플래그)
- 프롬프트 계약 변경(`narrative-prompt.ts`): "다음 [MASKED] 블록은 그대로 배치하고, 블록 밖에서는 어떤 수치도 쓰지 말 것" — 위반은 기존 Hallucination Guard가 탐지(숫자 패턴 존재 자체를 이상으로)
- 효과: 마스크 구간 수치 환각 구조적 불가 / `cross-validator`는 미적용 구간+LLM 내러티브의 **2차 안전망으로 존치** / 문장 단위 출처 배지 자동화
- 마스크 템플릿도 골든셋과 동일하게 브로커 편집으로 진화 (im_edit_diffs 활용)

### G3. RAG 자기 오염 방지 `P0` `M1`
- `im-embedding-indexer.ts` upsert 조건: `status='published' AND broker_approved=true`만
- 인덱스 메타 `provenance: 'golden'|'approved'` → RPC 랭킹 가중 golden>approved
- 동일 buildingId 자기 제외, near-duplicate(cos>0.97) 억제
- 기존 인덱스 1회 정리 마이그레이션 포함

### G4. 입력 정합성 검증 `P0` `M1`
- `constraint-validator.ts`(Part A1.2)를 상태 머신 `data_collection → property_overview` 전이 게이트로 삽입
- error(C01·C05·C06·C10)만 생성 차단, warning은 UI 경고+진행 허용, 전부 `constraint_violation_shown` 이벤트

### G5. 아키타입 규칙 엔진 `P2` `M2`
- `archetype-classifier.ts`(Part A1.2) 산출을 ①`investment_thesis` 프롬프트에 "규칙 충족 근거" 블록으로 주입 ②Golden Few-shot 검색 3축째(자산유형·가격대·아키타입) ③S4 match_reasons와 공유

### G6. Readiness·등급 온톨로지 재정의 `P0~P1` `M1`
- `grade-engine.ts`가 `readiness.ts`·`data-quality-badge.ts` 치환 (기존 파일은 deprecated 주석 후 위임 호출)
- DCF·민감도(`dcf-sensitivity.ts`) 노출은 `grade==='A'` 게이트 (C11)

### G7. 하드코딩 가정의 정직화 `P0` `M1`
```sql
CREATE TABLE assumptions (
  key text PRIMARY KEY,        -- 'opex_ratio.office', 'remodel_cost_per_m2', 'wacc.base'...
  value_low numeric, value_base numeric, value_high numeric,
  unit text, as_of date, source_note text
);
```
- `financials.ts`·`value-add-engine.ts` 상수 참조를 assumptions 조회로 교체. 산출 표시는 범위 + `ai_inferred` 배지 + "202X년 기준 가정" 문구(C12). 실측 입력 시(OPEX 실적·견적 업로드) 가정 대체·provenance 승격

### G8. Judge 캘리브레이션 — 편집거리 그라운드 트루스 `P1` `M3`
- `save-sections` API에서 diff 저장(`im_edit_diffs`) — 정규화 편집거리 계산
- 주간 배치: judge_score vs edit_distance 상관 리포트 → 루브릭 프롬프트 보정 근거
- `consented=true`인 저편집·고품질 diff는 골든셋 후보 자동 등록 (기존 golden-lifecycle 재사용)

### G9. 의존성 기반 부분 재생성 `P3` `M4`
```typescript
// field→section 의존성 맵 (온톨로지 필드 ID 기준)
export const FIELD_SECTION_DEPS: Record<FieldId, SectionType[]> = {
  askingPriceKrw: ['income_analysis','investment_thesis'],
  rentRoll:       ['lease_status','income_analysis'],
  evictionStatus: ['risk_check','investment_thesis'],
  farHeadroomPp:  ['property_overview','investment_thesis'],
  // ...
};
export async function regenerateSections(docId, changedFields: FieldId[]): Promise<RegenResult>;
```
- 영향 섹션만 재생성, numericalAnchors는 재계산값으로 갱신 후 전파. Forward-only 원칙은 재생성 서브플로우 내부에서 유지. `partial_regen_executed` 이벤트

### G10. B2B/B2C 이중 렌더링 `P3` `M4`
- `term_normalization_rules` 테이블에 `register` 컬럼 추가, `nlg-mask-engine`의 register 프로파일과 연동
- 발행 시 독자 유형 선택 또는 두 링크 동시 생성: `/im-lite/{id}?r=b2b|b2c` (기본 b2c)

## B3. TO-BE 파이프라인 (통합 의사코드)

```typescript
// writer.ts TO-BE (변경점만)
const asset = await loadAssetRecord(buildingId);            // G1: 온톨로지 타입
const violations = validateAsset(asset);                    // G4
if (violations.some(v => v.severity === 'error')) return blockWithGuidance(violations);

const grade = computeGrade(asset);                          // G6
const fin = calculateFinancials(asset, await loadAssumptions()); // G7
const { archetypes, evidences } = classifyArchetypes(asset, market); // G5
const ragCtx = await searchSimilarIMs({ facets: { assetType, priceBand, archetypes }, provenance: ['golden','approved'] }); // G1·G3

for (const section of SECTIONS) {
  const masked = renderMaskedSentences(section, asset, fin, register);  // G2·G10
  const prompt = buildNarrativeUserPrompt(section, asset, masked, evidences, sectionCtx, ragCtx, fewShot(archetypes));
  const text = await callLLM(...);            // 수치 없는 내러티브 전담
  await runGuardrails(text);                  // 기존 4중 + 법정 문구 체크
  // Judge 확률 샘플링 (기존) — edit_distance 캘리브레이션은 M3부터 (G8)
}
runCrossValidation(sections);                 // 2차 안전망 (G2 이후 부담 급감)
if (grade === 'A') attachDCF(fin);            // C11
await indexIM({ onlyIfApproved: true });      // G3
```

## B4. 지표·검증

| 지표 | 목표 | 측정 |
|------|------|------|
| cross-validator critical 검출 | 마스크 적용 섹션에서 80%↓ | G2 전후 비교 |
| 입력 모순 통과 | 0건 | C01~C12 게이트 로그 |
| AI 초안 대비 편집거리 | 하향 추세 | im_edit_diffs — 품질의 최종 프록시 |
| DCF 노출 중 A등급 비율 | 100% | C11 게이트 |
| 자산군별 A등급 IM 비율 | 50%+ | grade-engine |
| 부분 재생성 비용·시간 | 70%↓ | G9 전후 |

---

# Part C. 수용 기준·금지 규칙 (기계 판독용)

## C-1. Definition of Done (마일스톤 공통)

- [ ] 신규 필드 쓰기에 provenance tier 누락 0건 (lint rule)
- [ ] 신규 기능 feature flag 하 배포 + 롤백 경로 문서화
- [ ] 공개 URL 스킴 변경 없음 (라우트 스냅샷 테스트)
- [ ] 온톨로지 YAML과 코드 enum 불일치 0건 (CI 검증 스크립트: yaml→Zod 생성 diff)
- [ ] 신규 activity_events 타입은 0.2 규약 목록에 등재

## C-2. DO NOT (위반 시 리뷰 반려)

```yaml
forbidden:
  - "LLM 프롬프트로 고객 대면 재무 수치 생성 (마스크 블록 외 숫자 서술 포함)"
  - "grade < A 자산에 DCF/NPV/민감도 노출"
  - "status != published 문서의 RAG 인덱싱"
  - "provenance tier 미지정 assets.attrs 쓰기"
  - "chat AI가 assumptions 기반 신규 계산 결과를 고객에게 직접 전송"
  - "@명령 결과의 고객 자동 전송 (브로커 확인 버튼 미경유)"
  - "기존 공개 URL(/dc, /im-lite, /vibe-card) 스킴 변경"
  - "온톨로지 enum 코드의 코드단 임의 추가 (YAML 선개정 필수)"
  - "tacit_labels 개인 단위 데이터의 크로스 브로커 노출 (집계 N<5 포함)"
  - "P2P 수수료 배분 로직 구현 (법률 구조 확정 전 — 합의 템플릿 생성까지만)"
  - "OWL/트리플스토어 의존성 도입"
  - "OCR 결과의 무확인 자동 저장"
```

## C-3. 용어 대조 (문서 간 정합)

| 본 스펙 | 전략·기획 문서 | 감사 문서 |
|---------|----------------|-----------|
| grade-engine | 품질 등급 재정의 (G6) | readiness.ts·data-quality-badge.ts 치환 |
| nlg-mask-engine | NLG 마스크 (G2·G10) | 수치 주입·이중 렌더링 |
| archetype-classifier | 아키타입 규칙 (G5, R01~10) | SWRL형 규칙 엔진 |
| constraint-validator | 정합성 검증 (G4, C01~12) | SHACL식 제약 |
| tacit_labels | 암묵지 수집 레이어 (L2) | — (v2.0 신설) |
| pitch-generator | 수임 제안서 | — |
| WALT (온톨로지 표준) | WALT | WALE — **코드·문서 전부 WALT로 통일** (기존 wale-calculator.ts는 export alias 유지) |

---

> **최종 요지**: 이 스펙의 모든 결정은 세 문장으로 환원된다 — **아래에는 개념을**(온톨로지가 파이프라인의 공용어), **위에는 딜을**(24개 화면을 딜 단위로 재조립), **사이에는 암묵지를**(모든 상호작용을 라벨된 지식으로). 구현 순서는 M1(신뢰·기반)부터 — 신뢰 없이는 채택이, 채택 없이는 데이터가, 데이터 없이는 해자가 없다.
