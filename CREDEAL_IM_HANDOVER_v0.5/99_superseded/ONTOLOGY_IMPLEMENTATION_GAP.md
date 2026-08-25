> ⛔ **SUPERSEDED** — 이 문서는 `IM_SYSTEM_SSOT.md §1`로 대체되었습니다 (2026-08-23).
> 과거 발행 IM의 재현 목적으로만 참조하십시오. **수정하지 마십시오.**

---

# 온톨로지 구현 갭 — 명세 v0.4 대 구현 v0.2.0

> `ONTOLOGY_SSOT_AUDIT.md`(구현 감사) 대비 명세와 코드의 차이를 한 곳에 모읍니다.
> **이 문서는 정본이 아닙니다.** 갭이 해소되면 항목을 지우고, 전부 지워지면 문서를 폐기합니다.

| | |
|---|---|
| **명세** | v0.4.0 |
| **구현** | v0.2.0 (`src/domain/ontology/` 6파일 935줄) |
| **갭** | **9건** (차단 2 · 높음 3 · 중간 2 · 낮음 2) |
| **최종 수정** | 2026-08-03 |

---

## 0. 요약

| # | 갭 | 심각도 | 조치 |
|---:|---|:-:|---|
| 1 | `AssetType` 8종 ↔ `AssetClass` 6종 충돌 | **차단** | 3축 분리 (v0.4) |
| 2 | T 규칙군이 상가 전용 — 주택 미지원 | **차단** | `T-R-01~07` 신설 |
| 3 | `CapRateBasis` 명칭 불일치 | 높음 | **구현 명칭 채택** |
| 4 | 등급 가중치 per-slot ↔ per-slot-group | 높음 | 2단 구조로 통합 |
| 5 | `ENUM_REGISTRY` v0.2 9종만 등록 | 높음 | 23종 통합 |
| 6 | 슬롯 86 ↔ 카탈로그 122 | 중간 | 배열 서브슬롯 명시 |
| 7 | C19 미구현 | 중간 | 구현 |
| 8 | `residential_spec`·`sectional_spec` 부재 | 낮음 | Pack 추가 |
| 9 | `hospitality` Pack 미병합 | 낮음 | 카탈로그 병합 |

---

## 1. `AssetType` ↔ `AssetClass` 충돌 — 차단

### 현황

```ts
// 구현: src/domain/building/asset-ontology.ts
type AssetType = 'office'|'retail'|'logistics'|'residential'|'mixed_use'|'land'|'hotel'|'industrial';

// 명세 v0.3
type AssetClass = 'income'|'owner_occupied'|'development'|'land'|'logistics'|'hospitality';
```

`land`·`logistics`가 양쪽에 있고, `office`와 `income`은 층위가 다릅니다.

### 판정 — **양쪽 다 부분적으로 옳았습니다**

구현은 **물리적 용도**를, 명세는 **투자 관점**을 모델링했습니다. 둘 다 필요하고 서로 직교합니다. 어느 한쪽을 버리는 것이 아니라 **축을 나눕니다.**

### 조치

`ONTOLOGY_V0.4_SPEC.md` §1의 3축 모델. 구현의 8종은 `assetType` 17종으로 확장 흡수합니다.

| 구현 값 | v0.4 `assetType` |
|---|---|
| `office` | `office_building` |
| `retail` | `nbhd_building` |
| `logistics` | `logistics` |
| `residential` | `multi_household` |
| `mixed_use` | `mixed_shop_house` |
| `land` | `bare_land` |
| `hotel` | `hotel` |
| `industrial` | `factory_building` |

**손실 없는 매핑입니다.** 구현이 이미 가진 값을 버리지 않습니다.

---

## 2. T 규칙군 상가 전용 — 차단

### 현황

`rules/tenancy.ts`의 T01~T06이 전부 상가건물임대차보호법 기준입니다. 지역별 환산보증금(서울 9억 / 과밀 6.9억 / 기타 5.4억)도 구현되어 있습니다.

### 문제

구현의 `AssetType`에 이미 `residential`이 있습니다. **즉, 주거 자산을 다룰 준비를 하면서 주거 임대차법은 구현하지 않았습니다.** 원룸건물 IM을 만들면 갱신요구권을 10년으로 계산합니다 — 실제는 최장 4년입니다.

### 조치

`CATALOG_RULES.md` §2.1의 `T-C` / `T-R` 분기. 구현 파일 분할:

```
rules/tenancy.ts  →  rules/tenancy-commercial.ts   (T-C-01~06, 기존 로직 개명)
                     rules/tenancy-residential.ts  (T-R-01~07, 신규)
                     rules/tenancy-dispatch.ts     (buildingUse → 규칙군 선택)
```

**기존 로직은 그대로 옮깁니다.** 상가 판정은 검증되었으므로 손대지 않습니다.

---

## 3. `CapRateBasis` 명칭 불일치 — 높음

