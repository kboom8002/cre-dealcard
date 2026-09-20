# P1 당산 수익형 — R2-Standard 골든 파이프라인 보고서

> **생성 시각**: 2026-09-20T10:07:31.013Z
> **총 소요시간**: 4758ms
> **결과**: 13 PASS / 0 FAIL / 0 WARN

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
| 2 | S2 — 메모 슬롯 추출 | ✅ PASS | 3ms | 4개 슬롯 추출, 추출률 9.0% |
| 3 | S3 — 재무 계산 | ✅ PASS | 1ms | Cap Rate: 1.67%, 연 임대수익: 1.91억, 토지평당가: 7,501만/평 |
| 4 | S4 — 데이터 품질 배지 | ✅ PASS | 1ms | 점수: 60, 등급: reference, 기대등급: B |
| 5 | S5 — 덱 시퀀서 | ✅ PASS | 1ms | 10개 슬라이드 시퀀스, 아키타입: [A01, A02, A04, A06, A04, A06, A24, A23, A14, A10] |
| 6 | S6 — PPTX 렌더링 | ✅ PASS | 4262ms | 10개 슬라이드, 5033KB, 저장: C:\Users\User\cre-dealcard\docs\test\golden-outputs\p1-dangsan-r2\p1_dangsan_income_r2_basic.pptx |
| 7 | S7-A — Poison Token 검증 | ✅ PASS | 131ms | 0 poison tokens detected |
| 8 | S7-B — Evasive Phrase 검증 | ✅ PASS | 105ms | 0 evasive phrases detected |
| 9 | S7-C — Mock Data Leak 검증 | ✅ PASS | 84ms | 0 mock data leaks detected |
| 10 | S7-D — Physical Binary Gates | ✅ PASS | 109ms | isPass: true, slides: 10, issues: 0 |
| 11 | S8 — 슬라이드 콘텐츠 검증 | ✅ PASS | 14ms | 7/7 검증 통과 |
| 12 | S9 — SSoT 수학적 일관성 | ✅ PASS | 1ms | 일관성 확인: NOI=2.34억, Cap Rate=2.03% |
| 13 | S10 — 파이프라인 리포트 저장 | ✅ PASS | 3ms | 리포트 저장 완료: C:\Users\User\cre-dealcard\docs\test\golden-outputs\p1-dangsan-r2\pipeline_log.md |

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

### S6: PPTX 렌더링

```json
{
  "slideCount": 10,
  "fileSizeKB": 5033,
  "generatedAt": "2026-09-20T10:07:30.556Z",
  "warnings": [
    "[A23] 안정화 수익률 데이터 없음 — As-Is만 렌더링",
    "[AUDIT] G33: 텍스트 넘침 34건",
    "[AUDIT] G34: 겹침 11.693in > 0.015in",
    "[AUDIT] G36: 왜곡 109.6% > 5%",
    "[AUDIT] G43: highlights↔제원 중복"
  ],
  "auditReport": {
    "layoutViolations": [
      "G33: 텍스트 넘침 34건",
      "G34: 겹침 11.693in > 0.015in",
      "G36: 왜곡 109.6% > 5%"
    ],
    "standardViolations": [
      "G43: highlights↔제원 중복"
    ],
    "totalViolations": 4,
    "imageCount": 9,
    "textCount": 227,
    "gateContext": {
      "maxCropRatio": 0,
      "minEffectiveDpi": 200,
      "textOverflowCount": 34,
      "overlapMaxInches": 11.693,
      "bleedCount": 0,
      "aspectDistortionMaxPct": 109.6,
      "vacancyNarrativeContradiction": false,
      "fallbackDuplicateCount": 0,
      "highlightSpecDuplicate": true,
      "unclosedBracketCount": 0,
      "labelContentMismatchCount": 0,
      "pageCountExceeded": false,
      "foreignPhotoCount": 0
    }
  }
}
```

### S7-D: Physical Binary Gates

```json
{
  "isPass": true,
  "slideCount": 10,
  "poisonTokenViolationCount": 0,
  "evasivePhraseViolationCount": 0,
  "mockLeakViolationCount": 0,
  "placeholderResidueCount": 0,
  "personaViolationCount": 0,
  "issues": []
}
```

### S8: 슬라이드 콘텐츠 검증

