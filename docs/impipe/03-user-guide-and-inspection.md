# CRE IM 파이프라인 — 사용자 가이드 및 점검/보완 포인트

이 문서는 CRE DealCard Investment Memorandum(IM) 파이프라인의 사용자 가이드, 주요 점검 사항, 그리고 향후 아키텍처 및 서비스 고도화를 위한 개선 포인트를 상세히 기술합니다.

---

## Part A: 사용자 가이드

### 1. IM 생성 워크플로우
CRE DealCard의 IM 생성 프로세스는 자동화된 파이프라인을 통해 사용자의 데이터 입력을 전문가 수준의 모바일/PPTX IM으로 변환합니다.

1. **딜카드 생성**: 플랫폼에서 새로운 매물(Deal) 생성
2. **데이터 입력**: 주소, 면적, 임대차 정보, 재무 데이터 등의 기본 정보 기입
3. **IM 생성 트리거**: `im-core` 파이프라인을 통해 입력된 데이터를 바탕으로 분석 모델 실행
4. **모바일 IM 열람**: 웹/모바일 환경에서 인터랙티브 형태의 IM 확인
5. **PPTX 다운로드**: 검증된 최종 데이터를 바탕으로 9~16페이지 분량의 Presentation IM 다운로드

* **데이터 등급(A/B/C/D)과 IM 품질의 관계**
  입력된 데이터의 완전성과 신뢰도에 따라 파이프라인은 데이터를 A~D 등급으로 분류합니다. A등급(Verified) 데이터가 많을수록 DCF 모델과 같은 고급 재무 분석 결과가 IM에 반영되며, D등급 데이터가 많을 경우 `fallback UI`(데이터 부족 안내)가 렌더링됩니다.

### 2. 투자 포스처(Posture) 가이드
물건의 특성과 매수자의 투자 목적에 맞춘 5가지 **투자 포스처(Investment Posture)**를 지원합니다.

* **income (소득형)**: 안정적인 임대 수익 창출에 초점. (NOI, Cap Rate, WALT 섹션 활성화)
* **development (개발형)**: 토지 가치 및 신축/증축 잠재력 분석. (용적률, 지적도, 건축 가설계 섹션 활성화)
* **operating (운영형)**: 밸류애드(Value-add) 및 리모델링을 통한 수익률 개선 목적.
* **owner-occupied (사옥형)**: 직접 사용 목적의 법인 매수. (임대료 절감 효과, 공간 활용도 중심)
* **trading (거래형)**: 단기 시세 차익 목적. (매각 차익, 환금성 분석 중심)

