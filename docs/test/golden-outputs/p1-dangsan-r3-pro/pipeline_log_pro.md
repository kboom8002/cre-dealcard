# P1 당산 수익형 — R3-Verified PRO IM 골든 파이프라인 보고서

> **생성 시각**: 2026-09-23T02:52:23.136Z
> **총 소요시간**: 50541ms
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
| 1 | S1 — 데이터셋 로드 | ✅ PASS | 21ms | bottom_sheet 로드 (R3-Verified) |
| 2 | S2 — Writer Input 구성 | ✅ PASS | 1ms | MobileIMWriterInput 생성 완료 |
| 3 | S3 — AI 생성 엔진 (LLM) | ✅ PASS | 41392ms | 12개 섹션 생성, AI 사용 여부: true |
| 4 | S4 — PRO PPTX 렌더링 | ✅ PASS | 4368ms | 32개 슬라이드, 1611KB, 저장 완료 |
| 5 | S5 — 바이너리 품질 게이트 | ✅ PASS | 4668ms | PoisonTokens: OK, EvasivePhrases: OK, MockLeaks: OK, PhysicalGates: OK |

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
      "url": "/test/dangsan-exterior.jpg",
      "caption": "건물 정면"
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
  }
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
        "url": "/test/dangsan-exterior.jpg",
        "caption": "건물 정면"
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
  "sections_count": 12,
  "heroCard": {
    "posture": "income",
    "assetType": "",
    "areaSignal": "",
    "askingPriceDisplay": "115억 원",
    "capRateBase": 1.56,
    "noiBaseBil": 1.8,
    "keyInvestmentPoint": "소재 상업용 자산, 희망가 115억 원 투자 검토 자료입니다.",
    "keyPoints": [
      "입지 가치: 해당 권역 소재 자산으로 중장기 자산 가치 및 안정적 수요 검토",
      "임대 구조: 115억 원 수준의 가격대 및 현 임대차 기반의 현금흐름 분석",
      "실사 점검: 계약서 및 공부 확인을 통한 권리관계·물리적 상태 정밀 진단"
    ],
    "keyRisk": "공실률 미확인, 등기·건축물대장 현장 실사 필요. 투자 결정 전 반드시 직접 검증하시기 바랍니다.",
    "equityRequiredBil": 118.4,
    "leveragedYieldPct": 1.6,
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
      "title": "등기부 권리관계와 소유 구조는 어떠한가",
      "confidence": "inferred"
    },
    {
      "type": "land_detail",
      "title": "토지 현황과 이용 조건은 어떠한가",
      "confidence": "inferred"
    },
    {
      "type": "lease_status",
      "title": "임대 현황과 공실은 실제로 어떤가",
      "confidence": "needs_check"
    },
    {
      "type": "income_analysis",
      "title": "내 돈 넣으면 수익이 나오는 딜인가",
      "confidence": "inferred"
    },
    {
      "type": "risk_check",
      "title": "리스크는 무엇이고 대응책은 있는가",
      "confidence": "confirmed"
    },
    {
      "type": "next_steps",
      "title": "검토 후 다음 단계는 무엇인가",
      "confidence": "inferred"
    },
    {
      "type": "comparables",
      "title": "주변 유사 매물과의 비교",
      "confidence": "inferred"
    },
    {
      "type": "checklist",
      "title": "실사 체크리스트 및 확인사항",
      "confidence": "inferred"
    },
    {
      "type": "closing",
      "title": "면책조항 및 표기 기준",
      "confidence": "inferred"
    }
  ]
}
```

### S4: PRO PPTX 렌더링

```json
{
  "slideCount": 32,
  "fileSizeBytes": 1650052,
  "warnings": [
    "[BL-2] 지도 좌표와 이미지 URL 모두 없음",
    "[Graceful Degradation] 상세 임대차 현황 (상층부 및 만기 스케줄) 슬라이드 억제: 바인딩할 데이터(dataKey: rentRollPart2)가 충분하지 않습니다.",
    "갤러리 사진 로딩 실패 — 슬라이드 억제",
    "[Suppress] A14(물건 내외부 현장 사진 갤러리) 슬라이드 억제",
    "[Graceful Degradation] 인근 실거래 비교 사례 (Sales Comps) 슬라이드 억제: 바인딩할 데이터(dataKey: comps)가 충분하지 않습니다.",
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(지적도 및 필지 경계·형상 분석) 슬라이드 억제",
    "[AUDIT] G33: 텍스트 넘침 113건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G36: 왜곡 6.7% > 5%",
    "[AUDIT] G41: 만실↔공실 서술어 모순",
    "[AUDIT] G42: 폴백 중복 12건",
    "[AUDIT] G44: 열린 괄호 2건"
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
  "slideCount": 32,
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

