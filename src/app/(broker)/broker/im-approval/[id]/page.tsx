/**
 * /broker/im-approval/[id]
 * Broker IM Approval Workflow.
 * Preview → Edit Sections → Approve or Request Revision.
 */
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { IMApprovalClient } from './im-approval-client';

export const metadata: Metadata = {
  title: 'IM 승인 — 크리딜 공인중개사',
  description: 'AI 생성 IM을 검토하고 승인하거나 수정을 요청합니다.',
};

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IMApprovalPage({ params }: Props) {
  const { id } = await params;

  if (!id || id.length < 10) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const serviceClient = createServiceClient();
  let { data: doc, error } = await serviceClient
    .from('document_objects')
    .select('id, title, body, status, created_at, building_id, owner_id')
    .eq('id', id)
    .maybeSingle();

  if (!doc) {
    let fallbackQuery: any = serviceClient
      .from('document_objects')
      .select('id, title, body, status, created_at, building_id, owner_id')
      .eq('building_id', id);
    fallbackQuery =
      typeof fallbackQuery.in === 'function'
        ? fallbackQuery.in('document_type', ['im_lite', 'mobile_im'])
        : fallbackQuery.eq('document_type', 'im_lite');
    const fallbackRes = await fallbackQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    doc = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error || !doc || !doc.body) {
    notFound();
  }

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin';
  if (doc.owner_id !== user.id && !isAdmin) {
    notFound();
  }

  // body가 object인지 확인
  const bodyObj = typeof doc.body === 'object' && doc.body !== null
    ? (doc.body as Record<string, unknown>)
    : {};

  const ssot = bodyObj.ssot_summary as Record<string, unknown> | undefined;
  const identity = bodyObj.identity as Record<string, unknown> | undefined;
  const posture = String(ssot?.investment_posture || identity?.investmentPosture || 'income');

  // 카카오맵 URL 생성 (coordinates가 없으면 주소 기반 geocoding 시도)
  let coordinates = (bodyObj.coordinates ?? ssot?.coordinates ?? identity?.coordinates) as
    | { lat?: number | string; lng?: number | string }
    | undefined;
  if (!coordinates?.lat || !coordinates?.lng) {
    const rawAddr =
      (ssot?.address as string | undefined) ||
      (bodyObj.resolved_address as string | undefined) ||
      (ssot?.raw_address as string | undefined);
    if (rawAddr) {
      try {
        const { geocodeAddress } = await import('@/domain/verification/address-resolver');
        const geo = await geocodeAddress(rawAddr);
        if (geo?.lat && geo?.lng) {
          coordinates = { lat: geo.lat, lng: geo.lng };
        }
      } catch {
        // geocode 실패 무시
      }
    }
  }

  let kakaoMapUrl: string | null = null;
  if (coordinates?.lat && coordinates?.lng) {
    const { buildKakaoStaticMapUrl } = await import('@/lib/external/kakao-static-map');
    kakaoMapUrl = buildKakaoStaticMapUrl({ lat: Number(coordinates.lat), lng: Number(coordinates.lng), width: 768, height: 320 });
  }

  return (
    <IMApprovalClient
      docId={doc.id}
      title={doc.title ?? 'Mobile IM'}
      content={bodyObj}
      status={doc.status ?? 'draft'}
      buildingId={doc.building_id ?? id}
      createdAt={doc.created_at}
      posture={posture}
      kakaoMapUrl={kakaoMapUrl}
    />
  );
}
