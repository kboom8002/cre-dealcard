import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBroker } from '@/lib/auth-guard';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params
  
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing building id' }, { status: 400 })
  }

  try {
    const payload = await req.json().catch(() => ({}))
    
    if (payload.source !== 'js-space-ai-page') {
      return NextResponse.json({ ok: false, error: 'Invalid source' }, { status: 400 })
    }

    const supabase = createServiceClient()
    
    // Fetch current ssot lite
    const { data: building, error: fetchErr } = await supabase
      .from('building_ssot_lite')
      .select('*')
      .eq('id', id)
      .single()
      
    if (fetchErr || !building) {
      return NextResponse.json({ ok: false, error: 'Building not found' }, { status: 404 })
    }

    const signals = payload.leasing_signals || {}
    
    // Enrich layers
    const layers = building.layers || {}
    const leaseIncome = layers.lease_income || {}
    const buyerFit = layers.buyer_fit || {}
    
    // Update fields based on signals
    let current_use_signal = building.current_use_signal
    let fit_summary = building.fit_summary
    
    if (signals.inquiry_count && signals.inquiry_count > 0) {
      current_use_signal = `현재 임대 마케팅 진행 중 (최근 문의 ${signals.inquiry_count}건)`
    }
    
    if (signals.top_tenant_types && signals.top_tenant_types.length > 0) {
      fit_summary = `${fit_summary ? fit_summary + ' / ' : ''}임차 관심 업종: ${signals.top_tenant_types.join(', ')}`
      buyerFit.tenant_interest = signals.top_tenant_types
    }
    
    layers.lease_income = leaseIncome
    layers.buyer_fit = buyerFit
    
    // Save enriched
    const { error: updateErr } = await supabase
      .from('building_ssot_lite')
      .update({
        current_use_signal,
        fit_summary,
        layers,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateErr) {
      throw new Error(updateErr.message)
    }

    // Record event
    await supabase.from('activity_events').insert({
      actor_role: 'system',
      event_type: 'building_ssot_enriched_from_leasing',
      entity_type: 'building_ssot_lite',
      entity_id: id,
      source_app: 'js-building-ssot-mvp',
      metadata: {
        leasing_signals: signals
      }
    })

    return NextResponse.json({ ok: true, data: { current_use_signal, fit_summary } })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