| 구현 | 명세 v0.3 | 의미 |
|---|---|---|
| `noi_price` | `noi_price` | NOI ÷ 매각가 |
| `noi_price_deposit` | `broker_equity` | NOI ÷ (매각가 − 보증금) |
| `noi_equity` | — | NOI ÷ 자기자본 |
| `gross_price` | `broker_price` | 총임대료 ÷ 매각가 |
| — | `noi_total_cost` | NOI ÷ 총취득원가 |

### 판정 — **구현 명칭을 채택합니다**

구현 명칭이 더 정확합니다. `broker_equity`는 "중개인형"이라는 실무 관행을 이름에 박아 넣은 것인데, **관행은 바뀌고 산식은 안 바뀝니다.** `noi_price_deposit`은 산식 자체를 기술하므로 오해가 없습니다.

명세를 고칩니다. 다만 두 값을 추가해야 합니다:

```ts
export type CapRateBasis =
  | 'gross_price'          // 총임대료 ÷ 매각가              (실무 "중개인형")
  | 'gross_price_deposit'  // 총임대료 ÷ (매각가 − 보증금)   🆕 실무 최빈값
  | 'noi_price'            // NOI ÷ 매각가                   (표준형)
  | 'noi_price_deposit'    // NOI ÷ (매각가 − 보증금)
  | 'noi_equity'           // NOI ÷ 자기자본                 (레버리지)
  | 'noi_total_cost'       // NOI ÷ 총취득원가               🆕 (회계사형)
  | 'gop_price';           // GOP ÷ 매각가                   🆕 (운영형)
```

`gross_price_deposit`가 실무에서 가장 많이 쓰이는데 구현·명세 모두 빠져 있었습니다. 역설계 5건 전부 이 값을 IM에 실었습니다.

### IM 표기 시 사용자 언어

내부 코드는 산식 기반, **화면 표기는 실무 언어**로 매핑합니다.

| 코드 | IM 표기 |
|---|---|
| `gross_price_deposit` | 임대수익률 (실투자금 기준) |
| `gross_price` | 임대수익률 (매매가 기준) |
| `noi_price` | Cap Rate (표준) |
| `noi_total_cost` | Cap Rate (총취득원가 기준) |
| `gop_price` | **Cap Rate (GOP 기준)** — C31이 표기 강제 |

---

## 4. 등급 가중치 층위 불일치 — 높음

### 현황

`asset-ontology.ts`는 **개별 슬롯**에 가중치를 둡니다 (`address`, `askingPriceKrw`, `grossAnnualIncomeKrw`, `monthlyRentKrw`, `zoningRegion`). 명세는 **슬롯군**에 둡니다.

### 판정 — **둘 다 필요합니다**

슬롯군 가중치만으로는 "주소는 있는데 매각가가 없는" 경우와 "매각가는 있는데 주소가 없는" 경우를 구분하지 못합니다. 반대로 개별 슬롯만 쓰면 슬롯이 163개로 늘어날 때 가중치 관리가 불가능합니다.

### 조치 — 2단 구조

```ts
// 1단: 슬롯군 가중치 (assetType × posture로 결정) — CATALOG_ASSET_TYPES.md §6
const groupWeight = gradeProfile(assetType, posture);

// 2단: 슬롯군 내부 배분 (슬롯별 상대 중요도) — 기본 균등, 필요 시 오버라이드
const slotWeight = SLOT_WEIGHT_OVERRIDE[group] ?? uniform(SLOTS_IN[group]);

score(group) = groupWeight[group] × Σ(slotWeight[s] × filled(s) × provenance(s));
```

구현의 5개 슬롯 오버라이드는 **`SLOT_WEIGHT_OVERRIDE`에 그대로 보존**합니다. 이미 검증된 값입니다.

---

## 5. `ENUM_REGISTRY` 불완전 — 높음

v0.2에서 도입한 9개 enum 계열만 등록되어 있고, v0.1의 14개는 별도 관리됩니다. 목표는 통합 23개 + v0.4 신설분입니다.

### 위험

레지스트리에 없는 enum은 **버전 Pin 대상에서 빠집니다.** 값을 추가·삭제해도 과거 IM 재현 검증에 걸리지 않습니다. 조용히 깨지는 종류의 문제입니다.

### 조치

```
1. v0.1 enum 14종을 ENUM_REGISTRY로 이관 (값 변경 없이)
2. v0.4 신설 3종 등록 — BuildingUse(29) · AssetType(17) · InvestmentPosture(5)
3. 총 26계열
4. 레지스트리 미등록 enum을 CI에서 검출 — 신규 enum 정의 시 등록 강제
```

**4번이 핵심입니다.** 절차를 문서로 두면 지켜지지 않고, CI에 두면 지켜집니다.

---

## 6. 슬롯 수 86 ↔ 122 — 중간

### 원인

카탈로그의 122개 중 36개가 **배열 서브슬롯**입니다. 예를 들어 `parcels[].area`·`parcels[].exclusions[].kind`는 카탈로그에서 개별 슬롯로 세지만 구현에서는 배열 요소 스키마 하나입니다.

### 판정 — **불일치가 아니라 세는 방식의 차이입니다**

