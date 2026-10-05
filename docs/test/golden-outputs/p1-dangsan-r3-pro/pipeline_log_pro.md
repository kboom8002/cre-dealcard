# P1 당산 수익형 — R3-Verified PRO IM 골든 파이프라인 보고서

> **생성 시각**: 2026-10-05T15:08:57.458Z
> **총 소요시간**: 86809ms
> **결과**: 5 PASS / 0 FAIL / 0 WARN

---

## 입력 데이터셋

| 항목 | 값 |
|:---|:---|
| 데이터셋 경로 | `C:\Users\User\cre-dealcard\docs\golden-test-data\p1-dangsan-income\r3-verified` |
| 해상도 | R3-Verified |
| 포스처 | income (Pro IM) |
| 매각가 | 115억 |

---

## 파이프라인 실행 로그

| # | 단계 | 상태 | 소요시간 | 상세 |
|:---|:---|:---|---:|:---|
| 1 | S1 — 데이터셋 로드 | ✅ PASS | 111ms | bottom_sheet 로드 (R3-Verified) |
| 2 | S2 — Writer Input 구성 | ✅ PASS | 0ms | MobileIMWriterInput 생성 완료 |
| 3 | S3 — AI 생성 엔진 (LLM) | ✅ PASS | 61365ms | 11개 섹션 생성, AI 사용 여부: true |
| 4 | S4 — PRO PPTX 렌더링 | ✅ PASS | 19535ms | 34개 슬라이드, 4622KB, 저장 완료 |
| 5 | S5 — 바이너리 품질 게이트 | ✅ PASS | 5537ms | PoisonTokens: OK, EvasivePhrases: OK, MockLeaks: OK, PhysicalGates: OK |

---

## 상세 단계별 데이터

### S1: 데이터셋 로드

```json
{
  "askingPriceManwon": 1150000,
  "address": "서울특별시 영등포구 당산동5가 11-47",
  "posture": "income",
  "landAreaM2": 506.8,
  "grossFloorAreaM2": 1141.15,
  "completionYear": 2002,
  "floors": "B1~5F",
  "parking": 8,
  "elevator": 1,
  "zoning": "준공업지역",
  "photos_v2": [
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_01.jpeg",
      "category": "exterior",
      "caption": "건물 외관 전경",
      "isHero": true,
      "role": "cover",
      "order": 0
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_02.jpeg",
      "category": "surroundings",
      "caption": "주변 도로 및 접근로",
      "isHero": false,
      "role": "exterior",
      "order": 1
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_03.jpeg",
      "category": "lobby",
      "caption": "1층 로비 및 공용부",
      "isHero": false,
      "role": "general",
      "order": 2
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_04.jpeg",
      "category": "interior",
      "caption": "실내 전용 공간",
      "isHero": false,
      "role": "general",
      "order": 3
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_05.jpeg",
      "category": "interior",
      "caption": "실내 전용 공간",
      "isHero": false,
      "role": "general",
      "order": 4
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_06.png",
      "category": "interior",
      "caption": "실내 전용 공간",
      "isHero": false,
      "role": "general",
      "order": 5
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_07.jpeg",
      "category": "interior",
      "caption": "실내 전용 공간",
      "isHero": false,
      "role": "general",
      "order": 6
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_08.jpeg",
      "category": "interior",
      "caption": "실내 전용 공간",
      "isHero": false,
      "role": "general",
      "order": 7
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_09.jpeg",
      "category": "interior",
      "caption": "실내 전용 공간",
      "isHero": false,
      "role": "general",
      "order": 8
    },
    {
      "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_10.png",
      "category": "interior",
      "caption": "실내 전용 공간",
      "isHero": false,
      "role": "general",
      "order": 9
    }
  ],
  "floor_leases": [
    {
      "floor": "B1",
      "tenant_type": "카페(자가)",
      "area_pyeong": 96,
      "deposit_manwon": 0,
      "rent_manwon": 0,
      "mgmt_fee_manwon": 30,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "is_vacant": false,
      "note": "자가사용"
    },
    {
      "floor": "1F",
      "tenant_type": "약국",
      "area_pyeong": 23.7,
      "deposit_manwon": 6000,
      "rent_manwon": 183,
      "mgmt_fee_manwon": 30,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "lease_end": "2026-08-31",
      "note": "임대 11년 경과"
    },
    {
      "floor": "1F",
      "tenant_type": "내과",
      "area_pyeong": 31.9,
      "deposit_manwon": 14000,
      "rent_manwon": 883,
      "mgmt_fee_manwon": 30,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "lease_end": "2026-08-31",
      "note": "로뎀나무내과 통합계약"
    },
    {
      "floor": "2F",
      "tenant_type": "내과",
      "area_pyeong": 76.3,
      "deposit_manwon": 0,
      "rent_manwon": 0,
      "mgmt_fee_manwon": 30,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "lease_end": "2026-08-31",
      "note": "로뎀나무내과 통합계약"
    },
    {
      "floor": "3F",
      "tenant_type": "헬쓰장",
      "area_pyeong": 76.3,
      "deposit_manwon": 5000,
      "rent_manwon": 455,
      "mgmt_fee_manwon": 20,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "lease_end": "2026-04-17"
    },
    {
      "floor": "4F",
      "tenant_type": "와인매장",
      "area_pyeong": 51.1,
      "deposit_manwon": 3000,
      "rent_manwon": 260,
      "mgmt_fee_manwon": 20,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "lease_end": "2025-04-30"
    },
    {
      "floor": "4F",
      "tenant_type": "자가",
      "area_pyeong": 25.1,
      "deposit_manwon": 0,
      "rent_manwon": 0,
      "mgmt_fee_manwon": 20,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "is_vacant": false,
      "note": "자가사용"
    },
    {
      "floor": "5F",
      "tenant_type": "내과",
      "area_pyeong": 55.6,
      "deposit_manwon": 1000,
      "rent_manwon": 165,
      "mgmt_fee_manwon": 20,
      "rent_type": "fixed",
      "lease_start": "2014-09-01",
      "lease_end": "2026-08-31",
      "note": "로뎀나무내과 통합계약"
    }
  ],
  "expectedGrade": "A",
  "expectedGates": {
    "blocking": [],
    "warning": []
  },
  "photo_urls": [
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_01.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_02.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_03.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_04.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_05.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_06.png",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_07.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_08.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_09.jpeg",
    "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_10.png"
  ]
}
```

