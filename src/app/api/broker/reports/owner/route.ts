import { NextRequest, NextResponse } from 'next/server';
import { generateOwnerReport } from '@/domain/magazine/owner-report-generator';
import { dispatchEdition } from '@/domain/magazine/rail/dispatcher';
import { buildAttrsFromSsotLite } from '@/lib/ssot-adapter';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(request: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(request);
  if (auth.error) return auth.error;

  try {
    const { assetId, ownerName, ownerEmail } = await request.json();

    if (!assetId || !ownerName) {
      return NextResponse.json({ ok: false, error: 'Missing assetId or ownerName' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: building } = await supabase
      .from('building_ssot_lite')
      .select('*')
      .eq('id', assetId)
      .single();

    if (!building) {
      return NextResponse.json({ ok: false, error: 'Asset not found' }, { status: 404 });
    }

    const attrs = buildAttrsFromSsotLite(building);
    const report = await generateOwnerReport(assetId, ownerName, attrs);

    // Save as magazine edition
    await supabase.from('magazine_editions').insert({
      edition_type: 'owner_report',
      asset_id: assetId,
      content_payload: report,
      status: 'published',
    });

    // Dispatch if email provided
    if (ownerEmail) {
      await dispatchEdition('owner_report', assetId, [{
        subscriberId: assetId,
        email: ownerEmail,
        segment: 'owner',
        preferences: {},
      }], JSON.stringify(report));
    }

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    console.error('[owner-report] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
