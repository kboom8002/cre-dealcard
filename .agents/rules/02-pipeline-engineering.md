<!-- BEGIN:cre-pipeline-rules -->
# CRE IM Pipeline Engineering Rules (D33/D34 교훈)

### 5. 게이트 레지스트리 일관성 (Gate Registry Consistency)
- 새 게이트(G41~G45 등)를 구현할 때 반드시 `quality-gates-v02.ts`의 `PUBLISH_GATES` 배열에 등록합니다.
- 구현 파일(cross-validator, pptx-renderer 등)에서 로직을 작성하고 `PUBLISH_GATES`에 등록하지 않으면 **T2-GATE-01이 실패**합니다.
- `GateContext` 인터페이스에 해당 필드도 함께 추가합니다.

### 6. 산출물 단언 우선 원칙 (Output Assertion Priority)
- 함수 단위 테스트(함수가 올바른 값을 반환하는가)는 **보조**입니다.
- **산출물 단언**(렌더된 PPTX/JSON이 올바른 구조·수치·게이트를 가지는가)이 **최종 권위**입니다.
- 문장을 단언하지 않습니다. 구조·수치·게이트만 단언합니다.

### 7. Negative 짝 의무 (Negative Pair Obligation)
- 모든 테스트 케이스에 반대 단언(negative pair)이 있어야 합니다.
- negative 짝 없는 케이스는 등재를 금지합니다.

### 8. 임계값 하드코딩 금지 (No Hardcoded Thresholds)
- DPI, 크로핑률, 면수 상한 등의 임계값을 테스트 코드에 직접 적지 않습니다.
- `credeal/ssot/*.yaml`에서 읽거나, 최소한 코드 상수에서 import합니다.

### 9. deck-sequencer 조건부 면 추가 (Conditional Slide Addition)
- 데이터 가용성 플래그(`hasRentRoll`, `hasPhotos` 등)가 `false`이면 해당 면을 추가하지 않습니다.
- income 포스처의 rentRoll, gallery 등은 반드시 `dataAvailability` 가드를 확인합니다.

### 10. 면수 상한 (Page Hard Limit)
- IM **본문** 면수 상한은 **16면**입니다 (PAGE_HARD_LIMIT=16, deck-sequencer 본문 절삭).
- **부록**(공부발췌, 권리관계, 지적도, 상권분석)은 16면 한도에서 **제외**됩니다.
- **Grade D는 모든 tier(basic/pro)에서 PPTX 생성이 차단됩니다** (`[G30]` throw). tier와 무관합니다.
- 렌트롤 다단 테이블, 갤러리 다면은 데이터 양에 따라 초과 가능합니다.
- 테스트에서 총 면수(본문+부록)를 16 이하로 단언하지 않습니다.

### 11. 상수 리네임 전수 검증 (Constant Rename Full-Scan Verification)
- 상수, 타입, 함수명을 리네임할 때는 반드시 `grep_search`로 전체 코드베이스의 참조를 확인한 후 **모든 참조를 일괄 수정**합니다.
- 주석 내 참조, 테스트 파일 내 참조, 문자열 리터럴 내 참조(에러 메시지 등)도 모두 포함합니다.
- 리네임 후 반드시 `npm run build`로 빌드 검증합니다.
- **위반 사례**: `EXPIRY_COLORS` → `EXPIRY_HEATMAP_PALETTE` 리네임 시 L140 참조 누락 → `Cannot find name 'EXPIRY_COLORS'` 빌드 실패.
<!-- END:cre-pipeline-rules -->