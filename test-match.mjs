import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('match_results')
    .select('*, buyer_intent_lite(*)')
    .eq('building_ssot_lite_id', '013762e5-3f22-4662-8365-8ab9b0122901')
    .order('score', { ascending: false });

  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

check();
