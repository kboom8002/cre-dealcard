/**
 * @file pptx-invariant-audit.ts
 * @description 렌더된 PPTX 버퍼에 H1 출력 불변식을 적용하는 런타임 감사기.
 * 경고 모드(Warn-only): 렌더를 차단하지 않고 위반을 반환/로깅한다. (D3: 2주간 관측 후 차단 전환 검토)
 */
import JSZip from 'jszip';
import {
  checkOutputInvariants, extractSlideXmlText, type InvariantViolation,
} from './output-invariants';

export interface PptxInvariantAudit {
  slideCount: number;
  violations: InvariantViolation[];
}

export async function auditPptxBufferInvariants(buffer: Buffer | Uint8Array): Promise<PptxInvariantAudit> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/(\d+)/)![1], 10) - parseInt(b.match(/(\d+)/)![1], 10));
  const texts: string[] = [];
  for (const n of names) {
    const xml = await zip.files[n].async('string');
    texts.push(extractSlideXmlText(xml));
  }
  return { slideCount: texts.length, violations: checkOutputInvariants(texts) };
}
