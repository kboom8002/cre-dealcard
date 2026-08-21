import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";

async function ensureBucket(svc: ReturnType<typeof createServiceClient>, name: string) {
  try {
    const { data: buckets } = await svc.storage.listBuckets();
    if (!buckets?.find((b: { name: string }) => b.name === name)) {
      const { error } = await svc.storage.createBucket(name, { public: true, fileSizeLimit: 20 * 1024 * 1024 });
      if (error) {
        console.error(`[ensureBucket] Failed to create bucket "${name}":`, error);
      }
    }
  } catch (e) {
    console.warn(`[ensureBucket] bucket check/create warning for ${name}:`, e);
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
      console.warn(`[Photo Upload] Transient error on attempt ${attempt + 1}, retrying:`, error.message);
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
      console.error("[Photo Upload API] Auth failed for building:", id);
      return guard.error;
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

    console.log(`[Photo Upload API] Processing ${allFiles.length} files for building ${id} by user ${guard.user?.id}`);

    const svc = createServiceClient();
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

        const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const ext = ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(rawExt) ? rawExt : "jpg";
        
        // Normalize content type for HEIC (some browsers report wrong MIME)
        let contentType = file.type || "image/jpeg";
        if (ext === "heic" && (!contentType || contentType === "application/octet-stream")) {
          contentType = "image/heic";
        }
        
        const safeKey = `${id}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        console.log(`[Photo Upload API] Uploading file ${i + 1}/${allFiles.length}: ${file.name} (${(file.size / 1024).toFixed(0)}KB, ${contentType})`);

        const result = await uploadFileWithRetry(svc, "building_photos", safeKey, buffer, contentType);
        
        if (result.url) {
          uploadedUrls.push(result.url);
        } else {
          console.error(`[Photo Upload API] Failed: ${file.name} -> ${result.error}`);
          errors.push(`${file.name}: ${result.error}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Photo Upload API] Process error for ${file.name}:`, errMsg);
        errors.push(`${file.name}: ${errMsg}`);
      }
    }

    if (uploadedUrls.length === 0) {
      const errorDetail = errors.join("; ");
      console.error(`[Photo Upload API] All uploads failed for building ${id}:`, errorDetail);
      return NextResponse.json(
        { error: `사진 업로드 실패: ${errorDetail}`, details: errors },
        { status: 500 }
      );
    }

    console.log(`[Photo Upload API] Success: ${uploadedUrls.length}/${allFiles.length} uploaded for building ${id}`);

    return NextResponse.json({
      ok: true,
      urls: uploadedUrls,
      uploadedCount: uploadedUrls.length,
      failedCount: allFiles.length - uploadedUrls.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Photo Upload API] Fatal error:", errMsg);
    return NextResponse.json(
      { error: `사진 업로드 서버 오류: ${errMsg}` },
      { status: 500 }
    );
  }
}
