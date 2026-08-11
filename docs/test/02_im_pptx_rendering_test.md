# 02. 모바일 IM & PPTX 렌더링 — 프로덕션 E2E 테스트
> 문서 버전: v1.0 | 최종 수정: 2026-08-10
> 대상 환경: Production (https://cre-dealcard.vercel.app)
> 테스터 요구사항: 브로커 계정 (Pro 티어), PowerPoint 뷰어, 모바일 디바이스(iOS/Android)

## 🎯 테스트 목적 및 범위
본 문서는 CREDEAL 플랫폼의 핵심 기능인 모바일 IM(Information Memorandum) 생성 및 PPTX 렌더링 파이프라인의 품질을 검증하기 위한 E2E 테스트 절차를 정의합니다. 테스트 범위는 IM 자동 생성(RAG 기반), 핸드오프 워크플로우, PPTX 아키타입 렌더링, 모바일 뷰어 렌더링, 데이터 품질 게이트, 그리고 커스텀 PPTX 프리셋 관리까지 6가지 주요 시나리오를 포함합니다.

---

## 💾 가상 테스트 데이터 (Fixtures)

### 1. IM 생성용 건물 데이터 (SSoT Lite)
```json
{
  "building_name": "당산 센트럴타워",
  "address_road": "서울시 영등포구 당산로 123",
  "address_jibun": "당산동5가 123-45",
  "asset_type": "nbhd_building",
  "building_use": "retail",
  "land_area_m2": 396.69,
  "gfa_m2": 1487.6,
  "floors_above": 6,
  "floors_below": 1,
  "year_built": 2005,
  "elevator_count": 1,
  "parking_count": 8,
  "asking_price_krw": 8000000000,
  "monthly_income_krw": 32000000,
  "vacancy_rate": 0.167,
  "cap_rate": 0.048,
  "far_pct": 375,
  "bcr_pct": 58,
  "use_area": "일반상업지역",
  "rent_roll": [
    { "floor": "1F", "tenant": "공실", "area_m2": 66.1, "deposit_krw": 0, "monthly_rent_krw": 0 },
    { "floor": "2F", "tenant": "A학원", "area_m2": 66.1, "deposit_krw": 50000000, "monthly_rent_krw": 2500000 },
    { "floor": "3F", "tenant": "B사무실", "area_m2": 66.1, "deposit_krw": 30000000, "monthly_rent_krw": 2000000 },
    { "floor": "4F", "tenant": "C사무실", "area_m2": 66.1, "deposit_krw": 30000000, "monthly_rent_krw": 2000000 },
    { "floor": "5F", "tenant": "D주거", "area_m2": 66.1, "deposit_krw": 20000000, "monthly_rent_krw": 1500000 },
    { "floor": "6F", "tenant": "E주거", "area_m2": 66.1, "deposit_krw": 20000000, "monthly_rent_krw": 1500000 }
  ],
  "building_register_date": "2026-02-15",
  "deed_date": "2026-06-01",
  "rentroll_date": "2026-07-20"
}
```

### 2. 성수 IT빌딩 데이터 (Grade A용)
```json
{
  "building_name": "성수 IT밸리타워",
  "address_road": "서울시 성동구 성수이로 77",
  "asset_type": "office_building",
  "land_area_m2": 661.16,
  "gfa_m2": 2644.63,
  "floors_above": 8,
  "floors_below": 1,
  "year_built": 2018,
  "elevator_count": 2,
  "parking_count": 15,
  "asking_price_krw": 15000000000,
  "monthly_income_krw": 55000000,
  "vacancy_rate": 0,
  "cap_rate": 0.044,
  "far_pct": 400,
  "bcr_pct": 55,
  "use_area": "준공업지역",
  "noi_krw": 550000000,
  "debt_amount_krw": 7000000000,
  "debt_rate_pct": 4.5,
  "building_register_date": "2026-07-01",
  "deed_date": "2026-07-15",
  "rentroll_date": "2026-08-01"
}
```

### 3. Grade D 건물 데이터 (발행 차단 테스트)
```json
{
  "building_name": "불명 건물",
  "address_road": "서울시 어딘가",
  "asset_type": "nbhd_building",
  "asking_price_krw": 5000000000,
  "year_built": null,
  "gfa_m2": null,
  "vacancy_rate": null
}
```

### 4. PPTX 프리셋 테스트 데이터
```json
{
  "preset_name": "프리미엄 블루",
  "primary_color": "#1E3A5F",
  "secondary_color": "#4A90D9",
  "accent_color": "#F5A623",
  "font_family": "Pretendard",
  "logo_url": "https://example.com/broker-logo.png",
  "footer_text": "㈜한국상업용부동산 중개법인"
}
```

### 5. DCF 시나리오 데이터
```json
{
  "dcf_scenarios": [
    { "cap_rate": 4.0, "exit_cap": 4.5, "growth_rate": 2.0, "hold_years": 5, "irr_pct": 8.2 },
    { "cap_rate": 4.5, "exit_cap": 5.0, "growth_rate": 1.5, "hold_years": 5, "irr_pct": 6.8 },
    { "cap_rate": 5.0, "exit_cap": 5.5, "growth_rate": 1.0, "hold_years": 5, "irr_pct": 5.1 }
  ]
}
```

---

## 🧪 테스트 시나리오

### B1. Basic IM 7섹션 자동 생성

**1. 사전 조건**
- Pro 티어 브로커 계정으로 로그인 상태
- '당산 센트럴타워' 데이터가 시스템에 등록된 상태

**2. 테스트 절차**
1. IM 생성 대시보드에서 '당산 센트럴타워'를 선택합니다.
2. AI 모델을 'Sol'로 설정하고 'IM 생성' 버튼을 클릭합니다.
3. 생성된 IM의 7개 섹션 내용을 확인합니다.
4. 리스크 관련 문구에 Disclosure Guard(면책 조항)가 포함되었는지 확인합니다.

**3. API 호출 예시**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/broker/im-lite/generate \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"building_id": "b_dangsan_123", "model": "sol", "top_k": 5, "rerank": true}'
```

**4. 기대 결과**
- HTTP 상태 200 OK.
- `sections` 배열에 7개 항목(property_overview, location_access, lease_status, income_analysis, risk_check, investment_thesis, next_steps)이 모두 포함됨.
- Risk Boundary 필터링이 적용된 문장 출력.

**5. 검증 체크리스트**
- [ ] L1: API 응답이 30초 이내에 도착하는가?
- [ ] L2: 7개 섹션이 빠짐없이 생성되었는가?
- [ ] L3: 문장 내 공실 관련 리스크 언급 시 경고/면책 문구가 포함되었는가?
- [ ] L4: RAG v2 검색 결과(최상위 5개 레퍼런스)가 올바르게 인용되었는가?

**6. 결과 기록표**
| 테스트 항목 | 결과 (Pass/Fail) | 비고/이슈 번호 |
|---|---|---|
| 응답 속도 및 성공 | | |
| 7개 섹션 생성 | | |
| Disclosure Guard | | |

**7. 스크린샷 캡처 가이드**
- IM 생성 완료 직후 7개 섹션이 보이는 화면 전체 캡처.

---

### B2. Pro IM 핸드오프 & 승인 워크플로우

**1. 사전 조건**
- Pro 티어 계정 (브로커) 및 매니저 계정 준비.
- '성수 IT밸리타워' IM 초안 생성 완료.

**2. 테스트 절차**
1. 브로커 계정에서 '성수 IT밸리타워' IM 초안을 매니저에게 승인 요청(Handoff)합니다.
2. 매니저 계정으로 로그인하여 승인 대기열에서 해당 건을 확인합니다.
3. '승인' 버튼을 클릭하여 워크플로우를 완료합니다.
4. 승인 직후 RAG 인덱싱이 백그라운드에서 트리거되는지 확인합니다.

**3. API 호출 예시**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/full-im-handoffs/approve \
  -H "Authorization: Bearer <MANAGER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"im_id": "im_seongsu_456"}'
```

