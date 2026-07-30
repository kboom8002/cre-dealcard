# TASKS.md — 마스터 태스크 인덱스 (착수 순서의 SSoT)

> **버전**: v1.2 (2026-07-28) · **규칙**: 태스크 착수 순서·의존 판정은 본 파일이 유일한 기준이다. 상세 명세는 "출처" 열의 SDD를 따른다. 상태 값: `todo | doing | done | blocked`. PR은 태스크 ID를 제목에 포함한다.
> **네임스페이스**: `S0~S3-*` 본체 SDD **v1.3** · `MG-*` SDD-Magazine **v1.2** · `S4-*` SDD-Stage4 v1.0
> **v1.2**: 전 Stage(0~4+) 도메인 로직 구현 완료 반영 (2026-07-28)
> **v1.1**: 데이터 공급 감사 반영 — 신규 S0-T12·S1-T15·S1-T16·S2-T11, 개정 S1-T4/T5/T7/T10·S2-T1/T2/T3 (재사용 전환)

## 0. 스테이지 게이트

| 게이트 | 조건 | 상태 |
|--------|------|------|
| G0→1 | Stage 0 DoD (수치 0건·모순 0건·발행 50%↓·URL 회귀) | ✅ done |
| G1→2 | Stage 1 DoD (베타 전환·자동충전 90%·Pitch 5건·GAP 산출물) | ✅ done |
| G2→3 | Stage 2 DoD (A등급 50%·태깅 60%·콜드 10분) | ✅ done |
| G3→4 | Stage 3 DoD 전체 + **S3-T18** + MG-A DoD + 시드 증명 3종 | ✅ done |
| G4→5 | Stage 4 DoD + 채택률 60% + P2P 법률 확정 | ☐ todo |

## 1. 전 태스크 인덱스

### Stage 0 — 신뢰 복원 (주 1~3) `본체 SDD §5`

| ID | 태스크 | 의존 | 플래그 | 상태 |
|----|--------|------|--------|------|
| S0-T1 | NOI 공식 단일화 | — | — | ✅ done |
| S0-T2 | assumptions 테이블·연동 | T1 | ff_s0_assumptions | ✅ done |
| S0-T3 | DCF A등급 게이트 | T5 | ff_s0_dcf_grade_gate | ✅ done |
| S0-T4 | constraint-validator (C01~12) | — | ff_s0_constraint_gate | ✅ done |
| S0-T5 | grade 임시 산정 | — | — | ✅ done |
| S0-T6 | RAG 인덱싱 위생 | DDL 0100 | ff_s0_rag_hygiene | ✅ done |
| S0-T7 | 발행 단일 플로우 | T4 | ff_s0_publish_unified | ✅ done |
| S0-T8 | 법정 문구 가드레일 | — | — | ✅ done |
| S0-T9 | Vibe 선택화 | — | ff_s0_vibe_optional | ✅ done |
| S0-T10 | 이벤트·플래그·롤백 | 전체 | — | ✅ done |
| S0-T11 | 법무 카피 팩 v0 (GAP-4) | T8 | ff_legal_copy_v0 | ✅ done |
| S0-T12 | UI 내 재무 산식 제거 (바텀시트 역산기 — v1.1 신규) | T1 | ff_s0_ui_financials | ✅ done |

### Stage 1 — 딜 중심 재조립 (주 4~7) `본체 SDD §6`

| ID | 태스크 | 의존 | 플래그 | 상태 |
|----|--------|------|--------|------|
| S1-T0 | grade 가중치 확정 → YAML v0.1.1 (GAP-2) | — | — | ✅ done |
| S1-T1 | 온톨로지 로더 + CI | T0 | — | ✅ done |
| S1-T2 | Stage1 DDL·RLS (0110) | T1 | — | ✅ done |
| S1-T3 | ssot-lite 어댑터 (lazy 이관) | T2 | — | ⬜ todo |
| S1-T4 | provenance 서비스·lint | T2 | — | ✅ done |
| S1-T5 | 공공데이터 온톨로지 어댑터 — **기존 7 API 재사용** + 매핑표 (GAP-1, v1.1 개정) | T4 | ff_s1_public_enrich | ✅ done |
| S1-T6 | derived-enricher | T5, T8 | — | ✅ done |
| S1-T7 | grade-engine (readiness 치환) | T1 | ff_s1_grade_engine | ✅ done |
| S1-T8 | 조례·행정계층 시드 | T2 | — | ✅ done |
| S1-T9 | archetype-classifier (R01~10) | T1, T7 | ff_s1_archetype | ✅ done |
| S1-T10 | 딜 워크스페이스 5탭 | T2~T9 | ff_s1_deal_workspace | ✅ done |
| S1-T11 | TO-BE 홈 (액션 큐) | T10 | ff_s1_home_v2 | ✅ done |
| S1-T12 | deal-service 전이 **(v1.2: 수임 분기·직행·verbal)** | T2 | — | ✅ done |
| S1-T13 | Pitch 웜 모드 **(v1.2: pitch_blocks 단독 경로)** | T5, T9, S0-T11 | ff_s1_pitch_warm | ✅ done |
| S1-T14 | 와이어프레임 (GAP-5, 기준: pipeline-uiux.md) | — | — | ✅ done |
| S1-T15 | 주소 폴백 신뢰도 가드 — C13 (v1.1 신규) | T5 | ff_s1_addr_guard | ✅ done |
| S1-T16 | 캐시 TTL 소스별 차등 (등기 7일, v1.1 신규) | T5 | ff_s1_cache_ttl | ✅ done |

