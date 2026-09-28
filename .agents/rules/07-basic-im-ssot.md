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

<!-- BEGIN:cre-d44-production-quality-rules -->
# CRE IM D44 Production IM Quality & Layout Rules (2026-09-21 교훈)

### 61. Sharp Composite 정수 좌표 의무 (Sharp Composite Integer Coordinates Mandate)
- Sharp의 `.composite()` 연산에서 `left`, `top` 오버레이 좌표는 **반드시 정수(integer)**이어야 합니다.
- 부동소수점(float) 픽셀 좌표가 전달될 경우 `Expected integer for left/top` 에러로 Sharp 프로세스가 즉시 크래시되어 전체 파이프라인이 중단됩니다.
- 모든 오버레이 좌표 계산식은 음수 방지 및 정수 반올림 가드를 필수로 적용합니다:
  * `left: Math.max(0, Math.round(leftPx))`
  * `top: Math.max(0, Math.round(topPx))`
- **위반 사례**: `image-optimizer.ts`에서 지적도 오버레이 좌표 계산 시 소수점 픽셀 좌표가 그대로 전달되어 Sharp 크래시 및 PPTX 생성 실패.

### 62. 스탯 카드 텍스트 오버플로우 방지 및 동적 스케일링 규칙 (Stat Card Dynamic Font Scaling & Overflow Budget)
- 스탯 카드(A02 등)에 주차 상세 정보("자주식 5대 / 기계식 21대 (총 26대)")나 긴 지표 라벨("연 수익률(Cap Rate)") 등이 렌더링될 때, 하드코딩된 폰트 크기(`vs: 17/20`)와 협소한 텍스트 예산으로 인해 줄바꿈 및 하단 카드 겹침/이탈이 발생합니다.
- **해결 원칙:**
  1. `text-budget.ts`의 `TEXT_LIMITS` 현실화 (`statValue: 24`, `statLabel: 22`).
  2. `imlib.ts`의 `stat()` 함수에서 값/라벨 길이에 따른 다단계 `dynamicVs` / `labelFontSize` 자동 산출 적용:
     * 값 길이: ≤6자 22pt, ≤10자 18pt, ≤16자 14pt, ≤24자 12pt, 초과 10pt
     * 라벨 길이: ≤12자 9.5pt, ≤18자 8.5pt, 초과 7.5pt
  3. 아키타입에서 하드코딩된 `vs` 옵션을 제거하여 `imlib.stat()`의 동적 폰트 스케일링이 작동하도록 위임합니다.
  4. PptxGenJS 옵션에 `shrinkText: true`와 `lineSpacingMultiple: 1.0`을 명시하여 줄간격 팽창으로 인한 오버플로우를 차단합니다.

### 63. 대한민국 CRE 물건 개요(A04) 11대 표준 제원 및 포스처별 우선순위 (Korean CRE Property Overview Standardization)
- 대한민국 상업용 부동산(CRE) IM에서 물건 개요는 투자자/임차인의 핵심 실사 항목으로, **11대 표준 제원**을 표준 항목으로 제공해야 합니다:
  1. 대지면적, 2. 연면적, 3. 건축면적, 4. 건폐율, 5. 용적률, 6. 주용도, 7. 주구조, 8. 층수(지하~지상), 9. 주차대수, 10. 승강기, 11. 사용승인일
- 포스처별 특성에 맞춘 제원 우선순위를 적용합니다:
  * **Trading / Income**: 임대 현황, 주차대수, 승강기 등 운영 효율성 및 캐시플로우 연계 제원 강조.
  * **Value-Add / Development**: 건폐율/용적률(법정 한도 대비 잔여 여유율), 대지면적, 용도지역 등 개발/증축/리모델링 잠재력 제원 최우선 배치.
- 모의/더미 데이터(Rule 34)는 절대 사용하지 않으며, 실데이터가 존재하지 않을 때만 중립적 기호(`-`)로 표기합니다.

### 64. 토지 정보 + 지적도 단일 슬라이드 통합 및 필지 경계선 시각화 (Cadastral & Land Info Single Slide Unification & Boundary Overlay)
- 토지 정보(용도지역, 건폐율, 용적률 등)와 지적도는 공간적·법적 상관관계가 밀접하므로, 별도 2개 슬라이드로 분리하여 중복/빈약한 지면을 만드는 것을 지양하고, **단일 A06 다이어그램 슬라이드**로 통합합니다:
  * 좌측(58%): 지적도 이미지 (필지 경계선 + 용도지역 뱃지 오버레이)
  * 우측(42%): 토지 제원 6~7행 표 + 동적 공법/규제 가치분석 콜아웃
- `deck-sequencer.ts`에서 지적도 에셋이 존재할 경우(`hasCadastralMap: true`), 독립된 지적도 전용 슬라이드(`cadastral`)의 중복 편성을 자동 억제(`suppressStandaloneCadastral: true`)하여 중복 슬라이드 발생을 차단합니다.
- 지적도 이미지에는 대상 매물 필지를 명확히 식별할 수 있도록 **붉은색 경계선(Red `#EF4444`, 6px stroke)** 및 용도지역 뱃지를 오버레이하여 시각적 직관성을 보장합니다.

