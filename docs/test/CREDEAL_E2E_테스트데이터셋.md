---
title: CREDEAL E2E 테스트 데이터셋
description: 딜카드, 모바일 IM, PPTX IM 생성 검증용 통합 입력자료
ontology_version: v0.4.0
date: 2026-08
status: internal-test-data
---

# CREDEAL

## E2E 테스트 데이터셋

딜카드 · 모바일 IM · PPTX IM 생성 검증용 통합 입력자료

실매물 5건 + 가상 골든 1건 · 표준/정밀 2모드

온톨로지 v0.4.0 · 2026년 8월

> ※ 정밀 모드 데이터 중 ◆ 표시 항목은 테스트용 가상 증강입니다.

실제 물건 정보와 다를 수 있으며 대외 배포용이 아닙니다.

# 1. 이 문서의 용도

CREDEAL의 산출물 3종이 동일 입력에서 일관되게 생성되는지 확인하기 위한 입력 데이터셋입니다.

```text
입력 (이 문서)                    산출물
─────────────────────────────────────────────
메모 (자유 서술)          ──▶     딜카드      블라인드 티저
바텀시트 (구조화 JSON)             모바일 IM   Basic 3문+4접기 / Pro 9문
                                  PPTX IM     Basic 10p / Pro 24p
```

## 1.1 두 모드

| 모드 | 무엇인가 | 검증 대상 |
| --- | --- | --- |
| 표준 | 실제 IM에서 확인 가능한 정보만 | 결손이 있는 상태에서의 등급·게이트 동작 |
| 정밀 | 표준 + 가상 증강 ◆ | 전 항목이 채워졌을 때의 계산·편성 |

> ※ 표준 모드는 대부분 C 등급입니다. 이것이 실무 IM의 실제 수준이며, 등급 게이트가 무엇을 막는지 확인하는 것이 목적입니다.

## 1.2 이 데이터셋이 검증하는 것

| 구분 | 항목 |
| --- | --- |
| 관점 분기 | income 3건 · development 2건 · operating 1건 — 관점별 편성이 실제로 달라지는가 |
| Pack 동작 | development_plan · vacate_plan · permit_risk · hospitality_spec · residential_spec · sectional_spec |
| 법령 분기 | T-C(상가) 4건 · T-R(주택) 1건 — 갱신요구권 10년 대 4년 |
| 등급 게이트 | D등급 1건(발행 차단) · C등급 3건 · B등급 다수 |
| 오류 방지 | C19 층별 합계 · C22 가정 표기 · C30 지분합 · C32 공동담보 중복 |
| 실무 관행 | 용적률 2기준 · 다필지 · 제척 · 구분등기 |

# 2. 커버리지 매트릭스

## 2.1 물건 개요

| # | 물건 | 작성 | 유형 | 관점 | 매각가 | 등급 (표준→정밀) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 잠원동 26-14·16 두원빌딩 | 제이에스 | 근생빌딩 | 개발형 | 약 242억 | 72.67 B → 81.75 B |
| 2 | 당산동5가 11-47 근생빌딩 | 제이에스 | 근생빌딩 | 임대수익형 | 115억 | 64.59 C → 83.30 B |
| 3 | 수택동 419-19 외 2필지 | 제이에스 | 나대지 | 개발형 | 89억 | 44.70 C → 83.25 B |
| 4 | 양평동4가 117 더레드빌딩 | Genesis | 사무용빌딩 | 임대수익형 | 250억 | 52.35 C → 79.25 B |
| 5 | 에이치에비뉴호텔 (이대점) | Genesis | 호텔 | 운영형 | 300억 | 4.58 D → 79.90 B |
| 6 | 연남동 000-12 상가주택 | (가상 · v0.4 골든) | 상가주택 | 임대수익형 | 42억 | 정밀만 → 76.57 B |

> ※ 6번 연남동은 실물건이 아니라 v0.4 신규 기능(주택임대차·구분등기·용도혼합) 검증용으로 만든 골든 데이터입니다.

## 2.2 기능 커버리지

| 검증 항목 | 해당 물건 | 규칙·근거 |
| --- | --- | --- |
| 3축 분류 | 전 건 | 법정용도 × 시장유형 × 투자관점 |
| 관점별 편성 | 1·3(개발) / 2·4·6(수익) / 5(운영) | 히어로·문(問) 구성이 달라지는가 |
| 다필지 | 1(2필지) · 3(3필지) · 4(3필지) | 배열 슬롯 · 유효 대지면적 |
| 제척 | 1(가상) · 3(도로 9.8㎡) | P01 · P03 |
| 용적률 2기준 | 1(247.0/329.9) · 2(221.8/284.4) · 4(398.8/480.2) | §16.1 병기 강제 |
| 구분등기 | 2 · 6 | sectional_spec · C30 지분합 |
| 공동담보 | 2 · 6 | C32 그룹당 1회 합산 |
| 주택임대차 | 6 (3·4층) | T-R-03 갱신 4년 · 묵시적 갱신 |
| 운영 자산 | 5 | hospitality_spec · C31 GOP 기준 |
| 등급 차단 | 5 (표준 4.58 D) | G7 발행 차단 · 부족 항목 안내 |
| 가정 확정화 | 3 (1,260% 용적률) | C22 · 전제 조건 표기 |
| 법정 상한 초과 | 2 (401호 +17.7%) | T-C-05 · 인상 계획 검증 |

# 3. 공통 규약

## 3.1 3축 분류 (온톨로지 v0.4)

| 축 | 값 | 결정하는 것 | 입력 방법 |
| --- | --- | --- | --- |
| buildingUse | 건축법 별표1 · 29종 | 적용 임대차법 · 용도변경 | 건축물대장 자동 |
| assetType | 시장 유형 · 17종 | Pack 슬롯군 · 비교사례 | 중개인 선택 |
| investmentPosture | 투자 관점 · 5종 | 가치 지표 · IM 편성 | 중개인 선택 (기본값 없음) |

## 3.2 provenance 5단계

| 표기 | 의미 | 가중 |
| --- | --- | --- |
| ✓ 공부확인 | 공적 장부에서 확인 | 1.00 |
| ★ 전문가검증 | 전문가 확인 | 0.95 |
| ▲ 매도인고지 | 매도인 진술 | 0.65 |
| ● 중개인입력 | 중개인 확인·입력 | 0.60 |
| ◇ AI추정·가정 | 가정값 · 시나리오 | 0.30 |

> ※ 파생값은 입력 중 가장 약한 출처를 따릅니다. 시나리오 지표는 입력이 전부 공부여도 항상 ◇ 입니다 (C22).

## 3.3 바텀시트 공통 필드

```json
{
  "meta": {
    "docNo":  "IM-YYYY-NNNN",
    "tier":   "basic" | "pro",
    "ontologyVersion": "v0.4.0",
    "buildingUse": "...",          // 3축 ①
    "assetType":   "...",          // 3축 ②
    "posture":     "...",          // 3축 ③
    "leaseMode":   "standard" | "precise",
    "broker": { "org": "...", "name": "..." }
  },
  "deal":     { "assetName", "address", "askingPrice", "priceProvenance" },
  "land":     { "parcels[]", "ledgerArea", "exclusions[]", "effectiveArea", "useArea" },
  "building": { "buildingArea", "grossArea", "aboveGroundArea", "floors[]" },
  "leaseRoll":{ "mode", "units[]" | "summaryOnly" },
  "location": { "stations[]", "roads[]", "commercialCharacter" }
}
```

## 3.4 ⚠ 원본 바텀시트는 구버전 스키마입니다

이 문서의 물건 1~5 바텀시트는 v0.2~v0.3 시점에 작성되어 3축 필드가 없습니다. 그대로 투입하면 현재 온톨로지에서 파싱되지 않습니다.

각 물건 섹션의 「v0.4 meta 변환」 블록으로 meta를 교체한 뒤 사용하십시오. 나머지 필드(land · building · leaseRoll)는 그대로 유효합니다.

| 구버전 | v0.4 | 비고 |
| --- | --- | --- |
| assetType: "retail_building" | assetType: "nbhd_building" | 시장 유형 17종으로 재정의 |
| assetClass: "income" | posture: "income" | 자산군 → 투자 관점 |
| assetClass: "land" | assetType: "bare_land" + posture: "development" | 유형과 관점을 분리 |
| assetClass: "hospitality" | assetType: "hotel" + posture: "operating" | 동일 |
| (없음) | buildingUse | 건축물대장에서 신규 수집 |

