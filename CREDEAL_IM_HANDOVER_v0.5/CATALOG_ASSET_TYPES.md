# 자산 유형 카탈로그 (3축)

> **정본.** `buildingUse` · `assetType` · `investmentPosture` 세 축의 값과 조합 제약을 여기서만 정의합니다.
> 다른 문서는 참조만 합니다. 값 추가·변경은 이 문서를 고쳐야 성립합니다.

| | |
|---|---|
| **온톨로지** | **v0.5.0** |
| **축** | 3 (법정 용도 · 시장 유형 · 투자 관점) |
| **값 수** | 29 + 17 + 5 |
| **최종 수정** | 2026-08-25 |

### v0.5 변경 요약

| 변경 | 내용 |
|---|---|
| **아키타입 중복 정의 해소** | §3.2의 `R-INC-01~04`가 `CATALOG_RULES` §1.1과 **다른 뜻**이었음. 정의를 `R-INC-04~06`으로 이관하고 이 문서는 참조만 |
| **라벨 교정** | "초안정형" → **"임대 안정형"** (금지어) |
| **포스처 계약 열 신설** | §3에 `status` · 핵심 지표 · L축 슬롯군 명시 |
| **Pack 요약 동기화** | §7이 가리키던 `residential_spec` · `sectional_spec` · `hospitality_spec` 정의가 `CATALOG_SLOTS`에 실제로 생겼음 |

---

## 1. 축 1 — `buildingUse` (법정 용도)

건축법 시행령 별표1 기준. **9개 시설군 · 29개 용도.** 건축물대장에서 자동 수집하며 provenance는 항상 `public`(1.00)입니다.

### 1.1 값 (29종)

| # | 시설군 | 용도 | 코드 | 임대차법 |
|---:|---|---|---|:-:|
| 1 | 자동차 관련 | 자동차관련시설 | `auto_facility` | C |
| 2 | 산업 등 | 운수시설 | `transport` | C |
| 3 | 산업 등 | 창고시설 | `warehouse` | C |
| 4 | 산업 등 | 공장 | `factory` | C |
| 5 | 산업 등 | 위험물저장및처리시설 | `hazardous` | C |
| 6 | 산업 등 | 자원순환관련시설 | `recycling` | C |
| 7 | 산업 등 | 묘지관련시설 | `cemetery` | C |
| 8 | 산업 등 | 장례시설 | `funeral` | C |
| 9 | 전기통신 | 방송통신시설 | `broadcast` | C |
| 10 | 전기통신 | 발전시설 | `power` | C |
| 11 | 문화집회 | 문화및집회시설 | `culture` | C |
| 12 | 문화집회 | 종교시설 | `religion` | C |
| 13 | 문화집회 | 위락시설 | `amusement` | C |
| 14 | 문화집회 | 관광휴게시설 | `tourism_rest` | C |
| 15 | 영업 | 판매시설 | `retail` | C |
| 16 | 영업 | 운동시설 | `sports` | C |
| 17 | 영업 | **숙박시설** | `lodging` | C |
| 18 | 영업 | 제2종근린생활시설 中 다중생활시설 | `multi_living` | C |
| 19 | 교육복지 | 의료시설 | `medical` | C |
| 20 | 교육복지 | 교육연구시설 | `education` | C |
| 21 | 교육복지 | 노유자시설 | `elderly_care` | C |
| 22 | 교육복지 | 수련시설 | `training` | C |
| 23 | 교육복지 | 야영장시설 | `campground` | C |
| 24 | 근린생활 | **제1종근린생활시설** | `nbhd_1` | C |
| 25 | 근린생활 | **제2종근린생활시설** | `nbhd_2` | C |
| 26 | 주거업무 | **단독주택** | `house_single` | **R** |
| 27 | 주거업무 | **공동주택** | `house_multi` | **R** |
| 28 | 주거업무 | **업무시설** | `office` | C / R\* |
| 29 | 주거업무 | 교정시설·국방군사시설 | `correctional` | C |

\* **오피스텔**은 업무시설이나 **주거용으로 사용하면 주택임대차보호법**이 적용됩니다. 자동 판정 불가 — 중개인 확인 필수.

