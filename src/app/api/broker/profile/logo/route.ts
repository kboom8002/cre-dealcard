import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


async function ensureBucket(svc: ReturnType<typeof createServiceClient>, name: string) {
  const { data: buckets } = await svc.storage.listBuckets();
  if (!buckets?.find((b: { name: string }) => b.name === name)) {
    await svc.storage.createBucket(name, { public: true, fileSizeLimit: 5 * 1024 * 1024 });
  }
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

// ── POST: Upload logo ───────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const guard = await requireBroker(request);
    if (guard.error || !guard.user) {
      return (
        guard.error ??
        NextResponse.json(
          { ok: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
          { status: 401 },
        )
      );
    }
    const { user } = guard;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!type || !["company", "partner"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'company' or 'partner'" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 5MB)", code: "FILE_TOO_LARGE" },
        { status: 400 }
      );
    }
    const declaredMime = String(file.type || "").toLowerCase();
    if (!ALLOWED_TYPES.has(declaredMime)) {
      return NextResponse.json(
        {
          error: "Only JPEG, PNG, and WebP images are allowed",
          code: "UNSUPPORTED_IMAGE_FORMAT",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 5MB)", code: "FILE_TOO_LARGE" },
        { status: 400 }
      );
    }

    const verified = detectMagicByteImage(buffer);
    if (!verified || verified.mime !== declaredMime) {
      return NextResponse.json(
        {
          error: "Invalid JPEG, PNG, or WebP image signature",
          code: "UNSUPPORTED_IMAGE_FORMAT",
        },
        { status: 400 }
      );
    }

    const svc = createServiceClient();

    // Ensure storage bucket exists
    await ensureBucket(svc, "broker-assets");

    // Upload to Supabase Storage using extension derived strictly from verified binary header
    const storagePath = `broker-logos/${user.id}/${type}.${verified.ext}`;

    const { error: uploadError } = await svc.storage
      .from("broker-assets")
      .upload(storagePath, buffer, {
        contentType: verified.mime,
        upsert: true,
      });

    if (uploadError) {
      log.error("Logo upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload logo" },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = svc.storage.from("broker-assets").getPublicUrl(storagePath);

    // Update broker_profiles (gracefully tolerate schema drift 42703 / PGRST204)
    const column = type === "company" ? "logo_company_url" : "logo_partner_url";
    const { error: dbError } = await svc
      .from("broker_profiles")
      .update({ [column]: `${publicUrl}?t=${Date.now()}` })
      .eq("user_id", user.id);

    if (dbError) {
      if (isMissingColumnError(dbError)) {
        log.warn("Logo column missing on broker_profiles (schema drift ignored)", {
          column,
          code: dbError.code,
        });
      } else {
        log.error("Logo DB update error:", dbError);
        return NextResponse.json(
          { error: "Failed to save logo URL" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      type,
    });
  } catch (err) {
    log.error("Logo upload unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove logo ─────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireBroker(request);
    if (guard.error || !guard.user) {
      return (
        guard.error ??
        NextResponse.json(
          { ok: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
          { status: 401 },
        )
      );
    }
    const { user } = guard;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type || !["company", "partner"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'company' or 'partner'" },
        { status: 400 }
      );
    }

    const svc = createServiceClient();

    // Set DB column to null (gracefully tolerate schema drift 42703 / PGRST204)
    const column = type === "company" ? "logo_company_url" : "logo_partner_url";
    const { error: dbError } = await svc
      .from("broker_profiles")
      .update({ [column]: null })
      .eq("user_id", user.id);

    if (dbError) {
      if (isMissingColumnError(dbError)) {
        log.warn("Logo column missing on broker_profiles during delete (ignored)", {
          column,
          code: dbError.code,
        });
      } else {
        log.error("Logo delete DB error:", dbError);
        return NextResponse.json(
          { error: "Failed to remove logo" },
          { status: 500 }
        );
      }
    }

    // Try to delete from storage (non-critical)
    try {
      await svc.storage
        .from("broker-assets")
        .remove([
          `broker-logos/${user.id}/${type}.png`,
          `broker-logos/${user.id}/${type}.jpg`,
          `broker-logos/${user.id}/${type}.webp`,
        ]);
    } catch {
      // Ignore storage deletion errors
    }

    return NextResponse.json({ ok: true, type });
  } catch (err) {
    log.error("Logo delete unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
