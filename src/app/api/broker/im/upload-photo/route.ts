import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET_NAME = "building_photos";
const MAX_DECODED_BYTES = 8 * 1024 * 1024; // 8 MB safety ceiling per photo

function normalizeImageMime(rawExt: string): { ext: string; contentType: string } | null {
  const lower = rawExt.toLowerCase().trim();
  if (lower === "jpeg" || lower === "jpg") {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (lower === "png") {
    return { ext: "png", contentType: "image/png" };
  }
  if (lower === "webp") {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) {
    return auth.error;
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl.trim() : "";
  const rawBuildingId = typeof body.buildingId === "string" ? body.buildingId.trim() : "";
  if (!dataUrl.startsWith("data:image/")) {
    return NextResponse.json(
      { ok: false, error: "INVALID_IMAGE", message: "유효한 이미지 데이터가 아닙니다." },
      { status: 400 }
    );
  }

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "INVALID_DATA_URL", message: "이미지 인코딩 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const mimeInfo = normalizeImageMime(match[1]);
  if (!mimeInfo) {
    return NextResponse.json(
      { ok: false, error: "UNSUPPORTED_MIME", message: "JPG, PNG, WEBP 형식만 업로드할 수 있습니다." },
      { status: 415 }
    );
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_DECODED_BYTES) {
    return NextResponse.json(
      { ok: false, error: "IMAGE_TOO_LARGE", message: "이미지 용량이 허용 범위를 초과했습니다." },
      { status: 413 }
    );
  }

  const safeFolder =
    rawBuildingId && /^[a-zA-Z0-9_-]{3,80}$/.test(rawBuildingId)
      ? rawBuildingId
      : `draft-${auth.user?.id || "broker"}`;
  const storagePath = `${safeFolder}/im-photos/${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${mimeInfo.ext}`;

  try {
    const svc = createServiceClient();
    let { data: upData, error: upErr } = await svc.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mimeInfo.contentType,
        upsert: true,
      });

    if (upErr && /bucket|not found/i.test(upErr.message || "")) {
      await svc.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => null);
      const retry = await svc.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
        contentType: mimeInfo.contentType,
        upsert: true,
      });
      upData = retry.data;
      upErr = retry.error;
    }

    if (upErr || !upData?.path) {
      return NextResponse.json(
        {
          ok: false,
          error: "STORAGE_UPLOAD_FAILED",
          message: upErr?.message || "사진 저장소 업로드에 실패했습니다.",
        },
        { status: 502 }
      );
    }

    const { data: pubData } = svc.storage.from(BUCKET_NAME).getPublicUrl(upData.path);
    if (!pubData?.publicUrl) {
      return NextResponse.json(
        { ok: false, error: "PUBLIC_URL_FAILED", message: "사진 URL 생성에 실패했습니다." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: pubData.publicUrl,
      path: upData.path,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "사진 업로드 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
