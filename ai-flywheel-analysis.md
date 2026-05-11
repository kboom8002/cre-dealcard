# JS CRE 3-시스템 AI 기능 체계 및 Unfair Advantage 분석

> 분석 기준일: 2026-05-11  
> 대상: cre-dealcard · cre-fullim · cre-aipage

---

## 1. 시스템별 AI 기능 체계

### 1-A. cre-dealcard (JS 1분 딜카드 — 딜 최전선)

> **포지션**: 중개인이 매일 쓰는 도구. AI의 첫 번째 접점.

| AI 기능 | 구현 에이전트/프롬프트 | 입력 | 출력 |
|---|---|---|---|
| **메모 파싱 → 건물 SSoT 생성** | `BrokerDealCardAgent` + `BuildingMiniTruth` 프롬프트 | 카카오 수준 자유형 메모 | Building SSoT Lite (자산정체성/물리신호/바이어핏/주의요약) |
| **딜 큐리오시티 리포트** | `DealCuriosityWriter` + `prompt_deal_curiosity_report_v1` | Building SSoT Lite | 딜 포인트 배열, 리스크 질문, 매수자 핏 가설, 딜 시나리오, 다음 행동 CTA |
| **블라인드 티저 생성** | `BlindTeaserSystem` 프롬프트 | Building SSoT Lite | 개인정보 없는 안전한 공개용 딜카드 텍스트 + 카카오 공유 문구 |
| **매수자 조건 정규화** | `BuyerIntentNormalizer` | 매수자 메모/조건 메시지 | 정형화된 매수 조건 (예산대/목적/지역/업종) |
| **매수자 답장 문구 생성** | `BuyerMemoWriter` | 정규화된 매수자 조건 + Building SSoT Lite | 매수자 맞춤 카카오 답장 초안 |
| **정보공개 가드** | `DisclosureGuard` (공유) | SSoT 원문 + 공개 수준 설정 | 정확한 주소/임차인명/단위임대료/매도자사정/협상메모 자동 제거 |

**가드레일 특이점**:
- "매수를 추천", "수익률 보장", "대출 가능", "법적 문제 없음" 등 **P0 금지 표현 자동 탐지 및 블록**
- 출력 타입별 보호 필드 차별 적용: `blind_teaser` < `external_snapshot` < `full_im`

---

### 1-B. cre-fullim (Full IM Studio — 딜 심화/투자설명서)

> **포지션**: 딜의 신뢰성을 기관투자자 수준으로 끌어올리는 엔진.

| AI 기능 | 구현 모듈 | 입력 | 출력 |
|---|---|---|---|
| **18개 챕터 IM 섹션 초안 작성** | `SectionPlanner` + AI Provider | Building SSoT Full (14개 레이어) | 챕터별 마크다운 초안 (cover / exec_summary / thesis / rent_roll / NOI / debt / valuation / risk...) |
| **IM 준비도(Readiness) 점수** | `computeReadiness()` (결정론적 엔진) | Building SSoT Full | 0-100점 준비도 점수 + 섹션별 ready/partial/blocked + 전문가 패치 우선순위 |
| **출력 단계 잠금 해제 로직** | `isOutputBlocked()` | 준비도 점수 + 필수데이터 충족 여부 | blind_teaser → snapshot → im_lite → full_im_draft → buyer_ready 단계적 잠금 해제 |
| **전문가 패치 추천** | `recommendExpertPatches()` | Building SSoT Full | 섹션별 필요 전문가 역할(cre_consultant/legal_expert/valuation_expert/debt_expert) 및 이유 |
| **Risk Boundary 체크** | `runRiskBoundaryCheck()` | IM 섹션 텍스트 | P0/high/medium 위반 감지 → 자동 안전 문구 교체 |
| **Disclosure Guard** | `runDisclosureGuard()` | 섹션 텍스트 + 공개수준 + Gate Level | 보호 필드 탐지 → redacted/blocked 상태 반환 + 대체 표현 |
| **Mobile IM 7섹션 생성** | `generateMobileIM()` | Building SSoT Lite + 보완 입력 | 모바일 최적화 7섹션 투자요약서 (50-150억 꼬마빌딩 특화) |
| **AI 실행 감사 로그** | `createAiRunRecord()` | 에이전트 실행 메타데이터 | latency_ms/status/input_ref/output_ref 불변 감사 기록 |

