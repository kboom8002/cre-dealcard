# 05. Pro IM 파이프라인 E2E 테스트 가이드

> **범위**: Pro IM PPTX 생성 + Pro IM HTML Export + Grant 접근 제어  
> **API**: `/api/public/im-pro/[grantId]/pptx`, `/api/public/im-pro/[grantId]/export`  
> **인증**: Grant 기반 접근 제어 (`im_pro_grants` 테이블)  
> **전제조건**: Pro IM grant가 발급된 상태

---

## 1. Grant 접근 제어 아키텍처

```
grant 발급 (브로커가 바이어에게 Pro IM 접근권 부여)
  → im_pro_grants 테이블에 레코드 생성
  → grantId로 Pro IM 접근
  → 5단계 검증 게이트 통과
  → Pro PPTX (30~40면) 또는 HTML Export 렌더링
```

### Grant 검증 5단계 게이트

| 순서 | 게이트 | 실패 시 | Status |
|:---:|:---|:---|:---:|
| 1 | Grant 존재 & active | `Grant not found` | 404 |
| 2 | NDA 서명 완료 | `NDA 미서명` | 403 |
| 3 | PDF Export 허용 | `내보내기 불허` | 403 |
| 4 | 만료일 미경과 | `Grant 만료` | 410 |
| 5 | 다운로드 횟수 ≤ 10 | `다운로드 횟수 초과` | 429 |
| 6 | Grade D 아님 | `Grade D 차단` | 422 |

---

## 2. Pro IM PPTX 테스트

### TC-PR01: Pro PPTX 정상 다운로드
```bash
curl -o pro_im.pptx \
  "https://{DOMAIN}/api/public/im-pro/{GRANT_ID}/pptx"
```

**응답 헤더 검증**:
```
Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation
Cache-Control: no-store
X-Robots-Tag: noindex
X-Slide-Count: 30~40
X-File-Size: > 0
```

### Pro PPTX 슬라이드 시퀀스 (30~40면, 5챕터)

| 챕터 | 슬라이드 수 | 주요 내용 |
|:---:|:---:|:---|
| **Ch.1 Executive Summary** | 5~7면 | 표지, KPI, 투자 논거, 핵심 지표 |
| **Ch.2 Property Analysis** | 6~10면 | 건물 개요, 입지, 토지, 사진, 인근 환경 |
| **Ch.3 Financial Analysis** | 8~12면 | 렌트롤, 수익분석, 현금흐름, 민감도, 대출 시나리오 |
| **Ch.4 Risk & Market** | 4~6면 | 리스크, 시장 분석, 비교사례 |
| **Ch.5 Appendix** | 3~5면 | 세금, 취득비용, 법적 사항, 면책 |

**PPTX 내부 검증**:
- [ ] `isPro: true`로 Pro 시퀀스 활성화 (P-C1 수정 확인)
- [ ] 30~40면 범위 확인 (PRO_PAGE_TARGET=36)
- [ ] 5개 챕터 구분 슬라이드 존재
- [ ] 민감도 분석 2D 매트릭스 렌더링
- [ ] 다년도 현금흐름 테이블 렌더링
- [ ] 대출 시나리오 비교표 렌더링
- [ ] 워터마크 포함 확인 (이름+전화번호4자리+타임스탬프)

---

### TC-PR02: Grant 검증 게이트 순차 테스트

#### 게이트 1: Grant 존재
```bash
curl "https://{DOMAIN}/api/public/im-pro/nonexistent-grant-id/pptx"
```
**기대**: 404 `Grant not found`

#### 게이트 2: NDA 미서명
```json
// im_pro_grants 테이블에서 nda_signed_at = NULL
```
```bash
curl "https://{DOMAIN}/api/public/im-pro/{UNSIGNED_GRANT_ID}/pptx"
```
**기대**: 403 `NDA 미서명`

#### 게이트 3: Export 불허
```json
// im_pro_grants 테이블에서 pdf_export_allowed = false
```
**기대**: 403 `내보내기 불허`

