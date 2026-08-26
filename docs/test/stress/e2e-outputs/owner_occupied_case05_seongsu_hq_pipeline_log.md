# Pipeline Log: owner_occupied_case05_seongsu_hq

**Generated**: 2026-08-26T00:19:17.040Z
**Total Duration**: 0.3s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-05 |
| 2 | ② 바텀시트 보강 | 0.01s | ✅ success | posture: owner_occupied, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.12s | ✅ success | ok=true, sections=10, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.02s | ✅ success | sections: 10 |
| 5 | ⑤ PPTX 렌더링 | 0.12s | ✅ success | slides: 11, size: 282KB |

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
  "slideCount": 11,
  "fileSizeBytes": 288512,
  "warnings": [
    "[Graceful Degradation] 권리관계 슬라이드 억제: 바인딩할 데이터(dataKey: titleRights)가 충분하지 않습니다."
  ]
}
```
