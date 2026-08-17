import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { readWithMigration } from "@/lib/ssot-adapter";
import { z } from "zod/v4";

const UpdateSchema = z.object({
  title: z.string().optional(),
  shortSummary: z.string().optional(),
  dealPoints: z.array(z.string()).optional(),
  cautionPoints: z.array(z.string()).optional(),
  kakaoText: z.string().optional(),
  pricing: z.object({
    askingPrice: z.number().optional(),
    deposit: z.number().optional(),
    monthlyRent: z.number().optional(),
    maintenanceFee: z.number().optional(),
  }).optional(),
  curiosityScore: z.number().optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  hookCopy: z.string().optional(),
  structureChips: z.array(z.string()).optional(),
  vacancyLabel: z.string().optional(),
  curiosityHook: z.string().optional(),
  // SSoT 건물 신호 필드 인라인 편집
  ssotUpdate: z.object({
    area_signal: z.string().optional(),
    asset_type: z.string().optional(),
    price_band: z.string().optional(),
    current_use_signal: z.string().optional(),
  }).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const json = await req.json();
    const updateData = UpdateSchema.parse(json);

    const serviceClient = createServiceClient();

    // Fetch existing document to merge updates
    const { data: teaserDoc, error: fetchError } = await serviceClient
      .from("document_objects")
      .select("body")
      .eq("building_id", id)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    // Verify ownership
    const result = await readWithMigration(id);
    const building = result.data as any;

    if (!building || Object.keys(building).length === 0 || building.owner_id !== guard.user!.id) {
      return NextResponse.json({ error: "Forbidden: not your building" }, { status: 403 });
    }

    const currentBody = teaserDoc?.body ? (teaserDoc.body as Record<string, any>) : {};
    const updatedBody = { ...currentBody };

    if (updateData.title !== undefined) updatedBody.title = updateData.title;
    if (updateData.shortSummary !== undefined) updatedBody.shortSummary = updateData.shortSummary;
    if (updateData.dealPoints !== undefined) updatedBody.dealPoints = updateData.dealPoints;
    if (updateData.cautionPoints !== undefined) updatedBody.cautionPoints = updateData.cautionPoints;
    if (updateData.kakaoText !== undefined) updatedBody.kakaoText = updateData.kakaoText;
    if (updateData.pricing !== undefined) updatedBody.pricing = updateData.pricing;
    if (updateData.ogTitle !== undefined) updatedBody.ogTitle = updateData.ogTitle;
    if (updateData.ogDescription !== undefined) updatedBody.ogDescription = updateData.ogDescription;
    if (updateData.hookCopy !== undefined) updatedBody.hookCopy = updateData.hookCopy;
    if (updateData.structureChips !== undefined) updatedBody.structureChips = updateData.structureChips;
    if (updateData.vacancyLabel !== undefined) updatedBody.vacancyLabel = updateData.vacancyLabel;
    if (updateData.curiosityHook !== undefined) updatedBody.curiosityHook = updateData.curiosityHook;

    // Update document_objects (body + markdown for kakaoText)
    const docUpdate: Record<string, unknown> = { body: updatedBody };
    if (updateData.kakaoText !== undefined) docUpdate.markdown = updateData.kakaoText;
    if (updateData.title !== undefined) docUpdate.title = updateData.title;

    if (teaserDoc) {
      const { error: updateError } = await serviceClient
        .from("document_objects")
        .update(docUpdate)
        .eq("building_id", id)
        .eq("document_type", "blind_teaser");
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await serviceClient
        .from("document_objects")
        .insert({
          owner_id: guard.user!.id,
          source_type: "building_ssot_lite",
          source_id: id,
          building_id: id,
          document_type: "blind_teaser",
          title: updatedBody.title || "블라인드 티저",
          body: updatedBody,
          markdown: updateData.kakaoText || "",
          visibility: "public_blind",
          status: "draft"
        });
      if (insertError) throw insertError;
    }

    // Sync building_signal_cards
    const signalCardUpdate: Record<string, unknown> = {};
    if (updateData.title !== undefined) signalCardUpdate.title = updateData.title;
    if (updateData.dealPoints !== undefined) signalCardUpdate.deal_points = updateData.dealPoints;
    if (updateData.curiosityScore !== undefined) signalCardUpdate.deal_curiosity_score = updateData.curiosityScore;
    if (updateData.hookCopy !== undefined) signalCardUpdate.hook_copy = updateData.hookCopy;

    if (Object.keys(signalCardUpdate).length > 0) {
      await serviceClient
        .from("building_signal_cards")
        .update(signalCardUpdate)
        .eq("building_id", id);
    }

    // SSoT 건물 신호 필드 인라인 편집 반영
    if (updateData.ssotUpdate && Object.keys(updateData.ssotUpdate).length > 0) {
      const ssotFields: Record<string, unknown> = {};
      const { area_signal, asset_type, price_band, current_use_signal } = updateData.ssotUpdate;
      if (area_signal !== undefined) ssotFields.area_signal = area_signal;
      if (asset_type !== undefined) ssotFields.asset_type = asset_type;
      if (price_band !== undefined) ssotFields.price_band = price_band;
      if (current_use_signal !== undefined) ssotFields.current_use_signal = current_use_signal;

      if (Object.keys(ssotFields).length > 0) {
        const { error: ssotError } = await serviceClient
          .from("building_ssot_lite")
          .update(ssotFields)
          .eq("id", id);
        if (ssotError) {
          console.error("[deal-card PATCH] SSoT update failed:", ssotError);
        }
      }
    }

    return NextResponse.json({ success: true, body: updatedBody });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
