# CREDEAL 개발팀 자료 요청 답변서 — Tier 1

> 작성일: 2026-08-23
> 근거: 코드베이스 정밀 감사 (`src/domain/building/mobile-im/` 및 관련 파일)

---

## T1-1 · `financials.ts` 전체 소스 + 호출 그래프

### 답변

① **`0.85`의 산출 근거는 무엇입니까? 상수입니까 설정값입니까**

**하드코딩된 상수**입니다. `im-section-generator.ts` 186라인에서 매매가 미입력 시 유효총수익(Effective Gross)에 일괄적으로 `0.85`를 곱해 NOI를 추정합니다:

```typescript
// im-section-generator.ts:186
estimatedNoi = effectiveGross * 0.85;
```

산출 근거(학술 문헌·실측치 등)를 명시한 주석이나 문서는 **없습니다**. 따라서 임의 상수로 확정됩니다.

---

② **문서에 없는 다른 하드코딩 계수가 있습니까**

**있습니다.** 전수 조사 결과:

| 변수 | 값 | 파일 · 라인 |
|---|---|---|
| 공실률 기본값 | `5%` | `financials.ts:148-150` |
| 연 임대료 상승률 | `2%` | `financials.ts:150` |
| 보유 기간 | `5년` (기본) | `financials.ts:148` |
| **Opex Ratio — 오피스** | `15%` | `financials.ts:124` |
| **Opex Ratio — 상가/근린** | `20%` | `financials.ts:126` |
| **Opex Ratio — 지식산업** | `22%` | `financials.ts:128` |
| **Opex Ratio — 물류** | `12%` | `financials.ts:130` |
| **Opex Ratio — 호텔** | `35%` | `financials.ts:132` |
| **Opex Ratio — 기본** | `18%` | `financials.ts:134` |
| Cap Rate 진입 기본값 | `4.0%` (`0.04`) | `financials.ts:191` |
| Exit Cap Rate 스프레드 — Best | `+0.25%` | `financials.ts:192` |
| Exit Cap Rate 스프레드 — Base | `+0.50%` | `financials.ts:193` |
| Exit Cap Rate 스프레드 — Worst | `+1.00%` | `financials.ts:194` |
| WACC 자기자본비용 | `8%` | `financials.ts:250` |
| WACC 타인자본비용 | `5%` | `financials.ts:250` |
| WACC 법인세율 | `22%` | `financials.ts:250` |
| 개발형 평당 공사비 | `800만원` | `financials.ts:340` |
| 개발형 기본 용적률 | `400%` | `financials.ts:341` |
| 개발형 기타비용 | `15%` | `financials.ts:343` |
| 자가사용 대출금리 | `5.2%` | `financials.ts:501` |
| NCF 대출금리 기본값 | `4.5%` | `net-cash-flow-calculator.ts:49` |
| NCF LTV 기본값 | `50%` | `net-cash-flow-calculator.ts:51` |

---

③ **`capRate.base` 외에 어떤 변형이 있습니까**

`capRate` 객체는 `.best`, `.base`, `.worst` 3종만 존재합니다 (`financials.ts:65`). `.stabilized`나 `.leveraged` 속성은 **없습니다**. 레버리지 수익률은 별도의 `leveragedYield` 필드(`financials.ts:75`)로 계산됩니다. Operating 포스처에서는 `gopCapRatePct` (`financials.ts:103`) 변형이 추가 존재합니다.

---

④ **PPTX와 모바일이 같은 함수를 호출합니까?**

**아닙니다.** 호출 그래프가 다릅니다:

```
[모바일 IM]
im-section-generator.ts (L139)
  └─ calculateFinancials()      ← 직접 호출
  └─ calculateNetCashFlow()     ← 직접 호출
  └─ formatFinancialsMarkdown() → Markdown 텍스트 생성
  └─ formatNetCashFlowMarkdown()→ 3줄 요약 Markdown 생성
       └─ 두 결과를 합쳐서 하나의 Markdown으로 저장

[PPTX]
pptx/data-binder.ts (L272)
  └─ transformForArchetype()
       └─ parseMarkdownTable()  ← 모바일이 생성한 Markdown을 정규식으로 파싱
       └─ extractMetrics()      ← 수치를 재추출
       └─ 재무 엔진(financials.ts) 직접 호출 없음
```