**가드레일 특이점 (가장 정교한 레이어)**:
- **8개 P0 금지 패턴**: 투자 추천/수익률 보장/대출 확정/법적 문제 없음/저평가/리모델링 확정/세금 확정/허가 확정
- **가드레일 계층**: P0(blocked) → high(revise) → medium(warn) → pass
- **매수자용 출력은 절대 자동 발행 불가** — Gate Review + 전문가 검토 통과 후에만 허용
- **NOI/부채 섹션은 무조건 전문가 필수** (`expert_required: true` 하드코딩)

---

### 1-C. cre-aipage (Space AI Page — 임대 마케팅)

> **포지션**: 공실을 가장 빨리 채우는 AI 임대 마케터.

| AI 기능 | 구현 에이전트 | 입력 | 출력 |
|---|---|---|---|
| **메모 → 공간 SSoT 구조화** | `SpaceStructuringAgent` | 카카오 메모 | SpaceSSoT (층/면적/보증금/월세/관리비/권리금/추천업종/공개요약/누락항목) |
| **사진 AI 분류** | `VisualClassificationAgent` | 업로드 이미지 | 공간유형/시설태그/리스크태그/감성태그/업종관련도/공개가능성 분류 |
| **업종별 사진 앨범 자동 구성** | `VisualAlbumAgent` | 분류된 사진 + 타겟 업종 | 업종별 큐레이션 앨범 (카페용/클리닉용/쇼룸용...) + Visual Answer Cards |
| **임차인 적합도 평가** | `TenantFitAgent` | SpaceSSoT + 앨범 + VibeFit | 업종별 fit_level(0-100) + 강점/약점/확인필요/법규체크 + 안전 한국어 요약 |
| **공간 감성/분위기 분석** | `VibeFitAgent` | 사진 앨범 + 분류 데이터 | VAD(Valence-Arousal-Dominance) + 업종별 감성 정렬도 + 리스크 혼합신호 |
| **임대 LP 섹션 자동 작성** | `LeasingPageWriterAgent` | SpaceSSoT + TenantFit + VibeFit + Albums | 임대 홈페이지 섹션들 (영웅문구/강점/업종핏/설비확인/문의폼) |
| **카카오/네이버/SNS 문구 생성** | `CampaignCopyAgent` | SpaceSSoT + 타겟업종 | 채널별 맞춤 홍보 문구 (카카오/네이버 리스팅/SMS/인스타그램 캡션) |
| **문의 임차인 자동 사전심사** | `InquiryQualifierAgent` | 문의 내용 + SpaceSSoT | fit_estimate(strong/moderate/weak) + 예산적합/타이밍적합/설비적합 + 카카오 답장 초안 |
| **건물주 임대 현황 보고서** | `OwnerReportAgent` | 임대 현황 + 문의 데이터 | 건물주용 임대 진행 현황 자동 보고서 |
| **공개언어 안전 필터** | `SafeLanguageAgent` | 에이전트 출력 텍스트 | "가능합니다/문제없습니다" 등 5개 금지 표현 탐지 → 안전 표현 교체 |
| **정보공개 가드** | `DisclosureGuardAgent` | 공간 정보 + 공개수준 | 브로커 내부 메모/협상 노트 유출 차단 |

**가드레일 특이점**:
- **업종별 확정 표현 절대 금지**: F&B/클리닉/학원 허가 가능성을 단정 불가
- **신뢰도 5단계 구분**: unknown → memo_based_inference → photo_based_inference → broker_verified → owner_verified

---

## 2. 데이터 플라이휠 구조 분석

