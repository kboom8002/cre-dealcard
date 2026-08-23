# CREDEAL 개발팀 자료 요청 답변서 — Tier 2

> 작성일: 2026-08-23
> 근거: 코드베이스 정밀 감사 (`src/domain/building/mobile-im/pptx/` 및 관련 파일)

---

## T2-1 · `data-binder.ts` 파싱 규칙

### 답변

① **AI가 생성한 마크다운 표를 어떻게 파싱합니까 (정규식·파서 라이브러리)**

**자체 수동 파싱**입니다. 외부 파서 라이브러리(`marked`, `remark` 등)는 사용하지 않습니다. `parseMarkdownTable` 함수(`data-binder.ts:1346`)에서 `\n`으로 줄을 나누고 `|`를 기준으로 `split`하여 배열로 변환하는 원시적인 방식입니다.

```typescript
// data-binder.ts:1346 (parseMarkdownTable 핵심 로직)
const lines = markdown.split('\n');
// |로 분리 → 헤더 추출 → 구분선(---) 스킵 → rows 추출
```

---

② **표 구조가 예상과 다르면 어떻게 됩니까 (빈 슬라이드·오류·폴백)**

3단계 방어 구조:
1. `parseMarkdownTable`이 표로 인식하지 못하면 빈 배열 반환
2. 아키타입 빌더(`buildA04Props` 등)에서 `.rows.length` 조건에 매칭 실패하면 빈 props 생성
3. **최종 폴백**: `pptx-renderer.ts`의 `addFallbackContent` 함수(`L43`)에서 본문 도형(`hasBodyShapes`, y≥1.7 영역)이 없을 경우, `data.content` 원문 Markdown을 파싱하여 텍스트+표 형태로 재렌더링

**결론:** 오류(Exception)는 발생하지 않지만, 표 인식 실패 시 슬라이드가 빈약하게 채워질 수 있습니다.

---

③ **새 아키타입 추가 시 수정 지점이 몇 군데입니까**

**최소 4곳**입니다:

| # | 수정 지점 | 파일 · 라인 |
|---|---|---|
| 1 | `SECTION_TYPE_TO_DATA_KEY` 매핑 추가 | `data-binder.ts:22` |
| 2 | `DATA_KEY_ARCHETYPE` 매핑 추가 | `data-binder.ts:48` |
| 3 | `transformForArchetype` switch문 케이스 추가 | `data-binder.ts:271` |
| 4 | `buildAxxProps` 전용 파서 함수 신규 작성 | `data-binder.ts` 내 또는 `archetypes/` 디렉토리 |

추가적으로, `deck-sequencer.ts`의 슬라이드 시퀀스 배열에도 해당 dataKey를 추가해야 합니다.

---

④ **`dataKey` ↔ 섹션 매핑이 하드코딩입니까 설정입니까**

**하드코딩**입니다. `SECTION_TYPE_TO_DATA_KEY` (L22, 14종) 및 `DATA_KEY_ARCHETYPE` (L48, 29종) 객체에서 정적 매핑을 사용합니다. DB나 설정 파일에서 런타임으로 로드하는 구조가 아닙니다.

### 추가 확인 사항

- **`sanitizePersona` (L1245)**: `.replace()` 정규식 체인으로 시스템 메시지, 페르소나 지칭 단어(`60대`, `자산가` 등)를 제거하고, 이모지를 텍스트 라벨로 변환합니다 (예: `🚇` → `[교통]`)
- **`stripMarkdown` (L1285)**: 모든 Markdown 기호(`#`, `**`, `_`), HTML 태그, 잔여 이모지 등을 정규식으로 완전 제거하여 순수 텍스트만 반환합니다

---

## T2-2 · `imlib.ts` 렌더 방식

### 답변

① **pptxgenjs입니까 자체 OOXML 생성입니까**

**`pptxgenjs` (버전 4.0.1)** 라이브러리를 사용합니다 (`package.json`, `imlib.ts:10`).

---

② **좌표 단위는 (인치·EMU·포인트)**

**인치(Inch)** 단위입니다 (`imlib.ts:8` 주석). 예: `curY = 1.62`, `maxY = 6.8`, 슬라이드 기본 크기 13.33 × 7.5 inch (16:9).

---

③ **슬라이드 마스터·레이아웃 개념을 씁니까**

**사용하지 않습니다.** PPTX 네이티브 슬라이드 마스터/레이아웃 기능 대신, `addSlide()` 후 `addShape`, `addText`로 캔버스에 직접 절대 좌표 기반으로 렌더링합니다.

---

④ **표(table) 렌더를 지원합니까**

**지원합니다.** `pptx-renderer.ts` L125에서 `slide.addTable(...)` 호출이 존재합니다. LTV 시나리오 표 등의 렌더링에 활용 가능합니다.

---

⑤ **한글 폰트 임베딩 방식 (Pretendard)**

`fontFace: KR` 옵션으로 폰트명(`'Pretendard'` 또는 `'맑은 고딕'`)을 지정하지만, pptxgenjs의 한계상 실제 `.ttf`/`.woff` 폰트 파일을 PPTX 내에 임베드(Embed)하는 코드는 **없습니다**. 뷰어 PC에 설치된 폰트를 참조하는 방식이므로, 미설치 환경에서는 대체 폰트로 렌더링됩니다.

### 첨부
- `src/domain/building/mobile-im/pptx/imlib.ts`
- `src/domain/building/mobile-im/pptx/pptx-renderer.ts` (581줄)
- `src/domain/building/mobile-im/pptx/pptx-theme.ts`

