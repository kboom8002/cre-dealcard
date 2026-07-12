# Standardizing Mobile IM Section Schema

이전 세션 "Standardizing Mobile IM Specifications"에서 중단된 작업을 이어받아, IM 섹션 스키마를 코드베이스 전체에서 일관되게 통일합니다.

## 핵심 문제

현재 **두 가지 서로 다른 섹션 스키마**가 코드베이스에 공존하고 있습니다:

### Schema A: Domain Type (`types.ts` / `writer.ts` 생성)
```typescript
interface MobileIMSection {
  section_type: "property_overview" | "location_access" | ... // semantic ID
  section_order: number
  title: string
  markdown: string           // ← 콘텐츠 키
  confidence: "confirmed" | "inferred" | "needs_check"
  boundary_note: string
}
```

### Schema B: Demo/Public Type (`mobile-im-demo-data.ts` / public route fallback)
```typescript
interface MobileIMSection {
  sectionId: "01_overview" | "02_location" | ...   // numeric prefix ID
  title: string
  icon: string
  content: string            // ← 콘텐츠 키
  dataSource: string
  aiRole: "auto" | "ai_generated" | "static"
  locked: boolean
  lockedReason?: string
  boundaryNote?: string      // camelCase
}
```

### 불일치로 인한 문제점

| 소비자 | 기대 스키마 | 워크어라운드 |
|--------|-------------|-------------|
| `mobile-im-viewer.tsx` (SectionCard) | Schema B (`content`, `sectionId`) | `section.content \|\| (section as any).markdown` (line 684) |
| `im-to-magazine-bridge.ts` | Schema B | `s.sectionId === '01_overview' \|\| s.sectionId === 'property_overview'` 이중 탐색 |
| `translate/route.ts` | Schema A (`markdown`, `section_type`) | `s.markdown`, `s.section_type` 직접 접근 → Schema B 문서에서 깨짐 |
| `export/route.ts` | Schema A (`markdown`) | `body.sections`에서 `markdown` 키 직접 접근 |
| `save-sections/route.ts` | Schema A (import) | `doc.content` 읽기 ← handler는 `doc.body`에 저장 → **컬럼 불일치** |

---

## 설계 방향

> [!IMPORTANT]
> **Schema B (Demo Type)를 canonical로 채택하고, Schema A 출력물을 Schema B 형태로 변환하는 매핑 레이어를 추가합니다.**

이유:
1. Schema B가 **모든 UI 소비자**(viewer, share, TTS)에서 사용하는 표준
2. Schema B의 `icon`, `aiRole`, `locked` 등 UI 전용 필드는 Schema A에 없으므로 A→B 변환이 자연스러움
3. Demo 데이터(3건)가 Schema B로 이미 고정되어 있음
4. 변환은 writer → handler 경계 한 곳에서만 발생

---

## Proposed Changes

### 1. 통합 타입 정의 신설

#### [NEW] [mobile-im-shared-types.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/mobile-im-shared-types.ts)

- Schema B 기반의 **단일 Canonical 타입** `CanonicalIMSection` 정의
- Schema A → Canonical 매핑 함수 `mapWriterSectionToCanonical()` 제공
- `SECTION_TYPE_TO_ID_MAP`: `"property_overview"` → `"01_overview"` 매핑 테이블
- `SECTION_META_MAP`: 각 sectionId별 기본 `icon`, `aiRole` 제공
- 기존 `mobile-im-demo-data.ts`의 `MobileIMSection`과 100% 호환

---

### 2. Handler 출력 정규화

#### [MODIFY] [handler.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/im-lite/generate/handler.ts)

- `writerResult.sections`(Schema A)를 `mapWriterSectionsToCanonical()`로 변환 후 `body.sections`에 저장
- 이후 모든 DB 저장은 Canonical(Schema B) 형식으로만 이루어짐

---

### 3. Public Route Fallback 정규화

#### [MODIFY] [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/im-lite/%5BbuildingId%5D/route.ts)

- SSoT 폴백 섹션(lines 168-236)이 이미 Schema B 형식이므로 변경 최소
- `sectionId` 값을 `SECTION_TYPE_TO_ID_MAP`의 canonical ID와 일치시킴 (현재 `01_overview` 등 이미 일치)
- `confidence` 필드 추가 (기본값 `"needs_check"`)

---

### 4. save-sections 컬럼 불일치 수정

#### [MODIFY] [save-sections/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/im-lite/%5Bid%5D/save-sections/route.ts)

- `doc.content` → `doc.body`로 수정 (handler가 `body` 컬럼에 저장하므로)
- select 쿼리도 `content` → `body`로 변경
- update 쿼리도 `content` → `body`로 변경

---

### 5. translate route 호환성 수정

#### [MODIFY] [translate/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/public/im-lite/%5BbuildingId%5D/translate/route.ts)

- Schema B 기반으로 섹션 읽기: `s.content` (우선) → `s.markdown` (fallback)
- `s.sectionId` (우선) → `s.section_type` (fallback)
- `doc.content` → `doc.body`로 수정 (export route와 동일하게 `body` 컬럼 사용)

---

### 6. im-to-magazine-bridge 정리

#### [MODIFY] [im-to-magazine-bridge.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-to-magazine-bridge.ts)

- 이중 ID 탐색 제거 (`s.sectionId === '01_overview' || s.sectionId === 'property_overview'`)
- canonical ID(`sectionId: "01_overview"`)만 사용
- import를 `mobile-im-demo-data.ts`에서 새 shared types로 변경

---

### 7. Viewer 타입 정리

#### [MODIFY] [mobile-im-viewer.tsx](file:///c:/Users/User/cre-dealcard/src/app/%28public%29/im-lite/%5BbuildingId%5D/mobile-im-viewer.tsx)

- SectionCard의 `section.content || (section as any).markdown` → `section.content`로 단순화
- 모든 데이터가 Canonical 형식이므로 타입 캐스팅 제거

---

## Open Questions

> [!IMPORTANT]
> **Q1: `types.ts`의 기존 `MobileIMSection` 타입을 유지할지?**
> `writer.ts`와 관련 도메인 모듈(judge, cross-validator 등)이 Schema A를 내부적으로 사용합니다. 두 가지 옵션:
> - **(A) 유지**: writer 내부는 Schema A, handler 경계에서 변환 → 변경 최소
> - **(B) 통합**: writer도 Schema B로 변경 → 29개 도메인 파일 대규모 수정
> 
> **추천: (A) 유지** — writer 내부 스키마는 AI 생성 파이프라인 전용이므로, 외부 인터페이스와 분리하는 것이 안전합니다.

> [!WARNING]
> **Q2: `doc.content` vs `doc.body` 컬럼 — DB 스키마 확인 필요**
> `handler.ts`는 `body` 컬럼에 저장하는데, `save-sections/route.ts`는 `content`를 읽고 있습니다. 실제 `document_objects` 테이블에 **두 컬럼이 모두 존재**하는지, 아니면 하나만 존재하는지 확인이 필요합니다. (translate route도 `content` 사용 중)

---

## Verification Plan

### Automated Tests
```bash
npm run build
```
- TypeScript 컴파일 에러 없이 빌드 성공 확인

### Manual Verification
1. 데모 빌딩 3건 (`f1111111...`, `f2222222...`, `f3333333...`) IM 뷰어 정상 렌더링
2. AI 생성 IM 문서(docId 지정)도 동일하게 정상 렌더링
3. SSoT 폴백 경로도 정상 동작
4. 번역 API 호출 시 에러 없음
5. 내보내기(export) HTML 정상 생성