**결론:** PPTX 렌더러는 `financials.ts`를 직접 호출하지 않고, 모바일 측에서 이미 렌더링된 Markdown 텍스트를 `split('|')`과 정규식으로 파싱하여 사용합니다.

---

⑤ **`dcf-sensitivity.ts`의 할인율·성장률 기본값은**

파일 내부(L92-93)에는 **오프셋 배열**(`[-0.01, 0, 0.01]`)만 존재합니다. 기본 절대 수치는 `financials.ts`에서 주입받습니다:
- 성장률: `2%` (rentGrowthPctPerYear)
- WACC: `calculateWACC(equityRatio, 0.08, debtRatio, 0.05, 0.22)`
- 보유 기간: `10년` (L260)

---

⑥ **`financials.ts`와 `net-cash-flow-calculator.ts` 중 어느 쪽이 화면에 나갑니까**

**양쪽 모두 병합되어 노출됩니다.** `im-section-generator.ts` L173에서:

```typescript
finMd = formatNetCashFlowMarkdown(ncf) + '\n\n' + finMd;
```

상단에 NCF 3줄 요약, 하단에 상세 Financials 표가 이어 붙여져 하나의 섹션으로 화면에 나갑니다.

### 첨부
- `src/domain/building/mobile-im/financials.ts` (전체 600줄)
- `src/domain/building/mobile-im/dcf-sensitivity.ts` (전체 131줄)
- `src/domain/building/mobile-im/net-cash-flow-calculator.ts` (전체 129줄)
- `src/domain/building/mobile-im/im-section-generator.ts` (호출 그래프 중심)

---

## T1-2 · 모바일 IM 현행 화면 구조

### 답변

① **첫 화면(스크롤 없이)에 무엇이 보입니까?**

상단에 `PhotoGallery` 또는 `KakaoStaticMap`(좌표 있을 때 OSM 3×3 타일 그리드 + 카카오맵 링크), 그 아래에 `HeroCard`(자산 분류, 공시가, 핵심 메트릭 2×2 그리드, 3대 핵심 투자 포인트)가 렌더링됩니다.

---

② **CTA 버튼이 있습니까. 있다면 몇 개·무엇입니까**

**있습니다.** 주요 CTA:
- `🏆 Pro IM 요청하기` — Pro 업그레이드 유도 버튼
- `📞 전화 상담` — 중개인 전화 연결 버튼
- `📨 신청서 보내기` — `IMInquiryBottomSheet` 모달 내 리드 수집 폼 제출 버튼
- `📄 프라이빗 IM 신청` — 모달 헤더

---

③ **섹션 접힘/펼침이 있습니까**

**있습니다.** `SectionCard` 컴포넌트(`mobile-im-viewer.tsx:478`)가 `isOpen`/`onToggle` 상태로 아코디언 동작을 구현합니다. 잠금(Lock) 기능도 포함되어 있습니다.

---

④ **SSR입니까 CSR입니까 · 이미지 로딩 실패 시 동작은**

**혼합 구조**입니다:
- `page.tsx`: 서버 컴포넌트(RSC)에서 `fetchIMData`로 Supabase 직접 조회
- `mobile-im-viewer.tsx`: `"use client"` 지시어로 CSR 렌더링

이미지 로딩 실패에 대한 `onError` 폴백 이미지 처리는 **명시적으로 구현되어 있지 않습니다** (Next.js `Image` 컴포넌트 기본 동작에 의존). 지도의 경우 OSM Static Image Grid가 백업으로 사용됩니다.

---

⑤ **Basic/Pro 화면이 같은 컴포넌트입니까 별개입니까**

**같은 컴포넌트**입니다. `src/app/(public)/im-pro/[grantId]/page.tsx` 라우트는 파일 시스템에 존재하지만, `mobile-im-viewer.tsx` 내에서 `isBroker` prop으로 일부 조건 분기 처리하는 단일 컴포넌트 구조입니다.

