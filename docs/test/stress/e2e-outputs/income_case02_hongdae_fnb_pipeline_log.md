# Pipeline Log: income_case02_hongdae_fnb

**Generated**: 2026-09-05T11:13:20.343Z
**Total Duration**: 0.7s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-02 |
| 2 | ② 바텀시트 보강 | 0.02s | ✅ success | posture: income, keys: 5 |
| 3 | ③ IM 생성 (LLM) | 0.22s | ✅ success | ok=true, sections=10, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.07s | ✅ success | sections: 10 |
| 5 | ⑤ PPTX 렌더링 | 0.38s | ✅ success | slides: 14, size: 566KB |

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
  "slideCount": 14,
  "fileSizeBytes": 579563,
  "warnings": [
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(입지 분석) 슬라이드 억제",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[Graceful Degradation] 진행 절차 슬라이드 억제: 바인딩할 데이터(dataKey: process)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 36건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 5건",
    "[AUDIT] G44: 열린 괄호 1건"
  ]
}
```