> ※ 매핑 근거는 ONTOLOGY_V0.4_SPEC.md §7 · ONTOLOGY_IMPLEMENTATION_GAP.md §1.

# 4. 물건 1 — 잠원동 26-14·16 두원빌딩

## 식별 · 3축 분류

| 항목 | 값 |
| --- | --- |
| 작성 법인 | 제이에스부동산중개(주) |
| 법정 용도 | 제2종근린생활시설 |
| 물건 유형 | 근생빌딩 |
| 투자 관점 | 개발형 (development) |
| 아키타입 | 신축 부지 |
| 매각 희망가 | 약 242억 |
| 자료등급 | 표준 72.67 B → 정밀 81.75 B |
| 필요 Pack | development_plan · vacate_plan |
| 특기 | 2필지 · 명도 조건 · 지상 연면적 기준 용적률 247.0% |

## 표준 모드 — 메모

중개인이 현장에서 말하듯 적은 원문입니다. 메모 파싱의 입력입니다.

```text
[2026-04-12 현장]
 
강남대로 바로 이면. 신사역 4분, 논현역 7분 걸어서 재봤고 실제로 그 정도 나온다.
간장게장 골목이 바로 옆이라 주말에도 사람이 끊이지 않는 자리. 업무·상업·주거가
섞여 있어서 주 7일 상권이라고 봐도 된다.
 
이면 교차 골목 코너부고 바로 앞에 싸리재 소공원(약 377평)이 있다. 이게 크다.
공원 쪽으로 전면이 열려 있어서 시인성이 좋고, 신축하면 저층부 F&B 집객이 확실히
달라질 자리다.
 
건물은 1990년 준공이라 많이 낡았다. 승강기가 기존 남자화장실 자리에 소형으로
끼워 넣은 거라 2층부터만 운행하고 4~5인 타면 꽉 찬다. 주차리프트는 지금 안 쓰고
있는데 돌리려면 용량·크기 증설이 사실상 필요하다. 공간 효율이 나쁘다.
→ 리모델링보다 신축이 맞는 물건.
 
임차인이 여럿 있는데 매도인이 명도해서 넘기는 조건이라 매수자가 신축 부담 없이
들어올 수 있다. 이게 이 물건의 제일 큰 장점.
 
가격은 토지 평당 1.3억. 반경 150m 안에서 강남대로 배후 일면부가 1.7~2.3억,
안쪽 이면부가 1.1~1.6억 나오는데 본 자산은 일면부 성격인데도 이면부 하단 가격이다.
명도비까지 포함된 확정가라 실질적으로는 더 싸다고 봐야 한다.
 
호재 두 개 — 경부고속도로 지하화 논의, 위례-신사선 예타 통과. 둘 다 확정 단계는
아니지만 방향은 잡혔다.
 
신축은 지하1~지상6층으로 근생·의원·업무 복합으로 보고 있다. 서울시 소규모 건축물
한시적 용적률 상향 대상이라 250% 미만으로 잡으면 된다.
```

## v0.4 meta 변환  ⚠ 투입 전 교체

아래 원본 바텀시트의 meta는 구버전입니다 (assetType: "retail_building" · ontologyVersion "v0.2.0"). 이 블록으로 교체한 뒤 투입하십시오.

```text
"meta": {
  "ontologyVersion": "v0.4.0",
  "buildingUse": "nbhd_2",
  "assetType":   "nbhd_building",
  "posture":     "development",
  "leaseMode":   "standard",
  "tier":        "basic"
}
```

## 표준 모드 — 바텀시트  (원본 · 구버전 meta)

```json
{
  "meta": {
    "docNo": "IM-2604-0087",
    "tier": "pro",
    "leaseMode": "not_applicable",
    "ontologyVersion": "v0.2.0",
    "issuedAt": "2026-04-12",
    "broker": { "name": "이석", "org": "히트리얼티 부동산중개", "license": "서초-00000" }
  },
  "deal": {
    "assetName": "두원빌딩",
    "address": "서울특별시 서초구 잠원동 26-14, 26-16",
    "assetType": "retail_building",
    "askingPrice": 24226800000,
    "priceProvenance": "seller",
    "handoverCondition": "vacate_by_seller",
    "vacateCostIncluded": true
  }
}
```

## 정밀 모드 — 증분 메모  ◆

표준 대비 추가 확인된 내용입니다. ◆ 표시 항목은 테스트용 가상 증강입니다.

```text
[2026-04-12 현장 · 2026-04-18 매도인 면담 · 2026-04-25 임차인 현황 확인]
 
── 입지 (표준 메모와 동일 내용은 생략) ──
 
강남대로 바로 이면, 신사역 4분 논현역 7분. 이면 교차 골목 코너부, 앞에 싸리재
소공원 377평. 공원 전면이 열려 있어 신축 시 저층부 F&B 집객이 확실히 달라진다.
 
── 건물 상태 ──
 
1990년 준공. 승강기는 기존 남자화장실 자리에 소형으로 끼워 넣은 것이라 2층부터만
운행하고 실제 4~5인. 주차리프트(2,000kg)는 현재 미가동, 돌리려면 용량·크기 증설이
현실적으로 필요하다. 화장실은 성별 복층 구분 구조.
 
전기 수전설비와 급배수는 육안으로도 노후가 보인다. 신축 전제라 실사 우선순위는
낮지만, 명도 지연으로 보유 기간이 길어지면 유지비가 든다.
 
── 임차 현황 (매도인 제공 + 현장 확인) ◆ ──
 
지하부터 5층까지 11개 호실. 매도인이 명도해서 넘기는 조건이고 명도비는 매가에
포함돼 있다. 다만 매수자 입장에서 중요한 건 "언제" 끝나느냐다.
 
합의 완료 2호실 — B102 창고(2015년 계약, 갱신권 소진), 401 사무소(2016년 계약).
이 둘은 갱신요구권이 이미 지나 명도가 어렵지 않다.
 
협의 중 4호실 — B101 주점, 103 부동산중개, 201 일반음식점, 302 의원.
 
미협의 5호실이 문제다. 특히 —
  · 102 휴게음식점: 2023년 11월 최초 계약. 갱신요구권 7.3년 남았다.
    갱신 요구하면 법정 사유 없이 못 막는다.
  · 301 사무소: 2024년 2월 계약. 7.6년 남음.
  · 101 소매점: 2022년 9월. 6.1년 남음.
 
1층 F&B·소매는 권리금 문제도 붙는다. 환산보증금이 전부 9억 이하라 상가임대차보호법
전면 적용 대상이고, 권리금 회수기회 보호는 환산보증금과 무관하게 적용된다.
 
매도인은 "6개월이면 끝난다"고 하는데 내 판단으로는 1F 3개 호실과 3F 사무소가
변수다. 최악의 경우 1년 이상 걸릴 수 있다고 봐야 한다.
 
── 권리 관계 ◆ ──
 
선순위 근저당 채권최고액 96억, 매도인이 말하는 실 잔액은 약 78억. 잔금 시 전액
상환·말소 조건이다. 가압류·가처분은 없다. 실 잔액은 매도인 진술이라 잔액증명
받아야 한다.
 
── 토지 ◆ ──
 
26-16 필지(104.4㎡)에 9M 도로 확폭 계획이 걸려 있다. 토지이용계획도 판독으로
약 12.5㎡ 저촉으로 보인다. 관할 구청 확인 필요.
 
이게 걸리면 유효 대지가 603.6㎡로 줄고, 신축 산정 용적률이 249% → 254%가 되어
"소규모 건축물 한시적 용적률 상향" 250% 미만 조건에서 벗어난다. 설계 전에 반드시
확인해야 한다. 이 한 가지로 사업 구조가 바뀐다.
 
── 가격 ──
 
토지 평당 1.3억. 반경 150m 배후 일면부 1.7~2.3억 / 안쪽 이면부 1.1~1.6억.
본 자산은 일면부 성격인데 이면부 하단 가격이다. 명도비 포함 확정가.
```

## 정밀 모드 — 증분 바텀시트  ◆

```json
{
  "archetype": {
    "primary": "DEVELOPMENT",
    "secondary": ["CORNER_UNDERVALUED"],
    "rationale": "건물연령 36년 ∧ 명도 조건 ∧ 용적률 상향 대상 → 신축 전제"
  },
  "disclosurePolicy": {
    "dcf": "hidden",
    "irr": "hidden",
    "sensitivity": "hidden",
    "capRateBases": ["broker_equity", "noi_price"]
  }
}
```

