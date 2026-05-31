import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('building_ssot_lite')
    .select('id')
    .eq('broker_id', '00000000-0000-0000-0000-000000000000')
    .limit(1);

  if (error) {
    console.error("Query error:", error.message, error.code);
  } else {
    console.log("Query succeeded! Data:", data);
  }
}

check();
