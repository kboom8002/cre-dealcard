# Pipeline Log: income_case01_seocho_medical

**Generated**: 2026-09-05T11:13:19.601Z
**Total Duration**: 1.0s

## Step-by-Step Timeline

| # | Step | Duration | Status | Summary |
|---|------|----------|--------|---------|
| 1 | ① SSoT Lite 구축 | 0.01s | ✅ success | buildingId: stress-case-01 |
| 2 | ② 바텀시트 보강 | 0.01s | ✅ success | posture: income, keys: 6 |
| 3 | ③ IM 생성 (LLM) | 0.35s | ✅ success | ok=true, sections=11, grade=B |
| 4 | ④ 중간 결과물 저장 | 0.16s | ✅ success | sections: 11 |
| 5 | ⑤ PPTX 렌더링 | 0.52s | ✅ success | slides: 15, size: 685KB |

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
  "slideCount": 15,
  "fileSizeBytes": 701110,
  "warnings": [
    "[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관",
    "[Suppress] A06(입지 분석) 슬라이드 억제",
    "렌트롤 13행 → 2면 분할",
    "렌트롤 13행 → 2면 분할",
    "역레버리지 경고 슬라이드 반영",
    "[Graceful Degradation] 총수익률 슬라이드 억제: 바인딩할 데이터(dataKey: totalReturn)가 충분하지 않습니다.",
    "[AUDIT] G33: 텍스트 넘침 39건",
    "[AUDIT] G34: 겹침 12.093in > 0.015in",
    "[AUDIT] G42: 폴백 중복 5건",
    "[AUDIT] G43: highlights↔제원 중복",
    "[AUDIT] G44: 열린 괄호 1건"
  ]
}
```
