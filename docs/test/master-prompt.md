# 마스터 프롬프트: Basic IM 파이프라인 철저 상용화 감사 및 고도화

> 이 프롬프트를 새 세션에 붙여넣으면, 파이프라인 전체에 대한 상용화 감사 및 고도화 작업을 시작합니다.

---

## 지시사항

`c:\Users\User\cre-dealcard` 프로젝트의 **메모→딜카드→Basic IM 선택→바텀시트→IM Core→모바일 IM→PPTX Basic IM** 파이프라인에 대해 **철저 상용화 감사(audit) 및 고도화 개선(hardening)** 작업을 수행합니다.

### 사전 준비 (필수)

아래 2개 파일을 **반드시 먼저 읽고** 현재 상태를 파악한 후 작업을 시작하세요:

1. **지식 소스**: `docs/test/pipeline-knowledge-source.md` — 아키텍처, 모델/비용, 골든테스트, 11개 규칙 모듈, 알려진 이슈
2. **Agent Rules**: `.agents/AGENTS.md` → 11개 규칙 모듈 인덱스 (필요 시 개별 모듈 참조)

최근 git log를 확인하여 현재 브랜치 상태를 파악하세요:
```bash
git log --oneline -15
```

### 감사 범위 (MECE 6축)

| 축 | 감사 항목 | 핵심 점검 |
|:---|:---|:---|
| **A1. 데이터 정합성** | SSoT→바인더→PPTX 수치 일관성 | 매각가, 면적, Cap Rate, NOI가 파이프라인 전 구간에서 동일 |
| **A2. 시각 품질** | PPTX 슬라이드별 레이아웃/오버플로우 | 텍스트 잘림, 테이블 셀 넘침, 여백 불균형, 폰트 일관성 |
| **A3. 포스처 격리** | 5대 포스처별 전용 슬라이드/콘텐츠 | 타 포스처 콘텐츠 혼입, 불필요 슬라이드 노출 |
| **A4. 엣지케이스** | 데이터 누락/이상값 대응 | 사진 0장, 렌트롤 미제출, 면적 0, 가격 미입력 시 폴백 |
| **A5. 비용 효율** | LLM 토큰 소비 최적화 | 프롬프트 크기, 중복 데이터 주입, Gate 배치 통합 |
| **A6. 테스트 커버리지** | 단언 누락/약점 영역 | 새로 발견된 결함에 대한 회귀 테스트 추가 |

### 작업 프로토콜

#### Phase 1: 진단 (Diagnosis)
1. 7대 골든 매물에 대해 **실 API 기반** E2E 골든 테스트 실행 (Mock이 아닌 실제 LLM 사용)
2. 생성된 PPTX 7건을 열어 **시각 품질 정밀 검사** (오버플로우, 빈 셀, 깨진 이미지, 폰트 두부)
3. 결함 목록을 MECE 6축으로 분류하여 `defect-ledger.md`에 기록
4. 각 결함에 심각도 부여: P0(차단), P1(시각결함), P2(개선), P3(코스메틱)

#### Phase 2: 수정 (Remediation)
1. P0/P1 결함부터 Wave 단위로 수정 (Wave당 최대 10건)
2. 매 Wave 완료 후 `npx tsc --noEmit` + `npm run build` 검증
3. 수정된 결함에 대한 회귀 테스트 추가 (golden-test-utils.ts 또는 unit test)
4. Wave 완료 시 git commit (커밋 메시지에 수정된 결함 ID 명시)

#### Phase 3: 고도화 (Hardening)
1. Quality Gate 배치 통합 (섹션별 8회→1~2회)
2. 프롬프트 필드 슬라이싱 (섹션별 필수 데이터만 전달)
3. 토큰 텔레메트리 DB 연결 (실시간 비용 모니터링)
4. data-binder.ts (81KB) 모듈 분할

#### Phase 4: 최종 검증
1. 7대 골든 E2E 전수 재실행 → 100% PASS 확인
2. `npx tsc --noEmit` + `npm run build` 최종 검증
3. 최종 감사 보고서 작성
4. `git push origin main` 배포

