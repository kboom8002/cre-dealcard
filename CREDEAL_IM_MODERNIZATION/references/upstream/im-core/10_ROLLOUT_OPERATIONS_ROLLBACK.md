# 배포·운영·되돌리기 사양

> 설계 ID: `IC-OPS-001`

---

# 1. 기능깃발

| 깃발 | 기능 | 기본 |
|---|---|---|
| `ff_im_core_v1_shadow` | 신 CORE 그림자 평가·차이로그 | off |
| `ff_im_core_v1_persist` | snapshot/package 신규표 기록 | off |
| `ff_im_approval_hash_v1` | expectedHash·재수화 승인 | off 후 P0 점진 on |
| `ff_mobile_im_composer_v1` | 모바일 L1/L1.5 조립기 | off |
| `ff_im_publication_read_v1` | 공개 모바일 신규 버전 읽기 | off |
| `ff_pptx_studio_v1` | Studio UI·API | off |
| `ff_pptx_studio_export_v1` | Studio 최종파일 발행 | off |
| `ff_im_legacy_pptx_block` | 신규 모바일→PPTX 직접변환 차단 | off, P5 on |

깃발은 전역 외에 허용된 내부계정·조직·거래건 범위로 적용할 수 있어야 한다.

---

# 2. 배포파동

## Wave 0 개발·CI

- 신규표·서비스·스키마
- 외부 사용자 영향 없음
- 그림자 실행만

## Wave 1 내부 표본

- 당산·상도·양평 fixture
- 내부 계정만
- 모바일/PPTX 외부발행 금지

## Wave 2 파일럿 중개인

- 2~3명 권장
- 모바일 L1/L1.5 신경로 선택형
- PPTX Studio 베타
- 구형경로 즉시 복귀 가능

## Wave 3 조직별 기본

- 신경로 기본, 구형 선택 가능
- 신/구 차이와 지원요청 관측

## Wave 4 전체 기본

- 신규 거래건 신경로
- 구문서 read-only
- P5 폐기조건 관측

---

# 3. 운영 대시보드

필수 카드:

- 스냅샷·평가·패키지 성공률과 p50/p95
- 차단 gate 상위 10개
- 문서등급 분포와 L1→L1.5 승급률
- 보완과제 수행률
- 모바일·PPTX 생성/렌더 실패율
- 승인 hash mismatch
- 발행 후 invalidation 건수와 처리시간
- 교차채널 값 불일치
- legacy adapter 사용량
- Studio 편집시간·재렌더·페이지수·사진수

경보:

- 차단 산출항목 외부노출 1건
- RLS/권한 위반 1건
- 동일 package 교차채널 핵심값 불일치 1건
- invalidated 발행본 신규공개 1건
- artifact hash 없는 published 1건

위 경보는 즉시 신규발행 깃발을 끄는 기준이다.

---

# 4. 장애대응

## CORE 평가 장애

- 신규 패키지 생성 중단
- 기존 published 발행본 유지
- LLM 또는 채널 폴백으로 claim을 만들지 않음
- 재시도 가능한 오류만 작업큐 재시도

## 모바일 조립 장애

- 신규 모바일 초안만 실패
- 패키지와 기존 발행본 유지
- 구형경로 전환은 거래건별 명시적 선택

## PPTX 렌더 장애

- Studio 작업상태 유지
- 마지막 성공 미리보기와 발행파일 유지
- 원자료 재조회 없이 같은 패키지로 재렌더

## 승인서비스 장애

- 발행 전면 중단
- DB status 직접변경 금지
- 복구 후 같은 expectedHash로 멱등 재시도

---

# 5. 롤백절차

## 기능롤백

1. 해당 channel write flag off
2. 신규 작업 생성 중단
3. 진행작업 상태와 package hash 보존
4. 공개 read flag를 마지막 안정버전으로 전환
5. 사건로그와 사고범위 기록

## 승인롤백

- `ff_im_approval_hash_v1`을 끄기 전에 기존 승인경로의 안전성 확인
- P0 이후 빈 registry 승인경로로 되돌아가는 롤백은 허용하지 않음
- 필요하면 신규발행 자체를 중단

## 데이터롤백

- 신규표 삭제 금지
- 잘못된 발행본 invalidate
- 새 정정·스냅샷·패키지로 복구

---

# 6. 되돌리기 훈련

스테이징에서 다음을 기록한다.

- Studio export 장애→깃발 off→구형 재다운로드 유지
- CORE 평가 오류→신규발행 중단→기존 공개 정상
- 잘못된 규칙버전→영향 package 식별→invalidate→재평가
- 사진 공개정책 오류→해당 발행본 회수
- 예상복구시간과 실제복구시간

훈련 실패 시 Wave 3로 진입하지 않는다.

---

# 7. 폐기조건

구형 신규생성 경로를 제거하려면 모두 필요하다.

- 2개 연속 릴리스에서 신규 legacy 생성 0
- 과거 문서 재다운로드 회귀 100%
- P4 인수시험 통과
- 롤백훈련 통과
- 운영·고객지원·제품 승인
- 코드검색에서 신규 호출자 0

