import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { isRealProductionRuntime } from "@/lib/env";
import {
  getConfiguredQaSecrets,
  isPublicQaFlagEnabled,
  resolveQaKeyFromRequest,
} from "@/lib/security/qa-gate";
import { TESTGUIDE_DEALS, TESTGUIDE_IMAGE_CDN_MAP } from "@/lib/testguide/testguide-data";
import { FULL_LOOP_CASES, type FullLoopCaseId } from "@/lib/testguide/full-loop-2cases-data";
import {
  FULL_LOOP_V2_CASES,
  HOLDOUT_V2_ASSET_CDN_MAP,
  HOLDOUT_V2_CASE03_ASIS_CSV,
  HOLDOUT_V2_CASE03_ASIS_TSV,
  HOLDOUT_V2_CASE03_MEMO,
  HOLDOUT_V2_CASE03_STABILIZED_TSV,
  HOLDOUT_V2_CASE04_MEMO,
  HOLDOUT_V2_CASE04_STABILIZED_TSV,
} from "@/lib/testguide/full-loop-v2-holdout-data";
import {
  FULL_LOOP_V3_CASES,
  HOLDOUT_V3_ASSET_CDN_MAP,
  HOLDOUT_V3_CASE03_ASIS_CSV,
  HOLDOUT_V3_CASE03_ASIS_TABLE,
  HOLDOUT_V3_CASE03_MEMO,
  HOLDOUT_V3_CASE03_STABILIZED_TABLE,
  HOLDOUT_V3_CASE05_MEMO,
  HOLDOUT_V3_CASE05_STABILIZED_TABLE,
} from "@/lib/testguide/full-loop-v3-holdout-data";
import {
  BROKER_CASE02_ASIS_CSV,
  BROKER_CASE02_ASIS_TSV,
  BROKER_CASE02_ASSET_CDN_MAP,
  BROKER_CASE02_MEMO,
  BROKER_CASE02_STABILIZED_CSV,
  BROKER_CASE02_STABILIZED_TSV,
  BROKER_CASE02_WON_TRAP_TSV,
  BROKER_FULL_LOOP_CASES,
} from "@/lib/testguide/broker-full-loop-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidQaAccessKey(req: NextRequest): boolean {
  return resolveQaKeyFromRequest(req).allowed;
}

async function resolveOptionalBrokerUser(
  req: NextRequest
): Promise<{ id: string } | null> {
  try {
    const guard = await requireBroker(req);
    if (!guard.error && guard.user?.id) {
      return { id: String(guard.user.id) };
    }
    return null;
  } catch {
    return null;
  }
}

const SAMPLE_RENTROLL_CSV_ROWS = [
  ["층/호실", "임차인(상호)", "업종", "전용면적(㎡)", "보증금(만원)", "월임대료(만원)", "월관리비(만원)", "계약만료일", "비고"],
  ["B101호", "브런치랩 강남점", "카페·베이커리", "92.5", "8000", "450", "45", "2027-08-31", "권리금 없음"],
  ["101호", "올리브플래그십", "리테일·잡화", "118.4", "15000", "980", "75", "2028-02-28", "코너 전면 노출"],
  ["201호", "메디라인의원", "병의원·클리닉", "164.0", "10000", "720", "80", "2029-05-31", "장기 우량 임차인"],
  ["301호", "아크텍코리아(주)", "IT·오피스", "182.3", "7000", "560", "65", "2027-11-30", "3~4층 연접 검토"],
  ["401호", "공실(즉시입주)", "오피스", "182.3", "7000", "560", "65", "", "예상 임대조건 기준"],
  ["501호", "스튜디오모먼트", "디자인·스튜디오", "136.0", "5500", "420", "50", "2027-06-30", "루프탑 테라스 사용"],
] as const;

const SAMPLE_CONTACTS_CSV_ROWS = [
  ["이름", "소속/직함", "연락처", "이메일", "선호포스처", "비고"],
  ["김태훈", "한결자산운용 이사", "010-4120-8831", "th.kim@example.kr", "임대수익용", "강남·서초 100~300억대"],
  ["박서연", "디벨롭파트너스 대표", "010-7782-1940", "sy.park@example.kr", "신축·개발용", "노후 근생 리모델링 선호"],
  ["이정민", "(주)넥스트코어 CFO", "010-3351-6024", "jm.lee@example.kr", "사옥용", "역세권 500평 이상 사옥"],
  ["최현우", "개인투자자", "010-9204-5512", "hw.choi@example.kr", "임대수익용", "만실 근생 선호"],
  ["정수빈", "메디컬그룹 원장", "010-5501-2389", "sb.jung@example.kr", "사옥용", "병원 직영 빌딩 검토"],
  ["강민석", "브릿지캐피탈 팀장", "010-6193-4470", "ms.kang@example.kr", "신축·개발용", "성수·연남 개발 부지"],
  ["윤지혜", "패밀리오피스 매니저", "010-2849-7105", "jh.yoon@example.kr", "임대수익용", "핵심지 우량 임차인"],
  ["오성진", "성진홀딩스 상무", "010-8832-1046", "sj.oh@example.kr", "사옥용", "주차 15대 이상 필수"],
  ["한유진", "블룸건축사무소 소장", "010-3917-6620", "yj.han@example.kr", "신축·개발용", "명도 가능 저층 빌딩"],
  ["서동현", "리츠자산관리 본부장", "010-4670-9213", "dh.seo@example.kr", "임대수익용", "안정적 NOC 5%대 검토"],
] as const;

const SAMPLE_MEMO_IMDAE = `[임대수익용 검수 샘플 메모]
강남구 역삼동 724-12 테헤란로 이면 코너 꼬마빌딩
매각가 148억 / 대지 112평 / 연면적 368평 / 지상 6층 지하 1층
보증금 5.2억 / 월세 3,850만원 / 관리비 380만원
명목수익률 약 3.3% / 2021년 외관 리모델링 완료 / 승강기 1기, 자주식 주차 8대
1층 유명 베이커리 카페 장기 성업 중이며 공실 없음. 인근 개발 호재와 임대 수요 탄탄함.`;

const SAMPLE_MEMO_SAOK = `[사옥용 검수 샘플 메모]
서울특별시 성동구 성수동2가 289-4 뚝섬역 도보 5분 역세권 사옥형 빌딩
희망매각가 215억 / 대지 145평 / 연면적 520평 / 지상 7층 지하 2층
전 층 명도 협의 가능 (3~7층 즉시 자가사용 가능) / 층고 3.8m 쾌적한 오픈 플랜
자주식 주차 14대 가능 / 코너 2면 도로 접면으로 사옥 간판 가시성 우수.`;

