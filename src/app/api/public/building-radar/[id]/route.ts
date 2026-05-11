/**
 * GET /api/public/building-radar/[id]
 *
 * Fetch public-safe report result by building_ssot_lite ID.
 * Returns only public-safe fields, never raw_input for anonymous users.
 *
 * Source: docs/08-api-contracts.md section 6
 */
import { createServiceClient } from "@/lib/supabase/service";
import { toApiError } from "@/lib/api-error";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    // Fetch building (public-safe fields only)
    const { data: building, error: buildingErr } = await supabase
      .from("building_ssot_lite")
      .select("id, area_signal, asset_type, price_band, status")
      .eq("id", id)
      .single();

    if (buildingErr || !building) {
      return Response.json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "리포트를 찾을 수 없습니다." },
        },
        { status: 404 },
      );
    }

    // Fetch report document
    const { data: doc, error: docErr } = await supabase
      .from("document_objects")
      .select("id, title, body, markdown, status, created_at")
      .eq("building_id", id)
      .eq("document_type", "deal_curiosity_report")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (docErr || !doc) {
      return Response.json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "리포트를 찾을 수 없습니다." },
        },
        { status: 404 },
      );
    }

    return Response.json({
      ok: true,
      data: {
        building: {
          id: building.id,
          areaSignal: building.area_signal,
          assetType: building.asset_type,
          priceBand: building.price_band,
          status: building.status,
        },
        report: {
          id: doc.id,
          title: doc.title,
          body: doc.body,
          markdown: doc.markdown,
          status: doc.status,
          createdAt: doc.created_at,
        },
      },
    });
  } catch (error) {
    return toApiError(error);
  }
}
