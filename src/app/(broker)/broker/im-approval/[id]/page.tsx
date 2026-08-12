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

  return (
    <IMApprovalClient
      docId={id}
      title={doc.title ?? 'Mobile IM'}
      content={bodyObj}
      status={doc.status ?? 'draft'}
      buildingId={doc.building_id ?? id}
      createdAt={doc.created_at}
      posture={posture}
    />
  );
}