```json
{
  "land": {
    "parcelCount": 2,
    "ledgerArea": 616.1,
    "exclusions": [],
    "effectiveArea": 616.1,
    "useArea": "제2종일반주거지역",
    "roadAccess": "코너(교차 골목) · 10M × 9M",
    "orientation": "남동향"
  },
  "building": {
    "unitCount": 1,
    "grossArea": 2032.59,
    "farCountedArea": 2006.1,
    "aboveGroundArea": 1521.6,
    "floors": "지하 1층 ~ 지상 5층",
    "approvalDate": "1990-11-08",
    "structure": "철근콘크리트",
    "mainUse": "근린생활시설",
    "buildingCoverage": 49.76,
    "farLedger": 325.6,
    "farAboveGround": 247.0,
    "parking": 12,
    "elevator": { "count": 1, "note": "2층부터 운행 · 4~5인 소형" },
    "violationFlag": false
  }
}
```

```json
{
  "zoning": [
    { "category": "use_area",  "name": "제2종일반주거지역", "source": "public" },
    { "category": "other_law", "name": "대공방어협조구역",   "source": "public" },
    { "category": "other_law", "name": "과밀억제권역 (수도권정비계획법)", "source": "public" },
    { "category": "other_law", "name": "토지거래계약 허가구역",
      "source": "public",
      "note": "주거 관련 지정(2026-12-31까지). 본 자산은 해당사항 없음 — 세부 조례 별도 확인" }
  ],
  "specialNotes": [
    "본 자산 단독개발 가능",
    "서울시 소규모 건축물 한시적 용적률 상향 대상 — 250% 미만 신축 가능"
  ]
}
```

```json
{
  "location": {
    "stations": [
      { "name": "신사역", "lines": ["3호선", "신분당선"], "walkMinutes": 4, "provenance": "broker" },
      { "name": "논현역", "lines": ["7호선"], "walkMinutes": 7, "provenance": "broker" }
    ],
    "arterialAccess": ["올림픽대로", "강변북로", "한남IC", "한남대교"],
    "nearbyAmenity": { "name": "싸리재 소공원", "area": 377, "unit": "평" },
    "commercialCharacter": "업무·상업·주거 혼재 · 주7일 상권 · 간장게장 골목 인접"
  }
}
```

```json
{
  "developmentPlan": {
    "targetUse": "근생 · 의원 · 업무시설",
    "scale": "지하 1층 ~ 지상 6층",
    "structure": "철근콘크리트",
    "farCountedArea": 1534,
    "grossArea": 2030,
    "buildingCoverage": 50.0,
    "far": 249.0,
    "elevator": 1,
    "parking": 14,
    "parkingType": "자주식 + 주차타워",
    "stackingPlanRef": "xlsx!04_스태킹플랜",
    "costRef": "xlsx!05_투입비용",
    "targetDate": "2028-H1"
  }
}
```

## 이 물건이 검증하는 규칙

| 규칙 | 기대 동작 |
| --- | --- |
| P01 | 유효 대지면적 |
| P03 | 제척 영향도 |
| C23 | 신축 용적률 상한 |
| C24 | 명도 기간 |
| L16 | 개발형 편성 |

# 5. 물건 2 — 당산동5가 11-47 근생빌딩

## 식별 · 3축 분류

| 항목 | 값 |
| --- | --- |
| 작성 법인 | 제이에스부동산중개(주) |
| 법정 용도 | 제2종근린생활시설 |
| 물건 유형 | 근생빌딩 |
| 투자 관점 | 임대수익형 (income) |
| 아키타입 | R-INC-02 임대료 정상화형 |
| 매각 희망가 | 115억 |
| 자료등급 | 표준 64.59 C → 정밀 83.30 B |
| 필요 Pack | sectional_spec |
| 특기 | 층별 구분등기 · 연면적 300㎡ 오기 · 401호 인상 계획 법정 상한 초과 |

## 표준 모드 — 메모

중개인이 현장에서 말하듯 적은 원문입니다. 메모 파싱의 입력입니다.

```text
[2025-05 현장]
 
당산역(2호선/9호선) 도보 5분. 배후에 아파트 단지가 밀집해 있어 상권 배후가 두껍다.
국회대로·올림픽대로 접근이 좋고, 영등포구청·국회의사당 권역이라 유동도 안정적이다.
 
2002년 준공인데 관리 상태가 깨끗하다. 로비·복도·EV 다 손볼 데가 없다.
자주식 8대 주차에 전면 도로도 넉넉하다.
 
임차 구성이 이 물건의 핵심이다. 로뎀나무내과가 1F·2F·5F를 쓰고, 1F에 고은약국이
붙어 있다. 병원+약국 조합이라 공실 리스크가 낮고 회전이 없다.
3F 헬쓰장, 4F 국제와인. B1은 데이르 카페인데 소유주 자가 사용이고, 4F 일부도 자가다.
 
문제는 임대료다. 약국·내과는 11년째 인상이 없었다. 현재 월세 총 1,946만원인데
기준층(3F) 단가 62.4천원/평에 맞춰 재산정하면 2,867만원까지 올라간다. 47% 차이다.
 
자가 사용분 두 곳(B1 전체, 4F 일부)을 임대로 돌리는 것만으로도 상당 부분 채워진다.
매입 후 임대료 현실화를 전제로 보면 기대 수익률 연 3.1%.
 
토지 평당 75백만원. 인근 조사해보니 입지·부지 양호한 건 130~160백만원,
불리한 건 85~100백만원 선이다. 우리 물건은 그 아래다. 가격 경쟁력이 확실하다.
 
준공업지역인데 서울시가 2024년 10월에 제도개선 방안을 냈다. 지구단위계획 수립 시
주거용도 용적률 400%까지, 준주거/3종일반주거로 용도지역 변경도 추진 중이다.
현 용적률이 221.8%(지상 기준)라 여유가 크다.
 
등기가 층별구분등기다. 소유주가 형제 두 분인데 전체 매각에 두 분 다 동의하셨다.
```

## v0.4 meta 변환  ⚠ 투입 전 교체

아래 원본 바텀시트의 meta는 구버전입니다 (assetClass: "income" · ontologyVersion "v0.3.0"). 이 블록으로 교체한 뒤 투입하십시오.

```text
"meta": {
  "ontologyVersion": "v0.4.0",
  "buildingUse": "nbhd_2",
  "assetType":   "nbhd_building",
  "posture":     "income",
  "leaseMode":   "standard",
  "tier":        "basic"
}
```

## 표준 모드 — 바텀시트  (원본 · 구버전 meta)

```json
{
  "meta": {
    "docNo": "IM-2505-0031",
    "tier": "pro",
    "assetClass": "income",
    "leaseMode": "standard",
    "ontologyVersion": "v0.3.0",
    "issuedAt": "2025-05-15",
    "broker": { "org": "제이에스부동산중개법인" }
  },
  "deal": {
    "assetName": "당산동 근생빌딩",
    "address": "서울특별시 영등포구 당산동5가 11-47",
    "assetType": "retail_building",
    "askingPrice": 11500000000,
    "priceProvenance": "seller",
    "handoverCondition": "succeed"
  }
}
```

## 정밀 모드 — 증분 메모  ◆

표준 대비 추가 확인된 내용입니다. ◆ 표시 항목은 테스트용 가상 증강입니다.

