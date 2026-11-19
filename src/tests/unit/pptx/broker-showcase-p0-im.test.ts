/**
 * @file src/tests/unit/pptx/broker-showcase-p0-im.test.ts
 * @description 중개인 쇼룸 P0 개선 회귀 검증 (Basic IM Slide 03 사진 풀확장, Slide 07 소수연도 차트 간격, Slide 09 클로징)
 */
import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { buildA04Asymmetric75 } from '@/domain/building/mobile-im/pptx/archetypes/a04-asymmetric-7-5';
import {
  buildA23YieldFormula,
  computeHorizontalBarLayout,
} from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';
import { buildA10Closing } from '@/domain/building/mobile-im/pptx/archetypes/a10-closing';

async function renderSlideToXml(buildFn: (pres: pptxgen) => Promise<void> | void): Promise<string> {
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

describe('Broker Showcase Wave P0 — Basic IM PPTX Remediation', () => {
  it('Slide 03 (A04): suppresses 자산 하이라이트 box and expands exterior photo when suppressAssetHighlight=true', async () => {
    const samplePhoto = await sharp({
      create: {
        width: 800,
        height: 1000,
        channels: 3,
        background: { r: 220, g: 225, b: 230 },
      },
    })
      .jpeg()
      .toBuffer();
    const photoDataUrl = `data:image/jpeg;base64,${samplePhoto.toString('base64')}`;

    const commonData = {
      kicker: 'PROPERTY OVERVIEW',
      title: '물건 개요',
      left: {
        sub: '건축물 개요 및 물리 스펙',
        rows: [
          ['소재지', '서울특별시 마포구 동교동 189-6'],
          ['대지면적', '137.2㎡ (41.5평)'],
          ['연면적', '426.11㎡ (128.9평)'],
        ],
      },
      photoUrl: photoDataUrl,
      assetHighlights: ['경의선숲길 공원 직면 코너 입지', '전층 100% 만실 안정 현금흐름'],
      priceTable: { label: '매매 희망가', value: '77억 원 (VAT 별도)' },
    };

    const xmlWithHighlight = await renderSlideToXml(async (pres) => {
      await buildA04Asymmetric75({
        pres,
        slideNum: 3,
        docno: 'IM-TEST',
        data: { ...commonData, suppressAssetHighlight: false },
        grade: 'A',
        provenance: {},
      });
    });
    expect(xmlWithHighlight).toContain('자산 하이라이트');

    const xmlSuppressed = await renderSlideToXml(async (pres) => {
      await buildA04Asymmetric75({
        pres,
        slideNum: 3,
        docno: 'IM-TEST',
        data: { ...commonData, suppressAssetHighlight: true },
        grade: 'A',
        provenance: {},
      });
    });
    expect(xmlSuppressed).not.toContain('자산 하이라이트');
    expect(xmlSuppressed).not.toContain('경의선숲길 공원 직면 코너 입지');

    const picExtWith = xmlWithHighlight.match(/<p:pic>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    const picExtSuppressed = xmlSuppressed.match(/<p:pic>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    expect(picExtWith).not.toBeNull();
    expect(picExtSuppressed).not.toBeNull();
    expect(Number(picExtSuppressed![2])).toBeGreaterThan(Number(picExtWith![2]));
  });

  it('Slide 07 (A23): computeHorizontalBarLayout spreads 4-year bars cleanly without cramping', async () => {
    const layout4 = computeHorizontalBarLayout(4, 3.11, 1.75);
    expect(layout4.rowPitch).toBeGreaterThanOrEqual(0.4);
    expect(layout4.rowPitch - layout4.visualBarH).toBeGreaterThanOrEqual(0.18);
    expect(layout4.startY + layout4.rowPitch * 4).toBeLessThanOrEqual(3.11 + 1.75 + 1e-6);

    const xml = await renderSlideToXml((pres) => {
      buildA23YieldFormula({
        pres,
        slideNum: 7,
        docno: 'IM-03',
        data: {
          annualRent: 0,
          totalDeposit: 0,
          askingPrice: 5_200_000_000,
          capRateAsIs: 0,
          landAreaSqm: 380,
          officialLandPricePerSqm: 4_503_000,
          address: '경기도 부천시 원미구 심곡동 385',
          landPriceHistory: {
            history: [
              { year: '2023', pricePerSqm: 4_083_000 },
              { year: '2024', pricePerSqm: 4_199_000 },
              { year: '2025', pricePerSqm: 4_329_000 },
              { year: '2026', pricePerSqm: 4_503_000 },
            ],
            latestPricePerSqm: 4_503_000,
            cagrPct: 3.3,
            totalGrowthPct: 10.3,
          },
        },
        grade: 'A',
        provenance: {},
      });
    });

    expect(xml).toContain('2023');
    expect(xml).toContain('2026');
    expect(xml).toContain('4,503,000원');
  });

  it('Slide 09 (A10): keeps workflow + broker contact + 1-line disclaimer notice and omits provenance table & heavy disclaimer card', async () => {
    const xml = await renderSlideToXml(async (pres) => {
      await buildA10Closing({
        pres,
        slideNum: 9,
        docno: 'IM-TEST',
        data: {
          kicker: 'CONTACT',
          title: '문의 및 유의사항',
          closingLine: '방문 답사 및 임대차계약서 열람은 사전 예약을 통해 즉시 안내해 드립니다.',
          badges: [
            { label: '공부확인', description: '건축물대장 및 등기부등본' },
            { label: 'AI추정·가정', description: '공실 해소 가정치' },
          ],
          brokerContact: {
            name: '홍매니저',
            title: '공인중개사',
            phone: '010-1234-5678',
            email: 'broker@example.com',
            company: '예시부동산중개법인',
            registrationNo: '11560-2026-00099',
            officeAddress: '서울시 강남구 테헤란로 200',
          },
        },
        grade: 'A',
        provenance: {},
      });
    });

    expect(xml).toContain('관심 표명');
    expect(xml).toContain('NDA 체결');
    expect(xml).toContain('현장 실사');
    expect(xml).toContain('담당 중개사');
    expect(xml).toContain('홍매니저');
    expect(xml).toContain('010-1234-5678');
    expect(xml).toContain('면책 안내');

    expect(xml).not.toContain('데이터 출처 표기');
    expect(xml).not.toContain('AI추정·가정');
    expect(xml).not.toContain('● 중개인입력');
    expect(xml).not.toContain('면책 조항');
  });
});