---

## T2-3 · `premium-template-engine.ts` 발동 현황

### 답변

① **폴백 출력물의 품질을 평가해 본 적 있습니까**

**없습니다.** 코드베이스 내에 폴백 출력물에 대한 정량적/정성적 품질 평가 로직은 존재하지 않습니다.

---

② **폴백과 AI 생성 중 중개인 수정률이 더 낮은 쪽은**

**모릅니다.** 폴백 vs AI 생성 간의 수정률을 추적·비교하는 코드는 존재하지 않습니다.

---

### 추가 확인 — 폴백 발동 조건

`pptx-renderer.ts`의 `addFallbackContent` 함수(L43)에서 발동됩니다:

```
아키타입 빌더 실행 → 본문 영역(y ≥ 1.7) 내 도형(shape) 존재 여부 확인
  └─ 도형 있음 → 정상 렌더링 완료
  └─ 도형 없음 → addFallbackContent 발동 → data.content 텍스트 기반 재렌더링
```

폴백 발동률을 로깅하는 코드는 **없습니다**.

---

## T2-4 · PPTX 실물 파일 3건

### 답변

`docs/test/e2e-results/` 폴더에 E2E 테스트로 생성된 PPTX 파일들이 보관되어 있습니다:

| 파일명 | 크기 | 유형 |
|---|---:|---|
| `credeal_signature_dangsan_basic.pptx` | 174 KB | income Basic |
| `credeal_signature_jamwon_basic.pptx` | 178 KB | development Basic |
| `credeal_signature_yeonnam_basic.pptx` | 159 KB | Basic |
| `p0p1p2_income_pro.pptx` | 457 KB | income Pro |
| `p0p1p2_development_pro.pptx` | 378 KB | development Pro |
| `p0p1p2_operating_pro.pptx` | 368 KB | operating Pro |
| `p0p1p2_owner_occupied_pro.pptx` | 430 KB | owner_occupied Pro |
| `p0p1p2_trading_pro.pptx` | 463 KB | trading Pro |

요청된 "income Basic 1건 · income Pro 1건 · 폴백 생성 1건" 중 **폴백 전용 PPTX 파일은 별도로 생성되어 있지 않습니다** (폴백은 정상 PPTX 내 개별 슬라이드 단위로 발동).

---

## T2-5 · E2E 테스트 현황

### 답변

① **현재 E2E 케이스가 몇 개입니까 · 무엇을 검증합니까**

`src/tests/e2e/ai-visual-e2e-runner.ts` 기준 **6개** 대표 케이스:

| # | 케이스 | 검증 내용 |
|---|---|---|
| 1 | 수익형 (income) | 슬라이드 장수(≥7), XML 무결성(NaN/null 없음), 핵심 4대 지표 |
| 2 | 사옥형 (owner_occupied) | 동일 |
| 3 | 개발형 (development) | 동일 |
| 4 | 밸류애드형 | 동일 |
| 5 | 운영형 (operating) | 동일 |
| 6 | 엣지 케이스 | 빈 슬라이드 여부, 입지 다이어그램 렌더링 |

추가로 실매물 E2E 테스트 3종(잠원/당산/양평)이 `src/tests/e2e/` 내에 구축되어 있습니다.

---

② **"AI 시각 분석 좌/우 중복 체크"는 어떻게 동작합니까**

AI 비전 모델을 호출하여 좌/우 레이아웃 중복을 자동 판별하는 코드는 **존재하지 않습니다**. `.agents/AGENTS.md`에 규칙으로 선언되어 있을 뿐, 자동화된 검증 로직은 미구현입니다.

---

③ **재무 계산 단위 테스트가 있습니까**

**있습니다:**
- `src/domain/building/mobile-im/__tests__/financials.test.ts`
- `src/domain/building/mobile-im/__tests__/posture-financials.test.ts`

수익률 계산, 자본이득, 시나리오별 Cap Rate 등을 검증합니다.

---

④ **골든 스냅샷 비교가 있습니까**

**없습니다.** 이미지 스냅샷 기반의 회귀 테스트(`toMatchImageSnapshot` 등)는 구현되어 있지 않습니다.

---

## T2-6 · 공공 API 실제 성공률

### 답변

① **API별 30일 성공률**

**측정 코드가 없습니다.** API 호출 성공/실패를 로깅하거나 집계하는 모듈이 존재하지 않습니다.

---

② **등기정보광장 API가 실제로 동작합니까**

**동작하지 않습니다.** `types.ts`에 응답 타입만 정의되어 있고, `data-absence.ts` 등에서 "대출(근저당) 정보 미확인 — 등기부등본 확인 필요"라는 정적 텍스트로 안내됩니다. 실제 등기 정보를 fetch하는 연동 코드는 **비활성 상태**입니다.

---

③ **실거래가 API의 소형 상업용 커버리지는 어느 정도입니까**

**모릅니다.** 커버리지를 측정하거나 검증하는 별도 로직이 없습니다.

---

④ **SEMAS 상권 API 응답률**

**모릅니다.** 관련된 호출 코드 및 통계 로직이 없습니다.

---

⑤ **실패 시 재시도·폴백 정책**

명시적 재시도(Retry) 로직이나 서킷 브레이커는 **존재하지 않습니다**. API 호출 실패 시 `try/catch`로 예외를 잡아 빈 객체(`{}`) 또는 정적 텍스트 안내로 대체하는 단순 폴백만 존재합니다.