### 1.2 결정하는 것

```ts
export function legalBasisOf(use: BuildingUse): 'commercial' | 'residential' | 'ambiguous' {
  if (use === 'house_single' || use === 'house_multi') return 'residential';
  if (use === 'office') return 'ambiguous';       // 오피스텔 주거용 여부
  return 'commercial';
}
```

| 결정 | 근거 |
|---|---|
| 임대차 법령 | §1.1 표 |
| 용도변경 가능 범위 | 시설군 상·하위 관계 (하위군 → 상위군은 신고, 역은 허가) |
| 주차 대수 산정 | 용도별 원단위 |
| 소방·피난 기준 | 용도별 |

---

## 2. 축 2 — `assetType` (시장 유형)

시장에서 통용되는 물건 분류. **중개인이 선택**합니다. 17종.

| 코드 | 명칭 | 대표 buildingUse | 필수 Pack |
|---|---|---|---|
| `nbhd_building` | 근생빌딩 | `nbhd_1` · `nbhd_2` | — |
| `office_building` | 사무용빌딩 | `office` | — |
| `mixed_shop_house` | 상가주택 | `nbhd_2` + `house_single` | `residential_spec` |
| `multi_household` | 다가구·다중주택 (원룸) | `house_single` | `residential_spec` |
| `multi_family` | 다세대·연립 | `house_multi` | `residential_spec` · `sectional_spec` |
| `officetel` | 오피스텔 | `office` | `residential_spec` · `sectional_spec` |
| `knowledge_center` | 지식산업센터 | `factory` | `sectional_spec` · `physical_spec` |
| `retail_strip` | 근린상가·집합상가 | `retail` · `nbhd_2` | `sectional_spec` |
| `hotel` | 호텔·모텔 | `lodging` | `hospitality_spec` |
| `serviced_residence` | 생활형숙박시설 | `lodging` | `hospitality_spec` · `sectional_spec` |
| `logistics` | 물류창고 | `warehouse` | `physical_spec` |
| `factory_building` | 공장 | `factory` | `physical_spec` |
| `medical_facility` | 병원·요양시설 | `medical` · `elderly_care` | `physical_spec` |
| `education_facility` | 학원·교육시설 | `education` | — |
| `bare_land` | 나대지·개발부지 | (없음) | `development_plan` · `permit_risk` |
| `raw_land` | 임야·농지 | (없음) | `development_plan` · `permit_risk` |
| `special_use` | 특수 (주유소·주차장·장례식장 등) | 각종 | `physical_spec` |

### 2.1 결정하는 것

| 결정 | 설명 |
|---|---|
| **필수 Pack 슬롯군** | 위 표 |
| **비교사례 모집단** | 같은 `assetType` + 같은 권역에서만 추출 |
| **IM 섹션 편성** | 호텔은 객실 구성, 물류는 층고·도크, 대지는 개발 시나리오 |
| **등급 기본 프로파일** | `BASE_PROFILE[assetType]` |

### 2.2 생활형숙박시설 주의

호텔과 법정 용도가 같은 `lodging`이지만 **취사·세탁 설비를 갖춘다**는 점에서 다릅니다. 실무상 문제가 되는 지점:

- 주거용 사용은 원칙적으로 불가 (2021년 이후 단속 강화)
- 오피스텔 용도변경 요건 미충족 사례 다수 → **이행강제금 리스크**
- 분양형이 많아 `sectional_spec` 필수
- 위탁운영사와 소유자 간 수익 배분 구조 확인 필요

`serviced_residence`를 `hotel`과 분리한 이유입니다. IM에 **용도 적법성 확인 항목**을 강제해야 합니다.

---

## 3. 축 3 — `investmentPosture` (투자 관점)

**중개인이 매수자 목적에 맞춰 선택**합니다. 같은 물건도 관점에 따라 다른 IM이 나옵니다.