```text
[2025-05 현장 · 2025-05 매도인 면담 · 2025-05 임대차 확인]
 
── 입지·건물 (표준 메모와 동일 내용 생략) ──
 
당산역 도보 5분, 배후 아파트 밀집. 2002년 준공이나 관리 상태 우수.
자주식 8대, EV 1대. 준공업지역이고 2024년 10월 서울시 제도개선 방안 대상.
 
── 임대료 현실화, 층별로 사정이 다르다 ◆ ──
 
현재 월세 1,946만원. 기준층(3F) 단가 62.4천원/평으로 재산정하면 2,867만원.
47.3% 차이인데, 이걸 다 받아낼 수 있느냐가 관건이다. 호실마다 다르다.
 
먼저 자가 두 곳. B1 데이르 카페(96평)와 4F 일부(25.1평)는 소유주가 직접 쓴다.
이건 신규 계약이라 법적 제약이 없다. 임대 전환만 하면 월 602만원이 바로 붙는다.
가장 확실한 부분이다.
 
약국·내과는 2014년 9월 최초 계약이다. 11년 지났으니 계약갱신요구권 10년이
소진됐다. 임대인이 갱신을 거절할 수 있다는 뜻이고, 신규 계약하면 인상률 상한이
없다. 협상력이 임대인 쪽에 있다.
 
다만 조심할 게 있다. 이 건물의 강점이 병원+약국 조합인데, 갱신 거절로 압박하다
나가버리면 그 강점이 사라진다. 특히 로뎀나무내과는 1F·2F·5F를 다 쓴다.
이 임차인 하나가 전체 월세의 60%다. 잃으면 타격이 크다.
 
3F 헬쓰장과 4F 국제와인은 반대다. 계약이 각각 2021년, 2022년이라 갱신요구권이
5~7년 남았고, 환산보증금도 9억 이하라 상가임대차보호법 전면 적용이다.
갱신 시 5% 상한이 걸린다.
 
특히 국제와인. 계획은 260만 → 306만(17.7% 인상)인데 갱신으로는 못 한다.
5% 올리면 273만이 최대다. 33만원 차이. 만기가 25년 4월 30일로 이미 지났으니
지금쯤 재계약됐거나 나갔을 텐데, 이 부분은 매도인에게 확인해야 한다.
 
── 등기 ◆ ──
 
층별구분등기다. 형제 두 분이 호실을 나눠 갖고 있다.
신현재 씨가 1F 두 호실·2F·5F, 신현우 씨가 3F·4F 두 호실. B1은 공유(각 1/2).
 
대지권 지분 합이 1.0으로 맞는다. 누락 필지는 없다.
 
근저당이 두 건인데 공동담보다. 101·102에 9억, 301·401에 7억. 각각 하나의 채권에
두 호실이 잡힌 거라 합치면 16억이지 32억이 아니다. 매도인 말로는 실 잔액이
13억쯤 된다는데 잔액증명 받아야 한다.
 
전체 매각은 두 분 다 동의하셨다. 다만 구분등기라 마음만 먹으면 일부 층만
따로 팔 수도 있다는 점은 매수자가 알아야 한다.
```

## 정밀 모드 — 증분 바텀시트  ◆

```json
{
  "archetype": {
    "primary": "RENT_NORMALIZATION",
    "secondary": ["VALUE_ADD"],
    "rationale": "현 임대료가 기준단가 대비 68% 수준 ∧ 11년간 인상 없음 → 정상화 여력 47.3%"
  },
  "disclosurePolicy": {
    "dcf": "hidden",
    "irr": "hidden",
    "sensitivity": "hidden",
    "capRateBases": ["broker_equity", "noi_price"]
  }
}
```

```json
{
  "land": {
    "parcelCount": 1,
    "ledgerArea": 506.8,
    "exclusions": [],
    "effectiveArea": 506.8,
    "jimok": "대",
    "useArea": "준공업지역"
  },
  "building": {
    "unitCount": 1,
    "buildingArea": 263.01,
    "buildingCoverage": 51.9,
    "grossArea": 1441.15,
    "aboveGroundArea": 1123.93,
    "farAboveGround": 221.8,
    "farTotal": 284.4,
    "floors": "지하 1층 ~ 지상 5층",
    "approvalYear": 2002,
    "parking": { "type": "자주식", "count": 8 },
    "elevator": 1,
    "condition": "양호 — 관리 상태 우수"
  }
}
```

```json
{
  "zoning": [
    { "category": "use_area", "name": "준공업지역", "source": "public",
      "note": "건폐율 60% · 용적률 400% (주거용도 등 250%)" }
  ],
  "catalysts": [
    { "name": "서울시 준공업지역 제도개선 방안 (2024.10)",
      "detail": "지구단위계획 수립 시 주거용도 용적률 상한 400% · 준주거/3종일반주거 용도지역 변경 추진",
      "status": "추진 중",
      "provenance": "public" }
  ]
}
```

```json
{
  "location": {
    "stations": [
      { "name": "당산역", "lines": ["2호선", "9호선"], "walkMinutes": 5, "provenance": "broker" }
    ],
    "arterialAccess": ["국회대로", "올림픽대로", "서부간선도로", "경인로"],
    "commercialCharacter": "배후 아파트 밀집 · 상권 배후 풍부",
    "landmarks": ["국회의사당", "영등포구청", "영등포역"]
  }
}
```

```json
{
  "leaseRoll": {
    "mode": "standard",
    "unitCount": 8,
    "ownerOccupiedCount": 2,
    "source": "xlsx!02_현재임대차",
    "summary": {
      "totalArea": 1441.15,
      "totalDeposit": 290000000,
      "totalMonthlyRent": 19460000,
      "annualRent": 233520000
    },
    "provenance": "broker"
  },
  "rentNormalizationPlan": {
    "baseUnitRate": 62400,
    "baseUnitRateBasis": "3F 기준층",
    "depositYieldAssumption": 0.05,
    "source": "xlsx!03_임대료현실화",
    "summary": {
      "totalDeposit": 370000000,
      "totalMonthlyRent": 28670000,
      "increaseRate": 0.473
    },
    "expectedYield": 0.0309,
    "expectedYieldBasis": "broker_equity"
  }
}
```

## 이 물건이 검증하는 규칙

| 규칙 | 기대 동작 |
| --- | --- |
| T-C-01 | 환산보증금 |
| T-C-05 | 5% 상한 |
| C32 | 공동담보 중복 |
| C19 | 층별 합계 |
| L17 | 정상화 편성 |

# 6. 물건 3 — 수택동 419-19 외 2필지

## 식별 · 3축 분류

| 항목 | 값 |
| --- | --- |
| 작성 법인 | 제이에스부동산중개(주) |
| 법정 용도 | (없음 · 나대지) |
| 물건 유형 | 나대지 |
| 투자 관점 | 개발형 (development) |
| 아키타입 | 신축 부지 |
| 매각 희망가 | 89억 |
| 자료등급 | 표준 44.70 C → 정밀 83.25 B |
| 필요 Pack | development_plan · permit_risk |
| 특기 | 3필지 · 도시계획도로 저촉 9.8㎡ · 지구단위계획 전제 미고지 |

## 표준 모드 — 메모

중개인이 현장에서 말하듯 적은 원문입니다. 메모 파싱의 입력입니다.

```text
[현장]
 
경기도 구리시 수택동 419-19, 419-12, 419-96. 세 필지 합쳐 651.2㎡(196.98평).
현재 나대지다. 건물이 없으니 바로 개발 들어갈 수 있다.
 
구리역까지 380m, 걸어서 5분. 경의중앙선에 8호선 별내선이 들어와서 역 이용객이
하루 3만 명이다. 준역세권으로 봐야 한다.
 
상권은 구리전통시장 안골로다. 생활형 소비 중심의 지역상권이고 먹자골목이 붙어 있다.
평일 저녁이나 주말에 사람이 꽤 몰린다.
 
도로는 12m, 6m, 4m 세 면이 접한다. 삼면 접도라 건축 자유도가 높고, 코너 효과도 있다.
바로 옆에 오피스텔이 서 있어서 개발 선례도 있다.
 
용도지역이 도시지역 상업지역이다. 1,260%까지 용적률을 받으면 2,500평 규모가 나온다.
저층에 상가, 중층에 오피스텔, 상층에 업무·주거를 얹는 복합개발을 추천한다.
랜드마크로 만들 수 있는 자리다.
 
매매가 89억, 평당 4,500만원.
```

## v0.4 meta 변환  ⚠ 투입 전 교체

아래 원본 바텀시트의 meta는 구버전입니다 (assetClass: "land" · ontologyVersion "v0.3.0"). 이 블록으로 교체한 뒤 투입하십시오.

```text
"meta": {
  "ontologyVersion": "v0.4.0",
  "buildingUse": null,
  "assetType":   "bare_land",
  "posture":     "development",
  "leaseMode":   "standard",
  "tier":        "basic"
}
```

## 표준 모드 — 바텀시트  (원본 · 구버전 meta)