```
                  ┌────────────────────────────────────┐
                  │         데이터 플라이휠               │
                  └────────────────────────────────────┘

[입력층: 중개인 현장 데이터]
  카카오 메모 → Building SSoT Lite
                │
                ▼
[1단계: 딜카드 AI 정제]
  메모 파싱 → 블라인드 티저 → 매수자 답장
                │
                │ ① 딜 관심 축적
                ▼
[2단계: 딜 큐리오시티 점수화]
  0-100 딜점수 + 매수자핏 가설 + 다음행동 CTA
                │
                │ ② 핸드오프 → Full IM 위임
                ▼
[3단계: Full IM 준비도 엔진]
  14개 데이터 레이어 수집 → 0-100 준비도 점수
  → 18개 IM 섹션 초안 자동 작성
                │
                │ ③ 공실 감지 → Space AI 위임
                ▼
[4단계: 공간 AI 마케팅]
  메모 → 공간 SSoT → 사진 분류 → 업종 핏 → 임대 LP
                │
                │ ④ 문의 데이터 역방향 환류
                ▼
[5단계: 문의/임차인 데이터 축적]
  문의 내용 → 자동 사전심사 → 적합도 분류
                │
                │ ⑤ 패턴 학습 환류
                └──────────────────→ [딜카드 AI 고도화]
```

### 2-A. 플라이휠 루프 상세

**루프 1: 메모 정제 → 딜 인텔리전스 축적**
- 메모가 들어올수록 Building SSoT Lite의 패턴 데이터가 쌓임
- 어떤 키워드가 높은 딜 큐리오시티 점수를 만드는지 학습 가능
- 매수자 핏 가설이 실제 거래와 매칭될수록 예측 정확도 향상

**루프 2: 공실 → 문의 → 임차인 업종 패턴**
- 특정 권역에서 어떤 업종이 높은 fit_score를 받는지 데이터 축적
- TenantFitAgent의 업종 추천 정확도가 문의 결과로 검증되고 보정됨
- 사진 분류 데이터가 쌓일수록 VisualClassificationAgent 신뢰도 향상

**루프 3: IM 작성 → 전문가 패치 → 가이드라인 고도화**
- 전문가가 어떤 섹션에 어떻게 패치하는지 데이터화
- `prompt_version` 추적으로 어떤 프롬프트 버전이 최고 품질을 낳는지 A/B 분석 가능
- 가드레일 위반 패턴이 쌓이면 FORBIDDEN_PATTERNS 정밀화 가능

**루프 4: 실거래 결과 → 가설 검증**
- 딜카드에서 생성한 "바이어 핏 가설"이 Full IM까지 가서 실제 매수자와 매칭되면:
  → 어떤 가설이 맞았는지 역추적 데이터화
  → SSoT Readiness Score 기준의 실전 보정 가능

---

## 3. Unfair Advantage 분석

### 3-A. cre-dealcard 단독 Unfair Advantage

#### **"카카오 메모에서 즉시 딜 인텔리전스"**

> 경쟁 우위의 본질: **정보의 구조화 속도**

| 기존 방식 | JS 딜카드 |
|---|---|
| 주소 조회 → 공시가 검색 → 실거래가 검색 → 워드 정리 → 출력 (2-4시간) | 메모 입력 → 딜카드 완성 (3분) |
| 중개인의 노하우가 개인에게만 귀속 | SSoT 형태로 시스템에 축적 |
| 매물 정보의 공개/비공개 기준이 불명확 | 8개 항목 자동 필터링 (법적 리스크 최소화) |

**핵심**: 딜 인텔리전스 생산 비용을 1/40로 낮추면서 **동시에 정보 유출 리스크를 차단**. 이 두 가지를 동시에 달성하는 것은 수동 프로세스로 불가능.

---

### 3-B. cre-fullim 단독 Unfair Advantage

#### **"기관투자자 수준 IM을 중개인도 만들 수 있게"**

> 경쟁 우위의 본질: **전문성의 민주화 + 법적 가드레일 내재화**

| 기존 방식 | JS Full IM |
|---|---|
| IB/컨설팅 팀 고용 → 1-3개월 + 수천만 원 | AI 초안 → 전문가 패치 → 수일 + 비용 대폭 절감 |
| 면책 문구 부재 또는 형식적 삽입 | P0 금지 표현 자동 차단 + 표준 면책문구 강제 삽입 |
| IM 완성 후에야 준비 부족 발견 | 준비도 점수(0-100)로 선제적 데이터 갭 파악 |
| 매수자용 유출 사고 가능 | buyer_ready 출력은 Gate Review 통과 없이 절대 불가 |

**핵심**: IM이란 도구 자체보다 **"18개 섹션 중 어디까지 AI가 믿을 수 있고, 어디서 전문가가 필요한지 자동 판별"**하는 준비도 엔진이 진짜 혁신.  
경쟁사가 이 수준의 가드레일 로직을 구현하려면 도메인 지식 + 법무 리뷰 + 수년간의 사례 축적이 필요.

