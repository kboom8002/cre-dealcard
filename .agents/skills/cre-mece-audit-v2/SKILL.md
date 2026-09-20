---
name: cre-mece-audit-v2
description: >-
  PPTX Basic IM 특화 MECE 6축 코드 감사 및 병렬 Wave 수정 워크플로우.
  78건 결함을 5-Wave로 체계적으로 해결한 D40 경험에 기반합니다.
  사용자가 'MECE 감사', '정밀 감사', '전면 개선', '코드 감사' 등을 요청할 때 사용합니다.
---

# CRE MECE 감사 워크플로우 v2

## 언제 사용하는가

- PPTX IM 파이프라인의 전면적 품질 개선이 필요할 때
- 특정 매물 렌더링에서 발견된 결함을 기반으로 전체 코드베이스를 감사할 때
- 상용화 전 최종 품질 점검이 필요할 때

## MECE 6축 감사 프레임

| 축 | 검사 대상 | 결함 유형 |
|:---|:---|:---|
| **P0 데이터 독소** | archetype-builders, premium-binders, posture-builders, core-binders, data-binder | 합성 폴백값, 하드코딩 더미 데이터, 가짜 검증 통과 |
| **레이아웃 안정화** | a01~a24 아키타입, imlib | 테이블 오버플로우, 배너 충돌, 라벨 비율 깨짐, 동적 높이 |
| **외부 API 견고성** | vworld-wms, kakao-map-api, naver-search, building-register-api, address-resolver | 장애 미처리, null 전파, 타임아웃, 좌표 검증 |
| **웹 SSoT 패리티** | im-pro/page.tsx, im-lite/fetch-im-data, photo-gallery, floating-action-bar | PPTX↔웹 수치 불일치, 쿼리 파편화, 프리셋 오류 |
| **테스트 커버리지** | tests/e2e, tests/unit | no-op 단언, 골든 E2E 누락, 기대값 불일치 |
| **성능/바이너리** | image-optimizer, Sharp 파이프라인 | 2-stage split, POI collision, 음수 좌표, 메모리 |

## 표준 실행 절차

### Phase 1: 병렬 연구 (7 서브에이전트)

축별 1개 연구 서브에이전트를 발사하여 독립 감사합니다:

```
서브에이전트 1: P0 데이터 독소 스캔 (binder/*.ts)
서브에이전트 2: 레이아웃 안정화 스캔 (archetypes/a*.ts)
서브에이전트 3: 외부 API 견고성 스캔 (lib/external/*.ts)
서브에이전트 4: 웹 SSoT 패리티 스캔 (app/(public)/**/*.ts)
서브에이전트 5: 테스트 커버리지 스캔 (tests/**/*.test.ts)
서브에이전트 6: 성능/바이너리 스캔 (utils/image-*.ts)
서브에이전트 7: 도메인 모델 정합 (domain/building/mobile-im/**/*.ts)
```

각 서브에이전트는 **결함 목록**을 파일명·행번호·결함 유형·심각도와 함께 반환합니다.

### Phase 2: 결과 통합 및 우선순위 정렬

7개 서브에이전트 결과를 MECE 매트릭스로 통합하고 중복을 제거합니다:
- P0 (데이터 독소): 즉시 수정 필수
- P1 (크래시 유발): 즉시 수정 필수
- P2 (시각 품질): 우선 수정
- P3 (성능/UX): 여유 시 수정

### Phase 3: 5-Wave 순차 실행

의존 순서에 따라 Wave를 순차 실행합니다:

```
Wave 1: P0 데이터 독소 제거    ← 다른 Wave의 전제 조건
Wave 2: 레이아웃 안정화 + Sharp ← Wave 1 결과에 의존
Wave 3: 외부 API 견고화         ← Wave 2와 독립 가능
Wave 4: 웹 SSoT 패리티         ← Wave 1-3 결과에 의존
Wave 5: 테스트 커버리지 확장    ← Wave 1-4 안정화 후 실행
```

각 Wave 완료 후:
1. `npx vitest run` 기존 테스트 통과 확인
2. `npm run build` 빌드 무결성 확인

### Phase 4: 4단계 릴리즈 게이트

```
1. preflight: Poison Token 0건 + Mock Data Leak 0건
2. tsc:       신규 타입 에러 0건
3. build:     npm run build 성공
4. push:      git push origin main (Vercel 자동 배포)
```

## 핵심 교훈 (D40 경험)

1. **폴백값은 독소**: 입력 필드 누락 시 0/null/빈값을 사용. 절대로 그럴듯한 값을 합성하지 않는다.
2. **Sharp 실행 순서 주의**: `.extract()`/`.resize()`는 `.composite()` 이전에 실행된다. `.toBuffer()`로 단계를 분리한다.
3. **V-World 듀얼 레이어**: 본번(부번 0000)은 `LP_PA_CBND_BONBUN`, 부번(0001+)은 `LP_PA_CBND_BUBUN`을 사용한다.
4. **서브에이전트 로그 금지**: Rule 41에 따라 워크스페이스에 대형 로그 파일을 생성하지 않는다.
5. **PowerShell git push**: exit code 1이어도 `main -> main` 출력이 있으면 성공이다.
