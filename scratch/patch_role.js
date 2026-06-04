const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role to bypass RLS and patch
);

async function run() {
  console.log('Fetching all user profiles...');
  const { data, error } = await supabase
    .from('profiles')
    .select('*');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log('Current Profiles:');
  console.table(data);

  // If there are profiles with public_user role, let's patch them to broker to fix the user's issue
  const publicUsers = data.filter(p => p.role !== 'broker' && p.role !== 'admin');
  if (publicUsers.length > 0) {
    console.log(`Found ${publicUsers.length} non-broker profiles. Upgrading them all to 'broker'...`);
    for (const u of publicUsers) {
      const { error: patchErr } = await supabase
        .from('profiles')
        .update({ role: 'broker' })
        .eq('id', u.id);

      if (patchErr) {
        console.error(`Failed to patch user ${u.id}:`, patchErr);
      } else {
        console.log(`Successfully upgraded user ${u.id} (${u.display_name}) to 'broker'`);
      }
    }
  } else {
    console.log('No non-broker profiles found to upgrade.');
  }
}

run();
