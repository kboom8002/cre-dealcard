import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod/v4";

const UpdateSchema = z.object({
  title: z.string().optional(),
  shortSummary: z.string().optional(),
  dealPoints: z.array(z.string()).optional(),
  cautionPoints: z.array(z.string()).optional(),
  pricing: z.object({
    askingPrice: z.number().optional(),
    deposit: z.number().optional(),
    monthlyRent: z.number().optional(),
    maintenanceFee: z.number().optional(),
  }).optional(),
  curiosityScore: z.number().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const json = await req.json();
    const updateData = UpdateSchema.parse(json);

    const serviceClient = createServiceClient();

    // Fetch existing document to merge updates
    const { data: teaserDoc, error: fetchError } = await serviceClient
      .from("document_objects")
      .select("body")
      .eq("building_id", params.id)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !teaserDoc) {
      return NextResponse.json({ error: "Teaser document not found" }, { status: 404 });
    }

    // Verify ownership
    const { data: building } = await serviceClient
      .from("building_ssot_lite")
      .select("owner_id")
      .eq("id", params.id)
      .single();

    if (!building || building.owner_id !== guard.user!.id) {
      return NextResponse.json({ error: "Forbidden: not your building" }, { status: 403 });
    }

    const currentBody = teaserDoc.body as Record<string, any>;
    const updatedBody = { ...currentBody };

    if (updateData.title !== undefined) updatedBody.title = updateData.title;
    if (updateData.shortSummary !== undefined) updatedBody.shortSummary = updateData.shortSummary;
    if (updateData.dealPoints !== undefined) updatedBody.dealPoints = updateData.dealPoints;
    if (updateData.cautionPoints !== undefined) updatedBody.cautionPoints = updateData.cautionPoints;
    if (updateData.pricing !== undefined) updatedBody.pricing = updateData.pricing;

    // Update document
    const { error: updateError } = await serviceClient
      .from("document_objects")
      .update({ body: updatedBody })
      .eq("building_id", params.id)
      .eq("document_type", "blind_teaser");

    if (updateError) throw updateError;

    // Optional: update building_signal_cards for curiosity score
    if (updateData.curiosityScore !== undefined) {
      await serviceClient
        .from("building_signal_cards")
        .update({ deal_curiosity_score: updateData.curiosityScore })
        .eq("building_id", params.id);
    }

    return NextResponse.json({ success: true, body: updatedBody });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
