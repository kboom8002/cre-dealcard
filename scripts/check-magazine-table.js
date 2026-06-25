require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("Checking if magazine_issues exists...");
  const { data, error } = await supabase.from('magazine_issues').select('id').limit(1);
  if (error) {
    console.error("Error fetching magazine_issues:", error);
  } else {
    console.log("magazine_issues exists! data:", data);
  }
}
main();
