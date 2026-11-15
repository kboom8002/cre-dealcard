'use client';

import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import {
  MAX_BULK_IMPORT_ROWS,
  buildSampleCsvContent,
  parseCsvContactsText,
  parseExcelContactsBuffer,
  parsePastedContactsText,
  type BulkClientRole,
  type BulkParseResult,
} from '@/lib/crm/contact-bulk-parser';

export interface BulkImportApiResult {
  ok: boolean;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  subscriberAddedCount: number;
  skippedUnsubscribedCount?: number;
}

export interface ContactBulkImportModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  defaultNewsletterSync?: boolean;
  onImported?: (result: BulkImportApiResult) => void;
}

type WizardStep = 1 | 2 | 3;
type Step1InputTab = 'file' | 'paste';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

const ROLE_BADGE_LABEL: Readonly<Record<BulkClientRole, string>> = {
  buyer: '매수',
  seller: '매도',
  tenant: '임차',
  partner: '공동중개',
};

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽을 수 없습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

function decodeCsvBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch {
      return new TextDecoder().decode(buffer);
    }
  }
}

export function ContactBulkImportModal({
  open,
  onOpenChange,
  onClose,
  defaultNewsletterSync = false,
  onImported,
}: ContactBulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<WizardStep>(1);
  const [inputTab, setInputTab] = useState<Step1InputTab>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [parseResult, setParseResult] = useState<BulkParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [complianceConfirmed, setComplianceConfirmed] = useState(false);
  const [registerAsNewsletterSubscriber, setRegisterAsNewsletterSubscriber] = useState<boolean>(
    Boolean(defaultNewsletterSync),
  );
  const [submitting, setSubmitting] = useState(false);

  function resetWizard() {
    setStep(1);
    setInputTab('file');
    setIsDragging(false);
    setSelectedFileName('');
    setPasteText('');
    setParseResult(null);
    setErrorMessage('');
    setComplianceConfirmed(false);
    setRegisterAsNewsletterSubscriber(Boolean(defaultNewsletterSync));
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    resetWizard();
    onOpenChange?.(false);
    onClose?.();
  }

  function handleDownloadSampleCsv() {
    const csvContent = buildSampleCsvContent();
    if (typeof window === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '고객명단_일괄등록_샘플양식.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function processUploadedFile(file: File) {
    setErrorMessage('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMessage('파일 크기는 10MB 이하만 올릴 수 있습니다.');
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv';
    const isExcel =
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls') ||
      file.type.includes('spreadsheet') ||
      file.type.includes('excel');

    if (!isCsv && !isExcel) {
      setErrorMessage('엑셀(.xlsx, .xls) 또는 CSV(.csv) 파일만 올릴 수 있습니다.');
      return;
    }

    try {
      const buffer = await readFileAsArrayBuffer(file);
      const parsed = isCsv
        ? parseCsvContactsText(decodeCsvBuffer(buffer))
        : parseExcelContactsBuffer(buffer);

      if (parsed.validRows.length === 0 && parsed.invalidRows.length === 0) {
        setErrorMessage('파일에서 읽을 수 있는 고객 명단이 없습니다. 내용을 확인해 주세요.');
        return;
      }

      setSelectedFileName(file.name);
      setParseResult(parsed);
      setStep(2);
    } catch {
      setErrorMessage('파일을 읽는 중 문제가 발생했습니다. 파일 형식을 다시 확인해 주세요.');
    }
  }

  function handlePasteParseNext() {
    setErrorMessage('');
    if (!pasteText.trim()) {
      setErrorMessage('엑셀이나 카카오톡에서 복사한 고객 명단을 먼저 붙여넣어 주세요.');
      return;
    }

    const parsed = parsePastedContactsText(pasteText);
    if (parsed.validRows.length === 0 && parsed.invalidRows.length === 0) {
      setErrorMessage('인식된 고객 정보가 없습니다. 이름과 연락처를 함께 붙여넣어 주세요.');
      return;
    }

    setSelectedFileName('');
    setParseResult(parsed);
    setStep(2);
  }

  async function handleFinalSubmit() {
    if (submitting || !parseResult || parseResult.validRows.length === 0) return;
    if (!complianceConfirmed) {
      setErrorMessage('안내 사항 확인란에 먼저 체크해 주세요.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        contacts: parseResult.validRows.map((row) => ({
          name: row.name,
          phone: row.phone,
          email: row.email,
          company: row.company,
          clientRole: row.clientRole,
          isVip: row.isVip,
          preferredRegions: row.preferredRegions,
          budgetText: row.budgetText,
          marketingConsent: row.marketingConsent === true,
          memo: row.memo,
        })),
        registerAsNewsletterSubscriber,
      };

      const res = await fetch('/api/broker/inbox/import-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let json: Record<string, unknown> = {};
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        json = {};
      }

      if (!res.ok || json.ok !== true) {
        const errObj =
          json.error && typeof json.error === 'object'
            ? (json.error as Record<string, unknown>)
            : null;
        const msg =
          (typeof errObj?.message === 'string' && errObj.message) ||
          (typeof json.error === 'string' && json.error) ||
          '일괄 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
        setErrorMessage(msg);
        return;
      }

      const result: BulkImportApiResult = {
        ok: true,
        importedCount: Number(json.importedCount ?? 0),
        updatedCount: Number(json.updatedCount ?? 0),
        skippedCount: Number(json.skippedCount ?? 0),
        subscriberAddedCount: Number(json.subscriberAddedCount ?? 0),
        skippedUnsubscribedCount:
          typeof json.skippedUnsubscribedCount === 'number'
            ? json.skippedUnsubscribedCount
            : undefined,
      };

      const subNote =
        result.subscriberAddedCount > 0
          ? ` · 뉴스레터 구독자 ${result.subscriberAddedCount}명 추가`
          : '';
      toast.success(
        `고객 명단 저장 완료 (신규 ${result.importedCount}명 · 기존 업데이트 ${result.updatedCount}명${subNote})`,
      );

      onImported?.(result);
      resetWizard();
      onOpenChange?.(false);
      onClose?.();
    } catch {
      setErrorMessage('네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  const validRows = parseResult?.validRows ?? [];
  const invalidRows = parseResult?.invalidRows ?? [];
  const mergedCount = parseResult?.mergedDuplicatesCount ?? 0;
  const restoredZeroCount = parseResult?.restoredLeadingZeroCount ?? 0;
  const consentYesCount = validRows.filter((r) => r.marketingConsent === true).length;
  const previewRows = validRows.slice(0, 20);

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
      title="고객·구독자 명단 한 번에 등록"
      description="엑셀·CSV 파일이나 카카오톡·연락처 명단을 자동으로 정리해 저장합니다."
      size="lg"
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
    >
      <div className="space-y-5 text-[16px] leading-relaxed text-slate-100" data-testid="contact-bulk-import-modal">
        {/* 3단계 진행 표시줄 */}
        <ol
          aria-label="일괄 등록 단계"
          className="grid grid-cols-3 gap-2 rounded-xl border border-slate-700/80 bg-slate-950/70 p-2 text-base font-bold"
        >
          {[
            { num: 1 as const, label: '1. 파일 올리기·붙여넣기' },
            { num: 2 as const, label: '2. 자동 정리 결과 확인' },
            { num: 3 as const, label: '3. 수신동의 확인·저장' },
          ].map((item) => {
            const active = step === item.num;
            const done = step > item.num;
            return (
              <li
                key={item.num}
                data-testid={`bulk-wizard-step-indicator-${item.num}`}
                className={`flex min-h-[44px] items-center justify-center rounded-lg px-2 text-center text-[16px] transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : done
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-600/40'
                      : 'text-slate-400'
                }`}
              >
                {item.label}
              </li>
            );
          })}
        </ol>

        {/* ── STEP 1: 파일 올리기 또는 붙여넣기 ── */}
        {step === 1 && (
          <div className="space-y-4" data-testid="bulk-step-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                data-testid="bulk-input-mode-file"
                onClick={() => {
                  setInputTab('file');
                  setErrorMessage('');
                }}
                className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-4 text-[16px] font-bold transition-colors ${
                  inputTab === 'file'
                    ? 'border-indigo-400 bg-indigo-600 text-white'
                    : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0" aria-hidden="true" />
                파일 올리기 (.xlsx · .csv)
              </button>
              <button
                type="button"
                data-testid="bulk-input-mode-paste"
                onClick={() => {
                  setInputTab('paste');
                  setErrorMessage('');
                }}
                className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-4 text-[16px] font-bold transition-colors ${
                  inputTab === 'paste'
                    ? 'border-indigo-400 bg-indigo-600 text-white'
                    : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <ClipboardPaste className="h-5 w-5 shrink-0" aria-hidden="true" />
                엑셀·카톡 명단 그대로 붙여넣기
              </button>
            </div>

            {inputTab === 'file' ? (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      void processUploadedFile(file);
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                    isDragging
                      ? 'border-indigo-400 bg-indigo-950/40'
                      : 'border-slate-600 bg-slate-950/50'
                  }`}
                >
                  <Upload className="h-9 w-9 text-indigo-300" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-[16px] font-bold text-white">
                      엑셀(.xlsx, .xls) 또는 CSV 파일을 이곳에 끌어다 놓거나 선택해 주세요
                    </p>
                    <p className="text-[16px] text-slate-300">
                      이름·연락처·이메일·구분·수신동의 열 이름을 자동으로 찾아 정리합니다 (최대{' '}
                      {MAX_BULK_IMPORT_ROWS.toLocaleString()}명)
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    data-testid="bulk-contact-file-input"
                    accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void processUploadedFile(file);
                      }
                      e.target.value = '';
                    }}
                  />

                  <button
                    type="button"
                    data-testid="pick-bulk-file-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-[16px] font-bold text-white shadow-md transition-colors hover:bg-indigo-500"
                  >
                    <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                    내 컴퓨터에서 파일 선택하기
                  </button>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[16px] text-slate-200">
                    처음이신가요? 기본 열 이름이 적힌 샘플 양식을 내려받아 바로 채우실 수 있습니다.
                  </div>
                  <button
                    type="button"
                    data-testid="download-sample-csv-btn"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 text-[16px] font-bold text-white transition-colors hover:bg-slate-700"
                  >
                    <Download className="h-5 w-5" aria-hidden="true" />
                    📥 엑셀 샘플 양식 다운로드
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="bulk-contact-paste-textarea"
                    className="block text-[16px] font-bold text-white"
                  >
                    엑셀·카톡 명단 그대로 붙여넣기 (한 줄에 1명씩)
                  </label>
                  <textarea
                    id="bulk-contact-paste-textarea"
                    data-testid="bulk-contact-paste-textarea"
                    value={pasteText}
                    onChange={(e) => {
                      setPasteText(e.target.value);
                      setErrorMessage('');
                    }}
                    placeholder={
                      '예시:\n홍길동 010-1234-5678 hong@example.com 매수 VIP\n김대표\t010-2222-3333\tkim@example.com\t매도\t수신동의'
                    }
                    className="min-h-[160px] w-full rounded-xl border border-slate-600 bg-slate-950/80 p-4 text-[16px] leading-relaxed text-white placeholder:text-slate-400 outline-none focus:border-indigo-400"
                  />
                  <p className="text-[16px] text-slate-300">
                    엑셀 표에서 드래그해 복사하거나, 카카오톡·메모장에 적어둔 이름·전화번호·이메일을 그대로 붙여넣으세요.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="bulk-parse-paste-next-btn"
                    onClick={handlePasteParseNext}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-[16px] font-bold text-white shadow-md transition-colors hover:bg-indigo-500 sm:w-auto"
                  >
                    자동 정리 결과 확인하기
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: 자동 정리 결과 확인 ── */}
        {step === 2 && parseResult && (
          <div className="space-y-4" data-testid="bulk-step-2">
            {selectedFileName ? (
              <p className="text-[16px] font-semibold text-slate-300">
                불러온 파일: <span className="font-bold text-white">{selectedFileName}</span>
              </p>
            ) : null}

            {/* 요약 배지 3종 */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div
                data-testid="summary-valid-badge"
                className="flex min-h-[52px] items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-2.5 text-[16px] font-bold text-emerald-200"
              >
                등록 가능 {validRows.length}명
              </div>
              <div
                data-testid="summary-merged-badge"
                className="flex min-h-[52px] items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-950/50 px-4 py-2.5 text-[16px] font-bold text-indigo-200"
              >
                중복 자동 합침 {mergedCount}건
              </div>
              <div
                data-testid="summary-invalid-badge"
                className="flex min-h-[52px] items-center justify-center rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-2.5 text-[16px] font-bold text-amber-200"
              >
                확인 필요(연락처 누락) {invalidRows.length}건
              </div>
            </div>

            {/* 엑셀 앞자리 0 자동 복원 안내 */}
            <div
              data-testid="leading-zero-restored-notice"
              className="rounded-xl border border-sky-500/40 bg-sky-950/40 px-4 py-3 text-[16px] text-sky-100"
            >
              {restoredZeroCount > 0 ? (
                <span>
                  💡 엑셀에서 맨 앞 숫자 <strong>0</strong>이 빠진 전화번호{' '}
                  <strong>{restoredZeroCount}건</strong>을 <strong>010-XXXX-XXXX</strong> 형식으로 자동 복원했습니다.
                </span>
              ) : (
                <span>
                  💡 엑셀에서 맨 앞 숫자 <strong>0</strong>이 빠진 번호(예: 1012345678)도 자동으로 복원해 점검했습니다.
                </span>
              )}
            </div>

            {parseResult.truncatedRowsCount > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-[16px] text-amber-100">
                한 번에 최대 {MAX_BULK_IMPORT_ROWS.toLocaleString()}명까지 등록할 수 있어 앞쪽{' '}
                {MAX_BULK_IMPORT_ROWS.toLocaleString()}명만 우선 불러왔습니다.
              </div>
            )}

            {/* 미리보기 표 (상위 20행 + 스크롤) */}
            {previewRows.length > 0 ? (
              <div className="space-y-2">
                <div className="max-h-[280px] overflow-auto rounded-xl border border-slate-700 bg-slate-950/80">
                  <table className="w-full border-collapse text-left text-[16px]">
                    <thead className="sticky top-0 bg-slate-800 text-white">
                      <tr>
                        <th className="px-3 py-2.5 font-bold">이름</th>
                        <th className="px-3 py-2.5 font-bold">연락처</th>
                        <th className="px-3 py-2.5 font-bold">이메일</th>
                        <th className="px-3 py-2.5 font-bold">구분(매수/매도/VIP)</th>
                        <th className="px-3 py-2.5 font-bold">수신동의</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {previewRows.map((row, idx) => (
                        <tr key={`${row.rowNumber}-${idx}`} className="hover:bg-slate-900/70">
                          <td className="px-3 py-2.5 font-bold text-white">
                            {row.name}
                            {row.company ? (
                              <span className="ml-1.5 text-sm font-normal text-slate-300">
                                ({row.company})
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-slate-200">{row.phone || '-'}</td>
                          <td className="px-3 py-2.5 text-slate-200">{row.email || '-'}</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-sm font-bold text-slate-200">
                                {ROLE_BADGE_LABEL[row.clientRole]}
                              </span>
                              {row.isVip ? (
                                <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-sm font-bold text-amber-300">
                                  VIP
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {row.marketingConsent ? (
                              <span className="font-bold text-emerald-300">수신동의(Y)</span>
                            ) : (
                              <span className="text-slate-400">미표시(상담용)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validRows.length > 20 && (
                  <p className="text-[16px] text-slate-300">
                    상위 20명 미리보기 중입니다 (전체 등록 대상 총 {validRows.length}명).
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-[16px] font-bold text-rose-200">
                유효한 전화번호 또는 이메일이 있는 고객이 없습니다. 이전 단계에서 명단을 다시 확인해 주세요.
              </div>
            )}

            {/* 제외된 확인 필요 행 안내 */}
            {invalidRows.length > 0 && (
              <div
                data-testid="invalid-rows-panel"
                className="max-h-[140px] overflow-y-auto rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-[16px]"
              >
                <p className="font-bold text-amber-200">
                  연락처 확인이 필요해 제외된 행 ({invalidRows.length}건):
                </p>
                {invalidRows.slice(0, 10).map((inv) => (
                  <p key={inv.rowNumber} className="text-slate-200">
                    • {inv.rowNumber}행 {inv.rawName ? `(${inv.rawName})` : ''}: {inv.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                data-testid="step2-back-btn"
                onClick={() => {
                  setErrorMessage('');
                  setStep(1);
                }}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-600 bg-slate-800 px-5 text-[16px] font-bold text-slate-100 transition-colors hover:bg-slate-700"
              >
                이전 단계로
              </button>
              <button
                type="button"
                data-testid="step2-next-btn"
                disabled={validRows.length === 0}
                onClick={() => {
                  setErrorMessage('');
                  setStep(3);
                }}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-[16px] font-bold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                다음: 수신동의 확인 및 저장
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: 수신동의 확인 및 일괄 저장 ── */}
        {step === 3 && parseResult && (
          <div className="space-y-4" data-testid="bulk-step-3">
            <div className="rounded-2xl border border-indigo-500/40 bg-slate-950/80 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-indigo-300" aria-hidden="true" />
                <p className="text-[16px] font-bold text-white leading-relaxed">
                  명단에 &apos;수신동의(Y)&apos;가 표시된 고객만 뉴스레터·안내 발송 대상으로 등록되며, 미표시 고객은 내 고객 수첩(상담용)으로만 안전하게 저장됩니다.
                </p>
              </div>

              <div className="rounded-xl bg-slate-900/90 px-4 py-3 text-[16px] text-slate-200">
                전체 저장 대상 <strong>{validRows.length}명</strong> 중 수신동의(Y) 표시 고객{' '}
                <strong className="text-emerald-300">{consentYesCount}명</strong> · 상담 전용 수첩 저장{' '}
                <strong>{validRows.length - consentYesCount}명</strong>
              </div>

              <label className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3.5">
                <input
                  type="checkbox"
                  data-testid="compliance-confirm-checkbox"
                  checked={complianceConfirmed}
                  onChange={(e) => {
                    setComplianceConfirmed(e.target.checked);
                    setErrorMessage('');
                  }}
                  className="mt-1 h-5 w-5 shrink-0 rounded accent-indigo-500"
                />
                <span className="text-[16px] font-bold text-white">
                  위 정보통신망법 안내를 확인했으며, 적법하게 확보한 고객 명단만 저장합니다. (필수)
                </span>
              </label>

              <label className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3.5">
                <input
                  type="checkbox"
                  data-testid="newsletter-sync-checkbox"
                  checked={registerAsNewsletterSubscriber}
                  onChange={(e) => setRegisterAsNewsletterSubscriber(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 rounded accent-indigo-500"
                />
                <span className="text-[16px] font-bold text-slate-100">
                  수신동의(Y) 고객을 주간 뉴스레터 구독자 명단에도 함께 추가
                </span>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                data-testid="step3-back-btn"
                disabled={submitting}
                onClick={() => {
                  setErrorMessage('');
                  setStep(2);
                }}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-600 bg-slate-800 px-5 text-[16px] font-bold text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                이전 단계로
              </button>
              <button
                type="button"
                data-testid="bulk-import-submit-btn"
                disabled={submitting || !complianceConfirmed || validRows.length === 0}
                onClick={() => void handleFinalSubmit()}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-[16px] font-bold text-white shadow-md transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                )}
                {submitting ? '일괄 저장 중...' : `총 ${validRows.length}명 일괄 저장하기`}
              </button>
            </div>
          </div>
        )}

        {errorMessage ? (
          <p
            role="alert"
            data-testid="bulk-import-error"
            className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-[16px] font-bold text-rose-200"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
