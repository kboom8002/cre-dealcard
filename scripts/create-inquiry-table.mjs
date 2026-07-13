import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env"); process.exit(1); }

const supabase = createClient(url, key);

async function run() {
  // Test if table already exists
  const { error: checkErr } = await supabase.from("im_inquiry_requests").select("id").limit(1);
  if (!checkErr) {
    console.log("✅ im_inquiry_requests table already exists");
    return;
  }
  
  console.log("Table not found, attempting to create...");
  
  // Try insert to confirm
  const { error: insertErr } = await supabase.from("im_inquiry_requests").insert({
    building_id: "test",
    broker_user_id: "test",
    requester_name: "test",
    requester_phone: "test",
  });
  
  if (insertErr?.message?.includes("does not exist") || insertErr?.code === "42P01") {
    console.log("❌ Table does not exist. Please create it in Supabase Dashboard SQL Editor:");
    console.log(`
CREATE TABLE im_inquiry_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id TEXT NOT NULL,
  doc_id TEXT,
  broker_user_id TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_phone TEXT NOT NULL,
  requester_email TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  sms_sent BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'im_cta',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE im_inquiry_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_inquiries" ON im_inquiry_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_role_all" ON im_inquiry_requests
  FOR ALL USING (true);
    `);
  } else {
    // Delete the test row
    await supabase.from("im_inquiry_requests").delete().eq("building_id", "test");
    console.log("✅ Table exists");
  }
}

run().catch(console.error);
