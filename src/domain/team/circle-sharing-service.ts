import { createServiceClient } from "@/lib/supabase/service";
import { runCircleAutoMatch } from "./circle-matching-service";
import { notifyCircleMembers } from "./circle-notification-service";

export interface SharedAssetWithDetail {
  id: string;
  circle_id: string;
  broker_id: string;
  asset_type: 'building' | 'buyer_intent' | 'tenant_intent';
  asset_id: string;
  visibility: 'signal_only' | 'basic_info' | 'full_detail';
  shared_at: string;
  broker_profile?: {
    display_name: string | null;
    company: string | null;
  };
  asset_detail?: Record<string, any>;
}

export interface ShareableAsset {
  id: string;
  type: 'building' | 'buyer_intent';
  title: string;
  subtitle: string;
  shared_circle_ids: string[];
}

export async function shareAssetToCircle(input: {
  circleId: string;
  brokerId: string;
  assetType: 'building' | 'buyer_intent' | 'tenant_intent';
  assetId: string;
}): Promise<{ sharedAssetId: string }> {
  const supabase = createServiceClient();

  // 1. Check membership
  const { data: member } = await supabase
    .from("broker_circle_members")
    .select("status")
    .eq("circle_id", input.circleId)
    .eq("broker_id", input.brokerId)
    .eq("status", "active")
    .maybeSingle();

  if (!member) {
    throw new Error("서클 멤버만 자산을 공유할 수 있습니다.");
  }

  // 2. Upsert shared asset
  const { data: shared, error } = await supabase
    .from("circle_shared_assets")
    .upsert({
      circle_id: input.circleId,
      broker_id: input.brokerId,
      asset_type: input.assetType,
      asset_id: input.assetId,
      visibility: "signal_only",
    }, { onConflict: "circle_id,asset_type,asset_id" })
    .select("id")
    .single();

  if (error || !shared) {
    throw new Error(`자산 공유 실패: ${error?.message}`);
  }

  // 3. Always-On Matching trigger (non-blocking)
  if (input.assetType === "building" || input.assetType === "buyer_intent") {
    runCircleAutoMatch(input.circleId, input.assetType, input.assetId).catch((err) =>
      console.warn("[circle-matching] Auto match failed:", err)
    );
  }

  // 4. Notify circle members
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", input.brokerId)
    .maybeSingle();

  const brokerName = profile?.display_name || "동료 중개사";
  const assetName = input.assetType === "building" ? "물건" : "매수 의향";

  notifyCircleMembers({
    circleId: input.circleId,
    excludeBrokerId: input.brokerId,
    title: "📦 서클 새 자산 공유",
    body: `${brokerName} 님이 새 ${assetName}을(를) 서클에 공유했습니다.`,
    link: `/broker/circles/${input.circleId}`,
    type: "circle_shared",
    metadata: { asset_type: input.assetType, asset_id: input.assetId },
  }).catch((e) => console.warn("[circle-sharing] Notify error:", e));

  // 5. Activity event
  await supabase.from("activity_events").insert({
    actor_id: input.brokerId,
    event_type: "circle_asset_shared",
    entity_type: input.assetType,
    entity_id: input.assetId,
    metadata: { circle_id: input.circleId },
  });

  return { sharedAssetId: shared.id };
}

export async function shareMultipleAssets(input: {
  circleIds: string[];
  brokerId: string;
  assetType: 'building' | 'buyer_intent' | 'tenant_intent';
  assetId: string;
}): Promise<void> {
  await Promise.all(
    input.circleIds.map((circleId) =>
      shareAssetToCircle({
        circleId,
        brokerId: input.brokerId,
        assetType: input.assetType,
        assetId: input.assetId,
      })
    )
  );
}

export async function unshareAsset(circleId: string, assetId: string, brokerId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("circle_shared_assets")
    .delete()
    .eq("circle_id", circleId)
    .eq("asset_id", assetId)
    .eq("broker_id", brokerId);
}

export async function getSharedAssets(circleId: string, filter?: {
  assetType?: 'building' | 'buyer_intent' | 'tenant_intent';
  brokerId?: string;
}): Promise<SharedAssetWithDetail[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from("circle_shared_assets")
    .select("*, broker_profile:profiles(display_name, company)")
    .eq("circle_id", circleId)
    .order("shared_at", { ascending: false });

  if (filter?.assetType) query = query.eq("asset_type", filter.assetType);
  if (filter?.brokerId) query = query.eq("broker_id", filter.brokerId);

  const { data: sharedAssets, error } = await query;
  if (error || !sharedAssets) return [];

  const result: SharedAssetWithDetail[] = [];

  for (const item of sharedAssets) {
    let detail: Record<string, any> = {};

    if (item.asset_type === "building") {
      const { data: b } = await supabase
        .from("building_ssot_lite")
        .select("id, area_signal, asset_type, price_band, size_signal, vacancy_signal, fit_summary")
        .eq("id", item.asset_id)
        .maybeSingle();

      if (b) {
        if (item.visibility === "signal_only") {
          detail = { area_signal: b.area_signal, asset_type: b.asset_type, price_band: b.price_band };
        } else {
          detail = b;
        }
      }
    } else if (item.asset_type === "buyer_intent") {
      const { data: bi } = await supabase
        .from("buyer_intent_lite")
        .select("id, buyer_type, budget_display, preferred_regions, asset_types, purchase_purpose, must_have")
        .eq("id", item.asset_id)
        .maybeSingle();

      if (bi) {
        if (item.visibility === "signal_only") {
          detail = { budget_display: bi.budget_display, preferred_regions: bi.preferred_regions, asset_types: bi.asset_types };
        } else {
          detail = bi;
        }
      }
    }

    result.push({
      ...(item as SharedAssetWithDetail),
      asset_detail: detail,
    });
  }

  return result;
}

export async function getMyShareableAssets(brokerId: string): Promise<ShareableAsset[]> {
  const supabase = createServiceClient();

  const [{ data: buildings }, { data: buyerIntents }, { data: sharedAssets }] = await Promise.all([
    supabase.from("building_ssot_lite").select("id, area_signal, asset_type, price_band").eq("broker_id", brokerId).order("created_at", { ascending: false }),
    supabase.from("buyer_intent_lite").select("id, buyer_type, budget_display, purchase_purpose").eq("broker_id", brokerId).order("created_at", { ascending: false }),
    supabase.from("circle_shared_assets").select("circle_id, asset_id").eq("broker_id", brokerId),
  ]);

  const sharedMap = new Map<string, string[]>();
  (sharedAssets || []).forEach((sa) => {
    const existing = sharedMap.get(sa.asset_id) || [];
    existing.push(sa.circle_id);
    sharedMap.set(sa.asset_id, existing);
  });

  const list: ShareableAsset[] = [];

  (buildings || []).forEach((b) => {
    list.push({
      id: b.id,
      type: "building",
      title: `${b.area_signal || "매물"} ${b.asset_type || ""}`,
      subtitle: b.price_band || "매매물건",
      shared_circle_ids: sharedMap.get(b.id) || [],
    });
  });

  (buyerIntents || []).forEach((bi) => {
    list.push({
      id: bi.id,
      type: "buyer_intent",
      title: `매수의향: ${bi.buyer_type || "고객"}`,
      subtitle: `${bi.budget_display || ""} · ${bi.purchase_purpose || ""}`,
      shared_circle_ids: sharedMap.get(bi.id) || [],
    });
  });

  return list;
}
