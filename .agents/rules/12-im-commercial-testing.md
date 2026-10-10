<!-- BEGIN:cre-im-commercial-testing -->
# IM 상용화 테스트·릴리즈 운영 규칙 (2026-10-10 income 골든 P1~P2 교훈)

## A. 환경·도구 안전 (사고 재발 방지)

### 71. 워크트리는 `worktree-build.ps1` 로만 (node_modules 삭제 사고 2회)
- `next build`(Turbopack)는 `.next/node_modules/<pkg>-<hash>` 링크를 만들고, `git worktree remove` / `Remove-Item -Recurse`가 이 링크를 따라가 **메인 `node_modules`(pino/sharp/jsdom)를 지운다**.
- 릴리즈 빌드 검증은 반드시 `powershell -ExecutionPolicy Bypass -File scripts/release/worktree-build.ps1` (커밋된 ref 를 빌드 → 링크를 진입 없이 제거 → 센티널 검증). 워크트리를 손으로 지우지 않는다.
- 빌드 후 무결성: 센티널 `node_modules/{pino,sharp,jsdom}/package.json` 존재 확인. 누락 시 `npm install` (패키지 파일은 안 바뀐다).

### 72. PowerShell 도구 사용 요령
- `rg` 없음 → `git grep -n` / `Select-String`. `[id]`·`(group)` 경로는 `-LiteralPath`.
- heredoc 금지, `;` 체인. Node 스크립트는 `process.exitCode` (fetch 뒤 `process.exit()` 금지).
- 한글 콘솔 출력은 깨진다 → 결과는 파일로 쓰고 `view_file`로 읽는다. 단 `> file` 리다이렉트는 **UTF-16**이라 `view_file`이 거부한다 → `| Out-File -Encoding utf8` 또는 태스크 로그를 읽는다.
- vitest/E2E 실행 후 반드시 `git checkout -- docs/test tsconfig.json` (자동 수정 복원).
- 스테이징은 파일 단위(`git add <paths>`), `git add .`/`-A` 금지 (타 세션 파일: `supabase/.temp`, `docs/handoff` 등 혼재).
- 부하 시 E2E 의 LibreOffice 슬라이드 캡처(Step 10)·타임아웃 실패는 단건 재실행으로 구분한다 (단건 통과면 부하 이슈).

## B. 골든 오라클 운영 (income 8변형 기준)

### 73. 수정 루프 = 오프라인 오라클 (재녹화 없이)
- `npx tsx scripts/golden-snapshot/rerender.ts <core|income|이름>` → `oracle.ts <scope>` (수 초). 리포트: `e2e/golden-snapshots/out/oracle-report.md`.
- 표시 계층·바인더·렌더러 수정은 재녹화 불필요. **프롬프트·입력 경로 변경은 LLM 녹화를 무효화** → 수정은 표시 계층 우선, 생성측 수정은 P2 재녹화 배치 1회로 묶는다 (`LLM_MODE=record-missing`, replay ×2 결정성).
- 릴리즈 게이트: tsc(`.next/` 제외) → 집중+전체 vitest → `rerender core` + 오라클(core·income) → `worktree-build.ps1` → 선택 스테이징 → push.
- 세트 증가 시 `scripts/income-golden/run-golden.ps1 -Capture`(live LLM·약 50분)는 사용자 승인 후에만.

### 74. 정답 키(expected_facts.json)는 약화 금지
- FAIL 은 (i) 정답 키 버그 (ii) 스냅샷 stale (iii) 제품 결함으로 분류. **(iii)을 키 완화로 통과시키지 않는다.**
- 키를 바꿀 때는 근거를 `note`에 남긴다 (예: 재캡처로 대장 주차 2대 확보 → 키 갱신). 미반영 생성 수정에 걸린 항목은 `pending:'P2'` 태그 + 사유 (태그가 stale 이면 리포트가 알려준다 — 즉시 제거).
- 정답은 현재 PPTX 에서 역산하지 않는다. 출처 `fixture | register | derived`. 신뢰 가능한 대장 vs 중개인 충돌 시 대장 우선(건축 사실), 불명확하면 CONFLICT note.
- 사실표는 `docs/income-golden-data`(git 미추적)에 있고 오라클은 없으면 skip. 원본 IM(`docs/income-im/`)은 건드리지 않는다.