---

⑥ **폰트 크기·최소 터치 영역 규격이 있습니까**

**디자인 시스템 토큰은 없습니다.** Tailwind 유틸리티 클래스(`text-[10px]`, `text-xs`, `text-sm`, `text-base`)를 인라인으로 사용합니다. 터치 영역은 갤러리·모달 버튼 등에 `w-10 h-10` (40×40px)이 개별 지정되어 있으나, 체계적인 최소 터치 규격(예: 44×44pt) 표준은 선언되어 있지 않습니다.

### 첨부
- `src/app/(public)/im-lite/[buildingId]/page.tsx`
- `src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx` (1702줄)
- `src/app/(public)/im-lite/[buildingId]/fetch-im-data.ts`

---

## T1-3 · 최근 생성물 실물 20건

### 답변

① **중개인이 발행 전 수정한 비율은 얼마입니까**

**모릅니다.** DB 집계 쿼리 없이는 확인 불가능합니다.

---

② **가장 많이 수정되는 섹션은**

**모릅니다.** 섹션별 수정 빈도를 추적하는 애플리케이션 레벨 코드가 없습니다.

---

③ **수정 전후 diff를 보관합니까**

**스키마는 존재하나 앱 코드는 불완전합니다.**
- `supabase/migrations/0121_edit_diffs.sql` 파일에 diff 저장용 테이블이 존재합니다.
- `im_golden_sets`에 `was_edited` 상태값과 버전 트래킹 필드(`version`, `parent_id`)가 존재합니다 (`00058_golden_sets_v2.sql`).
- 그러나 `im-section-generator.ts` 코드 내에서 실제로 diff를 계산하고 이 테이블에 INSERT하는 애플리케이션 로직은 **식별되지 않았습니다**.

### 비고
20건 표본 추출은 DB 직접 쿼리가 필요합니다. 다음 쿼리로 추출 가능:
```sql
SELECT * FROM im_golden_sets
ORDER BY created_at DESC
LIMIT 20;
```

---

## T1-4 · 운영 텔레메트리 30일

### 답변

① **이 지표들을 현재 수집하고 있습니까?**

**수집하고 있지 않습니다.** 프로젝트 전체에서 `telemetry`, `analytics`, `metrics`, `monitoring` 키워드를 검색한 결과 전용 모듈은 없습니다. `package.json`에도 Amplitude, Mixpanel, PostHog, Google Analytics 등 분석/모니터링 SDK가 **전혀 포함되어 있지 않습니다**.

단, 예외적으로:
- LLM 호출 비용은 `src/ai/cost-tracker.ts`에서 `im_generation_cost_log` 테이블에 건별 기록됩니다.
- 개별 호출 레이턴시(`latency_ms`)는 `Date.now() - startTime`으로 로그에 남깁니다.

요청서에 나열된 나머지 지표(월 생성 건수, 폴백 발동률, Judge 점수 분포, publishBlocked 발생률, confidence=needs_check 비율, 교차검증 위반율, IM_FAST_MODE 사용 비율, 공공 API 성공률, 생성 소요 시간 분포)는 **모두 미수집**입니다.

---

② **없다면 계측 추가에 며칠 걸립니까**

PostHog 또는 자체 계측 테이블 도입 기준으로 **2~3영업일** 소요 예상됩니다:
- 1일: 계측 인프라 세팅 (PostHog SDK 또는 Supabase 로깅 테이블)
- 1~2일: 각 측정 지점(`im-section-generator.ts`, `premium-template-engine.ts`, API 호출부 등)에 이벤트 로깅 삽입

---

## T1-5 · DB 스키마 (임대차·골든·캐시)

### 답변

① **`floor_leases`에 다음 필드가 있습니까**

`floor_leases`라는 테이블은 **존재하지 않습니다**. 임대차 관련 테이블은 2개:

**A. `lease_spaces` (`00021_lease_spaces.sql`)**

