# Phase 2: 슬라이드 편집 코어 & 지도/AI 연동 (5주)

> **의존성**: Phase 1 (ThemeContext, Zustand Store, HeaderFooterConfig)
> **산출물**: Archetype 선택기, 인라인 텍스트 에디터, 요소 배치 에디터, 카카오맵 WYSIWYG, AI 텍스트 생성기, 갤러리 큐레이터

---

## 2.1 슬라이드별 레이아웃 Archetype 선택 (F2)

### 현재 상태 (코드베이스 감사 결과)

- `deck-sequencer.ts`의 `DATA_KEY_ARCHETYPE` 매핑: dataKey별 **고정 1개 Archetype** 할당
- `slide-preview-svg.tsx`: 12개 Archetype SVG 렌더러 구현 (`renderA01Cover` ~ `renderA14Gallery`)
- `SlideEditor.tsx`의 `SLIDE_FIELDS`: dataKey별 **고정 필드 목록** — 레이아웃 변경 UI 없음
- `PptxSlide.layoutType`: 문자열 필드 존재 → Archetype ID 저장 가능

### 호환성 매핑

```typescript
// [신규] src/domain/building/mobile-im/pptx/archetype-compatibility.ts

export interface ArchetypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;     // 아이콘 이모지
  previewSvg: string; // 미니 SVG 경로
}

/**
 * dataKey별 호환 가능한 Archetype 목록.
 * 첫 번째가 기본값(deck-sequencer의 DATA_KEY_ARCHETYPE과 일치).
 */
export const ARCHETYPE_COMPATIBILITY: Record<string, ArchetypeOption[]> = {
  cover: [
    { id: 'A01', label: '표지', description: '5가지 커버 스타일', icon: '📚' },
  ],
  summary: [
    { id: 'A02', label: '스탯 그리드', description: '4~6개 핵심 지표 카드', icon: '📊' },
    { id: 'A04', label: '7:5 비대칭', description: '좌측 텍스트 + 우측 카드', icon: '📐' },
    { id: 'A05', label: '7:4 비대칭', description: '좌측 넓은 텍스트 + 우측 요약', icon: '📏' },
  ],
  building: [
    { id: 'A04', label: '7:5 비대칭', description: '건물 스펙 + 권리 분석', icon: '📐' },
    { id: 'A05', label: '7:4 비대칭', description: '넓은 텍스트 + 요약 카드', icon: '📏' },
    { id: 'A08', label: '듀얼 테이블', description: '좌우 2분할 테이블', icon: '📋' },
    { id: 'A03', label: '대형 테이블', description: '전폭 상세 테이블', icon: '📊' },
  ],
  location: [
    { id: 'A06', label: '지도 다이어그램', description: '좌측 지도 + 우측 입지 분석', icon: '🗺️' },
  ],
  land: [
    { id: 'A04', label: '7:5 비대칭', description: '토지 정보 + 법규 요약', icon: '📐' },
    { id: 'A05', label: '7:4 비대칭', description: '넓은 토지 분석', icon: '📏' },
    { id: 'A08', label: '듀얼 테이블', description: '용도지역 + 건폐율/용적률', icon: '📋' },
  ],
  rentRoll: [
    { id: 'A24', label: '렌트롤 스태킹', description: '층별 임대 + 미니 스태킹', icon: '🏗️' },
    { id: 'A03', label: '대형 테이블', description: '전폭 렌트롤 테이블', icon: '📊' },
    { id: 'A08', label: '듀얼 테이블', description: '요약 + 상세 분할', icon: '📋' },
  ],
  yieldFormula: [
    { id: 'A23', label: '수익률 산식', description: 'As-Is vs Stabilized 공식', icon: '💰' },
    { id: 'A08', label: '듀얼 테이블', description: '좌우 비교 수익률', icon: '📋' },
  ],
  gallery: [
    { id: 'A14', label: '갤러리 그리드', description: '6장 사진 그리드', icon: '📷' },
  ],
  closing: [
    { id: 'A10', label: '클로징', description: '면책/연락처/뱃지', icon: '📝' },
  ],
};

/** 선택된 Archetype에 따른 EditorField 매핑 */
export function getFieldsForArchetype(dataKey: string, archetypeId: string): EditorField[] {
  // A04/A05: 좌측 텍스트(rows) + 우측 카드/콜아웃
  // A03: 전폭 테이블 → 행 데이터 편집
  // A08: 좌/우 테이블 → 양측 데이터 편집
  // A24: 렌트롤 특화 → 층별 편집
  // ...
}
```