**4. 기대 결과**
- IM 상태가 `approved`로 변경됨.
- 승인 완료 이벤트가 발행되고 `api/rag/index` 엔드포인트가 비동기 호출됨.
- Quality Gates v0.2 규칙 통과 로그 확인.

**5. 검증 체크리스트**
- [ ] L1: 승인 상태가 DB에 즉시 반영되는가?
- [ ] L2: 매니저 권한이 없는 계정으로 승인 요청 시 403 에러가 반환되는가?
- [ ] L3: 승인 후 RAG 인덱싱 작업이 큐에 등록되는가?

**6. 결과 기록표**
| 테스트 항목 | 결과 (Pass/Fail) | 비고/이슈 번호 |
|---|---|---|
| 권한 제어 검증 | | |
| 상태 변경 | | |
| 인덱싱 트리거 | | |

**7. 스크린샷 캡처 가이드**
- 매니저 승인 대기열 화면 및 승인 완료 후 상태 뱃지 캡처.

---

### B3. PPTX 14 아키타입 렌더링

**1. 사전 조건**
- 승인 완료된 '성수 IT밸리타워' IM 데이터.
- 로컬 PC에 PowerPoint 뷰어 설치.

**2. 테스트 절차**
1. IM 상세 페이지에서 'PPTX 다운로드' 버튼을 클릭합니다.
2. 다운로드된 PPTX 파일을 PowerPoint 뷰어로 엽니다.
3. 총 14종의 아키타입 슬라이드(a01-cover ~ a13-operating 등)가 모두 렌더링되었는지 확인합니다.
4. 텍스트 길이가 긴 섹션의 텍스트가 60% 예산 룰에 맞춰 잘림 처리(Truncation)되었는지 확인합니다.

