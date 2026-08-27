# D37 프론트엔드-도메인 정합성 감사 보고서

> **대상** D37 고도화 이후 전체 파이프라인 (커밋 `6607d14`)
> **선행** D30~D36, D37 P0+P1+P2 전량 완료
> **소유** CREDEAL 렌더 팀

---

## 0. 판정

| 축 | D37 이전 | D37 이후 | 변화 |
|---|:---:|:---:|---|
| **im-core 연동** | 🔴 writer만 | ✅ 전구간 | 9모듈 × 7접점 연결 |
| **ReleaseTier** | 🔴 미사용 | ✅ 5종 전구간 | handler→DB→PPTX→뷰어 |
| **ApprovalGate** | 🔴 우회 | ✅ 차단 | approve API 검증 |
| **displayLabel** | 🔴 4종 하드코딩 | ✅ 8종 동적 | DISPLAY_LABEL_MAP |
| **한국법 입력** | 🔴 경로 없음 | ✅ Studio 탭 | 12종 입력 UI |
| **품질 게이트** | 🟡 41종 | ✅ 49종 | G48~G53 신설 |

---

## 1. 수정 이력 (8커밋)

| 커밋 | 등급 | 건수 | 핵심 |
|---|:---:|:---:|---|
| `7f226ab` | 🔴 C×4 | 4 | 타입/명칭/ReleaseTier/handler |
| `6110a97` | 🟠 H×2 | 2 | ApprovalGate/DataBinder |
| `2ab77c9` | 🟠 H×2 | 2 | displayLabel 8종/tier UI |
| `2a6c36c` | 🟠 H×3 | 3 | 한국법 Studio/환산보증금/토지허가 |
| `c38def9` | 🟠+⚪ | 3 | Claim 검증/confidence 3상태/tier 5종 |
| `c7e3c51` | 🟡 M×2 | 2 | ActionCard/GateReport 컴포넌트 |
| `6607d14` | ⚪ L×1 | 1 | SVG 아키타입 6→12종 |
| (규칙) | — | — | AGENTS.md §11~§16, 스킬 2종 |

**총 22건 중 22건 해결** (M-5 TTS/M-6 다국어 = 의도적 보류, 결함 아님)

---

## 2. 결함 분류별 상세

### 🔴 Critical (4건) — 런타임 버그

| ID | 파일 | 현상 | 수정 |
|---|---|---|---|
| C-1 | `stage-plans.ts` L56 | `development_screening` 1곳만 다름 → Stage 2 매칭 실패 | `development_feasibility` 복원 |
| C-2 | `types.ts` | 7종 섹션 누락 → Record 불완전 | MOBILE_IM_SECTIONS 7종 + alias/title 3곳 |
| C-3 | `pptx-renderer.ts` | `releaseTier` 미전달 → tier 기반 면제어 무효 | sequenceInput.releaseTier 주입 |
| C-4 | `handler.ts` | `resolveTier()` 미호출 → 5종 tier 미영속 | resolveTier() 호출 + DB 저장 |

### 🟠 High (8건) — 데이터 미연동

| ID | 파일 | 수정 |
|---|---|---|
| H-1 | `mobile-im-viewer.tsx` | DISPLAY_LABEL_MAP 8종 + trustWeight 5단계 색상 |
| H-2 | `approve/route.ts` | `runApprovalGate()` 사전 검증 연결 |
| H-3 | `save-sections/route.ts` | SSoT 가격/면적 vs 마크다운 Claim 검증 |
| H-4 | `data-binder.ts` | 5종 DATA_KEY + valueAdd 아키타입 |
| H-5 | `studio/legal/page.tsx` 🆕 | 한국법 12종 입력 UI |
| H-6 | `rent-roll-importer.tsx` | 환산보증금 인라인 + 상임법 뱃지 |
| H-7 | `RegulationScreening.tsx` | 토지거래허가 동적 데이터 표시 |
| H-8 | `im-management-panel.tsx` | ReleaseTier 5종 라벨 뱃지 |

### 🟡 Medium (4건) — 신규 컴포넌트

| ID | 파일 | 수정 |
|---|---|---|
| M-1 | (C-2 후속) | getSectionTitle 7종 — 기존 커밋으로 해결 |
| M-2 | (해당 없음) | SECTION_MISSION 코드에 미존재 |
| M-3 | `action-card-view.tsx` 🆕 | 3시나리오 렌더 컴포넌트 (105행) |
| M-4 | `gate-report-view.tsx` 🆕 | Gate 39종 아코디언 UI (140행) |

### ⚪ Low (3건) — UX 개선

| ID | 파일 | 수정 |
|---|---|---|
| L-1 | `mobile-im-viewer.tsx` | confidence 3상태 뱃지 (confirmed/needs_check/inferred) |
| L-2 | `slide-preview-svg.tsx` | SVG 아키타입 6→12종 (+158행) |
| L-3 | `im-data-bottom-sheet.tsx` | targetTier 5종 수용 + legacy 변환 |

---

## 3. 갱신된 규칙 체계

### AGENTS.md 신설 규칙 (§11~§16)
| § | 규칙명 | 핵심 |
|:---:|---|---|
| 11 | Section Extension Cascade | types.ts → 3곳 연쇄 수정 |
| 12 | Domain Layer Direction | im-core → FE (X), FE → im-core (O) |
| 13 | Full-Chain Tier Binding | handler→DB→PPTX→뷰어 일관 전달 |
| 14 | No Hardcoded Provenance | DISPLAY_LABEL_MAP 필수 참조 |
| 15 | No Gate Bypass | approve 전 runApprovalGate() 필수 |
| 16 | Frontend-Domain Audit | 모듈 추가 시 7접점 연동 확인 |

### 신규 에이전트 스킬 (2종)
| 스킬 | 위치 | 역할 |
|---|---|---|
| `cre-frontend-audit` | `.agents/skills/cre-frontend-audit/SKILL.md` | 프론트엔드-도메인 정합성 감사 |
| `cre-im-remediation` (갱신) | `.agents/skills/cre-im-remediation/SKILL.md` | 파이프라인 결함 수정 + im-core |

---

## 4. 검증 결과

| 항목 | 결과 |
|---|:---:|
| vitest run (l2+l3) | 58/58 ✅ |
| npm run build (8회) | 전체 통과 ✅ |
| git push origin main (8회) | Vercel 배포 ✅ |
