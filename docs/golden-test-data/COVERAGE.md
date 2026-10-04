# 골든 픽스처 커버리지 매트릭스

> 갱신 기준: Hardening H4. 수치는 `images/` 폴더 내 파일 수(사진+소스 문서 혼재 가능)이며, 사진 개수와 같지 않다.
> 린트: `src/tests/unit/quality/fixture-lint.test.ts` (F01–F08) 가 모든 픽스처를 검사한다.

| 물건 | 포스처 | 라운드 | images/ 파일 수 | 골든 E2E 스펙 | LLM 녹화(replay) |
|:---|:---|:---|---:|:---|:---:|
| p1 당산 | income | r1 / r2 / r3 | 22 / 22 / 22 | `income-dangsan-r3` | ❌ |
| p2 신사 | trading | r1 / r3 | 13 / 7 | `trading-sinsa-r3` | ❌ |
| p3 서초 | owner | r1 / r3 | 13 / 13 | `owner-seocho-r3` | ❌ |
| p4 잠원 | development | r1 / r2 / r3 | 39 / 39 / 39 | `development-jamwon-r3` | ❌ |
| p5 양평 | income | r1 / r2 / r3 | 2 / 6 / 6 | `income-yangpyeong-r3` | ✅ |
| p6 호텔 | operating | r1 / r2 | 6 / 6 | `operating-hotel-r2` | ❌ |
| p7 수택 | development | r1 / r2 | 21 / 21 | `development-sutaek-r2` | ❌ |

## 알려진 공백 (정직하게)

- **녹화/재생은 p5 r3 하나뿐**. 나머지 6개 스펙은 아직 `LLM_MODE=record` 로 녹화되지 않았다 → 여전히 live LLM(또는 Mock 폴백) 의존.
- **시각 회귀 베이스라인은 p5 하나뿐** (`docs/visual-baselines/p5-yangpyeong`). 렌더는 Windows + PowerPoint COM 전용.
- **에디터 UI E2E(사진 태깅)는 p5 골든 문서 1건 대상**. 사진이 0~2장인 문서, 20장 이상 문서는 미검증.
- **포스처 커버**: owner / trading / operating 은 r3(혹은 r2) 1개 라운드만 E2E 가 있다. development 는 2건, income 은 2건.
- **엣지 케이스 미커버**: 사진 0장, 임대차 0행, 임대차 30행 이상, 공시지가 없음, 지적도 실패, 면적 단위 혼재, 매우 긴 건물명, 다중 필지.
- **Pro IM**: 불변식 감사에서 `p1_dangsan_income_r3_pro.pptx` 10번 슬라이드의 mock-LLM JSON 유출이 `KNOWN_ISSUES` 로 남아 있음 (Basic 범위 밖).
- **실제 사진은 p5 만 중개인 제공 실사진**. 그 외 물건의 사진은 기존 픽스처이며 출처/권리 확인을 하지 않았다.

## 확장 절차

1. `LLM_MODE=record npx playwright test e2e/golden/<spec> --timeout=600000` (실 OpenAI 호출, 물건당 약 $0.25 · 4분)
2. `e2e/llm-recordings/` 변경분 커밋
3. `LLM_MODE=replay` 로 2회 연속 통과 확인