### S2: Writer Input 구성

```json
{
  "building_ssot_lite": {
    "id": "golden-dangsan-pro",
    "address": "서울특별시 영등포구 당산동5가 11-47",
    "investment_posture": "income",
    "asking_price": 11500000000,
    "price_band": "115억 원",
    "total_area": 1141.15,
    "plat_area": 506.8,
    "use_approval_date": "2002-01-01"
  },
  "identity": {
    "investmentPosture": "income",
    "assetType": "nbhd_building"
  },
  "supplemental": {
    "asking_price_manwon": 1150000,
    "monthly_rent_total_krw": 19460000,
    "total_deposit_manwon": 29000,
    "land_area_m2": 506.8,
    "total_gross_area_m2": 1141.15,
    "building_age_years": 24,
    "floor_leases": [
      {
        "floor": "B1",
        "tenant_type": "카페(자가)",
        "area_pyeong": 96,
        "deposit_manwon": 0,
        "rent_manwon": 0,
        "mgmt_fee_manwon": 30,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "is_vacant": false,
        "note": "자가사용"
      },
      {
        "floor": "1F",
        "tenant_type": "약국",
        "area_pyeong": 23.7,
        "deposit_manwon": 6000,
        "rent_manwon": 183,
        "mgmt_fee_manwon": 30,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "lease_end": "2026-08-31",
        "note": "임대 11년 경과"
      },
      {
        "floor": "1F",
        "tenant_type": "내과",
        "area_pyeong": 31.9,
        "deposit_manwon": 14000,
        "rent_manwon": 883,
        "mgmt_fee_manwon": 30,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "lease_end": "2026-08-31",
        "note": "로뎀나무내과 통합계약"
      },
      {
        "floor": "2F",
        "tenant_type": "내과",
        "area_pyeong": 76.3,
        "deposit_manwon": 0,
        "rent_manwon": 0,
        "mgmt_fee_manwon": 30,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "lease_end": "2026-08-31",
        "note": "로뎀나무내과 통합계약"
      },
      {
        "floor": "3F",
        "tenant_type": "헬쓰장",
        "area_pyeong": 76.3,
        "deposit_manwon": 5000,
        "rent_manwon": 455,
        "mgmt_fee_manwon": 20,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "lease_end": "2026-04-17"
      },
      {
        "floor": "4F",
        "tenant_type": "와인매장",
        "area_pyeong": 51.1,
        "deposit_manwon": 3000,
        "rent_manwon": 260,
        "mgmt_fee_manwon": 20,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "lease_end": "2025-04-30"
      },
      {
        "floor": "4F",
        "tenant_type": "자가",
        "area_pyeong": 25.1,
        "deposit_manwon": 0,
        "rent_manwon": 0,
        "mgmt_fee_manwon": 20,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "is_vacant": false,
        "note": "자가사용"
      },
      {
        "floor": "5F",
        "tenant_type": "내과",
        "area_pyeong": 55.6,
        "deposit_manwon": 1000,
        "rent_manwon": 165,
        "mgmt_fee_manwon": 20,
        "rent_type": "fixed",
        "lease_start": "2014-09-01",
        "lease_end": "2026-08-31",
        "note": "로뎀나무내과 통합계약"
      }
    ],
    "photos_v2": [
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_01.jpeg",
        "category": "exterior",
        "caption": "건물 외관 전경",
        "isHero": true,
        "role": "cover",
        "order": 0
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_02.jpeg",
        "category": "surroundings",
        "caption": "주변 도로 및 접근로",
        "isHero": false,
        "role": "exterior",
        "order": 1
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_03.jpeg",
        "category": "lobby",
        "caption": "1층 로비 및 공용부",
        "isHero": false,
        "role": "general",
        "order": 2
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_04.jpeg",
        "category": "interior",
        "caption": "실내 전용 공간",
        "isHero": false,
        "role": "general",
        "order": 3
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_05.jpeg",
        "category": "interior",
        "caption": "실내 전용 공간",
        "isHero": false,
        "role": "general",
        "order": 4
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_06.png",
        "category": "interior",
        "caption": "실내 전용 공간",
        "isHero": false,
        "role": "general",
        "order": 5
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_07.jpeg",
        "category": "interior",
        "caption": "실내 전용 공간",
        "isHero": false,
        "role": "general",
        "order": 6
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_08.jpeg",
        "category": "interior",
        "caption": "실내 전용 공간",
        "isHero": false,
        "role": "general",
        "order": 7
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_09.jpeg",
        "category": "interior",
        "caption": "실내 전용 공간",
        "isHero": false,
        "role": "general",
        "order": 8
      },
      {
        "url": "docs/golden-test-data/p1-dangsan-income/r3-verified/images/image_10.png",
        "category": "interior",
        "caption": "실내 전용 공간",
        "isHero": false,
        "role": "general",
        "order": 9
      }
    ],
    "resolved_address": "서울특별시 영등포구 당산동5가 11-47"
  },
  "readiness": {
    "score": 100,
    "missing": []
  },
  "dataGrade": "A",
  "dcfEligible": true,
  "external_data": {
    "buildingRegister": {
      "platArea": 506.8,
      "totalArea": 1141.15
    },
    "landUsePlan": {
      "zoningDistrict": "준공업지역"
    }
  }
}
```

