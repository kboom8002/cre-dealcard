/**
 * /broker/im-approval/[id]
 * Broker IM Approval Workflow.
 * Preview → Edit Sections → Approve or Request Revision.
 */
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { IMApprovalClient } from './im-approval-client';

export const metadata: Metadata = {
  title: 'IM 승인 — 크리딜 중개인',
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

  const { data: doc, error } = await supabase
    .from('document_objects')
    .select('id, title, body, status, created_at, building_id, owner_id')
    .eq('id', id)
    .maybeSingle();

  if (error || !doc || !doc.body) {
    notFound();
  }

  if (doc.owner_id !== user.id) {
    notFound();
  }

  // body가 object인지 확인
  const bodyObj = typeof doc.body === 'object' && doc.body !== null
    ? (doc.body as Record<string, unknown>)
    : {};

  const ssot = bodyObj.ssot_summary as Record<string, any> | undefined;
  const identity = bodyObj.identity as Record<string, any> | undefined;
  const posture = String(ssot?.investment_posture || identity?.investmentPosture || 'income');

  // 카카오맵 URL 생성 (coordinates가 없으면 주소 기반 geocoding 시도)
  let coordinates = (bodyObj as any)?.coordinates ?? ssot?.coordinates ?? identity?.coordinates;
  if (!coordinates?.lat || !coordinates?.lng) {
    const rawAddr = (ssot?.address as string) || (bodyObj as any)?.resolved_address || (ssot?.raw_address as string);
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
      docId={id}
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
