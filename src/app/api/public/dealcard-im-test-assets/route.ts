/**
 * @file src/app/api/public/dealcard-im-test-assets/route.ts
 * @description Zero-binary public test asset generator for https://credeal.net/dealcard-im-test
 * - ?kind=xlsx&preset=seogyo_nonstandard -> Real .xlsx with single "임차인/업종" col, "합계" footer, 공실, 전세, 자가사용
 * - ?kind=xlsx&preset=bojeong_standard   -> Real .xlsx standard 7-unit rent-roll
 * - ?kind=photo&slot=1..7[&download=1]   -> 7 architectural photos (5 landscape + 2 portrait 853x1280)
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import sharp from "sharp";
import { TESTGUIDE_IMAGE_CDN_MAP } from "@/lib/testguide/testguide-data";

export const runtime = "nodejs";

const PHOTO_SLOT_CONFIG: Record<
  number,
  {
    filename: string;
    asciiFallback: string;
    upstreamKey: string;
    portrait: boolean;
    ext: "jpg" | "png" | "webp";
    fallbackRgb: { r: number; g: number; b: number };
  }
> = {
  1: {
    filename: "01_건물전면외관.jpg",
    asciiFallback: "01_exterior.jpg",
    upstreamKey: "01_역삼동_여삼빌딩_전면외관.jpg",
    portrait: false,
    ext: "jpg",
    fallbackRgb: { r: 24, g: 49, b: 83 },
  },
  2: {
    filename: "02_1층주출입구.jpg",
    asciiFallback: "02_entrance.jpg",
    upstreamKey: "02_동교동_THEPARK_1층출입구.jpg",
    portrait: false,
    ext: "jpg",
    fallbackRgb: { r: 30, g: 58, b: 95 },
  },
  3: {
    filename: "03_메인로비_세로촬영.jpg",
    asciiFallback: "03_lobby_portrait.jpg",
    upstreamKey: "02_역삼동_여삼빌딩_메인로비.jpg",
    portrait: true,
    ext: "jpg",
    fallbackRgb: { r: 44, g: 62, b: 80 },
  },
  4: {
    filename: "04_기준층오피스내부.png",
    asciiFallback: "04_office_interior.png",
    upstreamKey: "03_역삼동_여삼빌딩_오피스내부.png",
    portrait: false,
    ext: "png",
    fallbackRgb: { r: 35, g: 78, b: 112 },
  },
  5: {
    filename: "05_옥상루프탑전경.webp",
    asciiFallback: "05_rooftop.webp",
    upstreamKey: "04_동교동_THEPARK_루프탑테라스.webp",
    portrait: false,
    ext: "webp",
    fallbackRgb: { r: 22, g: 82, b: 99 },
  },
  6: {
    filename: "06_승강기홀_세로촬영.jpg",
    asciiFallback: "06_hall_portrait.jpg",
    upstreamKey: "02_부천_동아빌딩_1층로비출입구.jpg",
    portrait: true,
    ext: "jpg",
    fallbackRgb: { r: 52, g: 73, b: 94 },
  },
  7: {
    filename: "07_자주식지하주차장.jpg",
    asciiFallback: "07_parking.jpg",
    upstreamKey: "04_역삼동_여삼빌딩_지하주차장.webp",
    portrait: false,
    ext: "jpg",
    fallbackRgb: { r: 39, g: 55, b: 70 },
  },
};

function buildSeogyoNonStandardWorkbook(): Buffer {
  const rows: Array<Array<string | number>> = [
    ["층", "호실", "임차인/업종", "전용면적(㎡)", "보증금(만원)", "월세(만원)", "관리비(만원)", "만기일"],
    ["B1", "B101호", "사운드 스튜디오", 314.05, 10000, 750, 90, "2027-11-30"],
    ["1F", "101호", "스페셜티 카페", 224.79, 15000, 1350, 110, "2028-03-31"],
    ["1F", "102호", "라이프스타일 편집숍", 204.96, 12000, 1150, 100, "2027-09-30"],
    ["2F", "201호", "브랜드 플래그십 쇼룸", 429.75, 20000, 1400, 150, "2028-06-30"],
    ["3F", "301호", "피부과 의원", 429.75, 20000, 1350, 150, "2028-12-31"],
    ["4F", "401호", "공실", 429.75, 0, 0, 0, "-"],
    ["5F", "501호", "건축사사무소", 429.75, 50000, 0, 140, "2027-08-31"],
    ["6F", "601호", "엔터테인먼트 오피스", 429.75, 15000, 1100, 140, "2027-10-31"],
    ["7F", "701호", "IT 디자인랩", 429.75, 15000, 1100, 140, "2028-02-28"],
    ["8F", "801호", "세무회계법인", 429.75, 15000, 1050, 140, "2027-12-31"],
    ["9F", "901호", "광고프로덕션", 429.75, 13000, 1000, 130, "2028-04-30"],
    ["10F", "1001호", "법인 사옥(자가사용)", 380.17, 0, 0, 0, "-"],
    ["합계", "", "12개 호실 합계", 4561.97, 185000, 10250, 1290, ""],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "임대현황_서교동2필지");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function buildBojeongStandardWorkbook(): Buffer {
  const rows: Array<Array<string | number>> = [
    ["층", "호수", "업종", "임차인", "임대면적(㎡)", "전용면적(㎡)", "보증금(만원)", "월임대료(만원)", "관리비(만원)", "만기일", "임대상태"],
    ["B1", "B101호", "운동시설", "프리미엄 피트니스", 310.0, 248.5, 5000, 380, 45, "2027-11-30", "임대"],
    ["1F", "101호", "휴게음식점", "베이커리 카페", 165.0, 132.4, 10000, 620, 50, "2028-04-30", "임대"],
    ["1F", "102호", "소매점", "약국·드럭스토어", 145.0, 115.8, 8000, 530, 40, "2028-02-28", "임대"],
    ["2F", "201호", "의원", "내과·검진클리닉", 310.0, 248.2, 7000, 450, 45, "2027-10-31", "임대"],
    ["3F", "301호", "공실", "공실", 310.0, 248.2, 0, 0, 0, "-", "공실"],
    ["4F", "401호", "업무시설", "회계법인 사무소", 310.0, 248.2, 35000, 0, 45, "2027-08-31", "전세"],
    ["5F", "501호", "업무시설", "건물주 운영 라운지", 265.0, 210.0, 0, 0, 0, "-", "자가사용"],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "보정동_표준렌트롤");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") || "";

  if (kind === "xlsx") {
    const preset = req.nextUrl.searchParams.get("preset") || "seogyo_nonstandard";
    const isStandard = preset === "bojeong_standard";
    const filename = isStandard
      ? "보정동_단필지_표준렌트롤_7개호실.xlsx"
      : "서교동_2필지_비표준렌트롤_합계행포함.xlsx";
    const asciiFallback = isStandard
      ? "bojeong_standard_rentroll.xlsx"
      : "seogyo_nonstandard_rentroll.xlsx";
    const buf = isStandard ? buildBojeongStandardWorkbook() : buildSeogyoNonStandardWorkbook();

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
          filename
        )}`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  if (kind === "photo") {
    const slotNum = Number(req.nextUrl.searchParams.get("slot") || "1");
    const cfg = PHOTO_SLOT_CONFIG[slotNum] || PHOTO_SLOT_CONFIG[1];
    const isDownload = req.nextUrl.searchParams.get("download") === "1";

    const contentType =
      cfg.ext === "png"
        ? "image/png"
        : cfg.ext === "webp"
        ? "image/webp"
        : "image/jpeg";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    };
    if (isDownload) {
      headers["Content-Disposition"] = `attachment; filename="${
        cfg.asciiFallback
      }"; filename*=UTF-8''${encodeURIComponent(cfg.filename)}`;
    }

    const targetW = cfg.portrait ? 853 : 1280;
    const targetH = cfg.portrait ? 1280 : 853;

    const cdnUrl = TESTGUIDE_IMAGE_CDN_MAP[cfg.upstreamKey];
    if (cdnUrl) {
      try {
        const upstream = await fetch(cdnUrl, { next: { revalidate: 86400 } });
        if (upstream.ok) {
          const rawBuf = Buffer.from(await upstream.arrayBuffer());
          const transformed = sharp(rawBuf).resize(targetW, targetH, {
            fit: "cover",
            position: "centre",
          });
          const outBuf =
            cfg.ext === "png"
              ? await transformed.png({ compressionLevel: 8 }).toBuffer()
              : cfg.ext === "webp"
              ? await transformed.webp({ quality: 88 }).toBuffer()
              : await transformed.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
          return new NextResponse(new Uint8Array(outBuf), { status: 200, headers });
        }
      } catch {
        // Fall through to pure geometric fallback
      }
    }

    // Pure geometric architectural fallback (ASCII only — Rule 35 compliant)
    const svgGrid = Buffer.from(
      `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${targetW}" height="${targetH}" fill="rgb(${cfg.fallbackRgb.r},${cfg.fallbackRgb.g},${cfg.fallbackRgb.b})"/>
        <rect x="60" y="60" width="${targetW - 120}" height="${targetH - 120}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="4"/>
        <text x="90" y="135" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="#FFFFFF">CREDEAL QA PHOTO #0${slotNum}</text>
        <text x="90" y="185" font-family="Arial, sans-serif" font-size="24" fill="#CBD5E1">${targetW} x ${targetH} (${cfg.portrait ? "PORTRAIT" : "LANDSCAPE"})</text>
      </svg>`
    );
    const fallbackPipeline = sharp(svgGrid);
    const outFallback =
      cfg.ext === "png"
        ? await fallbackPipeline.png().toBuffer()
        : cfg.ext === "webp"
        ? await fallbackPipeline.webp({ quality: 88 }).toBuffer()
        : await fallbackPipeline.jpeg({ quality: 88 }).toBuffer();

    return new NextResponse(new Uint8Array(outFallback), {
      status: 200,
      headers,
    });
  }

  return NextResponse.json(
    { error: "Unsupported asset query. Use ?kind=xlsx or ?kind=photo&slot=1..7" },
    { status: 400 }
  );
}