### S3: AI 생성 엔진 (LLM)

```json
{
  "ai_used": true,
  "sections_count": 11,
  "heroCard": {
    "posture": "income",
    "assetType": "",
    "areaSignal": "",
    "askingPriceDisplay": "115억 원",
    "capRateBase": 1.56,
    "noiBaseBil": 1.8,
    "yieldBasis": "NOI",
    "noiDeductions": [
      {
        "name": "공실·운영비",
        "amount": 53709600
      }
    ],
    "opexPct": 18,
    "opexSource": "assumed",
    "vacancyReservePct": 5,
    "keyInvestmentPoint": "입지 가치 및 접근성: 대중교통 및 주요 간선도로와의 우수한 연계성을 갖추고 있어 풍부한 유동인구와 배후 임대 수요를 확보하고 있습니다.",
    "keyPoints": [
      "입지 가치 및 접근성: 대중교통 및 주요 간선도로와의 우수한 연계성을 갖추고 있어 풍부한 유동인구와 배후 임대 수요를 확보하고 있습니다.",
      "안정적인 자산 가치: 115억 수준의 합리적인 매각가와 30평(약 99.2㎡) 규모의 건물 물리 스펙을 기반으로 안정적인 운영이 가능합니다.",
      "향후 가치개선(Value-add) 잠재력: 체계적인 임대 관리 및 자산 효율화를 통해 향후 중장기적인 자산 가치 상승을 기대할 수 있습니다."
    ],
    "keyRisk": "등기·건축물대장 현장 실사 필요. 투자 결정 전 반드시 직접 검증하시기 바랍니다.",
    "equityRequiredBil": 118.4,
    "leveragedYieldPct": 1.6,
    "hasLoan": false,
    "readinessScore": 100,
    "dcf10YearNpvBil": -53.1,
    "landAreaM2": 506.8,
    "totalGrossAreaM2": 1141.15,
    "zoning": "준공업지역",
    "landPricePerPyeong": null,
    "devProfitMarginPct": null,
    "devHoldYieldPct": null,
    "gopMarginPct": null,
    "adr": null,
    "occPct": null,
    "revpar": null,
    "ownVsLeaseSavingsBil": null,
    "breakevenYears": null,
    "pricePerPyeong": 33314224,
    "marketDiscountPct": null,
    "targetHprPct": null
  },
  "sections_preview": [
    {
      "type": "property_overview",
      "title": "이 매물, 어떤 자산인가",
      "confidence": "confirmed"
    },
    {
      "type": "investment_thesis",
      "title": "왜 지금 이 매물을 사야 하는가",
      "confidence": "inferred"
    },
    {
      "type": "location_access",
      "title": "이 입지, 투자할 만한 곳인가",
      "confidence": "inferred"
    },
    {
      "type": "title_rights",
      "title": "등기사항증명서 권리관계와 소유 구조",
      "confidence": "confirmed"
    },
    {
      "type": "land_detail",
      "title": "토지 현황과 이용 조건은 어떠한가",
      "confidence": "confirmed"
    },
    {
      "type": "lease_status",
      "title": "임대차 현황과 공실은 실제로 어떠한가",
      "confidence": "needs_check"
    },
    {
      "type": "income_analysis",
      "title": "투자 구조 및 현금흐름 분석",
      "confidence": "inferred"
    },
    {
      "type": "risk_check",
      "title": "위험요인 및 대응 방안",
      "confidence": "confirmed"
    },
    {
      "type": "next_steps",
      "title": "실사 안내 및 면책 조항",
      "confidence": "inferred"
    },
    {
      "type": "comparables",
      "title": "주변 유사 매물과의 비교",
      "confidence": "confirmed"
    },
    {
      "type": "checklist",
      "title": "실사 체크리스트 및 확인사항",
      "confidence": "inferred"
    }
  ]
}
```

