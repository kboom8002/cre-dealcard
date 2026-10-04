/**
 * @file pptx-geometry-audit.ts
 * @description PPTX 슬라이드 XML 기하 감사 (Hardening H3) — PowerPoint/LibreOffice 없이 실행되는 순수 TS 검사기.
 *
 * - OUT_OF_BOUNDS : 도형이 슬라이드 경계를 벗어남 (error)
 * - TEXT_OVERFLOW : 글자 수/폰트 크기로 추정한 필요 높이가 상자 높이를 크게 초과 (warn)
 * - TEXT_OVERLAP  : 텍스트가 든 두 도형이 크게 겹침 (warn)
 *
 * 텍스트 오버플로 추정은 휴리스틱(한글/CJK 전각 = 1.0em, 라틴/숫자 = 0.55em, 줄간격 1.2)이므로 warn 으로만 보고한다.
 * 정확한 판정은 렌더 PNG 시각 회귀(image-diff)와 함께 사용한다.
 */
import JSZip from 'jszip';

export type GeometryViolationId = 'OUT_OF_BOUNDS' | 'TEXT_OVERFLOW' | 'TEXT_OVERLAP';

export interface GeometryViolation {
  id: GeometryViolationId;
  severity: 'error' | 'warn';
  /** 슬라이드 번호 (1부터) */
  slide: number;
  sample: string;
}

interface Shape {
  kind: 'sp' | 'pic' | 'graphicFrame';
  x: number; y: number; w: number; h: number; // EMU
  text: string;
  paragraphs: string[];
  /** 0 = 폰트 크기 미지정(상속) → 오버플로 추정 제외 */
  fontPt: number;
  insetX: number; insetY: number;
  name: string;
}

const EMU_PER_PT = 12700;
const DEFAULT_INSET_X = 91440; // 0.1in
const DEFAULT_INSET_Y = 45720; // 0.05in

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function parseShapes(slideXml: string): Shape[] {
  const shapes: Shape[] = [];
  const re = /<p:(sp|pic|graphicFrame)\b[\s\S]*?<\/p:\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slideXml))) {
    const block = m[0];
    const kind = m[1] as Shape['kind'];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/.exec(block);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(block);
    if (!off || !ext) continue;
    const name = /<p:cNvPr[^>]*\bname="([^"]*)"/.exec(block)?.[1] ?? kind;
    const paragraphs = [...block.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
      .map(p => [...p[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(t => decode(t[1])).join(''))
      .filter(t => t.length > 0);
    const sz = /<a:rPr[^>]*\bsz="(\d+)"/.exec(block)?.[1];
    const lIns = /<a:bodyPr[^>]*\blIns="(\d+)"/.exec(block)?.[1];
    const tIns = /<a:bodyPr[^>]*\btIns="(\d+)"/.exec(block)?.[1];
    shapes.push({
      kind,
      x: +off[1], y: +off[2], w: +ext[1], h: +ext[2],
      text: paragraphs.join(''),
      paragraphs,
      fontPt: sz ? +sz / 100 : 0,
      insetX: lIns !== undefined ? +lIns : DEFAULT_INSET_X,
      insetY: tIns !== undefined ? +tIns : DEFAULT_INSET_Y,
      name,
    });
  }
  return shapes;
}

/** 전각(한글/CJK/전각 기호) 1.0em, 그 외 0.55em 으로 한 줄 글자 폭(pt) 추정 */
export function estimateTextWidthPt(text: string, fontPt: number): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const wide = (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f) || (c >= 0xac00 && c <= 0xd7af)
      || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef);
    w += (wide ? 1.0 : ch === ' ' ? 0.3 : 0.55) * fontPt;
  }
  return w;
}

/** 텍스트 상자에 필요한 높이(EMU) 추정 (문단 단위 줄바꿈 + 줄간격 1.2) */
export function estimateRequiredHeightEmu(paragraphs: string[], fontPt: number, boxWidthEmu: number, insetX: number): number {
  const innerPt = Math.max(1, (boxWidthEmu - 2 * insetX) / EMU_PER_PT);
  let lines = 0;
  for (const p of paragraphs) {
    const wPt = estimateTextWidthPt(p, fontPt);
    lines += Math.max(1, Math.ceil(wPt / innerPt));
  }
  return lines * fontPt * 1.2 * EMU_PER_PT;
}

