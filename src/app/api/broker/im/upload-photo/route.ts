import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET_NAME = "building_photos";
const MAX_DECODED_BYTES = 8 * 1024 * 1024; // 8 MB ceiling for inline JSON base64 uploads
const MAX_MULTIPART_BYTES = 16 * 1024 * 1024; // 16 MB ceiling for binary multipart uploads
const MAX_SIGNED_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB ceiling for direct-to-Storage signed uploads

type SupportedImageKind = "jpg" | "png" | "webp" | "heic";

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

export function isHeicMagicBytes(buf: Buffer): boolean {
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

function sniffMagicKind(buf: Buffer): SupportedImageKind | null {
  if (!buf || buf.byteLength < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  if (
    buf.byteLength >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (isHeicMagicBytes(buf)) {
    return "heic";
  }
  return null;
}

function classifyDeclaredMimeOrExt(
  rawMimeOrExt: string,
  fileName?: string
): SupportedImageKind | "unsupported" | "unknown" {
  const lower = (rawMimeOrExt || "").toLowerCase().trim();
  const cleanSub = lower.startsWith("image/") ? lower.slice("image/".length) : lower;

  if (cleanSub === "jpeg" || cleanSub === "jpg" || cleanSub === "pjpeg") return "jpg";
  if (cleanSub === "png") return "png";
  if (cleanSub === "webp") return "webp";
  if (
    cleanSub === "heic" ||
    cleanSub === "heif" ||
    cleanSub === "heic-sequence" ||
    cleanSub === "heif-sequence"
  ) {
    return "heic";
  }

  // Explicit non-supported image/vector formats (e.g. svg+xml) must fail with 415
  if (
    cleanSub &&
    cleanSub !== "application/octet-stream" &&
    cleanSub !== "binary/octet-stream" &&
    cleanSub !== "octet-stream"
  ) {
    return "unsupported";
  }

  const extMatch = (fileName || "").trim().match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  if (ext === "heic" || ext === "heif") return "heic";

  return "unknown";
}

function mimeForKind(kind: Exclude<SupportedImageKind, "heic">): {
  ext: string;
  contentType: string;
} {
  if (kind === "png") return { ext: "png", contentType: "image/png" };
  if (kind === "webp") return { ext: "webp", contentType: "image/webp" };
  return { ext: "jpg", contentType: "image/jpeg" };
}

async function normalizePhotoBufferForStorage(
  rawBuffer: Buffer,
  kind: SupportedImageKind
): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  if (kind === "heic") {
    const decodedRaw = await heicConvert({
      buffer: rawBuffer,
      format: "JPEG",
      quality: 0.86,
    });
    const jpegBuf = Buffer.isBuffer(decodedRaw)
      ? decodedRaw
      : Buffer.from(decodedRaw as ArrayBuffer);
    if (!jpegBuf || jpegBuf.byteLength === 0) {
      throw new Error("HEIC 이미지 변환 결과가 비어 있습니다.");
    }
    const resized = await sharp(jpegBuf)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer()
      .catch(() => jpegBuf);
    return { buffer: resized, ext: "jpg", contentType: "image/jpeg" };
  }

  const baseMime = mimeForKind(kind);
  // Optimize oversized raster photos (>350KB) while keeping tiny synthetic/unit-test buffers untouched on error
  if (rawBuffer.byteLength > 350 * 1024) {
    const optimized = await sharp(rawBuffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer()
      .catch(() => null);
    if (optimized && optimized.byteLength > 0) {
      return { buffer: optimized, ext: "jpg", contentType: "image/jpeg" };
    }
  }
  return { buffer: rawBuffer, ...baseMime };
}

function resolveSafeFolder(rawBuildingId: string, userId?: string): string {
  return rawBuildingId && /^[a-zA-Z0-9_-]{3,80}$/.test(rawBuildingId)
    ? rawBuildingId
    : `draft-${userId || "broker"}`;
}

async function uploadBufferAndGetPublicUrl(
  svc: ReturnType<typeof createServiceClient>,
  storagePath: string,
  buffer: Buffer,
  contentType: string
) {
  let { data: upData, error: upErr } = await svc.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (upErr && /bucket|not found/i.test(upErr.message || "")) {
    await svc.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => null);
    const retry = await svc.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });
    upData = retry.data;
    upErr = retry.error;
  }

  if (upErr || !upData?.path) {
    return {
      ok: false as const,
      status: 502,
      error: "STORAGE_UPLOAD_FAILED",
      message: upErr?.message || "사진 저장소 업로드에 실패했습니다.",
    };
  }

  const { data: pubData } = svc.storage.from(BUCKET_NAME).getPublicUrl(upData.path);
  if (!pubData?.publicUrl) {
    return {
      ok: false as const,
      status: 502,
      error: "PUBLIC_URL_FAILED",
      message: "사진 URL 생성에 실패했습니다.",
    };
  }

  return {
    ok: true as const,
    url: pubData.publicUrl,
    path: upData.path,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) {
    return auth.error;
  }

  const contentTypeHeader = (req.headers.get("content-type") || "").toLowerCase();

  // Mode 1: Binary multipart/form-data upload (1 file per request — zero base64 inflation, supports .HEIC/.HEIF)
  if (contentTypeHeader.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: "INVALID_FORM_DATA", message: "멀티파트 파일 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const fileEntry = formData.get("file");
    if (!fileEntry || typeof (fileEntry as Blob).arrayBuffer !== "function") {
      return NextResponse.json(
        { ok: false, error: "MISSING_FILE", message: "업로드할 사진 파일이 없습니다." },
        { status: 400 }
      );
    }

    const blob = fileEntry as File;
    const rawBuildingId = String(formData.get("buildingId") || "").trim();
    const fileName = String(formData.get("name") || blob.name || "").trim();
    const rawBuffer = Buffer.from(await blob.arrayBuffer());

    if (rawBuffer.byteLength === 0 || rawBuffer.byteLength > MAX_MULTIPART_BYTES) {
      return NextResponse.json(
        { ok: false, error: "IMAGE_TOO_LARGE", message: "이미지 용량이 허용 범위(16MB)를 초과했습니다." },
        { status: 413 }
      );
    }

    const magicKind = sniffMagicKind(rawBuffer);
    const declared = classifyDeclaredMimeOrExt(blob.type || "", fileName);
    const resolvedKind: SupportedImageKind | null =
      magicKind || (declared !== "unsupported" && declared !== "unknown" ? declared : null);

    if (!resolvedKind || declared === "unsupported") {
      return NextResponse.json(
        {
          ok: false,
          error: "UNSUPPORTED_MIME",
          message: "JPG, PNG, WEBP, HEIC(아이폰 사진) 형식만 업로드할 수 있습니다.",
        },
        { status: 415 }
      );
    }

    try {
      const normalized = await normalizePhotoBufferForStorage(rawBuffer, resolvedKind);
      const safeFolder = resolveSafeFolder(rawBuildingId, auth.user?.id);
      const storagePath = `${safeFolder}/im-photos/${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${normalized.ext}`;
      const svc = createServiceClient();
      const uploaded = await uploadBufferAndGetPublicUrl(
        svc,
        storagePath,
        normalized.buffer,
        normalized.contentType
      );
      if (!uploaded.ok) {
        return NextResponse.json(
          { ok: false, error: uploaded.error, message: uploaded.message },
          { status: uploaded.status }
        );
      }
      return NextResponse.json({
        ok: true,
        url: uploaded.url,
        path: uploaded.path,
        convertedFromHeic: resolvedKind === "heic",
      });
    } catch (err: unknown) {
      return NextResponse.json(
        {
          ok: false,
          error: resolvedKind === "heic" ? "HEIC_CONVERT_FAILED" : "INTERNAL_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "사진 변환 및 업로드 처리 중 오류가 발생했습니다.",
        },
        { status: resolvedKind === "heic" ? 422 : 500 }
      );
    }
  }

  // Mode 2 & 3: JSON body (signed direct-upload handshake OR inline base64 dataUrl)
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const rawBuildingId = typeof body.buildingId === "string" ? body.buildingId.trim() : "";
  const rawFileName = typeof body.name === "string" ? body.name.trim() : "";
  const safeFolder = resolveSafeFolder(rawBuildingId, auth.user?.id);

  // Mode 2A: Issue signed Storage upload URL for >3.8MB photos (bypasses Vercel 4.5MB serverless body ceiling)
  if (action === "create_signed_upload") {
    const byteLength = Number(body.byteLength || 0);
    if (byteLength > MAX_SIGNED_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: "IMAGE_TOO_LARGE", message: "사진 파일 용량은 최대 25MB까지 지원합니다." },
        { status: 413 }
      );
    }
    const extMatch = rawFileName.match(/\.([a-zA-Z0-9]{2,5})$/);
    const rawExt = extMatch ? extMatch[1].toLowerCase() : "bin";
    const tempPath = `${safeFolder}/im-raw-tmp/${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${rawExt}`;
    try {
      const svc = createServiceClient();
      let signedRes = await svc.storage.from(BUCKET_NAME).createSignedUploadUrl(tempPath);
      if (signedRes.error && /bucket|not found/i.test(signedRes.error.message || "")) {
        await svc.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => null);
        signedRes = await svc.storage.from(BUCKET_NAME).createSignedUploadUrl(tempPath);
      }
      if (signedRes.error || !signedRes.data?.signedUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: "SIGNED_URL_FAILED",
            message: signedRes.error?.message || "대용량 사진 업로드 경로 생성에 실패했습니다.",
          },
          { status: 502 }
        );
      }
      return NextResponse.json({
        ok: true,
        signedUrl: signedRes.data.signedUrl,
        token: signedRes.data.token,
        tempPath,
      });
    } catch (err: unknown) {
      return NextResponse.json(
        {
          ok: false,
          error: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "업로드 URL 발급 중 오류가 발생했습니다.",
        },
        { status: 500 }
      );
    }
  }

  // Mode 2B: Finalize raw file uploaded via signed URL -> transcode HEIC/oversized -> publish clean JPEG URL
  if (action === "finalize_uploaded_raw") {
    const tempPath = typeof body.tempPath === "string" ? body.tempPath.trim() : "";
    if (!tempPath || !tempPath.startsWith(`${safeFolder}/im-raw-tmp/`) || tempPath.includes("..")) {
      return NextResponse.json(
        { ok: false, error: "INVALID_TEMP_PATH", message: "유효하지 않은 임시 업로드 경로입니다." },
        { status: 400 }
      );
    }
    try {
      const svc = createServiceClient();
      const { data: dlBlob, error: dlErr } = await svc.storage.from(BUCKET_NAME).download(tempPath);
      await svc.storage.from(BUCKET_NAME).remove([tempPath]).catch(() => null);
      if (dlErr || !dlBlob) {
        return NextResponse.json(
          { ok: false, error: "TEMP_DOWNLOAD_FAILED", message: "업로드된 원본 파일을 읽지 못했습니다." },
          { status: 404 }
        );
      }
      const rawBuffer = Buffer.from(await dlBlob.arrayBuffer());
      const magicKind = sniffMagicKind(rawBuffer);
      const declared = classifyDeclaredMimeOrExt("", rawFileName || tempPath);
      const resolvedKind: SupportedImageKind | null =
        magicKind || (declared !== "unsupported" && declared !== "unknown" ? declared : null);
      if (!resolvedKind) {
        return NextResponse.json(
          {
            ok: false,
            error: "UNSUPPORTED_MIME",
            message: "JPG, PNG, WEBP, HEIC(아이폰 사진) 형식만 업로드할 수 있습니다.",
          },
          { status: 415 }
        );
      }
      const normalized = await normalizePhotoBufferForStorage(rawBuffer, resolvedKind);
      const finalPath = `${safeFolder}/im-photos/${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${normalized.ext}`;
      const uploaded = await uploadBufferAndGetPublicUrl(
        svc,
        finalPath,
        normalized.buffer,
        normalized.contentType
      );
      if (!uploaded.ok) {
        return NextResponse.json(
          { ok: false, error: uploaded.error, message: uploaded.message },
          { status: uploaded.status }
        );
      }
      return NextResponse.json({
        ok: true,
        url: uploaded.url,
        path: uploaded.path,
        convertedFromHeic: resolvedKind === "heic",
      });
    } catch (err: unknown) {
      return NextResponse.json(
        {
          ok: false,
          error: "FINALIZE_FAILED",
          message: err instanceof Error ? err.message : "사진 변환 마무리 중 오류가 발생했습니다.",
        },
        { status: 500 }
      );
    }
  }

  // Mode 3: Backwards-compatible inline dataUrl JSON upload (supports image/jpeg, png, webp, heic, and octet-stream HEIC)
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl.trim() : "";
  if (!dataUrl.startsWith("data:")) {
    return NextResponse.json(
      { ok: false, error: "INVALID_IMAGE", message: "유효한 이미지 데이터가 아닙니다." },
      { status: 400 }
    );
  }

  const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]*);base64,(.+)$/);
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "INVALID_DATA_URL", message: "이미지 인코딩 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const rawMime = match[1].toLowerCase().trim();
  const isImageOrOctetMime =
    rawMime.startsWith("image/") ||
    rawMime === "" ||
    rawMime === "application/octet-stream" ||
    rawMime === "binary/octet-stream";
  if (!isImageOrOctetMime) {
    return NextResponse.json(
      { ok: false, error: "INVALID_IMAGE", message: "유효한 이미지 데이터가 아닙니다." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_DECODED_BYTES) {
    return NextResponse.json(
      { ok: false, error: "IMAGE_TOO_LARGE", message: "이미지 용량이 허용 범위를 초과했습니다." },
      { status: 413 }
    );
  }

  const declared = classifyDeclaredMimeOrExt(rawMime, rawFileName);
  if (declared === "unsupported") {
    return NextResponse.json(
      {
        ok: false,
        error: "UNSUPPORTED_MIME",
        message: "JPG, PNG, WEBP, HEIC(아이폰 사진) 형식만 업로드할 수 있습니다.",
      },
      { status: 415 }
    );
  }

  const magicKind = sniffMagicKind(buffer);
  const resolvedKind: SupportedImageKind | null =
    declared !== "unknown" ? declared : magicKind;
  if (!resolvedKind) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNSUPPORTED_MIME",
        message: "JPG, PNG, WEBP, HEIC(아이폰 사진) 형식만 업로드할 수 있습니다.",
      },
      { status: 415 }
    );
  }

  try {
    const normalized = await normalizePhotoBufferForStorage(buffer, resolvedKind);
    const storagePath = `${safeFolder}/im-photos/${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${normalized.ext}`;
    const svc = createServiceClient();
    const uploaded = await uploadBufferAndGetPublicUrl(
      svc,
      storagePath,
      normalized.buffer,
      normalized.contentType
    );
    if (!uploaded.ok) {
      return NextResponse.json(
        { ok: false, error: uploaded.error, message: uploaded.message },
        { status: uploaded.status }
      );
    }

    return NextResponse.json({
      ok: true,
      url: uploaded.url,
      path: uploaded.path,
      convertedFromHeic: resolvedKind === "heic",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: resolvedKind === "heic" ? "HEIC_CONVERT_FAILED" : "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "사진 업로드 처리 중 오류가 발생했습니다.",
      },
      { status: resolvedKind === "heic" ? 422 : 500 }
    );
  }
}
