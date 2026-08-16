<!-- BEGIN:deploy-rules -->
# CI/CD Deployment Rules
- 본 프로젝트의 주요 배포 프로세스는 Vercel 자동 배포(`git push origin main`)를 통해 이루어집니다.
- 배포를 진행하기 전에 반드시 `npm run build`를 통해 로컬에서 타입스크립트 오류 및 빌드 성공 여부를 사전에 확인해야 합니다.
- 사용자가 배포를 요청할 경우, 위와 같이 빌드 무결성을 점검한 뒤, `git push`를 통해 원격 저장소에 반영함으로써 Vercel 자동 배포를 트리거합니다. (또는 상황에 따라 `npx vercel --prod` 활용)
<!-- END:deploy-rules -->

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
<!-- END:cre-im-rules -->
