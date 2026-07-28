# CREDEAL SDD — Stage 4 구현 명세서 (네트워크·환류·시각 자산·공개 표면)

> **버전**: v1.0 (2026-07-25) · **범위**: Stage 3.5~4 (본체 S3 + MG-A 완료 후, 분기 2~3)
> **규약**: 본체 SDD v1.2 §0 전부 상속 (스펙 우선·YAML SSoT·URL 불변·provenance 의무·flag·명시적 전이·수치 마스크). 태스크 착수 순서는 `TASKS.md`가 SSoT.
> **트랙 구성**: ①MG Batch B~C (SDD-Magazine v1.1 참조 — 본 문서에서 재기술하지 않음) ②MI 맵/이미지 (본 문서에서 태스크 공식화) ③K1·F1·K4 (3대 효과) ④P2P 옵트인 ⑤/agora·/hub 1단계
> **진입 게이트**: 본체 S3 DoD 전체 + S3-T18(맵 구멍 차단) + MG-A DoD + 90일 시드 증명 3종 달성

---

# 0. Stage 4 특칙

1. **공용 모듈 소유권 계약 (§3)** 준수 — 소유 트랙 외의 수정은 소유 트랙 리뷰 필수
2. **네트워크 트랙(P2P)의 수익 로직 금지** — 법률 구조 확정 전까지 합의 템플릿 생성까지만 (본체 DO NOT 준용)
3. **환류(K1)·공개 표면(/agora)의 통계는 `v_collective_insights` 단일 소스** — N≥5 게이트는 뷰에 내장
4. Feature flags: `ff_s4_{track}_{feature}` (트랙: mi·k1·k4·p2p·agora·hub)

## 0.1 신규 이벤트

```
MI: map_story_rendered, map_annotation_clicked, photo_auto_classified,
    photo_caption_edited, capture_inserted_to_im, gallery_card_dwell,
    parcel_overlay_rendered
K1/F1/K4: insight_tier_unlocked, contribution_score_changed,
    flywheel_dashboard_viewed, owner_report_subscribed, sell_signal_detected
P2P: network_optin_toggled, cross_match_proposed, cross_match_gate_approved,
    reputation_updated
공개표면: agora_feed_syndicated, hub_intent_agent_registered, aeo_citation_detected
```

# 1. 데이터 (`0150_stage4.sql`)

```sql
-- MI: 타일 프록시 캐시 · 이미지 반응
CREATE TABLE map_tile_cache (
  tile_key text PRIMARY KEY,          -- '{source}/{z}/{x}/{y}'
  body bytea NOT NULL, content_type text, fetched_at timestamptz DEFAULT now()
);
-- 이미지 반응은 teaser_events 규격 재사용: event_type='gallery_card_dwell' payload={photo_id,type,ms}

-- K1: 기여 스코어·계층
CREATE TABLE contribution_scores (
  broker_id uuid PRIMARY KEY,
  outcome_inputs int DEFAULT 0,       -- 성사가 입력 수
  lost_tags int DEFAULT 0, reject_tags int DEFAULT 0, diff_consents int DEFAULT 0,
  tier text DEFAULT 'basic' CHECK (tier IN ('basic','bronze','gold','platinum')),
  updated_at timestamptz DEFAULT now()
);
-- 계층별 인사이트 접근은 v_collective_insights_deep 뷰들의 RLS로 게이트

-- K4: 매도 신호
CREATE TABLE sell_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL, owner_client_id uuid,
  signal_kind text NOT NULL,          -- 'report_deep_read'|'price_inquiry'|'valuation_request'
  strength numeric, detected_at timestamptz DEFAULT now(), notified boolean DEFAULT false
);

-- P2P: 평판 v1 (deals.network_visible은 S1 DDL에 선반영됨 — 활성화만)
CREATE TABLE broker_reputation (
  broker_id uuid PRIMARY KEY,
  closed_cross_deals int DEFAULT 0,
  avg_response_hours numeric, mutual_ratings jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);
```

# 2. 태스크 분해

## Track MI — 맵/이미지 (선독 공통: `docs/specs/map-image-upgrade.md`)

