"use server";

import { createHandoff } from "@/domain/handoff/handoff";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createMobileIMAction(buildingId: string) {
  const supabase = createServiceClient();
  // We use a mock user ID for the broker in this demo context
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id || "00000000-0000-0000-0000-000000000001";

  const handoff = await createHandoff({
    sourceBuildingSsotLiteId: buildingId,
    requestedOutput: "mobile_im",
    actorRole: "broker",
    sourceVisibilityLevel: "public_blind",
  }, userId);

  // Call Full IM Studio API to generate Mobile IM
  const fullImApiUrl = process.env.FULL_IM_STUDIO_URL ?? "https://cre-fullim.vercel.app";
  const res = await fetch(`${fullImApiUrl}/api/mobile-im/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      handoff_token: handoff.handoff_token,
      // For demo, we just pass empty supplemental data. The user could input this in a real form.
      supplemental: {
        monthly_rent_total_krw: 5000000, 
        vacancy_status: "85%",
        photo_urls: []
      }
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Mobile IM creation failed", errorBody);
    throw new Error("Failed to create Mobile IM");
  }

  const data = await res.json();
  
  if (data.public_url) {
    redirect(data.public_url);
  } else {
    throw new Error("No public URL returned");
  }
}
