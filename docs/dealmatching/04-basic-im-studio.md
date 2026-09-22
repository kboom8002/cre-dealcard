# 04. Basic IM Studio E2E 테스트 가이드

> **범위**: Basic IM Studio 프로젝트 CRUD → 슬라이드 편집 → PPTX 다운로드  
> **API**: `/api/broker/basic-im-studio/*`  
> **인증**: Broker 로그인 필수 (`requireBroker()`, 테스트 시 `x-test-bypass` 헤더)  
> **전제조건**: 딜카드 + 바텀시트 통해 IM 문서가 생성된 상태

---

## 1. Studio 아키텍처

```
프로젝트 생성 (POST /api/broker/basic-im-studio)
  → 9개 기본 슬라이드 자동 생성
  → 슬라이드별 편집 (PATCH /api/broker/basic-im-studio/[id])
  → 프리뷰 확인 (GET /api/broker/basic-im-studio/[id])
  → PPTX 다운로드 (GET /api/broker/basic-im-studio/[id]/download)
```

### ⚠️ In-Memory 저장 주의사항 (P-C4)
- Studio 프로젝트는 `globalThis.__pptxGlobalProjectsMap` (인메모리 Map)에 저장
- Vercel 서버리스 cold start 시 데이터 소실 가능
- download 라우트에 DB 복구 폴백 구현됨 (P-C4)

---

## 2. 프로젝트 CRUD 테스트

### TC-ST01: 프로젝트 생성
```bash
curl -X POST "https://{DOMAIN}/api/broker/basic-im-studio" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {BROKER_JWT}" \
  -d '{"buildingId": "{BUILDING_ID}"}'
```

**성공 응답 (201 — 신규)**:
```json
{
  "ok": true,
  "isExisting": false,
  "project": {
    "id": "uuid-project-id",
    "dealId": "{BUILDING_ID}",
    "title": "건물명 Basic IM",
    "preset": "credeal_basic",
    "lockVersion": 1,
    "slides": [
      {
        "id": "slide-uuid-1",
        "slideIndex": 0,
        "layoutType": "A01_COVER",
        "category": "body",
        "title": "건물명 Basic IM",
        "kicker": "INVESTMENT MEMORANDUM",
        "dataKey": "cover",
        "hidden": false,
        "slideOverrides": {}
      }
      // ... 9개 슬라이드
    ],
    "createdAt": "2026-09-22T...",
    "updatedAt": "2026-09-22T..."
  }
}
```

**기본 9개 슬라이드 구성**:
| 순서 | layoutType | dataKey | 제목 |
|:---:|:---|:---|:---|
| 0 | A01_COVER | cover | 표지 |
| 1 | A02_STAT_GRID | highlights | 핵심 지표 |
| 2 | A04_ASYMMETRIC | overview | 건물 개요 |
| 3 | A06_DIAGRAM | location | 입지 분석 |
| 4 | A05_LAND_INFO | land | 토지 정보 |
| 5 | A14_GALLERY | gallery | 사진 갤러리 |
| 6 | A08_FINANCIAL | finance | 투자 구조 |
| 7 | A10_THESIS | thesis | 투자 논거 |
| 8 | A11_DISCLAIMER | disclaimer | 면책 고지 |

---

### TC-ST02: 기존 프로젝트 재조회
```bash
# 동일 buildingId로 다시 POST
curl -X POST "https://{DOMAIN}/api/broker/basic-im-studio" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {BROKER_JWT}" \
  -d '{"buildingId": "{BUILDING_ID}"}'
```

**성공 응답 (200 — 기존)**:
```json
{
  "ok": true,
  "isExisting": true,
  "project": { /* 기존 프로젝트 데이터 */ }
}
```

---

### TC-ST03: 프로젝트 조회 (GET)
```bash
curl "https://{DOMAIN}/api/broker/basic-im-studio/{PROJECT_ID}" \
  -H "Authorization: Bearer {BROKER_JWT}"
```

**에러 케이스**:
| 테스트 | 시나리오 | 기대 Status |
|:---|:---|:---:|
| **TC-ST04** | 존재하지 않는 프로젝트 ID | 404 |
| **TC-ST05** | dealId로 조회 (폴백) | 200 |
| **TC-ST06** | 인증 없이 조회 | 401 |
| **TC-ST07** | buildingId 누락 POST | 400 |

---

## 3. 슬라이드 편집 테스트

### TC-ST08: 슬라이드 오버라이드 적용
```bash
curl -X PATCH "https://{DOMAIN}/api/broker/basic-im-studio/{PROJECT_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {BROKER_JWT}" \
  -d '{
    "slideId": "{SLIDE_ID}",
    "overrides": {
      "customTitle": "커스텀 표지 제목",
      "subtitle": "2026년 9월 투자설명서"
    },
    "expectedLockVersion": 1
  }'
```

**성공 응답 (200)**:
```json
{
  "ok": true,
  "project": {
    "lockVersion": 2,
    "slides": [
      {
        "id": "{SLIDE_ID}",
        "slideOverrides": {
          "customTitle": "커스텀 표지 제목",
          "subtitle": "2026년 9월 투자설명서"
        }
      }
      // ...
    ]
  }
}
```

### TC-ST09: Optimistic Locking 충돌
```bash
# 같은 expectedLockVersion으로 두 번 요청
curl -X PATCH "..." -d '{"slideId":"...", "overrides":{...}, "expectedLockVersion": 1}'
# 두 번째 요청은 lockVersion이 이미 2로 증가된 상태
```

**기대**: 409 `STALE_LOCK_ERROR`

