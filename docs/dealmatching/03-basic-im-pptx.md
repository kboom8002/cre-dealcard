# 03. Basic IM PPTX 생성 E2E 테스트 가이드

> **범위**: Basic IM PPTX 다운로드 파이프라인 — 5대 포스처 × 데이터 등급  
> **API**: `GET /api/public/im-lite/[buildingId]/pptx`  
> **런타임**: Node.js, maxDuration 300초 (Vercel Pro)  
> **인증**: Public (Rate Limit: IP당 시간당 10회)

---

## 1. 파이프라인 아키텍처

```
buildingId 입력
  → document_objects 조회 (document_type: mobile_im, im_lite, im_lite_draft, blind_teaser)
  → data-binder.ts: 섹션 데이터 바인딩
  → deck-sequencer.ts: 슬라이드 시퀀스 결정 (7~11면 Goldilocks)
  → pptx-renderer.ts: PptxGenJS 렌더링
  → Supabase Storage 업로드
  → Signed URL 302 Redirect 또는 Binary PPTX 200
```

### 핵심 게이트
| 게이트 | 조건 | 결과 |
|:---|:---|:---|
| **G30** (Grade D 차단) | completenessScore < 30 | 422 `PPTX 다운로드 불가` |
| **Rate Limit** | IP당 10회/시간 초과 | 429 `Rate limit exceeded` |
| **문서 미존재** | document_objects에 IM 없음 | 404 `IM document not found` |

---

## 2. 포스처별 PPTX 테스트 데이터

### TC-PP01: 수익형 (income) — P1 당산 / P5 양평

**API 호출**:
```bash
curl -o dangsan_income.pptx \
  "https://{DOMAIN}/api/public/im-lite/{P1_BUILDING_ID}/pptx"
```

**응답 헤더 검증**:
```
X-Slide-Count: 9~11
X-File-Size: > 0
X-Audit-Violations: [] (빈 배열 또는 경미한 경고)
Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation
```

**슬라이드 시퀀스 검증** (income 기본):
| 순서 | 아키타입 | 제목 | 필수 데이터 |
|:---:|:---|:---|:---|
| 1 | A01 Cover | 표지 | 건물명, 가격, 브로커 정보 |
| 2 | A02 Stat Grid | 핵심 지표 | Cap Rate, NOI, 매매가, 면적 |
| 3 | A04 Property Overview | 건물 개요 | 외관 사진, 층수, 준공년도 |
| 4 | A06 Location Map | 입지 분석 | 지도 이미지, 역세권 정보 |
| 5 | A05 Land Info | 토지 정보 | 지적도, 용도지역, 건폐율/용적률 |
| 6 | A22 Stacking Plan | 렌트롤 | 층별 임차인, 면적, 임대료 |
| 7 | A14 Gallery | 사진 갤러리 | 건물 사진 그리드 |
| 8 | A08 Financial Summary | 투자 구조 | 수익률, 현금흐름 |
| 9 | A09 Risk | 리스크 | 법적/시장 리스크 |
| 10 | A10 Thesis | 투자 논거 | 4대 투자 포인트 |
| 11 | A11 Disclaimer | 면책 | 법적 고지 |

**PPTX 파일 내부 검증** (열어서 확인):
- [ ] 표지에 건물명/가격 표시 확인
- [ ] Stat Grid에 Cap Rate / NOI 숫자 표시 (NaN 없음)
- [ ] 렌트롤 슬라이드에 실제 호실 데이터 표시
- [ ] 사진 갤러리에 이미지 렌더링 확인
- [ ] 워터마크 존재 확인 (watermark 파라미터 미지정 시)
- [ ] 전체 슬라이드 수 7~11 범위

---

### TC-PP02: 개발형 (development) — P4 잠원

```bash
curl -o jamwon_dev.pptx \
  "https://{DOMAIN}/api/public/im-lite/{P4_BUILDING_ID}/pptx"
```