**3. API 호출 예시**
```bash
curl -X GET https://cre-dealcard.vercel.app/api/broker/pptx/generate?im_id=im_seongsu_456 \
  -H "Authorization: Bearer <TOKEN>" --output seongsu.pptx
```

**4. 기대 결과**
- 유효한 .pptx 파일 다운로드.
- 임대 롤(Rent Roll) 표가 길 경우 자동으로 페이지네이션(autoPage) 되어 다음 슬라이드로 넘어감.
- 커버 이미지 누락 시 지정된 Fallback 이미지가 렌더링됨.
- 마지막 클로징 슬라이드 하단에 Provenance Badge(데이터 출처 뱃지)가 표시됨.

**5. 검증 체크리스트 (Visual Quality)**
- [ ] L1: 파일이 손상 없이 열리는가?
- [ ] L2: 14개 아키타입이 모두 순서대로 존재하는가?
- [ ] L3: 임대 롤 테이블이 자동 분할(Pagination) 되었는가?
- [ ] L4: 문장이 단어 중간이 아닌 문장/어절 단위로 잘림 처리(Text Budget) 되었는가?
- [ ] L5: 클로징 슬라이드 출처 뱃지 정상 노출 여부.

**6. 결과 기록표**
| 테스트 항목 | 결과 (Pass/Fail) | 비고/이슈 번호 |
|---|---|---|
| 슬라이드 누락 여부 | | |
| 테이블 Pagination | | |
| 텍스트 Truncation | | |
| Fallback/Badge 렌더링| | |

**7. 스크린샷 캡처 가이드**
- 커버 슬라이드, Rent Roll이 분할된 2개 슬라이드, 클로징 슬라이드 캡처.

---

### B4. IM 뷰어 모바일 반응형 & DCF

**1. 사전 조건**
- 발행된 IM의 퍼블릭 링크 획득 (`/im-lite/{buildingId}`).
- 크롬 개발자 도구 또는 실제 모바일 디바이스 준비.

**2. 테스트 절차**
1. 모바일 뷰포트(375px, 390px, 414px)에서 IM 퍼블릭 링크에 접속합니다.
2. 최상단 Hero Card의 이미지 및 텍스트 정렬을 확인합니다.
3. 스크롤을 내려 매각가 추이 차트 및 DCF 히트맵이 화면 너비에 맞게 리사이징되는지 확인합니다.
4. 페이지 진입 후 조회수(View count)가 증가하는지 어드민에서 확인합니다.

**3. 기대 결과**
- 화면 너비 초과나 가로 스크롤 없이 컴포넌트가 1열(Column)로 적절히 재배치됨.
- DCF 히트맵의 셀 크기와 폰트가 모바일에 최적화되어 터치 가능하도록 렌더링됨.
- 조회수 추적 API가 정상 호출됨.

**4. 검증 체크리스트**
- [ ] L1: 375px(iPhone SE)에서 UI 깨짐이 없는가?
- [ ] L2: 차트 툴팁 터치가 정상적으로 동작하는가?
- [ ] L3: 조회수 트래킹 이벤트 송신 여부 (Network 탭 확인).

