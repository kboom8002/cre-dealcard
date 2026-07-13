import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

// Check actual columns by selecting * from broker_profiles
const { data, error } = await supabase.from("broker_profiles").select("*").limit(1);
if (error) console.error("Error:", error.message);
else if (data && data[0]) console.log("Columns:", Object.keys(data[0]).sort().join("\n  "));
else console.log("No data in broker_profiles");