다만 지금은 그것을 확인하는 데 코드를 읽어야 합니다. 카탈로그가 구분을 표기해야 합니다.

### 조치

`CATALOG_SLOTS.md`에 컬럼 추가:

| 슬롯 | 종류 |
|---|---|
| `land.ledgerArea` | scalar |
| `land.parcels[]` | array |
| `land.parcels[].area` | **array-item** |

집계 표기를 `총 122 (scalar 86 · array-item 36)`으로 바꿉니다. v0.4 신설 Pack 반영 후 **163 (scalar 112 · array-item 51)**.

---

## 7. C19 미구현 — 중간

```
C19: Σ 층별 바닥면적 = 연면적 (±0.5%)
```

### 왜 필요한가

역설계 5건 중 **3건에서 층별 면적 합계가 연면적과 어긋났습니다.** 대부분 반올림이지만, 양평동에서는 관리비 배분에 20천원 오차가 났고 이는 층별 데이터가 총계에서 역산된 것임을 드러냈습니다.

### 구현

```ts
export const C19: Constraint = {
  id: 'C19', severity: 'warning',
  check(b: Building) {
    if (!b.floors?.length || !b.grossArea) return { ok: true, skipped: true };
    const sum = b.floors.reduce((a, f) => a + (f.floorArea ?? 0), 0);
    const diff = Math.abs(sum - b.grossArea) / b.grossArea;
    return diff <= 0.005
      ? { ok: true }
      : { ok: false, message:
          `층별 바닥면적 합 ${sum.toFixed(1)}㎡가 연면적 ${b.grossArea}㎡와 ${(diff*100).toFixed(2)}% 차이납니다.` };
  },
};
```

`severity: 'warning'`입니다. 차단하면 안 됩니다 — 층별 면적을 부분만 입력한 정상적인 경우가 흔합니다.

---

## 8~9. Pack 미구현 — 낮음

| Pack | 상태 | 근거 |
|---|---|---|
| `hospitality_spec` | 설계 완료, 카탈로그 미병합 | `IM_역설계분석_3종.md` §3 |
| `residential_spec` | v0.4 신설 | `ONTOLOGY_V0.4_SPEC.md` §5.1 |
| `sectional_spec` | v0.4 신설 | 동 §5.2 |

`hospitality_spec`의 규칙(`R-HTL-01~04`)과 제약(C30~C32)은 v0.4에서 코드가 재배정되었습니다 — **`R-HTL`은 `R-OPR`로, C30~C32는 §3.4의 정의로 확정**됩니다. `IM_역설계분석_3종.md`의 임시 코드를 그대로 구현하면 충돌합니다.

---

## 10. 감사에서 **적합 확인**된 것

바꾸지 않습니다.

| 항목 | 상태 |
|---|---|
| provenance 5-tier + `migrateProvenanceTier()` | ✅ |
| 합성 3종 (additive · ratio · scenario) | ✅ |
| P01~P03 (`rules/parcel.ts`) | ✅ |
| T01~T06 상가 판정 (`rules/tenancy.ts`) | ✅ |
| 지역별 환산보증금 3구간 | ✅ |
| `SELLER_CANDIDATE_SLOTS` | ✅ |
| `PublishRecord` 버전 Pin | ✅ |

---

## 11. 해소 순서

의존 관계상 이 순서를 지켜야 합니다.

```
1. ENUM_REGISTRY 통합 + CI 검출        (갭 5) — 이후 모든 enum 변경의 안전망
2. 3축 분리                             (갭 1) — 나머지 대부분이 여기에 의존
3. T 규칙군 분기                        (갭 2) — 주거 자산 취급 전 필수
4. CapRateBasis 확장                    (갭 3)
5. 등급 2단 구조                        (갭 4) — 3축 확정 후에만 가능
6. Pack 3종 추가                        (갭 8·9)
7. 슬롯 카탈로그 종류 표기              (갭 6)
8. C19 구현                             (갭 7)
```

1번을 먼저 하는 이유는, 2·3번이 enum을 대량 추가하는데 그때 레지스트리 안전망이 없으면 **같은 문제를 더 큰 규모로 다시 만들기** 때문입니다.

### 롤백 한계선

| 갭 | 롤백 가능 기간 |
|---|---|
| 1 (3축) | `posture ≠ income` 딜 생성 전 |
| 2 (T 분기) | 주거 임대차 딜 생성 전 |
| 4 (등급 2단) | 등급 재산정 후 IM 발행 전 |

**한계선을 넘으면 롤백이 아니라 데이터 마이그레이션이 됩니다.** 각 단계 착수 전 스냅샷을 남기십시오.

---

## 12. 참고

- 구현 감사 원본 — `ONTOLOGY_SSOT_AUDIT.md`
- 3축 모델 — `ONTOLOGY_V0.4_SPEC.md`
- 자산 유형 정본 — `CATALOG_ASSET_TYPES.md`
- 규칙 정본 — `CATALOG_RULES.md`
- 실증 — `IM_역설계분석_잠원동두원빌딩.md` · `_당산동근생빌딩.md` · `_3종.md`
