import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { MobileImPptxRenderer } from '../../domain/building/mobile-im/pptx/pptx-renderer';

describe('Basic IM SOTA Render Verification Test', () => {
  it('dump text', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.warn('Skipping dump test: Supabase credentials not set');
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

    const outDir = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'render-verification');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'seocho_basic_sota.pptx');
    fs.writeFileSync(outPath, result.buffer);

    const zip = new AdmZip(outPath);
    const slideEntries = zip.getEntries().filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
    const slideXmls = slideEntries.map((e: any) => e.getData().toString('utf-8'));
    const slideTexts = slideXmls.map((xml: string) =>
      xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    );
    for(let i=0; i<slideTexts.length; i++) {
        console.log(`SLIDE ${i}:`, slideTexts[i].slice(0, 500));
    }
  }, 45_000);
});