```json
{
  "meta": {
    "docNo": "IM-XXXX-XXXX", "tier": "pro",
    "assetClass": "land", "ontologyVersion": "v0.3.0",
    "broker": { "org": "제이에스부동산중개주식회사", "name": "차상혁" }
  },
  "deal": {
    "assetName": "수택동 419-19 외 2필지",
    "address": "경기도 구리시 수택동 419-19, 419-12, 419-96",
    "askingPrice": 8900000000,
    "priceProvenance": "seller",
    "currentUse": "나대지"
  },
  "land": {
    "parcelCount": 3,
    "ledgerArea": 651.2,
    "exclusions": [],
    "effectiveArea": 651.2,
    "jimok": "대",
    "useArea": "도시지역·상업지역",
    "roadAccess": { "faces": 3, "widths": [12, 6, 4] }
  },
  "building": null,
  "leaseRoll": { "state": "not_applicable", "reason": "나대지" },
  "developmentPlan": {
    "targetFAR": 12.60,
    "targetGrossArea": 8205,
    "proposedUse": "저층 상가 / 중층 오피스텔 / 상층 업무·주거 복합",
    "recommendation": "오피스텔 부지",
    "provenance": "broker"
  },
  "location": {
    "stations": [
      { "name": "구리역", "lines": ["경의중앙선", "8호선 별내선"],
        "distanceM": 380, "walkMinutes": 5, "dailyUsers": 30000, "provenance": "broker" }
    ],
    "commercialCharacter": "구리전통시장 안골로 — 생활형 소비 중심 지역상권 · 먹자골목 인접"
  }
}
```

## 정밀 모드 — 증분 메모  ◆

표준 대비 추가 확인된 내용입니다. ◆ 표시 항목은 테스트용 가상 증강입니다.

```text
[정밀 · 추가 확인 사항]
 
필지별로 면적을 확인했다. 419-19가 412.5㎡로 가장 크고, 419-12가 158.3㎡,
419-96이 80.4㎡다. 합 651.2㎡.
 
그런데 419-12에 도시계획도로가 걸린다. 토지이용계획도를 보면 9.8㎡ 정도 저촉으로
보인다. 관할 구청 확인이 필요하다. 이게 걸리면 유효 대지가 641.4㎡로 줄고,
개발 가능 연면적이 1.5% 빠진다.
 
용적률 1,260% 얘기를 조심해서 해야 한다. 상업지역 법정 상한을 넘는 수치라
지구단위계획을 수립해야 나온다. 절차만 18개월 잡아야 하고, 그 과정에서 기부채납
조건이 붙을 수도 있다. 확정 전에 2,500평을 숫자로 못 박으면 안 된다.
 
연면적 2,500평이면 교통영향평가 대상이다. 6개월 더 본다.
 
인근 실거래를 세 건 확인했다. 나대지 142평이 61억(평당 4,296만), 구축 철거 전제
188평이 88억(평당 4,681만), 도로 2면 221평이 95억(평당 4,299만).
우리 물건은 평당 4,518만원인데 삼면 접도라는 걸 감안하면 적정하거나 약간 낮다.
```

## 정밀 모드 — 증분 바텀시트  ◆

```json
{
  "land": {
    "parcels": [
      { "jibun": "구리시 수택동 419-19", "area": 412.5, "exclusions": [] },
      { "jibun": "구리시 수택동 419-12", "area": 158.3,
        "exclusions": [{ "kind": "planned_road", "area": 9.8, "affectsFAR": true,
                         "provenance": "broker", "note": "토지이용계획도 판독 — 구청 확인 필요" }] },
      { "jibun": "구리시 수택동 419-96", "area": 80.4, "exclusions": [] }
    ],
    "ledgerArea": 651.2,
    "excludedArea": 9.8,
    "effectiveArea": 641.4
  },
  "developmentScenarios": [
    { "far": 8.00,  "grossAreaPy": 1552, "landCostPerPy": 5733867 },
    { "far": 10.00, "grossAreaPy": 1940, "landCostPerPy": 4587094 },
    { "far": 12.60, "grossAreaPy": 2445, "landCostPerPy": 3640551, "isTarget": true },
    { "far": 15.00, "grossAreaPy": 2910, "landCostPerPy": 3058063 }
  ],
  "permitRisk": {
    "items": [
      { "kind": "district_unit_plan", "status": "constraint", "estimatedMonths": 18,
        "note": "용적률 1,260% 확보의 필수 절차 — 임계 경로" },
      { "kind": "traffic_impact", "status": "check_required", "estimatedMonths": 6 },
      { "kind": "development_permit", "status": "clear", "estimatedMonths": 2 },
      { "kind": "contribution", "status": "check_required", "estimatedMonths": null,
        "note": "지구단위계획 조건에 따라 발생 가능" }
    ],
    "totalEstimatedMonths": 18
  },
  "acquisitionCost": {
    "price": 8900000000, "acquisitionTax": 409400000,
    "brokerageFee": 80100000, "registrationLegal": 20000000,
    "appraisalDueDiligence": 15000000, "totalAcquisitionCost": 9424500000
  }
}
```

## 이 물건이 검증하는 규칙

| 규칙 | 기대 동작 |
| --- | --- |
| P01 | 유효 대지면적 |
| C22 | 시나리오 가정 표기 |
| C25 | 접도 폭 |
| L18 | 대지 편성 |
| G11 | 하방 시나리오 |

# 7. 물건 4 — 양평동4가 117 더레드빌딩

## 식별 · 3축 분류

| 항목 | 값 |
| --- | --- |
| 작성 법인 | Genesis Asset |
| 법정 용도 | 업무시설 |
| 물건 유형 | 사무용빌딩 |
| 투자 관점 | 임대수익형 (income) |
| 아키타입 | R-INC-01 초안정형 |
| 매각 희망가 | 250억 |
| 자료등급 | 표준 52.35 C → 정밀 79.25 B |
| 필요 Pack | (Core만) |
| 특기 | 3필지 · 용적률 지상 398.8% / 전체 480.2% · 밸류애드 여지 없음 |

## 표준 모드 — 메모

중개인이 현장에서 말하듯 적은 원문입니다. 메모 파싱의 입력입니다.

```text
[현장]
 
영등포구 양평동4가 117, 134, 125-2번지. 3필지 합쳐 518.7㎡(157평).
선유도역 9호선 4번출구에서 도보 1분. 대로변이고 초역세권이다.
 
2018년 9월 준공. 신축이라 내외관이 아주 수려하다. 손볼 데가 없다.
지하 1층에 지상 10층, 업무시설. 철근콘크리트에 개별 냉난방, 승강기 1대.
주차는 옥외 자주식 1대에 기계식 22대.
 
선유도역 대로변이라 사무실 임차 수요가 풍부하다. 안정적인 임대수익이 기대된다.
현재 지하 1층만 공실이다.
 
보증금 5억 3,500만원, 월 임대료 5,017만원, 관리비 648만원.
매매가 250억, 평당 1억 5,923만원.
 
준공업지역이고 공시지가가 ㎡당 948만 4천원(평당 3,135만원, 2023년 1월 기준)이다.
```

## v0.4 meta 변환  ⚠ 투입 전 교체

아래 원본 바텀시트의 meta는 구버전입니다 (assetClass: "income" · ontologyVersion "v0.3.0"). 이 블록으로 교체한 뒤 투입하십시오.

```text
"meta": {
  "ontologyVersion": "v0.4.0",
  "buildingUse": "office",
  "assetType":   "office_building",
  "posture":     "income",
  "leaseMode":   "standard",
  "tier":        "basic"
}
```

## 표준 모드 — 바텀시트  (원본 · 구버전 meta)

```json
{
  "meta": {
    "docNo": "IM-XXXX-XXXX", "tier": "pro",
    "assetClass": "income", "leaseMode": "standard",
    "ontologyVersion": "v0.3.0",
    "broker": { "org": "Genesis Asset" }
  },
  "deal": {
    "assetName": "더레드빌딩",
    "address": "서울시 영등포구 양평동4가 117, 134, 125-2",
    "askingPrice": 25000000000,
    "priceProvenance": "seller"
  },
  "land": {
    "parcelCount": 3, "ledgerArea": 518.7, "effectiveArea": 518.7,
    "useArea": "준공업지역",
    "officialPricePerSqm": 9484000, "officialPriceDate": "2023-01"
  },
  "building": {
    "buildingArea": 302.94, "buildingCoverage": 58.4,
    "grossArea": 2490.88, "aboveGroundArea": 2068.60,
    "farAboveGround": 398.8, "farTotal": 480.2,
    "floors": "지하 1층 / 지상 10층",
    "approvalDate": "2018-09-12",
    "structure": "철근콘크리트", "mainUse": "업무시설",
    "hvac": "개별식", "elevator": 1,
    "parking": { "outdoor": 1, "mechanical": 22 }
  },
  "leaseRoll": {
    "mode": "standard",
    "summaryOnly": true,
    "totalDeposit": 535000000,
    "totalMonthlyRent": 50170000,
    "totalManagementFee": 6480000,
    "vacancy": "지하 1층",
    "provenance": "broker"
  },
  "location": {
    "stations": [{ "name": "선유도역", "lines": ["9호선"], "exit": "4번",
                   "walkMinutes": 1, "provenance": "broker" }],
    "commercialCharacter": "대로변 · 초역세권 · 사무실 임차수요 풍부"
  }
}
```