| ID | 태스크 | 내용 | 의존 | 테스트·DoD |
|----|--------|------|------|------------|
| S4-MI2 | 입지 스토리 맵 | 서버 SVG 주석 합성(역 연결선+도보시간·접면 강조·POI 칩)·아키타입 프리셋·정적 캐시. 주석 수치 전수 슬롯 렌더+배지, LLM 생성 0 | S3-T18, S4-MI6 | 스냅샷·주석-슬롯 일치 검증 |
| S4-MI3 | 사진 파이프라인 자동화 | 업로드 시 14타입 자동 분류+photo-safety 동시 검사(§3 공용 계약)·온톨로지 캡션 제안·아키타입별 히어로 선정·tier 갤러리 필터 | S3-T10 | 분류 제안 수락률 계측·Basic 갤러리 외관 0 |
| S4-MI4 | 캡처 도구 통합 | A지점 자동·B지점 온톨로지 칩(최근접역·IC·랜드마크)·[IM에 삽입](Pro 슬롯 저장)·물류 IC 거리맵 템플릿 | S3-T18 | E2E: 수동 입력 0으로 캡처→삽입 |
| S4-MI5 | 필지·항공 레이어 | vworld 항공+연속지적도 오버레이(PNU 재사용)·경계·면적·접면 라벨·개발부지 표준 시각 세트. **Pro 이상 전용** | S1-T5 | 개발부지 IM 표준 세트 렌더·tier 차단 |
| S4-MI6 | 타일 소스 추상화 | vworld 타일 기본+OSM 폴백·프록시 캐시(map_tile_cache)·소스 설정화 | — | p95 응답·폴백 동작 |
| S4-MI7 | 갤러리 스토리 재배열·섹션 인라인 | 서사 순서 동기화·섹션별 인라인 1장·VALUE_ADD 전후 슬라이더 | MI2·MI3 | E2E |
| S4-MI8 | 이미지 반응 수집 | 갤러리 카드 체류·라이트박스 진입 이벤트(teaser_events 규격·S3-T19 fp)·아키타입×타입 집계→히어로 로직 보정 | S3-T19, MI3 | 이벤트 정합 |
| S4-MI9 | mapImageUrl 용도 확정 | OG·PDF 전용으로 문서화 또는 생성 중단 — 결정 기록 | — | 문서화 |

## Track K — 3대 효과 (선독: 3대 효과 문서·SDD-Magazine MG-C2)

| ID | 태스크 | 내용 | 의존 | DoD |
|----|--------|------|------|-----|
| S4-K1 | Give-to-Get 계층 | contribution_scores 산정 배치·계층별 심화 인사이트 뷰(RLS 게이트)·앱 내 "잠금 해제" UI. 기본 계층은 전원 무료 유지 | S2 태깅 가동 | 계층 게이트 무결·무임승차 기본층 보존 |
| S4-F1 | 플라이휠 계기판 | 브로커 개인 기여→효과 가시화("당신의 편집 N건→편집률 X%p↓")·홈 카드 | S2-T6 | 열람률 계측 |
| S4-K4 | 자산 라이프사이클 (owner_report) | **SDD-Magazine MG-C2와 단일 태스크로 통합 실행** — deals.closed 훅 구독 자동화·분기 리포트(rail)·sell_signals 감지→브로커 알림→재수임 Pitch 제안 | MG-B4, MG-C2 | closed→구독→발송→신호 E2E |

## Track P2P — 공동중개 옵트인 (선독: DEV_SPEC S5·티저 스펙 §6.1)

| ID | 태스크 | 내용 | 의존 | DoD |
|----|--------|------|------|-----|
| S4-P1 | 수동 파일럿 운영킷 | 신뢰 브로커 2~3쌍 수동 중개 절차·기록 양식·관행 학습 리포트 (**시스템 개방 전 필수 선행**) | — | 파일럿 3건 기록 |
| S4-P2 | 옵트인 보드 | deals.network_visible 활성화·익명 요약=티저 public 슬롯·크로스 매칭(match-engine 대상 확장)·Gate 3단 공개 재사용 | S4-P1·S3 매칭 | 크로스 매칭 진행 3건+ |
| S4-P3 | 평판 v1 | broker_reputation 산정·프로필 표시·수수료 **합의 템플릿 생성만** (배분 로직 금지) | P2 | 법률 게이트 준수 |