### UI: Archetype 선택기

```typescript
// [신규] src/components/broker/im-studio/ArchetypeSelector.tsx

interface ArchetypeSelectorProps {
  dataKey: string;
  currentArchetype: string;
  onChange: (archetypeId: string) => void;
}

export function ArchetypeSelector({ dataKey, currentArchetype, onChange }: ArchetypeSelectorProps) {
  const options = ARCHETYPE_COMPATIBILITY[dataKey] ?? [];
  if (options.length <= 1) return null; // 선택지 없으면 숨김

  return (
    <div className="flex gap-2 mb-4">
      <span className="text-sm text-muted-foreground">레이아웃:</span>
      {options.map(opt => (
        <button
          key={opt.id}
          className={cn(
            'px-3 py-1.5 rounded-lg border text-sm transition-all',
            currentArchetype === opt.id
              ? 'border-accent bg-accent/10 text-accent font-medium'
              : 'border-border hover:border-accent/50'
          )}
          onClick={() => onChange(opt.id)}
          title={opt.description}
        >
          {opt.icon} {opt.label}
        </button>
      ))}
    </div>
  );
}
```

### 파이프라인 연쇄 수정

```typescript
// [수정] src/app/api/broker/basic-im-studio/[id]/download/route.ts

// 기존: mergedBody에 slideOverrides만 병합
// 신규: 각 슬라이드의 layoutType도 반영
for (const slide of project.slides.filter(s => !s.hidden)) {
  if (slide.dataKey) {
    mergedBody[slide.dataKey] = {
      ...slide.slideOverrides,
      _archetypeOverride: slide.layoutType, // 덱 시퀀서에 전달
    };
  }
}

// [수정] deck-sequencer.ts
// buildBasicDeckSequence 내에서:
if (data[dataKey]?._archetypeOverride) {
  spec.archetype = data[dataKey]._archetypeOverride;
}
```

---

## 2.2 인라인 텍스트 편집 (F5)

### 현재 상태

- `SlideEditor.tsx`: `<Input>` / `<textarea>` 폼 — SVG 프리뷰와 **분리**된 편집
- `slide-preview-svg.tsx`: `isInlineEditable` prop 존재 + `handleFieldChange` 구현 — **Quick Editor 패널** (프리뷰 하단 폼)
- SVG 위 직접 클릭 편집 **미구현**

### 설계: SVG 오버레이 인라인 에디터

```typescript
// [신규] src/components/broker/im-studio/InlineTextEditor.tsx

import { useState, useRef, useEffect } from 'react';
import { useStudioEditStore } from '@/stores/studio-edit-store';

interface TextRegion {
  fieldPath: string;          // 'title' | 'keyInvestmentPoint' | ...
  svgBounds: {                // SVG 좌표계 (1280×720 기준)
    x: number; y: number;
    w: number; h: number;
  };
  currentValue: string;
  maxLength?: number;
  multiline: boolean;
}

interface InlineTextEditorProps {
  slideId: string;
  regions: TextRegion[];      // SVG 렌더러가 렌더링한 텍스트 영역 목록
  containerRef: React.RefObject<HTMLDivElement>; // SVG 래퍼 DOM
  scale: number;              // SVG → 화면 스케일 팩터
}

export function InlineTextEditor({ slideId, regions, containerRef, scale }: InlineTextEditorProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const { setField } = useStudioEditStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 각 region에 투명 클릭 영역 오버레이
  return (
    <>
      {regions.map(region => (
        <div
          key={region.fieldPath}
          className="absolute cursor-text hover:outline hover:outline-2 hover:outline-accent/30 rounded"
          style={{
            left: region.svgBounds.x * scale,
            top: region.svgBounds.y * scale,
            width: region.svgBounds.w * scale,
            height: region.svgBounds.h * scale,
          }}
          onClick={() => setEditingField(region.fieldPath)}
        >
          {editingField === region.fieldPath && (
            <textarea
              ref={textareaRef}
              className="absolute inset-0 bg-white/90 border-2 border-accent rounded p-1 text-sm resize-none"
              defaultValue={region.currentValue}
              autoFocus
              onBlur={(e) => {
                setField(slideId, region.fieldPath, e.target.value);
                setEditingField(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
                if (e.key === 'Escape') {
                  setEditingField(null);
                }
              }}
            />
          )}
        </div>
      ))}
    </>
  );
}
```