## 정밀 모드 — 증분 메모  ◆

표준 대비 추가 확인된 내용입니다. ◆ 표시 항목은 테스트용 가상 증강입니다.

```text
[정밀 · 임대차 확인]
 
층별로 뜯어봤다. 지하 1층 127.7평이 공실이고 지상은 만실이다.
1층은 스타벅스가 55평, 2~10층은 층당 63.4평씩 업무시설이다.
 
임차인 구성이 안정적이다. 디자인 스튜디오, IT 스타트업, 회계법인, 무역업,
온라인 커머스, 컨설팅, 광고대행, 소프트웨어, 투자자문. 업종이 잘 분산돼 있고
한 임차인이 크게 물린 곳이 없다.
 
문제는 임대료를 못 올린다는 거다.
 
첫째, 11개 호실 전원 환산보증금이 9억 이하다. 상가임대차보호법 전면 적용이라
갱신할 때 5% 이상 못 올린다.
 
둘째, 2018년 준공이라 최초 계약이 2018~2022년에 몰려 있다. 갱신요구권이
2~7년씩 남았다. 갱신 거절도 못 한다.
 
셋째, 용적률이 398.8%인데 준공업 상한이 400%다. 여유가 1.2%p뿐이라 증축이 안 된다.
 
넷째, 2018년 신축이라 리모델링할 것도 없다.
 
그러니까 밸류애드 여지가 사실상 없다. 대신 그만큼 안정적이다.
초안정 수익형으로 봐야 한다.
 
유일한 여지가 지하 1층 공실이다. 127.7평인데 평당 5만원만 받아도 월 638만원이다.
현재 월세 5,017만원에서 5,655만원으로 12.7% 오른다.
```

## 정밀 모드 — 증분 바텀시트  ◆

```json
{
  "meta": { "leaseMode": "precise" },
  "leaseRoll": {
    "mode": "precise", "unitCount": 11, "source": "xlsx!P01_임대차정밀",
    "summary": { "totalArea": 753.3, "vacantArea": 127.7, "vacancyRate": 0.170 }
  },
  "leaseLegal": {
    "region": "seoul", "convertedDepositThreshold": 900000000,
    "fullApplicationCount": 10, "partialApplicationCount": 0,
    "note": "전원 환산보증금 9억 이하 — 갱신 시 차임 인상률 5% 상한"
  },
  "archetype": {
    "primary": "CORE_STABLE",
    "rationale": "2018년 신축 ∧ 용적률 여유 1.2%p ∧ 5% 인상 상한 → 밸류애드 여지 없음"
  },
  "valueAddPotential": {
    "farHeadroom": 1.2,
    "rentIncreaseCap": 0.05,
    "buildingAge": 8,
    "onlyOpportunity": {
      "item": "지하 1층 공실 해소",
      "area": 127.7,
      "assumedRentPerPy": 50000,
      "additionalMonthlyRent": 6385000,
      "capImprovement": "2.46% → 2.77%"
    }
  },
  "acquisitionCost": {
    "price": 25000000000, "acquisitionTax": 1150000000,
    "brokerageFee": 225000000, "registrationLegal": 50000000,
    "appraisalDueDiligence": 30000000, "totalAcquisitionCost": 26455000000
  }
}
```

## 이 물건이 검증하는 규칙

| 규칙 | 기대 동작 |
| --- | --- |
| T-C-01 | 환산보증금 11실 |
| T-C-05 | 5% 상한 |
| C16 | Cap Rate basis |
| L15 | DCF 억제 |

# 8. 물건 5 — 에이치에비뉴호텔 (이대점)

## 식별 · 3축 분류

| 항목 | 값 |
| --- | --- |
| 작성 법인 | Genesis Asset |
| 법정 용도 | 숙박시설 |
| 물건 유형 | 호텔 |
| 투자 관점 | 운영형 (operating) |
| 아키타입 | 운영 자산 |
| 매각 희망가 | 300억 |
| 자료등급 | 표준 4.58 D → 정밀 79.90 B |
| 필요 Pack | hospitality_spec |
| 특기 | 2슬라이드 티저 · 표준 모드 발행 불가 · 객실당 3.19억 |

## 표준 모드 — 메모

중개인이 현장에서 말하듯 적은 원문입니다. 메모 파싱의 입력입니다.

```text
[티저 수준]
 
이대역 도보 3분, 신촌 대학가 호텔. 94실, 매각 300억.
 
객실당 3.19억이다. 서울 비즈니스호텔이 통상 2~4억 사이니 중간 정도.
 
더 이상 확인된 게 없다. 운영 지표(ADR·OCC)와 물건 제원을 받아야 IM을 만들 수 있다.
```

## v0.4 meta 변환  ⚠ 투입 전 교체

아래 원본 바텀시트의 meta는 구버전입니다 (assetClass: "hospitality" · ontologyVersion "v0.3.0"). 이 블록으로 교체한 뒤 투입하십시오.

```text
"meta": {
  "ontologyVersion": "v0.4.0",
  "buildingUse": "lodging",
  "assetType":   "hotel",
  "posture":     "operating",
  "leaseMode":   "standard",
  "tier":        "basic"
}
```

## 표준 모드 — 바텀시트  (원본 · 구버전 meta)

```json
{
  "meta": {
    "docNo": "IM-XXXX-XXXX", "tier": "pro",
    "assetClass": "hospitality", "ontologyVersion": "v0.3.0",
    "broker": { "org": "Genesis Asset" }
  },
  "deal": {
    "assetName": "에이치 에비뉴호텔 (이대점)",
    "address": null,
    "askingPrice": 30000000000,
    "priceProvenance": "seller"
  },
  "hospitalitySpec": {
    "keyCount": 94,
    "adr": null, "occupancy": null, "gopMargin": null,
    "operationType": null, "brandAffiliation": "에이치 에비뉴"
  },
  "location": {
    "stations": [{ "name": "이대역", "walkMinutes": 3, "provenance": "broker" }],
    "commercialCharacter": "신촌 대학가"
  },
  "derived": { "pricePerKey": 319148936 }
}
```

## 정밀 모드 — 증분 메모  ◆

표준 대비 추가 확인된 내용입니다. ◆ 표시 항목은 테스트용 가상 증강입니다.

```text
[매도인 자료 수령 · 운영 실사]
 
서대문구 대현동. 대지 486.2㎡(147.1평), 연면적 3,842.6㎡(1,162.4평).
지하 2층~지상 12층, 2016년 4월 준공. 일반상업지역이고 용적률 654.1%.
 
객실당 연면적 40.9㎡다. 비즈니스호텔 벤치마크가 35~45㎡니까 표준 범위 안이다.
객실 구성은 스탠다드 더블 46실이 주력이고, 트윈 28, 디럭스 14, 스위트 6실.
 
운영은 위탁이다. 에이치 에비뉴 브랜드로 국내 체인이고, 운영사 계약이 2029년 만료.
4년 남았다. 재계약 조건이 매수자한테 중요한 변수다.
 
ADR 95,000원, OCC 78%. RevPAR 74,100원 나온다. 신촌·이대 권역 ADR이 8~12만원대니
중간 수준이고, OCC는 괜찮은 편이다.
 
다만 계절성이 크다. 대학가라 3~5월, 9~11월이 성수고 1~2월은 확 떨어진다.
연평균 78%지만 비수기엔 60% 밑으로 간다고 봐야 한다.
 
외국인 비중이 45%다. 중국·일본·동남아 위주. 환율이나 항공 노선이 흔들리면
바로 영향받는다.
 
연 총매출 28.22억, GOP 마진 38% 잡으면 10.72억. 매각가 300억 대비 3.57%다.
이게 임대차 NOI 기준 Cap Rate와 다르다는 걸 매수자가 알아야 한다.
 
2016년 준공이면 객실 리뉴얼 주기(7~10년)가 다가온다. 이 비용을 누가 부담하느냐가
협상 포인트가 될 거다.
```

## 정밀 모드 — 증분 바텀시트  ◆