**개발형 추가 슬라이드**:
| 아키타입 | 제목 | 검증 항목 |
|:---|:---|:---|
| A04 Land Detail | 토지 상세 분석 | 다필지 정보, 지목, 지적도 |
| A04 Scale | 신축 규모 검토 | 목표 규모, 건축비, 용도 |
| A04 Eviction | 명도 계획 | 임차인 수, 예상 비용/기간 |
| A05 Feasibility | 사업 수지 분석 | 총사업비, 분양수입, 수익률 |
| A05 Stacking | 스태킹 계획 | 층별 용도 배치 |

**PPTX 검증**:
- [ ] developmentSpec 데이터가 슬라이드에 반영
- [ ] 다필지(2필지) 정보 표시
- [ ] 명도 비용/기간 표시
- [ ] 스태킹 계획 다이어그램 렌더링

---

### TC-PP03: 자가사용형 (owner_occupied) — P3 서초

```bash
curl -o seocho_owner.pptx \
  "https://{DOMAIN}/api/public/im-lite/{P3_BUILDING_ID}/pptx"
```

**사옥형 추가 슬라이드**:
| 아키타입 | 제목 | 검증 항목 |
|:---|:---|:---|
| A04 Plan | 사옥 사용 계획 | 층별 배분, 인원수 |
| A04 VsLease | 임차 vs 매입 비교 | 10년 재무 비교표 |
| A04 Commute | 통근 접근성 | 역세권, 대중교통 |
| A04 Value | 자산 가치 제안 | 브랜딩, 절세 효과 |

**PPTX 검증**:
- [ ] 사옥 사용 계획표 렌더링
- [ ] 임차 vs 매입 비교표 숫자 확인 (NaN 없음)
- [ ] 안전망 슬라이드 4종 모두 존재 (plan, vsLease, commute, value)

---

### TC-PP04: 운영형 (operating) — P6 호텔

```bash
curl -o hotel_operating.pptx \
  "https://{DOMAIN}/api/public/im-lite/{P6_BUILDING_ID}/pptx"
```

**운영형 추가 슬라이드**:
| 아키타입 | 제목 | 검증 항목 |
|:---|:---|:---|
| A04 KPI | 운영 지표 | ADR, RevPAR, 가동률, GOP |
| A04 Revenue | 매출 구조 | 객실/부대 비율, 연매출 |
| A04 Seasonality | 계절성 분석 | 성수/비수기 패턴 |
| A04 Operator | 운영사 현황 | MC 계약, 만료일 |

**PPTX 검증**:
- [ ] KPI 지표 (ADR 9.5만, 가동률 78%, GOP 38%) 정확히 표시
- [ ] 계절성 차트/표 렌더링
- [ ] 운영사 정보 표시

---

### TC-PP05: 단기매매형 (trading) — P2 신사

```bash
curl -o sinsa_trading.pptx \
  "https://{DOMAIN}/api/public/im-lite/{P2_BUILDING_ID}/pptx"
```

**매매형 추가 슬라이드**:
| 아키타입 | 제목 | 검증 항목 |
|:---|:---|:---|
| A04 Turnover | 권역 회전율 | 거래 빈도 |
| A05 Trend | 거래 동향 | 시계열 가격 추이 |
| A04 Price | 적정 가격 | 비교사례 기반 밸류에이션 |

**PPTX 검증**:
- [ ] 비교사례(manual_comps) 데이터 반영
- [ ] 렌트롤 없이도 정상 렌더링 (빈 배열 처리)

---

## 3. 쿼리 파라미터 테스트

| 테스트 | URL | 기대 결과 |
|:---|:---|:---|
| **TC-PP06** | `?watermark=false` | 워터마크 없는 PPTX |
| **TC-PP07** | `?doc_id={특정ID}` | 해당 document 기반 렌더링 |
| **TC-PP08** | `?preset=golden_institutional` | 골든 프리셋 적용 |
| **TC-PP09** | `?requester=테스터&phone4=1234` | 커스텀 워터마크 텍스트 |
| **TC-PP10** | `?tier=pro` (deprecated) | 기본 Basic으로 동작 |

