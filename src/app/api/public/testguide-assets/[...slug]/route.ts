/**
 * @file src/app/api/public/testguide-assets/[...slug]/route.ts
 * @description Serves CSV rent rolls (with UTF-8 BOM) and 12 test images (JPG/PNG/WebP)
 * for https://credeal.net/testguide via Supabase Storage CDN or local files without committing binaries to git (Rule 47).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { TESTGUIDE_DEALS, TESTGUIDE_IMAGE_CDN_MAP } from '@/lib/testguide/testguide-data';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  if (!Array.isArray(slug) || slug.length === 0) {
    return NextResponse.json({ error: 'Asset path required' }, { status: 400 });
  }

  const kind = slug[0];

  // 1. CSV Rent Roll download (/api/public/testguide-assets/csv/[filename])
  if (kind === 'csv') {
    const filename = decodeURIComponent(slug[1] || '');
    const deal = TESTGUIDE_DEALS.find((d) => d.csvFilename === filename);
    if (!deal) {
      return NextResponse.json({ error: 'CSV not found' }, { status: 404 });
    }
    const bomCsv = '\uFEFF' + deal.csvContent;
    return new NextResponse(bomCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${deal.csvFilename}"; filename*=UTF-8''${encodeURIComponent(deal.csvFilename)}`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // 2. Test Image Asset (/api/public/testguide-assets/images/[folder]/[filename])
  if (kind === 'images') {
    const folder = decodeURIComponent(slug[1] || '');
    const filename = decodeURIComponent(slug[2] || '');
    const isDownload = req.nextUrl.searchParams.get('download') === '1';

    if (!filename || filename.includes('..') || folder.includes('..')) {
      return NextResponse.json({ error: 'Invalid image filename' }, { status: 400 });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    };
    if (isDownload) {
      const asciiFallback = `building_photo${ext || '.jpg'}`;
      headers['Content-Disposition'] = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    }

    // A) Check local pre-generated file in docs/im261110/images/[folder]/[filename] first
    const localDocImgPath = path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      'docs',
      'im261110',
      'images',
      folder,
      filename
    );
    if (fs.existsSync(/*turbopackIgnore: true*/ localDocImgPath)) {
      const buf = fs.readFileSync(/*turbopackIgnore: true*/ localDocImgPath);
      return new NextResponse(new Uint8Array(buf), { status: 200, headers });
    }

    // B) Production Vercel: Fetch real uploaded asset from Supabase Storage public CDN
    const cdnUrl = TESTGUIDE_IMAGE_CDN_MAP[filename];
    if (cdnUrl) {
      try {
        const upstream = await fetch(cdnUrl, { next: { revalidate: 86400 } });
        if (upstream.ok) {
          const arrBuf = await upstream.arrayBuffer();
          return new NextResponse(new Uint8Array(arrBuf), { status: 200, headers });
        }
      } catch {
        // Fall through to in-memory sharp synthesis if network fails
      }
    }

    // C) Zero-disk in-memory fallback via sharp (never 404s)
    const pipeline = sharp({
      create: {
        width: 1280,
        height: 853,
        channels: 3,
        background: { r: 30, g: 41, b: 59 },
      },
    });

    const outBuffer =
      ext === '.png'
        ? await pipeline.png({ compressionLevel: 8 }).toBuffer()
        : ext === '.webp'
        ? await pipeline.webp({ quality: 88 }).toBuffer()
        : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

    return new NextResponse(new Uint8Array(outBuffer), {
      status: 200,
      headers,
    });
  }

  return NextResponse.json({ error: 'Unknown asset kind' }, { status: 404 });
}
