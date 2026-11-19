/**
 * POST /api/admin/golden-sets/upload
 * 파일 업로드 (PDF/PPTX) → Supabase Storage 저장
 *
 * 현재는 STUB: 파일 업로드 + URL 반환만 수행.
 * TODO: file-parser.ts 연동하여 자동 섹션 파싱 구현
 */
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME_BY_EXT: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const ALLOWED_TYPES = Object.values(ALLOWED_MIME_BY_EXT);
const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_MIME_BY_EXT);
const STORAGE_BUCKET = 'golden-set-uploads';

function hasActiveMarkupHeader(buffer: Buffer): boolean {
  const head = buffer
    .subarray(0, 512)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith('<svg') ||
    head.startsWith('<!doctype') ||
    head.startsWith('<html') ||
    head.startsWith('<script') ||
    head.includes('<svg') ||
    head.includes('<script')
  );
}

function matchesExpectedMagicBytes(buffer: Buffer, ext: string): boolean {
  if (ext === 'pdf') {
    return buffer.byteLength >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (ext === 'pptx') {
    return (
      buffer.byteLength >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }
  return false;
}

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

    // ── File type validation (both extension AND MIME must match allowlist) ──
    const rawName = String(file.name || '').trim();
    const baseName = rawName.replace(/^.*[/\\]/, '');
    const ext = baseName.includes('.') ? baseName.split('.').pop()!.toLowerCase() : '';
    const declaredType = String(file.type || '').toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_TYPES.includes(declaredType)) {
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

    if (ALLOWED_MIME_BY_EXT[ext] !== declaredType) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: '파일 확장자와 MIME 형식이 일치하지 않습니다.',
          },
        },
        { status: 415 },
      );
    }

    // ── File size validation ──────────────────────────────────────────
    if (file.size <= 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION', message: '빈 파일은 업로드할 수 없습니다.' } },
        { status: 400 },
      );
    }

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

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength <= 0 || buffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION', message: '유효하지 않은 파일 크기입니다.' } },
        { status: 400 },
      );
    }

    if (hasActiveMarkupHeader(buffer)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'SVG 또는 HTML 스크립트 파일은 업로드할 수 없습니다.',
          },
        },
        { status: 415 },
      );
    }

    if (!matchesExpectedMagicBytes(buffer, ext)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: '파일 헤더 시그니처가 유효한 PDF/PPTX 형식이 아닙니다.',
          },
        },
        { status: 415 },
      );
    }

    // ── Upload to Supabase Storage under randomized UUID path ──────────
    const supabase = createServiceClient();
    const canonicalMime = ALLOWED_MIME_BY_EXT[ext];
    const storagePath = `golden-sets/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: canonicalMime,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    log.warn('[golden-sets] file-parser.ts 미연동 — 수동 섹션 파싱 필요');

    return NextResponse.json(
      {
        ok: true,
        data: {
          fileUrl: urlData.publicUrl,
          fileName: baseName || `upload.${ext}`,
          fileType: ext,
          message: '파일 업로드 완료. 파싱은 추후 구현.',
        },
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('[POST /api/admin/golden-sets/upload]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: '파일 업로드 중 오류가 발생했습니다.' } },
      { status: 500 },
    );
  }
}
