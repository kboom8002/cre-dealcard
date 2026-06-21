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

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err: any) {
    console.error("[POST /api/broker/profile/avatar]", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