### 금지사항

- **Rule 11 (프롬프트 위생)**: `JSON.stringify()`로 LLM에 전달하는 객체에서 바이너리 필드 (`cadastralMapImage`, `buffer`, `photos_v2` Base64 등) 반드시 제거
- **Rule 9 (서브에이전트 위생)**: 10MB 이상 파일 git 커밋 금지
- **Rule 34 (더미 데이터)**: 타 매물 목데이터(NH농협캐피탈 등) 누출 방지
- **Rule 37 (회피 문구)**: "추후 확인 필요", "미정", "상세 내역 미제공" 등 차단
- API 비용 추정 시 반드시 **런타임 객체 실제 크기** 측정 + **OpenAI Usage 실측** 교차 검증

### 참조 파일 경로

```
# 파이프라인 핵심
src/app/api/broker/im-lite/generate/handler.ts          # IM 생성 핸들러 (42KB)
src/app/api/broker/im-lite/generate-async/route.ts       # 비동기 API 라우트
src/domain/building/mobile-im/writer.ts                  # 오케스트레이터 (39KB)
src/domain/building/mobile-im/im-section-generator.ts    # 섹션 AI 생성 (38KB)
src/domain/building/mobile-im/narrative-prompt.ts        # 프롬프트 구성 (24KB)
src/domain/building/mobile-im/im-context-builder.ts      # 컨텍스트 빌더 (16KB)

# PPTX 렌더링
src/domain/building/mobile-im/pptx/deck-sequencer.ts     # 덱 시퀀서 (24KB)
src/domain/building/mobile-im/pptx/data-binder.ts        # 데이터 바인더 (81KB)
src/domain/building/mobile-im/pptx/pptx-renderer.ts      # PPTX 렌더러 (58KB)
src/domain/building/mobile-im/pptx/archetypes/           # 25종 아키타입

# 품질 검증
src/domain/building/mobile-im/cre-quality-gate.ts        # CRE 시맨틱 게이트 (16KB)
src/domain/building/mobile-im/im-judge.ts                # LLM-as-Judge (14KB)
src/domain/building/mobile-im/guardrails.ts              # 가드레일 (19KB)
src/domain/building/mobile-im/cross-validator.ts         # 교차 검증 (31KB)

# 테스트 인프라
e2e/helpers/golden-test-factory.ts                       # 10-Phase 팩토리 (38KB)
e2e/helpers/golden-test-utils.ts                         # 11종 품질 단언 (16KB)
e2e/golden/*.auth.spec.ts                                # 7대 골든 스펙

# AI & 비용
src/ai/model-selector.ts                                 # 모델 3계층
src/ai/cost-tracker.ts                                   # 비용 추적
src/ai/providers/openai.ts                               # OpenAI 클라이언트
```

### 골든 테스트 실행 명령어

```bash
# 단일 매물
npx playwright test e2e/golden/income-dangsan-r3.auth.spec.ts

# 전체 7대 매물 (순차)
npx playwright test e2e/golden/ --workers=1

# 빌드 검증
npx tsc --noEmit && npm run build
```

### 현재 상태 요약 (2026-10-03 기준)

- **골든 테스트**: 7대 매물 × 5 포스처 전수 PASS (82/82)
- **빌드**: 에러 0건
- **토큰 비용**: $0.25/IM (바이너리 새니타이즈 적용됨)
- **마지막 커밋**: `222389e` — Rule 11 프롬프트 위생 규칙 추가
- **알려진 잠재 이슈**:
  - Quality Gate 배치 미통합 (API 호출 비효율)
  - 승인 게이트 `land_area_sqm=0` / `total_area_sqm=0` 근본 미해결
  - Basic IM에 Pro IM 키워드 혼입 경고 (advisory)
  - data-binder.ts 81KB 단일 파일 — 유지보수성 저하
  - 토큰 텔레메트리 DB 미연결 (비용 모니터링 불가)
