# Pipeline Log: development_case12_yeoksam_dev

**Generated**: 2026-08-26T00:19:18.700Z
**Total Duration**: 0.2s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.00s | ✅ success | buildingId: stress-case-12 |
| 2 | ② 바텀시트 보강 | 0.00s | ✅ success | posture: development, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.10s | ✅ success | ok=true, sections=11, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.02s | ✅ success | sections: 11 |
| 5 | ⑤ PPTX 렌더링 | 0.09s | ✅ success | slides: 11, size: 315KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 11,
  "dataGrade": "B",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 11,
  "fileSizeBytes": 322597,
  "warnings": [
    "[Graceful Degradation] 권리관계 슬라이드 억제: 바인딩할 데이터(dataKey: titleRights)가 충분하지 않습니다."
  ]
}
```
