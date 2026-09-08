import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { buildIMContext } from '../src/domain/building/mobile-im/im-context-builder';
import { callLLM } from '../src/ai/llm-client';
import { buildNarrativeUserPrompt, buildPostureAwareSystemPrompt } from '../src/domain/building/mobile-im/narrative-prompt';
import { getPosturePromptOverlay } from '../src/domain/building/mobile-im/posture-prompts';

async function testRaw() {
  const bottomSheet = JSON.parse(fs.readFileSync('docs/prod-test/02-yeoksam-hq/level-2-standard/bottom_sheet.json', 'utf8'));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: bssot } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', 'e8bc71d2-6caf-409e-90b3-f9c15aa161f1')
    .single();

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

  const ctx = await buildIMContext(writerInput as any);

  console.log('=== RAW LLM GENERATION FOR investment_thesis ===');
  const userPrompt = buildNarrativeUserPrompt(
    'investment_thesis',
    { asset_identity: ctx.assetIdentity, physical_fact: ctx.physicalFact, market_location: ctx.marketLocation, buyer_fit: ctx.buyerFit },
    null,
    supplemental,
    undefined,
    undefined,
    ctx.ragCtx,
    undefined,
    undefined,
    'owner_occupied',
    undefined
  );

  let sysPrompt = buildPostureAwareSystemPrompt('owner_occupied');
  const overlay = getPosturePromptOverlay('owner_occupied', 'investment_thesis');
  if (overlay) sysPrompt += '\n\n' + overlay;

  const res = await callLLM({
    systemPrompt: sysPrompt,
    userPrompt,
    model: 'gpt-5.6-terra',
    temperature: 0,
    maxTokens: 1200,
  });

  console.log(res.content);
}

testRaw();
