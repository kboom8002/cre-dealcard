# Pipeline Log: owner_occupied_case05_seongsu_hq

**Generated**: 2026-09-17T08:53:43.142Z
**Total Duration**: 2.2s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-05 |
| 2 | ② 바텀시트 보강 | 0.00s | ✅ success | posture: owner_occupied, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.33s | ✅ success | ok=true, sections=10, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.12s | ✅ success | sections: 10 |
| 5 | ⑤ PPTX 렌더링 | 1.70s | ✅ success | slides: 15, size: 793KB |

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
  "slideCount": 15,
  "fileSizeBytes": 811587,
  "warnings": [
    "[BL-5] 폴백 발동: A06 슬라이드 #3 — 아키타입이 본문을 렌더링하지 못해 마크다운 폴백 사용",
    "[P0-6 BLOCK] A06 폴백 차단: 아키타입이 본문을 렌더링하지 못함",
    "[BL-5 BLOCK] A06(입지 분석) 슬라이드 제거: 폴백 차단",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 50건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 7건",
    "[AUDIT] G43: highlights↔제원 중복",
    "[AUDIT] G44: 열린 괄호 2건"
  ]
}
```
