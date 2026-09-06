# CRE IM Pipeline 5-Layer MECE 종합 감사 및 결함 수정 보고서

- **프로젝트**: CRE(상업용 부동산) IM 자동 생성 파이프라인 잠재 결함 전수 감사 및 리팩토링
- **감사 기준**: 5-Layer MECE 프레임워크 (L1~L5) 및 프로젝트 불변 규칙 (AGENTS.md)
- **최종 검증 판정**: **VICTORY CONFIRMED** (독립 승리 감사관 전수 검증 통과)
- **검증 일시**: 2026-09-06
- **작업 저장소**: `c:\Users\User\cre-dealcard`

---

## 1. 개요 (Executive Summary)

본 프로젝트는 프로덕션 웹 환경과 기존 API E2E 테스트 간 괴리에서 발생할 수 있는 잠재 결함을 방지하기 위해, 사전 패치된 4개 치명 결함(commit `1559dfa`)을 기점으로 전체 파이프라인을 5-Layer MECE 프레임워크로 전수 감사 및 리팩토링했습니다.

- **감사 대상 레이어**:
  1. **L1**: 외부 공공 API 연동 장애 방어 (`src/lib/external/`)
  2. **L2**: 클라이언트-서버 통신 계약 무결성 (`src/app/(broker)/`, `/api/broker/im-lite/*`)
  3. **L3**: IM 생성 파이프라인 런타임 안정성 (`src/domain/building/mobile-im/`)
  4. **L4**: 비즈니스 도메인 무결성 및 승인 게이트 (`src/domain/building/im-core/`, `quality-gates-v02.ts`)
  5. **L5**: PPTX/Mobile IM 렌더링 물리 및 레이아웃 (`src/domain/building/mobile-im/pptx/`)
- **결과 요약**:
  - 총 **31개 잠재 결함** 식별 및 코드 수정 완료 (28개 파일 수정)
  - 신규 회귀 방지 테스트 스위트 6개 파일 (44개 단언) 추가 및 100% 통과
  - 전체 단위/E2E 테스트 **475/475 PASS (100%)**
  - TypeScript 타입 검사 (`npx tsc --noEmit`): **0 errors**
  - Next.js 16.2.6 Turbopack 프로덕션 빌드 (`npm run build`): **Exit Code 0**

---

## 2. 5-Layer MECE 감사 및 수정 내역 (Defect Matrix)

### [L1] 외부 공공 API 연동 장애 방어 감사 (R1)
| ID | 심각도 | 결함 내용 | 영향 범위 | 수정 파일:라인 | 수정 내용 및 효과 |
|---|---|---|---|---|---|
| F-1.1 | P1 | 캐시 키 대소문자/네이밍 불일치 락 | `enrich-by-pnu.ts` | `src/lib/external/enrich-by-pnu.ts:25-95`, `external-data-orchestrator.ts:57-95` | `staleSources` 내 `snake_case`와 `camelCase`를 동시 지원하는 `isSourceStale` 헬퍼 구현. 만료된 소스가 영구 캐시되는 락 해소 |
| F-1.2 | P1 | 복수 필지(Multi-PNU) 파싱 절삭 | `enrich-by-pnu.ts`, `address-resolver.ts` | `src/lib/external/enrich-by-pnu.ts:205-310`, `src/domain/verification/address-resolver.ts:380-435` | 19자리 PNU 토큰 정규식 추출 및 대표 필지 안전 할당, `resolveMultiParcelAddress` 구현으로 다필지 주소 누락 방지 |
| F-1.3 | P1 | SEMAS 상권 API 무인증 다중 호출 스톰 | `semas-commercial-api.ts` | `src/lib/external/semas-commercial-api.ts:42-52, 125-140` | API 키 부재 시 조기 반환(`null`) 가드 추가, Supabase upsert를 try/catch로 격리하여 DB 오류가 상권 분석 파이프라인을 블로킹하지 않도록 보호 |
| F-1.4 | P2 | 공시지가 연초 롤오버 데이터 부재 | `land-price-api.ts` | `src/lib/external/land-price-api.ts:20-75` | 당해 연도(`stdrYear`) 미고시 시 직전 연도(`stdrYear - 1`) 자동 폴백 루프 탑재 |
| F-1.5 | P2 | 환경변수 직접 조회로 인한 대문자 변환 누락 | `land-price-api.ts`, `land-use-api.ts` | `src/lib/external/land-price-api.ts:15`, `src/lib/external/land-use-api.ts:15` | `getVWorldApiKey()` 표준 헬퍼를 경유하도록 리팩토링하여 API 키 로딩 안전성 확보 |
| F-1.6 | P2 | 등기부 Mock 응답 필드 누락 | `registry-api.ts` | `src/lib/external/registry-api.ts:85-97` | Mock 응답에 `checked: true`, `displayMessage` 계약 필드를 완전하게 채워 하위 런타임 참조 에러 방지 |
| F-1.8 | P2 | 카카오맵 API 에러 응답 파싱 크래시 | `kakao-map-api.ts` | `src/lib/external/kakao-map-api.ts:40-48, 95-128` | `stationRes.ok` 및 카테고리 검색 `res.ok` 사전 검증으로 401/429 발생 시 안전 폴백 처리 |