### SVG 렌더러 연쇄 수정

```typescript
// [수정] slide-preview-svg.tsx

// 각 렌더러 함수에서 텍스트 영역 좌표를 수집
const [textRegions, setTextRegions] = useState<TextRegion[]>([]);

// renderA02StatGrid() 내부:
// 기존: <text x={...} y={...}>{value}</text>
// 추가: textRegions.push({ fieldPath: 'askingPrice', svgBounds: { x, y, w, h }, ... })

// 컴포넌트 반환값에 InlineTextEditor 추가:
return (
  <div className="relative" ref={containerRef}>
    <svg viewBox="0 0 1280 720" width={width}>
      {renderActiveArchetype()}
    </svg>
    {isInlineEditable && (
      <InlineTextEditor
        slideId={activeSlide?.id ?? ''}
        regions={textRegions}
        containerRef={containerRef}
        scale={width / 1280}
      />
    )}
  </div>
);
```

---

## 2.3 요소 배치 편집 (F6)

### 현재 상태

- `imlib.ts`: 절대 인치 좌표계 `(x, y, w, h)` — **모든 위치 하드코딩**
- 흐름형 좌표 패턴: `rows()`, `table()` 반환값으로 다음 요소 Y 좌표 체이닝
- `slideOverrides`에 레이아웃 정보 저장 구조 **미정의**

### 설계: 제한된 드래그 배치

> [!IMPORTANT]
> 완전 자유 배치는 PPTX 렌더링 파이프라인의 흐름형 좌표 체이닝과 충돌합니다.
> **제한된 드래그**: 텍스트 블록, 이미지, 콜아웃의 **상대적 오프셋**만 허용합니다.

```typescript
// [신규] src/domain/building/mobile-im/pptx/layout-overrides.ts

export interface ElementLayoutOverride {
  elementId: string;         // 'left_text' | 'right_card' | 'map_image' | 'callout_1' | ...
  offsetX: number;           // 기본 위치 대비 인치 단위 오프셋 (-1.0 ~ 1.0)
  offsetY: number;           // 기본 위치 대비 인치 단위 오프셋 (-1.0 ~ 1.0)
  scaleW?: number;           // 기본 너비 대비 배율 (0.5 ~ 1.5)
  scaleH?: number;           // 기본 높이 대비 배율 (0.5 ~ 1.5)
}

export interface SlideLayoutOverrides {
  elements: ElementLayoutOverride[];
  splitRatio?: number;       // 좌우 분할 비율 (A04: 0.58, A05: 0.636) — 슬라이더로 조정
}
```

### UI: 분할 비율 슬라이더

```
┌────────────────────────────────────────────────────┐
│  A04 비대칭 레이아웃 조정                            │
│                                                    │
│  좌:우 비율: [42% ────●──── 58%]  ← 드래그 슬라이더 │
│                                                    │
│  ┌──────────────────┬──────────────┐              │
│  │     좌측 텍스트    │   우측 카드    │              │
│  │   (투자 포인트)    │  (핵심 수치)   │              │
│  └──────────────────┴──────────────┘              │
│                                                    │
│  요소별 미세 조정:                                   │
│  • 콜아웃 위치: Y [+0.1" ▲▼]                        │
│  • 테이블 행 높이: [0.50" ▲▼]                       │
└────────────────────────────────────────────────────┘
```

---

## 2.3 카카오맵 WYSIWYG 편집 (F3)

### 현재 상태

- `kakao-map-api.ts`의 `fetchLocationPoi()`: 반경 2km POI 자동 수집 → `LocationPoiData` 반환
  - `keySpots`: 최대 5개 (지하철 max 2 + 비지하철 min 3)
  - `poiCounts`: 6개 카테고리별 개수
