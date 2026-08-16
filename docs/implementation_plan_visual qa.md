# PPTX Visual QA — 상용화 정밀 검사 구현 계획

## 목표

PPTX 렌더링의 **데이터 정확성**과 **디자인 완성도**를 AI 이미지 분석으로 정밀 검증하고, 발견된 결함을 코드 수정으로 해결하는 **자동화된 반복 루프**를 구축합니다.

## 파이프라인 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: PPTX 생성 & PNG 변환                               │
│  ┌──────┐    ┌──────────┐    ┌──────────────┐              │
│  │ API  │───▶│ PPTX 파일 │───▶│ PowerPoint   │───▶ PNG×N   │
│  │ fetch │    │ 다운로드   │    │ COM 변환     │              │
│  └──────┘    └──────────┘    └──────────────┘              │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: AI Visual Inspection                              │
│  ┌──────┐    ┌──────────┐    ┌──────────────┐              │
│  │ PNG  │───▶│ AI 이미지  │───▶│ 결함 리포트   │              │
│  │ 로드  │    │ 분석      │    │ (JSON/MD)    │              │
│  └──────┘    └──────────┘    └──────────────┘              │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: Fix & Re-verify                                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐          │
│  │ 결함 분류  │───▶│ 코드 수정  │───▶│ Phase 1~2    │          │
│  │ 우선순위   │    │ 적용      │    │ 재실행       │          │
│  └──────────┘    └──────────┘    └──────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## 테스트 매트릭스

### 빌딩 × 티어 × 프리셋 조합

| 빌딩 | 포스처 | 등급 | 티어 | 프리셋 | 예상 슬라이드 |
|---|---|---|---|---|---|
| **잠원** | development | B | basic | golden_institutional | ~8p |
| **잠원** | development | B | basic | pro_dark_obsidian | ~8p |
| **당산** | income | C | basic | golden_institutional | ~8p |
| **당산** | income | C | basic | corporate_clean | ~8p |
| **연남** | income | B | basic | golden_institutional | ~8p |
| **연남** | income | B | basic | executive_gold | ~8p |

> **6 조합 × ~8p = ~48 슬라이드 PNG** 생성 예상

### 슬라이드별 검사 항목 (총 12개 체크포인트)

| # | 검사 항목 | 카테고리 | 검증 내용 |
|---|---|---|---|
| V01 | **텍스트 가독성** | 디자인 | 폰트 크기 적정, 텍스트 잘림/오버플로 없음 |
| V02 | **레이아웃 정렬** | 디자인 | 요소들이 정렬되어 있고 겹침 없음 |
| V03 | **색상 대비** | 디자인 | 배경 대비 텍스트 충분한 대비 (WCAG AA 수준) |
| V04 | **빈 영역** | 디자인 | 의미 없는 빈 공간이 과도하지 않음 |
| V05 | **한글 렌더링** | 디자인 | 한글 깨짐, 토프 이슈 없음 |
| V06 | **숫자 포맷** | 데이터 | 금액/면적/비율 포맷 일관성 (억, 평, %) |
| V07 | **데이터 유무** | 데이터 | placeholder/NaN/undefined/null 텍스트 노출 없음 |
| V08 | **테이블 구조** | 데이터 | 표가 깨지지 않고 행/열 정렬 |
| V09 | **지도/이미지** | 콘텐츠 | 지도 이미지 정상 로드, 빈 이미지 없음 |
| V10 | **면책조항** | 컴플라이언스 | 마지막 슬라이드에 법적 면책 존재 |
| V11 | **브랜딩** | 디자인 | 로고/컬러가 테마에 맞게 적용 |
| V12 | **전문성** | 종합 | 기관투자자에게 전달해도 손색 없는 수준 |

---

## 구현 상세

### Phase 1: PPTX 다운로드 + PNG 변환 스크립트

#### [NEW] `src/tests/visual/pptx-visual-qa.ts`

PPTX를 다운로드하고 PowerPoint COM으로 PNG 변환하는 오케스트레이터:

```typescript
// 1. fetch로 PPTX 바이너리 다운로드
// 2. 임시 파일로 저장
// 3. PowerShell COM 자동화로 각 슬라이드를 PNG로 내보내기
// 4. 결과 PNG 경로 배열 반환
```

#### [NEW] `src/tests/visual/export-slides.ps1`

기존 `export_all_slides.ps1` 기반의 PowerPoint COM 스크립트:

```powershell
$pptApp = New-Object -ComObject PowerPoint.Application
$pres = $pptApp.Presentations.Open($pptxPath)
foreach ($slide in $pres.Slides) {
    $slide.Export("$outputDir\slide_$($slide.SlideIndex).png", "PNG", 1920, 1080)
}
```

### Phase 2: AI 이미지 분석

#### 방법론

각 PNG를 `view_file`로 로드하여 12개 체크포인트(V01~V12)에 대해 AI 분석:

```
for each slide PNG:
  1. view_file(slide.png)  → 이미지 인식
  2. V01~V12 체크리스트 평가
  3. 결함 발견 시:
     - severity: CRITICAL / MAJOR / MINOR
     - 위치: 슬라이드 번호 + 영역 설명
     - 원인 추정: archetype / data-binder / imlib / theme
     - 수정 방향 제안
```

#### [NEW] 결함 리포트 아티팩트

`pptx_visual_defects.md` — 발견된 모든 결함을 구조화하여 기록

### Phase 3: 코드 수정 & 재검증

수정 대상 파일 (결함 유형별):

| 결함 유형 | 수정 파일 |
|---|---|
| 텍스트 오버플로 | `imlib.ts` → `stat()`, `rows()` 폰트 사이징 |
| 빈 슬라이드 | `pptx-renderer.ts` → graceful degradation |
| 데이터 바인딩 오류 | `data-binder.ts` → `transformForArchetype()` |
| 테이블 깨짐 | `imlib.ts` → `table()`, `a03-large-table.ts` |
| 지도 미로드 | `image-optimizer.ts` → 폴백 체인 |
| 테마 색상 오류 | `pptx-theme.ts`, `imlib.ts` → `setActiveTheme()` |
| 면책조항 누락 | `a10-closing.ts` |

---

## 실행 계획

### Sprint 1: 인프라 구축 (~15분)
- [ ] PPTX 다운로드 스크립트 작성
- [ ] PowerShell PNG 변환 스크립트 작성
- [ ] 6개 조합 PPTX 다운로드 + PNG 생성

### Sprint 2: 1차 Visual Inspection (~20분)
- [ ] ~48개 슬라이드 PNG AI 분석
- [ ] V01~V12 체크포인트별 결함 식별
- [ ] 결함 리포트 작성 (severity 분류)

### Sprint 3: 결함 수정 & 재검증 (~25분)
- [ ] CRITICAL 결함 코드 수정
- [ ] MAJOR 결함 코드 수정
- [ ] PPTX 재생성 → PNG 재변환 → 재분석
- [ ] Before/After 비교 리포트

---

## 검증 계획

### 자동화
- PPTX 스냅샷 테스트 (기존 GS01-GS05)가 구조 변경 감지
- `npm run build` 통과 확인

### 수동 검증 (AI 시각 검사)
- 수정 전/후 슬라이드 PNG 나란히 비교
- 12개 체크포인트 재평가

> [!IMPORTANT]
> PowerPoint COM 자동화는 Windows에 Microsoft PowerPoint가 설치되어 있어야 합니다. 설치 여부를 Sprint 1에서 먼저 확인합니다.
