import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vwbmaulavgjwezffbxgi.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GOLDEN_DIR = path.join(process.cwd(), 'docs', 'imup', '05_data', 'golden');

async function processFile(filename: string) {
  const filePath = path.join(GOLDEN_DIR, filename);
  const fileContent = await fs.readFile(filePath, 'utf8');

  // Extract ID
  const idMatch = filename.match(/^(G\d+)/);
  if (!idMatch) return;
  const golden_id = idMatch[1];

  // Extract metadata
  const gradeMatch = fileContent.match(/\|\s*\*\*등급\*\*\s*\|\s*\*\*(S|A)\*\*/);
  const postureMatch = fileContent.match(/\|\s*\*\*포스처\*\*\s*\|\s*`([^`]+)`/);
  const assetTypeMatch = fileContent.match(/\|\s*\*\*자산유형\*\*\s*\|\s*`([^`]+)`/);
  const priceBandMatch = fileContent.match(/\|\s*\*\*가격 밴드\*\*\s*\|\s*\*\*(B[1-3])\*\*/);

  const grade = gradeMatch ? gradeMatch[1] : null;
  const posture = postureMatch ? postureMatch[1] : null;
  const asset_type = assetTypeMatch ? assetTypeMatch[1] : null;
  const price_band = priceBandMatch ? priceBandMatch[1] : null;

  // Split by section type: ## `section_type`
  const sections = fileContent.split(/^##\s+`([^`]+)`/m);
  
  const records = [];
  // sections[0] is the preamble. Then [1] is section_type, [2] is content, etc.
  for (let i = 1; i < sections.length; i += 2) {
    const section_type = sections[i];
    const content = sections[i + 1].trim();

    records.push({
      golden_id,
      grade,
      posture,
      asset_type,
      price_band,
      section_type,
      content,
      is_active: true,
      source_type: 'manual_curated'
    });
  }

  if (records.length > 0) {
    const { error } = await supabase.from('im_golden_sets').insert(records);
    if (error) {
      console.error(`Error inserting ${golden_id}:`, error.message);
    } else {
      console.log(`Successfully inserted ${records.length} sections for ${golden_id}`);
    }
  } else {
    console.log(`No sections found for ${golden_id}`);
  }
}

async function main() {
  try {
    const files = await fs.readdir(GOLDEN_DIR);
    const gFiles = files.filter(f => /^G0[1-8].*\.md$/.test(f));
    
    if (gFiles.length === 0) {
      console.log('No matching files found in', GOLDEN_DIR);
      return;
    }

    for (const file of gFiles) {
      console.log(`Processing ${file}...`);
      await processFile(file);
    }
    
    console.log('Seeding completed.');
  } catch (error) {
    console.error('Script failed:', error);
  }
}

main();
