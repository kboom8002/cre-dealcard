# AI 기반 프로덕션 E2E 시각 검수 자동화 시스템

## 목표

`human-e2e-inspection-guide.md`의 10개 테스트 케이스를 **AI 에이전트가 인간 검수자와 동일한 방식으로** 자동 실행:
1. PPTX 인메모리 생성 → 슬라이드별 이미지 캡처 → AI 비전 검사
2. 모바일 IM 뷰어 브라우저 자동화 → 섹션별 스크린샷 → AI 비전 검사
3. 결과를 구조화된 검수 리포트로 출력

## 현재 인프라

| 도구 | 상태 | 용도 |
| :--- | :--- | :--- |
| Playwright 1.62.1 | ✅ 설치됨 | 브라우저 자동화 + 스크린샷 |
| LibreOffice | ✅ 설치됨 | PPTX → PNG 슬라이드 변환 |
| Python 3.13.2 | ✅ 설치됨 | 보조 스크립트 |
| AdmZip / JSZip | ✅ 설치됨 | PPTX XML 직접 파싱 |
| MobileImPptxRenderer | ✅ 존재 | 인메모리 PPTX 생성 |
| visual-qa-pipeline.ts | ✅ 존재 | 확장 기반 |
| Supabase + .env.local | ✅ 존재 | 인증/데이터 |

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase A: PPTX 슬라이드별 시각 검사                                   │
│                                                                     │
│ posture-e2e-fixtures.ts ──▶ MobileImPptxRenderer ──▶ .pptx buffer   │
│                                      │                              │
│              ┌───────────────────────┤                              │
│              ▼                       ▼                              │
│   AdmZip XML 텍스트 검사     LibreOffice → slide_N.png              │
│   (NaN/undefined/null)              │                              │
│                                     ▼                              │
│                         AI 비전 검사 (에이전트 view_file)            │
│                         • 텍스트 가독성                              │
│                         • 레이아웃 정합성                            │
│                         • 숫자 포맷 정확성                           │
│                         • 빈 슬라이드 여부                           │
├─────────────────────────────────────────────────────────────────────┤
│ Phase B: 모바일 IM 뷰어 브라우저 캡처 검사                           │
│                                                                     │
│ Playwright → localhost:3000/im-lite/[id] → 390×844 viewport        │
│              │                                                      │
│   ┌──────────┼──────────────┐                                       │
│   ▼          ▼              ▼                                       │
│ Hero Card  각 섹션 아코디언  하단 FloatingActionBar                   │
│ 스크린샷    (7개 × expand    버튼 존재 확인                          │
│            + 스크린샷)                                               │
│              │                                                      │
│              ▼                                                      │
│   AI 비전 검사 (에이전트 view_file)                                  │
│   • 섹션 제목 원문 일치                                              │
│   • 아이콘 = 이모지 (영문 X)                                        │
│   • 테이블 렌더링 정상                                               │
│   • 텍스트 오염 없음                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Phase C: 10개 케이스 전수 실행 + HTML 리포트                         │
│                                                                     │
│ 5 포스처 × (표준 + 엣지) = 10 케이스                                │
│ 각 케이스: Phase A + Phase B → JSON 판정 결과                       │
│ 전체 결과 → HTML 리포트 + Markdown 요약                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Proposed Changes

---

### Phase A: PPTX 슬라이드별 시각 검사

#### [NEW] `src/tests/e2e/ai-visual-e2e-runner.ts`

**핵심 엔트리포인트**. 10개 케이스를 순회하면서:
1. `posture-e2e-fixtures.ts`에서 fixture 로드
2. `MobileImPptxRenderer.render()` → buffer 생성
3. buffer를 `.pptx` 파일로 저장
4. AdmZip으로 XML 텍스트 검사 (NaN/undefined/null/[object Object])
5. LibreOffice CLI로 PPTX → 슬라이드별 PNG 변환:
   ```bash
   "C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to png --outdir <output_dir> <pptx_file>
   ```
6. 각 PNG를 AI 에이전트의 `view_file`로 보고 시각 검사

#### [MODIFY] `src/tests/e2e/posture-e2e-fixtures.ts`

기존 5개 포스처 fixture에 **엣지 케이스** fixture 5개 추가:
- `case01b_hongdae_vacant` (수익형 엣지: 공실+위반건축물)
- `case02b_nonhyeon_partial` (사옥형 엣지: 부분 임대)
- `case03b_munrae_demolition` (개발형 엣지: 철거/토양정화)
- `case04b_gangnam_hotel` (운영형 엣지: 호텔 GOP)
- `case05b_jongno_inheritance` (밸류애드 엣지: 종중 급매)

#### [NEW] `src/tests/e2e/pptx-slide-capturer.ts`

PPTX buffer → LibreOffice → PNG 변환 유틸리티:
```typescript
export async function captureSlides(pptxBuffer: Buffer, outputDir: string): Promise<string[]> {
  // 1. Write buffer to temp .pptx file
  // 2. Invoke LibreOffice headless: soffice --headless --convert-to png
  // 3. Return array of PNG file paths
}
```

---

### Phase B: 모바일 IM 뷰어 브라우저 캡처 검사

#### [NEW] `src/tests/e2e/browser-im-capturer.ts`