| 필드 | 존재 | 비고 |
|---|:---:|---|
| 임대면적 | ✅ | `area_sqm` |
| 보증금 | ✅ | `deposit` |
| 월차임 | ✅ | `monthly_rent` |
| 최소 임대 기간 | ✅ | `lease_term_months` |
| 적용법령 | ❌ | |
| 최초계약일 | ❌ | |
| 계약시작일 | ❌ | |
| 계약만료일 | ❌ | |
| 갱신요구권 행사 | ❌ | |
| 대항력 | ❌ | |
| 임대상태(임대중·공실·자가사용) | ❌ | |

**B. `lease_units` (`0110_ontology_schema.sql`)**

| 필드 | 존재 | 비고 |
|---|:---:|---|
| 임대면적 | ✅ | `area_pyung` (평 단위) |
| 보증금 | ✅ | `deposit_krw` |
| 월차임 | ✅ | `monthly_rent_krw` |
| 대항력 | ✅ | `opposing_power BOOLEAN` |
| 공실 여부 | ✅ | `is_vacant BOOLEAN` |
| 계약만료일 | ✅ | `lease_end_date DATE` |
| 적용법령 | ❌ | |
| 최초계약일 | ❌ | |
| 계약시작일 | ❌ | |
| 갱신요구권 행사 | ❌ | |
| 임대상태(자가사용 구분) | ❌ | `is_vacant`만 존재 |

---

② **없는 필드를 추가하는 데 마이그레이션 영향은**

`ALTER TABLE ADD COLUMN`은 하위 호환성을 유지하므로 DB 다운타임이나 블로킹 이슈는 없습니다. 단, 연쇄적으로 수정해야 할 코드:
- Zod 유효성 검증 스키마
- 프론트엔드 입력 폼 컴포넌트 (lease-card 등)
- `im-section-generator.ts`의 supplemental 데이터 처리

---

③ **계약그룹(통합계약) 개념이 있습니까**

**없습니다.** 복수 호실을 하나의 계약으로 묶는 Group ID/Contract Group 구조는 스키마에 존재하지 않습니다.

---

④ **`im_golden_sets`에 Judge 자동 승격 건이 몇 건입니까 · 사람 승인 건과 구분됩니까**

**구분 가능합니다.** `00058_golden_sets_v2.sql`에서 `source_type TEXT NOT NULL DEFAULT 'auto_approve'` 컬럼이 추가되어 있어, AI 자동 승격(auto_approve)과 사람 승인을 쿼리 조건으로 구분할 수 있습니다. 실제 건수는 DB 쿼리가 필요합니다:

```sql
SELECT source_type, COUNT(*) FROM im_golden_sets GROUP BY source_type;
```

### 첨부 — DDL 전문

**`im_golden_sets` (00057)**
```sql
CREATE TABLE IF NOT EXISTS im_golden_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  section_type TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT '',
  price_band TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL,
  judge_score NUMERIC(3,1) DEFAULT 4.0,
  was_edited BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, section_type)
);
```

**`external_data_cache` (00041)**
```sql
CREATE TABLE IF NOT EXISTS external_data_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building_ssot_lite_id UUID NOT NULL REFERENCES building_ssot_lite(id) ON DELETE CASCADE,
  pnu TEXT,
  legal_dong_code TEXT,
  road_address TEXT,
  jibun_address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  building_register JSONB DEFAULT '{}',
  official_land_price JSONB DEFAULT '{}',
  land_use_plan JSONB DEFAULT '{}',
  comparable_transactions JSONB DEFAULT '[]',
  location_poi JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`lease_units` (0110)**
```sql
CREATE TABLE IF NOT EXISTS public.lease_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  floor VARCHAR(20) NOT NULL,
  unit_number VARCHAR(30),
  tenant_sector VARCHAR(50),
  area_pyung NUMERIC(10,2),
  deposit_krw NUMERIC(14,0) DEFAULT 0,
  monthly_rent_krw NUMERIC(14,0) DEFAULT 0,
  opposing_power BOOLEAN DEFAULT false,
  is_vacant BOOLEAN DEFAULT false,
  lease_end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```
