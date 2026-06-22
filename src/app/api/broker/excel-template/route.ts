import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * GET /api/broker/excel-template
 * 렌트롤 작성용 빈 엑셀 파일을 동적으로 생성하여 다운로드합니다.
 */
export async function GET() {
  const headers = [
    "층",
    "호실",
    "용도/업종",
    "임차인",
    "면적(㎡)",
    "보증금(만원)",
    "월세(만원)",
    "관리비(만원)",
    "계약시작일",
    "계약종료일",
    "비고",
  ];

  const exampleRow = [
    "1층",
    "101호",
    "카페",
    "스타벅스",
    85.5,
    5000,
    350,
    30,
    "2024-01-01",
    "2026-12-31",
    "",
  ];

  const vacantRow = [
    "2층",
    "201호",
    "공실",
    "",
    92.3,
    "",
    "",
    "",
    "",
    "",
    "공실",
  ];

  const data = [headers, exampleRow, vacantRow];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // 컬럼 너비 설정
  ws["!cols"] = [
    { wch: 8 },   // 층
    { wch: 10 },  // 호실
    { wch: 14 },  // 용도/업종
    { wch: 14 },  // 임차인
    { wch: 12 },  // 면적
    { wch: 14 },  // 보증금
    { wch: 12 },  // 월세
    { wch: 12 },  // 관리비
    { wch: 14 },  // 계약시작일
    { wch: 14 },  // 계약종료일
    { wch: 14 },  // 비고
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "렌트롤");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=rent-roll-template.xlsx",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