### S4: PRO PPTX 렌더링

```json
{
  "slideCount": 34,
  "fileSizeBytes": 4732587,
  "warnings": [
    "표지 사진 크로핑률 52% — 25% 초과 주의",
    "[BL-2] 지도 좌표와 이미지 URL 모두 없음",
    "[A23] 공시지가 미제공 — 토지 가치 평가 대체 카드 삽입",
    "[Graceful Degradation] 상세 임대차 현황 (상층부 및 만기 스케줄) 슬라이드 억제: 바인딩할 데이터(dataKey: rentRollPart2)가 충분하지 않습니다.",
    "[A23] 공시지가 미제공 — 토지 가치 평가 대체 카드 삽입",
    "[Graceful Degradation] 인근 실거래 비교 사례 (Sales Comps) 슬라이드 억제: 바인딩할 데이터(dataKey: comps)가 충분하지 않습니다.",
    "[BL-2] 지적도 API 연동 실패로 대체 실사 카드 삽입됨",
    "[BL-2] 지도 좌표와 이미지 URL 모두 없음",
    "[AUDIT] G33: 텍스트 넘침 128건",
    "[AUDIT] G34: 겹침 11.813in > 0.015in",
    "[AUDIT] G36: 왜곡 51.7% > 5%",
    "[AUDIT] G41: 만실↔공실 서술어 모순",
    "[AUDIT] G42: 폴백 중복 18건"
  ]
}
```

### S5: 바이너리 품질 게이트

```json
{
  "textOverflowCount": 0,
  "overlapMaxInches": 0,
  "bleedCount": 0,
  "minEffectiveDpi": 286,
  "maxCropRatio": 0,
  "placeholderResidueCount": 0,
  "fontMissingCount": 0,
  "slideCount": 34,
  "brokenImageCount": 0,
  "personaViolationCount": 0,
  "lexiconViolationCount": 0,
  "legalRiskViolationCount": 0,
  "defectExcuseViolationCount": 0,
  "preachyViolationCount": 0,
  "internalRuleViolationCount": 0,
  "evasivePhraseViolationCount": 0,
  "mockLeakViolationCount": 0,
  "poisonTokenViolationCount": 0,
  "isPass": true,
  "issues": []
}
```