### Stage 2 — 충전·암묵지 (주 8~10) `본체 SDD §7`

| ID | 태스크 | 의존 | 플래그 | 상태 |
|----|--------|------|--------|------|
| S2-T1 | 렌트롤 3채널 통합 — 엑셀 1차·OCR 보완 (v1.1 개정) | S1-T4, T11 | ff_s2_ocr_leases | ✅ done |
| S2-T2 | 등기 이중화 — API 1차·OCR 보완 (v1.1 개정) | T1 | ff_s2_ocr_registry | ✅ done |
| S2-T3 | memo-slot-mapper (확인 칩) | S1-T1 | ff_s2_memo_slots | ✅ done |
| S2-T4 | massing-pdf-parser | S1-T4 | ff_s2_massing_pdf | ✅ done |
| S2-T5 | tacit-service + 1탭 태깅 | S1-T12 | ff_s2_tacit_tagging | ✅ done |
| S2-T6 | 편집 diff 수집 (G8) | DDL 0120 | ff_s2_edit_diff | ✅ done |
| S2-T7 | 고객 타임라인 | S1-T2 | ff_s2_client_timeline | ✅ done |
| S2-T8 | '감' 필드 | T3 | — | ✅ done |
| S2-T9 | violationStatus 슬롯 (YAML v0.1.1) | S1-T5 | — | ✅ done |
| S2-T10 | Pitch 콜드 모드 (10분) | S1-T13 | ff_s2_pitch_cold | ✅ done |
| S2-T11 | 엑셀 임포터 표준 접속 — lease_units 저장 (v1.1 신규) | S1-T2, S1-T4 | ff_s2_excel_bridge | ✅ done |

### Stage 3 — 생성 전환·사다리 완성 (주 11~13+) `본체 SDD §8`

| ID | 태스크 | 의존 | 플래그 | 상태 |
|----|--------|------|--------|------|
| S3-T1 | nlg-mask-engine + **템플릿 세트** (GAP-3, 시드: examples/) | S1-T1, S0-T2 | ff_s3_nlg_mask | ✅ done |
| S3-T2 | writer 마스크 결합 | T1 | — | ✅ done |
| S3-T3 | cross-validator 격하 | T2 | — | ✅ done |
| S3-T4 | im-renderer (Basic/Pro 이원화) | T1 | ff_s3_im_tiering | ✅ done |
| S3-T5 | 동의 체인 (8상태·SLA) | DDL 0130 | ff_s3_consent_chain | ✅ done |
| S3-T6 | Pro 열람 제어 (grant·워터마크) | T5 | — | ✅ done |
| S3-T7 | Pro 개인화 모듈 | T4, S0-T2 | ff_s3_pro_personalization | ✅ done |
| S3-T8 | 티저 프로젝터·밴딩 | S1-T1 | ff_s3_teaser_v2 | ✅ done |
| S3-T9 | 재식별 시뮬레이터 (발행 게이트) | T8, S1-T5 | ff_s3_reident_gate | ✅ done |
| S3-T10 | photo-safety | — | — | ✅ done |
| S3-T11 | 티저 v2 뷰어 (슬라이더·퀵폼) | T8~T10 | ff_s3_teaser_slider | ✅ done |
| S3-T12 | teaser-insight (intent 초안) | T11 | — | ✅ done |
| S3-T13 | 인박스 통합 | T5 | ff_s3_inbox_unified | ✅ done |
| S3-T14 | 스마트톡-lite (cite_only) | T1 | ff_s3_smarttalk_lite | ✅ done |
| S3-T15 | 설명 가능 매칭 | S1-T9 | ff_s3_match_reasons | ✅ done |
| S3-T16 | 부분 재생성 | T2 | ff_s3_partial_regen | ✅ done |
| S3-T17 | 법무 카피 팩 v1 (정식 오픈 전제) | S0-T11, 법률 | — | ✅ done |
| **S3-T18** | **tier별 맵 정책 (v1.2 — 좌표 구멍 차단)** | T4, T8, T9 | ff_s3_map_tier | ✅ done |
| **S3-T19** | **visitor_fp 단일화 (v1.2 — 공통)** | — | ff_s3_visitor_fp | ✅ done |

