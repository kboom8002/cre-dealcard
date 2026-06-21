# 3시스템 통합 E2E 테스트 셋 — MECE 설계

> 도출일: 2026-05-11 | 시스템: cre-dealcard · cre-fullim · cre-aipage

---

## 테스트 계층 구조 (MECE)

```
L1. DB/마이그레이션    — 테이블·인덱스·함수 존재 확인
L2. 도메인 로직       — 순수 함수 단위 테스트
L3. API 엔드포인트    — HTTP 요청/응답 검증
L4. 크로스시스템 통합  — 핸드오프·데이터 플라이휠
L5. UI/UX            — 컴포넌트 렌더링·인터랙션
```

---

## 시스템 1: cre-dealcard (48 테스트)

### L1. DB 마이그레이션 (7)

| ID | 테스트 | 검증 | 우선 |
|---|---|---|---|
| DC-L1-01 | 00008 matching 테이블 존재 | match_results, deal_casepacks, deal_pipeline_states 생성됨 | P0 |
| DC-L1-02 | 00009 prediction/graph 테이블 존재 | knowledge_edges, external_transactions, price_features, deal_conversion_features, buyer_clusters 생성됨 | P0 |
| DC-L1-03 | 00010 semantic search 함수 존재 | search_similar_deals, search_similar_ims RPC 호출 가능 | P0 |
| DC-L1-04 | building_ssot_lite promotion 컬럼 | promotion_score, matched_buyer_count, vacancy_demand_verified 컬럼 존재 | P0 |
| DC-L1-05 | buyer_intent_lite cluster 컬럼 | cluster_id, cluster_label, cluster_updated_at 컬럼 존재 | P1 |
| DC-L1-06 | deal_casepacks embedding 컬럼 | embedding vector(1536) 컬럼 존재 | P1 |
| DC-L1-07 | knowledge_edges unique 인덱스 | 중복 엣지 삽입 시 upsert 동작 확인 | P1 |
| DC-L1-08 | 00052 scheduling 테이블 존재 | availability_slots, bookings 테이블 생성됨 | P0 |
| DC-L1-09 | bookings booked_by 컨럼 | booked_by (uuid, nullable) 컨럼 존재, proxy booking RLS 허용 | P0 |

### L2. 도메인 로직 (10)

| ID | 테스트 | 대상 파일 | 검증 | 우선 |
|---|---|---|---|---|
| DC-L2-01 | 3-Stage 매칭 엔진 | matching-engine.ts | 규칙 필터→유사도→가중치 순서, S/A/B/C 등급 반환 | P0 |
| DC-L2-02 | 프로모션 점수 | promotion-ranker.ts | 6개 팩터 반영, 0-1 범위 | P0 |
| DC-L2-03 | CasePack 추출 | casepack-extractor.ts | 딜카드 생성 시 task/knowledge/warning 구조화 | P0 |
| DC-L2-04 | 파이프라인 상태머신 | bridge-state-machine.ts | 유효 전이만 허용, 잘못된 전이 오류 | P0 |
| DC-L2-05 | 딜 전환 휴리스틱 | deal-conversion-predictor.ts | S등급 매칭 시 확률↑, 30일 정체 시 확률↓ | P1 |
| DC-L2-06 | 딜 전환 팩터 설명 | deal-conversion-predictor.ts | topFactors 5개 이내, impact 문자열 포함 | P1 |
| DC-L2-07 | 피처 추출 28개 | deal-feature-extractor.ts | 모든 피처 null 아닌 숫자 반환 | P1 |
| DC-L2-08 | K-Means 클러스터링 | buyer-clustering.ts | k=3-6 자동 선택, 실루엣 스코어 > 0 | P1 |
| DC-L2-09 | 가격 추정 구간 | price-prediction.ts | lower80 < median < upper80, confidence 반환 | P1 |
| DC-L2-10 | 지식그래프 엣지 생성 | knowledge-graph.ts | matched_with 양방향 엣지, weight 0-1 범위 | P1 |
| DC-L2-11 | 예약 오케스트레이터 | booking-orchestrator.ts | CAS 패턴 hold → booking 생성, 실패 시 롤백 | P0 |
| DC-L2-12 | 동시 예약 방어 | booking-orchestrator.ts | 동일 슬롯 2개 요청 시 1개만 성공 (concurrent_booking) | P0 |
| DC-L2-13 | 도메인별 Hold 타임아웃 | booking-orchestrator.ts | default=24h, wedding=72h, consulting=48h, counseling=30m | P1 |
| DC-L2-14 | hold-expiry-cron | hold-expiry-cron.ts | 만료된 hold → cancelled, 슬롯 available 복원 | P1 |
| DC-L2-15 | 카카오 웹훅 시뮬레이션 | kakao-webhook.ts | 이벤트 로깅 + 성공 응답 반환 | P1 |

