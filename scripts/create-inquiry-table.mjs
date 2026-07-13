/**
 * Supabase SQL endpoint를 통해 im_inquiry_requests 테이블을 직접 생성
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const projectRef = url.replace("https://", "").replace(".supabase.co", "");

const sql = `
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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'im_inquiry_requests' AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access" ON public.im_inquiry_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

// Try multiple approaches

// Approach 1: Supabase Management API /sql endpoint
async function tryManagementAPI() {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (res.ok) {
    console.log("✅ Created via exec_sql RPC");
    return true;
  }
  console.log("exec_sql RPC not available:", (await res.text()).substring(0, 100));
  return false;
}

// Approach 2: Use pg module (if available)
async function tryPgDirect() {
  try {
    const { default: postgres } = await import("postgres");
    // Construct connection string from Supabase URL
    const connStr = `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`;
    const pgSql = postgres(connStr, { ssl: "require" });
    await pgSql.unsafe(sql);
    await pgSql.end();
    console.log("✅ Created via direct pg connection");
    return true;
  } catch (err) {
    console.log("pg direct failed:", err.message?.substring(0, 100));
    return false;
  }
}

// Approach 3: Create exec_sql function first, then use it
async function tryCreateExecSql() {
  // Use supabase-js to attempt creating the function via a bootstrapping technique
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, {
    db: { schema: 'public' },
  });

  // Try inserting a test record - if table doesn't exist, Supabase returns specific error
  const { error } = await supabase.from("im_inquiry_requests").select("id").limit(1);
  if (!error) {
    console.log("✅ Table already exists!");
    return true;
  }
  
  console.log("Table doesn't exist. Error:", error.message);
  
  // Last resort: output SQL for user to run
  console.log("\n⚠️ 자동 생성 불가 — Supabase Dashboard에서 SQL을 실행해 주세요:");
  console.log("URL: https://supabase.com/dashboard/project/" + projectRef + "/sql/new");
  console.log("\n" + sql);
  return false;
}

async function main() {
  if (await tryManagementAPI()) return;
  if (await tryPgDirect()) return;
  await tryCreateExecSql();
}

main().catch(console.error);
