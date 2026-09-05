# 승인·무효화·재생성 사양

## 1. 승인 종류

| 승인종류 | 대상 | 재사용 가능범위 |
|---|---|---|
| factual_snapshot | EffectiveSnapshot 해시 | 같은 스냅샷을 쓰는 모든 채널 |
| broker_opinion | 제안단위 공개문구·근거·조건 해시 | 문구와 근거가 같은 채널 |
| disclosure | 공개범위·가림정책·연락정보 | 같은 정책·대상범위 |
| mobile_editorial | 모바일 최종문안·사진·순서 | 해당 모바일 버전만 |
| pptx_editorial | PPTX 프로젝트·미리보기 | 해당 프로젝트 버전만 |
| rendered_artifact | 최종 파일 바이트해시 | 해당 파일만 |

승인은 `approved`, `rejected`, `revoked`, `expired`, `invalidated` 사건으로만 변경한다. 과거 사건을 수정하지 않는다.

## 2. 승인 요청 계약

```yaml
approvalType: pptx_editorial
subjectType: pptx_studio_project_version
subjectId: STUDIO-004-V7
expectedHashes:
  package: "..."
  projectVersion: "..."
  copyPlan: "..."
  mediaPlan: "..."
  layoutPlan: "..."
  preview: "..."
scope:
  audience: private_investor
  disclosure: confidential
actorId: broker-017
comment: "매각가·임대현황·사진 확인"
```

현재해시가 하나라도 다르면 `409 APPROVAL_SUBJECT_CHANGED`다.

## 3. 변경분류

| 변경분류 | 예 | 최소 재시작점 |
|---|---|---|
| evidence_change | 새 건축물대장, 임대차 계약서 추가 | P10 또는 P20 |
| correction_change | 채택 면적·가격·필지 변경 | P20 |
| snapshot_asof_change | 기준일 갱신 | P30 |
| formula_change | 수익률 산식버전 변경 | P40 |
| gating_policy_change | 발행허가 규칙 변경 | P50 |
| package_policy_change | 공개·가림·내용단위 규칙 | P60 |
| proposal_copy_change | 중개인 공개문구 수정 | 해당 채널 M10/S20 |
| mobile_copy_order_change | 모바일 문안·순서 | M20 |
| mobile_photo_change | 모바일 사진·캡션 | M20 |
| pptx_composition_change | 페이지 추가·순서 | S10 |
| pptx_copy_change | 제목·본문·각주 | S20 |
| pptx_media_change | 사진·크롭·가림 | S30 |
| pptx_theme_change | 색·폰트·스타일 | S30 또는 S40 |
| renderer_change | 렌더러 버전 | S40/S50/S70 |

## 4. 무효화 행렬

| 변경 | 사실승인 | 의견승인 | 모바일 승인 | PPTX 승인 | 파일승인 |
|---|---:|---:|---:|---:|---:|
| 원자료 추가, 유효값 불변 | 재검토 표시 | 영향 시 | 재검사 | 재검사 | 유지 가능 |
| 유효값·기준일 변경 | 무효 | 영향 시 무효 | 무효 | 무효 | 무효 |
| 산식·허가규칙 변경 | 재검사 | 영향 시 | 재검사 | 재검사 | 재검사 |
| 의견 공개문구 변경 | 유지 | 무효 | 영향본 무효 | 영향본 무효 | 영향본 무효 |
| 모바일 문안·순서 | 유지 | 유지 | 무효 | 유지 | 모바일만 무효 |
| PPTX 문안 | 유지 | 연결 시 검토 | 유지 | 무효 | 무효 |
| PPTX 사진·크롭 | 유지 | 근거연결 시 검토 | 유지 | 무효 | 무효 |
| PPTX 테마 | 유지 | 유지 | 유지 | 지면승인 무효 | 무효 |
| 렌더러 보안패치, 바이트 변화 없음 | 유지 | 유지 | 유지 | 유지 | 해시대조 후 유지 |

## 5. 재생성 계획기

입력:

- 변경사건 목록
- 현재 산출물 의존그래프
- 정책 호환규칙
- 사용자가 요청한 채널·목표

출력:

- 재사용할 산출물
- 무효화할 산출물·승인·배포
- 다시 실행할 단계와 순서
- 필요한 사용자 확인
- 예상시간·비용 등급

계획을 사용자에게 보여준 뒤 영향이 큰 변경은 확인을 받을 수 있다. 다만 사실값이 바뀐 발행본은 확인 대기 중에도 즉시 `stale` 표시한다.

## 6. 오래된 상태

- `fresh`: 모든 상위해시와 정책이 현재
- `stale_review_required`: 상위변경은 있으나 값 불변 여부 미판정
- `stale_invalid`: 유효값·허가가 바뀌어 배포 금지
- `superseded`: 더 새 승인본이 존재
- `revoked`: 사람 또는 정책이 철회

공개 중인 `stale_invalid` 발행본은 정책에 따라 즉시 철회한다. `stale_review_required`는 경고 후 제한된 유예시간을 둘 수 있으나 기본은 신규배포 금지다.

## 7. 선택적 재생성 예

### PPTX 표지 제목만 변경

재사용: P00~P60, S10, MediaPlan, LayoutPlan의 영향없는 부분  
실행: S20 → S40 → S50 → S60 → S70  
영향: PPTX 승인·파일만 무효, 모바일 유지

### 매도 희망가 변경

재사용: P10 근거 중 변경없는 공급자 자료, P20의 무관 충돌  
실행: P20/P30 → P40 → P50 → P60 → 선택 채널 조립·검사·재승인  
영향: 기존 모바일·PPTX 모두 `stale_invalid`

### 대표사진 크롭만 변경

실행: 대상 채널의 사진·레이아웃 단계부터  
검토: 의견 근거사진이면 의견승인 영향판정  
영향: 다른 채널과 사실승인 유지

## 8. 승인 안전규칙

1. 빈 판정집합으로 승인할 수 없다.
2. 필수 기계검사 `not_run/error`는 차단이다.
3. 승인시점과 발행시점 사이 해시를 다시 확인한다.
4. 한 사람의 사실승인과 편집승인은 가능하지만 사건을 합치지 않는다.
5. 시스템 자동승인은 사람승인이 필요한 L1.5 의견·최종파일에 사용할 수 없다.
6. 승인 무효화는 하위 의존성을 따라 전파하고 원인을 기록한다.