```json
{
  "checks": [
    {
      "name": "당산 키워드",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "매각가 115억",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "핵심 임차인(로뎀나무내과)",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "약국 임차인",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "수익률 수치(X.XX%)",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "렌트롤 층수 정보",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "슬라이드 수 범위",
      "pass": true,
      "detail": "10개 (기대: 9~11)"
    }
  ],
  "slideTextPreview": [
    {
      "slide": 1,
      "textPreview": "CRE DEAL 표지 서울특별시 영등포구 당산동5가 11-47 투자설명서 근린생활시설 (메디컬빌딩) 서울특별시 영등포구 당산동5가 11-47 근린생활시설 (메디컬빌딩) 115억 매각 희망가 115억 원 제이에스부동산중개법인 2026.09.20  |  정현우 수석팀장  ..."
    },
    {
      "slide": 2,
      "textPreview": "02 요약 요약 로뎀나무내과·고은약국 장기 임차 만실 · 11년 미인상 임대료 정상화 시 47% 상승 여력 매매 희망가 115억 원 대지면적 153.3평 연면적 345.2평 건축규모 B1/F5 연 수익률(Cap Rate) 1.56% 공실 현황 만실 운영 (공실 0%) ..."
    },
    {
      "slide": 3,
      "textPreview": "03 물건 개요 물건 개요 건물 기본 정보 소재지 서울특별시 영등포구 당산동5가 11-47 대지면적 506.8㎡ (153.3평) 연면적 1141.15㎡ (345.2평) 건축면적 256.12㎡ (77.5평, 건폐율 50.54%) 용적률 225.14% (준공업지역 법정 4..."
    },
    {
      "slide": 4,
      "textPreview": "04 입지 정보 입지 정보 교통 접근성 대중교통 당산역 9호선 도보 1분 (약 51m) 도로접면 8m 도로 2면 접면 (코너) 상권권역 영등포/당산 주요 상업·업무 권역 상업시설 영등포농협 하나로마트 당산역점 도보 1분 (약 98m) 주요시설 커넥트인터내셔널 도보 2분..."
    },
    {
      "slide": 5,
      "textPreview": "05 토지 정보 토지 정보 토지이용계획 · 규제 분석 대지면적 506.8㎡ (153.3평) 용도지역 준공업지역 건폐율 현행 50.54% (법정 상한 60%) 용적률 현행 225.14% (법정 상한 400%) 도로접면 8m 도로 2면 접면 (코너) 필지 형상 [필지 형상..."
    },
    {
      "slide": 6,
      "textPreview": "06 Cadastral 지적도 연속지적도 (V-World) 대지면적 506.8㎡ (153.3평) 용도지역 준공업지역 건폐율 현행 50.54% (법정 상한 60%) 용적률 현행 225.14% (법정 상한 400%) © V-World 국토교통부 | 2026 CRE DEAL..."
    },
    {
      "slide": 7,
      "textPreview": "07 렌트롤 렌트롤 2025 2026 공실 GL (지상/지하 경계) B1 카페(자가) 96평 1F 약국 24평 1F 내과 32평 2F 내과 76평 3F 헬쓰장 76평 4F 와인매장 51평 4F 자가 25평 5F 내과 56평 ※ 렌트롤 현황 기준 층별 공간 배치도 층수 ..."
    },
    {
      "slide": 8,
      "textPreview": "08 수익률 수익률 표면 임대수익률  = 연간 임대료 합계 (관리비 제외) 매매가  −  승계 보증금 합계 2.3억원 ÷ (115.0억원 − 2.9억원) As-Is (현재) 연간 임대료 2.3억원 승계 보증금 2.9억원 매매가 115.0억원 Cap Rate 2.08% ..."
    },
    {
      "slide": 9,
      "textPreview": "09 Gallery 현장 사진 건물 외관 건물 정면 외관 (B1~5F, 벽돌 구조) 건물 외관 건물 측면 (자주식 주차장 진입로) 주 출입구 주출입구 및 1층 간판 (로뎀나무내과·고은약국) 실내 공간 내부 층별 공용 복도 실내 공간 임차 전용 공간 (사무실 내부) 주차..."
    },
    {
      "slide": 10,
      "textPreview": "10 문의/유의 문의 및 유의사항 01 관심 표명 담당 중개사에게 초기 관심 표명 및 상담 요청 → 02 NDA 체결 비밀유지계약 후 상세 임대차·재무 자료 제공 → 03 현장 실사 건물 컨디션 및 설비 직접 확인 후 의향서(LOI) 제출 데이터 출처 표기 ✓ 공부확인..."
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

