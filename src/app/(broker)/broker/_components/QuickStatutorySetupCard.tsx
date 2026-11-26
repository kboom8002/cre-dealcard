"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrokerHomeStatutoryStatus } from "@/domain/broker/home-aggregated";
import { validateBrokerStatutoryFields } from "@/lib/legal/broker-statutory-disclosure";
import { formatKrPhoneInput } from "@/lib/format/phone";

interface QuickStatutorySetupCardProps {
  statutory: BrokerHomeStatutoryStatus;
  onCompleted: () => void;
  onDismiss: () => void;
}

export function QuickStatutorySetupCard({
  statutory,
  onCompleted,
  onDismiss,
}: QuickStatutorySetupCardProps) {
  const router = useRouter();
  const init = statutory.initialValues;

  const [displayName, setDisplayName] = useState(init.displayName || "");
  const [company, setCompany] = useState(init.company || "");
  const [isSelfRepresentative, setIsSelfRepresentative] = useState<boolean>(() => {
    const cleanRep = (init.representativeName || "").trim();
    const cleanDisp = (init.displayName || "").trim();
    return !cleanRep || cleanRep === cleanDisp;
  });
  const [representativeName, setRepresentativeName] = useState(
    init.representativeName || init.displayName || "",
  );
  const [officeRegNumber, setOfficeRegNumber] = useState(init.officeRegNumber || "");
  const [officeAddress, setOfficeAddress] = useState(init.officeAddress || "");
  const [phone, setPhone] = useState(init.phone || "");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectiveRepresentative = isSelfRepresentative
    ? displayName.trim() || representativeName.trim()
    : representativeName.trim();

  const liveCheck = useMemo(
    () =>
      validateBrokerStatutoryFields({
        company,
        office_address: officeAddress,
        phone,
        office_reg_number: officeRegNumber,
        representative_name: effectiveRepresentative,
        display_name: displayName,
      }),
    [company, officeAddress, phone, officeRegNumber, effectiveRepresentative, displayName],
  );

  const handleSelfRepChange = (checked: boolean) => {
    setIsSelfRepresentative(checked);
    setErrorMessage(null);
    if (checked) {
      if (displayName.trim()) {
        setRepresentativeName(displayName.trim());
      }
    } else if (representativeName.trim() === displayName.trim()) {
      setRepresentativeName("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isSelfRepresentative && !displayName.trim()) {
      setErrorMessage("담당자 성함을 입력해 주세요.");
      return;
    }

    let formattedPhone = phone;
    if (phone) {
      const digits = phone.replace(/[^\d]/g, "");
      if (digits.length === 11 && digits.startsWith("010")) {
        formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
      }
    }

    const validation = validateBrokerStatutoryFields({
      company,
      office_address: officeAddress,
      phone: formattedPhone,
      office_reg_number: officeRegNumber,
      representative_name: effectiveRepresentative,
      display_name: displayName,
    });

    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    if (!validation.completeness.isComplete) {
      setErrorMessage(
        `아직 입력되지 않은 필수 항목이 있습니다: ${validation.completeness.missingLabels.join(", ")}`,
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/broker/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          display_name: displayName.trim() || undefined,
          company: company.trim(),
          representative_name: effectiveRepresentative,
          office_reg_number: officeRegNumber.trim(),
          office_address: officeAddress.trim(),
          phone: formattedPhone.trim(),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        const msg =
          typeof body.error === "string"
            ? body.error
            : "중개사무소 법정 정보 저장에 실패했습니다. 입력 내용을 확인해 주세요.";
        setErrorMessage(msg);
        return;
      }

      onCompleted();
      router.refresh();
    } catch {
      setErrorMessage("네트워크 오류로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const filledCount = liveCheck.completeness.filledCount;
  const isReady = liveCheck.ok && liveCheck.completeness.isComplete;

  return (
    <section
      data-testid="home-quick-statutory-setup-card"
      className="rounded-3xl border-2 border-amber-400/70 bg-white/95 backdrop-blur-xl p-5 sm:p-6 shadow-[0_12px_32px_-8px_rgba(217,119,6,0.16)] space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-extrabold text-[#1D1D1F] tracking-tight">
            🏛️ 첫 시작 60초 설정 · 법정 중개사무소 5항목
          </h2>
          <p className="text-sm sm:text-base text-[#3A3A3C] leading-snug">
            딜카드·IM·뉴스레터 발행에 법적으로 꼭 필요한 5가지만 먼저 입력해 두세요.
          </p>
        </div>
        <span
          data-testid="quick-setup-progress-pill"
          className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-extrabold border whitespace-nowrap ${
            isReady
              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
              : "bg-amber-50 text-amber-900 border-amber-300"
          }`}
        >
          {filledCount} / 5 완료
        </span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          data-testid="quick-setup-error-alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          ⚠️ {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 담당자 성함 */}
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="quick-setup-display-name" className="block text-sm font-bold text-[#1D1D1F]">
              담당자 성함 <span className="text-rose-600">*</span>
            </label>
            <input
              id="quick-setup-display-name"
              data-testid="quick-setup-display-name"
              type="text"
              value={displayName}
              onChange={(e) => {
                const nextName = e.target.value;
                setDisplayName(nextName);
                if (isSelfRepresentative) {
                  setRepresentativeName(nextName);
                }
                setErrorMessage(null);
              }}
              placeholder="예: 박성훈"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2.5 text-[16px] text-[#1D1D1F] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
            />
          </div>

          {/* 1. 중개사무소 명칭 */}
          <div className="space-y-1.5">
            <label htmlFor="quick-setup-company" className="block text-sm font-bold text-[#1D1D1F]">
              1. 중개사무소 명칭 <span className="text-rose-600">*</span>
            </label>
            <input
              id="quick-setup-company"
              type="text"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="예: 한강부동산중개법인"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2.5 text-[16px] text-[#1D1D1F] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
            />
          </div>

          {/* 3. 중개사무소 개설등록번호 */}
          <div className="space-y-1.5">
            <label htmlFor="quick-setup-reg" className="block text-sm font-bold text-[#1D1D1F]">
              2. 중개사무소 개설등록번호 <span className="text-rose-600">*</span>
            </label>
            <input
              id="quick-setup-reg"
              type="text"
              value={officeRegNumber}
              onChange={(e) => {
                setOfficeRegNumber(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="예: 11560-2024-00088"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2.5 text-[16px] text-[#1D1D1F] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
            />
          </div>

          {/* 2. 개업공인중개사(대표자) 성명 */}
          <div className="space-y-2 md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="quick-setup-rep" className="block text-sm font-bold text-[#1D1D1F]">
                3. 개업공인중개사(대표자) 성명 <span className="text-rose-600">*</span>
              </label>
              <label
                htmlFor="quick-setup-self-rep-toggle"
                className="inline-flex min-h-[44px] items-center gap-2 cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-white/80"
              >
                <input
                  id="quick-setup-self-rep-toggle"
                  data-testid="quick-setup-self-rep-toggle"
                  type="checkbox"
                  checked={isSelfRepresentative}
                  onChange={(e) => handleSelfRepChange(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-400 accent-[#007AFF]"
                />
                <span className="text-sm font-semibold text-[#1D1D1F]">
                  본인({displayName.trim() || "담당자"})이 개업공인중개사(대표자)입니다
                </span>
              </label>
            </div>

            {isSelfRepresentative && displayName.trim() ? (
              <div
                data-testid="quick-setup-self-rep-preview"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-2.5 text-sm text-[#1D1D1F]"
              >
                <span className="font-bold">대표자: {displayName.trim()}</span>
                <span className="text-slate-600">
                  소속공인중개사이시면 위 체크를 해제해 대표자 성명을 따로 입력하세요.
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  id="quick-setup-rep"
                  type="text"
                  value={representativeName}
                  onChange={(e) => {
                    setRepresentativeName(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="예: 김대표"
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] text-[#1D1D1F] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                />
                <p className="text-sm text-slate-600">
                  소속공인중개사이신 경우 사무소 대표자 성명을 입력해 주세요.
                </p>
              </div>
            )}
          </div>

          {/* 4. 중개사무소 소재지 */}
          <div className="space-y-1.5">
            <label htmlFor="quick-setup-address" className="block text-sm font-bold text-[#1D1D1F]">
              4. 중개사무소 소재지 (도로명 주소) <span className="text-rose-600">*</span>
            </label>
            <input
              id="quick-setup-address"
              type="text"
              value={officeAddress}
              onChange={(e) => {
                setOfficeAddress(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="예: 서울특별시 영등포구 양평로 00길 00, 1층"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2.5 text-[16px] text-[#1D1D1F] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
            />
          </div>

          {/* 5. 직통·사무소 연락처 */}
          <div className="space-y-1.5">
            <label htmlFor="quick-setup-phone" className="block text-sm font-bold text-[#1D1D1F]">
              5. 직통·사무소 연락처 <span className="text-rose-600">*</span>
            </label>
            <input
              id="quick-setup-phone"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(formatKrPhoneInput(e.target.value));
                setErrorMessage(null);
              }}
              placeholder="예: 010-1234-5678"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2.5 text-[16px] text-[#1D1D1F] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            data-testid="quick-setup-dismiss-btn"
            onClick={onDismiss}
            disabled={saving}
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-bold text-[#3A3A3C] transition-colors cursor-pointer disabled:opacity-50"
          >
            먼저 둘러보기
          </button>
          <button
            type="submit"
            data-testid="quick-setup-submit-btn"
            disabled={saving}
            className="inline-flex flex-1 sm:flex-none min-h-[48px] items-center justify-center rounded-xl bg-blue-700 hover:bg-blue-800 px-6 py-2.5 text-base font-extrabold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-60"
          >
            {saving ? "저장 중..." : "✓ 저장하고 4대 업무 바로 시작하기"}
          </button>
        </div>
      </form>
    </section>
  );
}
