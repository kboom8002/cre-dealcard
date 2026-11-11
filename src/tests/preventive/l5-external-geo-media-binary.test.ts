/**
 * L5. 외부 공간 API · 멀티미디어 EXIF · PPTX 바이너리 무결성 예방 테스트 (PT-501 ~ PT-503)
 *
 * 실전 프로덕션 경험 교훈:
 * - PT-501: V-World 지적도 Data/WMS 조회 시 `www.credeal.net` ↔ `credeal.net` 양방향 도메인 폴백 동작 및
 *           A27 토지이용계획 슬라이드 크롭 이미지 JPEG MIME(`image/jpeg;base64,`) 일치 검증
 * - PT-502: 투명 알파 채널(RGBA) PNG · WebP · JPEG 혼합 입력 시 Sharp 흰 배경(`#FFFFFF`) 평탄화 및
 *           `FF D8 FF` JPEG 매직 바이트 보장 (검은 배경 깨짐 및 OOXML 손상 원천 차단)
 * - PT-503: 스마트폰 세로 사진(EXIF `Orientation=6`, 90도 회전) 회전 후 `aspectRatio < 1` 정합성 및
 *           macOS NFD 한글 파일명·영문 배지(`EXTERIOR`) NFC/한국어 정규화 검증
 */
import sharp from "sharp";
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCadastralMapImage } from "@/lib/external/vworld-wms-cadastral";
import { optimizeImageForPptx } from "@/domain/building/mobile-im/pptx/utils/image-optimizer";
import { buildA27LandUsePlan } from "@/domain/building/mobile-im/pptx/archetypes/a27-land-use-plan";
import { normalizeViewerGalleryPhoto } from "@/app/(public)/im-lite/[buildingId]/mobile-im-viewer";