- `image-optimizer.ts`의 `generateStaticMapPlaceholder()`: Sharp 멀티레이어 합성
  - Layer 1: 도보 5분 반경 원
  - Layer 2: POI 마커 + 라벨 (카테고리별 색상)
  - Layer 3: 본건 골드 핀
- `kakao-static-map.tsx` (웹 뷰어): OpenStreetMap 타일 그리드 — **Kakao JS SDK 미사용**
- 브로커가 POI를 편집할 수 있는 기능 **없음**

### 설계: 인터랙티브 지도 편집기

```bash
npm install react-kakao-maps-sdk
```

```typescript
// [신규] src/components/broker/im-studio/MapEditor.tsx

import { Map, MapMarker, CustomOverlayMap, Circle } from 'react-kakao-maps-sdk';

export interface EditablePoi {
  id: string;
  name: string;
  category: 'subway' | 'landmark' | 'hospital' | 'university' | 'shopping' | 'public' | 'custom';
  lat: number;
  lng: number;
  distanceM: number;
  visible: boolean;
  labelOverride?: string;
  iconColor: string;        // 카테고리별 기본색 또는 커스텀
}

interface MapEditorProps {
  center: { lat: number; lng: number };
  buildingName: string;
  initialPois: EditablePoi[];     // fetchLocationPoi()에서 가져온 초기 POI
  walkRadiusM: number;            // 기본 400m
  onSave: (config: MapEditorConfig) => void;
}

interface MapEditorConfig {
  pois: EditablePoi[];
  zoomLevel: number;              // 3~6
  walkRadiusM: number;
  showWalkRadius: boolean;
  customMarkers: CustomMarker[];  // 브로커가 직접 추가한 마커
}

export function MapEditor({ center, buildingName, initialPois, walkRadiusM, onSave }: MapEditorProps) {
  const [pois, setPois] = useState<EditablePoi[]>(initialPois);
  const [zoomLevel, setZoomLevel] = useState(3);
  const [showRadius, setShowRadius] = useState(true);
  const [editingPoi, setEditingPoi] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4 h-[500px]">
      {/* 좌측: 인터랙티브 카카오맵 */}
      <div className="relative rounded-lg overflow-hidden border">
        <Map
          center={{ lat: center.lat, lng: center.lng }}
          level={zoomLevel}
          style={{ width: '100%', height: '100%' }}
          onClick={(_, mouseEvent) => {
            // 빈 공간 클릭 시 커스텀 마커 추가 모드
          }}
        >
          {/* 본건 골드 마커 (이동 불가) */}
          <MapMarker
            position={{ lat: center.lat, lng: center.lng }}
            image={{ src: '/icons/gold-pin.svg', size: { width: 40, height: 42 } }}
          />

          {/* 도보 5분 반경 원 */}
          {showRadius && (
            <Circle
              center={{ lat: center.lat, lng: center.lng }}
              radius={walkRadiusM}
              strokeColor="#B8860B"
              strokeWeight={2}
              strokeStyle="dash"
              fillColor="#B8860B"
              fillOpacity={0.05}
            />
          )}

          {/* POI 마커 (표시/숨김 토글, 드래그 가능, 클릭 시 편집) */}
          {pois.filter(p => p.visible).map(poi => (
            <CustomOverlayMap
              key={poi.id}
              position={{ lat: poi.lat, lng: poi.lng }}
            >
              <div
                className="px-2 py-1 rounded-full text-xs font-medium text-white shadow cursor-pointer"
                style={{ backgroundColor: poi.iconColor }}
                onClick={() => setEditingPoi(poi.id)}
              >
                {poi.labelOverride || poi.name} ({poi.distanceM}m)
              </div>
            </CustomOverlayMap>
          ))}
        </Map>
      </div>

      {/* 우측: POI 관리 패널 */}
      <div className="space-y-2 overflow-y-auto">
        <h4 className="font-medium text-sm">POI 관리</h4>

        {pois.map(poi => (
          <div key={poi.id} className="flex items-center gap-2 p-2 rounded border">
            <input
              type="checkbox"
              checked={poi.visible}
              onChange={() => togglePoiVisibility(poi.id)}
            />
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: poi.iconColor }} />
            <span className="text-sm flex-1 truncate">
              {poi.labelOverride || poi.name}
            </span>
            <span className="text-xs text-muted-foreground">{poi.distanceM}m</span>
            <button onClick={() => setEditingPoi(poi.id)} className="text-xs text-accent">
              편집
            </button>
          </div>
        ))}

        <button
          className="w-full py-2 border border-dashed rounded text-sm text-muted-foreground hover:border-accent"
          onClick={() => {/* 커스텀 마커 추가 모드 활성화 */}}
        >
          + 커스텀 랜드마크 추가
        </button>

        <div className="pt-3 space-y-2 border-t">
          <label className="text-xs text-muted-foreground">줌 레벨</label>
          <input
            type="range" min={1} max={6} value={zoomLevel}
            onChange={e => setZoomLevel(Number(e.target.value))}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showRadius} onChange={e => setShowRadius(e.target.checked)} />
            도보 5분 반경 표시
          </label>
        </div>

        <button
          className="w-full py-2 bg-accent text-white rounded text-sm font-medium"
          onClick={() => onSave({ pois, zoomLevel, walkRadiusM, showWalkRadius: showRadius, customMarkers: [] })}
        >
          지도 설정 저장
        </button>
      </div>
    </div>
  );
}
```

