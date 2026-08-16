# Pipeline Log: owner_occupied_case08_hannam_flagship

**Generated**: 2026-08-16T08:22:47.634Z
**Total Duration**: 0.8s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.00s | ✅ success | buildingId: stress-case-08 |
| 2 | ② 바텀시트 보강 | 0.00s | ✅ success | posture: owner_occupied, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.67s | ✅ success | ok=true, sections=8, grade=A |
| 4 | ④ 중간 결과물 저장 | 0.03s | ✅ success | sections: 8 |
| 5 | ⑤ PPTX 렌더링 | 0.11s | ✅ success | slides: 10, size: 244KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 8,
  "dataGrade": "A",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 10,
  "fileSizeBytes": 250303,
  "warnings": []
}
```