---

### TC-ST10: 슬라이드별 편집 시나리오

| 슬라이드 | dataKey | 편집 항목 | 테스트 데이터 |
|:---|:---|:---|:---|
| **표지** | cover | customTitle | "당산동 프리미엄 오피스" |
| **핵심 지표** | highlights | highlightItems | `[{"label":"Cap Rate","value":"5.2%"}]` |
| **건물 개요** | overview | summaryText | "2002년 준공 5층 근생빌딩" |
| **입지** | location | nearestStation | "당산역 도보 5분" |
| **사진** | gallery | photoOrder | `[2, 0, 1, 3]` (순서 변경) |
| **투자 논거** | thesis | pillars | `[{"title":"입지","body":"역세권"}]` |
| **면책** | disclaimer | additionalNote | "본 자료는 참고용입니다" |

---

## 4. PPTX 다운로드 테스트

### TC-ST11: Studio 편집본 다운로드
```bash
curl -o studio_basic.pptx \
  "https://{DOMAIN}/api/broker/basic-im-studio/{PROJECT_ID}/download" \
  -H "Authorization: Bearer {BROKER_JWT}"
```

**응답 헤더 검증**:
```
Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation
Content-Disposition: attachment; filename="건물명_Basic_IM.pptx"
X-Slide-Count: 7~11
X-File-Size: > 0
X-Warnings: [...] (경고 배열)
X-Audit-Violations: 0 (위반 없음)
```

**PPTX 내부 검증**:
- [ ] 슬라이드 오버라이드가 정확히 반영됨
- [ ] hidden=true인 슬라이드는 제외됨
- [ ] 원본 데이터 + 오버라이드 병합 결과 확인
- [ ] 워터마크 정상 표시
- [ ] Poison Token 없음

---

### TC-ST12: Cold Start 복구 테스트 (P-C4)

| 테스트 | 시나리오 | 기대 결과 |
|:---|:---|:---|
| **TC-ST12a** | 서버 재시작 후 download 요청 | DB에서 자동 복구 + PPTX 정상 생성 |
| **TC-ST12b** | 서버 재시작 + DB에도 문서 없음 | 404 `Project not found` |
| **TC-ST12c** | 복구 성공 시 | 로그에 `[P-C4] cold start 복구` 메시지 |

### TC-ST13: DB 데이터 소스 검증 (W-6, W-7)
| 테스트 | 검증 항목 | 기대 결과 |
|:---|:---|:---|
| **TC-ST13a** | building 데이터 조회 테이블 | `building_ssot_lite` 사용 (W-6) |
| **TC-ST13b** | releaseTier 값 | body.releaseTier 또는 `decision_im` 기본값 (W-7) |

---

## 5. 슬라이드 숨기기/보이기 테스트

### TC-ST14: 슬라이드 hidden 토글
```bash
# 사진 갤러리 슬라이드를 숨김 처리
curl -X PATCH "https://{DOMAIN}/api/broker/basic-im-studio/{PROJECT_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {BROKER_JWT}" \
  -d '{
    "slideId": "{GALLERY_SLIDE_ID}",
    "overrides": { "__hidden": true }
  }'
```

**검증**:
- PPTX 다운로드 시 해당 슬라이드 제외
- X-Slide-Count 감소 확인
- 다른 슬라이드 순서 유지

---

## 6. 에러 케이스 모음

| 테스트 | 시나리오 | 기대 Status | 기대 메시지 |
|:---|:---|:---:|:---|
| **TC-ST15** | slideId 없이 PATCH | 400 | `slideId required` |
| **TC-ST16** | overrides 없이 PATCH | 400 | `overrides required` |
| **TC-ST17** | 잘못된 lockVersion | 409 | `STALE_LOCK_ERROR` |
| **TC-ST18** | 존재하지 않는 slideId | 404 | `Slide not found` |
| **TC-ST19** | 인증 없이 download | 401 | `Unauthorized` |
| **TC-ST20** | 빈 프로젝트 download | 500 | `Failed to generate` |

---

## 7. UI 기반 Studio 테스트 플로우

```
1. 딜카드 페이지 → IM 탭 → "Studio에서 편집" 클릭
2. ✅ 9개 슬라이드 썸네일 목록 표시
3. 첫 번째 슬라이드(표지) 클릭
4. ✅ 편집 패널에 제목/부제목 필드 표시
5. 제목을 "커스텀 제목"으로 변경
6. ✅ 자동 저장 확인 (lockVersion 증가)
7. 사진 갤러리 슬라이드 클릭
8. ✅ 사진 순서 드래그&드롭 가능
9. "다운로드" 버튼 클릭
10. ✅ PPTX 파일 다운로드 시작
11. 다운로드된 파일 열기
12. ✅ 편집 내용 반영 확인
```

---

## 8. 체크리스트

- [ ] 프로젝트 생성 (POST) — 신규/기존 분기 확인
- [ ] 프로젝트 조회 (GET) — ID/dealId 양쪽으로 확인
- [ ] 슬라이드 편집 (PATCH) — 오버라이드 반영 확인
- [ ] Optimistic Locking — 409 충돌 확인
- [ ] PPTX 다운로드 — 편집 내용 반영 확인
- [ ] 슬라이드 숨기기 — X-Slide-Count 감소 확인
- [ ] Cold Start 복구 (P-C4) — DB 폴백 확인
- [ ] building_ssot_lite 테이블 사용 (W-6) 확인
- [ ] releaseTier 기본값 (W-7) 확인
- [ ] 모든 에러 케이스 status code 확인
