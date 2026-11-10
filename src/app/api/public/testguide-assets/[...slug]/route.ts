/**
 * @file src/app/api/public/testguide-assets/[...slug]/route.ts
 * @description Serves CSV rent rolls (with UTF-8 BOM) and 12 test images (JPG/PNG/WebP)
 * for https://credeal.net/testguide without committing new binary files to git (Rule 47).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { TESTGUIDE_DEALS } from '@/lib/testguide/testguide-data';

export const runtime = 'nodejs';

const BASE_IMAGE_MAP: Record<string, { baseFile: string; width: number; height: number; tint?: { brightness?: number; saturation?: number } }> = {
  '01_동교동_THEPARK_전면외관.jpg': { baseFile: '01_exterior.jpg', width: 1600, height: 1067 },
  '02_동교동_THEPARK_1층출입구.jpg': { baseFile: '03_entrance.jpg', width: 1280, height: 853, tint: { brightness: 1.03, saturation: 1.05 } },
  '03_동교동_THEPARK_내부실내.png': { baseFile: '05_interior.jpg', width: 1280, height: 853 },
  '04_동교동_THEPARK_루프탑테라스.webp': { baseFile: '08_rooftop.jpg', width: 1280, height: 853 },

  '01_부천_동아빌딩_전면외관.jpg': { baseFile: '02_exterior_side.jpg', width: 1600, height: 1067, tint: { brightness: 1.02, saturation: 0.96 } },
  '02_부천_동아빌딩_1층로비출입구.jpg': { baseFile: '04_lobby.jpg', width: 1280, height: 853 },
  '03_부천_동아빌딩_기준층내부실내.png': { baseFile: '06_office_room.jpg', width: 1280, height: 853, tint: { brightness: 1.04 } },
  '04_부천_동아빌딩_주차장설비.webp': { baseFile: 'dangsan/07_parking.jpg', width: 1280, height: 853 },

  '01_역삼동_여삼빌딩_전면외관.jpg': { baseFile: '01_exterior.jpg', width: 1600, height: 1067, tint: { brightness: 0.98, saturation: 1.08 } },
  '02_역삼동_여삼빌딩_메인로비.jpg': { baseFile: '04_lobby.jpg', width: 1280, height: 853 },
  '03_역삼동_여삼빌딩_오피스내부.png': { baseFile: '06_office_room.jpg', width: 1280, height: 853 },
  '04_역삼동_여삼빌딩_지하주차장.webp': { baseFile: 'dangsan/07_parking.jpg', width: 1280, height: 853 },
};

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
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(deal.csvFilename)}`,
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
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    }

    // Check local pre-generated file in docs/im261110/images/[folder]/[filename] first
    const localDocImgPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'docs', 'im261110', 'images', folder, filename);
    if (fs.existsSync(/*turbopackIgnore: true*/ localDocImgPath)) {
      const buf = fs.readFileSync(/*turbopackIgnore: true*/ localDocImgPath);
      return new NextResponse(new Uint8Array(buf), { status: 200, headers });
    }

    // Serverless fallback: synthesize from public/test-images/ via sharp
    const spec = BASE_IMAGE_MAP[filename] || {
      baseFile: '01_exterior.jpg',
      width: 1280,
      height: 853,
    };
    const publicImgDir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'test-images');
    const candidateBase = path.join(/*turbopackIgnore: true*/ publicImgDir, spec.baseFile);
    const fallbackBase = path.join(/*turbopackIgnore: true*/ publicImgDir, '01_exterior.jpg');
    const sourcePath = fs.existsSync(/*turbopackIgnore: true*/ candidateBase) ? candidateBase : fallbackBase;

    if (!fs.existsSync(/*turbopackIgnore: true*/ sourcePath)) {
      return NextResponse.json({ error: 'Base image asset missing' }, { status: 404 });
    }

    let pipeline = sharp(fs.readFileSync(/*turbopackIgnore: true*/ sourcePath)).resize(
      spec.width,
      spec.height,
      { fit: 'cover', position: 'center' }
    );
    if (spec.tint) {
      pipeline = pipeline.modulate(spec.tint);
    }

    const outBuffer =
      ext === '.png'
        ? await pipeline.png({ compressionLevel: 8 }).toBuffer()
        : ext === '.webp'
        ? await pipeline.webp({ quality: 86 }).toBuffer()
        : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

    return new NextResponse(new Uint8Array(outBuffer), { status: 200, headers });
  }

  return NextResponse.json({ error: 'Unknown asset type' }, { status: 404 });
}