```json
{
  "hospitalitySpec": {
    "keyCount": 94,
    "roomTypes": [
      { "type": "스탠다드 더블", "count": 46, "exclusiveArea": 16.5 },
      { "type": "스탠다드 트윈", "count": 28, "exclusiveArea": 18.0 },
      { "type": "디럭스 더블",   "count": 14, "exclusiveArea": 22.0 },
      { "type": "스위트",        "count": 6,  "exclusiveArea": 33.0 }
    ],
    "adr": 95000,
    "occupancy": 0.78,
    "revpar": 74100,
    "ancillaryRevenueShare": 0.11,
    "gopMargin": 0.38,
    "operationType": "management_contract",
    "brandAffiliation": "에이치 에비뉴 (국내 체인)",
    "operatorContractRemainingYears": 3,
    "tourismRegistrationGrade": "관광호텔업 3급",
    "seasonality": "3~5월·9~11월 성수 / 1~2월 비수 (대학가 특성)",
    "foreignGuestShare": 0.45,
    "areaPerKey": 40.88
  },
  "building": {
    "grossArea": 3842.6,
    "aboveGroundArea": 3180.4,
    "buildingCoverage": 58.7,
    "far": 654.1,
    "floors": "지하 2층 ~ 지상 12층",
    "approvalDate": "2016-04",
    "parking": { "type": "기계식", "count": 18 },
    "elevator": 2,
    "amenities": ["1F 로비·카페", "B1 조식당", "옥상 라운지"]
  },
  "land": { "ledgerArea": 486.2, "useArea": "일반상업지역", "areaPerKey": 5.17 },
  "acquisitionCost": {
    "price": 30000000000, "acquisitionTax": 1380000000,
    "brokerageFee": 270000000, "registrationLegal": 60000000,
    "appraisalDueDiligence": 80000000, "totalAcquisitionCost": 31790000000
  }
}
```

## 이 물건이 검증하는 규칙

| 규칙 | 기대 동작 |
| --- | --- |
| G7 | 등급 D 발행 차단 |
| C31 | GOP 기준 표기 |
| L21 | 운영 편성 |
| 렌트롤 | 억제 |

# 9. 물건 6 — 연남동 000-12 외 1필지 상가주택  (가상 골든)

실물건이 아닙니다. v0.4 신규 기능(용도 혼합 · 주택임대차 · 구분등기 · 공동담보)을 한 물건에서 검증하기 위해 만든 골든 데이터이며, 모든 수치가 상호 검산되어 있습니다.

## 식별 · 3축 분류

| 항목 | 값 |
| --- | --- |
| 법정 용도 | 제2종근생 + 단독주택  (nbhd_2 + house_single) |
| 물건 유형 | 상가주택  (mixed_shop_house) |
| 투자 관점 | 임대수익형 (income) |
| 아키타입 | R-INC-02 임대료 정상화형 |
| 매각 희망가 | 42억 |
| 자료등급 | 76.57 B |
| 필요 Pack | residential_spec · sectional_spec |
| 특기 | 용도 혼합 · 층별 구분등기 · 주택임대차보호법 적용 2실 |

## 메모

```text
[현장 · 임대차 확인]
 
마포구 연남동 000-12, 000-13. 두 필지 합쳐 283.0㎡(85.61평).
000-13에 도시계획도로가 6.2㎡ 걸린다. 유효 대지는 276.8㎡.
 
2003년 5월 준공, 지하 1층에 지상 4층. 1·2층은 근생이고 3·4층은 주택이다.
연면적 680.0㎡(205.70평), 건폐율 54.0%.
 
용적률은 지상 기준 198.4%다. 전체 연면적으로 보면 240.3%.
2종일반주거 상한이 200%니까 지상 기준으로는 여유가 1.6%p뿐이다.
유효 대지로 다시 보면 202.9%라 신축은 사실상 성립하지 않는다.
 
임대차는 다섯 호실. 1층 카페, 2층 학원, 3층 주택 전세, 4층 주택 월세,
지하는 창고인데 비어 있다.
 
여기가 까다롭다. 1·2층은 상가임대차보호법인데 3·4층은 주택임대차보호법이다.
갱신요구권이 상가는 10년, 주택은 1회 2년이라 명도 시점이 완전히 다르다.
3층은 갱신 행사 이력을 확인 못 했다. 묵시적 갱신은 권리를 소진 안 시키니까
경과 년수로 계산하면 안 된다.
 
소유는 형제 둘이 층별로 구분등기해서 나눠 갖고 있다.
근저당이 호실마다 잡혀 있는데 공동담보라 그룹별로 한 번만 세야 한다.
 
임대료가 시세보다 낮다. 세 호실 평균 19% 정도.
다만 전부 환산보증금 9억 이하라 갱신할 때 5% 넘게 못 올린다.
```

## 바텀시트

```json
{
 "meta": {
  "docNo": "IM-2026-0804-YN",
  "tier": "pro",
  "ontologyVersion": "v0.4.0",
  "buildingUse": "제2종근린생활시설 + 단독주택 (혼합)",
  "assetType": "상가주택",
  "posture": "income",
  "leaseMode": "precise",
  "broker": {
   "org": "제이에스부동산중개(주)",
   "name": "차상혁"
  }
 },
 "deal": {
  "assetName": "연남동 000-12 외 1필지 상가주택",
  "address": "서울특별시 마포구 연남동 000-12, 000-13",
  "askingPrice": 4200000000,
  "priceProvenance": "seller"
 },
 "land": {
  "parcels": [
   {
    "jibun": "연남동 000-12",
    "area": 198.4,
    "exc": 0,
    "excKind": null
   },
   {
    "jibun": "연남동 000-13",
    "area": 84.6,
    "exc": 6.2,
    "excKind": "도시계획도로 저촉"
   }
  ],
  "ledgerArea": 283,
  "excludedArea": 6.2,
  "effectiveArea": 276.8,
  "useArea": "제2종일반주거지역",
  "farLimit": 200,
  "officialPricePerSqm": 8940000,
  "roads": [
   {
    "w": 8,
    "dir": "남측"
   },
   {
    "w": 4,
    "dir": "동측"
   }
  ]
 },
 "building": {
  "buildingArea": 152.8,
  "grossArea": 680,
  "aboveGroundArea": 561.6,
  "bcr": 54,
  "farAboveGround": 198.4,
  "farTotal": 240.3,
  "farEffective": 202.9,
  "approval": "2003-05",
  "floors": [
   {
    "fl": "B1",
    "use": "창고",
    "area": 118.4,
    "under": true
   },
   {
    "fl": "1F",
    "use": "근린생활",
    "area": 148.2,
    "under": false
   },
   {
    "fl": "2F",
    "use": "근린생활",
    "area": 148.2,
    "under": false
   },
   {
    "fl": "3F",
    "use": "주택",
    "area": 132.6,
    "under": false
   },
   {
    "fl": "4F",
    "use": "주택",
    "area": 132.6,
    "under": false
   }
  ]
 },
 "leaseRoll": {
  "mode": "precise",
  "units": [
   {
    "fl": "1F",
    "use": "근생·카페",
    "basis": "commercial",
    "tenant": "커피명가",
    "dep": 50000000,
    "rent": 2800000,
    "first": "2019-04",
    "mkt": 3400000,
    "renewalExercised": null
   },
   {
    "fl": "2F",
    "use": "근생·학원",
    "basis": "commercial",
    "tenant": "연남어학원",
    "dep": 30000000,
    "rent": 2100000,
    "first": "2021-09",
    "mkt": 2500000,
    "renewalExercised": null
   },
   {
    "fl": "3F",
    "use": "주택·전세",
    "basis": "residential",
    "tenant": "개인 (전세)",
    "dep": 200000000,
    "rent": 0,
    "first": "2023-06",
    "mkt": 0
   },
   {
    "fl": "4F",
    "use": "주택·월세",
    "basis": "residential",
    "tenant": "개인",
    "dep": 50000000,
    "rent": 1100000,
    "first": "2022-11",
    "mkt": 1280000,
    "renewalExercised": true
   },
   {
    "fl": "B1",
    "use": "창고·공실",
    "basis": "commercial",
    "tenant": null,
    "dep": 0,
    "rent": 0,
    "first": null,
    "mkt": 900000,
    "renewalExercised": null
   }
  ]
 },
 "owners": [
  {
   "fl": "1F",
   "owner": "김OO (형)",
   "share": "34.2%",
   "lien": 540000000,
   "grp": "A"
  },
  {
   "fl": "2F",
   "owner": "김OO (형)",
   "share": "34.2%",
   "lien": 540000000,
   "grp": "A"
  },
  {
   "fl": "3F",
   "owner": "김XX (동생)",
   "share": "15.8%",
   "lien": 300000000,
   "grp": "B"
  },
  {
   "fl": "4F",
   "owner": "김XX (동생)",
   "share": "15.8%",
   "lien": 300000000,
   "grp": "B"
  }
 ],
 "acq": {
  "tax": 193200000,
  "fee": 37800000,
  "reg": 15000000,
  "dd": 8000000,
  "total": 254000000
 }
}
```