| 코드 | 명칭 | 주 가치 지표 | 수익률 기준 | 시나리오 강제 | 계약 status |
|---|---|---|---|:-:|---|
| `income` | 임대수익형 | 연 수익률 4기준 · 총수익률 | `noi_price` 외 3 | 총수익률만 | **commercial** |
| `owner_occupied` | 자가사용형 (사옥) | 자가 vs 임차 연간 비교 | `none` | ○ | **beta** |
| `development` | 개발형 | 토지비 부담 · 사업수지 | `none` | ○ | **beta** |
| `operating` | 운영형 | GOP 기준 연 수익률 | `gop_price` | ○ | **beta** |
| `trading` | 단기매매형 | 평단가 · 권역 회전율 | `none` | ✗ | **internal_only** |

`계약 status` 는 **포스처 확장 계약 13칸**의 충족 여부입니다
(`ONTOLOGY_V0.5_SPEC.md` §3). `internal_only` 포스처는 게이트 `G30`이 발행을 차단합니다.

> **status 는 손으로 적는 값이 아닙니다.** 실측 정본은
> `credeal/ssot/im.ontology.yaml` `posture_contract.current_coverage` 이고,
> `qa/ontology_check.py ③` 이 매번 계산합니다. 이 열과 어긋나면 검사기가 이깁니다.
> `trading` 만 `internal_only` 인 이유는 L축 슬롯(보유 이력·매도 사유)이
> **아직 신설되지 않아** 구조적으로 R0이기 때문입니다.

> 🔴 **`owner_occupied` · `development` · `trading` 의 수익률 기준이 `none` 인 것은
> 누락이 아니라 결정입니다.** 사옥·개발·단기매매 매수자에게 임대수익률을 제시하면
> 판단 기준을 잘못 심습니다. `none` 을 명시하지 않으면 "아직 안 정했나"와
> 구분되지 않으므로 반드시 적습니다.

### 3.1 관점별 IM 중심 서사

| posture | IM이 답해야 하는 질문 | L축 (중개인만 아는 것) |
|---|---|---|
| `income` | 지금 임대료가 얼마고, 올릴 수 있는가, 언제 올릴 수 있는가 | 임대 현황 · 운영비 실적 |
| `owner_occupied` | 지금 내는 임차료와 비교해 얼마나 유리한가, 우리 인원이 들어가는가 | 입주 계획 · 현 임차 조건 |
| `development` | 얼마나 지을 수 있는가, 언제 착공하는가, 기존 임차인은 어떻게 되는가 | 명도 계획 · 인허가 상태 |
| `operating` | 영업 성과가 얼마고 지속 가능한가, 운영사는 누구인가 | 3개년 실적 · 운영사 계약 |
| `trading` | 이 가격이 권역 시세 대비 싼가, 되팔 수 있는가 | 비교사례 심화 · 매도 사유 |

**L축이 포스처마다 다른 것이 v0.5의 핵심 설계입니다.** 등급의 L축을 렌트롤로 고정하면
운영형 물건은 영원히 D등급이 됩니다 — 렌트롤이 없는 것이 정상인데도.
상세는 `ONTOLOGY_V0.5_SPEC.md` §6.2.

### 3.2 `income` 안에서도 갈린다 — 아키타입

역설계에서 확인된 하위 구분입니다. **같은 `income`이라도 IM 편성이 정반대**입니다.

> 🔴 **v0.5 정정.** 이 표의 v0.4 판이 `R-INC-01~04`를 `CATALOG_RULES` §1.1과
> **다른 뜻으로** 정의하고 있었습니다. `L02`가 `R-INC-02`를 조건으로 편성을 바꾸므로,
> 어느 문서를 읽느냐에 따라 당산동에 정반대 섹션이 편성됐습니다.
> **정본은 `CATALOG_RULES.md` §1.1이며, 이 표의 정의는 `R-INC-04~06`으로 이관했습니다.**

