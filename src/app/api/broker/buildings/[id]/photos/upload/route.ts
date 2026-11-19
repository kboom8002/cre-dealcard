import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { createModuleLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createModuleLogger('route');
const SAFE_BUILDING_SEGMENT_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const HEIC_UNSUPPORTED_MESSAGE_KO =
  "아이폰 HEIC 원본 형식은 지원되지 않습니다. 카메라 설정에서 호환성(JPG)으로 변경하거나 JPG/PNG로 업로드해주세요.";

const HEIC_FTYP_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

function hasHeicMagicBytes(buf: Buffer): boolean {
  if (!buf || buf.byteLength < 12) return false;
  if (buf.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const majorBrand = buf.subarray(8, 12).toString("ascii").toLowerCase();
  if (HEIC_FTYP_BRANDS.has(majorBrand)) return true;
  const boxLen = Math.min(buf.byteLength, Math.max(12, buf.readUInt32BE(0)));
  for (let offset = 16; offset + 4 <= Math.min(boxLen, 64); offset += 4) {
    const compat = buf.subarray(offset, offset + 4).toString("ascii").toLowerCase();
    if (HEIC_FTYP_BRANDS.has(compat)) return true;
  }
  return false;
}

function isHeicOrHeifUpload(fileName: string, mimeType: string, buf: Buffer): boolean {
  const lowerMime = (mimeType || "").toLowerCase().trim();
  if (
    lowerMime === "image/heic" ||
    lowerMime === "image/heif" ||
    lowerMime === "image/heic-sequence" ||
    lowerMime === "image/heif-sequence"
  ) {
    return true;
  }
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  if (ext === "heic" || ext === "heif") {
    return true;
  }
  return hasHeicMagicBytes(buf);
}

type DetectedImageFormat =
  | { kind: "png"; ext: "png"; contentType: "image/png" }
  | { kind: "jpeg"; ext: "jpg"; contentType: "image/jpeg" }
  | { kind: "webp"; ext: "webp"; contentType: "image/webp" }
  | { kind: "heic"; ext: "heic"; contentType: "image/heic" };

function detectSupportedImageFormat(buf: Buffer): DetectedImageFormat | null {
  if (!buf || buf.byteLength < 3) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.byteLength >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { kind: "png", ext: "png", contentType: "image/png" };
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { kind: "jpeg", ext: "jpg", contentType: "image/jpeg" };
  }

  // WEBP: RIFF....WEBP
  if (
    buf.byteLength >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return { kind: "webp", ext: "webp", contentType: "image/webp" };
  }

  if (hasHeicMagicBytes(buf)) {
    return { kind: "heic", ext: "heic", contentType: "image/heic" };
  }

  return null;
}

async function convertHeicBufferWithSharp(
  rawBuffer: Buffer
): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  const pipeline = sharp(rawBuffer)
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });

  if (typeof (pipeline as unknown as { webp?: unknown }).webp === "function") {
    const webpBuf = await pipeline.webp({ quality: 84 }).toBuffer();
    if (webpBuf && webpBuf.byteLength > 0) {
      return { buffer: webpBuf, ext: "webp", contentType: "image/webp" };
    }
  }

  const jpegBuf = await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  if (!jpegBuf || jpegBuf.byteLength === 0) {
    throw new Error("Empty HEIC conversion output");
  }
  return { buffer: jpegBuf, ext: "jpg", contentType: "image/jpeg" };
}


async function ensureBucket(svc: ReturnType<typeof createServiceClient>, name: string) {
  try {
    const { data: buckets } = await svc.storage.listBuckets();
    if (!buckets?.find((b: { name: string }) => b.name === name)) {
      const { error } = await svc.storage.createBucket(name, { public: true, fileSizeLimit: 20 * 1024 * 1024 });
      if (error) {
        log.error(`[ensureBucket] Failed to create bucket "${name}":`, error);
      }
    }
  } catch (e) {
    log.warn(`[ensureBucket] bucket check/create warning for ${name}:`, e);
  }
}

