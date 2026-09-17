# Pipeline Log: trading_case09_sinsa_value_add

**Generated**: 2026-09-17T08:53:49.318Z
**Total Duration**: 1.4s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.00s | ✅ success | buildingId: stress-case-09 |
| 2 | ② 바텀시트 보강 | 0.00s | ✅ success | posture: trading, keys: 6 |
| 3 | ③ IM 생성 (LLM) | 0.30s | ✅ success | ok=true, sections=9, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.01s | ✅ success | sections: 9 |
| 5 | ⑤ PPTX 렌더링 | 1.12s | ✅ success | slides: 14, size: 372KB |

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
  "fileSizeBytes": 380856,
  "warnings": [
    "[BL-5] 폴백 발동: A06 슬라이드 #3 — 아키타입이 본문을 렌더링하지 못해 마크다운 폴백 사용",
    "[P0-6 BLOCK] A06 폴백 차단: 아키타입이 본문을 렌더링하지 못함",
    "[BL-5 BLOCK] A06(입지 분석) 슬라이드 제거: 폴백 차단",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[Graceful Degradation] 투자 논거 슬라이드 억제: 바인딩할 데이터(dataKey: thesis)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 35건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 12건",
    "[AUDIT] G43: highlights↔제원 중복",
    "[AUDIT] G44: 열린 괄호 8건"
  ]
}
```
