/**
 * @file src/app/api/public/testguide-assets/[...slug]/route.ts
 * @description Serves CSV rent rolls (with UTF-8 BOM) and 12 test images (JPG/PNG/WebP)
 * for https://credeal.net/testguide via Supabase Storage CDN or local files without committing binaries to git (Rule 47).
 */

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { TESTGUIDE_DEALS, TESTGUIDE_IMAGE_CDN_MAP } from '@/lib/testguide/testguide-data';
import { HOLDOUT_V2_ASSET_CDN_MAP } from '@/lib/testguide/full-loop-v2-holdout-data';
import { BROKER_CASE02_ASSET_CDN_MAP } from '@/lib/testguide/broker-full-loop-data';
import { isRealProductionRuntime } from '@/lib/env';

export const runtime = 'nodejs';

function timingSafeMatchKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function hasValidQaAccessKeyHeader(req: NextRequest): boolean {
  const candidates = [
    (req.headers.get('x-qa-access-key') || '').trim(),
    (req.cookies.get('cre_qa_key')?.value || '').trim(),
    (req.nextUrl.searchParams.get('qaKey') || req.nextUrl.searchParams.get('key') || '').trim(),
  ].filter(Boolean);
  if (candidates.length === 0) return false;

  const configuredKeys = [
    process.env.QA_ACCESS_KEY,
    process.env.QA_TESTER_ACCESS_KEY,
    process.env.QA_BROKER_ACCESS_KEY,
  ]
    .map((v) => (v || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    for (const key of configuredKeys) {
      if (timingSafeMatchKey(key, candidate)) return true;
    }
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  if (
    (isRealProductionRuntime() || process.env.CRE_ENFORCE_QA_GATE === '1') &&
    !hasValidQaAccessKeyHeader(req)
  ) {
    return NextResponse.json(
      { ok: false, error: 'Not Found' },
      { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow' } }
    );
  }

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

    // A) Check local pre-generated file (V2 Hold-out / Broker CASE-02 docs/finaltest/testdata or V1 docs/im261110/images) first
    if (folder === 'v2-case04' || folder === 'v2-case03' || folder === 'broker-case02') {
      const holdoutDir =
        folder === 'v2-case04'
          ? 'CASE-04_영등포_당산동5가_11-47_XLSX입력_다호실복합'
          : folder === 'v2-case03'
          ? 'CASE-03_서초_잠원동_26-14외1_화면입력_신축개발형'
          : 'CASE-02_서초_서초동_1364-28_화면입력_법인사옥형';
      const localHoldoutPath = path.join(
        /*turbopackIgnore: true*/ process.cwd(),
        'docs',
        'finaltest',
        'testdata',
        holdoutDir,
        'images',
        filename
      );
      if (fs.existsSync(/*turbopackIgnore: true*/ localHoldoutPath)) {
        const buf = fs.readFileSync(/*turbopackIgnore: true*/ localHoldoutPath);
        return new NextResponse(new Uint8Array(buf), { status: 200, headers });
      }
    }

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
    const cdnUrl =
      (folder === 'broker-case02' ? BROKER_CASE02_ASSET_CDN_MAP[filename] : undefined) ||
      TESTGUIDE_IMAGE_CDN_MAP[filename] ||
      HOLDOUT_V2_ASSET_CDN_MAP[filename] ||
      BROKER_CASE02_ASSET_CDN_MAP[filename];
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

    // B-2) Local clean public fallback before synthetic solid fill
    const publicRelFallback: Record<string, string> = {
      "01_부천_동아빌딩_전면외관.jpg": "test-images/dangsan/01_exterior.jpg",
      "02_부천_동아빌딩_1층로비출입구.jpg": "test-images/dangsan/03_entrance.jpg",
      "03_부천_동아빌딩_기준층내부실내.png": "test-images/dangsan/09_interior_clinic.jpg",
      "04_부천_동아빌딩_주차장설비.webp": "test-images/dangsan/07_parking.jpg",
      "01_역삼동_여삼빌딩_전면외관.jpg": "test-images/dangsan/02_aerial.jpg",
      "02_역삼동_여삼빌딩_메인로비.jpg": "test-images/dangsan/04_lobby.jpg",
      "03_역삼동_여삼빌딩_오피스내부.png": "test-images/dangsan/08_rooftop.jpg",
      "04_역삼동_여삼빌딩_지하주차장.webp": "test-images/dangsan/07_parking.jpg",
    };
    const fallbackRel = publicRelFallback[filename];
    if (fallbackRel) {
      const pubPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', fallbackRel);
      if (fs.existsSync(/*turbopackIgnore: true*/ pubPath)) {
        const buf = fs.readFileSync(/*turbopackIgnore: true*/ pubPath);
        return new NextResponse(new Uint8Array(buf), { status: 200, headers });
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
