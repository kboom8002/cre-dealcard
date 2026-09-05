# PPTX IM Studio 사양

> 설계 ID: `IC-PPTX-001`  
> 제품역할: 같은 IM CORE 발행묶음을 사용하는 독립 문서기획·편집·조립·렌더링 하위시스템

---

# 1. 책임경계

## Studio가 한다

- 목적·독자·핵심 소구점 입력
- 가능한 문서등급 선택
- 허용된 내용 단위 선택
- 페이지 구성 자동제안과 편집
- 제목·본문·표·각주·사진 캡션 후보
- 대표사진·크롭·사진 인접배치
- 미리보기·지면검사·파일생성
- PPTX 전용 승인·버전·해시

## Studio가 하지 않는다

- 원자료 간 값 채택
- 산출항목 사용허가 변경
- 독립 재무계산
- blocked 산출항목 강제포함
- 모바일 markdown에서 숫자 역추출
- 모바일 승인 재사용으로 최종파일 승인 생략

---

# 2. 프로젝트 입력

```typescript
interface PptxStudioBrief {
  packageId: string;
  targetLevel: 'L1' | 'L1.5' | 'L2' | 'L3';
  documentPurpose: 'sale_guide' | 'sale_proposal' | 'buyer_review';
  audience: 'private_buyer' | 'corporate_buyer' | 'broker_network' | 'internal_review';
  primaryAppeal: Array<'location' | 'price' | 'income' | 'tenant_mix' | 'value_add' | 'redevelopment'>;
  selectedProposalUnitIds: string[];
  presetId: string;
  maxBodyPages?: number;
}
```

`targetLevel`은 패키지의 eligibleLevels에 있어야 한다. `maxBodyPages`는 내용 선택을 제한할 뿐 등급을 올리지 않는다.

---

# 3. CompositionPlan

```typescript
interface CompositionPlan {
  projectId: string;
  packageId: string;
  pages: PagePlan[];
  omittedContentUnits: Array<{ id: string; reason: string }>;
  pageBudget: { target: number; hardMax: number; appendixCount: number };
  planHash: string;
}

interface PagePlan {
  pageId: string;
  role: string;
  archetypeId: string;
  contentUnitIds: string[];
  claimRefs: string[];
  proposalUnitRefs: string[];
  photoSlots: PhotoSlotPlan[];
  sourceNoteRefs: string[];
  required: boolean;
  placement: 'body' | 'appendix' | 'closing';
}
```

PagePlan은 모바일 section과 독립이다. 모바일에서 승인된 내용 단위는 후보로 재사용할 수 있다.

---

# 4. 문서등급별 기본편성

| 등급 | 권장 본문 | 필수 |
|---|---:|---|
| L1 | 7~9면 | 표지, 외관 포함 개요, 매각범위, 공부, 입지, 사용현황, 확인사항, 문의 |
| L1.5 | 9~13면 | L1 + 추천포인트, 제안·활용, 적합매수자, 허용 가격참고 |
| L2 | 11~15면 | L1.5 + 사용가능 임대·가격·시장·실사 모듈 |
| L3 | 가변·본문 16면 원칙 | L2 + 허용된 만기·임대격차·실행방안·시나리오 |

본문 절대상한은 현행 16면을 기본 유지한다. 부록은 별도지만 내용 없는 부록을 만들지 않는다. 상한 변경은 사용자 실증과 `im.budget` 소유권 결정 후 한다.

---

# 5. 편집동작

허용:

- 페이지 추가·삭제·순서변경
- 허용된 내용 단위의 페이지 이동
- 제목·본문의 의미보존 편집
- 승인된 사진 선택·크롭·캡션 편집
- 표 행 표시순서·열너비 조정
- 중요도에 따른 강조

금지 또는 CORE 복귀:

- 가격·면적·임대료·수익률 값 직접수정
- 산정기준 삭제
- 차단 항목 강제표시
- 새 비교사례·새 임대가정 수기입력 후 즉시 렌더
- 사진 공개상태 강제변경

