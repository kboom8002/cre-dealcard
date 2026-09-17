# Pipeline Log: income_case04_seongsu_atelier

**Generated**: 2026-09-17T08:53:40.975Z
**Total Duration**: 1.7s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.02s | ✅ success | buildingId: stress-case-04 |
| 2 | ② 바텀시트 보강 | 0.03s | ✅ success | posture: income, keys: 4 |
| 3 | ③ IM 생성 (LLM) | 0.31s | ✅ success | ok=true, sections=13, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.05s | ✅ success | sections: 13 |
| 5 | ⑤ PPTX 렌더링 | 1.29s | ✅ success | slides: 14, size: 418KB |

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
  "slideCount": 14,
  "fileSizeBytes": 428362,
  "warnings": [
    "[BL-5] 폴백 발동: A06 슬라이드 #3 — 아키타입이 본문을 렌더링하지 못해 마크다운 폴백 사용",
    "[P0-6 BLOCK] A06 폴백 차단: 아키타입이 본문을 렌더링하지 못함",
    "[BL-5 BLOCK] A06(입지 분석) 슬라이드 제거: 폴백 차단",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 32건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 9건",
    "[AUDIT] G43: highlights↔제원 중복",
    "[AUDIT] G44: 열린 괄호 5건"
  ]
}
```
