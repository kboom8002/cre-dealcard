import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, W, H, col, colX, KR, NUM, CD } from '../imlib';
import type { ProvenanceKind } from '../imlib';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
}

export interface ArchetypeOutput {
  slide: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
}

export function buildA11RoomSpec(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const subText = input.data.sub ?? input.data.leftSub ?? '';
  if (subText) L.sub(slide, M, 1.66, 7.10, subText);
  let tableEnd = 1.98;
  if (input.data.roomTypes && input.data.roomTypes.length > 0) {
    const colCount = input.data.roomTypes[0].length || 1;
    const colW = Array(colCount).fill(7.10 / colCount);
    const headRow = input.data.roomTypes[0].map((c: any) => String(c?.text ?? c ?? ''));
    const bodyRows = input.data.roomTypes.slice(1);
    tableEnd = L.table(slide, M, 1.98, 7.10, headRow, bodyRows, colW, { rh: 0.33, bfs: 10, hfs: 10 });
  }
  if (input.data.note) L.note(slide, M, tableEnd + 0.07, 7.10, input.data.note);
  
  const rx = 8.08;
  const rw = 4.63;
  // stats (D38: 유령 사각형 방지 — 라벨 및 수치 텍스트 바인딩)
  const stats = input.data.stats || [
    { label: '총 객실 수', value: input.data.totalRooms ?? '28', unit: '실' },
    { label: '평균 전용면적', value: input.data.avgRoomArea ?? '7.2', unit: '평' },
    { label: '평균 가동률(OCC)', value: input.data.occupancyRate ?? '88.5', unit: '%' },
    { label: '객실당 단가(ADR)', value: input.data.adr ?? '14.5', unit: '만원' },
  ];
  const statPos = [
    { x: rx, y: 1.98, w: 2.24, h: 1.06 },
    { x: rx + 2.24 + 0.15, y: 1.98, w: 2.24, h: 1.06 },
    { x: rx, y: 1.98 + 1.06 + 0.15, w: 2.24, h: 1.06 },
    { x: rx + 2.24 + 0.15, y: 1.98 + 1.06 + 0.15, w: 2.24, h: 1.06 },
  ];
  stats.slice(0, 4).forEach((st: any, i: number) => {
    const pos = statPos[i];
    slide.addShape('rect' as any, { x: pos.x, y: pos.y, w: pos.w, h: pos.h, fill: { color: C.tint }, line: { color: C.brassL, width: 0.5 } });
    slide.addText(st.label, { x: pos.x + 0.1, y: pos.y + 0.12, w: pos.w - 0.2, h: 0.25, fontFace: KR, fontSize: 9.5, color: C.mute, bold: true });
    slide.addText(`${st.value}${st.unit ? ' ' + st.unit : ''}`, { x: pos.x + 0.1, y: pos.y + 0.42, w: pos.w - 0.2, h: 0.45, fontFace: NUM, fontSize: 15, bold: true, color: C.brassD });
  });
  
  if (input.data.violationNote) {
    slide.addShape('rect' as any, { x: rx, y: 4.40, w: rw, h: 1.80, fill: { color: C.redL } });
    slide.addText(input.data.violationNote, { x: rx + 0.2, y: 4.55, w: rw - 0.4, h: 1.5, fontFace: KR, fontSize: 10.5, color: C.ink });
  } else {
    L.callout(slide, rx, 4.40, rw, 2.0, 'info', '운영사 및 룸 타입 구성 특징',
      input.data.calloutBody || '• 전 객실 독립 배관 및 개별 냉난방 완비로 쾌적한 주거/숙박 환경 제공\n• 1층 F&B 및 커뮤니티 라운지 연계를 통한 부가 수익 극대화 구조\n• 장단기 투숙객 비율 최적화(7:3)를 통한 비수기 하방 경직성 확보');
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
