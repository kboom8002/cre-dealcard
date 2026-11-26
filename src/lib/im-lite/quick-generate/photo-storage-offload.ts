/**
 * @file src/lib/im-lite/quick-generate/photo-storage-offload.ts
 * @description Photo input normalization, >32KB inline base64 Supabase Storage offload, and JSONB diet filtering.
 */

import crypto from 'crypto';
import {
  isRealUploadedPhotoUrl,
  resolveKnownTestAssetUrl,
} from '@/lib/im-lite/quick-generate-store';

export const LARGE_INLINE_PHOTO_THRESHOLD_CHARS = 32 * 1024;

export interface NormalizedQuickPhoto {
  url: string;
  caption: string;
  role: string;
  category: string;
  type: string;
  isHero: boolean;
}

export function normalizeUserSubmittedPhotos(
  rawPhotos: unknown,
  opts?: {
    checkRealUploadedUrl?: (url: string) => boolean;
  },
): NormalizedQuickPhoto[] {
  if (!Array.isArray(rawPhotos)) return [];
  const checkRealUrl = opts?.checkRealUploadedUrl ?? isRealUploadedPhotoUrl;

  return rawPhotos
    .filter(
      (p: any) =>
        p &&
        (typeof p === 'string' || typeof p.url === 'string' || typeof p.name === 'string'),
    )
    .slice(0, 12)
    .map((p: any, idx: number): NormalizedQuickPhoto | null => {
      const rawUrl = (typeof p === 'string' ? p : String(p.url || '')).trim();
      const rawName = typeof p === 'object' ? String(p.name || p.caption || '') : '';
      const isRealUploadedUrl = checkRealUrl(rawUrl);
      const knownTestUrl = isRealUploadedUrl
        ? undefined
        : resolveKnownTestAssetUrl(rawName || rawUrl);
      const resolvedPhotoUrl = (isRealUploadedUrl ? rawUrl : knownTestUrl || rawUrl).trim();
      const isValidPhotoScheme =
        resolvedPhotoUrl.startsWith('http://') ||
        resolvedPhotoUrl.startsWith('https://') ||
        resolvedPhotoUrl.startsWith('/') ||
        resolvedPhotoUrl.startsWith('data:');
      if (
        !resolvedPhotoUrl ||
        !isValidPhotoScheme ||
        resolvedPhotoUrl.startsWith('blob:') ||
        resolvedPhotoUrl.startsWith('/test-images/')
      ) {
        return null;
      }
      const inferSource = `${rawName} ${rawUrl}`;
      const inferredCat =
        (typeof p === 'object' && (p.category || p.type)) ||
        (/외관|전경|exterior|facade/i.test(inferSource)
          ? 'exterior'
          : /로비|lobby/i.test(inferSource)
            ? 'lobby'
            : /출입구|입구|entrance/i.test(inferSource)
              ? 'entrance'
              : /주차|설비|parking/i.test(inferSource)
                ? 'parking'
                : /옥상|루프탑|테라스|rooftop/i.test(inferSource)
                  ? 'rooftop'
                  : /도면|평면도|floor_plan/i.test(inferSource)
                    ? 'floor_plan'
                    : idx === 0 && typeof p === 'object' && p.isHero
                      ? 'exterior'
                      : 'general');
      const defaultCaption =
        typeof p === 'object' && p.caption
          ? String(p.caption).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
          : rawName
            ? rawName
                .replace(/\.[^.]+$/, '')
                .replace(/^[0-9]+[_-\s]*/, '')
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            : '';
      return {
        url: resolvedPhotoUrl,
        caption: defaultCaption,
        role: (typeof p === 'object' && p.role) || (idx === 0 ? 'cover' : inferredCat),
        category: inferredCat,
        type: inferredCat,
        isHero: typeof p === 'object' && typeof p.isHero === 'boolean' ? p.isHero : idx === 0,
      };
    })
    .filter((p): p is NormalizedQuickPhoto => Boolean(p && p.url));
}

