# Pipeline Log: income_case03_bundang_office

**Generated**: 2026-09-05T11:13:21.175Z
**Total Duration**: 0.8s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-03 |
| 2 | ② 바텀시트 보강 | 0.03s | ✅ success | posture: income, keys: 5 |
| 3 | ③ IM 생성 (LLM) | 0.22s | ✅ success | ok=true, sections=10, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.26s | ✅ success | sections: 10 |
| 5 | ⑤ PPTX 렌더링 | 0.28s | ✅ success | slides: 15, size: 408KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 10,
  "dataGrade": "B",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 15,
  "fileSizeBytes": 417699,
  "warnings": [
    "[Graceful Degradation] 입지 분석 슬라이드 억제: 바인딩할 데이터(dataKey: location)가 충분하지 않습니다.",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 33건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 8건",
    "[AUDIT] G44: 열린 괄호 7건"
  ]
}
```
