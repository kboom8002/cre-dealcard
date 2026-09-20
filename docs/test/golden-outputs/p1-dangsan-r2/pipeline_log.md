# P1 당산 수익형 — R2-Standard 골든 파이프라인 보고서

> **생성 시각**: 2026-09-20T11:35:36.167Z
> **총 소요시간**: 30179ms
> **결과**: 7 PASS / 4 FAIL / 0 WARN

---

## 입력 데이터셋

| 항목 | 값 |
|:---|:---|
| 데이터셋 경로 | `C:\Users\User\cre-dealcard\docs\golden-test-data\p1-dangsan-income\r2-standard` |
| 해상도 | R2-Standard |
| 포스처 | income |
| 매물 | 서울특별시 영등포구 당산동5가 11-47 |
| 매각가 | 115억 |

---

## 파이프라인 실행 로그

| # | 단계 | 상태 | 소요시간 | 상세 |
|:---|:---|:---|---:|:---|
| 1 | S1 — 데이터셋 로드 | ✅ PASS | 4ms | bottom_sheet: 13개 필드, memo: 381자, expected: 11개 필드 |
| 2 | S2 — 메모 슬롯 추출 | ✅ PASS | 7ms | 4개 슬롯 추출, 추출률 9.0% |
| 3 | S3 — 재무 계산 | ✅ PASS | 3ms | Cap Rate: 1.67%, 연 임대수익: 1.91억, 토지평당가: 7,501만/평 |
| 4 | S4 — 데이터 품질 배지 | ✅ PASS | 0ms | 점수: 60, 등급: reference, 기대등급: B |
| 5 | S5 — 덱 시퀀서 | ✅ PASS | 1ms | 10개 슬라이드 시퀀스, 아키타입: [A01, A02, A04, A06, A04, A06, A24, A23, A14, A10] |
| 6 | S7-A — Poison Token 검증 | ❌ FAIL | 1ms | Cannot read properties of undefined (reading 'buffer') |
| 7 | S7-B — Evasive Phrase 검증 | ❌ FAIL | 0ms | Cannot read properties of undefined (reading 'buffer') |
| 8 | S7-C — Mock Data Leak 검증 | ❌ FAIL | 1ms | Cannot read properties of undefined (reading 'buffer') |
| 9 | S7-D — Physical Binary Gates | ❌ FAIL | 1ms | Cannot read properties of undefined (reading 'buffer') |
| 10 | S9 — SSoT 수학적 일관성 | ✅ PASS | 0ms | 일관성 확인: NOI=2.34억, Cap Rate=2.03% |
| 11 | S10 — 파이프라인 리포트 저장 | ✅ PASS | 3ms | 리포트 저장 완료: C:\Users\User\cre-dealcard\docs\test\golden-outputs\p1-dangsan-r2\pipeline_log.md |

---

## 상세 단계별 데이터

### S1: 데이터셋 로드

```json
{
  "bottomSheet_keys": [
    "askingPriceManwon",
    "address",
    "posture",
    "landAreaM2",
    "grossFloorAreaM2",
    "completionYear",
    "floors",
    "parking",
    "elevator",
    "zoning",
    "floor_leases",
    "expectedGrade",
    "expectedGates"
  ],
  "expected": {
    "resolution": "R2",
    "posture": "income",
    "expectedGrade": "B",
    "expectedMinSlides": 9,
    "expectedMaxSlides": 11,
    "expectedSlideArchetypes": [
      "A01",
      "A02",
      "A04",
      "A06",
      "A04",
      "A06",
      "A24",
      "A23",
      "A14",
      "A10"
    ],
    "a24_should_suppress": false,
    "a23_should_suppress": false,
    "expectedFloors": [
      "B1",
      "1F",
      "2F",
      "3F",
      "4F",
      "5F"
    ],
    "expectedKeywords": [
      "당산",
      "고은약국",
      "로뎀나무내과",
      "115억"
    ],
    "note": "R2 with full rent roll, real photos (6장), Kakao map + V-World cadastral: A06 location + A06 cadastral + A24 rent roll + A23 yield + A14 gallery"
  },
  "memo_preview": "당산동5가 11-47 근생빌딩 매각\n매각가 115억\n대지면적 506.8㎡ (153.31평)\n연면적 1,141.15㎡ (307.9평)\n준공업지역, 2002년 준공, B1~5F\n토지평당가 약 75백만원/평\n자주식 주차 8대, EV 1대\n당산역 도보 5분 (2호선/9호선)\n\n임대현황:\nB1 96.0평 자가(카페)\n1F 23.7평 고은약국 보증금6천 월세183만 ..."
}
```

