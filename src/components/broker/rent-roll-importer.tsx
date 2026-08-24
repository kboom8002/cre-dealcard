"use client";

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";

interface RentRollImporterProps {
  hasExistingData?: boolean;
  onImport: (data: {
    monthlyRent: number;
    totalDeposit: number;
    mgmtFeeTotal: number;
    vacancyPct: number;
    floorLeases: Array<{
      floor: string;
      tenant_type?: string;
      tenant_name?: string;
      deposit_manwon?: number;
      rent_manwon?: number;
      mgmt_fee_manwon?: number;
      is_vacant?: boolean;
      area_sqm?: number;
      lease_start?: string;
      lease_end?: string;
    }>;
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
  parsedRows: Array<{
    floor: string;
    tenant_type?: string;
    tenant_name?: string;
    deposit_manwon?: number;
    rent_manwon?: number;
    mgmt_fee_manwon?: number;
    is_vacant?: boolean;
    area_sqm?: number;
    lease_start?: string;
    lease_end?: string;
  }>;
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
  const floorIdx = findCol(["층", "층수", "floor", "호", "위치"]);
  const areaIdx = findCol(['면적', '전용면적', 'area', '㎡', '평']);
  const tenantNameIdx = findCol(['임차인', '입주사', 'tenant', '상호']);
  const leaseStartIdx = findCol(['계약시작', '시작일', '개시일', 'start']);
  const leaseEndIdx = findCol(['계약종료', '종료일', '만료일', 'end', '만기']);

  let totalRent = 0;
  let totalDeposit = 0;
  let totalMgmt = 0;
  let vacantCount = 0;
  let rowCount = 0;
  let unitDetected: "won" | "manwon" = "manwon";

  const parsedRows: ParseResult['parsedRows'] = [];

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

    // Accumulate per-row data
    const actualFloorIdx = floorIdx >= 0 ? floorIdx : 0;
    const floorVal = cols[actualFloorIdx] != null ? String(cols[actualFloorIdx]).trim() : `${rowCount}F`;
    const bizVal = bizTypeIdx >= 0 && cols[bizTypeIdx] != null ? String(cols[bizTypeIdx]).trim() : undefined;
    
    const tName = tenantNameIdx >= 0 && cols[tenantNameIdx] != null ? String(cols[tenantNameIdx]).trim() : undefined;
    
    let areaVal: number | undefined = undefined;
    if (areaIdx >= 0 && cols[areaIdx] != null) {
      const originalStr = String(cols[areaIdx]);
      const areaStr = originalStr.replace(/[^0-9.]/g, "");
      const areaNum = parseFloat(areaStr);
      if (!isNaN(areaNum)) {
        if (originalStr.includes('평') || (areaNum < 50 && areaStr.includes('.'))) {
           areaVal = parseFloat((areaNum * 3.30578).toFixed(2));
        } else {
           areaVal = areaNum;
        }
      }
    }

    const parseDate = (val: any) => {
      if (!val) return undefined;
      let s = String(val).trim();
      if (!isNaN(Number(s)) && Number(s) > 30000) {
        const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }
      s = s.replace(/\./g, '-').replace(/\//g, '-');
      const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      }
      return s;
    };

    const lStart = leaseStartIdx >= 0 ? parseDate(cols[leaseStartIdx]) : undefined;
    const lEnd = leaseEndIdx >= 0 ? parseDate(cols[leaseEndIdx]) : undefined;

    parsedRows.push({
      floor: floorVal,
      tenant_type: bizVal || undefined,
      tenant_name: tName || undefined,
      deposit_manwon: convertedDeposit || undefined,
      rent_manwon: convertedRent || undefined,
      mgmt_fee_manwon: convertedMgmt || undefined,
      is_vacant: isVacant || undefined,
      area_sqm: areaVal,
      lease_start: lStart,
      lease_end: lEnd,
    });
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
    parsedRows,
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

export function RentRollImporter({ hasExistingData, onImport }: RentRollImporterProps) {
  const [mode, setMode] = useState<"excel" | "text">("excel");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<string>("");
  const [isError, setIsError] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedPreview, setParsedPreview] = useState<{
    rows: Array<{
      floor: string;
      tenant_type?: string;
      tenant_name?: string;
      deposit_manwon: number;
      rent_manwon: number;
      mgmt_fee_manwon: number;
      is_vacant: boolean;
      area_sqm?: number;
      lease_start?: string;
      lease_end?: string;
    }>;
    monthlyRent: number;
    totalDeposit: number;
    mgmtFeeTotal: number;
    vacancyPct: number;
  } | null>(null);

  const updatePreviewTotals = (newRows: any[]) => {
    let totDep = 0;
    let totRent = 0;
    let totMgmt = 0;
    let vacCnt = 0;
    newRows.forEach(r => {
      totDep += (r.deposit_manwon || 0);
      totRent += (r.rent_manwon || 0);
      totMgmt += (r.mgmt_fee_manwon || 0);
      if (r.is_vacant) vacCnt++;
    });
    const vacPct = newRows.length > 0 ? Math.round((vacCnt / newRows.length) * 100) : 0;
    setParsedPreview(prev => prev ? {
      ...prev,
      rows: newRows,
      totalDeposit: totDep,
      monthlyRent: totRent,
      mgmtFeeTotal: totMgmt,
      vacancyPct: vacPct
    } : null);

    // 실시간 수정 내용도 상위 폼에 즉시 반영
    onImport({
      monthlyRent: totRent,
      totalDeposit: totDep,
      mgmtFeeTotal: totMgmt,
      vacancyPct: vacPct,
      floorLeases: newRows,
    });
  };

  const handleTextParse = async () => {
    if (hasExistingData && !window.confirm('기존 렌트롤 데이터가 있습니다. 새 데이터로 덮어쓰시겠습니까?')) return;
    if (!textInput.trim() || textInput.trim().length < 5) {
      setIsError(true);
      setResult("❌ 최소 5자 이상의 텍스트를 입력해 주세요.");
      return;
    }
    setIsParsing(true);
    setResult("");
    setIsError(false);
    try {
      const res = await fetch("/api/broker/rent-roll/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "파싱에 실패했습니다.");
      }
      const data = await res.json();
      
      const rows = (data.floorLeases || []).map((r: any) => ({
        ...r,
        deposit_manwon: r.deposit_manwon || 0,
        rent_manwon: r.rent_manwon || 0,
        mgmt_fee_manwon: r.mgmt_fee_manwon || 0,
        is_vacant: r.is_vacant || false,
      }));

      setParsedPreview({
        rows,
        monthlyRent: data.monthlyRent,
        totalDeposit: data.totalDeposit,
        mgmtFeeTotal: data.mgmtFeeTotal,
        vacancyPct: data.vacancyPct,
      });

      // 파싱 즉시 상위 폼(월 임대료, 보증금, 관리비, 공실률)에 자동 입력
      onImport({
        monthlyRent: data.monthlyRent,
        totalDeposit: data.totalDeposit,
        mgmtFeeTotal: data.mgmtFeeTotal,
        vacancyPct: data.vacancyPct,
        floorLeases: rows,
      });

      setResult("✅ AI 분석이 완료되었습니다. 폼에 금액이 자동 입력되었습니다.");
    } catch (err: any) {
      setIsError(true);
      setResult(`❌ ${err?.message ?? "텍스트 파싱 실패"}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (hasExistingData && !window.confirm('기존 렌트롤 데이터가 있습니다. 새 데이터로 덮어쓰시겠습니까?')) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

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

      // v1.2 표준양식 호환: '렌트롤' 시트 우선 탐지
      const rentRollSheetName = workbook.SheetNames.find(
        (name) => name.includes('렌트롤') || name.toLowerCase().includes('rent')
      );
      const targetSheetName = rentRollSheetName || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[targetSheetName];
      console.log(`[RentRollImporter] Using sheet: '${targetSheetName}' (of ${workbook.SheetNames.length} sheets)`);
      
      if (!worksheet) {
        throw new Error(`시트 '${targetSheetName}'를 읽을 수 없습니다.`);
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (!jsonData || jsonData.length === 0) {
        throw new Error("시트에 데이터가 없습니다. 다른 시트나 파일을 확인해주세요.");
      }

      const parsed = parseRentRollData(jsonData);

      const rows = parsed.parsedRows.map((r) => ({
        ...r,
        deposit_manwon: r.deposit_manwon || 0,
        rent_manwon: r.rent_manwon || 0,
        mgmt_fee_manwon: r.mgmt_fee_manwon || 0,
        is_vacant: r.is_vacant || false,
      }));

      setParsedPreview({
        rows,
        monthlyRent: parsed.monthlyRent,
        totalDeposit: parsed.totalDeposit,
        mgmtFeeTotal: parsed.mgmtFeeTotal,
        vacancyPct: parsed.vacancyPct,
      });

      // 파싱 즉시 상위 폼(월 임대료, 보증금, 관리비, 공실률)에 자동 입력
      onImport({
        monthlyRent: parsed.monthlyRent,
        totalDeposit: parsed.totalDeposit,
        mgmtFeeTotal: parsed.mgmtFeeTotal,
        vacancyPct: parsed.vacancyPct,
        floorLeases: rows,
      });

      const unitLabel = parsed.unitDetected === "won" ? "(원→만원 자동변환)" : "(만원 단위)";
      setResult(`✅ ${parsed.rowCount}개 호실 분석 완료 ${unitLabel}. 폼에 금액이 자동 입력되었습니다.`);
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
      {/* Tab Toggle */}
      <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
        <button
          type="button"
          onClick={() => { setMode("excel"); setResult(""); setIsError(false); setParsedPreview(null); }}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
            mode === "excel"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📁 엑셀/CSV
        </button>
        <button
          type="button"
          onClick={() => { setMode("text"); setResult(""); setIsError(false); setParsedPreview(null); }}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
            mode === "text"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📝 텍스트 입력
        </button>
      </div>

      {/* Excel Mode */}
      {mode === "excel" && (
        <>
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
              <a
                href="/CREDEAL_rentroll_template_v1.2.xlsx"
                download="CREDEAL_렌트롤_표준양식_v1.2.xlsx"
                className="border border-primary/30 text-primary px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-primary/10 transition-colors whitespace-nowrap"
                title="파싱 호환 빈 엑셀 양식 다운로드"
              >
                📥 빈 양식
              </a>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
              >
                {isImporting ? "분석 중..." : "엑셀/CSV 업로드"}
              </button>
            </div>
          </div>

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
        </>
      )}

      {/* Text Mode */}
      {mode === "text" && (
        <div className="space-y-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">자연어 렌트롤 입력</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              층별 임대 현황을 자유롭게 입력하면 AI가 자동 분석합니다
            </p>
          </div>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={`예시:\nB1 라이브펍(5,000/450)\n1F 카페 보증금 8,000 월세 600\n2F 공실\n3~4F 스튜디오(5,000/400)\n\n또는 상세하게:\n1층 약국 보증금 8000만 월세 600만 관리비 50만 계약 2023.03~2026.02`}
            className="w-full h-28 bg-background border border-input rounded-lg px-3 py-2 text-xs leading-relaxed resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={handleTextParse}
            disabled={isParsing || !textInput.trim()}
            className="w-full bg-primary text-primary-foreground py-2 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isParsing ? "🔄 AI 분석 중..." : "✨ AI 분석"}
          </button>
        </div>
      )}

      {/* Result */}
      {result && !parsedPreview && (
        <p className={`text-xs font-medium whitespace-pre-line ${
          isError ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
        }`}>
          {result}
        </p>
      )}

      {/* Parsed Preview Editable Mini-Table */}
      {parsedPreview && (
        <div className="mt-4 bg-secondary/50 rounded-lg p-3 border border-border animate-in fade-in duration-150">
          <h4 className="text-sm font-semibold mb-2 text-foreground">데이터 확인 및 수정</h4>
          <div className="max-h-60 overflow-y-auto mb-2 border border-border rounded">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-2 py-1 font-medium">층</th>
                  <th className="px-2 py-1 font-medium">업종</th>
                  <th className="px-2 py-1 font-medium">보증금</th>
                  <th className="px-2 py-1 font-medium">월세</th>
                  <th className="px-2 py-1 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {parsedPreview.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-2 py-1">
                      <input 
                        type="text" 
                        value={row.floor} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].floor = e.target.value;
                          setParsedPreview({ ...parsedPreview, rows: newRows });
                        }}
                        className="w-12 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input 
                        type="text" 
                        value={row.tenant_type || ''} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].tenant_type = e.target.value;
                          setParsedPreview({ ...parsedPreview, rows: newRows });
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input 
                        type="number" 
                        value={row.deposit_manwon} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].deposit_manwon = Number(e.target.value);
                          updatePreviewTotals(newRows);
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input 
                        type="number" 
                        value={row.rent_manwon} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].rent_manwon = Number(e.target.value);
                          updatePreviewTotals(newRows);
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select 
                        value={row.is_vacant ? '공실' : '임대중'} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].is_vacant = e.target.value === '공실';
                          updatePreviewTotals(newRows);
                        }}
                        className="bg-transparent border-none p-0 text-xs focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="임대중">임대중</option>
                        <option value="공실">공실</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground mb-3 font-medium">
            <span>총 보증금: {parsedPreview.totalDeposit.toLocaleString()}만원</span>
            <span>총 월세: {parsedPreview.monthlyRent.toLocaleString()}만원</span>
            <span>공실률: {parsedPreview.vacancyPct}%</span>
          </div>
          {result && (
            <p className={`text-xs font-medium whitespace-pre-line mb-3 ${
              isError ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
            }`}>
              {result}
            </p>
          )}
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={() => {
                onImport({
                  monthlyRent: parsedPreview.monthlyRent,
                  totalDeposit: parsedPreview.totalDeposit,
                  mgmtFeeTotal: parsedPreview.mgmtFeeTotal,
                  vacancyPct: parsedPreview.vacancyPct,
                  floorLeases: parsedPreview.rows
                });
                setParsedPreview(null);
                setResult("✅ 데이터가 성공적으로 반영되었습니다.");
              }} 
              className="flex-1 bg-primary text-primary-foreground py-1.5 rounded text-xs font-medium hover:opacity-90 transition-opacity"
            >
              적용
            </button>
            <button 
              type="button"
              onClick={() => {
                setParsedPreview(null);
                setResult("");
              }} 
              className="flex-1 bg-muted text-foreground py-1.5 rounded text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