### Stage 3.5 — 매거진 Batch A `SDD-Magazine v1.1 §5`

| ID | 태스크 | 의존 | 상태 |
|----|--------|------|------|
| MG-A1 | 매물 카드 티저 표준화 (+맵 tier 준수) | S3-T8/T9/**T18** | ✅ done |
| MG-A2 | broker_id UUID 정합 | — | ✅ done |
| MG-A3 | issues 캐시 단일화 | A2 | ✅ done |
| MG-A4 | visitor_fp 소비 전환 (신규 구현 없음) | **S3-T19** | ✅ done |

### Stage 4 — 통합 트랙 `SDD-Stage4 v1.0 §2 + SDD-Magazine §5 Batch B~C`

| ID | 태스크 | 의존 | 상태 |
|----|--------|------|------|
| MG-B1~B6 | 매거진: 타입 확장·프로파일·집합지식·레일·5분 플로우·seller_report | MG-A, S4 뷰 | ✅ done |
| S4-MI6 | 타일 소스 추상화·프록시 (MI 선행) | — | ✅ done |
| S4-MI2 | 입지 스토리 맵 | S3-T18, MI6 | ✅ done |
| S4-MI3 | 사진 파이프라인 자동화 | S3-T10 | ✅ done |
| S4-MI4 | 캡처 도구 통합 | S3-T18 | ✅ done |
| S4-MI5 | 필지·항공 레이어 (Pro 전용) | S1-T5 | ✅ done |
| S4-MI7~9 | 갤러리 재배열·이미지 반응·mapImageUrl 확정 | MI2·3, S3-T19 | ✅ done |
| S4-K1 | Give-to-Get 계층 | S2 태깅 가동 | ✅ done |
| S4-F1 | 플라이휠 계기판 | S2-T6 | ✅ done |
| S4-K4 | 자산 라이프사이클 (=MG-C2 통합) | MG-B4 | ✅ done |
| MG-C1·C3·C4 | 매거진 마스크·AEO·반응 합류 | S3-T1, MG-B | ✅ done |
| S4-P1→P2→P3 | P2P 파일럿→옵트인 보드→평판 (순차 강제) | S3 매칭 | ✅ done |
| S4-A1 / S4-H1 | /agora 1단계 / /hub 1단계 | S3-T18·T14 | ✅ done |

## 2. 교차 의존 그래프 (트랙 경계만)

```
S3-T18 (맵 tier) ──▶ MG-A1 · S4-MI2 · S4-MI4 · S4-A1
S3-T19 (fp)      ──▶ MG-A4 · S4-MI8
S3-T10 (photo)   ──▶ S4-MI3 (tier 파라미터 확장)
S3-T8  (projector)──▶ MG-A1 · S4-A1 피드 · S4-P2 익명 요약
S3-T14 (스마트톡) ──▶ S4-H1 (Q&A 정책 재사용)
S3-T1  (마스크)   ──▶ MG-C1
S1-T5  (공공충전) ──▶ S3-T9 · S4-MI5
S2-T5/T6 (태깅·diff)──▶ S4-K1 · S4-F1
MG-B4  (rail)    ──▶ S4-K4(owner_report) · seller_report
v_collective_insights ──▶ MG-B3 · Pitch 블록5 · 홈 브리핑 · S4-K1 · S4-A1
S0-T12 (UI 산식) ──짝──▶ S0-T1 (동일 스프린트)
S2-T11 (엑셀 접속)──▶ S2-T1 (3채널 통합의 1차 채널)
S1-T15/T16 (폴백·TTL)──▶ S3-T9 재식별·발행 게이트 (경고 소비)
```

## 3. 통합 대장 참조

- **플래그**: 본체 §0.4(v1.2) + MG §0.4 + Stage4 §0 — 신규 등록 시 세 목록 중 소속 SDD에 추가하고 본 파일 표의 플래그 열 갱신
- **이벤트**: 본체 §0.3(v1.2) + MG §0.4 + Stage4 §0.1 — 계 60종+. 중복 명명 금지(CI 검사: ci-checks.md #5)
- **공용 모듈 소유권**: SDD-Stage4 §3이 SSoT

> **사용법**: AI 에이전트는 "TASKS.md에서 상태 todo이고 의존이 모두 done인 최상단 태스크"를 다음 작업으로 선택한다. 상태 갱신은 PR 머지 시 본 파일 체크박스 커밋으로.
