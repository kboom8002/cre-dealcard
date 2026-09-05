# Pipeline Log: development_case13_mullae_dev

**Generated**: 2026-09-05T11:13:27.307Z
**Total Duration**: 0.4s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.00s | ✅ success | buildingId: stress-case-13 |
| 2 | ② 바텀시트 보강 | 0.01s | ✅ success | posture: development, keys: 3 |
| 3 | ③ IM 생성 (LLM) | 0.18s | ✅ success | ok=true, sections=9, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.02s | ✅ success | sections: 9 |
| 5 | ⑤ PPTX 렌더링 | 0.18s | ✅ success | slides: 14, size: 360KB |

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
  "fileSizeBytes": 368752,
  "warnings": [
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(입지 분석) 슬라이드 억제",
    "[BL-5] 폴백 발동: A08 슬라이드 #8 — 아키타입이 본문을 렌더링하지 못해 마크다운 폴백 사용",
    "[P0-6 BLOCK] A08 폴백 차단: 아키타입이 본문을 렌더링하지 못함",
    "[BL-5 BLOCK] A08(투입비용) 슬라이드 제거: 폴백 차단",
    "[Graceful Degradation] 진행 절차 슬라이드 억제: 바인딩할 데이터(dataKey: process)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 32건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 9건",
    "[AUDIT] G44: 열린 괄호 5건"
  ]
}
```