---

## 4. 에러 케이스 테스트

| 테스트 | 시나리오 | 기대 Status | 기대 응답 |
|:---|:---|:---:|:---|
| **TC-PP11** | 존재하지 않는 buildingId | 404 | `IM document not found` |
| **TC-PP12** | Grade D 문서 | 422 | `PPTX 다운로드 불가` |
| **TC-PP13** | 11번째 요청 (Rate Limit) | 429 | `Rate limit exceeded` |
| **TC-PP14** | 렌더링 중 오류 | 500 | `Generation failed` |

---

## 5. PPTX 바이너리 4대 단언 (Poison Token 검사)

생성된 PPTX를 열어서 아래 항목이 **존재하지 않아야** 합니다:

| 단언 | 검색 대상 | 금지 패턴 |
|:---|:---|:---|
| **A1** Poison Token | 전체 텍스트 | `{{`, `}}`, `undefined`, `null`, `NaN` |
| **A2** Mock Data | 브로커 정보 | `홍길동`, `test@`, `000-0000` 등 더미 데이터 |
| **A3** 회피 문구 | 금융 섹션 | `정보 없음`, `데이터 미제공`, `확인 필요` |
| **A4** 가격 밴드 | 금액 필드 | 음수값, 비정상 큰 숫자 (조 단위 오류) |

---

## 6. 번역 & TTS 테스트

### TC-PP15: 번역 (Translate)
```bash
curl -X POST "https://{DOMAIN}/api/public/im-lite/{buildingId}/translate" \
  -H "Content-Type: application/json" \
  -d '{"language": "en", "doc_id": "{docId}"}'
```

| 언어 | 코드 | 검증 |
|:---:|:---:|:---|
| 영어 | `en` | 섹션 제목/본문 영문 번역 확인 |
| 중국어 | `zh` | 섹션 제목/본문 중문 번역 확인 |
| 일본어 | `ja` | 섹션 제목/본문 일문 번역 확인 |

**캐시 검증**: 동일 요청 재전송 시 `cached: true` 반환

### TC-PP16: TTS (음성 브리핑)
```bash
curl -o briefing.mp3 \
  "https://{DOMAIN}/api/public/im-lite/{buildingId}/tts?language=ko"
```

| 테스트 | 파라미터 | 검증 |
|:---|:---|:---|
| **TC-PP17** | `?language=ko` | MP3 파일, 음성 nova |
| **TC-PP18** | `?language=en` | MP3 파일, 음성 alloy |
| **TC-PP19** | 캐시 히트 | `X-TTS-Source: cache` |
| **TC-PP20** | 첫 요청 | `X-TTS-Source: generated` |

---

## 7. 슬라이드 수 범위 검증 (Goldilocks)

| 등급 | 최소 | 최대 | 초과 시 |
|:---:|:---:|:---:|:---|
| Basic A | 7 | 11 | 16면 절삭 후 부록 분리 |
| Basic B | 7 | 11 | 동일 |
| Basic C | 7 | 7 | 최소만 생성 |
| Basic D | — | — | 차단 (G30) |

---

## 8. 체크리스트

- [ ] 5대 포스처별 PPTX 정상 다운로드 확인
- [ ] 각 포스처별 고유 슬라이드 존재 확인
- [ ] 슬라이드 수 7~11 범위 확인 (X-Slide-Count)
- [ ] Poison Token 4대 단언 통과
- [ ] 워터마크 존재/부재 쿼리 파라미터 확인
- [ ] Rate Limit 429 에러 확인
- [ ] Grade D 422 차단 확인
- [ ] 번역 3개 언어 정상 동작 확인
- [ ] TTS 4개 언어 MP3 다운로드 확인
- [ ] 캐시 히트 동작 확인 (번역, TTS)