---

### [L2] 클라이언트-서버 통신 계약 무결성 감사 (R2)
| ID | 심각도 | 결함 내용 | 영향 범위 | 수정 파일:라인 | 수정 내용 및 효과 |
|---|---|---|---|---|---|
| F-2.1 | P1 | photos_v2 빈 URL / undefined 미필터 전송 | `im-data-bottom-sheet.tsx` | `src/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet.tsx:550-565` | `photos_v2` 전송 전 `Boolean(p.url && p.url.trim())` 유효성 필터링 적용 |
| F-2.2 | P2 | 라우트 maxDuration과 도메인 타임아웃 불일치 | `generate/route.ts` | `src/app/api/broker/im-lite/generate/route.ts:14` | Next.js 세그먼트 `maxDuration`을 120s에서 180s로 상향 (`thresholds.ts`의 `IM_HARD_TIMEOUT_MS = 180_000`과 일치화) |
| F-2.3 | P2 | `building_id` vs `buildingId` 불일치 거절 | `generate/route.ts` | `src/app/api/broker/im-lite/generate/route.ts:42-48` | `body.building_id || body.buildingId` 두 명명 규칙을 모두 수용하도록 파서 보완 |
| F-2.4 | P2 | 서버 폴링 에러 메시지 UI 누락 | `im-management-panel.tsx` | `src/app/(broker)/broker/deal-card/[id]/im-management-panel.tsx:145-195` | 서버 `job.result.error` 메시지를 브로커 UI 토스트에 구체적으로 표시하고 타이머 정상 해제 |
| F-2.6 | P3 | 승인 거절 시 상태 코드 불일치 | `approve/route.ts` | `src/app/api/broker/im-lite/[id]/approve/route.ts:155` | 승인 거절 시 문서 상태를 모호한 `'draft'` 대신 명확한 `'revision_needed'`로 전환 |
| F-2.7 | P3 | Server Action 내 photos_v2 누락 | `actions.ts` | `src/app/(broker)/broker/deal-card/[id]/actions.ts:14-25` | `createMobileIMAction` 계약에 `photos_v2`를 포함하여 사진 정보 온전 전달 |

---

### [L3] IM 생성 파이프라인 런타임 안정성 감사 (R3)
| ID | 심각도 | 결함 내용 | 영향 범위 | 수정 파일:라인 | 수정 내용 및 효과 |
|---|---|---|---|---|---|
| L3-06 | P0 | 마크다운 코드블록 래핑 시 JSON 파싱 크래시 | `section-segmenter.ts` | `src/domain/building/mobile-im/golden-ingestion/section-segmenter.ts:120-140` | `cleanMarkdownCodeblock` 및 BOM 제거 래퍼 적용, `try/catch` 에러 복구 폴백 탑재 |
| L3-01 | P1 | attempt 0에서 타이머 초과 시 예외 폭주 | `writer.ts` | `src/domain/building/mobile-im/writer.ts:205-245` | `shouldAbortOptional()` 트리거 시 `TIME_BUDGET_FORCE_FAST_TEMPLATE` 예외를 던지는 대신 구조화된 체크리스트 섹션으로 매끄럽게 전환 |
| L3-02 | P1 | Stage 1 병렬 호출의 후속 스테이지 시간 잠식 | `writer.ts` | `src/domain/building/mobile-im/writer.ts:150-168` | `stageTimer.getRemainingMs()`를 기반으로 Stage 1 병렬 호출에 동적 타임아웃을 부여하여 Stages 2~4 시간 예산 보호 |
| L3-03 | P1 | LLM 클라이언트 재시도 루프 무한 지연 | `llm-client.ts` | `src/ai/llm-client.ts:49-80` | 재시도 루프에 외부 `AbortSignal` 준수 및 잔여 `deadlineMs` 검증 로직 추가 |
| L3-04 | P2 | 수치 앵커(NumericalAnchors) 변조 취약점 | `writer.ts` | `src/domain/building/mobile-im/writer.ts:79-88, 343-358` | LLM 출력 검증 전 권위 있는 SSoT 수치 앵커 값을 강제 복원 및 불변 잠금 |

