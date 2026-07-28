# 📄 모바일 IM 이원화 (IM-Basic / IM-Pro) — 개발 상세 스펙 v1.0

> **버전**: v1.0 (2026.07.23) · 정합 문서: DEV_SPEC v2.0 · 티저 딜카드 스펙 v1.0 · 온톨로지 v0.1
> **핵심 설계 사상**: Basic과 Pro는 **별도 문서가 아니라 같은 Asset SSoT의 렌더링 정책 차이**다. 공개 사다리(티저→Basic→Pro→데이터룸)의 각 전환은 "매수자의 커밋 ↔ 정보 공개"의 등가교환이며, 전환 이벤트가 곧 리드 검증·파이프라인 트리거·암묵지 수집 지점이 된다.
> **구분 기준**: Basic = 설득에 필요한 것 / Pro = 검증에 필요한 것. Basic을 얇게 만들어 Pro를 강제하지 않는다.

---

## 1. 공개 사다리 총괄

```
티저 딜카드 ──▶ IM-Basic ──▶ IM-Pro ──▶ 실사 데이터룸
 (익명·밴드)   (링크 공유)   (지정 열람)   (자료실 — 별도 스펙)
     │             │             │
  커밋: 없음    연락처 1필드   신원+NDA+사유
  동의: —       브로커        브로커+매도인
  스코어: —      +20           +40 (최고 가중)
```

- 사다리는 **3문서가 상한**. 데이터룸은 문서가 아닌 자료실로 분리(후속 스펙)
- 각 단계는 하위 단계를 포함(Pro 열람자는 Basic 전체를 봄)

## 2. 렌더 정책 (im_render_policy)

### 2.1 정책 정의 (disclosure_policy 확장 — 티저 스펙 §1.2와 단일 체계)

```yaml
im_render_policy:
  basic:                       # 현행 7섹션 = 기준선. 링크 공유 가능(/im-lite/{id})
    include:
      - public 슬롯 전체 (티저와 동일 축, 단 밴드 대신 검증 정밀값 일부 허용*)
      - 검증 슬롯: 대장·토지 공공데이터 전체, Cap·NOI(검증 시), 공실·명도 상태
      - violationStatus (위반건축물 여부) ← 예외적으로 Basic 포함 (§2.3)
      - 히어로 카드 · 7섹션 · 사진(photo-safety 통과분) · 아키타입 근거
    exclude: [정밀 렌트롤(호실별), 등기 상세, 개인화 시뮬레이션, 전문가 기고 원문]
  pro:                         # Basic + gated 전체 + 개인화. 지정 열람만(/im-pro/{grantId})
    include:
      - basic 전체
      - gated(stage_detail): 호실별 렌트롤(임차인 익명 유지), 정밀 면적·층수·준공연도,
        관리비·수선 이력, 등기 요약(근저당 총액 밴드)
      - 리스크 정밀: 권리분석 요약, 명도 3속성 상세, 이행강제금 이력
      - 개인화 모듈: 대출 시뮬레이션·세금 시나리오 (§5)
      - 개발 모듈: 규모검토·사업수지 (해당 자산군)
      - 전문가 기고 (3단계 — expert_verified 뱃지)
    exclude(never): [임차인 실명, 매도 사유, 협상 메모, 소유자 정보]  # 데이터룸도 수동 공유만
```

\* Basic의 정밀값 허용 기준: **공공데이터로 검증된 슬롯만** (provenance tier=public_data). broker_input 단독 수치는 밴드 또는 "확인 중" 표기.

### 2.2 렌더러 구현

```typescript
// src/domain/building/mobile-im/im-renderer.ts (writer.ts 산출물의 표시 계층)
export type ImTier = 'basic' | 'pro';
export function renderIM(docId: string, tier: ImTier, opts: {
  register: 'b2b'|'b2c';
  grantId?: string;            // tier='pro' 필수 — 열람권 검증·워터마크 소스
  personalization?: BuyerProfile; // §5 — 티저 슬라이더·퀵폼 유래
}): RenderedIM;
// RenderedIM(tier='basic')에는 gated 슬롯 값이 타입 수준에서 부재 (티저 TeaserView와 동일 원칙)
```

- 생성 파이프라인(writer.ts)은 변경 없음 — **생성은 1회, 렌더는 tier별**. Pro 전용 섹션(리스크 정밀·개인화)은 생성 시 함께 만들되 `sections[].min_tier: 'pro'` 마킹

### 2.3 위반건축물의 Basic 포함 (정책 결정)

- `violationStatus`(대장 위반 표기)는 공공데이터라 숨길 실익이 없고, 실사 단계 발견 시 브로커 신뢰 파괴 — **"나쁜 소식은 일찍" 원칙으로 Basic 리스크 섹션에 표기**
- 위반 있음 + 해소 계획 있음 → "위반사항 O건 · 해소 조건 협의 가능" 형태로 브로커 코멘트 병기 가능

## 3. 동의 체인 상태 머신

### 3.1 상태 정의

