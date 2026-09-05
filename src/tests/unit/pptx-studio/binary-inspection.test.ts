import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { inspectPptxBinary } from '@/assurance/im-harness/observers/pptx-binary-observer';

describe('PPTX Physical Binary Inspection (PR-B3-03 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Clean PPTX XML within canvas bounds passes physical inspection', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:spPr>
                <a:xfrm>
                  <a:off x="1000000" y="500000"/>
                  <a:ext cx="5000000" cy="2000000"/>
                </a:xfrm>
              </p:spPr>
              <p:txBody>
                <a:p><a:r><a:t>투자 제안서</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>`
    );

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectPptxBinary(buffer);

    expect(result.isPass).toBe(true);
    expect(result.placeholderResidueCount).toBe(0);
    expect(result.bleedCount).toBe(0);
    expect(result.slideCount).toBe(1);
  });

  it('Negative Pair: Slide with unreplaced placeholder tokens or canvas bleed is detected and failed', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:spPr>
                <a:xfrm>
                  <a:off x="12000000" y="500000"/>
                  <a:ext cx="3000000" cy="2000000"/>
                </a:xfrm>
              </p:spPr>
              <p:txBody>
                <a:p><a:r><a:t>매매가: {{claim.unbound_price}}</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>`
    );

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await inspectPptxBinary(buffer);

    expect(result.isPass).toBe(false);
    expect(result.placeholderResidueCount).toBeGreaterThan(0);
    expect(result.bleedCount).toBeGreaterThan(0);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});
