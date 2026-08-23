# Pipeline Log: owner_occupied_case05_seongsu_hq

**Generated**: 2026-08-23T09:54:03.212Z
**Total Duration**: 0.2s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.00s | ✅ success | buildingId: stress-case-05 |
| 2 | ② 바텀시트 보강 | 0.00s | ✅ success | posture: owner_occupied, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.14s | ✅ success | ok=true, sections=8, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.01s | ✅ success | sections: 8 |
| 5 | ⑤ PPTX 렌더링 | 0.07s | ✅ success | slides: 10, size: 278KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 8,
  "dataGrade": "B",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 10,
  "fileSizeBytes": 285181,
  "warnings": []
}
```
