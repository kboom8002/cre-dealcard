import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env"); process.exit(1); }

const supabase = createClient(url, key);

async function run() {
  // 1. Check broker_profiles columns
  console.log("=== broker_profiles columns ===");
  const { data: bp } = await supabase
    .from("broker_profiles")
    .select("*")
    .eq("user_id", "6493f0de-a2f9-4c06-b093-63bdd67cbd3b")
    .single();
  
  if (bp) {
    console.log("Columns:", Object.keys(bp).join(", "));
    console.log("slug:", bp.slug);
    console.log("name:", bp.name);
    console.log("vibe_vti:", bp.vibe_vti);
    console.log("has vibe_vector:", !!bp.vibe_vector);
  } else {
    console.log("No broker_profile for this user");
    
    // Check profiles table
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", "6493f0de-a2f9-4c06-b093-63bdd67cbd3b")
      .single();
    
    if (profile) {
      console.log("\nProfile found:", Object.keys(profile).join(", "));
      console.log("display_name:", profile.display_name);
      console.log("company:", profile.company);
      console.log("phone:", profile.phone);
    }
  }

  // 2. Create im_inquiry_requests table
  console.log("\n=== Creating im_inquiry_requests table ===");
  const { error: sqlErr } = await supabase.rpc("exec_sql", {
    query: `
      CREATE TABLE IF NOT EXISTS public.im_inquiry_requests (
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
    `
  });
  
  if (sqlErr) {
    console.log("RPC failed:", sqlErr.message);
    console.log("\n⚠️ Please run this SQL in Supabase Dashboard:");
    console.log(`
CREATE TABLE IF NOT EXISTS public.im_inquiry_requests (
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

ALTER TABLE public.im_inquiry_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.im_inquiry_requests
  FOR ALL USING (true) WITH CHECK (true);
    `);
  } else {
    console.log("✅ Table created");
  }
}

run().catch(console.error);
