import { NextRequest } from 'next/server';
import { handleImportContacts } from '@/lib/inbox/inbox-import';

export async function POST(req: NextRequest) {
  return handleImportContacts(req);
}
