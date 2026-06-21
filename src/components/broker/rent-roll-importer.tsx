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

/**
 * CSV/Excel 렌트롤 파서
 * 지원 컬럼: 층, 호실, 면적(㎡), 월임대료(만원), 보증금(만원), 관리비(만원), 공실여부
 * 첫 행은 헤더로 간주하며, 컬럼 순서 또는 컬럼명 자동 매칭
 */
function parseRentRollData(data: any[][]): {
  monthlyRent: number;
  totalDeposit: number;
  mgmtFeeTotal: number;
  vacancyPct: number;
  rowCount: number;
} {
  const lines = data.filter(row => row && row.length > 0 && row.some(cell => String(cell).trim() !== ""));
  if (lines.length < 2) throw new Error("데이터가 부족합니다 (최소 헤더 + 1행 필요)");

  const header = lines[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, ""));

  // 컬럼 인덱스 자동 매칭
  const findCol = (keywords: string[]) =>
    header.findIndex(h => keywords.some(k => h.includes(k)));

  const rentIdx = findCol(["월임대료", "임대료", "월세", "rent"]);
  const depositIdx = findCol(["보증금", "deposit"]);
  const mgmtIdx = findCol(["관리비", "mgmt", "maintenance"]);
  const vacantIdx = findCol(["공실", "vacant", "empty"]);

  let totalRent = 0;
  let totalDeposit = 0;
  let totalMgmt = 0;
  let vacantCount = 0;
  let rowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i];
    if (cols.length < 2) continue;
    rowCount++;

    const parseNum = (idx: number) => {
      if (idx < 0 || idx >= cols.length || !cols[idx]) return 0;
      const cleaned = String(cols[idx]).replace(/[^0-9.\-]/g, "");
      return parseFloat(cleaned) || 0;
    };

    totalRent += parseNum(rentIdx >= 0 ? rentIdx : 3);
    totalDeposit += parseNum(depositIdx >= 0 ? depositIdx : 4);
    totalMgmt += parseNum(mgmtIdx >= 0 ? mgmtIdx : 5);

    if (vacantIdx >= 0 && cols[vacantIdx]) {
      const val = String(cols[vacantIdx]).toLowerCase();
      if (val === "y" || val === "1" || val === "공실" || val === "true" || val === "yes") {
        vacantCount++;
      }
    }
  }

  const vacancyPct = rowCount > 0 ? Math.round((vacantCount / rowCount) * 100) : 0;

  return {
    monthlyRent: Math.round(totalRent),
    totalDeposit: Math.round(totalDeposit),
    mgmtFeeTotal: Math.round(totalMgmt),
    vacancyPct,
    rowCount,
  };
}

export function RentRollImporter({ onImport }: RentRollImporterProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setResult("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      const parsed = parseRentRollData(jsonData);

      onImport({
        monthlyRent: parsed.monthlyRent,
        totalDeposit: parsed.totalDeposit,
        mgmtFeeTotal: parsed.mgmtFeeTotal,
        vacancyPct: parsed.vacancyPct,
      });

      setResult(`✅ ${parsed.rowCount}개 호실 분석 완료`);
    } catch (err: any) {
      setResult(`❌ ${err?.message ?? "파일 파싱 실패"}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">엑셀 렌트롤 간편 임포트</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            CSV/Excel 파일을 업로드하면 임대료, 보증금, 공실률이 자동 계산됩니다.
          </p>
        </div>
        <div>
          <input
            type="file"
            accept=".csv, .txt, .xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
          >
            {isImporting ? "분석 중..." : "엑셀/CSV 업로드"}
          </button>
        </div>
      </div>
      {result && (
        <p className="text-xs mt-2 font-medium">{result}</p>
      )}
    </div>
  );
}