### 65. 렌트롤 R2 표준 10열 칼럼 정합 및 스태킹 플랜 최적 비율 (Rent Roll R2 Standard 10-Column Parity & Stacking Layout)
- Basic/Pro IM의 렌트롤은 R2 Excel 표준 10개 칼럼을 표준으로 렌더링해야 합니다:
  `층`, `임차인`, `용도`, `임대면적`, `전용면적`, `보증금`, `월임대료`, `관리비`, `월합계`, `만기일`
- 렌트롤 + 스태킹 플랜 병합 슬라이드(`rentRollStacking`)에서 10열의 긴 테이블 너비를 충분히 확보하기 위해 스태킹 플랜 폭을 컴팩트(≤ 2.2")하게 최적화하고, 렌트롤 테이블 영역(≥ 9.0")을 보장합니다.
- 열 너비 비례 배분과 동적 폰트 스케일링(헤더 8.5pt, 본문 7.5~8.0pt)을 적용하여 10개 열이 잘리거나 셀 내 줄바꿈으로 깨지지 않도록 레이아웃을 엄격히 통제합니다.

### 66. Sharp SVG Overlay CJK Tofu 방지 원칙 (Serverless Font Invariant)
- Vercel/Linux 서버리스 환경에는 한글/CJK 시스템 폰트가 설치되어 있지 않습니다.
- Sharp/librsvg로 래스터화되는 SVG 템플릿(지도 핀, 지적도 마커, POI 배지 등)의 `<text>` 태그에는 한글 문자열(`본건 위치`, `★ 본건` 등)을 **절대 포함하지 않아야 합니다**.
- SVG 내부 텍스트는 반드시 **ASCII 호환 식별자(`TARGET`, `S`, `5min`)** 또는 기호(`★`)만 허용하며, 폰트 패밀리는 `Arial`을 명시합니다.
- 한글 텍스트 표기가 필요한 경우 비트맵 SVG 합성이 아닌, **PptxGenJS 네이티브 텍스트 셰이프** 또는 클라이언트 레이어(HTML/Canvas)에 위임해야 합니다.

### 67. 외부 공공 API 도메인 및 Referer 고정 규칙 (Government API Domain & Referer Invariant)
- V-World WMS/WFS, 국토교통부 개별공시지가 등 대한민국 공공/지리정보 API는 발급 시 사전 등록된 특정 도메인(`credeal.net` / `cre-dealcard.vercel.app`)의 `Referer` 및 `domain` 파라미터만 인증합니다.
- Vercel 배포 시 자동 주입되는 임의 서브도메인(`process.env.VERCEL_URL`)을 Referer로 사용하면 외부 API가 403 Forbidden을 반환하여 지적도 및 10년 공시지가 조회가 영구 누락됩니다.
- 공공 API 클라이언트(`vworld-config.ts` 등)는 `VERCEL_URL`을 절대 직접 참조하지 않고 등록된 대표 도메인(`process.env.VWORLD_REFERER || 'https://credeal.net'`)을 기본값으로 사용해야 합니다.

### 68. PPTX 테이블 컬럼-데이터 1:1 일치 규칙 (OpenXML Table Cell-Header Parity)
- PPTXGenJS 및 OpenXML 표준에서 테이블의 열 정의(`HEADERS`, `colW`) 수와 각 행(`rows[i]`)의 셀 배열 길이는 **반드시 정확히 일치**해야 합니다.
- 9개 열 헤더에 10개 원소 배열이 전달되면 컬럼 오정렬, 텍스트 줄바꿈 및 테이블 렌더링 붕괴가 발생합니다.
- 렌트롤 테이블 정규화 시 `splice` 등으로 관리비 열을 제거하여 9열이 된 경우, `mappedRow`와 요약 행(`합계`)도 `row[0]`부터 `row[8]`까지 정확히 9개 열만 매핑해야 합니다.

### 69. Basic IM 외부 데이터 DB 영속화 원칙 (Enrichment DB Persistence First)
- V-World 지적도 base64 이미지(`cadastralMapImage`), 10개년 공시지가(`landPriceHistory`), POI 데이터는 IM 생성(`generateMobileIM`) 시점에 즉시 수집하여 `document_objects.body.enrichment`에 영속화해야 합니다.
- `writer.ts`에서 좌표 및 PNU 추출 시 `building_ssot_lite`의 `lat`/`lng` 및 `raw_address` 폴백 경로를 필수 연결합니다.
- PPTX 렌더러와 웹 뷰어는 DB에 영속화된 `enrichment`를 1순위로 소비해야 하며, 실시간 외부 API 장애 상황에서도 100% 무결한 PPTX(지적도 A06 + 공시지가 차트 A23) 출력을 보장해야 합니다.

### 70. 스태킹 플랜 층수 라벨 너비 및 텍스트 인체공학 (Stacking Plan Floor Label Ergonomics)
- 좌측 스태킹 플랜의 층수 라벨은 `지하1층`, `B1~B3`, `10F` 등의 긴 텍스트가 줄바꿈되거나 바닥과 겹치지 않도록 **최소 0.50" 이상 너비(`w: 0.52`)**를 할당해야 합니다.
- 층별 바닥면적(㎡/평) 기준 셋백 너비 비례 사각형을 렌더링하고, 바 내부 너비가 허용되는 경우 `테넌트명 (00평)` 형식으로 평수 환산값을 함께 표시합니다.
<!-- END:cre-d44-production-quality-rules -->