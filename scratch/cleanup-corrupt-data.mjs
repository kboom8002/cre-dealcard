import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(PROD_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Find all buildings with encoding issues (contains '?' in Korean text fields)
  const { data: allBuildings } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type, price_band, owner_id, created_at')
    .order('created_at', { ascending: true });

  const corruptedIds = [];
  for (const b of allBuildings || []) {
    const text = `${b.area_signal || ''}${b.asset_type || ''}${b.price_band || ''}`;
    if (text.includes('?')) {
      corruptedIds.push(b.id);
      console.log(`  [CORRUPT] ${b.id} | area=[${b.area_signal}] asset=[${b.asset_type}] price=[${b.price_band}]`);
    }
  }

  console.log(`\nFound ${corruptedIds.length} corrupted buildings.`);
  
  if (corruptedIds.length === 0) {
    console.log('Nothing to clean.');
    return;
  }

  // 2. Delete match_results referencing corrupted buildings
  console.log('\nDeleting match_results for corrupted buildings...');
  for (const id of corruptedIds) {
    const { error: mErr, count } = await supabase
      .from('match_results')
      .delete({ count: 'exact' })
      .eq('building_ssot_lite_id', id);
    if (mErr) console.error(`  Error deleting matches for ${id}:`, mErr.message);
    else console.log(`  Deleted ${count || 0} match results for building ${id.substring(0,8)}`);
  }

  // 3. Delete signal cards referencing corrupted buildings
  console.log('\nDeleting signal cards for corrupted buildings...');
  for (const id of corruptedIds) {
    const { error: scErr, count } = await supabase
      .from('building_signal_cards')
      .delete({ count: 'exact' })
      .eq('building_id', id);
    if (scErr) console.error(`  Error deleting cards for ${id}:`, scErr.message);
    else console.log(`  Deleted ${count || 0} signal cards for building ${id.substring(0,8)}`);
  }

  // 4. Delete corrupted buildings
  console.log('\nDeleting corrupted buildings...');
  for (const id of corruptedIds) {
    const { error: bErr } = await supabase
      .from('building_ssot_lite')
      .delete()
      .eq('id', id);
    if (bErr) console.error(`  Error deleting building ${id}:`, bErr.message);
    else console.log(`  ✅ Deleted building ${id.substring(0,8)}`);
  }

  // 5. Also clean up orphaned buildings without proper data
  console.log('\nChecking for buildings with null asset_type...');
  const { data: nullBuildings } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type, price_band')
    .is('asset_type', null);
  
  for (const b of nullBuildings || []) {
    console.log(`  [NULL ASSET] ${b.id.substring(0,8)} | area=[${b.area_signal}] price=[${b.price_band}]`);
    
    // Delete match results
    await supabase.from('match_results').delete().eq('building_ssot_lite_id', b.id);
    // Delete signal cards
    await supabase.from('building_signal_cards').delete().eq('building_id', b.id);
    // Delete building
    const { error } = await supabase.from('building_ssot_lite').delete().eq('id', b.id);
    if (error) console.error(`  Error:`, error.message);
    else console.log(`  ✅ Deleted orphaned building ${b.id.substring(0,8)}`);
  }

  console.log('\n✅ Cleanup complete!');
}

main().catch(console.error);
