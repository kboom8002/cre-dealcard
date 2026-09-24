import { test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

test('Update DB', async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: `
      ALTER TABLE document_objects DROP CONSTRAINT IF EXISTS document_objects_document_type_check;
      ALTER TABLE document_objects ADD CONSTRAINT document_objects_document_type_check
      CHECK (document_type IN (
        'deal_curiosity_report', 'blind_teaser', 'buyer_fit_memo', 'owner_prep_memo',
        'missing_data_checklist', 'gate_request_note', 'snapshot', 'mobile_im',
        'im_lite', 'im_lite_draft', 'building_snapshot_draft', 'im_pro'
      ));
    `
  });
  console.log("Result:", data, "Error:", error);
});