### PPTX 렌더링 연쇄

```typescript
// [수정] image-optimizer.ts — generateStaticMapPlaceholder 확장

// 기존: poiSpots (자동 수집)만 받음
// 신규: mapConfig (MapEditorConfig) 전달 시 커스텀 POI로 교체
export async function generateStaticMapPlaceholder(
  area: string, w: number, h: number,
  coords: { lat: number; lng: number },
  poiSpots: MapPoiSpot[],
  mapConfig?: MapEditorConfig  // 신규: Studio에서 편집한 지도 설정
): Promise<Buffer | null> {
  // mapConfig 존재 시:
  // - poiSpots를 mapConfig.pois (visible만 필터)로 교체
  // - zoomLevel을 mapConfig.zoomLevel로 적용
  // - walkRadiusM을 mapConfig.walkRadiusM으로 적용
  // - 커스텀 마커 추가 렌더링
}
```

---

## 2.4 AI 텍스트 생성/교체 (F4 + F17)

### 현재 상태

- `data-binder.ts`: LLM 호출 경로 존재 (`callLLM()`)
- `llm-client.ts`: OpenAI 호환 멀티 프로바이더 (retry, rate-limit, fallback 구현)
- 브로커가 텍스트 생성을 **제어**하는 UI 없음

### 설계: SSE 스트리밍 AI 텍스트 생성

```typescript
// [신규] src/app/api/broker/im-studio/generate-text/route.ts

import { callLLM } from '@/lib/external/llm-client';

export async function POST(req: Request) {
  const { buildingId, sections, tone, lengthPreference, contextData } = await req.json();

  // SSE 스트리밍 응답
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const section of sections) {
        const prompt = buildPrompt(section, tone, lengthPreference, contextData);
        const result = await callLLM({
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
          stream: true,
        });

        // 섹션 시작 마커
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ section, type: 'start' })}\n\n`));

        for await (const chunk of result) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ section, type: 'chunk', text: chunk })}\n\n`));
        }

        // 섹션 완료 마커
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ section, type: 'done' })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

function buildPrompt(section: string, tone: string, length: string, context: Record<string, any>): string {
  const toneMap = {
    conservative: '리스크 요인을 강조하고 보수적 관점에서',
    balanced: '기회와 리스크를 균형있게',
    aggressive: '투자 기회를 적극적으로 강조하며',
  };

  return `
당신은 CRE(상업용 부동산) 투자 분석 전문가입니다.
아래 매물 데이터를 기반으로 "${section}" 섹션의 텍스트를 작성하세요.

톤: ${toneMap[tone]}
길이: ${length === 'concise' ? '3문장 이내' : length === 'detailed' ? '8~10문장' : '5~6문장'}

매물 데이터:
${JSON.stringify(context, null, 2)}