function overlapArea(a: Shape, b: Shape): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export interface GeometryAuditOptions {
  /** 경계 허용 오차 (슬라이드 크기 대비 비율). 기본 0.5% */
  boundsTolerance?: number;
  /** 텍스트 오버플로 판정 배율 (필요 높이 / 상자 높이). 기본 2.0 (소형 라벨 상자는 시각적으로 넘쳐도 무해 → 큰 초과만 보고) */
  overflowRatio?: number;
  /** 텍스트 겹침 판정 (겹침 면적 / 작은 도형 면적). 기본 0.35 */
  overlapRatio?: number;
}

export function auditSlideXml(
  slideXml: string,
  slideNo: number,
  slideW: number,
  slideH: number,
  opts: GeometryAuditOptions = {},
): GeometryViolation[] {
  const tolB = opts.boundsTolerance ?? 0.005;
  const overflowRatio = opts.overflowRatio ?? 2.0;
  const overlapRatio = opts.overlapRatio ?? 0.35;
  const out: GeometryViolation[] = [];
  const shapes = parseShapes(slideXml);

  for (const s of shapes) {
    const label = `${s.name}${s.text ? ` "${s.text.slice(0, 24)}"` : ''}`;
    if (
      s.x < -slideW * tolB || s.y < -slideH * tolB ||
      s.x + s.w > slideW * (1 + tolB) || s.y + s.h > slideH * (1 + tolB)
    ) {
      out.push({ id: 'OUT_OF_BOUNDS', severity: 'error', slide: slideNo, sample: label });
    }
  }

  for (const s of shapes) {
    if (s.kind !== 'sp' || !s.text.trim() || s.h <= 0 || s.fontPt <= 0) continue; // 폰트 상속(미지정)은 추정 불가 → 제외
    const need = estimateRequiredHeightEmu(s.paragraphs, s.fontPt, s.w, s.insetX) + 2 * s.insetY;
    if (need > s.h * overflowRatio) {
      out.push({
        id: 'TEXT_OVERFLOW', severity: 'warn', slide: slideNo,
        sample: `${s.name} "${s.text.slice(0, 24)}" need≈${Math.round(need / EMU_PER_PT)}pt > box ${Math.round(s.h / EMU_PER_PT)}pt`,
      });
    }
  }

  const texty = shapes.filter(s => s.kind === 'sp' && s.text.trim().length > 0);
  for (let i = 0; i < texty.length; i++) {
    for (let j = i + 1; j < texty.length; j++) {
      const a = texty[i], b = texty[j];
      const ov = overlapArea(a, b);
      if (ov <= 0) continue;
      const small = Math.min(a.w * a.h, b.w * b.h);
      if (small > 0 && ov / small > overlapRatio) {
        out.push({ id: 'TEXT_OVERLAP', severity: 'warn', slide: slideNo, sample: `"${a.text.slice(0, 16)}" × "${b.text.slice(0, 16)}"` });
      }
    }
  }
  return out;
}

export async function auditPptxGeometry(buffer: Buffer | Uint8Array, opts: GeometryAuditOptions = {}): Promise<GeometryViolation[]> {
  const zip = await JSZip.loadAsync(buffer);
  const pres = await zip.files['ppt/presentation.xml']?.async('string');
  const sz = pres ? /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(pres) : null;
  const slideW = sz ? +sz[1] : 12192000;
  const slideH = sz ? +sz[2] : 6858000;
  const names = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/(\d+)/)![1], 10) - parseInt(b.match(/(\d+)/)![1], 10));
  const out: GeometryViolation[] = [];
  for (let i = 0; i < names.length; i++) {
    out.push(...auditSlideXml(await zip.files[names[i]].async('string'), i + 1, slideW, slideH, opts));
  }
  return out;
}
