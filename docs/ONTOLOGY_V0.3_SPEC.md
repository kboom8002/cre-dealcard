# CREDEAL 온톨로지 v0.3 명세

> **v0.2를 대체합니다.** 자산군(AssetClass)을 1급 개념으로 승격하고, 확장을 Pack으로 분리합니다.
> 슬롯·enum은 `CATALOG_SLOTS.md`, 규칙·제약·게이트는 `CATALOG_RULES.md`가 소유합니다. 이 문서는 **구조와 원칙**만 다룹니다.

| | |
|---|---|
| **버전** | v0.2.0 → **v0.3.0** (major) |
| **파괴적 변경** | 5건 |
| **마이그레이션** | 필수 · 조건부 되돌림 |
| **최종 수정** | 2026-08-03 |

---

## 0. v0.3 변경 요약

| # | 변경 | 성격 | 근거 |
|---|---|---|---|
| 1 | **AssetClass 1급 승격** | 💥 파괴적 | 온톨로지가 수익형에 암묵 최적화되어 있었음 |
| 2 | **Core / Pack 경계 도입** | 💥 파괴적 | 자산군별 Core 분기를 원천 차단 |
| 3 | **가치 지표 다형화** | 💥 파괴적 | Cap Rate는 보편 지표가 아님 |
| 4 | **등급 가중치 프로파일 자산군별 분리** | 💥 파괴적 | 임차인 없는 물건이 최대 75점에 갇힘 |
| 5 | **아키타입 규칙군 접두 분리** (`R-{CLASS}-xx`) | 💥 파괴적 | R01~R09가 수익형 전제 |
| 6 | `not_applicable` 가중치 재배분 규칙 | 버그 수정 | 잠원동 케이스 |
| 7 | `aboveGroundArea` 슬롯 | 확장 | 실무의 "실질 용적률" |
| 8 | 신설 슬롯군 5종 | 확장 | `CATALOG_SLOTS.md` §3 |
| 9 | 제약 C23~C28 · 레이아웃 L16~L20 | 확장 | `CATALOG_RULES.md` |

v0.2에서 도입한 **provenance 5-tier와 합성 규칙, T/P 규칙군은 그대로 유지**됩니다.

---

## 1. 왜 바꾸는가

v0.2까지의 온톨로지는 **수익형 자산을 암묵적으로 전제**했습니다. 명시된 적은 없으나 구조가 그렇게 되어 있었습니다.

- `lease_roll` 가중치 25점 — 임차인이 없으면 최대 75점
- `Cap Rate`가 보편 지표처럼 취급 — 사옥·대지에서 무의미
- `R01~R09`가 전부 임대수익 개선 축
- `L01`·`L05`가 렌트롤·공실을 전제

잠원동 두원빌딩(개발형 · 2필지 · 명도조건)을 처리하며 이 전제가 처음 깨졌고, 사옥·대지·물류가 들어오면 매번 깨집니다.

> **v0.3의 명제.** 자산군은 태그가 아니라 스키마 분기점이다. 확장은 Core를 건드리지 않고 Pack으로 한다.

---

## 2. 자산군 (AssetClass)

```ts
export const AssetClass = z.enum([
  'income',          // 수익형 — 임대수익 자산
  'owner_occupied',  // 사옥형 — 자가 사용
  'development',     // 개발형 — 신축·재건축 전제
  'land',            // 대지 — 나지 · 구축 철거 전제
  'logistics',       // 물류 — 창고 · 물류센터
  'mixed',           // 복합 — 주 용도로 Pack 선택
]);
```

자산군이 결정하는 것은 여섯 가지입니다.

| # | 결정 대상 | 정본 |
|---:|---|---|
| 1 | 필수 / 해당없음 슬롯군 | `CATALOG_SLOTS.md` §4 |
| 2 | 주 가치 지표 계산 전략 | 이 문서 §5 |
| 3 | 적용 아키타입 규칙 세트 | `CATALOG_RULES.md` §1 |
| 4 | 등급 가중치 프로파일 | 이 문서 §6 |
| 5 | 레이아웃 편성 | `CATALOG_RULES.md` §5 |
| 6 | 추가 제약 · 게이트 | `CATALOG_RULES.md` §3·§4 |

### 자동 판정 금지

`mixed`를 포함해 **자산군은 중개인이 선택합니다.** 1층 상가 + 상층 사옥 같은 복합 물건에서 자동 판정은 반드시 틀리며, 틀린 판정은 IM 전체 구성을 바꿉니다.

