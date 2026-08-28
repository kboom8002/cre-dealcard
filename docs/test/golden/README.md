# Golden IM — 상태: 🟡 인프라 준비 완료 / 콘텐츠 미생성

> **마지막 갱신**: 2026-08-28
> **상태**: `SCAFFOLD` — 생성·검증 파이프라인은 완비되었으나, 실제 골든 IM이 아직 생성·검수되지 않았습니다.

## ⚠️ 참조 금지

이 디렉토리에는 아직 **검증된 골든 IM이 없습니다**.
코드에서 이 디렉토리의 파일을 "참조 기준"으로 사용하지 마십시오.

## 인프라 현황

| 도구 | 상태 | 경로 |
|---|---|---|
| 생성 스크립트 | ✅ 준비 | `scripts/generate-golden-im.ts` |
| QA 검증 | ✅ 준비 | `scripts/qa-golden-verify.ts` |
| PPTX 파서 | ✅ 준비 | `src/.../pptx/pptx-parser.ts` |
| 게이트 추출 | ✅ 준비 | `src/.../pptx/extract-gate-context.ts` |
| fixture 데이터 | ✅ 준비 | `docs/imup/05_data/fixtures/yangpyeong.json` |

## 골든 IM 생성 절차 (미실행)

```
1. Supabase 연결 상태에서 풀 파이프라인으로 양평동 IM 생성
   (generateMobileIM → writer.ts 경유)

2. 생성된 sections + body를 generate-golden-im.ts에 주입

3. PPTX 렌더 → 파싱 → 감사 → 멱등 검증
   → npx tsx scripts/generate-golden-im.ts

4. QA 자동 검증
   → npx tsx scripts/qa-golden-verify.ts

5. 도메인 전문가 검수 → 콘텐츠 품질 승인

6. 승인 완료 시:
   - 이 README의 상태를 APPROVED로 변경
   - 승인된 PPTX/JSON을 커밋
```

## 현재 스크립트의 한계

`generate-golden-im.ts`의 sections는 **1~2문장짜리 스텁**입니다.
실제 골든 IM 섹션은 LLM이 생성한 500~1,500자 분량이어야 합니다.
스크립트는 **렌더→파싱→감사→멱등** 파이프라인의 검증용이지,
콘텐츠 자체가 골든 품질은 아닙니다.
