<!-- BEGIN:cre-d40-preflight-rules -->
# CRE IM D40 Pre-flight Audit Rules (2026-09-07 D33~D39 교훈 종합)

### 31. 마크다운 테이블 파싱 분리 원칙 (Adjacent Table Split Invariant)
- `parseMarkdownTable()` 및 `parseFloorsFromMarkdown()`은 인접한 마크다운 테이블(열 수가 다른 연속 테이블)을 반드시 분리해야 합니다.
- 새로운 헤더행(`|---|---|`) 또는 열 수 불일치 감지 시 이전 테이블을 즉시 마감합니다.
- **위반 사례**: 당산동 2열 요약 표와 7열 렌트롤 표 병합 → LibreOffice 블록 렌더링 붕괴.

### 32. 면적 추출 전용 헬퍼 의무 사용 (Dedicated Area Extractor)
- 면적 셀 파싱 시 `replace(/[^\d.]/g, '')` 패턴을 직접 사용하지 않습니다.
- 반드시 `extractAreaPyeong()` 전용 헬퍼를 사용하여: ① `N평` 우선 추출, ② `N㎡` 환산(×0.3025), ③ 순수 숫자만 직접 파싱합니다.
- 단일 층 면적 상한 가드: ≤ 3,000평, 건물 총면적 상한 가드: ≤ 30,000평.
- **위반 사례**: 당산동 `96평(약 317.4㎡)` → `96317.4`평 병합 → 연면적 100,681평 폭증.

### 33. 임대면적 컬럼 오매칭 차단 (Lease Area Column Guard)
- 테이블 헤더에서 임대면적 컬럼을 찾을 때 `h.includes('임대')`만으로 매칭하지 않습니다.
- `임대면적`·`계약면적`·`바닥면적`만 매칭하고, `월 임대료`·`임대 만기`·`보증금`은 명시적으로 제외합니다.
- **위반 사례**: `월 임대료` 183만원이 183평으로 역전환.

### 34. 모의/더미 데이터 하드코딩 전면 금지 (Zero Hardcoded Mock Data)
- 프로덕션 컴포넌트에 특정 매물(NH농협캐피탈, 역삼역, 테헤란로 등)의 데이터를 fallback 배열로 하드코딩하는 것을 금지합니다.
- 실데이터가 없으면 컴포넌트를 렌더링하지 않습니다 (`return null`).
- 페르소나(연령·계층·성별)를 외부 노출 문서에 직접 지칭하는 것을 금지합니다 (Rule 1).
- **위반 사례**: `StackingPlanView`에 17층 NH농협캐피탈 목데이터 fallback 누출.

### 35. 슬라이드 폴백 타이틀 동적화 의무 (Dynamic Fallback Title)
- PPTX 아키타입의 폴백 타이틀에 특정 섹션명(`건축물 물리 스펙 요약` 등)을 하드코딩하지 않습니다.
- `${input.data.title || '세부 정보'} 요약` 형태의 동적 폴백을 사용합니다.
- **위반 사례**: 권리관계(Slide 8)에 "건축물 물리 스펙 요약" 타이틀 노출.

### 36. 체크리스트 카드 텍스트 예산 (Checklist Card Budget)
- 체크리스트 항목(A18 아키타입)은 **70자 상한**을 적용하고, 40자 초과 시 **9.5pt 가변 폰트**로 축소합니다.
- 긴 문단에서 핵심 문장만 격리 추출하고, 60자 이상은 `slice(0, 57) + '...'`로 절삭합니다.
- **위반 사례**: 당산동 Slide 5 체크리스트 카드 텍스트 오버플로.

### 37. 회피성 문구 차단 (Evasive Phrase Ban)
- AI 생성 카피에서 다음 패턴이 0건이어야 합니다: `본문을 참조`, `별도 안내 예정`, `추후 확인`, `상세...별첨`.
- 모든 수치/지표는 계산된 실수치를 직접 바인딩합니다.
- **위반 사례**: "구체적인 수치는 본문을 참조하시기 바랍니다" 회피 문구.

### 38. Pre-flight Pipeline Audit 의무 실행 (Mandatory Pre-flight Audit)
- 파이프라인 코드(data-binder, writer, quality-gate, archetype, deck-sequencer) 수정 시, 커밋 전 반드시 `npx vitest run src/tests/e2e/preflight-pipeline-audit.test.ts`를 실행하여 5대 계층 40개 사전 점검 항목을 통과해야 합니다.
- 모든 점검 항목은 Positive/Negative Pair(Rule 7)를 포함합니다.

### 39. photos_v2 URL 스킴 전구간 투과성 (Full-Chain URL Scheme Permeability)
- `photos_v2` 배열의 URL을 필터링하는 모든 게이트(`generate-async/route.ts`, `generate/route.ts`, `im-data-bottom-sheet.tsx`)는 반드시 4가지 스킴을 허용해야 합니다: `http://`, `https://`, `/`, `data:`.
- URL 필터에 새로운 스킴을 추가하거나 기존 스킴을 제거할 때, 파이프라인의 모든 필터 지점을 동시에 검토합니다.
- **위반 사례**: `generate-async/route.ts`에서 `data:` URI를 필터링하여 E2E 테스트의 base64 인코딩 사진이 전량 탈락.

### 40. 바이너리 에셋 JSONB 직접 저장 금지 (No Binary Blob in JSONB)
- `document_objects.body` JSONB 컬럼에 base64 인코딩 이미지, PDF, 또는 기타 바이너리 데이터를 직접 저장하는 것을 금지합니다.
- 바이너리 에셋은 반드시 Supabase Storage(`building_photos` 버킷 등)에 업로드하고, public URL만 JSONB에 저장합니다.
- `handler.ts`의 `uploadDataUriPhotos()` 패턴을 참조합니다: base64 data URI 감지 → Storage 업로드 → URL 교체.
- **위반 사례**: 8장 사진(~10MB base64)을 JSONB에 직접 저장 → Supabase `HeadersTimeoutError` → 문서 저장 실패.
<!-- END:cre-d40-preflight-rules -->