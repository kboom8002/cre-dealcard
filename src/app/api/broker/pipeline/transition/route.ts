import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';
import { DealStage, validateBridgeTransition } from '@/domain/pipeline/bridge-state-machine';

const TransitionSchema = z.object({
  dealId: z.string().uuid(),
  buildingId: z.string().uuid(),
  from: z.string() as z.ZodType<DealStage>,
  to: z.string() as z.ZodType<DealStage>,
  metadata: z.record(z.string(), z.any()),
});

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;

    const json = await req.json();
    const input = TransitionSchema.parse(json);

    const supabase = createServiceClient();

    // 1. Fetch current pipeline state
    const { data: currentState, error: fetchError } = await supabase
      .from('deal_pipeline_states')
      .select('current_stage, entered_at, metadata, broker_id')
      .eq('id', input.dealId)
      .single();

    if (fetchError) {
      return Response.json({ error: 'Deal not found' }, { status: 404 });
    }

    if (currentState.broker_id && currentState.broker_id !== user!.id) {
      return Response.json({ error: 'Forbidden: Not your deal' }, { status: 403 });
    }

    if (currentState.current_stage !== input.from) {
      return Response.json({ error: `State mismatch. Expected ${currentState.current_stage}, got ${input.from}` }, { status: 400 });
    }

    // Merge existing metadata with new metadata
    const mergedMetadata = {
      ...(currentState.metadata || {}),
      ...input.metadata,
    };

    // 2. Validate transition
    const validation = validateBridgeTransition(input.from, input.to, mergedMetadata, currentState.entered_at);

    if (!validation.valid) {
      return Response.json({ 
        error: 'Validation failed', 
        missing: validation.missing 
      }, { status: 400 });
    }

    // 3. Update state
    const { error: updateError } = await supabase
      .from('deal_pipeline_states')
      .update({
        current_stage: input.to,
        entered_at: new Date().toISOString(),
        metadata: mergedMetadata,
      })
      .eq('id', input.dealId);

    if (updateError) throw updateError;

    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
