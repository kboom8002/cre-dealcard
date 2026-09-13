import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { MobileImPptxRenderer } from '../../domain/building/mobile-im/pptx/pptx-renderer';

describe('Basic IM SOTA Render Verification Test', () => {
  it('renders Basic IM with Kakao Map location slide, 6 stat cards, SOTA broker highlights, separate priceTable, and 10 slides', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.log('Skipping DB test: no supabase env');
      return;
    }
    const s = createClient(supabaseUrl, supabaseKey);

    const docId = '8bc302d8-dbe0-4109-ba49-9573e8e78dc3';
    const { data: doc } = await s.from('document_objects').select('*').eq('id', docId).single();
    const { data: bldg } = await s.from('building_ssot_lite').select('*').eq('id', doc.building_id).single();

    const renderer = new MobileImPptxRenderer();
    const result = await renderer.render({
      buildingId: doc.building_id,
      doc,
      building: bldg,
      grade: 'B',
      preset: 'credeal_basic',
      posture: 'income',
    });

    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(100_000);

    const outDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\942482b8-df15-4e6c-9524-3bab6f9b7d69\\slides';
    const outPath = path.join(outDir, 'seocho_basic_sota.pptx');
    fs.writeFileSync(outPath, result.buffer);

    const zip = new AdmZip(outPath);
    const slideEntries = zip.getEntries().filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
    expect(slideEntries.length).toBeGreaterThanOrEqual(9);
    expect(slideEntries.length).toBeLessThanOrEqual(10);

    const slideTexts = slideEntries.map((e: any) => {
      const xml = e.getData().toString('utf-8');
      return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    });

    // 1. Cover
    expect(slideTexts[0]).toContain('INVESTMENT MEMORANDUM');

    // 2. Summary: 6 Stats and SOTA Broker Highlights
    console.log('Slide 2 Text:', slideTexts[1]);
    expect(slideTexts[1]).toContain('핵심 투자 지표');
    expect(slideTexts[1]).toContain('230억');
    expect(slideTexts[1]).not.toContain('200억대');
    expect(slideTexts[1]).toContain('양재역');
    expect(slideTexts[1]).toContain('Cap Rate');
    expect(slideTexts[1]).not.toContain('실사 점검:');

    // 3. Building Overview: Separate priceTable
    console.log('Slide 3 Text:', slideTexts[2]);
    expect(slideTexts[2]).toContain('건물 개요');
    expect(slideTexts[2]).toContain('매매 희망가');
    expect(slideTexts[2]).toContain('230억 원');

    // 4. Location: Kakao Map and Transit
    console.log('Slide 4 Text:', slideTexts[3]);
    expect(slideTexts[3]).toContain('입지 분석');
    expect(slideTexts[3]).toContain('소재지');
    expect(slideTexts[3]).toContain('대중교통');

    // 5. Land: Physical Land specs
    console.log('Slide 5 Text:', slideTexts[4]);
    expect(slideTexts[4]).toContain('토지 현황');

    // 6. Cadastral Map
    console.log('Slide 6 Text:', slideTexts[5]);
    expect(slideTexts[5]).toContain('지적도');

    // 7. Rent Roll + Stacking Plan (A24)
    console.log('Slide 7 Text:', slideTexts[6]);
    expect(slideTexts[6]).toContain('임대차 현황');
    expect(slideTexts[6]).toContain('공실');

    // 8. Yield Formula (A23)
    console.log('Slide 8 Text:', slideTexts[7]);
    expect(slideTexts[7]).toContain('투자수익률 분석');
    expect(slideTexts[7]).toContain('1.66%');
    expect(slideTexts[7]).toContain('2.90%');

    // 9. Gallery (A14)
    console.log('Slide 9 Text:', slideTexts[8]);
    expect(slideTexts[8]).toContain('현장 사진');

    // 10. Closing (A10)
    console.log('Slide 10 Text:', slideTexts[9]);
    expect(slideTexts[9]).toContain('문의 및 유의사항');
  }, 45000);
});
