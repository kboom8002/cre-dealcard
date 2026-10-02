# CRE DealCard 비용 분석 및 프롬프트 위생 규칙

## Rule: LLM 프롬프트에 바이너리 데이터 주입 금지
- `JSON.stringify()`로 외부 데이터를 LLM 프롬프트에 직렬화할 때, 반드시 바이너리/이미지 필드를 먼저 제거해야 합니다.
- 금지 필드 목록: `cadastralMapImage`, `mapImageUrl`, `buffer`, `staticMapImage`, `mapImage`, `thumbnailImage`, `photos_v2` (Base64 data URI 포함 시), `photo_urls` (Base64 포함 시)
- 위반 시 요청당 토큰이 40~100배 폭증하여 IM당 $15~$18 비용이 발생합니다 (정상: $0.25).

## Rule: API 비용 분석 시 반드시 실측 검증
- OpenAI 토큰 소비량을 추정할 때, 코드의 문자열 리터럴 크기만 보지 말고 **`JSON.stringify()`에 전달되는 런타임 객체의 실제 크기**를 추적해야 합니다.
- 추정치를 제시할 때 반드시 다음 3가지를 교차 검증하세요:
  1. 코드에서 프롬프트에 주입되는 모든 데이터 소스 추적
  2. 해당 데이터의 실제 크기 측정 (파일 크기, `JSON.stringify` 결과 길이)
  3. OpenAI Usage 대시보드 또는 API 응답의 `usage.total_tokens` 실측값과 대조
- **"0원 소비" 같은 확정 발언은 서버 로그만으로 단정하지 말고, OpenAI 플랫폼 로그(platform.openai.com/logs)를 반드시 확인**하세요.

## Rule: 사진 업로드 순서
- `handler.ts`에서 `uploadDataUriPhotos()`는 반드시 `generateMobileIM()` **이전에** 호출되어야 합니다.
- Base64 data URI가 Supabase Storage URL로 변환된 후에야 프롬프트에 안전하게 전달됩니다.

## 교훈 (2026-10-02 세션)
- 지적도 이미지 Base64 PNG(270K~540K chars = ~95K~190K tokens)가 `narrative-prompt.ts`의 `JSON.stringify(externalData)`를 통해 섹션 생성 8회 + Judge 3회 = 11회 반복 주입되어 1회 IM 생성에 ~$75 소비.
- 수정 커밋: `e79431b` — 3개 파일에서 바이너리 필드를 destructuring으로 제거.
