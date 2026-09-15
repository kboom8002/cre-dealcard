<!-- BEGIN:cre-d43-basic-pro-rules -->
# CRE IM D43 Basic/Pro IM & PPTX Archetype Rules (2026-09-11 교훈)

### 45. imlib 헬퍼 함수 시그니처 준수 (imlib Helper Signature Compliance)
- 새 아키타입(A01~A23+) 작성 시 `imlib.ts` 헬퍼 함수의 정확한 시그니처를 반드시 확인합니다.
- 주요 함수 시그니처:
  * `head(slide, pageNum: number, kicker: string, title: string)` — 라이트 슬라이드 헤더
  * `headD(slide, pageNum: number, kicker: string, title: string)` — 다크 슬라이드 헤더
  * `sub(slide, x: number, y: number, w: number, text: string, onDark?: boolean)` — 서브타이틀
  * `foot(slide, page: number, docno: string, onDark?: boolean)` — 슬라이드 푸터
- 인자 순서 혼동(docno↔pageNum)으로 인한 TS 에러가 빈번하므로 기존 아키타입(a02, a05 등)의 호출 패턴을 참조합니다.
- **위반 사례**: A23에서 `L.foot(slide, input.docno, input.watermarkText)` 호출 → TS2345 `string is not assignable to number`.

### 46. 타입 유니온 확장 시 전파 의무 (Union Type Extension Cascade)
- 리터럴 유니온 타입(`GalleryLayoutType`, `MobileIMSectionType`, `CalloutKind`, `IncomeArchetype` 등)에 새 값을 사용하는 코드를 작성할 때, 반드시 **타입 정의 파일부터 수정**합니다.
- 순서: ① 타입 정의 파일의 유니온에 새 리터럴 추가 → ② 사용 파일에서 새 값 참조 → ③ `npx tsc --noEmit`으로 전파 누락 확인
- 타입 정의와 사용 파일이 다른 경우(예: `gallery-planner.ts` 타입 ↔ `a14-gallery.ts` 사용), 서브에이전트에 위임 시 **두 파일 모두**를 명시적으로 지시합니다.
- **위반 사례**: `a14-gallery.ts`에 `GRID_2X3` 렌더링 추가 → `GalleryLayoutType` 유니온 미등록 → TS2367.
<!-- END:cre-d43-basic-pro-rules -->

<!-- BEGIN:cre-d43-basic-im-ssot-rules -->
# CRE IM D43 Basic IM SSOT Rules (2026-09-13 교훈)

### 47. Basic IM 스펙 SSOT 준수 (Basic IM Guide Compliance)
- Basic IM(`credeal_basic` 프리셋)의 슬라이드 시퀀스, 디자인 시스템, 작성 원칙은 **반드시 `docs/impipe/basic-im-guide.md`의 "표준 9단계"를 SSOT로 참조**합니다.
- `deck-sequencer.ts`에서 `input.preset === 'credeal_basic'`인 경우, 골디락스(12~20p) 시퀀스가 아닌 **전용 9섹션 시퀀스**를 반환해야 합니다:
  1. `cover` (A01, 표지 — 건물 사진 없음, 추상 배경)
  2. `summary` (A02, 요약 — 6대 핵심 지표 + 투자 포인트 3개)
  3. `building` (A04, 물건 개요 — 공부 정보 + 외관 사진 좌우 배치)
  4. `location` (A06, 입지 정보 — 지도 + 불릿 3개)
  5. `land` (A04, 토지 정보 — 지적도 + 용도지역/건폐율/용적률)
  6. `rentRollStacking` (렌트롤 표 + 스태킹 플랜 — 하나의 슬라이드에 병합)
  7. `yieldFormula` (A23, 투자수익률 분석 — As-Is + 안정화 Cap Rate)
  8. `gallery` (A14, 현장 사진 — 6컷 그리드)
  9. `closing` (A10, 문의 및 유의사항 — 연락처 + 면책조항)
- **Basic IM에 포함하지 않는 슬라이드**: `capital`, `totalReturn`, `dcf`, `sensitivity`, `loan`, `tax`, `thesis`, `risk`, `checklist`, `process`, `stability`, `profit` 등 Pro IM 전용/고급 분석 슬라이드.
- **가이드 §1 명시**: "감정평가, DCF, 민감도 분석 같은 고급 분석은 포함하지 않습니다."
- `generate-async/route.ts`에서 `preset`을 `generateMobileIMHandler`에 반드시 전달하고 `document_objects.body.preset`에 영속화해야 합니다.
- **위반 사례**: `yieldFormula`가 `SLIDE_PRIORITY`에 미등록 → 골디락스 절삭으로 Basic IM 핵심 슬라이드 탈락. Pro IM 슬라이드(`capital`, `totalReturn`, `thesis` 등)가 Basic IM에 혼입.
<!-- END:cre-d43-basic-im-ssot-rules -->