'use client';

import React, { useRef, useState } from 'react';
// SECURITY: SheetJS(xlsx) 입력은 신뢰할 수 없다 — 파일 크기 제한 + 파서 단의 위치·값 검증으로 방어
import * as XLSX from 'xlsx';
import { pyeongToSqm } from '@/lib/utils/area-conversion';
import { detectVersion, parseRentRollWorkbook, pickRentRollSheetName } from '@/lib/rentroll/parse-rentroll-workbook';

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

  const parseValue = (val: any): string => {
    if (val === undefined || val === null) return '';
    return String(val).trim();
  };

  const parseNumber = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
  };

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
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        // '렌트롤' 시트 우선(없으면 첫 시트) — 표준양식은 첫 시트가 안내 시트라서 SheetNames[0] 이 아니다
        const wsname = pickRentRollSheetName(wb) ?? wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        // CREDEAL 표준양식(v1.3~v1.5): 고정 열 위치로 정확히 읽는다. 금액은 만원 → 스튜디오 단위(원)로 환산
        if (ws && detectVersion(ws) !== 'unknown') {
          const parsed = parseRentRollWorkbook(ws);
          const blocking = parsed.issues.find((i) => i.level === 'blocking');
          if (blocking) {
            throw new Error(
              `${blocking.message} 엑셀 G9(면적 단위)를 확인해 다시 올려 주세요. (바텀시트 렌트롤 임포트에서는 사유를 남기고 해제할 수 있습니다)`,
            );
          }
          const fromTemplate: TenantRow[] = parsed.parsedRows.map((r) => ({
            floor: r.floor || '미상',
            area_sqm: r.area_sqm ?? 0, // ㎡ 정본 — 정수 반올림하지 않는다
            tenant_type: classifyTenantType(r.tenant_type ?? '', r.is_vacant === true),
            // 통합계약 비대표 행은 금액이 없다 → 0 이 아니라 null
            monthly_rent: r.rent_manwon != null ? r.rent_manwon * 10000 : null,
            deposit: r.deposit_manwon != null ? r.deposit_manwon * 10000 : null,
            contract_end: r.lease_end ?? null,
            is_anchor: false,
            tenant_name: r.tenant_name ?? null,
          }));
          if (fromTemplate.length === 0) {
            throw new Error('유효한 임대차 데이터를 찾을 수 없습니다.');
          }
          onImport(fromTemplate);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          throw new Error("빈 파일이거나 데이터를 찾을 수 없습니다.");
        }

        const newTenants: TenantRow[] = [];

        data.forEach((row: any) => {
          // 컬럼 자동 매핑 (유사 단어 매칭)
          const keys = Object.keys(row);
          
          const findKey = (keywords: string[]) => {
            return keys.find(k => keywords.some(kw => k.replace(/\s+/g, '').includes(kw)));
          };

          const floorKey = findKey(['층', 'floor', '호수', '위치']);
          const areaKey = findKey(['면적', '전용', 'area', '평']);
          const typeKey = findKey(['업종', '용도', '유형', 'type']);
          const rentKey = findKey(['월세', '차임', '월임대료', 'rent']);
          const depositKey = findKey(['보증금', '보증', 'deposit']);
          const nameKey = findKey(['임차인', '상호', '이름', 'name', '업체']);
          const endKey = findKey(['만기', '종료', '계약기간', 'end', '기간']);

          const floorVal = floorKey ? parseValue(row[floorKey]) : '';
          // 빈 행 스킵
          if (!floorVal && keys.length < 2) return;

          let area_sqm = areaKey ? parseNumber(row[areaKey]) || 0 : 0;
          // 평수 입력이 예상될 경우 (예: 숫자가 작다면) 변환 로직 등을 넣을 수 있지만 
          // 일단 단순 매핑합니다.
          const isPyeong = areaKey && areaKey.includes('평');
          if (isPyeong && area_sqm > 0) {
            area_sqm = Math.round(pyeongToSqm(area_sqm) * 100) / 100;
          }

          const typeVal = typeKey ? parseValue(row[typeKey]) : '';
          const tenant_type = classifyTenantType(typeVal);

          newTenants.push({
            floor: floorVal || '미상',
            area_sqm,
            tenant_type,
            monthly_rent: rentKey ? parseNumber(row[rentKey]) : null,
            deposit: depositKey ? parseNumber(row[depositKey]) : null,
            contract_end: endKey ? parseValue(row[endKey]) : null,
            is_anchor: false,
            tenant_name: nameKey ? parseValue(row[nameKey]) : null,
          });
        });

        if (newTenants.length > 0) {
          onImport(newTenants);
        } else {
          setError("유효한 임대차 데이터를 찾을 수 없습니다.");
        }
      } catch (err: any) {
        setError(err.message || "파일 파싱에 실패했습니다.");
      }
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsBinaryString(file);
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
        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
      >
        <span>📊 XLS/CSV 임포트</span>
      </button>
      {error && <span className="text-xs text-red-400 font-bold">{error}</span>}
    </div>
  );
}
