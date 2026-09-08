import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { buildIMContext } from '../src/domain/building/mobile-im/im-context-builder';
import { generateSingleSection } from '../src/domain/building/mobile-im/im-section-generator';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^[']|[']$/g, '');
});
for (const [k, v] of Object.entries(env)) {
  process.env[k] = v;
}

async function test() {
  const bottomSheet = JSON.parse(fs.readFileSync('docs/prod-test/02-yeoksam-hq/level-2-standard/bottom_sheet.json', 'utf8'));
  const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL']!, env['SUPABASE_SERVICE_ROLE_KEY']!);

  const { data: bssot } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', 'e8bc71d2-6caf-409e-90b3-f9c15aa161f1')
    .single();

  if (!bssot) {
    console.error('SSoT not found');
    return;
  }

  const supplemental = {
    ...bottomSheet,
    asking_price_manwon: bottomSheet.askingPrice / 10000,
    monthly_rent_total_krw: bottomSheet.monthlyRent,
    total_deposit_manwon: bottomSheet.deposit / 10000,
    mgmt_fee_total_manwon: bottomSheet.mgmtFee / 10000,
    resolved_address: bottomSheet.address,
    investmentPosture: bottomSheet.posture,
  };

  const writerInput = {
    building_ssot_lite: bssot,
    supplemental,
    readiness: { score: 55, issues: [] },
    external_data: null,
    identity: {
      assetType: '사무용빌딩',
      investmentPosture: 'owner_occupied',
    },
  };

  console.log('Building IM context...');
  const ctx = await buildIMContext(writerInput as any);

  console.log('\n--- Testing cost_comparison ---');
  try {
    const res1 = await generateSingleSection(
      'cost_comparison',
      6,
      ctx,
      ctx.sectionCtx,
      supplemental,
      null,
      bssot,
      { dcfEligible: false }
    );
    console.log('generatedByAi:', res1.generatedByAi);
    console.log('Markdown:');
    console.log(res1.section.markdown);
  } catch (err) {
    console.error('cost_comparison error:', err);
  }

  console.log('\n--- Testing investment_thesis ---');
  try {
    const res2 = await generateSingleSection(
      'investment_thesis',
      1,
      ctx,
      ctx.sectionCtx,
      supplemental,
      null,
      bssot,
      { dcfEligible: false }
    );
    console.log('generatedByAi:', res2.generatedByAi);
    console.log('Markdown:');
    console.log(res2.section.markdown);
  } catch (err) {
    console.error('investment_thesis error:', err);
  }
}

test();
