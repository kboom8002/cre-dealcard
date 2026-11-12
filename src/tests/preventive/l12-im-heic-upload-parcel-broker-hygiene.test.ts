/**
 * L12. 실사용 브로커 IM 작성 마찰 원천 차단 예방 테스트 (PT-1201 ~ PT-1204)
 *
 * 실전 프로덕션 브로커 세션(2026-11-12 서교석 님 IM 작성 로그) 교훈:
 * - PT-1201: 아이폰 .HEIC/.HEIF(`application/octet-stream` 포함) 바이너리 멀티파트/서명 업로드 변환 + `sanitizePhotosForSync` 413 페이로드 가드
 * - PT-1202: `KNOWN_PARCEL_REGISTRY`의 `양평동4가` 오매칭(당산동5가 11-47 납치) 차단 및 기본 시드(`bld-01`~`bld-03`) 실존 필지/PNU 정합성 검증
 * - PT-1203: `'담당 중개법인 (확인 중)'` 독소 토큰 원천 제거(`'전담 중개사무소'`) 및 `broker_profiles` 실존 컬럼 쿼리 검증(PostgREST 42703 차단)
 * - PT-1204: `comparable_analysis` 회피 문구(`인근 실거래 및 시세 데이터 분석 중`, `공시지가 확인 중`) 제로화 및 총수익률(`4.39%`)·Cap Rate(`4.00%`) 병기 정밀도 검증
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireBroker = vi.fn();
const mockResolveAddress = vi.fn();
const mockFetchBuildingRegister = vi.fn();
const mockFetchLandPrice = vi.fn();
const mockFetchComparableTransactions = vi.fn();
const mockHeicConvert = vi.fn();
const mockStorageUpload = vi.fn();
const mockStorageGetPublicUrl = vi.fn();
const mockStorageCreateSignedUploadUrl = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock("heic-convert", () => ({
  default: (...args: unknown[]) => mockHeicConvert(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: mockStorageUpload,
        getPublicUrl: mockStorageGetPublicUrl,
        createSignedUploadUrl: mockStorageCreateSignedUploadUrl,
      }),
      createBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: () => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        ilike: () => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      upsert: () => ({
        select: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/external/address-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external/address-resolver")>();
  return {
    ...actual,
    resolveAddress: (...args: unknown[]) => mockResolveAddress(...args),
  };
});

vi.mock("@/lib/external/building-register-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external/building-register-api")>();
  return {
    ...actual,
    fetchBuildingRegister: (...args: unknown[]) => mockFetchBuildingRegister(...args),
  };
});

vi.mock("@/lib/external/land-use-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external/land-use-api")>();
  return {
    ...actual,
    fetchLandPrice: (...args: unknown[]) => mockFetchLandPrice(...args),
  };
});

vi.mock("@/lib/external/real-transaction-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external/real-transaction-api")>();
  return {
    ...actual,
    fetchComparableTransactions: (...args: unknown[]) => mockFetchComparableTransactions(...args),
  };
});

import { extractPureBuildingFacts, buildBasicImDocument } from "@/domain/building/im-core";
import { getDefaultSeeds, getQuickImRecord } from "@/lib/im-lite/quick-generate-store";
import { POST as uploadPhotoPOST, isHeicMagicBytes } from "@/app/api/broker/im/upload-photo/route";
import { POST as quickGeneratePOST } from "@/app/api/broker/im-lite/quick-generate/route";
import {
  isHeicLikeFile,
  isSafeInlineImageDataUrl,
  sanitizePhotosForSync,
} from "@/app/(broker)/broker/w/im/page";

function buildSyntheticHeicBoxBuffer(majorBrand = "heic"): Buffer {
  // 24-byte ISO BMFF ftyp box: [size=24][ftyp][majorBrand][minorVersion=0][compat1=mif1][compat2=heic]
  const buf = Buffer.alloc(32, 0);
  buf.writeUInt32BE(24, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write(majorBrand.padEnd(4, " ").slice(0, 4), 8, "ascii");
  buf.writeUInt32BE(0, 12);
  buf.write("mif1", 16, "ascii");
  buf.write("heic", 20, "ascii");
  return buf;
}

describe("L12 Live Broker IM Authoring Friction Preventive Suite (PT-1201 ~ PT-1204)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireBroker.mockResolvedValue({
      user: { id: "broker-seogyoseok" },
      role: "broker",
      error: null,
    });
    mockResolveAddress.mockResolvedValue({
      pnu: "1156012800101170000",
      roadAddress: "서울특별시 영등포구 선유로53길 22",
      jibunAddress: "서울특별시 영등포구 양평동4가 117",
      lat: 37.53767,
      lng: 126.89472,
    });
    mockFetchBuildingRegister.mockResolvedValue({
      buildingName: "양평동 근린상가",
      landAreaSqm: 380,
      grossFloorAreaSqm: 1120,
      buildingCoverageRatio: 56.2,
      floorAreaRatio: 248.5,
      mainPurpose: "제2종근린생활시설",
      zoning: "준공업지역",
      groundFloors: 5,
      undergroundFloors: 1,
      StructureName: "철근콘크리트구조",
    });
    mockFetchLandPrice.mockResolvedValue({
      officialLandPricePerSqm: 6_850_000,
      baseYear: "2026",
    });
    mockFetchComparableTransactions.mockResolvedValue([]);
  });

  it("[PT-1201] transcodes .HEIC/.HEIF (including application/octet-stream) to JPEG on upload-photo and blocks >4.5MB 413 inline payloads", async () => {
    const sampleJpeg = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 3,
        background: { r: 32, g: 84, b: 147 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer();

    const uploadedObjects: Array<{ path: string; contentType: string; byteLength: number }> = [];
    mockHeicConvert.mockResolvedValue(sampleJpeg);
    mockStorageUpload.mockImplementation(
      async (storagePath: string, buf: Buffer, opts: { contentType: string }) => {
        uploadedObjects.push({
          path: storagePath,
          contentType: opts.contentType,
          byteLength: buf.byteLength,
        });
        return { data: { path: storagePath }, error: null };
      }
    );
    mockStorageGetPublicUrl.mockImplementation((storagePath: string) => ({
      data: {
        publicUrl: `https://proj.supabase.co/storage/v1/object/public/building_photos/${storagePath}`,
      },
    }));
    mockStorageCreateSignedUploadUrl.mockImplementation(async (tempPath: string) => ({
      data: {
        signedUrl: `https://proj.supabase.co/storage/v1/object/upload/sign/building_photos/${tempPath}?token=tok`,
        token: "tok",
        path: tempPath,
      },
      error: null,
    }));

    // 1. Magic-byte detection for ISO BMFF ftyp box (`heic` and `mif1` compatible brand)
    const heicBuf = buildSyntheticHeicBoxBuffer("heic");
    const mif1HeicBuf = buildSyntheticHeicBoxBuffer("mif1");
    expect(isHeicMagicBytes(heicBuf)).toBe(true);
    expect(isHeicMagicBytes(mif1HeicBuf)).toBe(true);
    expect(isHeicMagicBytes(sampleJpeg)).toBe(false);

    // 2. Binary multipart upload with empty/octet-stream MIME (Windows Chrome `.HEIC` drag-drop behavior)
    const formData = new FormData();
    const heicFile = new File([new Uint8Array(heicBuf)], "IMG_4821_외관.HEIC", {
      type: "application/octet-stream",
    });
    formData.append("file", heicFile);
    formData.append("buildingId", "bld-01");
    formData.append("name", "IMG_4821_외관.HEIC");

    const mpReq = new NextRequest("https://www.credeal.net/api/broker/im/upload-photo", {
      method: "POST",
      body: formData,
    });
    const mpRes = await uploadPhotoPOST(mpReq);
    const mpJson = await mpRes.json();
    expect(mpRes.status).toBe(200);
    expect(mpJson.ok).toBe(true);
    expect(mpJson.convertedFromHeic).toBe(true);
    expect(mpJson.url).toMatch(/\.jpg$/);
    expect(uploadedObjects[0]?.contentType).toBe("image/jpeg");

    // 3. Signed upload handshake for >3.8MB raw iPhone photos (bypasses Vercel 4.5MB ceiling)
    const signedReq = new NextRequest("https://www.credeal.net/api/broker/im/upload-photo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create_signed_upload",
        buildingId: "bld-01",
        name: "IMG_9999.HEIC",
        byteLength: 7_200_000,
      }),
    });
    const signedRes = await uploadPhotoPOST(signedReq);
    const signedJson = await signedRes.json();
    expect(signedRes.status).toBe(200);
    expect(signedJson.ok).toBe(true);
    expect(signedJson.signedUrl).toContain("building_photos/bld-01/im-raw-tmp/");

    // 4. Client-side 413 payload & HEIC dataUrl hygiene guards
    expect(isHeicLikeFile({ name: "IMG_0012.HEIC", type: "" })).toBe(true);
    expect(isHeicLikeFile({ name: "photo.bin", type: "image/heif" })).toBe(true);
    expect(isHeicLikeFile({ name: "facade.jpg", type: "image/jpeg" })).toBe(false);

    const badHeicDataUrl = `data:image/heic;base64,${heicBuf.toString("base64")}`;
    const badOctetDataUrl = `data:application/octet-stream;base64,${heicBuf.toString("base64")}`;
    const oversizedJpegDataUrl = `data:image/jpeg;base64,${"A".repeat(400_000)}`;
    const compactJpegDataUrl = `data:image/jpeg;base64,${sampleJpeg.toString("base64")}`;

    expect(isSafeInlineImageDataUrl(badHeicDataUrl)).toBe(false);
    expect(isSafeInlineImageDataUrl(badOctetDataUrl)).toBe(false);
    expect(isSafeInlineImageDataUrl(oversizedJpegDataUrl)).toBe(false);
    expect(isSafeInlineImageDataUrl(compactJpegDataUrl)).toBe(true);

    // 8 un-uploaded HEIC/oversized entries -> must sanitize to 0 ghost entries (prevents 14.5MB 413 & false "첨부 사진 8장")
    const sanitizedBad = sanitizePhotosForSync([
      { name: "1.HEIC", url: badHeicDataUrl, dataUrl: badHeicDataUrl, category: "exterior" },
      { name: "2.HEIC", url: badOctetDataUrl, dataUrl: badOctetDataUrl, category: "interior" },
      { name: "huge.jpg", url: oversizedJpegDataUrl, dataUrl: oversizedJpegDataUrl, category: "lobby" },
    ]);
    expect(sanitizedBad).toHaveLength(0);

    // Total inline budget guard (<= 1,600,000 chars) while keeping all https:// Storage URLs
    const chunk300k = `data:image/jpeg;base64,${"B".repeat(300_000)}`;
    const manyEntries = [
      ...Array.from({ length: 8 }, (_, idx) => ({
        name: `inline_${idx}.jpg`,
        url: chunk300k,
        dataUrl: chunk300k,
        category: "interior" as const,
      })),
      {
        name: "storage_9.jpg",
        url: "https://proj.supabase.co/storage/v1/object/public/building_photos/bld-01/9.jpg",
        category: "exterior" as const,
      },
    ];
    const sanitizedBudget = sanitizePhotosForSync(manyEntries);
    const totalInlineChars = sanitizedBudget.reduce(
      (sum, p) => sum + (p.dataUrl ? p.dataUrl.length : 0),
      0
    );
    expect(totalInlineChars).toBeLessThanOrEqual(1_600_000);
    expect(
      sanitizedBudget.some((p) =>
        p.url?.startsWith("https://proj.supabase.co/storage/v1/object/public/building_photos/")
      )
    ).toBe(true);
  });

  it("[PT-1202] prevents KNOWN_PARCEL_REGISTRY from hijacking 양평동4가 into 당산동5가 11-47 and validates default seeds", async () => {
    // 1. Default seeds (`bld-01`, `bld-02`, `bld-03`) must use verified 19-digit PNUs & valid WGS84 coords
    const seeds = getDefaultSeeds();
    const bld01 = seeds.find((s) => s.buildingId === "bld-01");
    const bld02 = seeds.find((s) => s.buildingId === "bld-02");
    const bld03 = seeds.find((s) => s.buildingId === "bld-03");

    expect(bld01?.address).toContain("양평동4가 117");
    expect(bld01?.pnu).toBe("1156012800101170000");
    expect(bld02?.pnu).toBe("1168010700105400012");
    expect(bld03?.pnu).toBe("1144012000103950166");

    for (const seed of [bld01, bld02, bld03]) {
      expect(seed?.pnu).toMatch(/^\d{19}$/);
      expect(seed?.lat).toBeGreaterThan(37.4);
      expect(seed?.lng).toBeGreaterThan(126.8);
    }

    // 2A. Quick-generate with 양평동4가 address + legacy poisoned seed PNU must strip poisoned PNU and NEVER hijack to 당산동5가 11-47
    const reqPoisoned = new NextRequest("http://localhost:3000/api/broker/im-lite/quick-generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `pt-1202-poison-${Date.now()}`,
      },
      body: JSON.stringify({
        address: "서울특별시 영등포구 양평동4가 117",
        pnu: "1156012800100800001", // legacy poisoned seed PNU
        lat: 37.5342, // legacy poisoned Dangsan lat
        lng: 126.9022,
        askingPriceManwon: 955000,
      }),
    });

    const resPoisoned = await quickGeneratePOST(reqPoisoned);
    expect(resPoisoned.status).toBe(201);
    const jsonPoisoned = await resPoisoned.json();
    const serializedPoisoned = JSON.stringify(jsonPoisoned);

    expect(serializedPoisoned).not.toContain("당산동5가");
    expect(serializedPoisoned).not.toContain("영신로 259");
    expect(serializedPoisoned).not.toContain("1156011500100110047");
    expect(serializedPoisoned).not.toContain("1156012800100800001");

    // 2B. Quick-generate with verified 양평동4가 117 PNU preserves exact 19-digit PNU without cross-dong hijack
    const reqValid = new NextRequest("http://localhost:3000/api/broker/im-lite/quick-generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `pt-1202-valid-${Date.now()}`,
      },
      body: JSON.stringify({
        address: "서울특별시 영등포구 양평동4가 117",
        pnu: "1156012800101170000",
        lat: 37.53767,
        lng: 126.89472,
        askingPriceManwon: 955000,
      }),
    });
    const resValid = await quickGeneratePOST(reqValid);
    expect(resValid.status).toBe(201);
    const jsonValid = await resValid.json();
    expect(jsonValid.basicImDocument?.facts?.land?.pnu).toBe("1156012800101170000");
    expect(JSON.stringify(jsonValid)).not.toContain("1156011500100110047");
  });

  it("[PT-1203] eliminates poison token '담당 중개법인 (확인 중)' and guards broker_profiles SQL select columns", () => {
    // 1. Domain facts & BasicImDocument with missing or poisoned brokerOffice must never output "확인 중"
    const factsEmpty = extractPureBuildingFacts({
      id: "bld-poison-check-1",
      title: "양평동 테스트빌딩",
      address: "서울특별시 영등포구 양평동4가 117",
      doc_body: {
        askingPriceManwon: 955000,
        brokerOffice: { name: "" },
      },
    });
    expect(factsEmpty.brokerOffice?.name).toBe("전담 중개사무소");
    expect(factsEmpty.brokerOffice?.name).not.toContain("확인 중");

    const factsPoisoned = extractPureBuildingFacts({
      id: "bld-poison-check-2",
      title: "양평동 테스트빌딩",
      address: "서울특별시 영등포구 양평동4가 117",
      doc_body: {
        askingPriceManwon: 955000,
        brokerOffice: {
          name: "담당 중개법인 (확인 중)",
          representative: "서교석 (확인 중)",
        },
      },
    });
    expect(factsPoisoned.brokerOffice?.name).toBe("전담 중개사무소");
    expect(factsPoisoned.brokerOffice?.representative).toBe("서교석");

    const basicDoc = buildBasicImDocument({ facts: factsPoisoned });
    expect(JSON.stringify(basicDoc)).not.toContain("확인 중");

    // 2. Static SQL schema guard on summary/route.ts against PostgREST 42703 (`display_name`, `phone`, `specialty`)
    const summaryRoutePath = path.resolve(
      process.cwd(),
      "src/app/api/broker/workspace/summary/route.ts"
    );
    const summarySrc = fs.readFileSync(summaryRoutePath, "utf8");
    const brokerProfileSelects = [
      ...summarySrc.matchAll(/from\(["']broker_profiles["']\)\s*\.select\(([\s\S]*?)\)/g),
    ].map((m) => m[1]);

    expect(brokerProfileSelects.length).toBeGreaterThanOrEqual(2);
    for (const selectExpr of brokerProfileSelects) {
      expect(selectExpr).not.toMatch(/\bdisplay_name\b/);
      expect(selectExpr).not.toMatch(/\bphone\b/);
      expect(selectExpr).not.toMatch(/\bspecialty\b/);
    }
  });

  it("[PT-1204] produces zero evasion copy in comparable_analysis and surfaces both 2-decimal Gross Yield (4.39%) and Cap Rate (4.00%)", async () => {
    const req = new NextRequest("http://localhost:3000/api/broker/im-lite/quick-generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `pt-1204-${Date.now()}`,
      },
      body: JSON.stringify({
        address: "서울특별시 영등포구 양평동4가 117",
        pnu: "1156012800101170000",
        askingPriceManwon: 955000, // 95.5억
        landAreaSqm: 420.5,
        gfaSqm: 1450.2,
        zoning: "제3종일반주거지역",
        floorsAbove: 6,
        floorsBelow: 1,
        rentRoll: [
          {
            floor: "1F~6F",
            use: "근린생활시설",
            depositManwon: 40000, // 4억
            monthlyRentManwon: 3350, // 월 3,350만 -> 연 4.02억 -> 보증금차감 총수익률 4.39%, NOI Cap Rate 4.00%
            status: "occupied",
          },
        ],
      }),
    });

    const res = await quickGeneratePOST(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    // 1. Both Gross Yield (4.39%) and Cap Rate (4.00%) surfaced cleanly on BasicImDocument & stored heroCard
    expect(json.basicImDocument?.facts?.valuation?.grossYieldPct).toBeCloseTo(4.39, 2);
    expect(json.basicImDocument?.facts?.valuation?.capRatePct).toBeCloseTo(4.0, 2);

    const stored = getQuickImRecord(json.buildingId);
    expect(stored).not.toBeNull();
    const docBody = (stored?.fullDocBody || stored?.docBody || {}) as Record<string, any>;
    expect(docBody.heroCard?.grossYieldPct).toBeCloseTo(4.39, 2);
    expect(docBody.heroCard?.capRateBase).toBeCloseTo(4.0, 2);

    // 2. Comparable & valuation sections have factual subject benchmark table and ZERO evasion strings
    const pptxSections = (docBody.sections || docBody.pptx_sections || []) as Array<{
      section_type?: string;
      markdown?: string;
    }>;
    const compSection = pptxSections.find((s) => s.section_type === "comparable_analysis");
    const valSection = pptxSections.find((s) => s.section_type === "income_analysis");
    expect(compSection).toBeDefined();
    expect(compSection?.markdown).toContain("본건 토지 단가");
    expect(valSection?.markdown).toContain("4.39%");
    expect(valSection?.markdown).toContain("4.00%");

    const serialized = JSON.stringify({
      pptxSections,
      basicImDocument: json.basicImDocument,
    });
    expect(serialized).not.toContain("분석 중");
    expect(serialized).not.toContain("확인 중");
    expect(serialized).not.toContain("수집 중");
  });
});
