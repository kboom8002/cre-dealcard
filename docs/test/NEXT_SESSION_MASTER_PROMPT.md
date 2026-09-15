# CRE DealCard: 상용화 수준 IM 품질 고도화 세션 마스터 프롬프트
> **용도:** 다음 세션 시작 시 AI 어시스턴트에게 전체 컨텍스트, 도메인 규칙, 실행 계획을 주입하는 마스터 프롬프트  
> **참조 지식 소스:** `docs/test/COMMERCIAL_GRADE_TEST_PROTOCOL.md` 및 `.agents/AGENTS.md` (Rules 1 ~ 59)

---

## 📋 세션 시작 시 입력할 프롬프트 (아래 박스 내용을 그대로 복사하여 입력)

```markdown
당신은 CRE DealCard 상업용 부동산 플랫폼의 수석 QA 및 IM 파이프라인 시스템 아키텍트입니다.
이번 세션의 목표는 이전 세션에서 완료된 Phase 1~3 리팩터링(as any 완전 제거, 8대 파일 N+1 쿼리 배치화, 3대 거대 파일 모듈화, createModuleLogger 표준화) 성과를 바탕으로, Basic IM(credeal_basic 프리셋) 파이프라인을 완전한 B2B 상용화 수준(Commercial Grade)으로 끌어올리기 위한 "단위 테스트 보강 및 5대 포스처 골든 E2E 테스트 무결점 검증"을 완수하는 것입니다.

작업을 시작하기 전, 다음 두 핵심 문서를 반드시 정독하고 숙지하십시오:
1. `docs/test/COMMERCIAL_GRADE_TEST_PROTOCOL.md` (상용화 테스트 프로토콜 및 표준 9단계 SSOT)
2. `.agents/AGENTS.md` (Rule 1 ~ Rule 59 CRE 엔지니어링 룰북, 특히 Rule 31~59)

---

### [핵심 미션 및 4단계 실행 로드맵]

#### 1단계: 단위 테스트 엣지 케이스 보강 (Sprint 1: Edge-Case Unit Tests)
- `src/domain/building/mobile-im/pptx/archetypes/a23-yield-formula.ts`:
  * 보증금이 매매가에 근접하거나 초과하는 극단적 케이스에서 0으로 나누기(Division by Zero) 방어 단언.
  * Stabilized Cap Rate 산식의 `◇ 분석가정` 배지 및 가설 수치 정확성 검증.
- `src/lib/utils/area-conversion.ts` & `src/lib/external/address-resolver.ts`:
  * 복합 지번, 산지 지번(산 12-3), 쉼표 구분 multi-PNU의 안전한 19자리 추출 및 상한 가드(Rule 32) 단위 테스트 추가.
- `src/domain/building/mobile-im/pptx/deck-sequencer.ts`:
  * `credeal_basic` 프리셋 인입 시 Pro 슬라이드(capital, totalReturn, dcf, thesis 등)가 단 1장도 섞이지 않고 정확히 9섹션만 반환되는지 단언 (Rule 47).
- 실행 및 검증: `npm run preflight` (기존 102개 테스트 + 신규 엣지 케이스 100% 통과 확인).

#### 2단계: 5대 포스처 골든 E2E 테스트 순차 실행 및 결함 박멸 (Sprint 2: Golden E2E)
*주의: `npx tsx`로 PPTX만 직접 렌더하는 것은 단위 테스트입니다 (Rule 41 위반). 반드시 Next.js dev server를 띄우고 Playwright 브라우저로 실제 UI를 조작하여 전구간을 검증해야 합니다.*
- 사전 환경 준비: `npm run dev` 실행 확인 및 `.env.local` API 키(카카오, V-World, Supabase Service Role) 유효성 점검.
- 공통 테스트 하네스: `e2e/helpers/golden-test-utils.ts` 적극 활용 (Rule 59).
- 대상 5대 포스처 순차 테스트:
  1. `e2e/basic-im-golden.auth.spec.ts` (당산동 호산당: 수익형 일반, 만실)
  2. `e2e/gangnam-vacancy-golden.auth.spec.ts` (강남 역삼동: 수익형 밸류애드, 고공실 57%)
  3. `e2e/mapo-dev-golden.auth.spec.ts` (마포 대흥동: 개발형 신축부지, PNU: 1144010800100120041)
  4. `e2e/seocho-basic-golden.auth.spec.ts` (서초동 메디컬: 사옥형 자가사용)
  5. `e2e/sinsa-basic-golden.auth.spec.ts` (신사동 도산대로: 매매형 시세차익)
- 실행 명령:
  `npx playwright test e2e/<spec>.auth.spec.ts --project=authenticated`
- 각 테스트 통과 기준:
  * 4대 바이너리 단언 100% 통과 (Poison Token 0건, Mock Data 0건, 회피성 문구 0건, 가격 밴드 0건).
  * 외부 지도 에셋(카카오 지도, V-World 지적도)이 실제 50KB 이상 이미지로 PPTX ZIP 내에 임베딩되었는지 확인 (Rule 43, 54).

#### 3단계: AI 시각 E2E 및 슬라이드 레이아웃 검증 (Sprint 3: Visual QA)
- 생성된 5종의 골든 PPTX 파일로부터 150 DPI 고해상도 슬라이드 PNG 캡처 생성 (`convertPptxToSlideImages`).
- 산출물 경로: `docs/test/stress/e2e-outputs/visual-qa/<scenario>/`
- 검수 기준:
  * 슬라이드 타이틀/헤더의 동적 데이터 바인딩 정상 여부 (타 섹션 타이틀 누출 방지, Rule 35).
  * 체크리스트 및 카드 컴포넌트의 텍스트 오버플로 및 줄바꿈 깨짐 여부 (Rule 36).
  * 지도 슬라이드에 SVG 플레이스홀더 대신 실제 고해상도 카카오 맵 렌더링 확인 (Rule 56).

#### 4단계: 상용화 릴리즈 무결성 게이트 및 배포 (Sprint 4: Release Gate)
- 배포 전 4단계 게이트웨이 파이프라인 전원 통과 필수:
  1. `npm run preflight` (PASS)
  2. `npx tsc --noEmit` (0 errors)
  3. `npm run build` (Next.js production build 성공, Exit 0)
  4. `git status` 확인 후 커밋 및 `git push origin main` 배포 트리거.

---

### [엔지니어링 철칙]
1. **Rule 34 (Zero Mock Data)**: 특정 건물명(NH농협캐피탈 등)이나 테헤란로 등의 가짜 데이터를 fallback으로 코드에 절대 넣지 마십시오.
2. **Rule 41 (Production Golden Test)**: 함수 단위 호출만 하고 "골든 테스트 성공"이라 보고하지 마십시오. 반드시 dev server + Playwright E2E로 증명하십시오.
3. **Rule 52 (Exact Amount Display)**: 투자자 대면 IM에 `50억~80억` 형태의 가격 밴드를 절대 표시하지 마십시오. 단일 확정 매각가를 바인딩하십시오.
4. **Rule 57 (Real PNU Mandate)**: 테스트 메모 작성 시 가상 번지가 아닌 국토정보 등록 실제 필지 지번만 사용하십시오.

지금 즉시 위 지침을 확인하고, **"1단계: 단위 테스트 엣지 케이스 점검 및 보강"**부터 착수해 주십시오.
```

---

## 🛠️ 다음 세션 시작 전 체크리스트 (사용자용)

다음 세션을 매끄럽게 진행하기 위해 사전에 준비할 사항입니다.

1. **Next.js Dev Server 구동 준비**:
   - 터미널 1에서 `npm run dev`를 띄워두거나 백그라운드 태스크로 구동할 준비를 합니다.
2. **`.env.local` 필수 환경변수 점검**:
   - `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (Playwright 인증 세션용)
   - `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (실DB 연동용)
   - `KAKAO_REST_API_KEY` / `VWORLD_API_KEY` (외부 지도/지적도 API 실호출용)
3. **상기 마스터 프롬프트 복사 & 실행**:
   - 새로운 대화 세션을 열고 위의 마스터 프롬프트 블록을 그대로 전송하면, 에이전트가 완벽한 컨텍스트 하에서 1단계부터 자율적이고 체계적으로 작업을 수행합니다.
