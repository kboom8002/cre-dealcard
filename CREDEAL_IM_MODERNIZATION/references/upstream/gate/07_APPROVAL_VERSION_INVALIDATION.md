# 승인·버전·자동 무효화 사양

## 1. 승인 종류

| 승인종류 | 승인자 | 대상 |
|---|---|---|
| `source_correction` | 담당 중개인 | 상충값의 채택과 정정 |
| `proposal_publication` | 의견 작성 중개인 | 중개인 의견 외부문구 |
| `photo_disclosure` | 담당 중개인 | 사진·마스킹·대표사진 |
| `editorial_mobile` | 담당 중개인 | 모바일 문안과 순서 |
| `editorial_pptx` | 담당 중개인 | PPTX 구성·문안·사진 |
| `artifact_pptx` | 담당 중개인 또는 검수자 | 최종 PPTX 파일해시 |
| `release` | 권한 보유자 | 특정 발행본 외부공개 |

## 2. 승인 사건

```typescript
interface ApprovalEvent {
  approvalId: string;
  action: 'APPROVE' | 'REJECT' | 'WITHDRAW' | 'INVALIDATE';
  scope: string;
  subjectId: string;
  bindingHash: string;
  expectedPreviousHash?: string;
  policyVersions: Record<string, string>;
  actorId: string;
  actorRole: string;
  reason?: string;
  createdAt: string;
}
```

현재 유효승인은 같은 범위·결속해시의 가장 최근 사건으로 계산한다. 이후 철회 또는 무효화가 있으면 승인되지 않은 상태다.

## 3. 결속해시

```text
approvalBindingHash = hash(
  snapshotHash
  + claimEvaluationSetHash
  + finalCopyHash
  + photoSetHash
  + disclosurePolicyVersion
  + terminologyPolicyVersion
  + channelPolicyVersion
)
```

PPTX 파일승인은 위 값에 `artifactFileHash`, `rendererVersion`, `themeVersion`, `fontManifestHash`를 추가한다.

## 4. 자동 무효화 표

| 변경 | 무효화 범위 |
|---|---|
| 가격·면적·매각범위·임대·기준일 | 모든 채널 발행본과 관련 승인 |
| 중개인 의견 원문·근거·외부문구 | 해당 의견승인과 포함 발행본 |
| 사진·가림·대표사진·공개상태 | 사진승인과 포함 발행본 |
| 모바일 순서·문안 | 모바일 편집·발행승인 |
| PPTX 문안·페이지·사진 | PPTX 편집·파일승인 |
| 렌더러·테마·폰트 | PPTX 지면검사·파일승인 |
| 검사정책 RC1/RC2 | 영향 산출항목과 발행본 재평가 |

## 5. 승인 API 판정순서

1. 대상 산출물 존재
2. `expectedHash`와 현재 해시 일치
3. 저장된 유효기준본·산출항목·검사보고서 재수화
4. 필수 검사의 `FAIL/NOT_RUN/INDETERMINATE/SYSTEM_ERROR` 없음
5. 선행승인 존재
6. 승인 사건 저장
7. 발행 가능상태 계산

빈 주장목록이나 빈 검사보고서로 승인검사를 실행하지 않는다.

## 6. 다운그레이드

L1.5나 L2가 실패했을 때 안전한 낮은 발행형식을 새로 조립할 수 있다. 실패한 내용만 숨기고 같은 파일을 그대로 발행하는 것은 다운그레이드가 아니다.

다운그레이드 순서:

1. 실패 산출항목과 문구 제거
2. 낮은 형식의 필수묶음 재평가
3. 새 발행묶음과 새 해시 생성
4. 채널 재조립
5. 검사와 승인 재실행

