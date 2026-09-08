const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+=)(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^x['m"]|['"m]$/g, '');
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = val;
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = val;
  }
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('document_objects')
    .select('*')
    .eq('id', '87b13183-41cc-405e-a5dd-0513a1000019')
    .single();

  if (error) {
    console.error(error);
    return;
  }

  const info = {
    id: data.id,
    posture: data.body?.investment_posture,
    sections: data.body?.sections?.map(s => ({title: s.title, type: s.type, sectionType: s.sectionType})),
    heroCard: data.body?.heroCard
  };
  fs.writeFileSync('docs/prod-test/03-jamwon-dev/level-3-verified/output/inspect.json', JSON.stringify(info, null, 2));
  console.log('Inspection saved to inspect.json');
}

main();