Playwright 기반 IM 뷰어 자동 캡처:
```typescript
export async function captureImViewer(buildingId: string, outputDir: string): Promise<CaptureResult> {
  // 1. Launch Chromium (headless) at 390×844
  // 2. Navigate to /im-lite/[buildingId]?tier=basic
  // 3. Wait for networkidle
  // 4. Capture: hero card, photo gallery, each of 7 section accordions (expand + screenshot)
  // 5. Capture: floating action bar (5 buttons)
  // 6. Full page scroll capture
  // 7. Return paths to all PNG files
}
```

> [!IMPORTANT]
> **인증 문제**: `/im-lite/` 는 **public 경로**이므로 로그인 불필요.  
> 단, 테스트 데이터가 DB에 존재해야 합니다. 두 가지 접근법:
> 
> **Option 1 (권장)**: 프로덕션/스테이징에 이미 생성된 IM으로 테스트  
> **Option 2**: 로컬 dev 서버 + Supabase에 테스트 fixture 삽입 후 테스트

---

### Phase C: AI 비전 검사 + 리포트

#### [NEW] `src/tests/e2e/ai-vision-inspector.ts`

캡처된 PNG 이미지를 AI가 분석하는 검사 체크리스트:

**PPTX 슬라이드 검사 (Phase A)**:
| # | 검사 항목 | AI 비전 판정 기준 |
| :--- | :--- | :--- |
| PA01 | 표지 슬라이드 | "BASIC IM" 텍스트, 자산명, 매매가 존재 |
| PA02 | 핵심요약 | 4~7개 지표 카드, 숫자에 쉼표 포맷 |
| PA03 | 입지 | 지도/교통 관련 텍스트 존재 |
| PA04 | 건물/포스처 전용 | 포스처별 고유 콘텐츠 존재 |
| PA05 | 렌트롤/데이터 테이블 | 테이블 행열 정렬, 숫자 완전성 |
| PA06 | 리스크 | 3개 블록 카드 구조 |
| PA07 | 투자 논거 | 핵심 논점 텍스트 존재 |
| PA08 | 다음 단계 | STEP 카드 구조 |
| PA09 | 면책 | 법적 면책 문구 존재 |
| PA10 | **빈 슬라이드 없음** | 모든 슬라이드에 텍스트/표/도형 존재 |
| PA11 | **텍스트 잘림 없음** | 경계 밖 텍스트 없음 |

**IM 뷰어 검사 (Phase B)**:
| # | 검사 항목 | AI 비전 판정 기준 |
| :--- | :--- | :--- |
| PB01 | Hero 2×2 지표 | 4개 지표 카드 + 숫자 가시 |
| PB02 | 섹션 제목 7개 | 한국어 제목, 영문 컴포넌트명 없음 |
| PB03 | 아이콘 = 이모지 | 이모지 아이콘, Lucide 영문 텍스트 없음 |
| PB04 | 테이블 렌더링 | 렌트롤 등 마크다운 테이블 정상 렌더 |
| PB05 | 하단 버튼 | 📞📄📊🔗 4~5개 버튼 가시 |
| PB06 | Pro 업그레이드 배너 | Basic 티어에서 Pro 안내 배너 표시 |
| PB07 | 텍스트 오염 | NaN, undefined 등 오염 문자열 없음 |

#### [NEW] `docs/test/stress/e2e-outputs/visual-qa/report.html`

10개 케이스의 판정 결과를 시각적 HTML 리포트로 출력:
- 케이스별 Pass/Fail 상태
- 슬라이드 썸네일 + 판정 결과
- IM 뷰어 캡처 + 판정 결과
- 전체 점수 (Pass 비율)

---

## 실행 방식

AI 에이전트가 다음 순서로 실행합니다:

```
1. posture-e2e-fixtures.ts 업데이트 (5개 엣지 케이스 추가)
2. ai-visual-e2e-runner.ts 작성
3. pptx-slide-capturer.ts 작성
4. 각 케이스에 대해:
   a. renderer.render() → .pptx 생성 + AdmZip XML 검사
   b. LibreOffice → slide PNG 변환
   c. 에이전트가 view_file로 각 PNG 열어 시각 검사
   d. 검사 결과 JSON 기록
5. (dev 서버 구동 시) browser-im-capturer.ts 실행
   a. Playwright로 각 im-lite 페이지 캡처
   b. 에이전트가 view_file로 각 PNG 열어 시각 검사
6. 전체 결과 → report.md + report.html 생성
```

## Open Questions

> [!IMPORTANT]
> **Q1**: Phase B (브라우저 캡처)를 실행하려면 dev 서버와 DB에 테스트 데이터가 필요합니다.
> - **Option A**: 프로덕션/스테이징 URL을 직접 지정 → 이미 생성된 IM으로 테스트
> - **Option B**: `npm run dev` 후 Supabase에 fixture 삽입 → 로컬 테스트
> - **Option C**: Phase A(PPTX 시각 검사)만 우선 실행하고, Phase B는 별도 진행
>
> 어떤 방식을 선호하시나요?

> [!NOTE]
> **Q2**: 10개 케이스 전수 실행은 LibreOffice 변환 + AI 비전 검사로 **케이스당 약 2~3분** 소요됩니다.
> 전수(10개) 진행할까요, 아니면 대표 케이스(income 표준 1개)로 먼저 파일럿 실행 후 확대할까요?

## Verification Plan

### Automated Tests
```bash
npx vitest run src/tests/e2e/ai-visual-e2e-runner.ts
```

### Manual Verification
- 생성된 PNG 이미지들이 `docs/test/stress/e2e-outputs/visual-qa/` 에 정상 저장
- AI 비전 검사 리포트의 판정 결과 검토
- P0/P1 결함 발견 시 즉시 보고
