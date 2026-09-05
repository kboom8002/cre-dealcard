# Pipeline Log: trading_case15_jongro_family

**Generated**: 2026-09-05T11:13:28.274Z
**Total Duration**: 0.5s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-15 |
| 2 | ② 바텀시트 보강 | 0.01s | ✅ success | posture: trading, keys: 5 |
| 3 | ③ IM 생성 (LLM) | 0.22s | ✅ success | ok=true, sections=7, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.05s | ✅ success | sections: 7 |
| 5 | ⑤ PPTX 렌더링 | 0.19s | ✅ success | slides: 13, size: 359KB |

## Detailed Metrics

### ③ IM 생성 (LLM)
```json
{
  "ok": true,
  "sections_count": 7,
  "dataGrade": "B",
  "ai_used": true
}
```

### ⑤ PPTX 렌더링
```json
{
  "slideCount": 13,
  "fileSizeBytes": 367525,
  "warnings": [
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(입지 분석) 슬라이드 억제",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[Graceful Degradation] 투자 논거 슬라이드 억제: 바인딩할 데이터(dataKey: thesis)가 충분하지 않습니다.",
    "[Graceful Degradation] 진행 절차 슬라이드 억제: 바인딩할 데이터(dataKey: process)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 27건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 8건",
    "[AUDIT] G44: 열린 괄호 5건"
  ]
}
```
