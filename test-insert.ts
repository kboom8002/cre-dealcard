import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  const { data: profiles } = await supabase.from("profiles").select("id").limit(1);
  if (!profiles || profiles.length === 0) {
    console.log("No users found");
    return;
  }
  const user = profiles[0];
  
  const { data: building } = await supabase.from("building_ssot_lite").select("id").limit(1).single();
  if (!building) {
      console.log("No building found");
      return;
  }

  const payload = {
    owner_id: user.id,
    source_type: "building_ssot_lite",
    source_id: building.id,
    building_id: building.id,
    document_type: "blind_teaser",
    visibility: "public_blind",
    status: "draft",
    title: "Test",
    body: { test: true },
  };

  console.log("Inserting...", payload);
  const { data, error } = await supabase
    .from("document_objects")
    .insert([payload])
    .select("id")
    .single();

  console.log("Result:", data, error);
}

test();
