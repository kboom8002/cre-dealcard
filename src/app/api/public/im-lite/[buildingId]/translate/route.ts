/**
 * POST /api/public/im-lite/[buildingId]/translate
 * { language: 'en' | 'zh' | 'ja', doc_id: string }
 * Translates IM sections using GPT-4o.
 * Caches translation back to document_objects metadata.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { translateIMSections, type IMLanguage } from '@/domain/building/mobile-im/translator';

const VALID_LANGUAGES: IMLanguage[] = ['en', 'zh', 'ja'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;

  let language: IMLanguage;
  let docId: string;
  try {
    const body = await req.json();
    language = body.language;
    docId = body.doc_id;
    if (!VALID_LANGUAGES.includes(language)) {
      return NextResponse.json({ error: 'Invalid language. Use: en, zh, ja' }, { status: 400 });
    }
    if (!docId) {
      return NextResponse.json({ error: 'doc_id is required' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Load existing document
  const { data: doc, error: docErr } = await supabase
    .from('document_objects')
    .select('id, content, metadata')
    .eq('id', docId)
    .eq('building_id', buildingId)
    .maybeSingle();

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Check cache
  const meta = (doc.metadata ?? {}) as Record<string, unknown>;
  const cachedKey = `translated_${language}`;
  if (meta[cachedKey]) {
    return NextResponse.json({ ok: true, sections: meta[cachedKey], cached: true });
  }

  // Extract sections from document content
  const content = doc.content as Record<string, unknown>;
  const rawSections = content?.sections as Array<{ title?: string; markdown?: string; section_type?: string }> | undefined;
  if (!rawSections || rawSections.length === 0) {
    return NextResponse.json({ error: 'No sections found in document' }, { status: 422 });
  }

  const sections = rawSections.map((s) => ({
    title: s.title ?? '',
    content: s.markdown ?? '',
    sectionId: s.section_type,
  }));

  try {
    const translated = await translateIMSections({ sections, language });

    // Cache back to document_objects.metadata
    const updatedMeta = { ...meta, [cachedKey]: translated };
    await supabase
      .from('document_objects')
      .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
      .eq('id', docId);

    return NextResponse.json({ ok: true, sections: translated, cached: false });
  } catch (err) {
    console.error('[translate] Translation failed:', err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
