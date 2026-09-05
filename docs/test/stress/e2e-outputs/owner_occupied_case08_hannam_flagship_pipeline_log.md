# Pipeline Log: owner_occupied_case08_hannam_flagship

**Generated**: 2026-09-05T11:13:24.830Z
**Total Duration**: 0.7s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.04s | ✅ success | buildingId: stress-case-08 |
| 2 | ② 바텀시트 보강 | 0.03s | ✅ success | posture: owner_occupied, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.19s | ✅ success | ok=true, sections=8, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.10s | ✅ success | sections: 8 |
| 5 | ⑤ PPTX 렌더링 | 0.34s | ✅ success | slides: 13, size: 367KB |

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
  "slideCount": 13,
  "fileSizeBytes": 375765,
  "warnings": [
    "[Graceful Degradation] 입지 분석 슬라이드 억제: 바인딩할 데이터(dataKey: location)가 충분하지 않습니다.",
    "[BL-5] 폴백 발동: A08 슬라이드 #6 — 아키타입이 본문을 렌더링하지 못해 마크다운 폴백 사용",
    "[P0-6 BLOCK] A08 폴백 차단: 아키타입이 본문을 렌더링하지 못함",
    "[BL-5 BLOCK] A08(자가비교) 슬라이드 제거: 폴백 차단",
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(통근·접근성) 슬라이드 억제",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 30건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 7건",
    "[AUDIT] G44: 열린 괄호 3건"
  ]
}
```