### L3. API 엔드포인트 (12)

| ID | 테스트 | 엔드포인트 | 검증 | 우선 |
|---|---|---|---|---|
| DC-L3-01 | 딜카드 생성 from memo | POST /api/broker/deal-card/from-memo | 200 + building_ssot_lite 생성 | P0 |
| DC-L3-02 | 매수자 메모 분석 | POST /api/broker/buyer-memo | 200 + buyer_intent_lite 생성 | P0 |
| DC-L3-03 | AI 매칭 실행 | POST /api/broker/match | 200 + match_results 저장 + grade 반환 | P0 |
| DC-L3-04 | 매칭 시 그래프 엣지 생성 | POST /api/broker/match | knowledge_edges에 matched_with 삽입 확인 | P1 |
| DC-L3-05 | 파이프라인 전이 | POST /api/broker/buildings/[id]/pipeline | 200 + stage 변경 확인 | P0 |
| DC-L3-06 | 딜 브리핑 생성 | GET /api/broker/buildings/[id]/briefing | 200 + matchedBuyers, similarDeals 포함 | P1 |
| DC-L3-07 | 딜 인텔리전스 | GET /api/broker/buildings/[id]/conversion | 200 + conversion.probability 0-1 반환 | P1 |
| DC-L3-08 | 매물 랭킹 | GET /api/broker/buildings/rank | 200 + promotionScore 내림차순 | P1 |
| DC-L3-09 | 매수자 클러스터링 | POST /api/broker/prediction/cluster-buyers | 데이터 부족 시 422 + 메시지 | P1 |
| DC-L3-10 | 가격 추정 | POST /api/broker/prediction/price | 200 + priceRange.median 반환 | P1 |
| DC-L3-11 | MOLIT ETL (admin) | POST /api/admin/etl/molit | 403 (비관리자), 200 (관리자) | P2 |
| DC-L3-12 | 인증 실패 | 모든 broker/* | Authorization 없을 때 401 | P0 |
| DC-L3-13 | ICS 캘린더 내보내기 | GET /api/broker/schedule/export | 200 + text/calendar + VCALENDAR/VEVENT 포맷 | P1 |
| DC-L3-14 | ICS 인증 필수 | GET /api/broker/schedule/export | 미인증 시 401 | P0 |

### L5. UI 컴포넌트 (7)

| ID | 테스트 | 컴포넌트 | 검증 | 우선 |
|---|---|---|---|---|
| DC-L5-01 | DealBriefingCard 렌더 | DealBriefingCard | matchedBuyers 표시, similarDeals 표시 | P1 |
| DC-L5-02 | PipelineStatusBar 렌더 | PipelineStatusBar | 현재 stage 하이라이트, 전이 버튼 | P1 |
| DC-L5-03 | ConversionIntelCard 게이지 | ConversionIntelCard | 확률 % 표시, 색상 분기 (녹/황/적) | P1 |
| DC-L5-04 | ConversionIntelCard 탭 전환 | ConversionIntelCard | 성사예측/연관매물/유사딜 탭 동작 | P1 |
| DC-L5-05 | ConversionIntelCard 팩터 | ConversionIntelCard | topFactors 표시, +/- 색상 분기 | P2 |
| DC-L5-06 | ConversionIntelCard 네트워크 | ConversionIntelCard | networkRecommendations 매물 목록 표시 | P2 |
| DC-L5-07 | ConversionIntelCard 로딩 | ConversionIntelCard | loading 상태 스피너 표시 | P2 |
| DC-L5-08 | BookingFlow 3단계 | BookingFlow | 날짜→시간→확인 플로우, 데이터 바인딩 | P0 |
| DC-L5-09 | CalendarPicker 렌더 | CalendarPicker | 가용 날짜 하이라이트, 빈 상태 안내 | P1 |
| DC-L5-10 | ScheduleSection 위젯 | ScheduleSection | 예약/슬롯 카운트, CTA 링크, 스켈레톤 로딩 | P1 |
| DC-L5-11 | BrokerScheduleClient | BrokerScheduleClient | 오버뷰 카드, 슬롯 생성 모달, 예약 목록 | P1 |
| DC-L5-12 | 퍼널 6단계 확장 | FunnelPage | 임장 예약 단계 표시 + 전환율 계산 | P1 |

---

## 시스템 2: cre-fullim (15 테스트)

### L2. 도메인 로직 (6)

| ID | 테스트 | 대상 파일 | 검증 | 우선 |
|---|---|---|---|---|
| FI-L2-01 | Readiness 점수 계산 | readiness-service.ts | 0-100, rent_roll 누락 시 차감 | P0 |
| FI-L2-02 | 18섹션 계획 | section-planner.ts | 정확히 18개, 중복 없음, 순서 1-18 | P0 |
| FI-L2-03 | Gate 체크 (Disclosure) | gate-review-service.ts | 정확한 주소 노출 → P0 blocked | P0 |
| FI-L2-04 | Gate 체크 (Risk) | gate-review-service.ts | "수익률 보장" → P0 blocked | P0 |
| FI-L2-05 | 모바일 IM 7섹션 생성 | mobile-im-writer.ts | 7개 섹션, 마크다운 비어있지 않음 | P0 |
| FI-L2-06 | Buyer-Ready 승인 | gate-review-service.ts | reviewer만 승인 가능, P0 시 불가 | P1 |

### L3. API 엔드포인트 (6)

| ID | 테스트 | 엔드포인트 | 검증 | 우선 |
|---|---|---|---|---|
| FI-L3-01 | IM 프로젝트 생성 | POST /api/im-projects | 200 + project_id 반환 | P0 |
| FI-L3-02 | 섹션 초안 생성 | POST /api/im-sections/generate | 200 + 마크다운 반환 | P0 |
| FI-L3-03 | Gate 체크 실행 | POST /api/im-projects/[id]/gate-check | 200 + overall_status 반환 | P0 |
| FI-L3-04 | 모바일 IM 생성 | POST /api/mobile-im/generate | 200 + 7섹션 반환 | P0 |
| FI-L3-05 | 모바일 IM 내보내기 | POST /api/mobile-im/export | 200 + HTML/마크다운 반환 | P1 |
| FI-L3-06 | 전문가 패치 제출 | POST /api/expert-patches | 200 + 패치 저장 확인 | P1 |

### L5. UI (3)

| ID | 테스트 | 검증 | 우선 |
|---|---|---|---|
| FI-L5-01 | 섹션 에디터 렌더 | 18개 섹션 목록 표시, 상태별 색상 | P1 |
| FI-L5-02 | Gate 대시보드 | 8개 게이트 상태 표시, P0 시 빨간색 | P1 |
| FI-L5-03 | 모바일 IM 뷰어 | 7섹션 카드 표시, 공유 버튼 | P1 |

---

## 시스템 3: cre-aipage (14 테스트)

### L2. 도메인 (4)

| ID | 테스트 | 대상 | 검증 | 우선 |
|---|---|---|---|---|
| AP-L2-01 | 사진 분류 에이전트 | visual-classification-agent.ts | category: exterior/interior/facility 반환 | P0 |
| AP-L2-02 | 임차인 적합 에이전트 | tenant-fit-agent.ts | fit_score 0-100, fit_reasons 배열 | P0 |
| AP-L2-03 | 감성 분석 에이전트 | vibe-fit-agent.ts | vad_profile 3차원, atmosphere_tags 배열 | P1 |
| AP-L2-04 | 문의 자격 에이전트 | inquiry-qualifier-agent.ts | qualification_level 반환 | P1 |

### L3. API (7)

| ID | 테스트 | 엔드포인트 | 검증 | 우선 |
|---|---|---|---|---|
| AP-L3-01 | 공간 생성 from memo | POST /api/spaces/create-from-memo | 200 + space_id 반환 | P0 |
| AP-L3-02 | 사진 업로드 | POST /api/spaces/[id]/upload-photos | 200 + visual_assets 저장 | P0 |
| AP-L3-03 | 사진 AI 분류 | POST /api/spaces/[id]/classify-photos | 200 + 분류 결과 반환 | P0 |
| AP-L3-04 | 임차인 적합 평가 | POST /api/spaces/[id]/evaluate-fit | 200 + fit_score 반환 | P0 |
| AP-L3-05 | 임대 페이지 생성 | POST /api/spaces/[id]/generate-leasing-page | 200 + HTML 반환 | P1 |
| AP-L3-06 | 건물주 리포트 | POST /api/spaces/[id]/owner-report | 200 + 리포트 마크다운 | P1 |
| AP-L3-07 | 임대 문의 등록 | POST /api/spaces/[id]/inquiries | 200 + inquiry_id 반환 | P1 |

### L5. UI (3)

| ID | 테스트 | 검증 | 우선 |
|---|---|---|---|
| AP-L5-01 | 공간 사진 페이지 | 사진 그리드 렌더, 분류 태그 표시 | P1 |
| AP-L5-02 | 비주얼 앨범 페이지 | 앨범 카드 렌더, 슬라이드 동작 | P2 |
| AP-L5-03 | 공간 발행(publish) | publish 버튼 클릭 → 상태 변경 | P2 |

---

## L4. 크로스시스템 통합 (10 테스트)

### 시나리오 A: "오늘 본 매물, 오늘 보낸다"

| ID | 테스트 | 흐름 | 검증 | 우선 |
|---|---|---|---|---|
| X-L4-01 | 메모→딜카드→모바일IM | DC: from-memo → FI: mobile-im/generate | building_ssot_lite → 모바일 IM 7섹션 연계 | P0 |
| X-L4-02 | 딜카드→매칭→그래프 | DC: from-memo → match → knowledge_edges | matched_with 엣지 + CasePack 임베딩 생성 | P0 |

### 시나리오 B: "Full IM 올려보자"

| ID | 테스트 | 흐름 | 검증 | 우선 |
|---|---|---|---|---|
| X-L4-03 | 딜카드→Full IM 핸드오프 | DC: full-im-handoffs → FI: im-projects | ssot_lite → ssot_full 데이터 이관 | P0 |
| X-L4-04 | AiPage 데이터→Full IM 섹션7 | AP: evaluate-fit → FI: 섹션 생성 | tenant_fit 데이터가 미시시장 섹션에 반영 | P1 |
| X-L4-05 | P-D 가격→Full IM 섹션12 | DC: prediction/price → FI: 가치평가 섹션 | price_range가 IM에 자동 삽입 | P1 |

### 시나리오 C: "건물주 보고"

| ID | 테스트 | 흐름 | 검증 | 우선 |
|---|---|---|---|---|
| X-L4-06 | 공간 AI→딜카드 vacancy 보강 | AP: evaluate-fit → DC: enrich-from-leasing | vacancy_demand_verified=true 반영 | P1 |
| X-L4-07 | 공간 AI→딜카드 프로모션 갱신 | AP: inquiries → DC: enrich-vacancy | promotion_score 증가 확인 | P1 |

### 데이터 플라이휠

| ID | 테스트 | 흐름 | 검증 | 우선 |
|---|---|---|---|---|
| X-L4-08 | 매칭 축적→유사 딜 검색 | match 30건 → G-D findSimilarDeals | mode: 'semantic' 전환 확인 | P2 |
| X-L4-09 | 파이프라인 종료→P-X 스냅샷 | pipeline closed → deal_conversion_features | converted=true 스냅샷 저장 | P1 |
| X-L4-10 | 클러스터→매칭 가중치 | P-D2 cluster → match → PURPOSE_WEIGHTS | cluster_id 기반 weight profile 적용 | P2 |

---

## 우선순위 요약

| 우선순위 | 개수 | 설명 |
|---|---|---|
| **P0** | 29 | 핵심 플로우 — 실패 시 시스템 사용 불가 |
| **P1** | 33 | 고도화 기능 — 실패 시 차별화 기능 작동 안 함 |
| **P2** | 15 | UI 폴리시/부가 기능 — 실패 시 UX 저하 |
| **합계** | **77** | |

### P0 최우선 실행 테스트 (25개)

```
DC-L1-01~04  DB 마이그레이션 (4)
DC-L2-01~04  매칭·프로모션·CasePack·파이프라인 (4)
DC-L3-01~03  딜카드·매수자·매칭 API (3)
DC-L3-05     파이프라인 API (1)
DC-L3-12     인증 (1)
FI-L2-01~05  Readiness·Section·Gate·MobileIM (5)
FI-L3-01~04  IM프로젝트·섹션·Gate·MobileIM API (4)
AP-L2-01~02  사진분류·임차인적합 (2)
AP-L3-01~04  공간생성·사진·분류·적합 API (4)
X-L4-01~03   크로스시스템 핸드오프 (3)
```

---

## 실행 전제조건

| 조건 | 상태 | 필요 작업 |
|---|---|---|
| Supabase 00008 마이그레이션 | ⚠️ 확인 필요 | `supabase db push` |
| Supabase 00009 마이그레이션 | ⚠️ 신규 | `supabase db push` |
| Supabase 00010 함수 | ⚠️ 신규 | pgvector Extension + push |
| 테스트 사용자 (인증) | ⚠️ 확인 필요 | 테스트용 Supabase 사용자 생성 |
| OpenAI API 키 | ⚠️ 확인 필요 | .env.local 설정 |
| MOLIT API 키 | ⚠️ 선택 | P-D ETL 테스트 시만 필요 |

---

## 테스트 파일 구조 (제안)

```
cre-dealcard/
  src/tests/
    db/               DC-L1-* (마이그레이션 검증)
    domain/           DC-L2-* (순수 로직)
    api/              DC-L3-* (API 통합)
    ui/               DC-L5-* (컴포넌트)
    cross-system/     X-L4-*  (통합 시나리오)

cre-fullim/
  src/tests/
    domain/           FI-L2-*
    api/              FI-L3-*
    ui/               FI-L5-*

cre-aipage/
  app/src/tests/
    agents/           AP-L2-*
    api/              AP-L3-*
    e2e/              AP-L5-*
```
