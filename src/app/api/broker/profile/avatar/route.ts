/**
 * POST /api/broker/profile/avatar
 *
 * 브로커 프로필 사진 업로드.
 * - broker-avatars 버킷에 업로드
 * - profiles.photo_url 동기화 (Vibe Card에서 읽는 컬럼)
 * - broker_profiles.avatar_url 동기화
 * - (선택) Vibe AI 재분석 비동기 트리거
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface VerifiedRasterImage {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
}

function detectMagicByteImage(buffer: Buffer): VerifiedRasterImage | null {
  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    buffer.byteLength >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "");
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "파일 크기는 5MB 이하만 업로드할 수 있습니다.",
          code: "FILE_TOO_LARGE",
        },
        { status: 400 }
      );
    }

    const declaredMime = String(file.type || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
      return NextResponse.json(
        {
          error: "JPG, PNG, WebP 이미지 형식만 업로드할 수 있습니다.",
          code: "UNSUPPORTED_IMAGE_FORMAT",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "파일 크기는 5MB 이하만 업로드할 수 있습니다.",
          code: "FILE_TOO_LARGE",
        },
        { status: 400 }
      );
    }

    const verified = detectMagicByteImage(buffer);
    if (!verified || verified.mime !== declaredMime) {
      return NextResponse.json(
        {
          error: "유효한 JPG, PNG, WebP 이미지 바이너리가 아닙니다.",
          code: "UNSUPPORTED_IMAGE_FORMAT",
        },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Derive extension strictly from verified magic-byte image type
    const filename = `${user!.id}/avatar-${Date.now()}.${verified.ext}`;

    // Upload to 'broker-avatars' bucket
    const { error: uploadError } = await supabase
      .storage
      .from("broker-avatars")
      .upload(filename, buffer, {
        contentType: verified.mime,
        upsert: true,
      });

    if (uploadError) {
      log.error("[Avatar Upload Error]", uploadError);
      return NextResponse.json({ error: "업로드에 실패했습니다. (버킷이 존재하지 않을 수 있습니다.)" }, { status: 500 });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from("broker-avatars")
      .getPublicUrl(filename);

    // ─── Fix #1: profiles.photo_url 동기화 ───────────────────
    // Vibe Card (/vibe-card/[slug])가 profiles.photo_url을 읽으므로 반드시 동기화
    const { error: profileSyncError } = await supabase
      .from("profiles")
      .update({ photo_url: publicUrl })
      .eq("id", user!.id);

    if (profileSyncError) {
      if (!isMissingColumnError(profileSyncError)) {
        log.warn("[Avatar] profiles.photo_url sync failed:", profileSyncError.message);
      }
      // 비치명적 — 업로드 자체는 성공했으므로 계속 진행
    }

    // ─── Fix #2: broker_profiles.photo_url도 즉시 동기화 (42703-safe) ────
    const { error: bpSyncError } = await supabase
      .from("broker_profiles")
      .update({ photo_url: publicUrl })
      .eq("user_id", user!.id);

    if (bpSyncError) {
      log.warn("[Avatar] broker_profiles.photo_url sync skipped/failed:", bpSyncError.message);
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err: unknown) {
    log.error("[POST /api/broker/profile/avatar]", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}


