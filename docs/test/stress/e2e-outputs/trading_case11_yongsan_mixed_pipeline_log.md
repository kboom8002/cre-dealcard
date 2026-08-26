# Pipeline Log: trading_case11_yongsan_mixed

**Generated**: 2026-08-26T00:19:18.486Z
**Total Duration**: 0.2s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.00s | ✅ success | buildingId: stress-case-11 |
| 2 | ② 바텀시트 보강 | 0.00s | ✅ success | posture: trading, keys: 4 |
| 3 | ③ IM 생성 (LLM) | 0.12s | ✅ success | ok=true, sections=9, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.02s | ✅ success | sections: 9 |
| 5 | ⑤ PPTX 렌더링 | 0.09s | ✅ success | slides: 10, size: 269KB |

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
  "slideCount": 10,
  "fileSizeBytes": 275395,
  "warnings": [
    "[Graceful Degradation] 권리관계 슬라이드 억제: 바인딩할 데이터(dataKey: titleRights)가 충분하지 않습니다.",
    "[Graceful Degradation] 투자 논거 슬라이드 억제: 바인딩할 데이터(dataKey: thesis)가 충분하지 않습니다."
  ]
}
```
