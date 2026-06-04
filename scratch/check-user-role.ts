import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function checkUser() {
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const supabase = createServiceClient();
  const userId = "702b8438-5dbc-4006-a0d0-909cfb00c36f"; // demo-broker UUID
  
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error querying profiles:", error);
  } else {
    console.log("Profiles role for demo-broker:", profile);
  }

  // Also query broker_profiles
  const { data: bProfile, error: bErr } = await supabase
    .from("broker_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (bErr) {
    console.error("Error querying broker_profiles:", bErr);
  } else {
    console.log("Broker profile for demo-broker:", bProfile);
  }
}

checkUser();
