import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(PROD_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Get ALL buildings for this buyer intent's broker
  const BROKER_ID = '702b8438-5dbc-4006-a0d0-909cfb00c36f';
  
  console.log('=== ALL buildings for broker ===');
  const { data: buildings, error } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type, price_band, owner_id')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  buildings?.forEach(b => {
    // Check for encoding issues
    const hasQuestionMarks = (b.area_signal || '').includes('?') || (b.asset_type || '').includes('?');
    console.log(`  ${b.id.substring(0, 8)} | area=[${b.area_signal}] asset=[${b.asset_type}] price=[${b.price_band}] owner=${b.owner_id?.substring(0,8)} ${hasQuestionMarks ? '⚠️ ENCODING?' : '✅'}`);
  });
  
  // Now check what the match_results join would look like from the page query
  console.log('\n=== match_results join test (buyer 86f52cd3) ===');
  const { data: matches, error: mErr } = await supabase
    .from('match_results')
    .select(`id, grade, score, building_ssot_lite_id, building_ssot_lite (id, area_signal, asset_type, price_band)`)
    .eq('buyer_intent_lite_id', '86f52cd3-7e79-4fd5-bc5c-175d2abdfd94')
    .order('score', { ascending: false })
    .limit(10);
  
  if (mErr) {
    console.error('Match query error:', mErr);
    return;
  }
  
  matches?.forEach(m => {
    const b = Array.isArray(m.building_ssot_lite) ? m.building_ssot_lite[0] : m.building_ssot_lite;
    console.log(`  Match ${m.id.substring(0,8)} grade=${m.grade} score=${m.score}`);
    console.log(`    building: ${b ? `area=[${b.area_signal}] asset=[${b.asset_type}] price=[${b.price_band}]` : 'NULL BUILDING JOIN!'}`);
  });
}

main().catch(console.error);