### S2: 메모 슬롯 추출

```json
{
  "slotCount": 4,
  "extractionRate": 9,
  "slots": {
    "askingPriceKrw": 11500000000,
    "monthlyRentKrw": 1830000,
    "totalFloorAreaPyung": 153.31,
    "landAreaPyung": 153.31
  }
}
```

### S3: 재무 계산

```json
{
  "financialInput": {
    "posture": "income",
    "purchasePriceKrw": 11500000000,
    "monthlyRentKrw": 19460000,
    "totalAreaSqm": 1141.15,
    "platAreaSqm": 506.8,
    "vacancyRatePct": 0,
    "totalDepositManwon": 29000
  },
  "capRateBase": 1.67,
  "annualNoi": 191486400,
  "monthlyRentManwon": 1946,
  "totalDepositManwon": 29000,
  "landPricePerPyeong": "7,501만/평"
}
```

### S4: 데이터 품질 배지

```json
{
  "score": 60,
  "tier": "reference",
  "grade": "reference",
  "inputFlags": {
    "hasAddress": true,
    "hasPublicData": false,
    "hasMonthlyRent": true,
    "hasVacancy": true,
    "hasPhotos": false,
    "hasAskingPrice": true,
    "hasLoanAmount": false,
    "hasFloorLeases": true,
    "hasLandArea": true,
    "hasZoning": true,
    "hasTotalGrossArea": true,
    "hasMonthlyRevenue": false
  }
}
```

### S5: 덱 시퀀서

```json
{
  "slideCount": 10,
  "archetypes": [
    "A01",
    "A02",
    "A04",
    "A06",
    "A04",
    "A06",
    "A24",
    "A23",
    "A14",
    "A10"
  ],
  "expectedArchetypes": [
    "A01",
    "A02",
    "A04",
    "A06",
    "A04",
    "A06",
    "A24",
    "A23",
    "A14",
    "A10"
  ],
  "sequence": [
    {
      "archetype": "A01",
      "kicker": "표지",
      "title": "표지",
      "dataKey": "cover"
    },
    {
      "archetype": "A02",
      "kicker": "요약",
      "title": "요약",
      "dataKey": "summary"
    },
    {
      "archetype": "A04",
      "kicker": "물건 개요",
      "title": "물건 개요",
      "dataKey": "building"
    },
    {
      "archetype": "A06",
      "kicker": "입지 정보",
      "title": "입지 정보",
      "dataKey": "location"
    },
    {
      "archetype": "A04",
      "kicker": "토지 정보",
      "title": "토지 정보",
      "dataKey": "land"
    },
    {
      "archetype": "A06",
      "kicker": "Cadastral",
      "title": "지적도",
      "dataKey": "cadastralMap"
    },
    {
      "archetype": "A24",
      "kicker": "렌트롤",
      "title": "렌트롤",
      "dataKey": "rentRoll"
    },
    {
      "archetype": "A23",
      "kicker": "수익률",
      "title": "수익률",
      "dataKey": "yieldFormula"
    },
    {
      "archetype": "A14",
      "kicker": "Gallery",
      "title": "건물 사진",
      "dataKey": "gallery"
    },
    {
      "archetype": "A10",
      "kicker": "문의/유의",
      "title": "문의/유의",
      "dataKey": "closing"
    }
  ]
}
```

### S9: SSoT 수학적 일관성

```json
{
  "annualRentKrw": 233520000,
  "askingPriceKrw": 11500000000,
  "totalDepositKrw": 290000000,
  "netDenominator": 11210000000,
  "computedCapRate": "2.0306",
  "consistency": {
    "isConsistent": true,
    "discrepancies": []
  }
}
```

