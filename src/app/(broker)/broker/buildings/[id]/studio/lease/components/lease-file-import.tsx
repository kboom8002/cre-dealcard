'use client';

import React, { useRef, useState } from 'react';
// SECURITY: SheetJS(xlsx) 입력은 신뢰할 수 없다 — 파일 크기 제한 + 파서 단의 위치·값 검증으로 방어
import * as XLSX from 'xlsx';
import { isExampleRentRollRow } from '@/lib/rentroll/example-row';
import { parseRentRollWorkbook } from '@/lib/rentroll/parse-rentroll-workbook';

/** 업종 문구 → 스튜디오 tenant_type (공실 문구 포함) */
function classifyTenantType(typeVal: string, isVacant = false): string {
  if (isVacant) return 'vacant';
  if (typeVal.includes('식당') || typeVal.includes('카페') || typeVal.includes('음식')) return 'food';
  if (typeVal.includes('매장') || typeVal.includes('리테일') || typeVal.includes('상가')) return 'retail';
  if (typeVal.includes('공실')) return 'vacant';
  return 'office';
}

interface TenantRow {
  floor: string;
  area_sqm: number;
  tenant_type: string;
  monthly_rent: number | null;
  deposit: number | null;
  contract_end: string | null;
  is_anchor: boolean;
  tenant_name: string | null;
}

interface LeaseFileImportProps {
  onImport: (tenants: TenantRow[]) => void;
}

export function LeaseFileImport({ onImport }: LeaseFileImportProps) {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // SECURITY: Validate file size to prevent DoS attacks via malicious large xlsx files
    if (file.size > 5 * 1024 * 1024) {
      setError("파일 크기는 5MB를 초과할 수 없습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError(null);

    const reader = new FileReader();
    const isTextSheet =
      /\.(csv|tsv|txt)$/i.test(file.name) ||
      file.type.includes("csv") ||
      file.type.startsWith("text/");

    reader.onload = (evt) => {
      try {
        const result = evt.target?.result;
        if (!result) {
          throw new Error("파일을 읽을 수 없습니다.");
        }
        const wb =
          typeof result === "string"
            ? XLSX.read(result.replace(/^\uFEFF/, ""), { type: "string" })
            : XLSX.read(result, { type: "array" });

        // 표준양식(v1.3~v1.5) + 비표준 엑셀/CSV 모두 parseRentRollWorkbook 정본 파이프라인으로 통일 ([예시] 13행/합계행 차단 포함)
        const parsed = parseRentRollWorkbook(wb);
        const blocking = parsed.issues.find((i) => i.level === "blocking");
        if (blocking) {
          throw new Error(
            `${blocking.message} 엑셀 G9(면적 단위)를 확인해 다시 올려 주세요. (바텀시트 렌트롤 임포트에서는 사유를 남기고 해제할 수 있습니다)`,
          );
        }

        const filteredRows = parsed.parsedRows.filter(
          (r) =>
            !isExampleRentRollRow({
              floor: r.floor,
              biz: r.tenant_type || r.tenant_name,
              tenantName: r.tenant_name,
              note: r.note,
            }),
        );

        const newTenants: TenantRow[] = filteredRows.map((r) => ({
          floor: r.floor || "미상",
          area_sqm: r.area_sqm ?? 0, // ㎡ 정본 — 정수 반올림하지 않는다
          tenant_type: classifyTenantType(r.tenant_type ?? "", r.is_vacant === true),
          // 통합계약 비대표 행은 금액이 없다 → 0 이 아니라 null
          monthly_rent: r.rent_manwon != null ? r.rent_manwon * 10000 : null,
          deposit: r.deposit_manwon != null ? r.deposit_manwon * 10000 : null,
          contract_end: r.lease_end ?? null,
          is_anchor: false,
          tenant_name: r.tenant_name ?? null,
        }));

        if (newTenants.length > 0) {
          onImport(newTenants);
        } else {
          setError("유효한 임대차 데이터를 찾을 수 없습니다.");
        }
      } catch (err: any) {
        setError(err.message || "파일 파싱에 실패했습니다.");
      }

      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    if (isTextSheet) {
      reader.readAsText(file, "utf-8");
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <input
        type="file"
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="min-h-[48px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
      >
        <span>📊 XLS/CSV 임포트</span>
      </button>
      <a
        href="/CREDEAL_rentroll_template_v1.5.xlsx"
        download="CREDEAL_렌트롤_표준양식_v1.5.xlsx"
        className="inline-flex min-h-[48px] items-center px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
        title="CREDEAL 렌트롤 표준양식 v1.5 (빈 양식) 다운로드"
      >
        📥 빈 양식
      </a>
      {error && <span role="alert" className="text-sm text-red-700 font-bold">{error}</span>}
    </div>
  );
}
