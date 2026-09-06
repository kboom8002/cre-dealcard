# Pipeline Log: trading_case10_seocho_old_retail

**Generated**: 2026-09-06T13:11:46.076Z
**Total Duration**: 0.7s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.00s | ✅ success | buildingId: stress-case-10 |
| 2 | ② 바텀시트 보강 | 0.00s | ✅ success | posture: trading, keys: 6 |
| 3 | ③ IM 생성 (LLM) | 0.24s | ✅ success | ok=true, sections=9, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.03s | ✅ success | sections: 9 |
| 5 | ⑤ PPTX 렌더링 | 0.42s | ✅ success | slides: 14, size: 369KB |

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
  "slideCount": 14,
  "fileSizeBytes": 377664,
  "warnings": [
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(입지 분석) 슬라이드 억제",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[Graceful Degradation] 투자 논거 슬라이드 억제: 바인딩할 데이터(dataKey: thesis)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 29건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 7건",
    "[AUDIT] G44: 열린 괄호 5건"
  ]
}
```