#### 게이트 4: 만료
```json
// im_pro_grants 테이블에서 expires_at < now()
```
**기대**: 410 `Grant 만료`

#### 게이트 5: 다운로드 횟수 초과
```json
// im_pro_grants 테이블에서 download_count >= 10
```
**기대**: 429 `다운로드 횟수 초과`

#### 게이트 6: Grade D
```json
// 건물 completenessScore < 30
```
**기대**: 422 `Grade D`

---

### TC-PR03: 포스처별 Pro PPTX

| 테스트 | 포스처 | 추가 검증 항목 |
|:---|:---|:---|
| **TC-PR03a** | income | 다년도 현금흐름, IRR 분석, 대출 시나리오 |
| **TC-PR03b** | development | 사업수지표, 공정계획, PF 시나리오 |
| **TC-PR03c** | owner_occupied | 10년 TCO 비교, 사옥 ROI |
| **TC-PR03d** | operating | GOP 시나리오, RevPAR 민감도 |
| **TC-PR03e** | trading | 비교사례 상세, 시장 회전율 분석 |

---

## 3. Pro IM HTML Export 테스트

### TC-PR04: HTML Export 정상 조회
```bash
curl -o pro_im.html \
  "https://{DOMAIN}/api/public/im-pro/{GRANT_ID}/export"
```

**응답 검증**:
```
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
X-Robots-Tag: noindex
```

**HTML 내부 검증**:
- [ ] A4 인쇄 레이아웃 적용
- [ ] 워터마크 그리드 (이름·전화번호4자리·타임스탬프)
- [ ] 렌트롤 테이블 렌더링
- [ ] 대출 시뮬레이션 테이블 렌더링
- [ ] 세금 시나리오 테이블 렌더링
- [ ] 브로커 정보 동적 조회 (P-H2 수정 확인)
- [ ] document_type 5종 통일 필터 (P-H1 수정 확인)

### TC-PR05: PPTX 리다이렉트
```bash
curl -v "https://{DOMAIN}/api/public/im-pro/{GRANT_ID}/export?format=pptx"
```
**기대**: 302 Redirect → `/api/public/im-pro/{GRANT_ID}/pptx`

---

## 4. Grant 발급 테스트 데이터

### 정상 Grant
```sql
INSERT INTO im_pro_grants (
  id, deal_id, buyer_user_id, broker_user_id,
  nda_signed_at, pdf_export_allowed, expires_at,
  download_count, max_downloads, status
) VALUES (
  'test-grant-001',
  '{DEAL_ID}',
  '{BUYER_USER_ID}',
  '{BROKER_USER_ID}',
  NOW(),           -- NDA 서명 완료
  true,            -- Export 허용
  NOW() + INTERVAL '30 days',  -- 30일 후 만료
  0,               -- 다운로드 0회
  10,              -- 최대 10회
  'active'
);
```

### NDA 미서명 Grant
```sql
INSERT INTO im_pro_grants (..., nda_signed_at, ...) 
VALUES (..., NULL, ...);
```

### 만료된 Grant
```sql
INSERT INTO im_pro_grants (..., expires_at, ...) 
VALUES (..., NOW() - INTERVAL '1 day', ...);
```

### 다운로드 소진 Grant
```sql
INSERT INTO im_pro_grants (..., download_count, max_downloads, ...) 
VALUES (..., 10, 10, ...);
```

---

## 5. Pro IM 파이프라인 수정사항 검증 (이번 세션)

| 수정 ID | 검증 항목 | 테스트 방법 |
|:---|:---|:---|
| **P-C1** | `isPro: true` 전달 | Pro PPTX 슬라이드 수 30~40면 확인 |
| **P-H1** | document_type 5종 통일 | export 라우트에서 모든 문서 유형 검색 확인 |
| **P-H2** | 브로커 DB 동적 조회 | HTML export에 실제 브로커 정보 표시 확인 |
| **P-H3** | document_type 필터 통일 | pptx 라우트에서 im_pro 포함 확인 |
| **P-H4** | createServiceClient 사용 | 서비스 키 기반 인증 정상 동작 확인 |