숫자 수정 시 UI는 ‘거래자료 수정’으로 이동해 새 관측·스냅샷·패키지를 만들도록 안내한다.

---

# 6. 사진계획

## 6.1 역할

```text
representative_exterior
road_frontage
access_route
tenant_signage
entrance
common_area
vacant_or_owner_space
parking
facility
repair_item
map
cadastral
```

## 6.2 기본 레이아웃

물건 개요는 `대표 외관 35~45% + 핵심제원 55~65%`를 기본으로 한다. 정보량과 사진 종횡비에 따라 조정한다.

## 6.3 연결

사진에는 다음을 저장한다.

- photoAssetId
- 촬영대상과 층/공간
- 제공자·촬영일/기준일
- 공개승인과 가림처리버전
- 근거로 연결된 claim/proposal/risk
- 허용 크롭 영역
- 사용 페이지·슬롯

대표사진 자동변경과 미승인 사진 폴백을 금지한다.

---

# 7. 아키타입과 기존 자산 재사용

현행 A01~A18 아키타입·테마·imlib·텍스트예산·지면검사를 재사용한다. 단, 입력계약을 바꾼다.

```text
AS-IS: MobileImPptxInput.doc.body/sections/enrichment
TO-BE: PublicationPackage + CompositionPlan + ApprovedCopyUnits + MediaPlan
```

전환:

1. 새 `PptxStudioRenderer`가 기존 아키타입 빌더를 호출
2. 새 `ContentUnitBinder`가 PagePlan을 SectionData로 변환
3. 기존 `data-binder`는 legacy 어댑터로 유지
4. 기존 `deck-sequencer`는 구문서용, 신규는 `CompositionPlanner`
5. G31~G36·G38·G40 지면/수익률 검사는 신규 channel gate report에 저장

---

# 8. 미리보기

미리보기는 실제 렌더러와 같은 입력·테마·폰트·크롭 규칙을 사용해야 한다. SVG 미리보기와 최종 PPTX가 다르면 최종 렌더 결과가 우선이며 차이를 측정한다.

필수 제공:

- 전체 슬라이드 썸네일
- 선택 슬라이드 확대
- 지면 경고 표시
- claim/proposal/photo 근거패널
- 누락·차단 내용 목록
- 수정 시 승인무효 범위

---

# 9. PPTX 전용 검사

## 차단

- package 밖 claim/proposal/photo 참조
- blocked/not_evaluated claim 노출
- 조건부 claim의 경고·basis 누락
- 페이지 간 같은 핵심값 불일치
- 글자 넘침·요소 겹침·지면 이탈
- 사진 종횡비 왜곡·최소 DPI 실패
- 사진 공개승인·가림처리 불일치
- L1.5 의견 공개승인 없음
- artifact hash 생성 실패

## 경고

- 동일 사진 동일크롭 반복
- 연속 표 페이지 과다
- 확인문구가 매물장점보다 강하게 노출
- 페이지 제목 부자연스러움
- 불필요한 빈 부록
- 본문 권장면수 초과

---

# 10. 승인·내보내기

1. CORE 패키지 검사 확인
2. composition/copy/photo/layout hash 생성
3. PPTX channel gate 실행
4. 중개인 편집승인
5. 최종 파일 렌더
6. artifact hash 생성
7. 최종파일 승인
8. 저장·다운로드·발행

렌더 후 파일이 달라지면 artifact 승인을 다시 받아야 한다. 워터마크는 requester별 다운로드 변형일 수 있으므로 기본 발행파일 해시와 워터마크 파생파일 해시를 구분한다.

---

# 11. 완료조건

- 모바일 문서 없이 packageId만으로 PPTX 생성
- 차단 산출항목·미승인 의견·미승인 사진 노출 0건
- 같은 패키지의 모바일/PPTX 핵심값 불일치 0건
- 현행 A01~A18 핵심 아키타입 회귀 통과
- 7/9/13/16면과 부록 변종 지면검사 통과
- 사진 0/1/3/8/11장 편성 회귀 통과
- 문안·사진·레이아웃 변경 시 정확한 승인무효화
- 구형 PPTX 다운로드 회귀 유지

