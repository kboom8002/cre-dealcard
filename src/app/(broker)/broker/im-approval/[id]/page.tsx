/**
 * /broker/im-approval/[id]
 * Broker IM Approval Workflow.
 * Preview → Edit Sections → Approve or Request Revision.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { IMApprovalClient } from './im-approval-client';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';

export const metadata: Metadata = {
  title: 'IM 승인 — 크리딜 브로커',
  description: 'AI 생성 IM을 검토하고 승인하거나 수정을 요청합니다.',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IMApprovalPage({ params }: Props) {
  const { id } = await params;

  // Auth check (using cookie-based auth in server component)
  const headerList = await headers();
  const mockReq = { headers: { get: (key: string) => headerList.get(key) ?? null, }, cookies: { getAll: () => [] } } as unknown as NextRequest;

  const supabase = createServiceClient();
  const { data: doc, error } = await supabase
    .from('document_objects')
    .select('id, title, content, status, created_at, building_id, metadata')
    .eq('id', id)
    .maybeSingle();

  if (error || !doc) {
    notFound();
  }

  return (
    <IMApprovalClient
      docId={id}
      title={doc.title ?? 'Mobile IM'}
      content={doc.content as Record<string, unknown>}
      status={doc.status ?? 'pending_approval'}
      buildingId={doc.building_id}
      createdAt={doc.created_at}
    />
  );
}