| 아키타입 | 조건 | IM 중심 | 실증 |
|---|---|---|---|
| `R-INC-01` **임대 안정형** | 신축 ∧ 용적률 여유 없음 ∧ 인상 상한 | 임대 안정성 · 임차인 분산 · 공실 해소 | 양평동 더레드빌딩 |
| `R-INC-02` **가치 상승 여력형** | 건물연령 ≥ 20년 ∧ 유효 용적률 여유 ≥ 50%p | 증축 여지 · 실행 계획 | — |
| `R-INC-04` **임대료 정상화형** | 시세 대비 저렴 ∧ 갱신 도래 | 임대료 갭 · 인상 경로 | 당산동 근생빌딩 |
| `R-INC-05` **공실 해소형** | 공실률 > 15% | 공실 원인 · 임차 유치 전략 | — |
| `R-INC-06` **리모델링형** | 건물연령 > 20년 ∧ 용적률 여유 < 50%p | 리모델링 전후 수익 | — |

전체 25종은 `CATALOG_RULES.md` §1. 아키타입은 **자동 제안 후 중개인 확정**입니다.

> **라벨에서 "초안정"을 뺐습니다.** 근거 없는 단정이라 금지어입니다
> (`CATALOG_LEXICON.md` §7.2). 아키타입 이름은 `M25~M29` 마스크를 타고 IM 문장이
> 되므로 `internal_label` 범위에 해당합니다. **코드는 그대로 둡니다.**

---

## 4. 조합 매트릭스

○ 일반 · △ 가능하나 확인 필요 · ✗ 차단

| assetType | income | owner_occ | development | operating | trading |
|---|:-:|:-:|:-:|:-:|:-:|
| `nbhd_building` | ○ | ○ | ○ | ✗ | △ |
| `office_building` | ○ | ○ | ○ | ✗ | △ |
| `mixed_shop_house` | ○ | △ | ○ | ✗ | △ |
| `multi_household` | ○ | ✗ | ○ | ✗ | △ |
| `multi_family` | ○ | ✗ | △ | ✗ | ○ |
| `officetel` | ○ | △ | ✗ | ✗ | ○ |
| `knowledge_center` | ○ | ○ | ✗ | ✗ | △ |
| `retail_strip` | ○ | △ | △ | ✗ | ○ |
| `hotel` | △ | ✗ | ○ | ○ | △ |
| `serviced_residence` | △ | ✗ | △ | ○ | ○ |
| `logistics` | ○ | ○ | ○ | △ | △ |
| `factory_building` | ○ | ○ | ○ | ✗ | △ |
| `medical_facility` | ○ | ○ | △ | ○ | ✗ |
| `education_facility` | ○ | ○ | △ | ✗ | ✗ |
| `bare_land` | **✗** | ✗ | ○ | ✗ | ○ |
| `raw_land` | **✗** | ✗ | △ | ✗ | ○ |
| `special_use` | ○ | △ | △ | ○ | △ |

### 4.1 차단(✗) 사유

| 조합 | 사유 |
|---|---|
| `bare_land` × `income` | 임대차가 존재하지 않음 |
| `multi_household` × `owner_occupied` | 원룸 건물을 사옥으로 쓰는 경우가 없음 |
| `hotel` × `owner_occupied` | 자가 숙박은 성립하지 않음 |
| `officetel` × `development` | 집합건물 — 전 소유자 동의 없이 개발 불가 |
| `medical_facility` × `trading` | 인허가 승계 문제로 단기 매매 부적합 |

### 4.2 확인 필요(△) 처리

경고를 띄우되 진행은 허용합니다. **차단은 물리적으로 불가능한 경우에만** 씁니다. 실무는 항상 예외를 만들고, 시스템이 중개인을 막으면 시스템을 안 쓰게 됩니다.

```ts
export function validateCombination(t: AssetType, p: InvestmentPosture): CombinationResult {
  const cell = COMBINATION_MATRIX[t][p];
  if (cell === 'blocked') return { ok: false, reason: BLOCK_REASON[`${t}:${p}`] };
  if (cell === 'caution') return { ok: true, warning: CAUTION_NOTE[`${t}:${p}`] };
  return { ok: true };
}
```

---

## 5. 실증 매핑 — 역설계 5건

