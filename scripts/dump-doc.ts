import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
});
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL']!, env['SUPABASE_SERVICE_ROLE_KEY']!);

async function run() {
  const { data: doc, error } = await supabase
    .from('document_objects')
    .select('*')
    .eq('id', '9c8c7bcc-29fd-45e2-8ec1-2e65a6f1bbe2')
    .single();

  if (error || !doc) {
    console.error('Error fetching doc:', error);
    return;
  }

  let out = '';
  out += 'Doc title: ' + doc.title + '\n';
  out += 'Posture: ' + doc.body?.investment_posture + '\n';
  out += 'heroCard: ' + JSON.stringify(doc.body?.heroCard, null, 2) + '\n';
  out += 'ssot_summary: ' + JSON.stringify(doc.body?.ssot_summary, null, 2) + '\n';
  out += 'financial: ' + JSON.stringify(doc.body?.financial, null, 2) + '\n';
  out += 'Sections count: ' + doc.body?.sections?.length + '\n';
  (doc.body?.sections || []).forEach((s: any, i: number) => {
    out += `\n======================================================\n`;
    out += `Section ${i+1}: ${s.title} (${s.section_type || s.type})\n`;
    out += `Confidence: ${s.confidence}, Boundary: ${s.boundary_note}\n`;
    out += `------------------------------------------------------\n`;
    out += s.markdown + '\n';
  });
  fs.writeFileSync('scratch-doc-dump.txt', out, 'utf8');
  console.log('Saved to scratch-doc-dump.txt');
}
run();