**5. 결과 기록표**
| 테스트 항목 | 결과 (Pass/Fail) | 비고/이슈 번호 |
|---|---|---|
| 375px 렌더링 | | |
| 390px 렌더링 | | |
| 414px 렌더링 | | |
| 차트 인터랙션 | | |

**6. 스크린샷 캡처 가이드**
- 375px 해상도에서의 Hero Card 영역 및 DCF 히트맵 영역 캡처.

---

### B5. IM 품질 게이트 & 크로스 벨리데이션

**1. 사전 조건**
- 'Grade D 건물 데이터 (불명 건물)' 및 '당산 센트럴타워' 데이터 준비.

**2. 테스트 절차**
1. 유효성 검사 실패 조건 주입: 임대 면적 합계를 연면적(GFA)보다 크게 설정.
2. 공실률(Vacancy Rate)을 120% 로 비정상 값 입력 후 저장 시도.
3. 데이터 등급 산정 확인.
4. Grade D 데이터를 기반으로 IM 발행 시도.
5. 데이터 최신성 감가(Data Freshness Decay) 로직 검증.

**3. 기대 결과**
- 임대 면적 합계 > GFA 일 경우 에러 메시지 노출 및 저장 차단.
- 공실률 0~100% 범위를 벗어날 경우 차단.
- '불명 건물' 데이터는 Grade D로 판정되며 IM 외부 발행 버튼이 비활성화됨(Blocking).
- 대장 12개월, 등기 3개월, 렌트롤 6개월 초과 시 경고 뱃지 노출.

**4. 검증 체크리스트**
- [ ] L1: 수학적 크로스 벨리데이션(면적, 공실률) 방어가 작동하는가?
- [ ] L2: Grade D 에셋의 퍼블리싱이 완벽히 차단되는가?
- [ ] L3: 날짜 기반 최신성 경고 UI가 노출되는가?

**5. 결과 기록표**
| 테스트 항목 | 결과 (Pass/Fail) | 비고/이슈 번호 |
|---|---|---|
| 면적/공실률 Validation | | |
| Grade D 발행 차단 | | |
| 데이터 Freshness 경고 | | |

**6. 스크린샷 캡처 가이드**
- 에러 토스트 메시지 캡처 및 비활성화된 발행 버튼 캡처.

---

### B6. PPTX 프리셋 관리

**1. 사전 조건**
- Pro 티어 어드민 페이지 접근.

**2. 테스트 절차**
1. PPTX 프리셋 관리 페이지로 이동합니다.
2. 신규 프리셋 '프리미엄 블루'를 생성하며 Primary/Secondary 색상과 폰트(Pretendard), 로고를 등록합니다.
3. 등록 완료 후 생성된 프리셋을 기본값으로 설정합니다.
4. B3 시나리오의 PPTX 다운로드를 다시 수행하여 적용 여부를 확인합니다.

**3. API 호출 예시**
```bash
curl -X POST https://cre-dealcard.vercel.app/api/broker/pptx-preset \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"preset_name": "프리미엄 블루", "primary_color": "#1E3A5F", "font_family": "Pretendard"}'
```

**4. 기대 결과**
- 신규 다운로드된 PPTX에 1E3A5F 색상이 테마 컬러로 적용됨.
- 마스터 슬라이드에 사용자 등록 로고와 푸터 텍스트가 렌더링됨.

**5. 검증 체크리스트**
- [ ] L1: 프리셋 CRUD(생성/조회/수정/삭제)가 정상 동작하는가?
- [ ] L2: 지정된 헥스 코드 색상이 PPTX 요소(도형, 제목)에 반영되는가?
- [ ] L3: 로고 이미지가 슬라이드 템플릿 영역을 벗어나지 않는가?

**6. 결과 기록표**
| 테스트 항목 | 결과 (Pass/Fail) | 비고/이슈 번호 |
|---|---|---|
| 프리셋 생성 API | | |
| PPTX 테마 적용 | | |
| 로고 리사이징/배치 | | |

**7. 스크린샷 캡처 가이드**
- 프리셋 설정 UI 캡처 및 변경된 색상이 적용된 PPTX 슬라이드 캡처.
