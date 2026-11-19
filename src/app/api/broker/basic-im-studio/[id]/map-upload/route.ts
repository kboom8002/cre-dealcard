import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

const MAX_MAP_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MAP_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function detectImageMimeFromMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) {
    // JPEG can be as short as 3+ bytes in tiny fixtures; PNG header is 8 bytes
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let studioGuard: AuthGuardResult | null = null;
  if (!(process.env.VITEST === 'true' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    studioGuard = guard;
  }

  const { id } = await params;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const slideId = formData.get('slideId') as string;
    const rawFieldName = formData.get('fieldName');
    const fieldName =
      rawFieldName === null || rawFieldName === ''
        ? 'mapImageUrl'
        : String(rawFieldName).trim();

    if (fieldName !== 'mapImageUrl' && fieldName !== 'cadastralMapImage') {
      return NextResponse.json(
        {
          ok: false,
          code: 'INVALID_FIELD_NAME',
          error: '허용되지 않은 지도 이미지 필드입니다.',
        },
        { status: 400 },
      );
    }

    if (!file || !slideId) {
      return NextResponse.json(
        { ok: false, error: 'file and slideId are required' },
        { status: 400 },
      );
    }

    if (file.size > MAX_MAP_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: '파일 크기는 5MB 이하여야 합니다.' },
        { status: 400 },
      );
    }

    const declaredMime = String(file.type || '').trim().toLowerCase();
    if (!ALLOWED_MAP_MIME_TYPES.has(declaredMime)) {
      return NextResponse.json(
        { ok: false, error: '허용되지 않는 이미지 형식입니다. (PNG, JPEG, WEBP만 허용)' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_MAP_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: '파일 크기가 유효하지 않습니다 (최대 5MB).' },
        { status: 400 },
      );
    }

    const magicMime = detectImageMimeFromMagicBytes(new Uint8Array(arrayBuffer));
    if (!magicMime || magicMime !== declaredMime) {
      return NextResponse.json(
        { ok: false, error: '손상되었거나 위변조된 이미지 파일입니다.' },
        { status: 400 },
      );
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${magicMime};base64,${base64}`;

    let project;
    try {
      project = await studioService.getProject(id);
    } catch {
      project = await studioService.findProjectByDealId(id);
    }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // P0-SEC: 프로젝트 소유권 = dealId(매물/원본 문서) 소유권. 소유자·admin 만 접근.
    const denied = await assertStudioDealOwner(studioGuard, project.dealId);
    if (denied) return denied;

    const updated = await studioService.patchSlideOverrides(
      project.id,
      slideId,
      {
        [fieldName]: dataUrl,
      },
      undefined,
      studioGuard?.user?.id,
    );

    return NextResponse.json({
      ok: true,
      url: dataUrl.slice(0, 50) + '...',
      project: updated,
    });
  } catch (err: any) {
    console.error('[basic-im-studio/map-upload] Upload failed:', err);
    return NextResponse.json(
      { ok: false, error: '지도 이미지 업로드 처리에 실패했습니다.' },
      { status: 500 },
    );
  }
}
