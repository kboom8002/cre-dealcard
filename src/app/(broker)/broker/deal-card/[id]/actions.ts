"use server";

import { createHandoff } from "@/domain/handoff/handoff";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createMobileIMAction(buildingId: string) {
  try {
    const supabase = createServiceClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id || null;

    const handoff = await createHandoff({
      sourceBuildingSsotLiteId: buildingId,
      requestedOutput: "im_lite",
      actorRole: "broker",
      sourceVisibilityLevel: "public_blind",
    }, userId);

    const fullImApiUrl = process.env.NODE_ENV === "production"
      ? "https://cre-fullim.vercel.app"
      : (process.env.FULL_IM_STUDIO_URL ?? "http://localhost:3001");
    
    const res = await fetch(`${fullImApiUrl}/api/mobile-im/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handoff_token: handoff.handoff_token,
        supplemental: {
          monthly_rent_total_krw: 5000000, 
          vacancy_status: "85%",
          photo_urls: []
        }
      })
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return { success: false, error: `API Error: ${res.status} ${errorBody}` };
    }

    const data = await res.json();
    
    if (data.public_url) {
      return { success: true, url: data.public_url };
    } else {
      return { success: false, error: "No public URL returned" };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Unknown error" };
  }
}
