# Pipeline Log: income_case04_seongsu_atelier

**Generated**: 2026-08-26T00:19:16.746Z
**Total Duration**: 0.3s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-04 |
| 2 | ② 바텀시트 보강 | 0.01s | ✅ success | posture: income, keys: 4 |
| 3 | ③ IM 생성 (LLM) | 0.13s | ✅ success | ok=true, sections=13, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.02s | ✅ success | sections: 13 |
| 5 | ⑤ PPTX 렌더링 | 0.18s | ✅ success | slides: 11, size: 323KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 13,
  "dataGrade": "B",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 11,
  "fileSizeBytes": 331253,
  "warnings": [
    "[Graceful Degradation] 권리관계 슬라이드 억제: 바인딩할 데이터(dataKey: titleRights)가 충분하지 않습니다."
  ]
}
```
