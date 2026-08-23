import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * GET /api/broker/excel-template
 * CREDEAL 렌트롤 표준양식 v1.2 호환 엑셀 파일을 동적으로 생성하여 다운로드합니다.
 * 3시트 구성: 기입요령 | 렌트롤 | 자동검증
 */
export async function GET() {
  const wb = XLSX.utils.book_new();

  // ── 시트 1: 기입요령 ──
  const guideData = [
    ["CREDEAL 렌트롤 표준양식 v1.2 — 기입요령"],
    [""],
    ["① 두 번째 시트 '렌트롤'에 임대차 현황을 입력하세요."],
    ["② 금액 단위: 만원 (예: 보증금 5,000만원 → 5000)"],
    ["③ 면적 단위: ㎡ (전용면적 기준)"],
    ["④ 날짜 형식: YYYY-MM-DD (예: 2024-01-01)"],
    ["⑤ 공실인 호실은 용도/업종에 '공실' 또는 비고에 '공실'로 표기"],
    ["⑥ 자가사용 호실은 비고에 '자가사용' 또는 '오너' 표기"],
    [""],
    ["▶ 지원 포맷: .xlsx, .xls, .csv"],
    ["▶ 제목행·주소행이 위에 있어도 시스템이 자동 건너뜁니다."],
    ["▶ 원 단위(100,000 이상 숫자)도 자동 감지하여 만원으로 변환합니다."],
    [""],
    ["문의: support@credeal.co.kr"],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide["!cols"] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "기입요령");

  // ── 시트 2: 렌트롤 (메인 입력 시트) ──
  const headers = [
    "층",
    "호실",
    "용도/업종",
    "임차인(상호)",
    "전용면적(㎡)",
    "보증금(만원)",
    "월세(만원)",
    "관리비(만원)",
    "계약시작일",
    "계약종료일",
    "비고",
  ];

  const exampleRows = [
    ["B1", "B101", "음식점", "라이브펍", 120.5, 5000, 450, 30, "2023-06-01", "2026-05-31", ""],
    ["1층", "101호", "카페", "스타벅스", 85.5, 8000, 600, 50, "2024-01-01", "2028-12-31", "앵커테넌트"],
    ["2층", "201호", "공실", "", 92.3, "", "", "", "", "", "공실"],
    ["3층", "301호", "사무실", "A 법무법인", 110.2, 5000, 400, 40, "2023-03-01", "2026-02-28", ""],
    ["4층", "401호", "사무실", "B 회계법인", 110.2, 5000, 380, 40, "2024-07-01", "2027-06-30", ""],
    ["5층", "501호", "자가사용", "", 110.2, "", "", "", "", "", "오너 사용"],
  ];

  const data = [headers, ...exampleRows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 8 },    // 층
    { wch: 10 },   // 호실
    { wch: 14 },   // 용도/업종
    { wch: 16 },   // 임차인
    { wch: 14 },   // 전용면적
    { wch: 14 },   // 보증금
    { wch: 12 },   // 월세
    { wch: 12 },   // 관리비
    { wch: 14 },   // 계약시작일
    { wch: 14 },   // 계약종료일
    { wch: 16 },   // 비고
  ];

  XLSX.utils.book_append_sheet(wb, ws, "렌트롤");

  // ── 시트 3: 자동검증 ──
  const validationData = [
    ["자동검증 결과"],
    [""],
    ["항목", "수식", "결과"],
    ["총 호실 수", '=COUNTA(렌트롤!A2:A100)-COUNTBLANK(렌트롤!A2:A100)', ""],
    ["임대 호실 수", '=COUNTIF(렌트롤!K2:K100,"<>공실")-COUNTBLANK(렌트롤!A2:A100)+COUNTBLANK(렌트롤!K2:K100)', ""],
    ["공실 호실 수", '=COUNTIF(렌트롤!C2:C100,"공실")+COUNTIF(렌트롤!K2:K100,"공실")', ""],
    ["총 보증금(만원)", '=SUM(렌트롤!F2:F100)', ""],
    ["총 월세(만원)", '=SUM(렌트롤!G2:G100)', ""],
    ["총 관리비(만원)", '=SUM(렌트롤!H2:H100)', ""],
    ["연 임대수입(만원)", '=SUM(렌트롤!G2:G100)*12', ""],
    [""],
    ["※ 이 시트는 참고용입니다. 시스템은 '렌트롤' 시트를 자동으로 읽습니다."],
  ];
  const wsValidation = XLSX.utils.aoa_to_sheet(validationData);
  wsValidation["!cols"] = [{ wch: 20 }, { wch: 50 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsValidation, "자동검증");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=CREDEAL_rentroll_template_v1.2.xlsx",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
