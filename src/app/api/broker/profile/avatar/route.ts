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

    const supabase = createServiceClient();
    
    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use user id and original extension
    const ext = file.name.split('.').pop() || 'png';
    const filename = `${user!.id}/avatar-${Date.now()}.${ext}`;

    // Upload to 'broker-avatars' bucket
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from("broker-avatars")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Avatar Upload Error]", uploadError);
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
      console.warn("[Avatar] profiles.photo_url sync failed:", profileSyncError.message);
      // 비치명적 — 업로드 자체는 성공했으므로 계속 진행
    }

    // ─── Fix #2: broker_profiles.photo_url도 즉시 동기화 ────
    const { error: bpSyncError } = await supabase
      .from("broker_profiles")
      .upsert(
        { user_id: user!.id, photo_url: publicUrl },
        { onConflict: "user_id" }
      );

    if (bpSyncError) {
      console.warn("[Avatar] broker_profiles.photo_url sync failed:", bpSyncError.message);
    }

    // ─── Fix #3: Vibe AI 재분석 비동기 트리거 ────────────────
    // Vibe 분석 제거됨


    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err: any) {
    console.error("[POST /api/broker/profile/avatar]", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}


