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
        const res = await fetch(`/api/broker/buildings/${encodeURIComponent(id)}/legal`);
        if (!res.ok) return;
        const json = await res.json();
        const legalData =
          json?.data?.layers?.legal ||
          json?.data?.korean_legal ||
          json?.korean_legal;
        if (legalData && typeof legalData === "object") {
          setFields((prev) => ({ ...prev, ...legalData }));
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
      const res = await fetch(`/api/broker/buildings/${encodeURIComponent(id)}/legal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("저장 실패");
      toast.success("한국법 필수 항목이 저장되었습니다.");
    } catch {
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
      <div className="bg-white border border-t-0 border-slate-200 rounded-b-2xl p-6 space-y-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">⚖️ 한국법 필수 항목</h2>
            <p className="text-sm text-slate-600 mt-1">
              D36 §3.4~§3.7 — IM 생성 시 ClaimRegistry에 자동 등록됩니다
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] px-5 py-2.5 text-sm font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-xl disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? "저장 중..." : "💾 저장"}
          </button>
        </div>

        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
              <span>{group.title}</span>
              <span className="text-sm text-slate-500 font-mono">{group.desc}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((item) => {
                // 조건부 표시
                if ('showIf' in item && item.showIf && !fields[item.showIf as keyof KoreanLegalFields]) {
                  return null;
                }

                const controlId = `studio-legal-${item.key}`;
                return (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
                  >
                    <label htmlFor={controlId} className="text-sm font-semibold text-slate-800">
                      {item.label}
                    </label>

                    {item.type === "bool" && (
                      <button
                        id={controlId}
                        type="button"
                        role="switch"
                        aria-checked={Boolean(fields[item.key])}
                        aria-label={item.label}
                        onClick={() => update(item.key, !fields[item.key])}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-end cursor-pointer"
                      >
                        <span
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            fields[item.key] ? "bg-red-600" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                              fields[item.key] ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </span>
                      </button>
                    )}

                    {item.type === "tri" && (
                      <select
                        id={controlId}
                        value={
                          fields[item.key] === true ? "yes" : fields[item.key] === false ? "no" : "unknown"
                        }
                        onChange={(e) =>
                          update(
                            item.key,
                            e.target.value === "yes" ? true : e.target.value === "no" ? false : null
                          )
                        }
                        className="min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900"
                      >
                        <option value="unknown">미확인</option>
                        <option value="yes">확인됨</option>
                        <option value="no">해당없음</option>
                      </select>
                    )}

                    {item.type === "select" && 'options' in item && (
                      <select
                        id={controlId}
                        value={(fields[item.key] as string) ?? ""}
                        onChange={(e) => {
                          if (item.key === "transaction_structure") {
                            update(item.key, e.target.value as TransactionStructure);
                          } else if (item.key === "mgmt_fee_structure") {
                            update(item.key, e.target.value as MgmtFeeStructure);
                          }
                        }}
                        className="min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900"
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
                        id={controlId}
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={(fields[item.key] as number) ?? 0}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          update(item.key, Number.isFinite(parsed) ? parsed : 0);
                        }}
                        className="w-28 min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900 text-right"
                      />
                    )}

                    {item.type === "text" && (
                      <input
                        id={controlId}
                        type="text"
                        value={(fields[item.key] as string) ?? ""}
                        onChange={(e) => update(item.key, e.target.value || null)}
                        placeholder="미입력"
                        className="w-full sm:w-48 min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900 placeholder:text-slate-400"
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
