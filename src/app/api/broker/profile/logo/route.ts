import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/png", "image/webp", "image/svg+xml"];

// ── POST: Upload logo ───────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

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
        { error: "File too large (max 2MB)" },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PNG, WebP, SVG files are allowed" },
        { status: 400 }
      );
    }

    const svc = createServiceClient();

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "png";
    const storagePath = `broker-logos/${user.id}/${type}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await svc.storage
      .from("broker-assets")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Logo upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload logo" },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = svc.storage.from("broker-assets").getPublicUrl(storagePath);

    // Update broker_profiles
    const column = type === "company" ? "logo_company_url" : "logo_partner_url";
    const { error: dbError } = await svc
      .from("broker_profiles")
      .update({ [column]: `${publicUrl}?t=${Date.now()}` })
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Logo DB update error:", dbError);
      return NextResponse.json(
        { error: "Failed to save logo URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      type,
    });
  } catch (err) {
    console.error("Logo upload unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove logo ─────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type || !["company", "partner"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'company' or 'partner'" },
        { status: 400 }
      );
    }

    const svc = createServiceClient();

    // Set DB column to null
    const column = type === "company" ? "logo_company_url" : "logo_partner_url";
    const { error: dbError } = await svc
      .from("broker_profiles")
      .update({ [column]: null })
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Logo delete DB error:", dbError);
      return NextResponse.json(
        { error: "Failed to remove logo" },
        { status: 500 }
      );
    }

    // Try to delete from storage (non-critical)
    try {
      await svc.storage
        .from("broker-assets")
        .remove([`broker-logos/${user.id}/${type}.png`]);
    } catch {
      // Ignore storage deletion errors
    }

    return NextResponse.json({ ok: true, type });
  } catch (err) {
    console.error("Logo delete unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
