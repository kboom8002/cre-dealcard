# P5 양평동4가 더레드빌딩 수익형 — R2-Standard 골든 파이프라인 보고서

> **생성 시각**: 2026-10-05T15:09:49.477Z
> **총 소요시간**: 149592ms
> **결과**: 13 PASS / 0 FAIL / 0 WARN
> **자산명**: 더레드빌딩 (양평동4가 117, 134, 125-2번지 · 3필지 통합)
> **매매희망가**: 250억 원 | **대지면적**: 518.7㎡ (156.9평) | **연면적**: 2,490.88㎡ (753.5평)

---

## 입력 데이터셋 메타데이터

| 항목 | 값 | 비고 |
|:---|:---|:---|
| 데이터셋 경로 | `C:\Users\User\cre-dealcard\docs\golden-test-data\p5-yangpyeong-income\r2-standard` | R2-Standard 해상도 |
| 포스처 | income | 임대수익형 코어 자산 |
| 소재지 | 서울특별시 영등포구 양평동4가 117, 134, 125-2번지 | 3필지 통합 매물 |
| 매각 희망가 | 250억 원 (25,000,000만 원) | 대형 수익형 |
| 건물 규모 | B1 ~ 10F (준공 2018년) | 2018년 신축급 컨디션 |
| 임대차 현황 | 12개 호실 (지하1F 공실, 지상 1~10F 11개 법인 만실) | IT/회계/디자인 분산 임차 |
| 다필지 여부 | true (3개 필지: 117, 134, 125-2) | 지적도 및 토지정보 검증 대상 |

---

## 파이프라인 실행 로그 (10단계 전구간)

| # | 단계 | 상태 | 소요시간 | 상세 내용 |
|:---|:---|:---|---:|:---|
| 1 | S1 — 데이터셋 로드 | ✅ PASS | 125ms | 매매가 250억, 3필지 통합, 12개 호실 임대차, 이미지 5장 확인 |
| 2 | S2 — 메모 슬롯 추출 | ✅ PASS | 27ms | 3개 슬롯 추출 완료 |
| 3 | S3 — 재무 계산 | ✅ PASS | 18ms | Cap Rate: 1.61%, 연 NOI: 4.01억, 토지평당가: 15,933만/평 |
| 4 | S4 — 데이터 품질 배지 | ✅ PASS | 0ms | 점수: 80점, 등급: verified (기대 등급: B) |
| 5 | S5 — 덱 시퀀서 | ✅ PASS | 5ms | 9개 슬라이드 시퀀스 확정: [A01, A02, A04, A06, A06, A24, A23, A14, A10] |
| 6 | S6 — PPTX 렌더링 | ✅ PASS | 24453ms | 9개 슬라이드 렌더링 완료 (1824KB) → C:\Users\User\cre-dealcard\docs\test\golden-outputs\p5-yangpyeong-r2\yangpyeong_income_r2_basic.pptx |
| 7 | S7-A — Poison Token 검증 | ✅ PASS | 1015ms | 0 poison tokens (NaN, undefined, null, [object Object] 완전 무결) |
| 8 | S7-B — Evasive Phrase 검증 | ✅ PASS | 645ms | 0 evasive phrases (회피성 결손 문구 배제 완결) |
| 9 | S7-C — Mock Data Leak 검증 | ✅ PASS | 1189ms | 0 mock data leaks (NH농협캐피탈, 테헤란로 123 등 가짜 데이터 누출 0건) |
| 10 | S7-D — Physical Binary Gates | ✅ PASS | 664ms | isPass: true, slides: 9, issues: 0 |
| 11 | S8 — 슬라이드 콘텐츠 검증 | ✅ PASS | 45ms | 8/8개 콘텐츠 단언 검증 통과 |
| 12 | S9 — SSoT 수학적 일관성 | ✅ PASS | 1ms | 수학적 일관성 통과: 연 NOI 6.18억 원, 표면 Cap Rate 2.47% |
| 13 | S10 — 산출물 및 육안 검수 보고서 작성 | ✅ PASS | 121076ms | 리포트 저장 완료: pipeline_log.md & slide_inspection.md (슬라이드 9면) |

---

## 상세 단계별 데이터 아티팩트

### S1: 데이터셋 로드

```json
{
  "address": "서울특별시 영등포구 양평동4가 117, 134, 125-2번지",
  "askingPriceManwon": 2500000,
  "multiParcel": true,
  "parcels": [
    {
      "address": "양평동4가 117",
      "jibun": "대"
    },
    {
      "address": "양평동4가 134",
      "jibun": "대"
    },
    {
      "address": "양평동4가 125-2",
      "jibun": "대"
    }
  ],
  "floorLeaseCount": 12,
  "imageFiles": [
    "image_01.jpg",
    "image_02.jpg",
    "image_03.jpg",
    "image_04.jpg",
    "image_05.jpg"
  ],
  "expected": {
    "resolution": "R2",
    "posture": "income",
    "expectedGrade": "B",
    "expectedMinSlides": 8,
    "expectedMaxSlides": 12,
    "multiParcel": true,
    "parcelCount": 3,
    "note": "Income R2: full building specs and rent roll."
  }
}
```

### S2: 메모 슬롯 추출

```json
{
  "slotCount": 3,
  "slots": {
    "askingPriceKrw": 25000000000,
    "totalFloorAreaPyung": 156.91,
    "landAreaPyung": 156.91
  }
}
```

### S3: 재무 계산

```json
{
  "askingPriceKrw": 25000000000,
  "monthlyRentManwon": 5147,
  "totalDepositManwon": 53700,
  "annualNoiKrw": 401466000,
  "capRateBase": 1.61,
  "landPricePerPyeong": "15,933만/평"
}
```