시스템은 제안만 합니다 — *"임대차 0건 + 명도 조건 → 개발형으로 보입니다"*.

---

## 3. Core / Pack 경계

### ADR-009 — Core를 자산군별로 분기하지 않는다

```
Core Schema (모든 자산군 공통)          Pack (자산군별 확장)
├ 필지 · 건축물 · 용도지역 · 접면        ├ 고유 슬롯 (metadata_schema)
├ 가격 · 취득원가 · 권리 · 비교사례       ├ 가치 지표 계산 전략
├ provenance · 합성 · 등급 · 게이트       ├ 아키타입 규칙 세트
├ 발행 이력 · 버전 Pin                   ├ 레이아웃 편성
└ 확장점                                └ 추가 제약 · 게이트
   assetClass · packSlots · packVersion
```

```sql
alter table deal
  add column asset_class  text  not null default 'income',
  add column pack_slots   jsonb not null default '{}',
  add column pack_version text;

create index on deal (asset_class);
```

**자산군별 Core 테이블 분기는 금지입니다.** 한 번 분기하면 공통 기능(provenance 합성 · 등급 산정 · 게이트 · 발행 이력) 개선이 자산군 수만큼 비싸지고, 마이그레이션 경로가 영구히 사라집니다.

### Pack이 Core 변경을 요구할 때

Pack 요구가 Core 스키마 변경을 부르면 **반드시 ADR 검토**를 거칩니다. "이 Pack만을 위한 Core 필드"는 거부합니다. 둘 이상의 Pack이 같은 필드를 요구할 때만 Core로 승격합니다.

---

## 4. provenance (v0.2 유지)

| 배지 | 코드 | 점수 | 책임 |
|---|---|---:|---|
| ✓ 공부확인 | `public` | 1.00 | 발급기관 |
| ★ 전문가검증 | `expert` | 0.95 | 자격사 |
| ▲ 매도인고지 | `seller` | 0.65 | 매도인 |
| ● 중개인입력 | `broker` | 0.60 | 중개인 |
| ◇ AI추정·가정 | `assumed` | 0.30 | 없음 |

### 합성 규칙 (v0.2 유지)

```ts
// A. 가감산 — 기여 절대값 가중 평균
export declare function composeAdditive(
  inputs: Array<{ value: number; score: number }>): number;

// B. 비율 — 분자 · 분모 중 낮은 쪽
export declare function composeRatio(
  numerator: number, denominator: number): number;

// C. 시나리오 — 항상 0.30 (◇)
export const SCENARIO_SCORE = 0.30;
```

**규칙 C는 예외가 없습니다.** 총수익률 · NPV · IRR · 자가vs임차 비교 · 사업수지는 입력이 전부 공부여도 `assumed`입니다. 미래 예측이기 때문입니다.

파생값에는 **최약 고리**를 각주로 병기합니다.

```
NOI 4.594억  ● 중개인입력
  └ 최약 고리 — 기타 운영경비 ◇ 가정
```

---

## 5. 다형 가치 지표

v0.3의 핵심 변경입니다. **`Cap Rate`를 보편 지표에서 수익형 Pack의 지표로 강등**합니다.

```ts
export interface ValueMetricStrategy {
  id: string;
  label: string;
  applies: AssetClass[];
  compute(doc: IMDoc): MetricResult;
  disclosure: 'primary' | 'secondary' | 'onRequest';
  /** 시나리오 강제 여부 — true면 단일 값 제시가 게이트에서 차단된다 */
  requiresScenarios: boolean;
}
```

| 자산군 | 주 지표 | 시나리오 강제 | 계산식 정본 |
|---|---|:-:|---|
| `income` | Cap Rate 4기준 · 총수익률 | 총수익률만 ○ | `IM_PRECISION_SPEC.md` §2 |
| `owner_occupied` | **자가 vs 임차 연간 비교** | **○** | `IM_PRECISION_SPEC.md` §2.4 준용 |
| `development` | **토지 평단가 + 사업수지** | ○ | `ASSET_CLASS_EXTENSION_PLAN.md` §4.3 |
| `land` | **평단가 + 토지비 부담(원/연면적평)** | ✗ | `ASSET_CLASS_EXTENSION_PLAN.md` §4.4 |
| `logistics` | Cap Rate + **스펙 벤치마크** | 총수익률만 ○ | `ASSET_CLASS_EXTENSION_PLAN.md` §4.5 |

### 시나리오 강제가 필요한 이유