describe("L5 External Geospatial, EXIF Orientation & PPTX Media Binary Integrity (PT-501 ~ PT-503)", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.restoreAllMocks();
  });

  it("[PT-501] retries V-World WFS/WMS across www <-> apex domain candidates and emits valid JPEG MIME on A27 cropped map", async () => {
    process.env.VWORLD_API_KEY = "test-vworld-api-key";
    process.env.VWORLD_REFERER = "https://www.credeal.net";

    const wmsPng = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 242, g: 244, b: 247, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const wmtsTilePng = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: { r: 245, g: 246, b: 248 },
      },
    })
      .png()
      .toBuffer();

    const attemptedDomains: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes("api.vworld.kr/req/data")) {
        const u = new URL(urlStr);
        const dom = u.searchParams.get("domain") || "";
        attemptedDomains.push(dom);

        // Simulate primary domain `www.credeal.net` rejected (403), fallback `credeal.net` succeeding!
        if (dom === "www.credeal.net") {
          return new Response("Forbidden Domain", { status: 403 });
        }
        return new Response(
          JSON.stringify({
            response: {
              status: "OK",
              result: {
                featureCollection: {
                  features: [
                    {
                      type: "Feature",
                      geometry: {
                        type: "Polygon",
                        coordinates: [
                          [
                            [127.11015, 37.30778],
                            [127.11045, 37.30778],
                            [127.11045, 37.30804],
                            [127.11015, 37.30804],
                            [127.11015, 37.30778],
                          ],
                        ],
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/wmts/") || urlStr.includes("Base")) {
        return new Response(new Uint8Array(wmtsTilePng), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }

      // WMS GetMap request -> return 800x600 PNG buffer
      return new Response(new Uint8Array(wmsPng), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const cadastral = await fetchCadastralMapImage(
      37.307913,
      127.110304,
      800,
      600,
      120,
      "4146311800113230002"
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(attemptedDomains).toContain("www.credeal.net");
    expect(attemptedDomains).toContain("credeal.net");
    expect(cadastral).not.toBeNull();
    expect(cadastral!.viewportMode).toBe("parcel_fit");
    expect(cadastral!.base64.startsWith("data:image/png;base64,")).toBe(true);
    // PNG magic bytes: 89 50 4E 47
    expect(cadastral!.buffer[0]).toBe(0x89);
    expect(cadastral!.buffer[1]).toBe(0x50);

    // Now feed an ultra-wide PNG (1600x600) into buildA27LandUsePlan so center-crop `.jpeg()` triggers,
    // and assert addImage receives `image/jpeg;base64,` matching actual FF D8 FF JPEG bytes!
    const widePng = await sharp({
      create: {
        width: 1600,
        height: 600,
        channels: 3,
        background: { r: 230, g: 236, b: 242 },
      },
    })
      .png()
      .toBuffer();

    const addedImages: Array<Record<string, any>> = [];
    const mockSlide = {
      background: null as any,
      addText: vi.fn(),
      addShape: vi.fn(),
      addTable: vi.fn(),
      addImage: vi.fn((opts: Record<string, any>) => {
        addedImages.push(opts);
      }),
    };
    const mockPres = {
      ShapeType: { rect: "rect", roundRect: "roundRect", line: "line", ellipse: "ellipse" },
      addSlide: () => mockSlide,
    };

    await buildA27LandUsePlan({
      pres: mockPres as any,
      slideNum: 5,
      docno: "CRE-BOJEONG-2026",
      data: {
        overviewRows: [
          ["소재지", "경기도 용인시 기흥구 보정동 1323-2"],
          ["지목 / 면적", "대 · 440.0㎡ (133.1평)"],
        ],
        landUseConfirm: {
          nationalLawZones: ["도시지역", "제1종일반주거지역"],
          otherLawZones: ["가축사육제한구역"],
        },
        cadastralImage: `data:image/png;base64,${widePng.toString("base64")}`,
      },
    } as any);

    expect(addedImages.length).toBeGreaterThanOrEqual(1);
    const mapImgData = String(addedImages[0].data || "");
    expect(mapImgData.startsWith("image/jpeg;base64,")).toBe(true);
    const decodedCropped = Buffer.from(mapImgData.replace(/^image\/jpeg;base64,/, ""), "base64");
    expect(decodedCropped[0]).toBe(0xff);
    expect(decodedCropped[1]).toBe(0xd8);
    expect(decodedCropped[2]).toBe(0xff);
  });

  it("[PT-502] flattens transparent RGBA PNG onto pure white (#FFFFFF) and normalizes PNG/WebP/JPEG to FF D8 FF JPEG", async () => {
    // 1. Fully transparent RGBA PNG (would turn solid black if converted to JPEG without flatten!)
    const transparentRgbaPng = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    // 2. WebP image
    const sampleWebp = await sharp({
      create: {
        width: 480,
        height: 360,
        channels: 3,
        background: { r: 45, g: 95, b: 155 },
      },
    })
      .webp()
      .toBuffer();

    // 3. Standard JPEG image
    const sampleJpeg = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 180, g: 160, b: 140 },
      },
    })
      .jpeg()
      .toBuffer();

    for (const rawBuf of [transparentRgbaPng, sampleWebp, sampleJpeg]) {
      const opt = await optimizeImageForPptx(rawBuf);
      expect(opt).not.toBeNull();
      expect(opt!.buffer[0]).toBe(0xff);
      expect(opt!.buffer[1]).toBe(0xd8);
      expect(opt!.buffer[2]).toBe(0xff);
      expect(opt!.base64.startsWith("image/jpeg;base64,")).toBe(true);
    }

    // Verify corner pixel of flattened transparent RGBA PNG is white (> 245), NEVER black (0)
    const flattenedTransparent = await optimizeImageForPptx(transparentRgbaPng);
    expect(flattenedTransparent).not.toBeNull();
    const { data: rawPixels } = await sharp(flattenedTransparent!.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(rawPixels[0]).toBeGreaterThan(245); // R
    expect(rawPixels[1]).toBeGreaterThan(245); // G
    expect(rawPixels[2]).toBeGreaterThan(245); // B
  });

  it("[PT-503] preserves portrait aspectRatio (< 1.0) on EXIF Orientation=6 smartphone photos and normalizes NFD Korean filenames", async () => {
    // Smartphone sensor captures 600x400 landscape buffer with EXIF Orientation=6 (90° CW -> 400x600 portrait display)
    const rawSensorLandscapeWithExif6 = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 120, g: 150, b: 190 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const optimized = await optimizeImageForPptx(rawSensorLandscapeWithExif6, 1200);
    expect(optimized).not.toBeNull();
    expect(optimized!.originalWidth).toBe(400);
    expect(optimized!.originalHeight).toBe(600);
    expect(optimized!.width).toBe(400);
    expect(optimized!.height).toBe(600);
    expect(optimized!.aspectRatio).toBeCloseTo(400 / 600, 3);
    expect(optimized!.aspectRatio).toBeLessThan(1);

    // macOS NFD decomposed Korean filename + uppercase English label `EXTERIOR`
    const macNfdCaption = "01_보정동_웰빙프라자_전면외관.jpg".normalize("NFD");
    const normalizedPhoto = normalizeViewerGalleryPhoto(
      {
        url: "https://proj.supabase.co/storage/v1/object/public/building_photos/test/01.jpg",
        label: "EXTERIOR",
        caption: macNfdCaption,
      },
      0
    );

    expect(normalizedPhoto.label).toBe("외관");
    expect(normalizedPhoto.caption).toBe("보정동 웰빙프라자 전면외관");
    // Ensure caption is NFC normalized (identical byte sequence to NFC literal)
    expect(normalizedPhoto.caption).toBe("보정동 웰빙프라자 전면외관".normalize("NFC"));
    expect(normalizedPhoto.caption).not.toMatch(/\.(jpg|jpeg|png|webp)$/i);
    expect(normalizedPhoto.caption).not.toContain("_");
  });
});
