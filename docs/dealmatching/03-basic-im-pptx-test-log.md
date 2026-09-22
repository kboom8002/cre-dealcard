# [Audit Log] 03. Basic IM PPTX 생성 파이프라인 E2E 

**수행 일자**: 2026-09-22
**수행 환경**: `Local Server (localhost:3000)` 및 `Production (credeal.net)`
**목표**: `03-basic-im-pptx.md`에서 정의된 PPTX 생성(Golden Fixture 활용) 파이프라인과 부가 기능(Translate, TTS)의 프로덕션 수준 E2E 검증.

---

## 1. 주요 발견 사항 (Critical Findings)

### 🔴 Defect 1: Vercel Production 환경에서 PPTX 생성 API (`/pptx`) 500 오류 발생
- **현상**: `https://credeal.net/api/public/im-lite/{buildingId}/pptx` 호출 시 `500 Internal Server Error` 반환 (`{"error":"PPTX generation failed"}`).
- **로컬 검증 결과**: 동일한 `buildingId`로 `localhost:3000` 환경에서 호출 시 **200 SUCCESS** 반환 및 정상적으로 PPTX 파일(약 358KB, 6 슬라이드) 다운로드 성공.
- **원인 추정**: 
  - `pptx-renderer` (PptxGenJS)가 Vercel의 Serverless 환경에서 폰트 종속성 부족으로 크래시 발생.
  - 카카오 맵 이미지 렌더링 (`basic-im-enrichment.ts`의 `fetchLocationPoi` 등) 시 Vercel IP 대역이 카카오 API 호출 방화벽에 차단되거나 Timeout 발생.

### 🔴 Defect 2: TTS API (`/tts`) 내역 조회 시 500 크래시 발생 (Null Exception)
- **현상**: `GET /api/public/im-lite/{buildingId}/tts?language=ko` 호출 시 `500 Internal Server Error` 반환 (`{"error":"Failed to generate voice briefing"}`).
- **원인**: 
  - `src/app/api/public/im-lite/[buildingId]/tts/route.ts`의 `generateFallbackScript` 함수에서 `doc.sections.filter`를 호출할 때 `doc.sections`가 `undefined`일 경우 옵셔널 체이닝 미사용으로 인한 타입 에러 발생. (`Cannot read properties of undefined (reading 'filter')`)

### 🟡 Warning 1: PPTX 슬라이드 자동 억제 (Graceful Degradation) 정상 동작 확인
- **현상**: 로컬 환경 테스트 성공 시 HTTP 헤더(`x-warnings`)에 데이터 부족에 대한 자동 억제 내역이 리포팅됨.
- **내용**: 
  - `[BL-2] 지도 좌표와 이미지 URL 모두 없음`
  - `[Graceful Degradation] 토지 정보 슬라이드 억제: 바인딩할 데이터(dataKey: land)가 충분하지 않습니다.`
  - `[A23] 안정화 수익률 데이터 없음 — As-Is만 렌더링`
- **평가**: `im-core`의 유효성 검증 게이트와 PptxGenJS 렌더러가 올바르게 연동되어 9~11장이 아닌 **6장**의 유효 슬라이드만 동적으로 안전하게 생성하는 것을 검증 완료 (합격).

---

## 2. 테스트 시나리오 수행 결과

| TC | 테스트 항목 | 상태 | 비고 / 응답 내역 |
|:---|:---|:---:|:---|
| **TC-PP01** | 수익형 (income) - P1 자산 PPTX 렌더링 | 🟡 **부분 성공** | 로컬은 성공하여 파일(358KB) 반환 확인, Prod는 500 에러 |
| **TC-PP15** | 번역 (Translate) | 🟢 **성공(예외처리)** | 발행되지 않은 문서는 `doc_id` 미존재로 `404 Not Found` 정확히 반환 |
| **TC-PP16** | TTS (음성 브리핑) | 🔴 **실패** | `sections` 필드 참조 Null 예외로 500 에러 |

## 3. 후속 조치 권고 (Next Steps)
1. **TTS API 디버깅**: `tts/route.ts`의 `doc.sections?.filter` 옵셔널 체이닝 수정 반영.
2. **Vercel Prod 환경 PPTX 에러 트래킹**: 프로덕션 배포 시 `PptxGenJS` 환경 종속성(폰트 등) 및 카카오 API 네트워크 호출 제한 확인.