## Track 공개 표면 — /agora·/hub 1단계 (선독: AEO 설계 답변·MG-C3)

| ID | 태스크 | 내용 | 의존 | DoD |
|----|--------|------|------|-----|
| S4-A1 | /agora 1단계 | 블라인드 딜 피드(티저 규격·문의는 브로커 라우팅)·용어 가이드(온톨로지 대중 번역)·JSON-LD·llms.txt | S3-T18, MG-C3 | 리드 라우팅 100%·커뮤니티 기능 0 |
| S4-H1 | /hub 1단계 | 매수자 조건 에이전트 등록(조건→신규 티저 알림·brokered Q&A는 스마트톡 정책 재사용) | S3-T14, A1 | 조건 등록 수 계측·직거래 경로 0 |

# 3. 공용 모듈 소유권 계약 (분쟁 예방)

| 모듈 | 소유 | 소비자 | 변경 규칙 |
|------|------|--------|-----------|
| `photo-safety.ts` | 본체(S3-T10) | 티저·MI3(tier 파라미터 추가는 MI3가 PR, 본체 리뷰) | 시그니처: `check(photo, {usage:'teaser'\|'im_basic'\|'im_pro'})` |
| `visitor-fingerprint.ts` | 본체(S3-T19) | 티저·매거진(MG-A4)·이미지 반응(MI8) | 알고리즘 변경은 전 소비자 마이그레이션 동반 |
| `teaser-projector.ts` | 본체(S3-T8) | 딜카드·매거진(MG-A1)·/agora 피드·P2P 익명 요약 | public 슬롯 추가는 재식별 게이트 영향 평가 필수 |
| `map-tier-renderer.ts` | 본체(S3-T18) | IM 뷰어·티저·매거진 카드·/agora | tier 정책 변경은 스펙 개정 선행 |
| `rail/dispatcher.ts` | 매거진(MG-B4) | weekly·seller_report·owner_report(K4) | 에디션 타입 추가는 dispatcher 계약 준수 |
| `v_collective_insights` | 본체(S4 환류) | 매거진(MG-B3)·Pitch 블록5·홈 브리핑·K1 심화뷰·/agora | N≥5는 뷰 내장 — 소비자측 재검증 금지(이중 완화 방지) |

# 4. 게이트·DoD 종합

- **Stage 4 완료 판정**: MI(스토리 맵·자동 사진·필지 레이어 가동) + K(K1 계층·K4 순환 개시) + P2P(크로스 3건) + 공개 표면(agora/hub 1단계) + MG Batch B~C DoD
- **Stage 5 진입 조건**: 다음 액션 채택률 60%+(에이전트 승격 데이터)·K4 리포트 구독 유지율 측정 1분기·P2P 법률 구조 확정

# 5. DO NOT (Stage 4 추가분 — 본체·MG·MI 목록에 병합)

```yaml
- "공용 모듈의 비소유 트랙 단독 수정 (소유 트랙 리뷰 미경유)"
- "v_collective_insights 소비자측 N 재검증·완화"
- "K1 심화 인사이트의 계층 미게이트 노출 / 기본 계층 유료화"
- "sell_signals 기반 플랫폼 직접 접촉 (브로커 경유 불변)"
- "P2P 수수료 배분 로직 (합의 템플릿까지만 — 법률 게이트)"
- "/agora 게시판·댓글 기능 (큐레이션 포털 원칙)"
- "/hub 매수자-매도자 직접 연결 경로"
- "필지 경계 오버레이·캡처 삽입물의 Basic 이하 노출"
```

> **구현 시작점**: TASKS.md 순서 준수 — Stage 4 내 첫 착수는 S4-MI6(타일 기반)·S4-P1(파일럿 운영킷, 무코드)·MG-B1이 병렬 가능. 본 문서는 "무엇을"의 요약이며, 각 태스크의 "왜"는 선독 문서가 담당한다.