사옥형의 자가vs임차 판정은 **지가 가정에 지배됩니다.** 두원빌딩 기준으로 지가 2.87%를 가정하면 자가가 연 8.85억 유리하지만, 0%로 두면 1.90억으로 떨어집니다. 단일 값 제시는 사실상 투자 권유가 되므로 제약 C27이 이를 차단합니다.

---

## 6. 자료등급

### 6.1 산정식 (v0.2 유지)

```
grade_score = Σ (슬롯군 유효가중치 × 충족률 × 평균 provenance 점수)
```

| 등급 | 점수 | 게이트되는 것 |
|---|---:|---|
| A | ≥ 85 | 제한 없음 |
| B | ≥ 65 | DCF · 민감도 억제 (C11) |
| C | ≥ 40 | + 시나리오 지표 억제 |
| D | < 40 | 발행 불가 |

**등급은 물건 × 시점의 함수이며 티어의 함수가 아닙니다.** Pro에서 DCF가 나오는 것은 Pro라서가 아니라 자료가 A에 도달했기 때문입니다.

### 6.2 자산군별 가중치 프로파일 🆕

| 슬롯군 | income | owner_occupied | development | land | logistics |
|---|---:|---:|---:|---:|---:|
| `land_parcel` | 15 | 15 | 15 | **30** | 15 |
| `building_basic` | 15 | 15 | 15 | — | 15 |
| `zoning` | 10 | 10 | 10 | **30** | 10 |
| `road_access` | 5 | 5 | 5 | 10 | 5 |
| `lease_roll` | **25** | 5 | 10 | — | 20 |
| `financial_input` | 15 | 15 | 10 | — | 10 |
| `title_encumbrance` | 10 | 10 | 10 | 5 | 10 |
| `market_comp` | 5 | 5 | 5 | 10 | 5 |
| `physical_spec` | — | **20** | — | — | **20** |
| `development_plan` | — | — | **20** | 15 | — |
| `vacate_plan` | — | — | 10 | — | — |
| **원 합계** | 100 | 100 | 110 | 100 | 110 |

합계가 100이 아닌 프로파일은 `가중치 × 100 ÷ 합계`로 정규화합니다.

### 6.3 `not_applicable` 재배분 🆕

v0.2에 누락되었던 규칙입니다. **이것이 없으면 명도 조건 물건은 최대 75점(B 상단)에 갇힙니다.**

```ts
export function effectiveWeights(
  profile: Record<string, number>,
  notApplicable: string[],
): Record<string, number> {
  const active = Object.fromEntries(
    Object.entries(profile).filter(([k]) => !notApplicable.includes(k)));
  const total = Object.values(active).reduce((a, b) => a + b, 0);
  const scale = 100 / total;
  return Object.fromEntries(
    Object.entries(active).map(([k, v]) => [k, v * scale]));
}
```

**실증 — 잠원동 두원빌딩 (개발형 · `lease_roll` N/A)**

| 슬롯군 | 원가중 | 재배분 | 충족 | 출처 | 기여 |
|---|---:|---:|---:|---:|---:|
| building_basic | 15 | 20.00 | 1.00 | 1.00 | 20.00 |
| land_parcel | 15 | 20.00 | 1.00 | 1.00 | 20.00 |
| zoning | 10 | 13.33 | 1.00 | 1.00 | 13.33 |
| road_access | 5 | 6.67 | 1.00 | 1.00 | 6.67 |
| lease_roll | 25 | **N/A** | — | — | — |
| financial_input | 15 | 20.00 | 0.50 | 0.60 | 6.00 |
| title_encumbrance | 10 | 13.33 | 0.00 | — | 0.00 |
| market_comp | 5 | 6.67 | 1.00 | 1.00 | 6.67 |
| | | | | | **72.67 → B** |

> 위 예시는 수익형 프로파일 기준입니다. 개발형 프로파일(§6.2)을 적용하면 `development_plan`·`vacate_plan`이 포함되어 점수가 달라집니다. **Pack 구현 시 재산정이 필요합니다.**

---

## 7. 마이그레이션 v0.2 → v0.3

### 7.1 절차

```
1. v0.2 스냅샷 백업 (되돌림 지점)
2. 전 딜에 asset_class = 'income' 주입 (기존 물건은 전부 수익형이었음)
3. pack_slots 빈 객체로 초기화
4. 등급 프로파일을 income으로 고정 → 재산정 (점수 무변화 확인)
5. 아키타입 코드 개명  R01~R09 → R-INC-01~09
6. R10 deprecated 유지 (v0.2에서 이미 폐기)
7. 신설 슬롯군은 null 허용으로 추가 — 기존 딜에 영향 없음
8. 변경 영향 보고서 생성
9. 검증 통과 후 커밋 / 실패 시 1로 롤백
```

