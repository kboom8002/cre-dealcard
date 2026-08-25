# Pipeline Log: owner_occupied_case06_nonhyeon_creative

**Generated**: 2026-08-25T13:22:53.510Z
**Total Duration**: 0.4s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-06 |
| 2 | ② 바텀시트 보강 | 0.01s | ✅ success | posture: owner_occupied, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.16s | ✅ success | ok=true, sections=12, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.06s | ✅ success | sections: 12 |
| 5 | ⑤ PPTX 렌더링 | 0.13s | ✅ success | slides: 10, size: 306KB |

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
  "fileSizeBytes": 313687,
  "warnings": []
}
```
