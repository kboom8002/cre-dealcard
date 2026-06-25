import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase.from('profiles').update({ role: 'broker' }).neq('role', 'broker');
  if(error) throw error;
  console.log('Successfully updated roles', data);
}

main().catch(console.error);