const SAMPLE_MEMO_DEV = `[신축·개발용 검수 샘플 메모]
서울특별시 마포구 연남동 258-11 경의선숲길 인접 신축 개발 부지
매각가 96억 / 대지 128평 (제2종일반주거지역) / 노후 3층 근생 건물 (1992년 준공)
정방형 대지, 8m×6m 코너 접도 / 전 임차인 6개월 내 명도 조건부 매각 가능
용적률 여유 잔존하여 근린생활시설·스튜디오 복합 신축 시 사업성 우수.`;

function toUtf8BomCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const escapeCell = (cell: string) => {
    const needsQuote = /[",\r\n]/.test(cell);
    const escaped = cell.replace(/"/g, '""');
    return needsQuote ? `"${escaped}"` : escaped;
  };
  const body = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  return `\uFEFF${body}\r\n`;
}

async function tryReadPublicFile(relPath: string): Promise<Buffer | null> {
  try {
    const fullPath = path.join(process.cwd(), "public", relPath);
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

async function buildSyntheticBuildingPhotoJpeg(
  label: string,
  accentHex: string
): Promise<Buffer> {
  const safeLabel = label.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0F172A"/>
        <stop offset="100%" stop-color="${accentHex}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#bg)"/>
    <rect x="240" y="110" width="320" height="400" rx="12" fill="#E2E8F0" fill-opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="4"/>
    <rect x="275" y="150" width="70" height="55" rx="6" fill="#F8FAFC" fill-opacity="0.4"/>
    <rect x="365" y="150" width="70" height="55" rx="6" fill="#F8FAFC" fill-opacity="0.4"/>
    <rect x="455" y="150" width="70" height="55" rx="6" fill="#F8FAFC" fill-opacity="0.4"/>
    <rect x="275" y="230" width="70" height="55" rx="6" fill="#F8FAFC" fill-opacity="0.4"/>
    <rect x="365" y="230" width="70" height="55" rx="6" fill="#F8FAFC" fill-opacity="0.4"/>
    <rect x="455" y="230" width="70" height="55" rx="6" fill="#F8FAFC" fill-opacity="0.4"/>
    <text x="400" y="555" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="24" font-weight="bold">CREDEAL SAMPLE - ${safeLabel}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
}

async function resolveSamplePhotoBuffer(
  candidates: readonly string[],
  fallbackLabel: string,
  accentHex: string
): Promise<Buffer> {
  for (const rel of candidates) {
    const found = await tryReadPublicFile(rel);
    if (found && found.byteLength > 0) return found;
  }
  return buildSyntheticBuildingPhotoJpeg(fallbackLabel, accentHex);
}

async function resolveHoldoutAssetBuffer(opts: {
  caseFolder: string;
  localRelPath: string;
  assetKey: string;
  publicFallbackRel?: string;
  isImage: boolean;
  accentHex: string;
}): Promise<Buffer | null> {
  try {
    const localPath = path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      "docs",
      "finaltest",
      "testdata",
      opts.caseFolder,
      opts.localRelPath,
    );
    const localBuf = await fs.readFile(/*turbopackIgnore: true*/ localPath);
    if (localBuf.byteLength > 0) return localBuf;
  } catch {
    // Fallback to Supabase Storage CDN on deployed runtimes
  }

  const cdnUrl =
    HOLDOUT_V3_ASSET_CDN_MAP[opts.assetKey] ||
    HOLDOUT_V2_ASSET_CDN_MAP[opts.assetKey] ||
    BROKER_CASE02_ASSET_CDN_MAP[opts.assetKey];
  if (cdnUrl) {
    try {
      const upstream = await fetch(cdnUrl);
      if (upstream.ok) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.byteLength > 0) return buf;
      }
    } catch {
      // Fallback below
    }
  }

  if (opts.publicFallbackRel) {
    const pubBuf = await tryReadPublicFile(opts.publicFallbackRel);
    if (pubBuf && pubBuf.byteLength > 0) return pubBuf;
  }

  if (opts.isImage) {
    const baseJpeg = await buildSyntheticBuildingPhotoJpeg(opts.assetKey, opts.accentHex);
    return path.extname(opts.assetKey).toLowerCase() === ".png"
      ? sharp(baseJpeg).png().toBuffer()
      : baseJpeg;
  }

  return null;
}

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req) ?? "anonymous";
  const rlAllowed = await checkRateLimit(ip, "public_qa_sample_kit", 60, 60_000);
  if (!rlAllowed) {
    return NextResponse.json(
      { ok: false, error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const hasQaKey = hasValidQaAccessKey(req);
  if (isPublicQaFlagEnabled()) {
    if (!getConfiguredQaSecrets().anyConfigured || !hasQaKey) {
      return NextResponse.json(
        { ok: false, error: "Not Found" },
        { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
      );
    }
  } else if (isRealProductionRuntime()) {
    if (!hasQaKey) {
      return NextResponse.json(
        { ok: false, error: "Not Found" },
        { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
      );
    }
  } else if (
    process.env.NODE_ENV === "production" ||
    process.env.CRE_ENFORCE_QA_GATE === "1"
  ) {
    const brokerUser = hasQaKey ? null : await resolveOptionalBrokerUser(req);
    if (!brokerUser?.id && !hasQaKey) {
      return NextResponse.json(
        { ok: false, error: "Not Found" },
        { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
      );
    }
  }

  const format = (req.nextUrl.searchParams.get("format") || "zip").trim().toLowerCase();
  const scenario = (req.nextUrl.searchParams.get("scenario") || "").trim().toLowerCase();

  if (scenario === "loop1" || scenario === "loop2") {
    const loopCase = FULL_LOOP_CASES.find((c) => c.id === (scenario as FullLoopCaseId));
    const targetDealId = scenario === "loop1" ? "deal2" : "deal3";
    const deal = TESTGUIDE_DEALS.find((d) => d.id === targetDealId);
    if (loopCase && deal) {
      const loopZip = new JSZip();
      const nlStep = loopCase.steps.find((s) => s.subsystem === "뉴스레터" || s.stepNumber === 4);
      const nlCleanBrief =
        nlStep?.copySnippets?.find((sn) => sn.id.includes("brief"))?.value ||
        nlStep?.copySnippets?.[1]?.value ||
        loopCase.subtitle;

      loopZip.file(
        "00_README_풀루프_실행안내.txt",
        [
          `${loopCase.code} — ${loopCase.title}`,
          "================================================================",
          `대상 실매물: ${loopCase.propertyName} (${loopCase.askingPriceReadout})`,
          `권장 소요시간: 약 ${loopCase.targetMinutes}분 (${loopCase.deviceSetup})`,
          "",
          "[포함 파일 안내]",
          "1. 01_현장메모_원문.txt        : 딜카드/IM 메모 붙여넣기용 실매물 원문",
          "2. 02_임대현황_업로드용.csv    : 엑셀/CSV 업로드용 임대 현황 (UTF-8 BOM)",
          "3. 03_임대현황_붙여넣기용.tsv  : IM 임대 현황 그리드 1클릭 붙여넣기용 TSV",
          "4. 04_뉴스레터_브리핑_초안.txt : 뉴스레터 브리핑 본문 초안 (지번 비노출)",
          "5. 05_고객연락처_샘플10명.csv  : 고객 소통·구독자 등록 테스트용 연락처",
          "6. photos/                     : 멀티포맷(JPG·PNG·WebP) 실매물 검증 이미지 4종",
          "",
          ...(nlStep?.copySnippets?.length
            ? [
                "[뉴스레터 보조 스니펫]",
                ...nlStep.copySnippets.map((sn) => `- ${sn.label}: ${sn.value}`),
              ]
            : []),
        ].join("\r\n")
      );

      loopZip.file("01_현장메모_원문.txt", deal.brokerMemoText);
      loopZip.file(`02_${deal.csvFilename}`, `\uFEFF${deal.csvContent}`);
      loopZip.file("03_임대현황_붙여넣기용.tsv", deal.tsvContent);
      loopZip.file("04_뉴스레터_브리핑_초안.txt", nlCleanBrief);
      loopZip.file("05_고객연락처_샘플10명.csv", toUtf8BomCsv(SAMPLE_CONTACTS_CSV_ROWS));

      const xlsxTemplate = await tryReadPublicFile("CREDEAL_rentroll_template_v1.5.xlsx");
      if (xlsxTemplate) {
        loopZip.file("CREDEAL_rentroll_template_v1.5.xlsx", xlsxTemplate);
      }

      for (const img of deal.images) {
        let imgBuf: Buffer | null = null;
        try {
          const localDocImgPath = path.join(
            /*turbopackIgnore: true*/ process.cwd(),
            "docs",
            "im261110",
            "images",
            deal.imageFolder,
            img.filename
          );
          imgBuf = await fs.readFile(/*turbopackIgnore: true*/ localDocImgPath);
        } catch {
          imgBuf = null;
        }

        if (!imgBuf) {
          const cdnUrl = TESTGUIDE_IMAGE_CDN_MAP[img.filename];
          if (cdnUrl) {
            try {
              const upstream = await fetch(cdnUrl);
              if (upstream.ok) {
                imgBuf = Buffer.from(await upstream.arrayBuffer());
              }
            } catch {
              imgBuf = null;
            }
          }
        }

        if (!imgBuf) {
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
          const mappedRel = publicRelFallback[img.filename];
          if (mappedRel) {
            const pubRaw = await tryReadPublicFile(mappedRel);
            if (pubRaw && pubRaw.byteLength > 0) {
              const ext = path.extname(img.filename).toLowerCase();
              imgBuf =
                ext === ".png"
                  ? await sharp(pubRaw).png().toBuffer()
                  : ext === ".webp"
                  ? await sharp(pubRaw).webp({ quality: 84 }).toBuffer()
                  : await sharp(pubRaw).jpeg({ quality: 86 }).toBuffer();
            }
          }
        }

        if (!imgBuf) {
          const baseJpeg = await buildSyntheticBuildingPhotoJpeg(
            "CREDEAL PHOTO SAMPLE",
            scenario === "loop1" ? "#0F766E" : "#1E3A8A"
          );
          const ext = path.extname(img.filename).toLowerCase();
          imgBuf =
            ext === ".png"
              ? await sharp(baseJpeg).png().toBuffer()
              : ext === ".webp"
              ? await sharp(baseJpeg).webp({ quality: 84 }).toBuffer()
              : baseJpeg;
        }

        loopZip.file(`photos/${img.filename}`, imgBuf);
      }

      const loopZipBytes = await loopZip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const outZipName =
        scenario === "loop1"
          ? "credeal_full_loop1_bucheon_donga_kit.zip"
          : "credeal_full_loop2_yeoksam_yeosam_kit.zip";

      return new NextResponse(Buffer.from(loopZipBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${outZipName}"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  if (scenario === "v2-loop1" || scenario === "v2-loop2") {
    const targetId: FullLoopCaseId = scenario === "v2-loop1" ? "loop1" : "loop2";
    const v2Case = FULL_LOOP_V2_CASES.find((c) => c.id === targetId);
    if (v2Case) {
      const case04Folder = "CASE-04_영등포_당산동5가_11-47_XLSX입력_다호실복합";
      const case03Folder = "CASE-03_서초_잠원동_26-14외1_화면입력_신축개발형";

      if (scenario === "v2-loop1" && (format === "xlsx" || format === "xlsx-stabilized")) {
        const isStab = format === "xlsx-stabilized";
        const fileKey = isStab
          ? "03_안정화_렌트롤_v1.5_sqm.xlsx"
          : "02_현황_렌트롤_v1.5_sqm.xlsx";
        const asciiName = isStab
          ? "v2_holdout_case04_dangsan_stabilized_v1.5.xlsx"
          : "v2_holdout_case04_dangsan_asis_v1.5.xlsx";
        const xlsxData = await resolveHoldoutAssetBuffer({
          caseFolder: case04Folder,
          localRelPath: fileKey,
          assetKey: fileKey,
          publicFallbackRel: "CREDEAL_rentroll_template_v1.5.xlsx",
          isImage: false,
          accentHex: "#0F766E",
        });
        if (xlsxData) {
          return new NextResponse(new Uint8Array(xlsxData), {
            status: 200,
            headers: {
              "Content-Type": XLSX_CONTENT_TYPE,
              "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileKey)}`,
              "Cache-Control": "no-store",
            },
          });
        }
      }

      if (scenario === "v2-loop2" && format === "csv") {
        const bomCsv = `\uFEFF${HOLDOUT_V2_CASE03_ASIS_CSV}\r\n`;
        return new NextResponse(bomCsv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="rentroll_v2_jamwon_duwon.csv"',
            "Cache-Control": "no-store",
          },
        });
      }

      const v2Zip = new JSZip();
      const nlStep = v2Case.steps.find((s) => s.subsystem === "뉴스레터" || s.stepNumber === 4);
      const nlBrief =
        nlStep?.copySnippets?.find((sn) => sn.id.includes("brief"))?.value || v2Case.subtitle;

      const gt = v2Case.groundTruth;
      const referenceTableTxt = [
        `[${v2Case.propertyName}] 건축물대장·토지대장 및 임대수익률 기준값 대조표`,
        "================================================================",
        `• 지번 주소   : ${v2Case.jibunAddress}`,
        `• 도로명 주소 : ${v2Case.roadAddress}`,
        `• 희망 매매가 : ${v2Case.askingPriceReadout}`,
        "",
        "[1] 공적장부(건축물대장·토지대장) 자동 조회 기준값 — IM ① 표지·기본정보 대조용",
        `• 대지면적    : ${gt.expectedLandAreaSqm.toFixed(2)} ㎡ (약 ${gt.expectedLandAreaPyeong.toFixed(1)} 평)`,
        `• 연면적      : ${gt.expectedGfaSqm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ㎡ (약 ${gt.expectedGfaPyeong.toFixed(1)} 평)`,
        ...(scenario === "v2-loop1"
          ? [
              "• 용도지역    : 준공업지역",
              "• 사용승인일  : 2002-12-12 (지하 1층 ~ 지상 5층)",
            ]
          : [
              "• 필지 구성   : 잠원동 26-14 + 26-16 (2필지 자동 합산)",
              "• 준공연도    : 1990년 (지하 1층 ~ 지상 5층, 기득권 용적률 약 325.6%)",
            ]),
        "",
        "[2] 층별 임대차 합계 및 수익률 기준값 — IM ② 층별 임대현황 대조용",
        `• 보증금·월세 : ${gt.expectedDepositSummary}`,
        `• 점유·공실   : ${gt.expectedOccupancySummary}`,
        `• 순수익률    : ${gt.expectedYieldSummary}`,
        "",
        "[3] 공개 화면(딜카드·뉴스레터) 비공개 보호 확인 키워드 (노출 0건 필수)",
        `• ${gt.forbiddenPublicTokens.join(", ")}`,
        "",
      ].join("\r\n");

      v2Zip.file("00_대장면적_및_수익률_기준값_대조표.txt", referenceTableTxt);
      v2Zip.file(
        "00_README_실행안내.txt",
        [
          `${v2Case.code} — ${v2Case.propertyName}`,
          "================================================================",
          `대상 매물 : ${v2Case.propertyName} (${v2Case.askingPriceReadout})`,
          `대지면적  : ${gt.expectedLandAreaSqm.toFixed(2)}㎡ (약 ${gt.expectedLandAreaPyeong.toFixed(1)}평)`,
          `연면적    : ${gt.expectedGfaSqm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}㎡ (약 ${gt.expectedGfaPyeong.toFixed(1)}평)`,
          `권장 시간 : 약 ${v2Case.targetMinutes}분 (${v2Case.deviceSetup})`,
          "",
          "[폴더 안 파일 사용법]",
          ...(scenario === "v2-loop1"
            ? [
                "0. 00_대장면적_및_수익률_기준값_대조표.txt : IM 주소 조회 시 대지면적(506.8㎡)·연면적(1,441.15㎡) 비교표",
                "1. 01_현장메모_원문.txt                    : 딜카드 작성 화면 상단 메모칸에 붙여넣을 원문",
                "2. 02_현황_렌트롤_v1.5_sqm.xlsx            : IM [② 층별 임대현황] → [현행 임대차 현황] → [📁 엑셀 파일 불러오기 ▾] 업로드용",
                "3. 03_안정화_렌트롤_v1.5_sqm.xlsx          : IM [② 층별 임대현황] → [+ 기대수익률 임대차 현황] → [📁 엑셀 파일 불러오기 ▾] 업로드용",
                "4. 04_기대수익률_복사붙여넣기용_표.txt     : (엑셀 업로드 대신 복사할 때) 전체 복사(Ctrl+A→Ctrl+C) 후 파란 [📋 표 붙여넣기] 버튼 클릭",
                "5. 05_뉴스레터_브리핑_초안.txt             : 부동산뉴스 본문 붙여넣기용 초안",
                "6. 06_고객연락처_샘플10명.csv              : 소통함 대량 고객 등록 샘플",
                "7. photos/                                 : IM [④ 사진·위치·만들기] 탭에 올릴 현장 사진 6장",
              ]
            : [
                "0. 00_대장면적_및_수익률_기준값_대조표.txt : IM 주소 조회 시 2필지 합산 대지면적(616.1㎡)·연면적(2,032.59㎡) 비교표",
                "1. 01_현장메모_원문.txt                    : 딜카드 작성 화면 상단 메모칸에 붙여넣을 원문",
                "2. 02_현행_임대현황_복사용_표.txt          : 전체 복사(Ctrl+A→Ctrl+C) 후 [현행 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭",
                "3. 03_기대수익률_임대현황_복사용_표.txt    : 전체 복사(Ctrl+A→Ctrl+C) 후 [+ 기대수익률 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭",
                "4. 04_임대현황_업로드용.csv                : [📁 엑셀 파일 불러오기 ▾]로 바로 올릴 수 있는 CSV 파일",
                "5. 05_뉴스레터_브리핑_초안.txt             : 부동산뉴스 본문 붙여넣기용 초안",
                "6. 06_고객연락처_샘플10명.csv              : 소통함 대량 고객 등록 샘플",
                "7. photos/                                 : IM [④ 사진·위치·만들기] 탭에 올릴 현장 사진 5장",
              ]),
        ].join("\r\n"),
      );

      if (scenario === "v2-loop1") {
        v2Zip.file(
          "01_현장메모_원문.txt",
          [
            HOLDOUT_V2_CASE04_MEMO,
            "",
            "--- [참고: 공적장부 기준 면적 대조값] ---",
            "• 대지면적: 506.80㎡ (약 153.3평)",
            "• 연면적  : 1,441.15㎡ (약 436.0평)",
            "• 용도지역: 준공업지역 / 사용승인일: 2002-12-12",
          ].join("\r\n"),
        );
        const asIsXlsx = await resolveHoldoutAssetBuffer({
          caseFolder: case04Folder,
          localRelPath: "02_현황_렌트롤_v1.5_sqm.xlsx",
          assetKey: "02_현황_렌트롤_v1.5_sqm.xlsx",
          publicFallbackRel: "CREDEAL_rentroll_template_v1.5.xlsx",
          isImage: false,
          accentHex: "#0F766E",
        });
        const stabXlsx = await resolveHoldoutAssetBuffer({
          caseFolder: case04Folder,
          localRelPath: "03_안정화_렌트롤_v1.5_sqm.xlsx",
          assetKey: "03_안정화_렌트롤_v1.5_sqm.xlsx",
          publicFallbackRel: "CREDEAL_rentroll_template_v1.5.xlsx",
          isImage: false,
          accentHex: "#0F766E",
        });
        if (asIsXlsx) v2Zip.file("02_현황_렌트롤_v1.5_sqm.xlsx", asIsXlsx);
        if (stabXlsx) v2Zip.file("03_안정화_렌트롤_v1.5_sqm.xlsx", stabXlsx);
        v2Zip.file(
          "04_기대수익률_복사붙여넣기용_표.txt",
          HOLDOUT_V2_CASE04_STABILIZED_TSV,
        );
      } else {
        v2Zip.file(
          "01_현장메모_원문.txt",
          [
            HOLDOUT_V2_CASE03_MEMO,
            "",
            "--- [참고: 공적장부 기준 2필지 합산 면적 대조값] ---",
            "• 대지면적(26-14 + 26-16 합산): 616.10㎡ (약 186.4평)",
            "• 연면적                      : 2,032.59㎡ (약 614.9평)",
          ].join("\r\n"),
        );
        v2Zip.file("02_현행_임대현황_복사용_표.txt", HOLDOUT_V2_CASE03_ASIS_TSV);
        v2Zip.file("03_기대수익률_임대현황_복사용_표.txt", HOLDOUT_V2_CASE03_STABILIZED_TSV);
        v2Zip.file("04_임대현황_업로드용.csv", `\uFEFF${HOLDOUT_V2_CASE03_ASIS_CSV}\r\n`);
      }

      v2Zip.file("05_뉴스레터_브리핑_초안.txt", nlBrief);
      v2Zip.file("06_고객연락처_샘플10명.csv", toUtf8BomCsv(SAMPLE_CONTACTS_CSV_ROWS));

      const targetFolder = scenario === "v2-loop1" ? case04Folder : case03Folder;
      for (const img of v2Case.images) {
        const imgBuf = await resolveHoldoutAssetBuffer({
          caseFolder: targetFolder,
          localRelPath: path.join("images", img.filename),
          assetKey: img.filename,
          publicFallbackRel: "test-images/dangsan/01_exterior.jpg",
          isImage: true,
          accentHex: scenario === "v2-loop1" ? "#0F766E" : "#1E3A8A",
        });
        if (imgBuf) {
          v2Zip.file(`photos/${img.filename}`, imgBuf);
        }
      }

      const v2ZipBytes = await v2Zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const outV2ZipName =
        scenario === "v2-loop1"
          ? "credeal_full_loop_v2_dangsan_115_xlsx_kit.zip"
          : "credeal_full_loop_v2_jamwon_242_dev_kit.zip";

      return new NextResponse(Buffer.from(v2ZipBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${outV2ZipName}"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  if (scenario === "v3-loop1" || scenario === "v3-loop2") {
    const targetId: FullLoopCaseId = scenario === "v3-loop1" ? "loop1" : "loop2";
    const v3Case = FULL_LOOP_V3_CASES.find((c) => c.id === targetId);
    if (v3Case) {
      const case05Folder = "CASE-05_영등포_양평동4가_117외2_XLSX입력_프라임오피스";
      const case03Folder = "CASE-03_서초_잠원동_26-14외1_화면입력_신축개발형";

      if (
        scenario === "v3-loop1" &&
        (format === "xlsx" || format === "xlsx-stabilized" || format === "xlsx-v12-trap")
      ) {
        const localFileKey =
          format === "xlsx-stabilized"
            ? "03_안정화_렌트롤_v1.5_pyeong.xlsx"
            : format === "xlsx-v12-trap"
            ? "99_부록_V12_단위혼동_차단게이트_체험용.xlsx"
            : "02_현황_렌트롤_v1.5_pyeong.xlsx";
        const outKorName =
          format === "xlsx-stabilized"
            ? "V3_03_양평동_기대수익률_렌트롤_v1.5_pyeong.xlsx"
            : format === "xlsx-v12-trap"
            ? "V3_99_선택체험_단위혼동_차단확인용.xlsx"
            : "V3_02_양평동_현황_렌트롤_v1.5_pyeong.xlsx";
        const asciiName =
          format === "xlsx-stabilized"
            ? "V3_03_yangpyeong_stabilized_v1.5_pyeong.xlsx"
            : format === "xlsx-v12-trap"
            ? "V3_99_yangpyeong_unit_mismatch_trap.xlsx"
            : "V3_02_yangpyeong_asis_v1.5_pyeong.xlsx";
        const xlsxData = await resolveHoldoutAssetBuffer({
          caseFolder: case05Folder,
          localRelPath: localFileKey,
          assetKey: localFileKey,
          publicFallbackRel: "CREDEAL_rentroll_template_v1.5.xlsx",
          isImage: false,
          accentHex: "#1D4ED8",
        });
        if (xlsxData) {
          return new NextResponse(new Uint8Array(xlsxData), {
            status: 200,
            headers: {
              "Content-Type": XLSX_CONTENT_TYPE,
              "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(outKorName)}`,
              "Cache-Control": "no-store",
            },
          });
        }
      }

      if (scenario === "v3-loop2" && format === "csv") {
        const bomCsv = `\uFEFF${HOLDOUT_V3_CASE03_ASIS_CSV}\r\n`;
        const korCsv = "V3_04_잠원동_임대현황_업로드용.csv";
        return new NextResponse(bomCsv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="V3_04_jamwon_rentroll.csv"; filename*=UTF-8''${encodeURIComponent(korCsv)}`,
            "Cache-Control": "no-store",
          },
        });
      }

      const v3Zip = new JSZip();
      const nlStep = v3Case.steps.find((s) => s.subsystem === "뉴스레터" || s.stepNumber === 4);
      const nlBrief =
        nlStep?.copySnippets?.find((sn) => sn.id.includes("brief"))?.value || v3Case.subtitle;

      const gt = v3Case.groundTruth;
      const referenceTableTxt = [
        `[V3 · ${v3Case.propertyName}] 건축물대장·토지대장 및 임대수익률 기준값 대조표`,
        "================================================================",
        `• 지번 주소   : ${v3Case.jibunAddress}`,
        `• 도로명 주소 : ${v3Case.roadAddress}`,
        `• 희망 매매가 : ${v3Case.askingPriceReadout}`,
        "",
        "[1] 공적장부(건축물대장·토지대장) 자동 조회 기준값 — IM ① 표지·기본정보 대조용",
        `• 대지면적    : ${gt.expectedLandAreaSqm.toFixed(2)} ㎡ (약 ${gt.expectedLandAreaPyeong.toFixed(1)} 평)`,
        `• 연면적      : ${gt.expectedGfaSqm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ㎡ (약 ${gt.expectedGfaPyeong.toFixed(1)} 평)`,
        ...(scenario === "v3-loop1"
          ? [
              "• 필지 구성   : 양평동4가 117, 134, 125-2 (3필지 코너 합산)",
              "• 용도·규모   : 준공업지역 / 2018-09-12 신축급 (지하 1층 ~ 지상 10층, 주차 23대)",
            ]
          : [
              "• 필지 구성   : 잠원동 26-14 + 26-16 (2필지 자동 합산 · 토지 약 186평)",
              "• 준공연도    : 1990년 (지하 1층 ~ 지상 5층, 기득권 용적률 약 325.6%)",
            ]),
        "",
        "[2] 층별 임대차 합계 및 수익률 기준값 — IM ② 층별 임대현황 대조용",
        `• 보증금·월세 : ${gt.expectedDepositSummary}`,
        `• 점유·공실   : ${gt.expectedOccupancySummary}`,
        `• 순수익률    : ${gt.expectedYieldSummary}`,
        "",
        "[3] 공개 화면(딜카드·뉴스레터) 비공개 보호 확인 단어 (노출 0건 필수)",
        `• ${gt.forbiddenPublicTokens.join(", ")}`,
        "",
      ].join("\r\n");

      v3Zip.file("V3_00_대장면적_및_수익률_기준값_대조표.txt", referenceTableTxt);
      v3Zip.file(
        "V3_00_README_실행안내.txt",
        [
          `V3 ${v3Case.code} — ${v3Case.propertyName}`,
          "================================================================",
          "※ 이전 테스트 파일과 섞이지 않도록 모든 파일명이 V3_ 로 시작합니다.",
          `대상 매물 : ${v3Case.propertyName} (${v3Case.askingPriceReadout})`,
          `대지면적  : ${gt.expectedLandAreaSqm.toFixed(2)}㎡ (약 ${gt.expectedLandAreaPyeong.toFixed(1)}평)`,
          `연면적    : ${gt.expectedGfaSqm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}㎡ (약 ${gt.expectedGfaPyeong.toFixed(1)}평)`,
          `권장 시간 : 약 ${v3Case.targetMinutes}분 (${v3Case.deviceSetup})`,
          "",
          "[폴더 안 V3_ 파일 사용법]",
          ...(scenario === "v3-loop1"
            ? [
                "0. V3_00_대장면적_및_수익률_기준값_대조표.txt       : IM 주소 조회 시 대지(518.7㎡)·연면적(2,490.88㎡) 비교표",
                "1. V3_01_양평동_현장메모_원문.txt                   : 새 딜카드 상단 메모칸 붙여넣기용 원문",
                "2. V3_02_양평동_현황_렌트롤_v1.5_pyeong.xlsx        : IM [현행 임대차 현황] → [📁 엑셀 파일 불러오기 ▾] 업로드용 (평 단위 자동 환산)",
                "3. V3_03_양평동_기대수익률_렌트롤_v1.5_pyeong.xlsx  : IM [+ 기대수익률 임대차 현황] → [📁 엑셀 파일 불러오기 ▾] 업로드용",
                "4. V3_04_양평동_기대수익률_복사붙여넣기용_표.txt    : (엑셀 대신 표 복사 시) 전체 복사 후 파란 [📋 표 붙여넣기] 클릭",
                "5. V3_99_선택체험_단위혼동_차단확인용.xlsx          : (선택 10초 체험) 면적 단위를 잘못 적은 파일 업로드 시 안전 차단 확인용",
                "6. V3_05_뉴스레터_브리핑_초안.txt                   : 월간 부동산뉴스 본문 붙여넣기용",
                "7. V3_06_고객연락처_샘플10명.csv                    : 소통함 고객 일괄 등록 샘플",
                "8. photos/V3_01~04                                  : IM [④ 사진·위치·만들기] 탭에 올릴 사진 4장 (세로형 외관·승강기 포함)",
              ]
            : [
                "0. V3_00_대장면적_및_수익률_기준값_대조표.txt       : IM 주소 조회 시 2필지 합산 대지(616.1㎡ · 약 186평)·연면적(2,032.59㎡) 비교표",
                "1. V3_01_잠원동_현장메모_원문.txt                   : 새 딜카드 [신축·개발용] 메모칸 붙여넣기용 원문",
                "2. V3_02_잠원동_현행_임대현황_복사용_표.txt         : 전체 복사 후 [현행 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭",
                "3. V3_03_잠원동_기대수익률_임대현황_복사용_표.txt   : 전체 복사 후 [+ 기대수익률 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭",
                "4. V3_04_잠원동_임대현황_업로드용.csv               : [📁 엑셀 파일 불러오기 ▾] 업로드용 CSV",
                "5. V3_05_뉴스레터_브리핑_초안.txt                   : 주간 부동산뉴스 본문 붙여넣기용",
                "6. V3_06_고객연락처_샘플10명.csv                    : 소통함 고객 일괄 등록 샘플",
                "7. photos/V3_01~05                                  : IM [④ 사진·위치·만들기] 탭에 올릴 사진 5장",
              ]),
        ].join("\r\n"),
      );

      if (scenario === "v3-loop1") {
        v3Zip.file(
          "V3_01_양평동_현장메모_원문.txt",
          [
            HOLDOUT_V3_CASE05_MEMO,
            "",
            "--- [참고: 공적장부 기준 3필지 면적 대조값] ---",
            "• 대지면적: 518.70㎡ (약 156.9평)",
            "• 연면적  : 2,490.88㎡ (약 753.5평)",
            "• 용도지역: 준공업지역 / 사용승인일: 2018-09-12 (주차 23대)",
          ].join("\r\n"),
        );
        const asIsXlsx = await resolveHoldoutAssetBuffer({
          caseFolder: case05Folder,
          localRelPath: "02_현황_렌트롤_v1.5_pyeong.xlsx",
          assetKey: "02_현황_렌트롤_v1.5_pyeong.xlsx",
          publicFallbackRel: "CREDEAL_rentroll_template_v1.5.xlsx",
          isImage: false,
          accentHex: "#1D4ED8",
        });
        const stabXlsx = await resolveHoldoutAssetBuffer({
          caseFolder: case05Folder,
          localRelPath: "03_안정화_렌트롤_v1.5_pyeong.xlsx",
          assetKey: "03_안정화_렌트롤_v1.5_pyeong.xlsx",
          publicFallbackRel: "CREDEAL_rentroll_template_v1.5.xlsx",
          isImage: false,
          accentHex: "#1D4ED8",
        });
        const trapXlsx = await resolveHoldoutAssetBuffer({
          caseFolder: case05Folder,
          localRelPath: "99_부록_V12_단위혼동_차단게이트_체험용.xlsx",
          assetKey: "99_부록_V12_단위혼동_차단게이트_체험용.xlsx",
          isImage: false,
          accentHex: "#B45309",
        });
        if (asIsXlsx) v3Zip.file("V3_02_양평동_현황_렌트롤_v1.5_pyeong.xlsx", asIsXlsx);
        if (stabXlsx) v3Zip.file("V3_03_양평동_기대수익률_렌트롤_v1.5_pyeong.xlsx", stabXlsx);
        v3Zip.file(
          "V3_04_양평동_기대수익률_복사붙여넣기용_표.txt",
          HOLDOUT_V3_CASE05_STABILIZED_TABLE,
        );
        if (trapXlsx) v3Zip.file("V3_99_선택체험_단위혼동_차단확인용.xlsx", trapXlsx);
      } else {
        v3Zip.file(
          "V3_01_잠원동_현장메모_원문.txt",
          [
            HOLDOUT_V3_CASE03_MEMO,
            "",
            "--- [참고: 공적장부 기준 2필지 합산 면적 대조값] ---",
            "• 대지면적(26-14 + 26-16 합산): 616.10㎡ (약 186.4평)",
            "• 연면적                      : 2,032.59㎡ (약 614.9평)",
          ].join("\r\n"),
        );
        v3Zip.file("V3_02_잠원동_현행_임대현황_복사용_표.txt", HOLDOUT_V3_CASE03_ASIS_TABLE);
        v3Zip.file("V3_03_잠원동_기대수익률_임대현황_복사용_표.txt", HOLDOUT_V3_CASE03_STABILIZED_TABLE);
        v3Zip.file("V3_04_잠원동_임대현황_업로드용.csv", `\uFEFF${HOLDOUT_V3_CASE03_ASIS_CSV}\r\n`);
      }

      v3Zip.file("V3_05_뉴스레터_브리핑_초안.txt", nlBrief);
      v3Zip.file("V3_06_고객연락처_샘플10명.csv", toUtf8BomCsv(SAMPLE_CONTACTS_CSV_ROWS));

      const targetFolder = scenario === "v3-loop1" ? case05Folder : case03Folder;
      for (const img of v3Case.images) {
        const imgBuf = await resolveHoldoutAssetBuffer({
          caseFolder: targetFolder,
          localRelPath: path.join("images", img.filename),
          assetKey: img.filename,
          publicFallbackRel: "test-images/dangsan/01_exterior.jpg",
          isImage: true,
          accentHex: scenario === "v3-loop1" ? "#1D4ED8" : "#0F766E",
        });
        if (imgBuf) {
          v3Zip.file(`photos/V3_${img.filename}`, imgBuf);
        }
      }

      const v3ZipBytes = await v3Zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const outV3ZipName =
        scenario === "v3-loop1"
          ? "V3_credeal_loop1_yangpyeong_250_pyeong_kit.zip"
          : "V3_credeal_loop2_jamwon_242_dev_kit.zip";

      return new NextResponse(Buffer.from(v3ZipBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${outV3ZipName}"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  if (scenario === "broker-loop1") {
    const brokerCase = BROKER_FULL_LOOP_CASES[0];
    const case02Folder = "CASE-02_서초_서초동_1364-28_화면입력_법인사옥형";

    if (format === "csv") {
      return new NextResponse(`\uFEFF${BROKER_CASE02_ASIS_CSV}\r\n`, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="seocho_1364_28_hq_rentroll.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "csv-stabilized") {
      return new NextResponse(`\uFEFF${BROKER_CASE02_STABILIZED_CSV}\r\n`, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="seocho_1364_28_stabilized_rentroll.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "tsv-stabilized") {
      return new NextResponse(`\uFEFF${BROKER_CASE02_STABILIZED_TSV}\r\n`, {
        status: 200,
        headers: {
          "Content-Type": "text/tab-separated-values; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="seocho_1364_28_stabilized_rentroll.tsv"',
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "tsv-won-trap") {
      return new NextResponse(`\uFEFF${BROKER_CASE02_WON_TRAP_TSV}\r\n`, {
        status: 200,
        headers: {
          "Content-Type": "text/tab-separated-values; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="seocho_1364_28_won_unit_trap.tsv"',
          "Cache-Control": "no-store",
        },
      });
    }

    if (brokerCase) {
      const bZip = new JSZip();
      const bGt = brokerCase.groundTruth;
      bZip.file(
        "00_대장면적_및_수익률_기준값_대조표.txt",
        [
          `[${brokerCase.propertyName}] 건축물대장·토지대장 및 임대수익률 기준값 대조표`,
          "================================================================",
          `• 지번 주소   : ${brokerCase.jibunAddress}`,
          `• 도로명 주소 : ${brokerCase.roadAddress}`,
          `• 희망 매매가 : ${brokerCase.askingPriceReadout}`,
          "",
          "[1] 공적장부(건축물대장·토지대장) 자동 조회 기준값 — IM ① 표지·기본정보 대조용",
          `• 대지면적    : ${bGt.expectedLandAreaSqm.toFixed(2)} ㎡ (약 ${bGt.expectedLandAreaPyeong.toFixed(1)} 평)`,
          `• 연면적      : ${bGt.expectedGfaSqm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ㎡ (약 ${bGt.expectedGfaPyeong.toFixed(1)} 평)`,
          "• 층수·주차   : 지하 1층 ~ 지상 6층 / 자주식 포함 총 20대",
          "",
          "[2] 층별 임대차 합계 및 수익률 기준값 — IM ② 층별 임대현황 대조용",
          `• 보증금·월세 : ${bGt.expectedDepositSummary}`,
          `• 점유·공실   : ${bGt.expectedOccupancySummary}`,
          `• 순수익률    : ${bGt.expectedYieldSummary}`,
          "",
          "[3] 공개 화면(딜카드·부동산뉴스) 비공개 보호 확인 단어 (노출 0건 필수)",
          `• ${bGt.forbiddenPublicTokens.join(", ")}`,
          "",
        ].join("\r\n"),
      );
      bZip.file(
        "00_README_중개인_골든10장_안내.txt",
        [
          `${brokerCase.code} — ${brokerCase.title}`,
          "================================================================",
          `대상 매물 : ${brokerCase.propertyName} (${brokerCase.askingPriceReadout})`,
          `지번 주소 : ${brokerCase.jibunAddress} / 도로명: ${brokerCase.roadAddress}`,
          `대지면적  : ${bGt.expectedLandAreaSqm.toFixed(2)}㎡ (약 ${bGt.expectedLandAreaPyeong.toFixed(1)}평)`,
          `연면적    : ${bGt.expectedGfaSqm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}㎡ (약 ${bGt.expectedGfaPyeong.toFixed(1)}평)`,
          `현장 사진 : 총 ${brokerCase.images.length}장 (외관 4장 + 내부·설비 6장, 세로형 승강기 포함)`,
          "",
          "[폴더 안 파일 사용법]",
          "0. 00_대장면적_및_수익률_기준값_대조표.txt    : IM 주소 조회 시 대지면적(596.00㎡)·연면적(2,104.88㎡) 비교표",
          "1. 01_딜카드_현장메모_원문.txt                : 새 딜카드 상단 메모칸에 붙여넣고 [✨ 메모로 딜카드 생성하기] 클릭",
          "2. 02_현행_임대현황_복사붙여넣기용_표.txt     : 전체 복사(Ctrl+A→Ctrl+C) 후 [현행 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭",
          "3. 03_기대수익률_임대현황_복사붙여넣기용_표.txt: 전체 복사 후 [+ 기대수익률 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭",
          "4. 04_현행_임대현황_엑셀업로드용.csv          : [📁 엑셀 파일 불러오기 ▾]에 바로 올릴 수 있는 현행 CSV 파일",
          "5. 05_기대수익률_임대현황_엑셀업로드용.csv    : [+ 기대수익률 임대차 현황] → [📁 엑셀 파일 불러오기 ▾] 업로드용 CSV 파일",
          "6. photos/                                    : IM [④ 사진·위치·만들기] 탭에 한꺼번에 올릴 현장 사진 10장",
          "",
        ].join("\r\n"),
      );
      bZip.file(
        "01_딜카드_현장메모_원문.txt",
        [
          BROKER_CASE02_MEMO,
          "",
          "--- [참고: 공적장부 기준 면적 대조값] ---",
          "• 대지면적: 596.00㎡ (약 180.3평)",
          "• 연면적  : 2,104.88㎡ (약 636.7평)",
          "• 주차대수: 20대 (지하 1층 ~ 지상 6층)",
        ].join("\r\n"),
      );
      bZip.file("02_현행_임대현황_복사붙여넣기용_표.txt", BROKER_CASE02_ASIS_TSV);
      bZip.file("03_기대수익률_임대현황_복사붙여넣기용_표.txt", BROKER_CASE02_STABILIZED_TSV);
      bZip.file("04_현행_임대현황_엑셀업로드용.csv", `\uFEFF${BROKER_CASE02_ASIS_CSV}\r\n`);
      bZip.file("05_기대수익률_임대현황_엑셀업로드용.csv", `\uFEFF${BROKER_CASE02_STABILIZED_CSV}\r\n`);
      bZip.file("99_선택체험_원단위숫자_자동보정용_표.txt", BROKER_CASE02_WON_TRAP_TSV);

      for (const img of brokerCase.images) {
        const imgBuf = await resolveHoldoutAssetBuffer({
          caseFolder: case02Folder,
          localRelPath: path.join("images", img.filename),
          assetKey: img.filename,
          publicFallbackRel: "test-images/dangsan/01_exterior.jpg",
          isImage: true,
          accentHex: "#1E3A8A",
        });
        if (imgBuf) {
          bZip.file(`photos/${img.filename}`, imgBuf);
        }
      }

      const bZipBytes = await bZip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      return new NextResponse(Buffer.from(bZipBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition":
            'attachment; filename="credeal_broker_stage1_seocho_230_10photos_kit.zip"',
          "Cache-Control": "no-store",
        },
      });
    }
  }

  if (format === "csv") {
    const csv = toUtf8BomCsv(SAMPLE_RENTROLL_CSV_ROWS);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="credeal_sample_rentroll.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "contacts") {
    const csv = toUtf8BomCsv(SAMPLE_CONTACTS_CSV_ROWS);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="credeal_sample_contacts_10.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  const zip = new JSZip();

  zip.file(
    "README.txt",
    [
      "CRE DealCard 검수용 표준 샘플 키트 (v5.1)",
      "============================================",
      "",
      "1. memos/",
      "   - 01_imdaesuik_lease_memo.txt : 임대수익용 표준 메모 (M1, M2 복붙 테스트용)",
      "   - 02_saok_owner_occ_memo.txt  : 사옥용 표준 메모",
      "   - 03_development_site_memo.txt: 신축·개발용 표준 메모",
      "",
      "2. rentroll/",
      "   - CREDEAL_rentroll_template_v1.5.xlsx : 공식 엑셀 렌트롤 양식",
      "   - credeal_sample_rentroll.csv         : 바로 업로드 가능한 샘플 CSV (UTF-8 BOM)",
      "",
      "3. photos/",
      "   - 01_exterior.jpg, 02_aerial.jpg, 03_entrance.jpg, 04_lobby.jpg, 05_parking.jpg",
      "   - 01_exterior.webp, 01_exterior.png (JPG/WebP/PNG 호환성 교차 검수용)",
      "",
      "4. contacts/",
      "   - credeal_sample_contacts_10.csv : 뉴스레터·인박스 테스트용 10명 연락처 CSV",
    ].join("\r\n")
  );

  zip.file("memos/01_imdaesuik_lease_memo.txt", SAMPLE_MEMO_IMDAE);
  zip.file("memos/02_saok_owner_occ_memo.txt", SAMPLE_MEMO_SAOK);
  zip.file("memos/03_development_site_memo.txt", SAMPLE_MEMO_DEV);

  zip.file("rentroll/credeal_sample_rentroll.csv", toUtf8BomCsv(SAMPLE_RENTROLL_CSV_ROWS));
  zip.file("contacts/credeal_sample_contacts_10.csv", toUtf8BomCsv(SAMPLE_CONTACTS_CSV_ROWS));

  const xlsxBuf = await tryReadPublicFile("CREDEAL_rentroll_template_v1.5.xlsx");
  if (xlsxBuf) {
    zip.file("rentroll/CREDEAL_rentroll_template_v1.5.xlsx", xlsxBuf);
  }

  const photoSpecs: ReadonlyArray<{
    outName: string;
    candidates: readonly string[];
    label: string;
    accentHex: string;
  }> = [
    {
      outName: "01_exterior.jpg",
      candidates: ["test-images/dangsan/01_exterior.jpg", "test-images/01_exterior.jpg"],
      label: "01 Exterior",
      accentHex: "#1D4ED8",
    },
    {
      outName: "02_aerial.jpg",
      candidates: ["test-images/dangsan/02_aerial.jpg", "test-images/02_aerial.jpg"],
      label: "02 Aerial",
      accentHex: "#0369A1",
    },
    {
      outName: "03_entrance.jpg",
      candidates: ["test-images/dangsan/03_entrance.jpg", "test-images/03_entrance.jpg"],
      label: "03 Entrance",
      accentHex: "#0F766E",
    },
    {
      outName: "04_lobby.jpg",
      candidates: ["test-images/dangsan/04_lobby.jpg", "test-images/04_lobby.jpg"],
      label: "04 Lobby",
      accentHex: "#4338CA",
    },
    {
      outName: "05_parking.jpg",
      candidates: [
        "test-images/dangsan/07_parking.jpg",
        "test-images/dangsan/05_parking.jpg",
        "test-images/07_parking.jpg",
        "test-images/05_parking.jpg",
      ],
      label: "05 Parking",
      accentHex: "#334155",
    },
  ];

  for (const spec of photoSpecs) {
    const buf = await resolveSamplePhotoBuffer(
      spec.candidates,
      spec.label,
      spec.accentHex
    );
    zip.file(`photos/${spec.outName}`, buf);

    if (spec.outName === "01_exterior.jpg") {
      try {
        const webpBuf = await sharp(buf).webp({ quality: 82 }).toBuffer();
        zip.file("photos/01_exterior.webp", webpBuf);
      } catch {
        // non-blocking
      }
      try {
        const pngBuf = await sharp(buf).png().toBuffer();
        zip.file("photos/01_exterior.png", pngBuf);
      } catch {
        // non-blocking
      }
    }
  }

  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new NextResponse(Buffer.from(zipBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="credeal_qa_sample_kit_v4.zip"',
      "Cache-Control": "no-store",
    },
  });
}
