/**
 * POST /api/broker/buildings/[id]/snapshot/generate
 * Generates an AI Snapshot Draft for buildings with completeness_score >= 60.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runBuildingSnapshotAgent } from '@/ai/agents/BuildingSnapshotAgent';
import { validateSnapshotOutput } from '@/domain/building/snapshot-generator';
import { recordEvent } from '@/domain/analytics/record-event';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Fetch building
  const { data: building, error: bErr } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', id)
    .single();

  if (bErr || !building) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  // Check completeness score >= 60
  if (building.completeness_score < 60) {
    return NextResponse.json(
      {
        error: {
          code: 'COMPLETENESS_INSUFFICIENT',
          currentScore: building.completeness_score,
          message: '스냅샷을 생성하려면 완성도 점수가 최소 60점 이상이어야 합니다.',
        },
      },
      { status: 422 },
    );
  }

  // Fetch evidence files to get available layers
  const { data: files } = await supabase
    .from('evidence_files')
    .select('layer_category')
    .eq('building_id', id);
  const uploadedCategories = files?.map((f: any) => f.layer_category) || [];

  // Generate snapshot via AI Agent
  let result;
  try {
    result = await runBuildingSnapshotAgent({
      building,
      leaseSummary: building.lease_summary,
      availableEvidenceLayers: uploadedCategories,
    });
  } catch (agentErr: any) {
    return NextResponse.json(
      { error: 'AI 스냅샷 생성 중 오류가 발생했습니다: ' + agentErr.message },
      { status: 500 },
    );
  }

  const { snapshot, model, promptVersion } = result;

  // Run safety guardrail checks
  const safety = validateSnapshotOutput(snapshot);
  if (!safety.passed) {
    return NextResponse.json(
      {
        error: 'Safety check failed',
        violations: safety.violations,
      },
      { status: 400 },
    );
  }

  // Save to document_objects table
  const { data: doc, error: docErr } = await supabase
    .from('document_objects')
    .insert({
      owner_id: user!.id,
      source_type: 'building_ssot_lite',
      source_id: id,
      building_id: id,
      document_type: 'building_snapshot_draft',
      visibility: 'public_blind',
      status: 'draft',
      title: snapshot.headline,
      body: snapshot as any,
      model_version: model,
      prompt_version: promptVersion,
    })
    .select('id')
    .single();

  if (docErr || !doc) {
    return NextResponse.json(
      { error: '스냅샷 문서 저장에 실패했습니다: ' + docErr?.message },
      { status: 500 },
    );
  }

  // Record activity event
  await recordEvent(supabase, {
    actorId: user!.id,
    actorRole: 'broker',
    eventType: 'building_snapshot_generated',
    entityType: 'building_ssot_lite',
    entityId: id,
    metadata: {
      document_id: doc.id,
      model_version: model,
    },
  });

  return NextResponse.json({
    ok: true,
    documentId: doc.id,
    documentType: 'building_snapshot_draft',
    status: 'draft',
  });
}
