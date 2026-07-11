"use client";

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";

interface RentRollImporterProps {
  onImport: (data: {
    monthlyRent: number;
    totalDeposit: number;
    mgmtFeeTotal: number;
    vacancyPct: number;
  }) => void;
}

interface ParseResult {
  monthlyRent: number;
  totalDeposit: number;
  mgmtFeeTotal: number;
  vacancyPct: number;
  rowCount: number;
  vacantCount: number;
  detectedHeaderRow: number;
  unitDetected: "manwon" | "won";
}

/**
 * 금액이 원 단위인지 만원 단위인지 자동 감지
 * 값이 100,000 이상이면 원 단위로 판단
 */
function detectAndConvertToManwon(value: number): { manwon: number; unit: "won" | "manwon" } {
  if (value >= 100000) {
    return { manwon: Math.round(value / 10000), unit: "won" };
  }
  return { manwon: value, unit: "manwon" };
}

/**
 * CSV/Excel 렌트롤 파서 v2
 * - 멀티 헤더(실무 양식)에서 실제 컬럼 헤더 행 자동 탐지
 * - 금액 단위(원/만원) 자동 감지 및 변환
 * - 컬럼 키워드 대폭 확장
 * - 업종 컬럼이 비어있으면 공실로 추정
 */
function parseRentRollData(data: any[][]): ParseResult {
  const lines = data.filter(
    (row) => row && row.length > 0 && row.some((cell) => String(cell ?? "").trim() !== "")
  );

  if (lines.length < 2) throw new Error("데이터가 부족합니다 (최소 2행 필요)");

  // ── 헤더 행 자동 탐지 (최대 10행 스캔)
  const HEADER_KEYWORDS = ["층", "호실", "면적", "보증금", "월세", "임대료", "rent", "deposit"];
  let headerRowIdx = 0;
  const maxScan = Math.min(10, lines.length - 1);

  for (let i = 0; i < maxScan; i++) {
    const rowText = lines[i].map((c) => String(c ?? "").toLowerCase()).join(" ");
    const matchCount = HEADER_KEYWORDS.filter((k) => rowText.includes(k)).length;
    if (matchCount >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  const header = lines[headerRowIdx].map((h) =>
    String(h ?? "").trim().toLowerCase().replace(/[\s()（）]/g, "")
  );

  // ── 컬럼 인덱스 자동 매칭
  const findCol = (keywords: string[]) =>
    header.findIndex((h) => h && keywords.some((k) => h.includes(k)));

  const rentIdx = findCol(["월임대료", "월세", "임대료", "rent", "월차임"]);
  const depositIdx = findCol(["보증금", "임대보증금", "deposit"]);
  const mgmtIdx = findCol(["관리비", "공용관리비", "mgmt", "maintenance"]);
  const vacantIdx = findCol(["공실", "vacant", "empty"]);
  const bizTypeIdx = findCol(["업종", "용도", "임차인", "tenant", "입주사"]);

  let totalRent = 0;
  let totalDeposit = 0;
  let totalMgmt = 0;
  let vacantCount = 0;
  let rowCount = 0;
  let unitDetected: "won" | "manwon" = "manwon";

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cols = lines[i];
    if (!cols || cols.length < 2) continue;

    // 행이 완전히 비어있으면 건너뜀
    const rowHasData = cols.some((c) => {
      const v = String(c ?? "").trim();
      return v !== "" && v !== "0";
    });
    if (!rowHasData) continue;

    rowCount++;

    const parseNum = (idx: number): number => {
      if (idx < 0 || idx >= cols.length || cols[idx] == null) return 0;
      const cleaned = String(cols[idx]).replace(/[^0-9.\-]/g, "");
      return parseFloat(cleaned) || 0;
    };

    const rawRent = parseNum(rentIdx >= 0 ? rentIdx : 4);
    const rawDeposit = parseNum(depositIdx >= 0 ? depositIdx : 3);
    const rawMgmt = parseNum(mgmtIdx >= 0 ? mgmtIdx : -1);

    // 단위 감지 (첫 번째 비-0 값으로 판단)
    if (rawRent > 0 || rawDeposit > 0) {
      const sampleVal = rawDeposit > 0 ? rawDeposit : rawRent;
      if (sampleVal >= 100000) unitDetected = "won";
    }

    const convertedRent = detectAndConvertToManwon(rawRent).manwon;
    const convertedDeposit = detectAndConvertToManwon(rawDeposit).manwon;
    const convertedMgmt = detectAndConvertToManwon(rawMgmt).manwon;

    totalRent += convertedRent;
    totalDeposit += convertedDeposit;
    totalMgmt += convertedMgmt;

    // 공실 여부 판단
    let isVacant = false;
    if (vacantIdx >= 0 && cols[vacantIdx] != null) {
      const val = String(cols[vacantIdx]).toLowerCase().trim();
      isVacant = val === "y" || val === "1" || val === "공실" || val === "true" || val === "yes" || val === "●";
    } else if (bizTypeIdx >= 0) {
      // 업종/임차인 컬럼이 비어있으면 공실로 추정
      const bizVal = String(cols[bizTypeIdx] ?? "").trim();
      if (bizVal === "" || bizVal === "-" || bizVal === "공실") isVacant = true;
    }
    if (isVacant) vacantCount++;
  }

  const vacancyPct = rowCount > 0 ? Math.round((vacantCount / rowCount) * 100) : 0;

  return {
    monthlyRent: Math.round(totalRent),
    totalDeposit: Math.round(totalDeposit),
    mgmtFeeTotal: Math.round(totalMgmt),
    vacancyPct,
    rowCount,
    vacantCount,
    detectedHeaderRow: headerRowIdx + 1,
    unitDetected,
  };
}

const HELP_CONTENT = [
  { icon: "📋", text: "필수 컬럼: 층수, 호실, 보증금, 월세" },
  { icon: "📊", text: "선택 컬럼: 면적(㎡), 관리비, 업종/임차인" },
  { icon: "💰", text: "금액은 원 단위/만원 단위 모두 자동 인식" },
  { icon: "📄", text: "제목·주소 행이 위에 있어도 자동 건너뜀" },
  { icon: "🏢", text: "업종/임차인 칸이 비면 공실로 자동 계산" },
  { icon: "📁", text: ".xlsx, .xls, .csv 모두 지원" },
];

export function RentRollImporter({ onImport }: RentRollImporterProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<string>("");
  const [isError, setIsError] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setResult("");
    setIsError(false);

    try {
      // xlsx@0.18.5 — readAsBinaryString + type:'binary'가 .xlsx 파싱에 가장 안정적
      const binaryStr = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
        reader.readAsBinaryString(file);
      });

      const workbook = XLSX.read(binaryStr, { type: "binary" });
      
      if (!workbook.SheetNames.length) {
        throw new Error("시트를 찾을 수 없습니다. 파일이 비어있는지 확인해주세요.");
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      if (!worksheet) {
        throw new Error(`시트 '${firstSheetName}'를 읽을 수 없습니다.`);
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (!jsonData || jsonData.length === 0) {
        throw new Error("시트에 데이터가 없습니다. 다른 시트나 파일을 확인해주세요.");
      }

      const parsed = parseRentRollData(jsonData);

      onImport({
        monthlyRent: parsed.monthlyRent,
        totalDeposit: parsed.totalDeposit,
        mgmtFeeTotal: parsed.mgmtFeeTotal,
        vacancyPct: parsed.vacancyPct,
      });

      const unitLabel = parsed.unitDetected === "won" ? "(원→만원 자동변환)" : "(만원 단위)";
      const vacancyInfo = parsed.vacantCount > 0
        ? ` · 공실 ${parsed.vacantCount}개(${parsed.vacancyPct}%)`
        : " · 만실";
      setResult(
        `✅ ${parsed.rowCount}개 호실 분석 완료 ${unitLabel}\n` +
        `월세 ${parsed.monthlyRent.toLocaleString()}만원 · 보증금 ${parsed.totalDeposit.toLocaleString()}만원${vacancyInfo}`
      );
    } catch (err: any) {
      setIsError(true);
      setResult(`❌ ${err?.message ?? "파일 파싱 실패"}\n💡 아래 '?' 버튼을 눌러 작성 가이드를 확인하세요.`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">엑셀 렌트롤 간편 임포트</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            임대차 현황표 업로드 → 임대료·보증금·공실률 자동 계산
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          {/* Help button */}
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className={`w-7 h-7 rounded-full border text-xs font-bold flex items-center justify-center transition-colors ${
              showHelp
                ? "bg-primary/20 border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
            }`}
            aria-label="엑셀 작성 가이드"
            title="엑셀 작성 가이드"
          >
            ?
          </button>
          {/* Template download button */}
          <a
            href="/api/broker/excel-template"
            download="rent-roll-template.xlsx"
            className="border border-primary/30 text-primary px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-primary/10 transition-colors whitespace-nowrap"
            title="파싱 호환 빈 엑셀 양식 다운로드"
          >
            📥 빈 양식
          </a>
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
          >
            {isImporting ? "분석 중..." : "엑셀/CSV 업로드"}
          </button>
        </div>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="bg-background border border-border rounded-lg p-3 space-y-2 animate-in fade-in duration-150">
          <p className="text-xs font-bold text-foreground">📋 엑셀 작성 가이드</p>
          <ul className="space-y-1.5">
            {HELP_CONTENT.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">{item.icon}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 p-2 bg-primary/5 rounded text-[11px] text-primary/80 leading-relaxed">
            💡 <strong>팁:</strong> 기존 임대차 현황표를 그대로 업로드해보세요! 제목·주소·소계 행이 있어도 자동으로 건너뜁니다.
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <p className={`text-xs font-medium whitespace-pre-line ${
          isError ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
        }`}>
          {result}
        </p>
      )}
    </div>
  );
}
