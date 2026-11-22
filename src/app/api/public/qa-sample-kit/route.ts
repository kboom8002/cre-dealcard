import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { requireBroker } from "@/lib/auth-guard";
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
  BROKER_CASE02_ASIS_CSV,
  BROKER_CASE02_ASIS_TSV,
  BROKER_CASE02_ASSET_CDN_MAP,
  BROKER_CASE02_MEMO,
  BROKER_CASE02_STABILIZED_TSV,
  BROKER_CASE02_WON_TRAP_TSV,
  BROKER_FULL_LOOP_CASES,
} from "@/lib/testguide/broker-full-loop-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeMatchKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function hasValidQaAccessKey(req: NextRequest): boolean {
  const candidates = [
    (req.headers.get("x-qa-access-key") || "").trim(),
    (req.cookies.get("cre_qa_key")?.value || "").trim(),
    (req.nextUrl.searchParams.get("qaKey") || req.nextUrl.searchParams.get("key") || "").trim(),
  ].filter(Boolean);

  if (candidates.length === 0) return false;

  const configuredKeys = [
    process.env.QA_ACCESS_KEY,
    process.env.QA_TESTER_ACCESS_KEY,
    process.env.QA_BROKER_ACCESS_KEY,
  ]
    .map((v) => (v || "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    for (const key of configuredKeys) {
      if (timingSafeMatchKey(key, candidate)) return true;
    }
  }
  return false;
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
  const enforceGate =
    process.env.NODE_ENV === "production" ||
    process.env.CRE_ENFORCE_QA_GATE === "1";
  if (enforceGate) {
    const brokerUser = await resolveOptionalBrokerUser(req);
    if (!brokerUser?.id && !hasValidQaAccessKey(req)) {
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

      v2Zip.file(
        "00_README_홀드아웃_V2_실행안내.txt",
        [
          `${v2Case.code} (${v2Case.dealCode}) — ${v2Case.title}`,
          "================================================================",
          `대상 실매물: ${v2Case.propertyName} (${v2Case.askingPriceReadout})`,
          `권장 소요시간: 약 ${v2Case.targetMinutes}분 (${v2Case.deviceSetup})`,
          "",
          ...(scenario === "v2-loop1"
            ? [
                "1. 01_현장메모_원문.txt                 : 딜카드/IM 메모 원문",
                "2. 02_현황_렌트롤_v1.5_sqm.xlsx          : 15행 현황 표준양식 XLSX 업로드용",
                "3. 03_안정화_렌트롤_v1.5_sqm.xlsx        : 14행 안정화 표준양식 XLSX 검증용",
                "4. 04_안정화_서브탭_화면붙여넣기.tsv     : +기대수익률 서브탭 Ctrl+V용 TSV",
                "5. 05_뉴스레터_브리핑_초안.txt           : 영등포 메디컬 브리핑 본문 (지번 비노출)",
                "6. 06_고객연락처_샘플10명.csv            : 고객 소통·구독자 등록 샘플",
                "7. photos/                              : 고해상도 실사진 6장 (외관 3 · 내부 3)",
              ]
            : [
                "1. 01_현장메모_원문.txt                 : 잠원동 2필지 신축·개발 메모 원문",
                "2. 02_현황_렌트롤_화면붙여넣기.tsv       : 현황 6행 (만기경과 2개층 포함)",
                "3. 03_안정화_렌트롤_화면붙여넣기.tsv     : 대수선 안정화 6행 (+기대수익률 4.14%)",
                "4. 04_임대현황_업로드용.csv              : CSV 업로드용 현황 시트 (UTF-8 BOM)",
                "5. 05_뉴스레터_브리핑_초안.txt           : 서초 개발 브리핑 본문 (지번 비노출)",
                "6. 06_고객연락처_샘플10명.csv            : 고객 소통·구독자 등록 샘플",
                "7. photos/                              : 고해상도 실사진 5장 (외관 PNG 3 · 내부 JPEG 2)",
              ]),
        ].join("\r\n"),
      );

      if (scenario === "v2-loop1") {
        v2Zip.file("01_현장메모_원문.txt", HOLDOUT_V2_CASE04_MEMO);
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
        v2Zip.file("04_안정화_서브탭_화면붙여넣기.tsv", HOLDOUT_V2_CASE04_STABILIZED_TSV);
      } else {
        v2Zip.file("01_현장메모_원문.txt", HOLDOUT_V2_CASE03_MEMO);
        v2Zip.file("02_현황_렌트롤_화면붙여넣기.tsv", HOLDOUT_V2_CASE03_ASIS_TSV);
        v2Zip.file("03_안정화_렌트롤_화면붙여넣기.tsv", HOLDOUT_V2_CASE03_STABILIZED_TSV);
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
      bZip.file(
        "00_README_중개인_골든10장_안내.txt",
        [
          `${brokerCase.code} — ${brokerCase.title}`,
          "================================================================",
          `대상 실매물: ${brokerCase.propertyName} (${brokerCase.askingPriceReadout})`,
          `지번 주소: ${brokerCase.jibunAddress} / 도로명: ${brokerCase.roadAddress}`,
          `정답 면적: 대지 ${brokerCase.groundTruth.expectedLandAreaSqm}㎡ / 연면적 ${brokerCase.groundTruth.expectedGfaSqm}㎡`,
          `포함 현장 사진: 총 ${brokerCase.images.length}장 (외관 4장 + 내부·설비 6장, 세로형 승강기 포함)`,
          "",
          "[핵심 체험 포인트]",
          ...brokerCase.domainTraps.map((t) => `- [${t.code}] ${t.title}: ${t.detail}`),
          "",
        ].join("\r\n"),
      );
      bZip.file("01_딜카드_현장메모_원문.txt", BROKER_CASE02_MEMO);
      bZip.file("02_현행_임대현황_붙여넣기.tsv", BROKER_CASE02_ASIS_TSV);
      bZip.file("03_전층임대전환_기대수익률_붙여넣기.tsv", BROKER_CASE02_STABILIZED_TSV);
      bZip.file("04_현행_임대현황_업로드용.csv", `\uFEFF${BROKER_CASE02_ASIS_CSV}\r\n`);
      bZip.file("99_부록_원단위오입력_자동보정체험.tsv", BROKER_CASE02_WON_TRAP_TSV);

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