```
[매수자]  im_pro_request ──▶ pending
[시스템]  자동 검증 (연락처 인증·중복·블랙리스트) ──▶ pending_broker
[브로커]  승인 ──▶ (매도인 동의 모드 분기)
            ├─ 일괄 위임(전속 수임 시 설정) ──▶ granted
            └─ 건별 동의 ──▶ pending_seller ──▶ granted | seller_denied
[매수자]  NDA 전자 서명 ──▶ active          # granted 후 첫 열람 전 필수
[시스템]  만료(기본 7일) ──▶ expired  /  브로커 회수 ──▶ revoked
```

```sql
CREATE TABLE im_pro_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id),
  requester_name text NOT NULL,
  requester_phone text NOT NULL,            -- 인증 완료 번호 (열람 바인딩 키)
  requester_reason text,                    -- 요청 사유 → 관심 태깅 재료
  client_id uuid,                           -- 기존 고객 매칭 시 연결
  status text NOT NULL DEFAULT 'pending',
    -- 'pending'|'pending_broker'|'pending_seller'|'granted'|'active'
    -- |'seller_denied'|'broker_denied'|'expired'|'revoked'
  nda_signed_at timestamptz,
  expires_at timestamptz,                   -- 기본 granted+7d, 브로커 연장 가능
  watermark_seed text NOT NULL,             -- 열람자 워터마크 생성 키
  created_at timestamptz DEFAULT now()
);

-- 매도인 동의 모드 (수임 시 설정 — 수임 제안서 계약 항목과 연동)
ALTER TABLE deals ADD COLUMN seller_consent_mode text DEFAULT 'per_request';
  -- 'delegated'(일괄 위임 — 전속 유인) | 'per_request'(건별)
ALTER TABLE deals ADD COLUMN seller_contact_channel text;  -- 건별 동의 요청 발송 채널(알림톡)
```

### 3.2 전이 규칙·SLA

| 전이 | 액터 | 규칙 |
|------|------|------|
| pending → pending_broker | 시스템 | 번호 인증 완료 + 동일 딜 기존 grant 없음. 실패 사유는 요청자에게 미노출 |
| pending_broker → granted/denied | 브로커 | 인박스 인라인 처리(승인·거절·전화). 24h 미처리 시 리마인드 |
| pending_seller → granted/denied | 매도인 | 알림톡 원클릭 승인 링크. 48h 미응답 시 브로커에게 에스컬레이션 |
| granted → active | 매수자 | NDA 전자서명(간이 — 이름·서명·타임스탬프·IP). 서명 전 열람 불가 |
| active → expired | 시스템 | expires_at 도래. 만료 3일 전 매수자·브로커 알림, 브로커 1탭 연장 |
| any → revoked | 브로커 | 즉시 열람 차단 + 사유 기록(선택) — 유출 의심 대응 |

- 모든 전이는 activity_events 기록: `im_pro_requested/broker_approved/seller_approved/nda_signed/viewed/expired/revoked`

## 4. 열람 제어 (IM-Pro 전용)

- **URL 정책**: `/im-pro/{grantId}` — grant 단위 URL. 딜 단위 공유 URL 없음(링크 유출 무효화). 접근 시 번호 인증 재확인(세션 24h)
- **워터마크**: 뷰어 전면 대각선 반복 — `{requester_name} · {phone 뒤4자리} · {열람일시}` (watermark_seed 기반, 스크린샷 억제 목적). PDF 내보내기에도 동일 각인
- **재공유 감지**: 동일 grantId의 상이한 핑거프린트 열람 → 브로커 알림 + 자동 일시정지(브로커 해제 가능)
- **열람 로그**: 섹션별 체류·재방문 — Basic보다 상세(실검토자이므로) → 관심 태깅(C1) 고급 신호
- **내보내기**: 기본 차단, 브로커가 grant별 허용 시 워터마크 PDF만

## 5. 개인화 모듈 (Pro 전용 — 가드레일 준수 설계)

### 5.1 대출 시뮬레이션

- 초기값: 티저 슬라이더에서 수집된 `BuyerProfile(budget_band, ltv_pref)` — 없으면 중립 기본값
- 계산: `assumptions` 테이블 금리 범위 × RTI·LTV 일반 기준 → **자기자본·상환 부담을 밴드로만** 표시
- 필수 표기: "일반적 조건 가정 시 참고 범위 · 실제 한도는 금융기관 심사에 따름 · ⚙ 가정" — "대출 가능" 류 확정 표현은 기존 P0 가드레일이 차단
- CTA: 제휴 대출상담 연결(선택 기능 — 수익화 접점)

### 5.2 세금 시나리오

- 표준 3시나리오 표: 개인 매수 / 법인 매수 / (해당 시) 매도인 양도 구조 — 취득세율·보유세 개요를 **법정 요율 기준 자동 계산**, 특수 상황(중과·감면)은 "세무사 확인 필요" 고정 문구
- 3단계(전문가 딜룸) 연동: 세무사 기고가 있으면 표준 시나리오를 실명 검증 모듈로 대체(provenance 승격)
- 면책 고정 문구: "본 자료는 세무·법률 상담이 아니며 개별 상황에 따라 달라질 수 있습니다"

