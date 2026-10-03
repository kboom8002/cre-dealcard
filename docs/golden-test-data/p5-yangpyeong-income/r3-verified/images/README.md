# 양평동 오피스빌딩 — r3-verified 이미지 폴더

이 폴더에는 **해당 매물의 실제 현장 사진만** 둡니다. 서류·표·지도 캡처는 `../source-docs/`에 둡니다.

## 현재 상태 (2026-10 정비)

| 파일 | 내용 | bottom_sheet.json 태깅 |
|:---|:---|:---|
| `images/image_01.png` | 건물 외관 (유일한 실사진) | `exterior` · `role: cover` · `isHero` |
| `source-docs/image_07.png` | 층별 현황표 | `excluded: true` (IM 제외 경로 검증용) |
| `source-docs/image_09.png` | 렌트롤 표 | `excluded: true` (IM 제외 경로 검증용) |
| `source-docs/image_02.png` | 위치/지적 지도 캡처 | 미사용 (지도는 시스템 자동 생성) |
| `source-docs/image_05.png` | 토지이용계획확인원 (양평동4가 117) | 미사용 |
| `source-docs/image_11.png` | 건축물대장 발췌 | 미사용 |

삭제한 파일: 제3자 중개법인 명함(개인 연락처 포함), 타 매물(논현동) 토지이용계획, 스톡 사진 2장, 제3자 로고.

## 사진 보강 필요 (Basic IM §2 #8 — 갤러리 6컷 기준)

| 카테고리 | 파일명 규칙 | 설명 |
|:---|:---|:---|
| 외관 | exterior_02.jpg | 건물 외관 측면 |
| 출입구 | entrance_01.jpg | 주 출입구 |
| 로비 | lobby_01.jpg | 로비/공용부 |
| 실내 | interior_01.jpg | 기준층 전용부 |
| 주차 | parking_01.jpg | 주차장 |
| 주변 | surroundings_01.jpg | 주변 거리뷰 |

> **주의**: 실제 현장 촬영 사진 또는 로드뷰 캡처만 추가하세요. 스톡/타 매물/개인정보 포함 이미지는 금지(Rule 34).
> 추가 후 `bottom_sheet.json`의 `photos_v2`에 `category`를 지정하세요.
