import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: users, error: err1 } = await supabase.auth.admin.listUsers();
  if(err1) throw err1;
  
  const user = users.users.find(u => u.email === 'worldkbeauty@gmail.com');
  if(!user) {
    console.log('user not found');
    return;
  }
  console.log('User id:', user.id);
  
  const { data, error } = await supabase.from('profiles').update({ role: 'broker' }).eq('id', user.id);
  if(error) throw error;
  console.log('Successfully updated role for', user.email);
}

main().catch(console.error);
