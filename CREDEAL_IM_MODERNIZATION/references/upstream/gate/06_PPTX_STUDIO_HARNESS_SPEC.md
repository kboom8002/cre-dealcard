# PPTX IM Studio 하네스 사양

## 1. Studio의 역할

Studio는 페이지 기획, 문안 편집, 사진 선택, 표와 부록 구성, 미리보기, 렌더링을 담당한다. 사실판정·재무계산·공개허가는 IM CORE가 담당한다.

## 2. 입력계약

```typescript
interface StudioInput {
  publicationPackageId: string;
  packageHash: string;
  snapshotId: string;
  allowedClaimRefs: string[];
  approvedProposalRefs: string[];
  approvedPhotoRefs: string[];
  reusableCopyUnits: string[];
  policyVersions: Record<string, string>;
}
```

Studio는 모바일 `sections[].markdown`이나 임의의 enrichment 원자료를 사실 정본으로 사용하지 않는다.

## 3. 앞면과 근거부록

### 앞면

- 대표사진과 물건 개요
- 매각 포인트
- 입지와 접근성
- 임대차 요약
- 가격·수익률 요약
- 승인된 중개인 의견
- 위험·확인사항·다음 행동

### 근거부록

- 기준일과 출처
- 상세 임대차 현황
- 계산식과 산정기준
- 필지·면적 구성
- 공부 확인사항
- 가정·미확인사항
- 사진정보와 공개상태

앞면의 숫자와 근거부록의 값은 같은 산출항목을 참조하며 오차 0을 요구한다.

## 4. Studio 판단과정 기록

모든 문장을 세 가지 대안으로 만들 필요는 없다. 다음과 같은 중요한 편집결정만 기록한다.

- 표지 제목과 대표사진
- 핵심 포인트 우선순위
- 중개인 의견 포함·제외
- 사진 순서와 크롭
- 임대차 요약수준
- 앞면과 부록의 정보 배분

```typescript
interface StudioDecision {
  decisionId: string;
  subject: string;
  alternatives: string[];
  selected: string;
  rejectedReasons: string[];
  tradeoff: string;
  revisitIf: string[];
  decidedBy: string;
  decidedAt: string;
}
```

## 5. 실물 관측기

| 관측기 | 실제 관측값 |
|---|---|
| 숫자 토큰 바인더 | 슬라이드·도형·표 셀의 산출항목 ID와 표시값 |
| 텍스트 넘침 | 실제 도형 경계와 렌더링 텍스트 영역 |
| 요소 겹침 | 허용 겹침 유형을 제외한 가림 면적 |
| 지면 이탈 | 슬라이드 바깥으로 나간 요소 |
| 이미지 품질 | 원본 해상도·실효 DPI·크롭·왜곡 |
| 사진 동일성 | 승인 사진의 해시와 삽입 이미지 해시 |
| 페이지 구조 | 앞면·부록·갤러리 역할과 면수 |
| 문안 정합 | 제목·본문·표가 참조하는 산출항목 |

관측할 수 없는 값은 0으로 초기화하지 않고 `NOT_RUN`으로 반환한다.

## 6. 차단 기준

- 숫자·단위·산정기준 불일치
- 텍스트 잘림 또는 의미 있는 요소 가림
- 타 매물 사진 또는 승인되지 않은 사진
- 주소·임차인·전화번호 등 공개금지 정보
- 내부 제작용어·가상값·검사코드 노출
- 수익률 라벨과 계산경로 불일치
- 파일해시와 승인 대상 불일치

사진 크롭과 요소 겹침은 단순 임계값뿐 아니라 대상 유형을 구분한다. 배경 위 장식요소의 의도된 겹침과 본문을 가리는 겹침을 같은 오류로 계산하지 않는다.

## 7. 편집과 승인

1. Studio 초안 생성
2. 중개인이 페이지 순서·문안·사진 수정
3. 구조화된 변경내역 저장
4. PPTX 렌더링
5. 실물 관측기와 수치대조 실행
6. PDF 또는 이미지 미리보기 확인
7. 최종 PPTX 파일해시 승인
8. 발행이력표 저장

렌더러·테마·폰트 버전이 바뀌면 사실승인은 유지할 수 있지만 지면검사와 파일승인은 다시 수행한다.

