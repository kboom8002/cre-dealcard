# 🏢 프로덕션 임대수익형(Income) E2E 테스트 수행 및 AI 시각 검수 보고서

> **테스트 일시**: 2026. 8. 23. 오후 8:47:16  
> **기준 명세**: [`docs/test0823/01_e2e_income_fullpipeline.md`](file:///c:/Users/User/cre-dealcard/docs/test0823/01_e2e_income_fullpipeline.md)  
> **검증 대상**: Case A (당산동 115억) / Case B (양평동 250억)  
> **최종 판정**: ✅ **2개 케이스 100% ALL PASS (결함 0건)**

---

## 1. 파이프라인 단계별 핵심 결과 요약표

| 파이프라인 단계 | Case A (당산동 115억) | Case B (양평동 250억) | 검증 기준 / 게이트 | 판정 |
|---|---|---|---|:---:|
| **1단계: 메모 슬롯 추출** | 6개 슬롯 식별 (매매가, 렌트롤, 층수 등) | 7개 슬롯 식별 (3필지, 지하공실 등) | 자연어 슬롯 매핑 정확도 | ✅ PASS |
| **2단계: 딜카드 티저 밴딩** | 가격: `110억 원대` / 수익률: `2%대 초반` | 가격: `250억 원대` / 수익률: `2%대 중반` | B2C 대고객 밴딩 포맷 준수 | ✅ PASS |
| **3단계: 데이터 등급 판정** | 표준: **70.0점 (verified)** → 정밀: **80.0점 (verified)** | 표준: **70.0점 (verified)** → 정밀: **80.0점 (verified)** | C/B 등급 산정 및 Pro IM 게이트 | ✅ PASS |
| **4단계: 모바일 IM 문서** | 7섹션 전문 마크다운 및 JSON 저장 완료 | 7섹션 전문 마크다운 및 JSON 저장 완료 | 7개 섹션 아코디언 체계 완비 | ✅ PASS |
| **5단계: 웹 브라우저 캡처** | Mobile Full, Hero Card, Desktop Full 3종 | Mobile Full, Hero Card, Desktop Full 3종 | Playwright Chromium 실 브라우저 렌더링 | ✅ PASS |
| **6단계: PPTX 10장 렌더링** | 10장 생성 (571.0 KB) | 10장 생성 (562.8 KB) | OpenXML 10장 생성 무결성 | ✅ PASS |
| **7단계: 150 DPI PNG 캡처** | 10장 고화질 슬라이드 PNG 캡처 | 10장 고화질 슬라이드 PNG 캡처 | LibreOffice + PyMuPDF 변환 | ✅ PASS |
| **8단계: AI 시각 무결성** | D01~D11 11대 기준 100% 충족 (XML 결함 0건) | D01~D11 11대 기준 100% 충족 (XML 결함 0건) | NaN/undefined/null 방지 (P0) | ✅ PASS |
| **9단계: 페르소나 격리** | '60대 자산가' 등 문구 0건 (완전 격리) | '60대 자산가' 등 문구 0건 (완전 격리) | Implicit Persona Principle (P0) | ✅ PASS |
| **10단계: CRE 용어 표준** | '연 순수익률 (Cap Rate)' 표준 준수 | '연 순수익률 (Cap Rate)' 표준 준수 | CRE Lexicon Standards (P1) | ✅ PASS |

---

## 2. D01~D11 디자인 품질 11대 기준 감사 결과

| 코드 | 검수 기준 | Case A (당산동) | Case B (양평동) | 비고 |
|:---:|---|:---:|:---:|---|
| **D01** | 헤더 세로 액센트 바 정상 | ✅ PASS | ✅ PASS | 4px 브랜드 액센트 바 정상 노출 |
| **D02** | 가로 충돌선 0건 | ✅ PASS | ✅ PASS | 불필요한 수평 충돌선 제거 확인 |
| **D03** | 좌/우 비중복 렌더링 | ✅ PASS | ✅ PASS | A04/A05 좌측 서사와 우측 카드 불릿 비중복 |
| **D04** | 텍스트 박스 오버플로 없음 | ✅ PASS | ✅ PASS | 12.713 x 6.75 바운더리 100% 준수 |
| **D05** | 최소 폰트 ≥ 8pt | ✅ PASS | ✅ PASS | 표 및 본문 폰트 8pt 이상 보장 |
| **D06** | 마크다운 기호 잔존 0건 | ✅ PASS | ✅ PASS | `**`, `>`, `•` 등 미변환 기호 0건 |
| **D07** | NaN / undefined / null 0건 | ✅ PASS | ✅ PASS | OpenXML 전수 검사 결함 0건 (P0) |
| **D08** | 이모지 잔존 0건 | ✅ PASS | ✅ PASS | PPTX 본문 내 이모지 0건 (★ 보존) |
| **D09** | WCAG 3:1 대비 충족 | ✅ PASS | ✅ PASS | 다크 테마 배경 대비 텍스트 시인성 확보 |
| **D10** | 이미지 왜곡 없음 | ✅ PASS | ✅ PASS | 종횡비 유지 및 프레임 맞춤 확인 |
| **D11** | 여백 일관성 | ✅ PASS | ✅ PASS | 슬라이드 상하좌우 마진 균일 |

---

## 3. 케이스별 산출물 경로

### 📁 Case A: 당산동5가 근생빌딩 (115억)
- **PPTX 프리젠테이션**: [`dangsan_income_115b.pptx`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseA_dangsan_115b/dangsan_income_115b.pptx)
- **모바일 웹 뷰어 HTML**: [`viewer_mobile.html`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseA_dangsan_115b/viewer_mobile.html)
- **7섹션 전문 마크다운**: [`sections/`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseA_dangsan_115b/sections)
- **슬라이드 캡처 PNG (10장)**: [`captures/`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseA_dangsan_115b/captures)

### 📁 Case B: 양평동4가 더레드빌딩 (250억)
- **PPTX 프리젠테이션**: [`yangpyeong_income_250b.pptx`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseB_yangpyeong_250b/yangpyeong_income_250b.pptx)
- **모바일 웹 뷰어 HTML**: [`viewer_mobile.html`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseB_yangpyeong_250b/viewer_mobile.html)
- **7섹션 전문 마크다운**: [`sections/`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseB_yangpyeong_250b/sections)
- **슬라이드 캡처 PNG (10장)**: [`captures/`](file:///c:/Users/User/cre-dealcard/docs/test0823/outputs/caseB_yangpyeong_250b/captures)
