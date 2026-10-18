# Rollback Registry (`docs/rollback`)

이 폴더는 **60대 개인 소형 상업용 빌딩 중개인 무마찰 UX 최적화(딜카드 · Basic IM · 모바일 매거진 집중)** 과정에서 화면/메뉴에서 숨김(`DORMANT`) 처리한 기능들의 **원본 위치, 원본 코드 스니펫, 1단계 복원 절차**를 보관합니다.

## 원칙
1. **코드 및 라우트 보존**: 숨김 처리된 기능의 페이지 컴포넌트(`src/app/**`), 도메인 로직(`src/domain/**`), API(`src/app/api/**`)는 삭제하지 않고 그대로 유지합니다.
2. **주석 태그 표준**: 코드 내 숨김 지점은 모두 `/* DORMANT: ux60-focus — 복원 시 docs/rollback/2026-10-18-dormant-features.md 참조 */` 주석으로 표시되어 있어 `git grep "DORMANT: ux60-focus"` 명령 한 줄로 전수 검색할 수 있습니다.
3. **문서 목록**:
   - [2026-10-18-dormant-features.md](./2026-10-18-dormant-features.md): 비핵심 메뉴(매칭·서클·퍼널·일정·캠페인 등) 및 Pro IM 진입점 숨김 내역과 복원 코드
