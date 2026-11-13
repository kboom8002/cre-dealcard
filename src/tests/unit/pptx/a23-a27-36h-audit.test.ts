/**
 * @file src/tests/unit/pptx/a23-a27-36h-audit.test.ts
 * @description Node-environment OOXML verification for Track C ([C-3] A27 conditional parcel polygon badge)
 *              and Track D ([D-2] A23 Slide 07 Option 1 items 1,2,3 ONLY + enlarged bottom bar + NO LTV table).
 */

import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { embedMapMarkerMeta } from '@/lib/external/map-overlay-meta';
import { buildA27LandUsePlan } from '@/domain/building/mobile-im/pptx/archetypes/a27-land-use-plan';
import { buildA23YieldFormula } from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';

async function renderSlideToXml(buildFn: (pres: any) => Promise<void> | void): Promise<string> {
  const pres = new pptxgen();
  await buildFn(pres);
  const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = new AdmZip(buffer);
  return (
    zip
      .getEntries()
      .find((e) => e.entryName.includes('slide1.xml'))
      ?.getData()
      .toString('utf-8') || ''
  );
}

describe('PPTX 36h Audit Remediation: A27 Cadastral Badge & A23 Option 1 (1,2,3) ONLY', () => {
  it("[C-3] buildA27LandUsePlan omits '본건 필지 경계' when hasPolygon=false and renders it when hasPolygon=true", async () => {
    const basePng = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 4,
        background: { r: 245, g: 245, b: 245, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const pngNoPoly = embedMapMarkerMeta(basePng, {
      v: 1,
      target: { x: 0.5, y: 0.5 },
      imgW: 400,
      imgH: 300,
      hasPolygon: false,
    });
    const pngWithPoly = embedMapMarkerMeta(basePng, {
      v: 1,
      target: { x: 0.5, y: 0.5 },
      imgW: 400,
      imgH: 300,
      hasPolygon: true,
    });

    const makeInputData = (imgBuf: Buffer) => ({
      ssot: {
        address: '서울특별시 마포구 동교동 147-8',
        land_area_sqm: 137.2,
        zoning: '제2종일반주거지역',
        official_land_price_per_sqm: 14_200_000,
      },
      cadastralImage: `data:image/png;base64,${imgBuf.toString('base64')}`,
    });

    const xmlNoPoly = await renderSlideToXml(async (pres) => {
      await buildA27LandUsePlan({
        pres,
        slideNum: 5,
        docno: 'IM-TEST',
        data: makeInputData(pngNoPoly),
        grade: 'A',
        provenance: {},
      });
    });
    expect(xmlNoPoly).not.toContain('본건 필지 경계');
    expect(xmlNoPoly).toContain('제2종일반주거지역');

    const xmlWithPoly = await renderSlideToXml(async (pres) => {
      await buildA27LandUsePlan({
        pres,
        slideNum: 5,
        docno: 'IM-TEST',
        data: makeInputData(pngWithPoly),
        grade: 'A',
        provenance: {},
      });
    });
    expect(xmlWithPoly).toContain('본건 필지 경계');
  });

  it('[D-2] buildA23YieldFormula renders Option 1 (1,2,3) ONLY, enlarged bottom band, and ZERO LTV/자기자본 table', async () => {
    const xml = await renderSlideToXml((pres) => {
      buildA23YieldFormula({
        pres,
        slideNum: 7,
        docno: 'IM-TEST',
        data: {
          annualRent: 240_000_000,
          totalDeposit: 260_000_000,
          askingPrice: 7_700_000_000,
          capRateAsIs: 3.2,
          landAreaSqm: 137.2,
          officialLandPricePerSqm: 14_200_000,
          address: '서울특별시 마포구 동교동 147-8',
          landPriceHistory: {
            history: [
              { year: '2020', pricePerSqm: 10_500_000 },
              { year: '2021', pricePerSqm: 11_800_000 },
              { year: '2022', pricePerSqm: 12_900_000 },
              { year: '2023', pricePerSqm: 13_400_000 },
              { year: '2024', pricePerSqm: 14_200_000 },
            ],
            latestPricePerSqm: 14_200_000,
            cagrPct: 7.8,
            totalGrowthPct: 35.2,
          },
        },
        grade: 'A',
        provenance: {},
      });
    });

    // Must contain Option 1 items 1, 2, 3 exact Right Card strings
    expect(xml).toContain('국토교통부 공시지가');
    expect(xml).toContain('대지 평당 매매가');
    expect(xml).toContain('평당 개별공시지가');
    expect(xml).toContain('공시지가 대비 배율 · 비중');
    expect(xml).toContain('본건 공시지가 5년 연평균(CAGR)');

    // Enlarged bottom bar font sizes (>= 18pt => OOXML sz >= 1800)
    const largeSizes = [...xml.matchAll(/sz="(\d+)"/g)]
      .map((m) => Number(m[1]))
      .filter((s) => s >= 1800);
    expect(largeSizes.length).toBeGreaterThan(0);

    // Strict negative assertion (User Instruction 4-3): MUST NOT contain LTV / 실투자자 자기자본 수지 요약표
    expect(xml).not.toContain('LTV');
    expect(xml).not.toContain('자기자본');
    expect(xml).not.toContain('수지 요약');
  });
});