export async function offloadLargeInlinePhotosToStorage(params: {
  photos: any[];
  userId: string;
  buildingId: string;
  isTestEnv: boolean;
}): Promise<any[]> {
  const { photos, userId, buildingId, isTestEnv } = params;
  if (
    isTestEnv ||
    !photos.some(
      (p: any) =>
        typeof p?.url === 'string' &&
        p.url.startsWith('data:image/') &&
        p.url.length > LARGE_INLINE_PHOTO_THRESHOLD_CHARS,
    )
  ) {
    return photos;
  }

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const svc = createServiceClient();
    if (svc && typeof svc.storage?.from === 'function') {
      const sharpMod = await import('sharp').catch(() => null);
      const sharpFn: any = sharpMod?.default ?? sharpMod;
      const safeUserSeg = String(userId || 'broker').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeBldSeg = String(buildingId || 'draft').replace(/[^a-zA-Z0-9_-]/g, '_');

      const uploadCompressedToBucket = async (
        bucketName: string,
        storagePath: string,
        buf: Buffer,
        contentType: string,
      ): Promise<string | null> => {
        let upRes = await svc.storage.from(bucketName).upload(storagePath, buf, {
          contentType,
          upsert: true,
        });
        if (upRes.error && /bucket|not found/i.test(upRes.error.message || '')) {
          try {
            await svc.storage.createBucket(bucketName, { public: true });
            upRes = await svc.storage.from(bucketName).upload(storagePath, buf, {
              contentType,
              upsert: true,
            });
          } catch {
            // ignore bucket creation error and allow fallback
          }
        }
        if (!upRes.error && upRes.data?.path) {
          const { data: pubData } = svc.storage.from(bucketName).getPublicUrl(upRes.data.path);
          if (pubData?.publicUrl) return pubData.publicUrl;
        }
        return null;
      };

      const uploaded = await Promise.race([
        Promise.all(
          photos.map(async (photo: any) => {
            if (
              typeof photo?.url !== 'string' ||
              !photo.url.startsWith('data:image/') ||
              photo.url.length <= LARGE_INLINE_PHOTO_THRESHOLD_CHARS
            ) {
              return photo;
            }
            const match = photo.url.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (!match) return photo;

            const rawBuf = Buffer.from(match[2], 'base64');
            let outBuf: Buffer = rawBuf;
            let outExt = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
            let outContentType = `image/${match[1].toLowerCase()}`;

            if (typeof sharpFn === 'function') {
              try {
                const pipeline = sharpFn(rawBuf)
                  .rotate()
                  .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
                if (typeof pipeline.webp === 'function') {
                  const webpBuf = await pipeline.webp({ quality: 84 }).toBuffer();
                  if (webpBuf && webpBuf.byteLength > 0) {
                    outBuf = webpBuf;
                    outExt = 'webp';
                    outContentType = 'image/webp';
                  }
                } else if (typeof pipeline.jpeg === 'function') {
                  const jpgBuf = await pipeline.jpeg({ quality: 84 }).toBuffer();
                  if (jpgBuf && jpgBuf.byteLength > 0) {
                    outBuf = jpgBuf;
                    outExt = 'jpg';
                    outContentType = 'image/jpeg';
                  }
                }
              } catch {
                // Fall back to raw decoded buffer if sharp compression is unavailable
              }
            }

            const storagePath = `${safeUserSeg}/${safeBldSeg}/${crypto.randomUUID()}.${outExt}`;
            const publicUrl = await uploadCompressedToBucket(
              'building_photos',
              storagePath,
              outBuf,
              outContentType,
            );

            if (publicUrl) {
              return { ...photo, url: publicUrl };
            }
            return photo;
          }),
        ),
        new Promise<any[]>((resolve) => setTimeout(() => resolve(photos), 15000)),
      ]);
      if (Array.isArray(uploaded) && uploaded.length === photos.length) {
        return uploaded;
      }
    }
  } catch {
    // Graceful fallback: keep in-memory Data URI if Storage bucket is unavailable in test/dev
  }
  return photos;
}

export function filterPersistedPhotosForDb(defaultPhotos: any[]): any[] {
  const urlPhotos = Array.isArray(defaultPhotos)
    ? defaultPhotos.filter(
        (p: any) =>
          p &&
          typeof p.url === 'string' &&
          (p.url.startsWith('http://') ||
            p.url.startsWith('https://') ||
            p.url.startsWith('/')),
      )
    : [];
  const dataUriPhotos = Array.isArray(defaultPhotos)
    ? defaultPhotos
        .filter(
          (p: any) =>
            p &&
            typeof p.url === 'string' &&
            p.url.startsWith('data:') &&
            p.url.length <= LARGE_INLINE_PHOTO_THRESHOLD_CHARS,
        )
        .slice(0, 12)
    : [];
  return [...urlPhotos, ...dataUriPhotos];
}
