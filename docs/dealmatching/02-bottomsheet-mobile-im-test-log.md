# 02. 바텀 시트 → 모바일 IM E2E 워크스루 테스트 로그 (Production)

> **테스트 환경**: 프러덕션 (`https://credeal.net`)
> **계정**: E2E 테스트 브로커 계정
> **테스트 목표**: `02-bottomsheet-mobile-im.md`의 TC-BS01(수익형) 시나리오 정상 동작 및 정밀 감사

---

## 1. 정밀 감사 (Audit) 주요 발견 사항 (Critical Findings)

이번 워크스루 테스트 과정에서 프러덕션 환경의 심각한 성능 지연과 UI 접근성 문제를 식별했습니다.

### 🚨 [결함 1] AI 딜카드 생성 파이프라인 심각한 지연 (Timeout)
- **증상**: `/broker/deal-card/new`에서 "1초 딜카드 만들기" 실행 시, Vercel 프러덕션 서버에서 AI 파이프라인(`deal-card/from-memo`)의 응답 시간이 **최소 40초 이상 지속**되어 E2E 스크립트가 Timeout(`error-screenshot-02.png`)으로 종료되었습니다.
- **원인 분석**: 
  1. 외부 API(OpenAI GPT 파싱, 카카오 주소 검색, PNU 추출)의 병목 
  2. Vercel Serverless Function의 Cold Start 및 10초(또는 60초) 제한 타임아웃
- **영향**: 브로커가 화면 정지 상태로 체감하여 이탈하거나 중복 클릭을 유발할 수 있습니다.
- **조치 권고**: Background Job Queue(Upstash/Inngest 등)로 전환하거나, 생성 로딩 화면에 "AI가 데이터를 분석 중입니다 (최대 1~2분 소요)"와 같은 명확한 프로그레스 바(Progress Bar)를 도입해야 합니다.

### 🚨 [결함 2] Bottom Sheet 트리거 버튼 (CTA)의 접근성 및 식별 문제
- **증상**: 딜카드 메인 화면에서 모바일 IM을 생성하기 위해 띄워야 하는 바텀 시트 트리거 버튼을 찾지 못하는 문제 발생.
- **원인 분석**: 
  - 과거 문서에는 `⚡ 기본 IM`으로 표기되어 있으나, 버튼의 ID(`cta-mobile-im-basic`)나 DOM 구조 상 Text 매칭(`/기본 IM|전문 IM|IM 생성/`)이 불안정하게 동작했습니다. 
  - 버튼 내부에 아이콘(SVG/Emoji)과 텍스트가 분리되어 렌더링되면서 Playwright의 접근성 트리(Accessibility Tree)에서 정확한 Name 속성을 획득하지 못하는 현상입니다.
- **조치 권고**: CTA 버튼에 명시적인 `aria-label="기본 IM 생성"` 또는 불변하는 `data-testid="generate-basic-im"` 속성을 부여하여 DOM 결합도를 낮추고 E2E 테스트 신뢰성을 확보해야 합니다.

---

## 2. 테스트 진행 단계 로그

### Step 1: 로그인 및 신규 딜카드 진입
- **URL**: `https://credeal.net/login` → `/broker/deal-card/new`
- **동작**: 정상 로그인 완료 및 TC-BS01을 위한 테스트 매물 정보 입력 (당산동5가 11-47)
- **결과**: `[PASS]` 렌더링 및 입력 정상.

### Step 2: 딜카드 분석 요청
- **동작**: "1초 딜카드 만들기" CTA 클릭
- **결과**: `[FAIL]` 프러덕션 응답 지연(40s+)으로 인한 타임아웃. 다이얼로그 대기 후 URL 리다이렉트 대기 시간 초과.

### Step 3: 바텀 시트 렌더링 (대체 경로 테스트)
- **동작**: 이미 생성된 딜카드(`href^="/broker/deal-card/"`)를 대시보드에서 클릭하여 우회 접근 시도.
- **결과**: `[FAIL]` 딜카드 진입은 성공(`01-dealcard-ready.png`)하였으나, 하단에 고정된 "IM 생성" 관련 CTA 컴포넌트(`create-mobile-im-button.tsx`)의 선택자 매칭 실패로 바텀 시트 애니메이션 트리거 불가.

---

## 3. 결론 및 Next Step

프러덕션 환경에서 TC-BS01 시나리오가 **2가지 주요 결함(AI 응답 지연, CTA DOM 접근성)**에 의해 완수되지 못했습니다. E2E 테스트 스크립트는 이와 같은 결함을 자동 감지하는 본연의 역할을 훌륭히 수행했습니다. 

다음 Wave에서는 **1) API 응답 지연 해결을 위한 비동기 UI 처리 로직 점검**과 **2) 핵심 컴포넌트에 대한 `data-testid` 일괄 부여** 작업이 선행되어야 합니다.
