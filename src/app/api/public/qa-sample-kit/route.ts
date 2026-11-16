import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const format = (req.nextUrl.searchParams.get("format") || "zip").trim().toLowerCase();

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
