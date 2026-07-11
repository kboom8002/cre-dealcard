/**
 * POST /api/admin/golden-sets/upload
 * 파일 업로드 (PDF/PPTX) → Supabase Storage 저장
 *
 * 현재는 STUB: 파일 업로드 + URL 반환만 수행.
 * TODO: file-parser.ts 연동하여 자동 섹션 파싱 구현
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
];
const ALLOWED_EXTENSIONS = ['pdf', 'pptx'];
const STORAGE_BUCKET = 'golden-set-uploads';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION', message: '파일이 필요합니다.' } },
        { status: 400 },
      );
    }

    // ── File type validation ──────────────────────────────────────────
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: `허용되지 않는 파일 형식입니다. (허용: ${ALLOWED_EXTENSIONS.join(', ')})`,
          },
        },
        { status: 400 },
      );
    }

    // ── File size validation ──────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: `파일 크기가 20MB를 초과합니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
          },
        },
        { status: 400 },
      );
    }

    // ── Upload to Supabase Storage ────────────────────────────────────
    const supabase = createServiceClient();
    const storagePath = `uploads/${Date.now()}_${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    // TODO: file-parser.ts 연동
    // 여기에 파일 파싱 로직을 추가하여 섹션별 markdown을 추출합니다.
    // const parsed = await parseIMFile(buffer, ext);
    // return NextResponse.json({ ok: true, data: { fileUrl, sections: parsed } });

    return NextResponse.json(
      {
        ok: true,
        data: {
          fileUrl: urlData.publicUrl,
          fileName: file.name,
          fileType: ext,
          message: '파일 업로드 완료. 파싱은 추후 구현.',
        },
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/admin/golden-sets/upload]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}