### 7.2 4번 — 점수 무변화가 검증 조건

기존 딜은 전부 수익형이므로 **v0.2 프로파일과 v0.3 income 프로파일이 동일**합니다. 재산정 후 점수가 바뀌면 마이그레이션 오류입니다.

단, `not_applicable` 재배분 규칙이 새로 적용되므로 **N/A 슬롯군이 있던 딜은 점수가 오릅니다.** 이는 정상이며 영향 보고서에 별도 표기합니다.

### 7.3 되돌림 가능성

| 조건 | 롤백 |
|---|---|
| `income` 외 자산군 딜이 생성되기 전 | 가능 |
| 다른 자산군 딜 생성 후 | **불가** — Pack 슬롯을 Core로 강등할 수 없음 |

**롤백 가능 기간은 첫 비수익형 딜 생성 전까지입니다.** 배포 계획에 명시하고 그 전에 검증을 끝내십시오.

### 7.4 발행 이력 보호

```ts
export interface PublishRecord {
  ontologyVersion: string;     // 'v0.2.0' | 'v0.3.0' — 발행 시점 Pin
  assetClass: string;
  packVersion: string | null;
  engineVersion: string;
  snapshot: IMDoc;
}
```

v0.2 엔진을 `packages/ontology/legacy/v0.2`에 보존합니다. **삭제하지 마십시오.**

---

## 8. 버전 정책

| 변경 유형 | 버전 | 예 |
|---|---|---|
| 자산군 추가 · 삭제 | **major** | `logistics` 신설 |
| 슬롯 타입 변경 · 삭제 | **major** | 스칼라 → 배열 |
| provenance 등급 추가 · 의미 변경 | **major** | 4-tier → 5-tier |
| 규칙 판정 로직 변경 | **major** | R02 기준 변경 |
| 가중치 프로파일 값 변경 | **major** | 등급 분포가 바뀜 |
| Pack 추가 | minor | 개발형 Pack v1 |
| 슬롯 추가 (선택) | minor | `aboveGroundArea` |
| enum 값 추가 | minor | 지목 확장 |
| 제약 · 게이트 · 레이아웃 추가 | minor | C23~C28 |
| NLG 마스크 추가 | minor | M13~M24 |
| 문구 · 주석 | patch | — |

**규칙 코드는 재사용하지 않습니다.** R10을 폐기했으므로 다른 의미로 다시 쓰지 않습니다. 과거 IM의 해석이 사후에 바뀌면 감사가 불가능해집니다.

---

## 9. 검증 시나리오

| # | 시나리오 | 기대 |
|---:|---|---|
| 1 | v0.2 수익형 딜 마이그레이션 | `asset_class='income'` · 등급 점수 무변화 |
| 2 | N/A 슬롯군 있던 딜 마이그레이션 | 재배분 적용으로 점수 상승 · 영향 보고서 등재 |
| 3 | 잠원동(개발형) 등급 산정 | 재배분 적용 → 72.67 (B) |
| 4 | 복합 물건 자동 판정 시도 | **차단** — 중개인 선택 요구 |
| 5 | 사옥형 자가vs임차 단일 값 | **C27 위반 — 발행 차단** |
| 6 | 파생값에 `public` 강제 주입 | **C21 위반 — 발행 차단** |
| 7 | 총수익률에 `public` 표기 | **C22 위반 — 발행 차단** |
| 8 | `R01` 코드 조회 | deprecated → `R-INC-01` 안내 |
| 9 | Pack이 Core 필드 요구 | ADR 검토 없이는 차단 |
| 10 | 비수익형 딜 생성 후 롤백 시도 | **차단** — 사유 안내 |
| 11 | v0.2 Pin된 IM 재렌더 | legacy 엔진으로 동일 산출 |
| 12 | 물류 딜에 `lease_roll` N/A | 프로파일 재배분 후 산정 |

---

## 10. 참고

- 슬롯 · enum — `CATALOG_SLOTS.md`
- 규칙 · 제약 · 게이트 · 레이아웃 — `CATALOG_RULES.md`
- 계산식 — `IM_PRECISION_SPEC.md`
- 수집 · 등급 엔진 — `IM_DATA_PIPELINE.md`
- 자산군 로드맵 — `ASSET_CLASS_EXTENSION_PLAN.md`
- 이력 — `CHANGELOG.md`
- 보존 — `ONTOLOGY_V0.2_SPEC.md` (재현용, 삭제 금지)
