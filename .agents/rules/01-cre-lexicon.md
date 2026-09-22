<!-- BEGIN:cre-im-rules -->
# CRE Mobile IM & PPTX Quality Rules

### 1. 페르소나 격리 원칙 (Implicit Persona Principle)
- 페르소나(예: 60대 자산가, 법인 대표, 디벨로퍼 등)는 **내부 설명 난이도 및 톤앤매너 조절용**으로만 엄격히 격리합니다.
- 외부 노출 문서(Mobile IM 웹 뷰어, PPTX 슬라이드 제목/본문/헤드라인)에는 '60대 자산가를 위한', '법인 대표 맞춤' 등 **특정 연령/계층/성별을 직접 지칭하는 문구를 절대 표기하지 않습니다**.

### 2. 한국 상업용 부동산 실무 용어집 준수 (CRE Lexicon Standards)
- 어색한 외래어 직역 투를 배제하고 한국 실무 표준 용어를 사용합니다.
  * ❌ `네이밍 라이츠`, `브랜딩 라이츠` ➔ ✅ `사옥 단독 명칭 표기(간판 설치권)`, `기업 단독 브랜딩`
  * ❌ `캡레이트` ➔ ✅ `연 순수익률 (Cap Rate)`
  * ❌ `GOP` ➔ ✅ `실질 영업이익 (GOP)`
  * ❌ `TI / Rent Free` ➔ ✅ `인테리어 지원금(TI) / 렌트프리(무상임대)`

### 3. PPTX 슬라이드 비중복 렌더링 원칙 (No-Duplicate Presentation)
- 좌/우 분할 레이아웃(A04, A05 등)에서 좌측 영역과 우측 카드에 동일한 텍스트/불릿 항목을 중복 나열하지 않습니다.
  * **좌측**: 자산 가치 제안(Value Proposition) 리드문 및 거시적 투자 배경 서사
  * **우측**: 3~4대 핵심 투자 포인트 및 지표 카드

### 4. AI 시각 E2E 테스트 검증 절차
- PPTX 템플릿, 데이터 바인더, LLM 프롬프트 수정 시 `src/tests/e2e/ai-visual-e2e-runner.ts`를 실행하여 150 DPI 고화질 슬라이드 PNG 캡처 및 AI 시각 무결성(레이아웃 오버플로, 라벨 오염, 중복 텍스트 여부)을 반드시 점검합니다.
### 5. IM 제품 계층 용어 정의 (IM Product Taxonomy)
- 코드베이스에 `im-lite`, `Basic IM`, `mobile-im`, `Pro IM` 등이 혼재합니다. 아래 정의를 SSOT로 삼습니다.

| 용어 | 정체 | 실체 |
|:---|:---|:---|
| **im-lite** | API 라우트/인프라 계층 이름 | `/api/public/im-lite/[buildingId]` 엔드포인트 군. Basic + Pro 양쪽 포함 |
| **mobile-im** | 도메인 로직 폴더명 | `src/domain/building/mobile-im/`. DB `document_type: 'mobile_im'` |
| **Basic IM** | PPTX 제품 브랜드명 (사용자 대면) | `tier=basic`, `preset: 'credeal_basic'`, 7~11면 |
| **Pro IM** | PPTX 제품 브랜드명 (사용자 대면) | `tier=pro`, `preset: 'credeal_signature'`, 면수 무제한 |
| **basic-im-studio** | 중개사 편집 UI 전용 API | `/api/broker/basic-im-studio/[id]/download` |

- **원칙**: URL/DB 스키마에는 `im-lite` / `mobile_im`을 유지합니다. 사용자 대면 텍스트·파일명에는 `Basic IM` / `Pro IM`을 사용합니다. 코드 주석에서는 둘의 관계를 명시합니다.

<!-- END:cre-im-rules -->