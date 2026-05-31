import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function clean() {
  const { data, error } = await supabase
    .from('buyer_intent_lite')
    .delete()
    .in('id', [
      '3698558e-cbbb-4b4b-bba4-7c4e613039e0',
      '9a199da9-9d79-425c-a0e2-66f8a7986da6'
    ]);

  if (error) console.error(error);
  else console.log('Deleted corrupted buyer intents.');
}

clean();