| 물건 | buildingUse | assetType | posture | 아키타입 |
|---|---|---|---|---|
| 잠원동 두원빌딩 | `nbhd_2` | `nbhd_building` | `development` | — |
| 당산동 근생빌딩 | `nbhd_2` | `nbhd_building` | `income` | `R-INC-02` |
| 양평동 더레드빌딩 | `office` | `office_building` | `income` | `R-INC-01` |
| 수택동 419-19 | `null` | `bare_land` | `development` | — |
| 에이치에비뉴호텔 | `lodging` | `hotel` | `operating` | — |

**잠원동과 당산동이 앞 두 축은 동일하고 posture만 다릅니다.** 3축 분리 없이는 표현할 수 없었던 구분입니다.

### 5.1 v0.3 대비 개선

| 물건 | v0.3 `AssetClass` | v0.4 3축 | 잃었던 것 |
|---|---|---|---|
| 잠원동 | `income` (오분류) | 근생빌딩 × **development** | 신축 제언이 IM의 핵심인데 수익형으로 잡혔음 |
| 당산동 | `income` | 근생빌딩 × income | — |
| 호텔 | `hospitality` | 숙박시설 × 호텔 × **operating** | 법정 용도와 운영 관점이 뭉쳐 있었음 |
| 수택동 | `land` | 나대지 × development | 유형과 관점이 뭉쳐 있었음 |

---

## 6. 등급 기본 프로파일 (`BASE_PROFILE`)

`assetType`이 결정합니다. posture 보정은 `ONTOLOGY_V0.4_SPEC.md` §6.1.

| assetType | building | land | zoning | road | lease | financial | title | comp | Pack |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `nbhd_building` | 15 | 15 | 10 | 5 | 25 | 15 | 10 | 5 | — |
| `office_building` | 15 | 15 | 10 | 5 | 25 | 15 | 10 | 5 | — |
| `multi_household` | 15 | 10 | 5 | 5 | 20 | 15 | 10 | 5 | 15 |
| `officetel` | 10 | 5 | 5 | 5 | 25 | 15 | 10 | 10 | 15 |
| `knowledge_center` | 15 | 5 | 5 | 5 | 20 | 15 | 10 | 10 | 15 |
| `hotel` | 15 | 15 | 10 | 5 | 0 | 15 | 10 | 0 | 30 |
| `logistics` | 15 | 15 | 10 | 10 | 15 | 15 | 10 | 0 | 10 |
| `bare_land` | 0 | 30 | 30 | 10 | 0 | 0 | 5 | 10 | 15 |
| `raw_land` | 0 | 30 | 30 | 10 | 0 | 0 | 5 | 10 | 15 |

각 행 합계 100. 미기재 `assetType`은 `nbhd_building` 프로파일을 기본값으로 씁니다.

### 6.1 물류의 `road_access` 가중이 높은 이유

물류창고는 **진입로 폭·회전 반경이 자산 가치를 직접 결정**합니다. 40ft 컨테이너 트레일러 진입이 불가능하면 임차 수요가 절반으로 줄어듭니다. 일반 빌딩(5)의 두 배인 10을 배정합니다.

### 6.2 나대지의 `zoning` 가중이 높은 이유

수택동 실증에서 확인되었습니다. 용적률 800% 대 1,260%에 따라 토지비 부담이 **57% 차이**납니다. 용도지역·지구단위계획 정보가 나대지 가치의 대부분입니다.

---

## 7. Pack 슬롯군 요약

상세 슬롯 정의는 `CATALOG_SLOTS.md` §3. **이 표는 색인이며 정의를 소유하지 않습니다.**