## 검산표 — 전 항목 상호 검증

| 항목 | 값 | 산식 |
| --- | --- | --- |
| 대장 대지면적 | 283.0㎡ | 198.4 + 84.6 |
| 유효 대지면적 | 276.8㎡ | 283.0 − 제척 6.2 |
| 연면적 | 680.0㎡ | 층별 5개 합계 (C19 통과) |
| 건폐율 | 54.0% | 152.8 ÷ 283.0 |
| 용적률 (지상) | 198.4% | 561.6 ÷ 283.0 |
| 용적률 (전체) | 240.3% | 680.0 ÷ 283.0 |
| 용적률 (유효대지) | 202.9% | 561.6 ÷ 276.8 — 상한 200% 초과 |
| 보증금 계 | 3.30억 | 호실 5개 합계 |
| 월 임대료 계 | 6,000,000원 | 호실 5개 합계 |
| 실투자금 | 38.7억 | 42억 − 보증금 3.3억 |
| 총취득원가 | 44.54억 | 42억 + 부대비용 2.54억 |
| 공동담보 (단순합) | 16.8억 | 호실별 단순 합산 — 오류 |
| 공동담보 (그룹조정) | 8.4억 | C32 그룹당 1회 |

## Cap Rate 4기준

| 산정 기준 (proLabel) | 값 | 내부 코드 |
| --- | --- | --- |
| 임대수익률 (실투자금 기준) | 1.86% | gross_price_deposit |
| 임대수익률 (매매가 기준) | 1.71% | gross_price |
| Cap Rate (표준) | 1.34% | noi_price |
| Cap Rate (총취득원가 기준) | 1.26% | noi_total_cost |

> ※ 최고−최저 격차 0.60%p. 기준을 밝히지 않으면 매수자가 비교할 수 없습니다 (G10).

## 임대차 법적 지위 — T-C / T-R 분기

| 호실 | 용도 | 적용 법령 | 환산보증금 | 갱신권 잔여 | 권리금 |
| --- | --- | --- | --- | --- | --- |
| 1F | 근생·카페 | 상임법 | 3.30억 | 2.7년 | 보호 |
| 2F | 근생·학원 | 상임법 | 2.40억 | 5.1년 | 보호 |
| 3F | 주택·전세 | 주임법 | 해당 없음 | 확인 필요 | 없음 |
| 4F | 주택·월세 | 주임법 | 해당 없음 | 소진 (1회 행사) | 없음 |

> ※ 3층은 갱신 행사 이력이 확인되지 않아 "확인 필요"입니다. 묵시적 갱신은 갱신요구권을 소진하지 않으므로 경과년수로 역산하면 매수인에게 유리한 쪽으로 틀립니다.

## 임대료 정상화 — 법정 상한 병기

| 호실 | 현재 | 갱신 시 상한 (5%) | 시세 수준 | 판정 |
| --- | --- | --- | --- | --- |
| 1F | 280만 | 294만 | 340만 | 갱신 시 불가 |
| 2F | 210만 | 221만 | 250만 | 갱신 시 불가 |
| 4F | 110만 | 116만 | 128만 | 갱신 시 불가 |
| B1 | 공실 | — | 90만 | 신규 계약 |

> ※ 1·2단계(공실 해소 + 상한 인상) 실현 시 월 720만원 · 실투자금 기준 2.23%.

## 자료등급 산정

| 슬롯군 | 가중 | 충족도 | 출처 | 기여 |
| --- | --- | --- | --- | --- |
| 건물 기본 | 15 | 1.00 | 1.00 | 15.00 |
| 토지·필지 | 10 | 1.00 | 1.00 | 10.00 |
| 용도지역 | 5 | 1.00 | 1.00 | 5.00 |
| 도로·접면 | 5 | 1.00 | 1.00 | 5.00 |
| 임대차 | 20 | 0.92 | 0.72 | 13.25 |
| 금융·비용 | 15 | 0.90 | 0.65 | 8.78 |
| 권리·등기 | 10 | 0.95 | 1.00 | 9.50 |
| 비교사례 | 5 | 0.80 | 0.60 | 2.40 |
| 호실 구성 | 15 | 0.85 | 0.60 | 7.65 |
| 합계 | 100 |  |  | 76.57  B |

## 이 물건이 검증하는 규칙

| 규칙 | 기대 동작 |
| --- | --- |
| T-C | / T-R 분기 |
| T-R-03 | 주택 갱신 4년 |
| C30 | 대지권 지분합 |
| C32 | 공동담보 |
| G15 | 법령 확정 |

# 10. 기대 산출물 · 검증 체크리스트

## 10.1 물건별 기대 산출물

| # | 물건 | 딜카드 | 모바일 Basic | 모바일 Pro | PPTX |
| --- | --- | --- | --- | --- | --- |
| 1 | 잠원동 | 개발형 티저 | 개발 규모 중심 | 명도 계획 포함 | Pro 20~24p |
| 2 | 당산동 | 정상화형 티저 | 임대료 갭 | 구분등기·공동담보 | Pro 20~24p |
| 3 | 수택동 | 나대지 티저 | 개발 가능 규모 | 인허가 로드맵 | Pro 18~22p |
| 4 | 양평동 | 안정형 티저 | 안정성 중심 | 11실 렌트롤 | Pro 20~24p |
| 5 | 호텔 | 표준: 차단 | 표준: 차단 | 정밀: 운영지표 | Pro 16~20p |
| 6 | 연남동 | 정상화형 티저 | 3문+4접기 | 9문 · T-R 분기 | Pro 24p |

## 10.2 반드시 확인할 것

| 대상 | 확인 항목 |
| --- | --- |
| 딜카드 | 자료등급·아키타입 코드가 화면에 없는가 |
| 딜카드 | income에만 수익률이 뜨는가 (개발형·운영형은 다른 지표) |
| 딜카드 | 밴드가 실제값을 포함하는가 |
| Basic | 첫 숫자가 실투자금인가 (매각가 아님) |
| Basic | 업종이 대분류인가 (상호 없음) |
| Basic | 역레버리지 물건에 경고가 붙는가 |
| Pro | 수익률에 기준이 전부 표기되는가 |
| Pro | 대항력 기본값이 ○ 인가 |
| Pro | 주택 갱신권을 경과년수로 추정하지 않는가 |
| Pro | 자료등급이 ⑧문에 표시되는가 |
| PPTX | 용적률 2기준이 병기되는가 |
| PPTX | 표 합계가 배열에서 계산되는가 (C19) |
| PPTX | 공동담보 각주가 있는가 (C32) |
| PPTX | 인상 계획에 법정 상한이 병기되는가 |
| 공통 | 호텔 표준 모드에서 발행이 차단되는가 |
| 공통 | 시나리오 수치에 ◇ 배지가 붙는가 (C22) |

## 10.3 알려진 원본 오류 — 재현되면 안 됩니다

| 물건 | 원본 오류 | 시스템 기대 동작 |
| --- | --- | --- |
| 당산동 | 연면적 1,441.15 → 1,141.15 오기 (300㎡) | C19 위반 감지 |
| 당산동 | 401호 인상 +17.7% (법정 상한 5% 초과) | T-C-05 경고 |
| 잠원동 | 2F 월임대료 40,000원 셀 오차 | 층별 합계 불일치 감지 |
| 수택동 | 용적률 1,260%를 확정처럼 기재 | C22 · 전제 조건 요구 |
| 공통 | 대항력 전 호실 "무" 표기 | T-C-02 기본값 ○ · 근거 없으면 G13 차단 |

> ※ 위 오류는 실제 유통된 IM에서 확인된 것입니다. 물건명·법인명은 내부 참조용이며 대외 문서에 표기하지 않습니다.

## 10.4 참고 문서

| 영역 | 정본 |
| --- | --- |
| 온톨로지 3축 | ONTOLOGY_V0.4_SPEC.md · CATALOG_ASSET_TYPES.md |
| 규칙·제약·게이트 | CATALOG_RULES.md |
| 계산식 | IM_PRECISION_SPEC.md |
| 딜카드 화면 | DEAL_CARD_SPEC.md |
| 모바일 IM | MOBILE_IM_SPEC.md · MOBILE_IM_BASIC_PLAN.md |
| PPTX 템플릿 | PPTX_TEMPLATE_SPEC.md |
| 어휘 | CATALOG_LEXICON.md |