---

### [L4] 비즈니스 도메인 무결성 및 승인 게이트 감사 (R4)
| ID | 심각도 | 결함 내용 | 영향 범위 | 수정 파일:라인 | 수정 내용 및 효과 |
|---|---|---|---|---|---|
| L4-01 | P0 | posture 필드명 불일치로 사옥/개발형 승인 차단 | `approve/route.ts` | `src/app/api/broker/im-lite/[id]/approve/route.ts:144` | `ssot_summary.investment_posture`, `posture`, `investmentPosture`를 다중 폴백으로 조회하여 비수익형 매물이 `'income'`으로 잘못 분류되는 버그 원천 차단 |
| L4-02 | P0 | DB 저장 페이로드에서 claims 누락 | `handler.ts` | `src/app/api/broker/im-lite/generate/handler.ts:518-525` | `writerResult.claims` 및 `investment_posture`를 `imDocPayload.body`에 완전하게 바인딩하여 영속화 |
| L4-03 | P0 | 도메인 계산기-승인 게이트 간 Subject 명 불일치 | `approval-gate.ts` | `src/domain/building/im-core/approval-gate.ts:40-60` | `total_area_sqm` ➔ `total_area`, `yield_on_cost` ➔ `gross_yield` 앨리어스 매핑 지원 |
| L4-10 | P1 | PPTX Studio 승인 시 게이트 검사 우회 (Rule 15) | `pptx-studio approve-file` | `src/app/api/broker/pptx-studio/projects/[id]/approve-file/route.ts:92-155` | 파일 승인 전 `runApprovalGate()` 호출 강제 및 통과 실패 시 HTTP 422 반환 |
| L4-04 | P1 | PUBLISH_GATES 내 팬텀 게이트 필드 누락 | `quality-gates-v02.ts` | `src/domain/building/mobile-im/quality-gates-v02.ts:45-120` | `GateContext`에 필요한 프로퍼티를 완전히 타이핑하고 G17~G30 게이트 로직과 정합 |
| L4-05 | P2 | 최고 등급 규정 위반 (Grade S 제거) | `fewshot-tracker.ts`, `golden-im-manager.ts` | `src/domain/building/mobile-im/fewshot-tracker.ts:18`, `golden-im-manager.ts:35` | 최고 등급을 규정에 맞게 Grade A로 클램핑 (Grade S 경로 영구 제거) |
| L4-07 | P1 | ReleaseTier `decision_im` 판정 누락 | `handler.ts` | `src/app/api/broker/im-lite/generate/handler.ts:500-515` | `hasAsOf` 및 `hasScenario`를 올바르게 주입하여 5종 티어가 정상 분기되도록 보완 |

---

### [L5] PPTX/Mobile IM 렌더링 무결성 감사 (R5)
| ID | 심각도 | 결함 내용 | 영향 범위 | 수정 파일:라인 | 수정 내용 및 효과 |
|---|---|---|---|---|---|
| DEF-01 | P1 | `resolvePhotos` 빌딩 ID 필터링 시 사진 0장 누락 | `photo-url-transformer.ts` | `src/domain/building/mobile-im/photo-url-transformer.ts:137-183` | 빈 문자열 coalescing 버그 수정 (`\|\|`), 필터링 결과 0장 시 갤러리 보존용 폴백 유지 |
| DEF-02 | P1 | 갤러리 슬라이드에 지도(map) 사진 침투 | `gallery-planner.ts` | `src/domain/building/mobile-im/pptx/gallery-planner.ts:78-124` | `category !== 'map' && type !== 'map'` 엄격 필터링으로 G3 전용 임대공간 슬라이드 오염 차단 |
| DEF-03 | P1 | 렌트롤 12행 초과 시 단순 절삭 및 라벨 오인 | `a03-large-table.ts` | `src/domain/building/mobile-im/pptx/archetypes/a03-large-table.ts:75-172` | 12행 초과 시 `(주요 12건 발췌 / 전체 N건)` 명시 라벨 렌더링 및 지면 이탈(Bleed) 방지 Y좌표 클램핑 |
| DEF-04 | P2 | A05 상단 지표 카드와 하단 리드문 중복 (Rule 3) | `a05-asymmetric-7-4.ts` | `src/domain/building/mobile-im/pptx/archetypes/a05-asymmetric-7-4.ts:131-170` | 상단 지표 카드로 추출된 토큰/문장을 하단 "투자 가치 제안" 영역에서 자동 배제하여 비중복 원칙 준수 |
| DEF-05 | P2 | 고해상도 이미지 서버리스 OOM 위험 | `image-optimizer.ts` | `src/domain/building/mobile-im/pptx/utils/image-optimizer.ts:22-125` | 10MB 인테이크 상한 가드(`MAX_INTAKE_BYTES`) 및 Sharp 디코딩 4개 단위 병렬 스로틀링 적용 |
| DEF-06 | P3 | 본문 16면 한도 내 불필요한 protectedKey 잔존 | `deck-sequencer.ts` | `src/domain/building/mobile-im/pptx/deck-sequencer.ts:265` | 부록 면인 `'titleRights'`를 본문 슬라이드 protectedKeys에서 제거 (Rule 10 준수) |

