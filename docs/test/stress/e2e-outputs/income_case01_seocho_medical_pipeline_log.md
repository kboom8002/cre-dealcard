# Pipeline Log: income_case01_seocho_medical

**Generated**: 2026-08-25T13:22:51.428Z
**Total Duration**: 0.5s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-01 |
| 2 | ② 바텀시트 보강 | 0.01s | ✅ success | posture: income, keys: 6 |
| 3 | ③ IM 생성 (LLM) | 0.24s | ✅ success | ok=true, sections=12, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.05s | ✅ success | sections: 12 |
| 5 | ⑤ PPTX 렌더링 | 0.14s | ✅ success | slides: 10, size: 427KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 12,
  "dataGrade": "B",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 10,
  "fileSizeBytes": 437284,
  "warnings": [
    "렌트롤 21행 → 2면 분할"
  ]
}
```
