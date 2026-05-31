import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireBroker } from '@/lib/auth-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;
  const { id: clientId } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1. Fetch the client
  const { data: client } = await supabase
    .from('broker_clients')
    .select('id, client_type, linked_buyer_intent_ids')
    .eq('id', clientId)
    .eq('broker_id', auth.user!.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // 2. Fetch linked buyer intents to get the client's preferences
  const buyerIntentIds = (client.linked_buyer_intent_ids || []) as string[];

  let buyerIntents: any[] = [];
  if (buyerIntentIds.length > 0) {
    const { data } = await supabase
      .from('buyer_intent_lite')
      .select('preferred_regions, asset_types, budget_display, purchase_purpose')
      .in('id', buyerIntentIds);
    buyerIntents = data || [];
  }

  // 3. Also fetch tenant intents linked to this client
  const { data: tenantIntents } = await supabase
    .from('tenant_intent')
    .select('preferred_regions, business_type, budget_monthly_max, area_min, area_max')
    .eq('broker_id', auth.user!.id)
    .limit(5);

  // 4. Build curation results
  const saleResults: any[] = [];
  const leaseResults: any[] = [];

  // 4a. Sale property curation based on buyer intents
  if (buyerIntents.length > 0) {
    // Collect all preferred regions and asset types
    const allRegions = buyerIntents.flatMap((bi: any) => bi.preferred_regions || []);
    const allAssetTypes = buyerIntents.flatMap((bi: any) => bi.asset_types || []);
    const uniqueRegions = [...new Set(allRegions)];

    // Find matching sale properties (from ALL brokers for cross-matching)
    let saleQuery = supabase
      .from('building_ssot_lite')
      .select('id, area_signal, asset_type, price_band, status, matched_buyer_count, owner_id, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);

    if (uniqueRegions.length > 0) {
      saleQuery = saleQuery.in('area_signal', uniqueRegions);
    }

    const { data: saleProps } = await saleQuery;
    if (saleProps) {
      for (const prop of saleProps) {
        // Calculate a simple relevance score
        let relevance = 0;
        const reasons: string[] = [];

        if (uniqueRegions.includes(prop.area_signal)) {
          relevance += 40;
          reasons.push(`희망 권역 (${prop.area_signal}) 일치`);
        }
        if (allAssetTypes.includes(prop.asset_type)) {
          relevance += 30;
          reasons.push(`자산유형 (${prop.asset_type}) 일치`);
        }
        // Is this from another broker? (cross-match bonus)
        if (prop.owner_id !== auth.user!.id) {
          relevance += 10;
          reasons.push('타 중개인 매물 (크로스 매칭)');
        }
        if (relevance >= 20) {
          relevance = Math.min(relevance + 20, 100); // base relevance
          saleResults.push({
            id: prop.id,
            area_signal: prop.area_signal,
            asset_type: prop.asset_type,
            price_band: prop.price_band,
            matched_buyer_count: prop.matched_buyer_count,
            is_cross: prop.owner_id !== auth.user!.id,
            relevance,
            reasons,
          });
        }
      }
      saleResults.sort((a: any, b: any) => b.relevance - a.relevance);
    }
  }

  // 4b. Lease property curation
  if (client.client_type === 'buyer' || client.client_type === 'both') {
    const { data: leaseProps } = await supabase
      .from('lease_spaces')
      .select('id, floor, area_sqm, space_type, deposit, monthly_rent, status, area_signal, broker_id')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);

    if (leaseProps) {
      for (const prop of leaseProps) {
        let relevance = 30; // base
        const reasons: string[] = ['활성 임대 매물'];
        if (prop.broker_id !== auth.user!.id) {
          relevance += 10;
          reasons.push('타 중개인 매물');
        }
        leaseResults.push({
          id: prop.id,
          floor: prop.floor,
          area_pyeong: prop.area_sqm ? Math.round(prop.area_sqm / 3.3058) : null,
          space_type: prop.space_type,
          deposit: prop.deposit,
          monthly_rent: prop.monthly_rent,
          is_cross: prop.broker_id !== auth.user!.id,
          relevance,
          reasons,
        });
      }
    }
  }

  return NextResponse.json({
    data: {
      clientId,
      clientType: client.client_type,
      saleProperties: saleResults.slice(0, 5),
      leaseProperties: leaseResults.slice(0, 5),
      intentSummary: buyerIntents.map((bi: any) => ({
        regions: bi.preferred_regions,
        assetTypes: bi.asset_types,
        budget: bi.budget_display,
        purpose: bi.purchase_purpose,
      })),
    },
  });
}
