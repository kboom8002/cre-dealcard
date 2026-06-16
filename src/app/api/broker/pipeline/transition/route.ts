import { z } from 'zod/v4';
import { createClient } from '@supabase/supabase-js';
import { DealStage, validateBridgeTransition } from '@/domain/pipeline/bridge-state-machine';

const TransitionSchema = z.object({
  dealId: z.string().uuid(),
  buildingId: z.string().uuid(),
  from: z.string() as z.ZodType<DealStage>,
  to: z.string() as z.ZodType<DealStage>,
  metadata: z.record(z.string(), z.any()),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = TransitionSchema.parse(json);

    // TODO: Verify Authorization (skipping for MVP)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch current pipeline state
    const { data: currentState, error: fetchError } = await supabase
      .from('deal_pipeline_states')
      .select('current_stage, entered_at, metadata')
      .eq('id', input.dealId)
      .single();

    if (fetchError) {
      return Response.json({ error: 'Deal not found' }, { status: 404 });
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