## C. 도메인 불변식 (이번에 확정·구현)

### 75. 단일 해석기 원칙 — 같은 사실은 같은 값
- 면적(대지·연면적)은 `pptx/binder/display-areas.ts` `resolveDisplayAreas` 한 곳: 요약 스탯·요약 포인트·하이라이트·개요 표가 모두 이것을 쓴다. 새 소비처가 `ssot_summary`/`heroCard`의 면적을 직접 읽지 않는다.
- 규칙: 신뢰 가능한 대장(`isRegisterTrustworthy` = 2배 괴리 무효화 이력 없음 + 건폐/용적/사용승인 중 하나 보유)만 사용. 대지는 1% 이내 스냅, 연면적은 대장이 정본 + 괴리 시 `[AREA-RECONCILE]` 경고. 값이 없으면 `undefined`(0·추정 금지).
- **pptx/** 에서 대장 원시 키(`bcrPct`/`farPct`/`grndFlrCnt`/`approvalDate` 등) 직접 접근 금지 → `normalizeBuildingRegister` (boundary-guard 가 잡는다).
- 생성측(handler) 연면적 해석: 중개인 연면적 ≈ 중개인 대지면적(±1%) & 대장 ≥2배 → '대지 오기'로 보고 대장 채택·대장 사실 유지 (`brokerLooksLikeLand`). 그렇지 않은 2배 괴리는 기존대로 '다른 건물' 무효화.

### 76. 점유·임대 SSOT (`lease-vacancy.ts`)
- 명시 `lease_state`(공실/자가사용/임대중)가 비고·키워드 추정보다 우선. 자가사용은 공실·분모에서 제외.
- 비임대 행(기계실·주차장 등: 이름 완전 일치 + 금액·계약 없음 + 명시 공실 아님)은 호실 수·점유율·공실률·렌트롤 합계 행 호실 수에서 제외 (표에는 남긴다). 유료 주차 운영 등 금액·계약이 있으면 임대 호실.
- 요약 임대료/보증금 = **렌트롤 임대중 행 합**(A24 합계와 같은 모집단). 바텀시트 합계는 렌트롤 금액이 비었을 때만 폴백이며, 0.5% 초과 불일치는 `[LEASE-RECONCILE]` 경고. 공실 행의 희망 임대료는 합계에서 제외.

### 77. 법정 건폐율·용적률 = 공식 조회값만
- `binder/legal-limits.ts` (`limitsSource==='official'` / `legal_limits_source`)일 때만 표기. V-World 응답엔 % 한도가 없어 사실상 항상 숨김. 용도지역명 추정 한도·기본값(50/250, 60/400, 60/800)을 "법정"으로 표기하는 코드 신설 금지. 현황 건폐율/용적률(대장)은 별개로 표기.
- 남은 소비처(개발형 A17 기본값, Pro farUpside, premium-template-engine·im-section-generator 프롬프트)는 P2/P5 백로그.

### 78. 병합 순서·그룹핑 주의 (개요 사양 표)
- LLM 서술형 키(길이>20·`.,*•` 포함)는 제원 그룹(`#준공` 등)에 묶지 않는다. 서술형 필터는 그룹 병합 **이전**에 실행. 안 그러면 정크 행이 공부 값(사용승인일) 행을 막은 뒤 사라져 행이 통째로 누락된다.
- 같은 문장이 두 면에 렌더되면 Rule 4 위반: 투자 포인트 ↔ 입지 설명은 입지 면 유지·포인트에서 제거(0개가 되면 반대로 입지 callout 생략).
<!-- END:cre-im-commercial-testing -->