주의사항:
- "기관 투자자"라는 표현을 사용하지 마세요 (Rule 1)
- 합성 데이터나 가짜 수치를 생성하지 마세요 (Rule 34)
- 입력된 수치만 활용하세요
  `.trim();
}
```

### UI: AI 텍스트 생성 패널

```typescript
// [신규] src/components/broker/im-studio/AiTextGenerator.tsx

// SlideEditor 내부에 통합되는 AI 생성 섹션
// 각 텍스트 필드 옆에 ✨ 버튼 → 클릭 시 해당 필드 AI 생성
// 톤 선택기 (보수/균형/적극) — 라디오 버튼
// 길이 슬라이더 (간결 ↔ 상세)
// 생성 중: 타이핑 애니메이션 (SSE 스트리밍)
// 생성 완료: [적용] [재생성] [취소] 버튼
```

---

## 2.5 갤러리 큐레이션 (F12)

### 현재 상태

- `photo-gallery.tsx`: 6장 자동 슬라이스 (`photos.slice(0, 6)`)
- `a14-gallery.ts`: `gallerySpecs` 기반 6장 그리드 레이아웃
- 사진 선택/순서 변경 UI **없음**

### 설계

```typescript
// [신규] src/components/broker/im-studio/GalleryCurator.tsx

interface GalleryCuratorProps {
  allPhotos: Photo[];         // Supabase에서 로드된 전체 사진 목록
  selectedPhotoIds: string[]; // 현재 선택된 6장 ID (순서 유지)
  onChange: (selectedIds: string[]) => void;
}

// 2단 구성:
// 상단: 선택된 사진 6장 (드래그 순서 변경)
// 하단: 미선택 사진 목록 (클릭하여 상단으로 이동)
// 제한: 최대 6장
// 드래그: @dnd-kit/sortable
```

---

## Phase 2 파일 변경 요약

| 유형 | 파일 | 변경 |
|:---:|:---|:---|
| 🆕 | `archetype-compatibility.ts` | dataKey → Archetype[] 호환 매핑 |
| 🆕 | `ArchetypeSelector.tsx` | 레이아웃 선택 버튼 그룹 |
| 🆕 | `InlineTextEditor.tsx` | SVG 오버레이 인라인 편집 |
| 🆕 | `layout-overrides.ts` | ElementLayoutOverride 타입 |
| 🆕 | `MapEditor.tsx` | 카카오맵 WYSIWYG 편집기 |
| 🆕 | `AiTextGenerator.tsx` | SSE AI 텍스트 생성 UI |
| 🆕 | `generate-text/route.ts` | AI 텍스트 생성 API |
| 🆕 | `GalleryCurator.tsx` | 사진 선택/순서 큐레이터 |
| 📝 | `slide-preview-svg.tsx` | textRegions 수집 + InlineTextEditor 통합 |
| 📝 | `SlideEditor.tsx` | ArchetypeSelector + AiTextGenerator 통합 |
| 📝 | `image-optimizer.ts` | mapConfig 파라미터 추가 |
| 📝 | `deck-sequencer.ts` | _archetypeOverride 지원 |
| 📝 | `basic-im-studio/[id]/download/route.ts` | layoutType 병합 |
| 📦 | `package.json` | `react-kakao-maps-sdk`, `@dnd-kit/core`, `@dnd-kit/sortable` |

---

## Phase 2 검증 계획

| 검증 항목 | 방법 |
|:---|:---|
| Archetype 전환 | building dataKey에서 A04 → A08 변경 → SVG 프리뷰 즉시 반영 → PPTX 다운로드에서 듀얼 테이블 확인 |
| 인라인 텍스트 | SVG 위 텍스트 클릭 → textarea 활성화 → 입력 → blur → Zustand 저장 → 프리뷰 반영 |
| 지도 편집 | POI 토글 → PPTX 다운로드 → Sharp 합성 이미지에서 해당 POI 표시/숨김 확인 |
| AI 텍스트 | ✨ 버튼 클릭 → SSE 스트리밍 → 타이핑 애니메이션 → [적용] → slideOverrides 저장 |
| 갤러리 | 사진 드래그 순서 변경 → PPTX A14 슬라이드에서 순서 일치 확인 |