### 5.3 개발 모듈 (landSite·VALUE_ADD 아키타입)

- 규모검토(massing — 외부 PDF 파싱 포함) + 사업수지 요약: **grade A에서만** 수치 노출(C11 준용), 미만이면 "규모검토 요청 가능" CTA로 대체

## 6. 퍼널 연동 — 리드·파이프라인·암묵지

| 이벤트 | 리드 스코어 | 파이프라인 | 암묵지 |
|--------|------------|-----------|--------|
| Basic 열람 60s+ | +25 (현행) | — | 섹션 체류 → 관심 태깅 |
| **Pro 요청** | **+40 (최고 가중)** | analysis→**negotiation 후보** 플래그 | 요청 사유 텍스트 → 관심·우려 분류 |
| Pro 승인·NDA | — | stage → negotiation 자동 전이 제안(브로커 1탭 확정) | 승인/거절 사유 |
| Pro 정밀 열람 | Hot Lead 즉시 | — | 개인화 모듈 입력값(예산·구조 선호) |
| 만료 후 미행동 | 스코어 감쇠 | — | 이탈 사유 1탭 태깅 후보 |

- 파이프라인 자동 전이는 **제안+브로커 1탭 확정** 방식 — 확실한 트리거만 자동화한다는 기존 원칙 유지

## 7. API·플래그

```
POST /api/public/im-lite/{buildingId}/pro-request     # 매수자: Pro 요청 (인증 포함)
GET  /api/broker/pro-grants?deal={id}                 # 브로커: 요청 목록 (인박스 연동)
POST /api/broker/pro-grants/{id}/approve|deny|revoke|extend
POST /api/public/pro-grants/{id}/seller-consent       # 매도인 원클릭 (서명 토큰)
POST /api/public/im-pro/{grantId}/nda-sign
GET  /api/public/im-pro/{grantId}                     # 렌더 (tier='pro', 인증·워터마크)
GET  /api/broker/im-pro/{grantId}/insights            # 열람 로그·개인화 입력 요약
```

- Feature flags: `ff_im_tiering`, `ff_pro_personalization`, `ff_seller_consent_flow`
- 기존 URL 불변: `/im-lite/{buildingId}`는 Basic으로 그대로 동작 (기배포 링크 보존)

## 8. 마일스톤 배치

| 단계 | 범위 |
|------|------|
| M3 (주 8~10) | violationStatus 슬롯 추가 + Basic 리스크 섹션 반영 (온톨로지 v0.1 → v0.1.1) |
| M4 (주 11~13) | im_render_policy·im-renderer 분리, im_pro_grants·동의 체인(건별 모드), NDA·워터마크·열람 제어 |
| M4.5 | 개인화 모듈(대출·세금 표준판), 티저 BuyerProfile 연계 |
| M5 (분기 2) | 매도인 일괄 위임 모드(수임 제안서 계약 항목 연동), 제휴 대출상담, 만료·감쇠 자동화 |
| 3~4분기 | 전문가 기고 모듈의 Pro 탑재 (S6), 데이터룸 스펙 착수 |

## 9. 수용 기준·DO NOT

**Definition of Done**
- [ ] RenderedIM(basic)에 gated 슬롯 값 타입 수준 부재 (타입 테스트)
- [ ] NDA 미서명 grant의 Pro 렌더 접근 불가 (E2E)
- [ ] 워터마크가 뷰어·PDF 양쪽에 각인 (스냅샷 테스트)
- [ ] `/im-lite/{id}` 기존 링크 무변경 동작 (회귀 테스트)
- [ ] Pro 요청→승인→NDA→열람 전 구간 이벤트 기록 누락 0
- [ ] 개인화 모듈 출력에 확정 표현 0건 (가드레일 테스트 케이스 추가)

**DO NOT (DEV_SPEC C-2 추가분)**
```yaml
- "IM-Pro의 딜 단위 공유 URL 발급 (grant 단위만)"
- "NDA 서명 전 gated 슬롯 렌더"
- "매도인 동의(모드 무관) 없는 Pro 발급"
- "개인화 시뮬레이션의 확정 표현 ('대출 가능'·'절세 확정'·정밀 한도액)"
- "broker_input 단독 수치의 Basic 정밀 표시 (public_data 검증분만)"
- "위반건축물 여부의 Pro 뒤 은닉 (Basic 표기 원칙)"
- "Basic 의도적 빈약화로 Pro 강제 (설득/검증 구분 기준 위반)"
```

---

> **요지**: 이원화의 본질은 문서를 쪼개는 게 아니라 **커밋과 공개의 교환을 단계화**하는 것이다. Basic은 계속 팔고(설득), Pro는 검증하며(신뢰), 그 전환 순간마다 최고 품질의 리드 신호와 암묵지가 떨어진다. 구현은 렌더 정책 분리 하나로 시작되고, 기존 생성 파이프라인·URL·가드레일은 그대로다.
