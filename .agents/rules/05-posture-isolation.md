<!-- BEGIN:cre-d39-rules -->
# CRE IM D39 Multi-Posture & PPTX Robustness Rules (2026-09-07 교훈)

### 26. 포스처별 슬라이드 바인더 완전 동적화 (Dynamic Binder Invariant)
- `data-binder.ts` 및 슬라이드 프롭스 빌더(`buildOwnerOccupied*` 등)에 특정 매물의 수치(120억, 48억 등), 지역명(역삼역, 테헤란로 등), 또는 특정 임대 스펙을 하드코딩하는 것을 엄격히 금지합니다.
- 모든 수치와 텍스트는 `doc.body`, `heroCard`, `assetIdentity`, `occupancySpec`, `building`에서 동적으로 산출하고, 일반화된 도심 비즈니스 권역 fallback을 사용해야 합니다.

### 27. 슬라이드 아키타입 CalloutKind 무결성 (Strict CalloutKind Exhaustiveness)
- PPTX Callout 아키타입(A04, A06, A08 등)에서 허용되는 `kind`는 오직 `info | good | warn | bad | brass` 5종뿐입니다.
- 임의의 문자열(`surface`, `neutral`, `card` 등)을 지정하면 튜플 디스트럭처링 시 `undefined is not iterable` 런타임 예외가 발생하므로 사용을 금지합니다.
- `imlib.ts` 및 기저 렌더러는 `colors[kind] ?? colors.info` 형태의 안전 폴백을 항상 유지해야 합니다.

### 28. Quality Gate 포스처 인식 및 점진적 응답 (Posture-Aware Gate & Graduated Response)
- `runCREQualityGate()`는 반드시 `posture` 컨텍스트를 주입받아 검사해야 합니다.
- 5대 포스처별 표준 실무 용어(사옥형 세무/감가상각, 개발형 PF/공사비/용적률완화, 운영형 GOP/RevPAR, 매매형 시세차익/양도차익)를 화이트리스트로 보장하여 Gate 오탐으로 인한 정상 AI 카피 폐기를 방지합니다.
- Gate 결과가 `medium` 리스크일 경우 AI 텍스트 전체를 버리지 않고, **Graduated Response**(AI 카피 유지 + 법적 면책 조항 자동 삽입)를 적용합니다.

### 29. 포스처별 슬라이드 데이터 분리 및 누출 방지 (Posture Isolation in Slide Binding)
- 포스처 전용 파생 슬라이드(사옥형 `plan`, `vsLease`, `commute`, `value` 등)는 반드시 `if (posture === 'owner_occupied')`와 같은 포스처 가드 내부에서만 바인딩되어야 합니다.
- 공통 섹션(`investment_thesis` 등)에서 타 포스처 전용 props가 무조건 덮어씌워져 슬라이드가 누출되는 버그를 원천 차단합니다.

### 30. 풀 파이프라인 E2E 테스트 타임아웃 (Full-Pipeline Test Timeout)
- `generateMobileIM`을 실행하는 E2E 및 L5 테스트는 10개 이상의 섹션을 다단계로 생성하므로, 전체 스위트 실행 시 CPU 경합으로 지연됩니다.
- 풀 파이프라인 테스트 케이스(`L5-YP-01`, `E2E-YP-PIPELINE` 등)는 vitest의 기본 타임아웃(5s/30s)에 의존하지 않고 명시적으로 `60_000ms` 이상의 타임아웃을 설정합니다.
<!-- END:cre-d39-rules -->