| Pack | 신설 | 정의 위치 | 핵심 슬롯 |
|---|:-:|---|---|
| `physical_spec` | v0.3 | SLOTS §3.1 | 기준층 면적 · 전용률 · 유효 층고 · 바닥하중 · 도크 수 · 전력 용량 |
| `development_plan` | v0.2 | SLOTS §3.2 | 제안 용도 · 규모 · 용적률 산정 연면적 · 공사비 단가 · 스태킹 |
| `vacate_plan` | v0.3 | SLOTS §3.3 | 명도 대상 · 예상 비용 · 소요 기간 |
| `occupancy_plan` | v0.3 | SLOTS §3.4 | 입주 인원 · 평/인 · 층별 배분 · 현 임차료 · 증원 여력 |
| `permit_risk` | v0.3 | SLOTS §3.5 | 인허가 항목 · 상태 · 예상 기간 |
| `residential_spec` | v0.4 선언 · **v0.5 정의** | **SLOTS §3.6** | 호실 수 · 호실 구성 · 전월세 비중 · 개별계량 · **위반건축물 등재** |
| `sectional_spec` | v0.4 선언 · **v0.5 정의** | **SLOTS §3.7** | 구분등기 · 호실별 대지권 · 소유자 수 · 공동담보 그룹 · 관리단 |
| `hospitality_spec` | v0.3 선언 · **v0.5 정의** | **SLOTS §3.8** | 객실 수 · 타입 구성 · ADR · OCC · GOP 마진 · 운영 형태 · **용도 적법성** |

> **핵심 슬롯 열은 §3.1~3.8의 실제 필드명과 일치해야 합니다.** v0.4 판에는
> `physical_spec` 에 "기둥 간격", `occupancy_plan` 에 "잔여 임대 가능" 처럼
> **정의에 없는 필드**가 적혀 있었습니다. 색인이 원본보다 많은 것을 약속하면
> 중개인이 입력란을 찾다가 없다는 것을 발견합니다.
>
> 🔴 **v0.4까지 아래 3종은 이 표에만 있고 `CATALOG_SLOTS`에 정의가 없었습니다.**
> "상세 정의는 `CATALOG_SLOTS.md`" 라고 가리켰는데 가리키는 곳이 비어 있었습니다.
> 걸린 자산이 상가주택 · 다가구 · 다세대 · 오피스텔 · 지식산업센터 · 근린상가 ·
> 호텔 · 생활형숙박시설로, **근린상가와 지식산업센터는 30억~500억 밴드의 주력**입니다.
> 중개인은 무엇을 입력해야 하는지 알 수 없었고, IM은 구분소유 구조를 서술할 수 없었습니다.
>
> **포인터가 있는데 가리키는 곳이 비어 있는 것은 폐기 문서 참조와 같은 실패입니다.**
> v0.5에서 세 Pack의 정의를 `CATALOG_SLOTS` §3.6~3.8에 신설했습니다.

---

## 8. 값 추가 절차

새 값이 필요하면 **이 문서를 먼저 고칩니다.** 코드가 앞서면 정본이 깨집니다.

```
1. 이 문서에 값·코드·소속 축 추가
2. 조합 매트릭스(§4)에 행/열 추가 — 전 셀을 ○/△/✗로 명시
3. BASE_PROFILE(§6)에 행 추가 — 합계 100 검증
4. 필수 Pack이 신규면 CATALOG_SLOTS.md에 슬롯군 등록
5. 법령 분기가 신규면 CATALOG_RULES.md에 규칙 추가
6. src/domain/ontology/enums.ts 반영
7. 검증 시나리오 1건 이상 추가
8. CHANGELOG.md 기재
```

`assetType`은 **추가만 하고 삭제하지 않습니다.** 과거 딜이 참조하고 있으며, PublishRecord가 버전을 Pin해도 enum 자체가 사라지면 역직렬화가 깨집니다. 폐기할 값은 `deprecated: true` 플래그로 신규 선택만 막습니다.

---

## 9. 참고

| 주제 | 정본 |
|---|---|
| 3축 모델 근거 · 층위 · 포스처 계약 · 등급 | `ONTOLOGY_V0.5_SPEC.md` |
| 임대차 법령 분기 · **아키타입 정의** | `CATALOG_RULES.md` §1 · §2.1 |
| 슬롯 정의 · Pack | `CATALOG_SLOTS.md` §2~§3 |
| 어휘 · 라벨 규칙 | `CATALOG_LEXICON.md` §7 |
| 법령 원문 | [건축법 시행령 별표1 용도별 건축물의 종류](https://law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1000616634) |

> **`ONTOLOGY_IMPLEMENTATION_GAP.md` 는 폐기 문서입니다.** 참고로 읽을 수는 있으나
> 규칙의 소유자가 아닙니다.