---

## 6. Pro vs Basic 비교 검증

| 항목 | Basic IM | Pro IM |
|:---|:---|:---|
| 슬라이드 수 | 7~11면 | 30~40면 |
| 인증 | Public | Grant 기반 |
| 챕터 구분 | 없음 | 5개 챕터 |
| 현금흐름 분석 | 1년 | 다년도 (5~10년) |
| 민감도 분석 | 없음 | 2D 매트릭스 |
| 대출 시나리오 | 없음 | 복수 시나리오 |
| 세금 분석 | 없음 | 취득세/보유세/양도세 |
| 워터마크 | 선택 | 필수 (NDA 추적) |
| 다운로드 제한 | Rate Limit (10회/시간) | Grant 기반 (최대 10회) |
| HTML Export | 없음 | A4 인쇄 레이아웃 |

**비교 테스트**:
```bash
# Basic PPTX
curl -o basic.pptx "https://{DOMAIN}/api/public/im-lite/{buildingId}/pptx"
# → X-Slide-Count: 9

# Pro PPTX (동일 건물)
curl -o pro.pptx "https://{DOMAIN}/api/public/im-pro/{grantId}/pptx"
# → X-Slide-Count: 35
```

---

## 7. Activity Events 추적 검증

Pro IM 다운로드/Export 시 `activity_events` 테이블에 이벤트가 기록되어야 합니다:

| 이벤트 | event_type | 검증 |
|:---|:---|:---|
| Pro PPTX 다운로드 | `im_pro_downloaded` | grant_id, building_id 포함 |
| Pro HTML Export | `im_pro_pdf_exported` | grant_id, building_id 포함 |
| 다운로드 카운트 증가 | — | download_count +1 확인 |

```sql
-- 이벤트 확인 쿼리
SELECT * FROM activity_events 
WHERE event_type IN ('im_pro_downloaded', 'im_pro_pdf_exported')
ORDER BY created_at DESC LIMIT 10;
```

---

## 8. 전체 E2E 시나리오 (종합 흐름)

```
1. 브로커 로그인
2. 메모 입력 → 딜카드 자동 생성 (01번 가이드)
3. 바텀시트 → 데이터 입력 (02번 가이드)
4. Basic IM 생성 → PPTX 다운로드 (03번 가이드)
5. Studio에서 편집 → 수정본 다운로드 (04번 가이드)
6. 바이어에게 Pro IM Grant 발급
7. 바이어 NDA 서명
8. Pro PPTX 다운로드 (30~40면)
9. ✅ 검증: Pro 슬라이드 수 30~40면
10. Pro HTML Export 다운로드
11. ✅ 검증: A4 인쇄 레이아웃 + 워터마크
12. 다운로드 카운트 확인 (activity_events)
13. 10회 다운로드 후 429 에러 확인
14. Grant 만료 후 410 에러 확인
```

---

## 9. 체크리스트

- [ ] Pro PPTX 정상 다운로드 (30~40면)
- [ ] 5단계 Grant 검증 게이트 순차 확인
- [ ] 5대 포스처별 Pro PPTX 생성 확인
- [ ] HTML Export 정상 다운로드 (A4 레이아웃)
- [ ] 워터마크 그리드 (이름+전화4자리+시각) 확인
- [ ] format=pptx 리다이렉트 확인
- [ ] 브로커 정보 DB 동적 조회 (P-H2) 확인
- [ ] isPro:true 활성화 (P-C1) 확인
- [ ] document_type 5종 통일 (P-H1) 확인
- [ ] createServiceClient 사용 (P-H4) 확인
- [ ] activity_events 이벤트 기록 확인
- [ ] 다운로드 카운트 증가 확인
- [ ] 10회 초과 시 429 확인
- [ ] Grant 만료 시 410 확인
- [ ] NDA 미서명 시 403 확인
- [ ] Basic vs Pro 슬라이드 수 차이 확인