---

### 3-C. cre-aipage 단독 Unfair Advantage

#### **"사진 한 번에 임대 마케팅 자동화"**

> 경쟁 우위의 본질: **공실의 마케팅 가능성을 즉시 점수화**

| 기존 방식 | JS Space AI |
|---|---|
| 네이버 부동산 수동 등록 → 텍스트 위주 | 사진 AI 분류 → 업종별 맞춤 LP 자동 생성 |
| "이 공간이 카페에 맞는가?" → 중개인 감각 의존 | TenantFitAgent: 0-100 점수 + 법규 체크리스트 자동 |
| 임차인 문의 → 중개인이 수동 사전심사 | InquiryQualifierAgent: 적합도 자동 분류 + 답장 초안 |
| 건물주 보고: 구두 또는 카카오 | OwnerReportAgent: 자동 현황 보고서 |

**핵심**: 사진에서 **VAD(감성 좌표)를 추출해 업종 감성과 매칭**하는 VibeFit 레이어는 전 세계 CRE 플랫폼 중 구현 사례가 극히 드문 기능.

---

### 3-D. 3-시스템 통합이 만드는 Unfair Advantage (핵심)

#### **"부동산 딜의 전 생애주기를 하나의 데이터 파이프로 연결"**

```
[딜 최전선: 카카오 메모]
        ↓ 자동 파싱
[Building SSoT Lite — 딜의 씨앗]
        ↓ 핸드오프
        ├─→ [투자설명서 생성] → 매수자 설득
        └─→ [공실 마케팅 시작] → 임차인 확보
                ↓ 문의 역환류
[임차인 데이터가 딜 인텔리전스 강화]
        ↓ 통합 분석
[크로스시스템 퍼널: 딜 전환율 가시화]
```

경쟁자가 이 생태계를 복제하려면:

1. **매매 딜 도구 (cre-dealcard)** 구축 — 데이터 없이는 AI가 학습 불가
2. **투자설명서 엔진 (cre-fullim)** 구축 — 18개 섹션 + 가드레일 내재화 필요
3. **임대 마케팅 도구 (cre-aipage)** 구축 — 사진 분류 + 업종 핏 + 감성 분석 필요
4. **세 도구의 핸드오프 프로토콜 설계** — 멱등성/보안/단일토큰 소비 아키텍처
5. **공유 SSoT 스키마 합의** — 세 팀이 쓰는 동일한 데이터 계약 필요

각 단계에서 **2-3년의 도메인 데이터 없이는 AI 품질이 나오지 않는다**.

---

### 3-E. Unfair Advantage 요약 매트릭스

| 차원 | cre-dealcard | cre-fullim | cre-aipage | 3-시스템 통합 |
|---|---|---|---|---|
| **진입 장벽** | 메모 파싱 도메인 데이터 | IM 가드레일 법무 지식 | 사진+감성 분류 데이터 | 3개 동시 구축 필요 |
| **네트워크 효과** | 매물 데이터 축적 | IM 품질 데이터 | 공실→임차인 매칭 데이터 | 매매↔임대 교차 데이터 |
| **전환 비용** | SSoT 형식 의존성 | 18챕터 준비도 데이터 | 사진 분류 이력 | 전체 딜 이력 이전 불가 |
| **규모의 경제** | 메모 패턴 반복 학습 | 프롬프트 버전 최적화 | TenantFit 정확도 향상 | 크로스시스템 패턴 학습 |
| **규제 해자** | 정보공개 자동 필터 | P0 가드레일 + 면책 | 업종허가 확정 금지 | 통합 컴플라이언스 스택 |

---

## 4. 결론: 이 생태계의 진짜 자산

> **데이터, 코드, 사용자 모두 공개될 수 있어도 — '쌓인 딜 패턴'은 복제 불가능하다.**

이 시스템이 가장 강해지는 시점은 **첫 번째 딜이 세 시스템을 모두 통과한 순간**이다.  
그 딜의 데이터가 다음 딜의 AI 품질을 높이고, 그 딜이 또 다음 딜의 데이터가 된다.

경쟁자는 도구를 복사할 수 있지만, **축적된 딜 패턴의 시간**은 살 수 없다.
