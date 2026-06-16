/**
 * /broker/im-approval/[id]
 * Broker IM Approval Workflow.
 * Preview → Edit Sections → Approve or Request Revision.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { IMApprovalClient } from './im-approval-client';

export const metadata: Metadata = {
  title: 'IM 승인 — 크리딜 브로커',
  description: 'AI 생성 IM을 검토하고 승인하거나 수정을 요청합니다.',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IMApprovalPage({ params }: Props) {
  const { id } = await params;

  if (!id || id.length < 10) {
    notFound();
  }

  const supabase = createServiceClient();
  const { data: doc, error } = await supabase
    .from('document_objects')
    .select('id, title, body, status, created_at, building_id, metadata')
    .eq('id', id)
    .maybeSingle();

  if (error || !doc || !doc.body) {
    notFound();
  }

  // body가 object인지 확인
  const bodyObj = typeof doc.body === 'object' && doc.body !== null
    ? (doc.body as Record<string, unknown>)
    : {};

  return (
    <IMApprovalClient
      docId={id}
      title={doc.title ?? 'Mobile IM'}
      content={bodyObj}
      status={doc.status ?? 'draft'}
      buildingId={doc.building_id ?? id}
      createdAt={doc.created_at}
    />
  );
}
