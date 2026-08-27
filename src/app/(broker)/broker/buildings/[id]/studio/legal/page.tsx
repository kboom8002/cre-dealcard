"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { StudioTabs } from "@/components/studio/StudioTabs";
import { toast } from "sonner";
import type {
  KoreanLegalFields,
  TransactionStructure,
  MgmtFeeStructure,
} from "@/domain/building/im-core";

/**
 * D37 H-5: 한국법 12종 필드 입력 서브페이지
 *
 * D36 §3.4~§3.7 한국법 필수 항목을 중개인이 직접 입력합니다.
 * 저장 시 B-SSoT에 반영되어 IM 생성 시 ClaimRegistry에 등록됩니다.
 */
export default function StudioLegalPage() {
  const { id } = useParams<{ id: string }>();
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Partial<KoreanLegalFields>>({
    violation_registered: false,
    violation_detail: null,
    transaction_structure: "미정",
    mgmt_fee_structure: "실비정산",
    redevelopment_zone: false,
    fund_source_report_required: false,
    brokerage_fee_rate: 0.9,
    pretrial_reconciliation: null,
    fire_safety_certificate: null,
    septic_tank_capacity: null,
  });

  // 기존 데이터 로드
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/v1/buildings/${id}/ssot`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.korean_legal) {
          setFields((prev) => ({ ...prev, ...data.korean_legal }));
        }
      } catch {
        /* 초기 로드 실패는 무시 */
      }
    })();
  }, [id]);

  const update = useCallback(
    <K extends keyof KoreanLegalFields>(key: K, value: KoreanLegalFields[K]) => {
      setFields((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/buildings/${id}/ssot`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ korean_legal: fields }),
      });
      if (!res.ok) throw new Error("저장 실패");
      toast.success("한국법 필수 항목이 저장되었습니다.");
    } catch (err) {
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const FIELD_GROUPS = [
    {
      title: "v1 — 기본 법정 항목",
      desc: "D36 §3.4~§3.6",
      items: [
        { key: "violation_registered" as const, label: "위반건축물 등재", type: "bool" as const },
        { key: "violation_detail" as const, label: "위반 내용 상세", type: "text" as const, showIf: "violation_registered" as const },
        { key: "transaction_structure" as const, label: "거래구조", type: "select" as const, options: ["일반과세", "포괄양수도", "미정"] },
        { key: "mgmt_fee_structure" as const, label: "관리비 구조", type: "select" as const, options: ["실비정산", "정액", "혼합"] },
        { key: "redevelopment_zone" as const, label: "정비구역 지정", type: "bool" as const },
        { key: "fund_source_report_required" as const, label: "자금조달계획서 제출 대상", type: "bool" as const },
        { key: "brokerage_fee_rate" as const, label: "중개보수 요율 (%)", type: "number" as const },
      ],
    },
    {
      title: "v2 — 실사 확인 항목",
      desc: "D36 §3.7",
      items: [
        { key: "pretrial_reconciliation" as const, label: "제소전화해 조서 확인", type: "tri" as const },
        { key: "fire_safety_certificate" as const, label: "소방 완비증명", type: "text" as const },
        { key: "septic_tank_capacity" as const, label: "정화조 용량 (근생 업종 범위)", type: "text" as const },
      ],
    },
  ] as const;

  return (
    <div>
      <StudioTabs buildingId={id} activeTab="legal" />
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-b-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">⚖️ 한국법 필수 항목</h2>
            <p className="text-xs text-neutral-400 mt-1">
              D36 §3.4~§3.7 — IM 생성 시 ClaimRegistry에 자동 등록됩니다
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? "저장 중..." : "💾 저장"}
          </button>
        </div>

        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200 border-b border-neutral-800 pb-2">
              <span>{group.title}</span>
              <span className="text-[10px] text-neutral-500 font-mono">{group.desc}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((item) => {
                // 조건부 표시
                if ('showIf' in item && item.showIf && !fields[item.showIf as keyof KoreanLegalFields]) {
                  return null;
                }

                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between bg-neutral-800/40 border border-neutral-700/50 rounded-lg px-4 py-3"
                  >
                    <label className="text-xs font-medium text-neutral-300">
                      {item.label}
                    </label>

                    {item.type === "bool" && (
                      <button
                        type="button"
                        onClick={() => update(item.key, !fields[item.key] as any)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          fields[item.key] ? "bg-red-500" : "bg-neutral-600"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            fields[item.key] ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    )}

                    {item.type === "tri" && (
                      <select
                        value={
                          fields[item.key] === true ? "yes" : fields[item.key] === false ? "no" : "unknown"
                        }
                        onChange={(e) =>
                          update(
                            item.key,
                            e.target.value === "yes" ? true : e.target.value === "no" ? false : (null as any)
                          )
                        }
                        className="bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200"
                      >
                        <option value="unknown">미확인</option>
                        <option value="yes">확인됨</option>
                        <option value="no">해당없음</option>
                      </select>
                    )}

                    {item.type === "select" && 'options' in item && (
                      <select
                        value={(fields[item.key] as string) ?? ""}
                        onChange={(e) => update(item.key, e.target.value as any)}
                        className="bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200"
                      >
                        {item.options!.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {item.type === "number" && (
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={(fields[item.key] as number) ?? 0}
                        onChange={(e) => update(item.key, parseFloat(e.target.value) as any)}
                        className="w-20 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200 text-right"
                      />
                    )}

                    {item.type === "text" && (
                      <input
                        type="text"
                        value={(fields[item.key] as string) ?? ""}
                        onChange={(e) => update(item.key, (e.target.value || null) as any)}
                        placeholder="미입력"
                        className="w-40 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