/** Upload a single file to Supabase Storage with 1 retry on transient errors */
async function uploadFileWithRetry(
  svc: ReturnType<typeof createServiceClient>,
  bucket: string,
  safeKey: string,
  buffer: Buffer,
  contentType: string,
  maxRetries = 1,
): Promise<{ url: string | null; error: string | null }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await svc.storage
      .from(bucket)
      .upload(safeKey, buffer, {
        contentType,
        upsert: true,
      });

    if (!error && data) {
      const { data: publicUrlData } = svc.storage
        .from(bucket)
        .getPublicUrl(data.path);
      if (publicUrlData?.publicUrl) {
        return { url: publicUrlData.publicUrl, error: null };
      }
      return { url: null, error: "Public URL 생성 실패" };
    }

    // Transient errors worth retrying: rate limit, timeout, 5xx
    const isTransient = error?.message?.includes("timeout")
      || error?.message?.includes("Too Many")
      || error?.message?.includes("503")
      || error?.message?.includes("502");

    if (isTransient && attempt < maxRetries) {
      log.warn(`[Photo Upload] Transient error on attempt ${attempt + 1}, retrying:`, error.message);
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }

    return { url: null, error: error?.message || "Storage upload error" };
  }
  return { url: null, error: "Max retries exceeded" };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(request);
    if (guard.error) {
      log.error("[Photo Upload API] Auth failed for building:", id);
      return guard.error;
    }

    if (!id || !SAFE_BUILDING_SEGMENT_RE.test(id) || id.includes("..")) {
      return NextResponse.json(
        { ok: false, error: "유효하지 않은 매물 식별자입니다." },
        { status: 400 },
      );
    }

    const svc = createServiceClient();
    if (svc && typeof svc.from === "function") {
      const ownership = await assertBuildingOwner(svc, id, guard.user!.id, {
        allowAdmin: true,
        role: guard.role,
      });
      if (!ownership.ok) {
        return ownership.response;
      }
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;

    const allFiles: File[] = [];
    if (files && files.length > 0) {
      allFiles.push(...files.filter((f) => f instanceof File && f.size > 0));
    } else if (singleFile && singleFile instanceof File && singleFile.size > 0) {
      allFiles.push(singleFile);
    }

    if (allFiles.length === 0) {
      return NextResponse.json({ error: "업로드할 사진 파일이 없습니다." }, { status: 400 });
    }

    log.info(`[Photo Upload API] Processing ${allFiles.length} files for building ${id} by user ${guard.user?.id}`);

    await ensureBucket(svc, "building_photos");

    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      try {
        // Validate file size (max 20MB)
        if (file.size > 20 * 1024 * 1024) {
          errors.push(`${file.name}: 파일 크기 초과 (${(file.size / 1024 / 1024).toFixed(1)}MB > 20MB)`);
          continue;
        }

        const rawBuffer = Buffer.from(await file.arrayBuffer());
        const detectedFormat = detectSupportedImageFormat(rawBuffer);
        const isHeic =
          detectedFormat?.kind === "heic" ||
          (!detectedFormat && isHeicOrHeifUpload(file.name, file.type || "", rawBuffer));

        if (!detectedFormat) {
          log.warn(`[Photo Upload API] Rejected unsupported/spoofed file ${file.name} (${file.type || "unknown"})`);
          return NextResponse.json(
            {
              ok: false,
              error: isHeic
                ? HEIC_UNSUPPORTED_MESSAGE_KO
                : "지원되지 않는 파일 형식입니다. PNG, JPEG, WEBP, HEIC 이미지 파일만 업로드할 수 있습니다.",
              message: isHeic
                ? HEIC_UNSUPPORTED_MESSAGE_KO
                : "지원되지 않는 파일 형식입니다. PNG, JPEG, WEBP, HEIC 이미지 파일만 업로드할 수 있습니다.",
            },
            { status: 415 }
          );
        }

        let uploadBuffer: Buffer = rawBuffer;
        let ext: string = detectedFormat.ext;
        let contentType: string = detectedFormat.contentType;

        if (detectedFormat.kind === "heic") {
          try {
            const converted = await convertHeicBufferWithSharp(rawBuffer);
            uploadBuffer = converted.buffer;
            ext = converted.ext;
            contentType = converted.contentType;
          } catch (heicErr) {
            log.warn(`[Photo Upload API] HEIC conversion unsupported for ${file.name}:`, heicErr);
            return NextResponse.json(
              {
                ok: false,
                error: HEIC_UNSUPPORTED_MESSAGE_KO,
                message: HEIC_UNSUPPORTED_MESSAGE_KO,
              },
              { status: 415 }
            );
          }
        } else if (rawBuffer.byteLength > 350 * 1024) {
          try {
            const pipeline = sharp(rawBuffer)
              .rotate()
              .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
            const optimized =
              typeof (pipeline as unknown as { webp?: unknown }).webp === "function"
                ? await pipeline.webp({ quality: 84 }).toBuffer()
                : await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
            if (optimized && optimized.byteLength > 0) {
              uploadBuffer = optimized;
              ext = typeof (pipeline as unknown as { webp?: unknown }).webp === "function" ? "webp" : "jpg";
              contentType = ext === "webp" ? "image/webp" : "image/jpeg";
            }
          } catch {
            // Keep original verified raster buffer if sharp optimization is skipped
          }
        }

        const safeKey = `${id}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}.${ext}`;

        log.info(`[Photo Upload API] Uploading file ${i + 1}/${allFiles.length}: ${file.name} (${(uploadBuffer.byteLength / 1024).toFixed(0)}KB, ${contentType})`);

        const result = await uploadFileWithRetry(svc, "building_photos", safeKey, uploadBuffer, contentType);
        
        if (result.url) {
          uploadedUrls.push(result.url);
        } else {
          log.error(`[Photo Upload API] Failed: ${file.name} -> ${result.error}`);
          errors.push(`${file.name}: 업로드 실패`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error(`[Photo Upload API] Process error for ${file.name}:`, errMsg);
        errors.push(`${file.name}: 처리 오류`);
      }
    }

    if (uploadedUrls.length === 0) {
      log.error(`[Photo Upload API] All uploads failed for building ${id}:`, errors.join("; "));
      return NextResponse.json(
        { error: "사진 업로드에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 }
      );
    }

    log.info(`[Photo Upload API] Success: ${uploadedUrls.length}/${allFiles.length} uploaded for building ${id}`);

    return NextResponse.json({
      ok: true,
      urls: uploadedUrls,
      uploadedCount: uploadedUrls.length,
      failedCount: allFiles.length - uploadedUrls.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[Photo Upload API] Fatal error:", errMsg);
    return NextResponse.json(
      { error: "사진 업로드 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