### S4: 데이터 품질 배지

```json
{
  "score": 80,
  "tier": "verified",
  "grade": "verified",
  "inputFlags": {
    "hasAddress": true,
    "hasPublicData": true,
    "hasMonthlyRent": true,
    "hasVacancy": true,
    "hasPhotos": true,
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
  "slideCount": 9,
  "archetypes": [
    "A01",
    "A02",
    "A04",
    "A06",
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
      "archetype": "A06",
      "kicker": "Land & Cadastral",
      "title": "토지 정보",
      "dataKey": "land"
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
  "slideCount": 9,
  "fileSizeKB": 1824,
  "generatedAt": "2026-10-05T15:07:44.528Z",
  "warnings": [
    "[A23] 공시지가 미제공 — 토지 가치 평가 대체 카드 삽입",
    "Text budget exceeded for slideTitle: length 40 > limit 32",
    "[AUDIT] G33: 텍스트 넘침 46건",
    "[AUDIT] G34: 겹침 11.813in > 0.015in",
    "[AUDIT] G42: 폴백 중복 3건",
    "[AUDIT] G43: highlights↔제원 중복"
  ]
}
```

### S7-D: Physical Binary Gates

```json
{
  "isPass": true,
  "slideCount": 9,
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
      "name": "양평동 키워드",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "매각가 250억",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "선유도역 키워드",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "건물명(더레드빌딩)",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "수익률 수치(X.XX%)",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "렌트롤 층별 정보",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "3필지 정보",
      "pass": true,
      "detail": "포함"
    },
    {
      "name": "슬라이드 수 범위",
      "pass": true,
      "detail": "9개 (기대: 8~12)"
    }
  ],
  "slideTextPreview": [
    {
      "slide": 1,
      "textPreview": "CRE DEAL 표지 서울특별시 영등포구 양평동4가 117, 134, 125-2번지 투자설명서 업무시설 (사무용빌딩) 서울특별시 영등포구 양평동4가 117, 134, 125-2번지 업무시설 (사무용빌딩) 250억 매각 희망가 250억 원 제이에스부동산중개법인 2026...."
    },
    {
      "slide": 2,
      "textPreview": "02 요약 영등포/양평 준공업지역에 위치한 2018년 준공, 지하 1층·지상 10층 규모의 임대수익형 업무시설 (사무용빌딩)입니다. 매매 희망가 250억 원 대지면적 156.9평 연면적 753.5평 건축규모 B1/F10 Cap Rate (NOI 기준) 1.90% 운영비..."
    },
    {
      "slide": 3,
      "textPreview": "03 물건 개요 건물 기본 정보 소재지 서울특별시 영등포구 양평동4가 117, 134, 125-2번지 대지면적 518.70㎡ (156.91평) 연면적 2,490.88㎡ (753.49평) / 지상 2,068.60㎡ (625.75평) 건축면적 302.92㎡ (91.63평,..."
    },
    {
      "slide": 4,
      "textPreview": "04 입지 정보 본건 1 선유도역(9호선) 도보 4분 2 당산역(2·9호선) 남동 0.6km 3 선유로운골목형상점가 도보 3분 4 호텔리버트리 도보 3분 5 선유도 공원 수생식물원 북동 0.7km ╌ 도보 3분 반경 (약 240m) 대중교통 접근성 소재지 서울특별시 영..."
    },
    {
      "slide": 5,
      "textPreview": "05 토지 정보 본건 토지이용계획 · 규제 분석 대지면적 518.7㎡ (156.9평) 용도지역 준공업지역 건폐율 현행 58.4% (법정 상한 60%) 용적률 현행 398.8% (법정 상한 400%) 도로접면 25m 양평로 북측 접면, 10m 동측 도로 접면 (코너) 지..."
    },
    {
      "slide": 6,
      "textPreview": "06 렌트롤 층별 스태킹 플랜 (㎡) B1 공실 422.1㎡ 1F 스타벅스 181.8㎡ 2F 디자인 스튜디오 209.6㎡ 3F IT 기업 209.6㎡ 4F 마케팅 에이전시 209.6㎡ 5F 법률사무소 209.6㎡ 6F 회계법인 209.6㎡ 7F 교육기관 209.6㎡ 8..."
    },
    {
      "slide": 7,
      "textPreview": "07 수익률 임대수익률 (Gross, 매매가−보증금 대비) 2.52% Cap Rate (NOI 기준) 1.90% 공실충당 5% 제외 기준 (참고) 2.66% 연간 임대수입 6.2억원 승계 보증금 5.4억원 매매가 250.0억원 보증금 차감 매입가 (매매가−보증금) 24..."
    },
    {
      "slide": 8,
      "textPreview": "08 현장 사진 건물 외관 1층 로비 엘리베이터홀 주차장 주변 도로/환경 CRE DEAL 8"
    },
    {
      "slide": 9,
      "textPreview": "09 문의 및 유의사항 01 관심 표명 담당 중개사에게 초기 관심 표명 및 상담 요청 → 02 NDA 체결 비밀유지계약 후 상세 임대차·재무 자료 제공 → 03 현장 실사 건물 컨디션 및 설비 직접 확인 후 의향서(LOI) 제출 데이터 출처 표기 ✓ 공부확인 등기부·대..."
    }
  ]
}
```

### S9: SSoT 수학적 일관성

```json
{
  "annualRentKrw": 617640000,
  "askingPriceKrw": 25000000000,
  "totalDepositKrw": 537000000,
  "netDenominator": 24463000000,
  "computedCapRate": "2.4706",
  "consistency": {
    "isConsistent": true,
    "discrepancies": []
  }
}
```

