# Pipeline Log: income_case04_seongsu_atelier

**Generated**: 2026-09-05T11:13:21.902Z
**Total Duration**: 0.7s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.03s | ✅ success | buildingId: stress-case-04 |
| 2 | ② 바텀시트 보강 | 0.03s | ✅ success | posture: income, keys: 4 |
| 3 | ③ IM 생성 (LLM) | 0.21s | ✅ success | ok=true, sections=9, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.15s | ✅ success | sections: 9 |
| 5 | ⑤ PPTX 렌더링 | 0.26s | ✅ success | slides: 11, size: 343KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 9,
  "dataGrade": "B",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 11,
  "fileSizeBytes": 351709,
  "warnings": [
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(입지 분석) 슬라이드 억제",
    "[Graceful Degradation] 건물 개요 슬라이드 억제: 바인딩할 데이터(dataKey: building)가 충분하지 않습니다.",
    "[Graceful Degradation] 수익구조 슬라이드 억제: 바인딩할 데이터(dataKey: profit)가 충분하지 않습니다.",
    "[Graceful Degradation] 비교사례 슬라이드 억제: 바인딩할 데이터(dataKey: comps)가 충분하지 않습니다.",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[Graceful Degradation] 진행 절차 슬라이드 억제: 바인딩할 데이터(dataKey: process)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 19건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 4건",
    "[AUDIT] G44: 열린 괄호 2건"
  ]
}
```
