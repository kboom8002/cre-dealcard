import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";

async function ensureBucket(svc: ReturnType<typeof createServiceClient>, name: string) {
  try {
    const { data: buckets } = await svc.storage.listBuckets();
    if (!buckets?.find((b: { name: string }) => b.name === name)) {
      await svc.storage.createBucket(name, { public: true, fileSizeLimit: 20 * 1024 * 1024 });
    }
  } catch (e) {
    console.warn(`[ensureBucket] bucket check/create warning for ${name}:`, e);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(request);
    if (guard.error) return guard.error;

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

    const svc = createServiceClient();
    await ensureBucket(svc, "building_photos");

    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      try {
        const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const ext = ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(rawExt) ? rawExt : "jpg";
        const safeKey = `${id}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { data, error } = await svc.storage
          .from("building_photos")
          .upload(safeKey, buffer, {
            contentType: file.type || "image/jpeg",
            upsert: true,
          });

        if (error || !data) {
          console.error(`[Photo Upload API] Storage error for ${file.name}:`, error);
          errors.push(error?.message || "Storage error");
          continue;
        }

        const { data: publicUrlData } = svc.storage
          .from("building_photos")
          .getPublicUrl(data.path);

        if (publicUrlData?.publicUrl) {
          uploadedUrls.push(publicUrlData.publicUrl);
        }
      } catch (err) {
        console.error(`[Photo Upload API] Process error for ${file.name}:`, err);
        errors.push(String(err));
      }
    }

    if (uploadedUrls.length === 0) {
      return NextResponse.json(
        { error: `모든 사진 업로드에 실패했습니다: ${errors.join(", ")}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      urls: uploadedUrls,
      uploadedCount: uploadedUrls.length,
      failedCount: allFiles.length - uploadedUrls.length,
    });
  } catch (err) {
    console.error("[Photo Upload API] Fatal error:", err);
    return NextResponse.json(
      { error: "사진 업로드 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
