import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';

// Parse .env.local
const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL']!, env['SUPABASE_SERVICE_ROLE_KEY']!);

async function main() {
  const docId = '9c8c7bcc-29fd-45e2-8ec1-2e65a6f1bbe2';
  console.log(`[1] Fetching doc ${docId}...`);
  const { data: doc, error } = await supabase.from('document_objects').select('*').eq('id', docId).single();
  if (error || !doc) {
    console.error('Doc error:', error);
    return;
  }

  const buildingId = doc.building_id;
  console.log(`[2] Fetching building ${buildingId}...`);
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', buildingId)
    .single();

  const renderer = new MobileImPptxRenderer();
  const posture = doc.body?.investment_posture || doc.body?.posture || 'owner_occupied';
  const grade = 'B';
  const releaseTier = doc.body?.releaseTier || 'decision_im';

  console.log(`[3] Rendering PPTX (posture: ${posture}, grade: ${grade}, tier: ${releaseTier})...`);
  const renderResult = await renderer.render({
    buildingId,
    preset: 'credeal_signature',
    posture,
    grade,
    releaseTier,
    docno: `IM-${buildingId.substring(0, 6).toUpperCase()}`,
    doc: {
      title: doc.title || '강남구 역삼동 사옥용빌딩',
      sections: doc.body?.sections || [],
      body: doc.body || {},
    },
    building: building || {},
    watermark: {
      requesterName: 'CREDEAL',
      phoneLast4: '0000',
      timestamp: '2026-09-07',
    },
  });

  console.log(`[4] Render completed! Slide count: ${renderResult.slideCount}, Buffer: ${renderResult.buffer.length} bytes`);
  console.log(`Warnings count: ${renderResult.warnings.length}`);
  renderResult.warnings.forEach(w => console.log('  WARN:', w));

  const outputDir = path.join(projectRoot, 'docs', 'prod-test', '02-yeoksam-hq', 'level-2-standard', 'output');
  const pptxPath = path.join(outputDir, '02-yeoksam-hq_latest.pptx');
  fs.writeFileSync(pptxPath, renderResult.buffer);
  console.log(`[5] Written PPTX to ${pptxPath}`);

  // Extract slide texts with python-pptx
  const slidesDir = path.join(outputDir, 'pptx-slides');
  fs.mkdirSync(slidesDir, { recursive: true });

  const pythonScript = `
import json
from pptx import Presentation

prs = Presentation(r'${pptxPath}')
slides_data = []
for i, slide in enumerate(prs.slides):
    layout_name = slide.slide_layout.name if slide.slide_layout else "N/A"
    texts = []
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                t = para.text.strip()
                if t:
                    texts.append(t)
        elif shape.has_table:
            for row in shape.table.rows:
                for cell in row.cells:
                    t = cell.text.strip()
                    if t:
                        texts.append(t)
    slides_data.append({
        "slide": i + 1,
        "layout": layout_name,
        "text_count": len(texts),
        "texts": texts
    })

with open(r'${path.join(slidesDir, 'slide-texts.json')}', 'w', encoding='utf-8') as f:
    json.dump(slides_data, f, ensure_ascii=False, indent=2)
print(f"Extracted {len(slides_data)} slides text successfully.")
`;

  console.log('[6] Running python extraction...');
  const tempPyPath = path.join(outputDir, '_temp_extract.py');
  fs.writeFileSync(tempPyPath, pythonScript, 'utf-8');
  try {
    execSync(`python "${tempPyPath}"`, { stdio: 'inherit' });
  } finally {
    if (fs.existsSync(tempPyPath)) fs.unlinkSync(tempPyPath);
  }

  // Convert to PDF and PNGs if LibreOffice is available
  const libreOfficePath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
  if (fs.existsSync(libreOfficePath)) {
    console.log('[7] Converting PPTX -> PDF -> PNGs...');
    try {
      execSync(`"${libreOfficePath}" --headless --convert-to pdf --outdir "${slidesDir}" "${pptxPath}"`, { stdio: 'pipe' });
      const pdfPath = path.join(slidesDir, '02-yeoksam-hq_latest.pdf');
      if (fs.existsSync(pdfPath)) {
        const pyMuPdfScript = `
import fitz
doc = fitz.open(r'${pdfPath}')
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    pix.save(r'${path.join(slidesDir, 'slide-').replace(/\\/g, '/')}' + f'{i+1:02d}.png')
print(f"Converted {len(doc)} pages to PNG.")
`;
        execSync(`python -c "${pyMuPdfScript.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
      }
    } catch (e: any) {
      console.warn('PDF/PNG conversion warning:', e.message);
    }
  }

  console.log('✅ Yeoksam HQ PPTX regeneration & extraction completed!');
}

main().catch(console.error);
