# K-뷰티·소비재 B2B 무역 버티컬(`ODM Bridge`) 상세 설계안 — 블라인드 포뮬라 오퍼 카드 + 바이어 견적 요청(RFQ) 매칭

> **연관 문서**: [CREDEAL 시스템 타 산업 전이 응용 및 사업화 마스터 전략 (`docs/CREDEAL_시스템_전이응용_및_사업화_전략.md`)](file:///c:/Users/User/cre-dealcard/docs/CREDEAL_시스템_전이응용_및_사업화_전략.md)
> **핵심 타겟**:
> 1. 첫 타깃 시장: **미국 (US Indie Brands, Amazon US Sellers, Retail Buyers)** → 인증 체크리스트는 MoCRA(시설 등록·제품 리스팅), ISO 22716/CGMP, **선크림·여드름 제품 = OTC 의약품**(FDA 의약품 시설 등록·Drug Facts 라벨·허용 성분 목록) 우선
> 2. 첫 공급 유형: **OEM/ODM** → "오퍼"는 단순 재고가 아니라 **블라인드 제조사 역량 + 레디 처방 리스트**(`trade_offer_skus` = 처방별 수량 구간 단가)
> 3. 노출 방식: **별도 브랜드 (가칭 ODM Bridge)** → CREDEAL과 코드·DB 공통 로직만 공유하고 도메인·화면은 분리

---

## 0. 목표와 범위

| 구분 | 내용 |
| :--- | :--- |
| **주 사용자** | 화장품 OEM/ODM 제조사 해외영업팀·수출 에이전트·무역상사 출신 개인 중개인 (40~60대 비중 높음) |
| **상대방** | 해외 바이어: 미국 인디 브랜드 창업자, 이커머스 셀러(아마존·틱톡샵 등), 수입 유통사(Distributor), 리테일 체인 PB 발주처 |
| **핵심 가치** | ① 제조사·배합비를 가린 **블라인드 포뮬라 오퍼**로 기술 유출·직거래 우회 방지 → ② 바이어 **RFQ**를 받아 자동 매칭 → ③ 열람 요청 승인 시 **영문 라인시트·수입 제안서 PPTX** 제공 → ④ 반복 열람 바이어 **관심 고객(Hot Lead) 알림** |
| **MVP 범위** | 오퍼 등록(메모 + SKU 단가 엑셀) · 블라인드 공유 카드 · 다국어 RFQ 접수 · 3단계 매칭 · 3단계 열람 요청(G1~G3) · 도착가(Landed Cost) 계산 · 영문 라인시트 PPTX |

> [!IMPORTANT]
> 기존 CREDEAL 규칙과 동일하게 **가격·관세·도착가 숫자는 LLM이 만들지 않고 결정론적으로 계산**합니다. LLM은 상품 설명 문구와 번역만 담당합니다.

---

## 1. 개념 매핑 (부동산 CREDEAL → 무역 ODM Bridge)

| 부동산 (현재 CREDEAL) | 무역 (신규 ODM Bridge) | 비고 |
| :--- | :--- | :--- |
| `building_ssot_lite` 매물 | `trade_offers` 베이스 포뮬라/제조 오퍼 | 공급 측 표준 데이터(SSOT) |
| 렌트롤 v1.5 엑셀 (층·호실별) | **SKU 구간별 단가표 엑셀** → `trade_offer_skus` | 파서 구조 동일: 행 단위 정규화 + 단위 변환 + 합계 대조 |
| 지번·건물명 블라인드 | **제조사 실명·공장 주소·세부 배합비(%) 블라인드** | `hidden_fields` 재사용 |
| `buyer_intent_lite` 매수 조건 | `trade_rfqs` 바이어 역견적 요청(RFQ) | 바이어가 직접 영문/다국어 폼으로 입력 가능 |
| 예산·지역·자산유형 | 목표 단가·목표 시장(미국 등)·품목 카테고리·MOQ | |
| 투자 포스처 5종 | **바이어 유형 4종**: 인디 브랜드(PB·OEM) / 이커머스 셀러 / 리테일 체인 / 수입 유통사 | 매칭 가중치 프로필 |
| 수익률·Cap Rate 계산 | **미국 도착가(FOB→CIF→DDP Landed Cost)·리테일 마진 계산** | `roi-calculator` 자리 |
| 건축물대장·토지이용 자동조회 | **국가별 인증·규제 체크리스트** | 미국 MoCRA, FDA OTC Monograph, ISO 22716/CGMP, 비건 등 |
| 열람 요청 G1~G3 | G1 처방 상세·MOQ 단가표 / G2 전성분 브래킷·인증서(NCNDA) / G3 제조사 실명·샘플·PI | 상태 머신 동일 |
| 기본 IM PPTX | **영문 라인시트(Line Sheet)·Custom ODM 제안서 PPTX (16:9)** | 렌더러·스튜디오 재사용 |
| 고객 소식지(모바일 매거진) | **글로벌 바이어 트렌드 레터**(K-뷰티 신제형·MoCRA 규제·환율·물류) | 5대 채널 → 무역 채널로 교체 |

---

## 2. 데이터 모델 (Supabase 초기 스키마 DDL)

```sql
-- ── 1. trade_offers : 공급 측 오퍼 (building_ssot_lite 대응) ─────────────
create table if not exists trade_offers (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references profiles(id) on delete set null,
  input_type       text not null check (input_type in ('broker_memo','sku_sheet','manual_form')),
  raw_input        text not null,

  -- 공개 가능한 신호값 (G0 블라인드 카드 노출용)
  category         text not null,           -- 'skincare.sunscreen' 등 2단계 분류
  title_signal     text,                    -- "SPF50+ 무기자차 선세럼 (K-더마 CGMP 제조사)"
  origin_country   text not null default 'KR',
  moq_min          integer,                 -- 최소 주문 수량 (개)
  unit_price_band  text,                    -- "$1.80~2.40 / FOB"
  incoterms        text[] not null default '{FOB}',
  lead_time_days   integer,
  shelf_life_months integer,
  supply_type      text check (supply_type in ('oem_odm','private_label','brand_stock','closeout')),

  -- 블라인드 대상 (G2~G3 이후 공개)
  brand_name       text,
  manufacturer     text,
  factory_location text,
  hidden_fields    text[] not null default '{brand_name,manufacturer,factory_location}',

  -- 인증·규제 증빙 (국가 코드별)
  compliance       jsonb not null default '{}',
  layers           jsonb not null default '{}',
  disclosure       jsonb not null default '{}',
  status           text not null default 'draft'
    check (status in ('draft','public_signal_ready','archived')),
  promotion_score  numeric(6,4) not null default 0,
  matched_buyer_count integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 2. trade_offer_skus : SKU 및 MOQ 구간별 단가표 (렌트롤 행 대응) ───────
create table if not exists trade_offer_skus (
  id             uuid primary key default gen_random_uuid(),
  offer_id       uuid not null references trade_offers(id) on delete cascade,
  sku_code       text,
  product_name   text not null,
  volume_ml      numeric,
  hs_code        text,                       -- 관세 계산 키 (예: 3304.99)
  unit_price     numeric not null,           -- 기준 통화 단가
  currency       text not null default 'USD',
  price_basis    text not null default 'FOB',
  moq            integer,
  carton_qty     integer,
  carton_cbm     numeric,
  carton_kg      numeric,
  tier_prices    jsonb not null default '[]', -- [{"qty":3000,"price":2.15},{"qty":10000,"price":1.85}]
  sort_order     integer not null default 0
);

-- ── 3. trade_rfqs : 바이어 견적 요청 (buyer_intent_lite 대응) ──────────────
create table if not exists trade_rfqs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references profiles(id) on delete set null,
  source           text not null default 'broker_entry'
    check (source in ('broker_entry','public_form','magazine_cta','import')),
  raw_input        text not null,
  raw_language     text,
  buyer_type       text check (buyer_type in ('private_label','ecommerce_seller','retail_chain','distributor')),
  buyer_company    text,
  buyer_contact    jsonb not null default '{}',
  target_markets   text[] not null default '{US}',
  categories       text[] not null default '{}',
  target_unit_price numeric,
  target_currency  text default 'USD',
  target_incoterm  text default 'FOB',
  order_qty_min    integer,
  order_qty_max    integer,
  must_have        text[] not null default '{}',  -- ['vegan','mocra_listed','fda_otc','fragrance_free']
  nice_to_have     text[] not null default '{}',
  timeline         text,
  visibility       text not null default 'broker_only'
    check (visibility in ('private','broker_only','anonymous_matchable')),
  normalized       jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

---

## 3. 결정론적 미국 도착가(US Landed Cost) 계산기

`roi-calculator.ts` 자리를 대신하는 순수 함수로, LLM 개입 없이 100% 결정론적으로 산출합니다.

```
CIF 단가   = FOB 단가 + (해상/항공 운임 ÷ 수량) + 보험료(CIF의 약 0.3~0.5%)
관세       = CIF 단가 × 미국 HTS 코드별 관세율 (한·미 FTA 원산지 적용 여부 반영)
DDP 단가   = CIF 단가 + 관세 + 통관 수수료(MPF/HMF) + 미국 내륙 운송비
바이어 마진 = (목표 미국 리테일가 − DDP 단가) ÷ 목표 미국 리테일가
```

---

## 4. 품질 게이트 및 허위 인증 차단 안전장치 (Preflight Gate)

| 리스크 | 안전장치 |
| :--- | :--- |
| **허위 FDA 인증 표기** (일반 화장품에 "FDA 승인" 표기 — 미국 화장품은 승인제가 아니라 MoCRA 시설 등록·제품 리스팅 제도임) | 품질 게이트 금지어(Poison Token): `FDA 승인`, `FDA approved`, `FDA certified`, `의약품 치료 효능` 등 즉시 차단. 인증 표시는 **증빙 파일이 연결된 항목만 ✓** |
| **직거래 우회 및 처방 도용** | G2부터 비우회·비공개 동의(NNN/NCNDA) 전자 서명 + 동적 워터마크(`바이어 회사명 | 이메일 | 타임스탬프`) 삽입 + 열람 로그 기록 |
| **숫자 환각 방지** | MOQ 구간별 단가·관세·도착가는 순수 함수로만 계산하며, LLM 프롬프트에 바이너리 주입 금지 (Rule 11 준수) |