> **💡 중요**: 포스처 선택에 따라 [calculateFinancials](file:///c:/Users/User/cre-dealcard/src/im-core/financial-calculator.ts) 내의 재무 분석 모델이 동적으로 변경되며, PPTX 렌더링 시 노출되는 슬라이드 우선순위가 바뀝니다.

### 3. 모바일 IM 뷰어 사용법
모바일 뷰어는 클라이언트와의 즉각적인 소통 및 검토를 위해 설계되었습니다.

* **섹션 아코디언 탐색**: 상권 분석, 건물 개요, 임대차 현황 등 각 섹션을 아코디언 형태로 접고 펼칠 수 있습니다.
* **데이터 품질 배지**: 각 데이터 포인트 우측에 렌더링된 색상 배지(Green=A, Yellow=B, Red=D)를 통해 정보의 신뢰도를 파악합니다.
* **승인 상태 이해**: 
  * `draft`: 내부 초안 작성 중
  * `S60`: 팀장급 1차 검토 완료
  * `S70`: 컴플라이언스 2차 검토 완료
  * `published`: 고객 배포 가능한 최종 상태
* **PPTX 다운로드**: 상태가 `published`에 도달하면 공식 문서(PPTX) 다운로드 버튼이 활성화됩니다.
* **1-tap 관심 표시 및 문의**: 모바일 IM 하단의 버튼을 통해 고객이 즉시 매수 의향을 전달할 수 있습니다.

### 4. PPTX Basic IM 출력물 이해
PPTX 제너레이터는 Python 기반의 PPTX 엔진과 연동되어 규격화된 산출물을 제공합니다.

* **9~16페이지 구성**: 물건 개요, 입지 분석, 임대차(Stacking Plan), 재무 분석을 포함한 핵심 내용.
* **슬라이드 우선순위 시스템**: 데이터가 방대해 최대 16페이지를 초과할 경우, 포스처에 따라 후순위 슬라이드(예: 주변 거래 사례)가 자동 생략됩니다.
* **Fallback UI**: 필수 데이터가 누락되었을 경우, 슬라이드가 깨지지 않고 '확보 예정 정보 체크리스트' 카드가 렌더링됩니다.
* **폰트/색상 테마**: 전문성을 강조하기 위해 `맑은 고딕` + `Arial` 폰트 조합과 골드 악센트 컬러가 기본 테마로 적용됩니다.

### 5. 데이터 입력 품질 최적화 가이드
가장 높은 A등급(Verified) 리포트를 얻기 위한 데이터 입력 팁입니다.

* **필수 입력 사항**: 정확한 도로명 주소, 매매가(만원), 월임대료(만원), 공실률, 고해상도 사진 3장 이상, 대출 금액, 층별 임대차 현황, 토지/연면적.
* **B → A 등급 업그레이드**: 공부상 용도와 실제 용도의 차이를 비고란에 명시하고, 최근 3개월 이내 발급된 건축물대장 기준 데이터를 입력하면 시스템이 A등급으로 상향 판단합니다.
* **재무 분석 심도**: A등급의 임대차 데이터가 확보되어야만 [financial-calculator.ts](file:///c:/Users/User/cre-dealcard/src/im-core/financial-calculator.ts)가 정확한 DCF(현금흐름할인) 및 10년 보유 수익률을 산출할 수 있습니다.

---

## Part B: 세부 파이프라인 점검 포인트

### 6. 최근 고도화 프로젝트에서 발견된 주요 결함 및 해결 내역

#### 6.1 아키텍처 위반 (Rule 12)
* **발견**: `im-core`에서 `mobile-im` 및 `pptx` 계층으로 향하는 7개의 직접 역참조와 1개의 간접(Transitive) 역참조 발생.
* **해결**: `ProvenanceKind`, `DataAvailability`, `Grade` 타입을 도메인 계층으로 이주. 재무 계산 로직을 [financial-calculator.ts](file:///c:/Users/User/cre-dealcard/src/im-core/financial-calculator.ts)로 격리하고 [lease-precise.ts](file:///c:/Users/User/cre-dealcard/src/domain/ontology/lease-precise.ts)를 도메인 온톨로지로 이동.
* **방어**: AST 기반 스캐너([architecture-boundaries.test.ts](file:///c:/Users/User/cre-dealcard/src/tests/architecture-boundaries.test.ts))를 CI에 통합하여 배럴 임포트의 깊은 참조를 차단.

#### 6.2 가짜 데이터(Mock Data) 누출
* **발견**: 렌더링 코드 내부에 UI 테스트용 하드코딩 값('120억', '3800만', '400만', '26.7년')이 누출됨.
* **해결**: 하드코딩 상수 전면 제거. 데이터 누락 시 `ClaimStatus='not_available'` 기반의 도메인 방어 로직으로 대체.
* **방어**: 네거티브 단언 테스트를 통해 '0 poison tokens' 유지.

#### 6.3 기술적 변명 문구 (Rule G54)
* **발견**: UI 상에 '확인 필요', '본문을 참조', '별도 안내 예정' 등의 비전문적 플레이스홀더 텍스트 노출.
* **해결**: 해당 문구 전면 제거 및 구조화된 `L.fallbackCard` 또는 도메인 공지(Domain Notice) UI로 대체.
* **방어**: 정규식 기반 금지 문구 탐지 자동화 테스트 도입.

#### 6.4 B2C 은어 및 페르소나 누출 (Rule 1)
* **발견**: B2B 상업용 부동산 IM에 부적절한 '내 돈', '세입자', '원금 안전판', '60대 자산가' 등 B2C 용어 발견.
* **해결**: 기관투자자 표준 전문어('자기자본', '임차인', '토지 평가액 비중' 등)로 전면 교체.
* **방어**: [terminology-normalizer.ts](file:///c:/Users/User/cre-dealcard/src/domain/terminology-normalizer.ts) 적용 및 [m4-challenger-lexicon-robustness.test.ts](file:///c:/Users/User/cre-dealcard/src/tests/m4-challenger-lexicon-robustness.test.ts)를 통한 멱등성 검증.

#### 6.5 텍스트 오버플로우
* **발견**: 긴 텍스트 입력 시 PPTX 내 DrawingML 요소의 범위를 초과하여 레이아웃이 붕괴.
* **해결**: 이진 탐색 기반 폰트 스케일러인 `TextPhysicsEngine` 도입 (`fitTextToBox()`, `fitTableCell()`).
* **방어**: [detect_pptx_overflow.py](file:///c:/Users/User/cre-dealcard/scripts/detect_pptx_overflow.py) `--strict` 모드로 24개 덱 / 80 슬라이드 전수 스캔 (0 errors).

#### 6.6 TypeScript 컴파일 에러
* **발견**: 인터페이스 불일치로 인한 `TS2339`(존재하지 않는 속성) 및 `TS2353`(중복 키) 에러 발생.
* **해결**: `MobileIMSupplementalInput` 인터페이스 정합 및 테스트 픽스처 타입 일치화.
* **방어**: CI 파이프라인에 `npx tsc --noEmit` 프리플라이트 게이트 구축.

### 7. 현재 테스트 커버리지 현황
전체 **~3,400+**개의 테스트가 100% Pass 상태를 유지해야 합니다.

* `architecture-boundaries.test.ts` (7/7): AST 파싱 기반 역참조 방어
* `mobile-im-data-fidelity.test.ts` (13/13): 5가지 포스처 간 데이터 정합성 검증
* `m4-challenger-lexicon-robustness.test.ts` (13/13): B2C 용어 탐지 및 멱등성 검증
* `m5-remediation-patches.test.ts` (5/5): XSS 및 인젝션 방어막 검증
* **preflight suite** (108/108): 빌드 전 무결성 게이트 검증
* **domain suite** (746/746): 핵심 도메인 로직 및 계산 단위 테스트

### 8. 배포 및 CI/CD 점검 체크리스트
프로덕션 배포 전 아래 커맨드 라인 인스트럭션이 모두 정상 종료되어야 합니다.

- [ ] `npm run test` (모든 단위/통합 테스트 100% Pass)
- [ ] `npm run preflight` (108/108 Pass)
- [ ] `npx tsc --noEmit` (타입 검사 통과, Exit Code 0)
- [ ] `npm run build` (Next.js 빌드 성공, 199/199 routes, Exit Code 0)
- [ ] `python scripts/detect_pptx_overflow.py --strict` (0 errors)
- [ ] Git push 시 Vercel 자동 배포 트리거 및 Health check 통과

---

## Part C: 보완 및 향후 개선 포인트

### 9. 잠재적 개선 영역

#### 9.1 지도 랜드마크 한글 깨짐
* **현황**: Kakao Static Map API를 통해 가져오는 지도 이미지 내 라벨이 서버/클라이언트 환경에 따라 제어 불가.
* **제안**: API 의존도를 낮추기 위해 SVG 오버레이 기반의 커스텀 랜드마크 텍스트 렌더링 시스템 구축 또는 Sharp 라이브러리 내 CJK 폰트 직접 임베딩 적용.

#### 9.2 지적도 가용성
* **현황**: V-World API에 강하게 의존하고 있으며, 해당 서비스 장애 시 대체 수단(fallback)이 부재.
* **제안**: 지적도 이미지에 대한 Redis 기반 캐시 레이어 구축 및 국토정보플랫폼 등의 대체 데이터 소스 연동 추가.

#### 9.3 공시지가 상승률 시각화
* **현황**: 과거 10년치 데이터가 수집 및 저장되나, IM 상에 시각적인 차트나 그래프로 노출되지 않음.
* **제안**: 모바일 및 PPTX IM에 미니 Bar Chart 또는 Trend Arrow 기반 시각화 컴포넌트 개발.

#### 9.4 스태킹 플랜 미려도
* **현황**: A22 아키타입(32KB) 등 복잡한 스태킹 플랜 렌더링 시, 층수가 과도하게 많으면 셀 간격이 좁아져 가독성이 저하됨.
* **제안**: 동적 높이 비율 계산(Dynamic Height Ratio) 알고리즘을 고도화하고, 면적이 작거나 정보가 동일한 연속 층은 그룹화(Grouping)하여 렌더링.

#### 9.5 Pro IM 파이프라인 확장
* **현황**: 현재 상용화 수준에 도달한 것은 Basic IM 파이프라인에 국한됨.
* **제안**: 기존 작성된 [pro-financial-model.ts](file:///c:/Users/User/cre-dealcard/src/im-core/pro-financial-model.ts) (1,058줄 규모)를 연동하여 전문 기관투자자용 Pro IM 자동 생성 파이프라인 활성화.

#### 9.6 다국어 지원
* **현황**: 현재 모든 생성물은 한국어(Korean) 전용.
* **제안**: 해외 투자자 대응을 위해 영문 1-Pager Executive Summary 자동 번역 및 레이아웃 생성 기능(i18n 연동) 추가.

#### 9.7 SSoT YAML ↔ TypeScript 타입 자동 동기화
* **현황**: 도메인 사전 및 불변식을 정의한 YAML 파일 변경 시, 이를 TypeScript 인터페이스로 수동 업데이트해야 하는 휴먼 에러 위험 잔존.
* **제안**: `npm run preflight` 단계에 YAML Schema를 TypeScript 타입 및 검증 코드로 변환하는 Code Generator(코드 생성기) 연동.

#### 9.8 온톨로지 기반 자동 검증 강화
* **현황**: [im.invariants.yaml](file:///c:/Users/User/cre-dealcard/config/im.invariants.yaml) (277줄)에 정의된 불변식(Invariants)이 런타임에서 부분적으로만 검증됨.
* **제안**: YAML 기반의 모든 불변식을 파싱하여 제스트(Jest) 단위 테스트 픽스처로 자동 변환하는 체계 구축.

### 10. 에이전트 규칙(Agent Rules) 요약 참조
유지보수 및 신규 기능 개발 시 다음 에이전트 핵심 규칙을 반드시 준수해야 합니다.

* **Rule 1 (CRE 전문 용어 사용 의무)**: B2C 은어를 배제하고 기관 수준의 B2B 상업용 부동산 전문 용어만을 사용할 것.
* **Rule 12 (클린 아키텍처 경계)**: `domain` 및 `im-core` 계층에서 `mobile-im`이나 `pptx` 뷰 계층으로의 어떠한 직/간접 역참조도 금지.
* **Rule 37 (기술적 변명 금지)**: 개발 중임을 나타내는 기술적 임시 문구 사용 금지.
* **Rule G54 (사용자 대면 텍스트 규칙)**: 데이터 부재 시 변명형 문구('확인 필요' 등)를 사용자에게 노출하지 말고, 정규화된 도메인 메시지로 대체할 것.
* **Rule D56 (한국 상업용 부동산 용어 사전)**: 시스템 내 모든 텍스트는 [cre-lexicon.yaml](file:///c:/Users/User/cre-dealcard/config/cre-lexicon.yaml) (4,133줄)에 정의된 표준 용어를 우선 적용.
