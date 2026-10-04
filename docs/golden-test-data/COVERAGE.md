# 골든 픽스처 커버리지 매트릭스

> 갱신 기준: Hardening H4. 수치는 `images/` 폴더 내 파일 수(사진+소스 문서 혼재 가능)이며, 사진 개수와 같지 않다.
> 린트: `src/tests/unit/quality/fixture-lint.test.ts` (F01–F08) 가 모든 픽스처를 검사한다.

| 물건 | 포스처 | 라운드 | images/ 파일 수 | 골든 E2E 스펙 | LLM 녹화(replay) |
|:---|:---|:---|---:|:---|:---:|
| p1 당산 | income | r1 / r2 / r3 | 22 / 22 / 22 | `income-dangsan-r3` | ✅ |
| p2 신사 | trading | r1 / r3 | 13 / 7 | `trading-sinsa-r3` | ✅ |
| p3 서초 | owner | r1 / r3 | 13 / 13 | `owner-seocho-r3` | ✅ |
| p4 잠원 | development | r1 / r2 / r3 | 39 / 39 / 39 | `development-jamwon-r3` | ✅ |
| p5 양평 | income | r1 / r2 / r3 | 2 / 6 / 6 | `income-yangpyeong-r3` | ✅ |
| p6 호텔 | operating | r1 / r2 | 6 / 6 | `operating-hotel-r2` | ✅ |
| p7 수택 | development | r1 / r2 | 21 / 21 | `development-sutaek-r2` | ✅ |

## 알려진 공백 (정직하게)

- **녹화/재생은 7개 골든 스펙 전부 완료**(2026-10-04). 전체 replay 76/76 통과, 8.9분(live 대비 약 1/3), flaky 0. 단 **프롬프트·파이프라인을 바꾸면 해당 녹화는 무효**가 되므로(LLM_REPLAY_MISS) 재녹화·커밋이 필요하다.
- **replay 는 반드시 `--workers=1`**. 병렬 실행 시 dev 서버 과부하로 전부 실패한 사례가 있다.
- **dev 서버(3000 포트) 잔존 주의**: 이전 실행이 남긴 서버가 있으면 LLM_MODE 가 적용되지 않는다(Playwright `reuseExistingServer`). 실행 전 포트를 확인할 것.
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