---

## 3. 핵심 프로젝트 규칙(AGENTS.md) 준수 검증

1. **Rule 12 (im-core 도메인 순수성)**:
   - `src/domain/building/im-core/` 아래 전 모듈 조사 결과: React, Next.js, `@supabase/supabase-js` 의존성 **0건 (100% 순수 도메인)**.
2. **Rule 15 (승인 게이트 우회 금지)**:
   - `src/app/api/broker/im-lite/[id]/approve/route.ts` 및 `src/app/api/broker/pptx-studio/projects/[id]/approve-file/route.ts` 모두 `runApprovalGate()` 호출 필수화 및 미통과 시 422 반환 확인.
3. **Rule 5 (게이트 레지스트리 일관성)**:
   - `quality-gates-v02.ts`의 `PUBLISH_GATES` 및 `GateContext` 타이핑 전수 일치.
4. **Rule 1 (페르소나 격리) & Rule 2 (한국 CRE 실무 표준 용어)**:
   - 외부 노출 문구 내 페르소나 지칭 0건 및 표준 실무 용어 준수.
5. **Rule 10 (본문 16면 Hard Limit)**:
   - `deck-sequencer.ts`에서 본문 16면 절삭 유지 및 부록 분리 무결성 확인.

---

## 4. 최종 검증 지표 (Verification Results)

| 검증 항목 | 대상 명령 / 테스트 | 결과 | 비고 |
|---|---|---|---|
| **TypeScript 컴파일** | `npx tsc --noEmit` | **PASS (Exit Code 0)** | 0 type errors |
| **프로덕션 빌드** | `npm run build` | **PASS (Exit Code 0)** | Next.js 16 Turbopack 180+ 라우트 전원 컴파일 성공 |
| **신규 회귀 방지 테스트** | `src/tests/unit/domain/m1-l4-domain-integrity.test.ts`<br>`src/tests/unit/client-server-contracts-m4.test.ts`<br>`src/tests/unit/m3-m5-remediation.test.ts`<br>`src/ai/llm-client.test.ts`<br>`src/domain/building/mobile-im/__tests__/stage-plans-and-timer.test.ts`<br>`src/domain/building/mobile-im/golden-ingestion/section-segmenter.test.ts` | **PASS (44/44 100%)** | M1~M5 핵심 결함 전수 커버리지 |
| **기존 단위 테스트 전체** | `npx vitest run src/tests/unit/` | **PASS (415/415 100%)** | 47개 파일 0건 실패 |
| **기존 E2E 파이프라인** | `real-broker-im-pipeline.test.ts`<br>`cross-channel-invalidation.test.ts` | **PASS (60/60 100%)** | 옴니채널 동기화 및 실매물 파이프라인 0 회귀 |
| **독립 승리 감사** | `teamwork_preview_victory_auditor` | **VICTORY CONFIRMED** | Phase A (Timeline), Phase B (Integrity), Phase C (Independent Execution) ALL PASS |

---

## 5. 결론

5-Layer MECE 프레임워크에 따른 전수 감사와 결함 수정이 완결되었으며, 독립 감사관의 검증을 거쳐 요구된 모든 인수 기준(Acceptance Criteria)과 프로젝트 품질 규칙을 100% 충족함을 확인하였습니다.
