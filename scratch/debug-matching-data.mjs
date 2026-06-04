import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(PROD_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Check building_ssot_lite data
  console.log('=== building_ssot_lite (latest 5) ===');
  const { data: buildings } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type, price_band, owner_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  
  buildings?.forEach(b => {
    console.log(`  ID: ${b.id}`);
    console.log(`    area_signal: [${b.area_signal}]`);
    console.log(`    asset_type:  [${b.asset_type}]`);
    console.log(`    price_band:  [${b.price_band}]`);
    console.log(`    owner_id:    ${b.owner_id}`);
    console.log(`    created_at:  ${b.created_at}`);
    console.log('');
  });

  // 2. Check match_results
  console.log('=== match_results (latest 10) ===');
  const { data: matches } = await supabase
    .from('match_results')
    .select('id, grade, score, stage1_passed, stage2_similarity, stage3_score, reasoning, building_ssot_lite_id, buyer_intent_lite_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  
  matches?.forEach(m => {
    console.log(`  Match: grade=${m.grade}, score=${m.score}, stage1=${m.stage1_passed}, stage2=${m.stage2_similarity}, stage3=${m.stage3_score}`);
    console.log(`    building: ${m.building_ssot_lite_id}, buyer: ${m.buyer_intent_lite_id}`);
    console.log(`    reasoning: ${m.reasoning?.substring(0, 100)}...`);
    console.log('');
  });

  // 3. Check buyer_intent_lite
  console.log('=== buyer_intent_lite (latest 3) ===');
  const { data: intents } = await supabase
    .from('buyer_intent_lite')
    .select('id, buyer_type, budget_display, preferred_regions, asset_types, purchase_purpose, must_have, nice_to_have, risk_tolerance')
    .order('created_at', { ascending: false })
    .limit(3);
  
  intents?.forEach(i => {
    console.log(`  Intent: ${i.id}`);
    console.log(`    buyer_type: ${i.buyer_type}`);
    console.log(`    budget: ${i.budget_display}`);
    console.log(`    regions: ${JSON.stringify(i.preferred_regions)}`);
    console.log(`    assets: ${JSON.stringify(i.asset_types)}`);
    console.log(`    purpose: ${i.purchase_purpose}`);
    console.log(`    must_have: ${JSON.stringify(i.must_have)}`);
    console.log('');
  });

  // 4. Check building_signal_cards
  console.log('=== building_signal_cards (latest 5) ===');
  const { data: cards } = await supabase
    .from('building_signal_cards')
    .select('id, title, area_signal, asset_type, price_band, building_id')
    .order('created_at', { ascending: false })
    .limit(5);
  
  cards?.forEach(c => {
    console.log(`  Card: ${c.id}`);
    console.log(`    title: [${c.title}]`);
    console.log(`    area_signal: [${c.area_signal}]`);
    console.log(`    asset_type:  [${c.asset_type}]`);
    console.log('');
  });
}

main().catch(console.error);
