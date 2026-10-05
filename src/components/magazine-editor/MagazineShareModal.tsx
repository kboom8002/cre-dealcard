"use client";

import React, { useState } from "react";
import { Check, MessageSquare, ExternalLink, Mail, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { todayKst } from "@/lib/magazine/kst";
import { clipDescription, shareViaKakaoOrCopy, type KakaoLike } from "@/lib/magazine/kakao-share";
import { buildOgImageUrl, buildViewerUrl, resolvePublicBaseUrl } from "@/lib/magazine/share-urls";

export interface MagazineDistributionResult {
  sent?: number;
  emailSent?: number;
  kakaoSent?: number;
  kakaoSkipped?: number;
  isPaidTier?: boolean;
  tier?: string;
}

interface MagazineShareModalProps {
  showShareModal: boolean;
  setShowShareModal: (open: boolean) => void;
  /** 레거시 핸들러 — brokerSlug 가 없을 때만 사용(하위 호환) */
  handleMagazineKakaoShare: () => void;
  handleCopyLink: () => void;
  distributionResult?: MagazineDistributionResult | null;
  isPaidTier?: boolean;
  // ── 신규(선택): 주어지면 모달이 직접 카카오 공유/링크 복사를 수행한다 ──
  /** 본인 매거진 slug */
  brokerSlug?: string;
  /** 서버가 정한 절대 base URL (APP_BASE_URL). 없으면 NEXT_PUBLIC_* → 없으면 공유 불가 안내 */
  baseUrl?: string;
  /** 편집 중인 에디션 날짜(YYYY-MM-DD). 없으면 오늘(KST) — T3-36 */
  editionDate?: string;
  /** 카카오 카드 제목/설명 */
  shareTitle?: string;
  shareDescription?: string;
  /** 발송 킬스위치/dry-run 으로 구독자 발송이 중지된 경우 true → 안내 표시 */
  sendDisabled?: boolean;
}

type KakaoWindow = Window & { Kakao?: KakaoLike };

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function MagazineShareModal({
  showShareModal,
  setShowShareModal,
  handleMagazineKakaoShare,
  handleCopyLink,
  distributionResult,
  brokerSlug,
  baseUrl,
  editionDate,
  shareTitle,
  shareDescription,
  sendDisabled = false,
}: MagazineShareModalProps) {
  const emailSent = distributionResult?.emailSent ?? 0;
  const kakaoSent = distributionResult?.kakaoSent ?? 0;

  const [notice, setNotice] = useState<string | null>(null);

  const resolvedBase = resolvePublicBaseUrl(baseUrl);
  const date = editionDate ?? todayKst();
  const selfManaged = !!brokerSlug;
  const viewerUrl =
    selfManaged && resolvedBase ? buildViewerUrl({ baseUrl: resolvedBase, slug: brokerSlug!, date }) : null;
  const shareUnavailable = selfManaged && !viewerUrl;

  async function onKakao() {
    if (!selfManaged) {
      handleMagazineKakaoShare();
      return;
    }
    if (!viewerUrl || !resolvedBase) {
      toast.error("공유 주소를 만들 수 없어요. 관리자에게 문의해 주세요.");
      return;
    }
    const outcome = await shareViaKakaoOrCopy({
      kakao: typeof window !== "undefined" ? (window as KakaoWindow).Kakao ?? null : null,
      appKey: process.env.NEXT_PUBLIC_KAKAO_APP_KEY,
      input: {
        title: shareTitle || `${date} CRE 매거진`,
        description: clipDescription(shareDescription ?? ""),
        // 썸네일은 쿼리형 절대 URL (경로형은 404 — T3-10)
        imageUrl: buildOgImageUrl({ baseUrl: resolvedBase, slug: brokerSlug!, date }),
        link: viewerUrl,
      },
      copy: copyText,
    });
    if (outcome === "copied") {
      setNotice("링크를 복사했어요. 카카오톡 대화창에 붙여넣어 보내 주세요.");
      toast.success("링크를 복사했어요");
    } else if (outcome === "failed") {
      setNotice("카카오 공유와 링크 복사에 모두 실패했어요. 아래 주소를 직접 선택해 복사해 주세요.");
      toast.error("링크를 복사하지 못했어요");
    } else {
      setNotice(null);
    }
  }

  async function onCopy() {
    if (!selfManaged) {
      handleCopyLink();
      return;
    }
    if (!viewerUrl) {
      toast.error("공유 주소를 만들 수 없어요. 관리자에게 문의해 주세요.");
      return;
    }
    try {
      await copyText(viewerUrl);
      setNotice("링크를 복사했어요.");
      toast.success("링크를 복사했어요");
    } catch {
      setNotice("링크를 복사하지 못했어요. 아래 주소를 직접 선택해 복사해 주세요.");
      toast.error("링크를 복사하지 못했어요");
    }
  }

  return (
    <Modal
      open={showShareModal}
      onOpenChange={setShowShareModal}
      title="매거진 발행 완료!"
      description="개인화된 링크를 통해 고객에게 매거진을 전달해보세요."
      size="md"
    >
      <div className="space-y-5">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Check className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>

        {/* 발송 결과 — 실제 발송 건수만 표시, 업셀 문구 없음 */}
        <div className="space-y-3">
          {sendDisabled ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-label text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>발송은 현재 중지됨. 구독자에게는 발송되지 않았어요. 아래 링크를 직접 공유해 주세요.</span>
            </div>
          ) : emailSent > 0 || kakaoSent > 0 ? (
            <div className="space-y-1.5">
              {emailSent > 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-2.5 text-label font-semibold text-indigo-300">
                  <Mail className="h-4 w-4 shrink-0 text-indigo-400" aria-hidden="true" />
                  <span>이메일 구독자 {emailSent}명에게 발송 완료</span>
                </div>
              ) : null}
              {kakaoSent > 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-label font-semibold text-emerald-300">
                  <MessageSquare className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  <span>카카오 알림톡 {kakaoSent}건 발송 완료</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/60 p-2.5 text-label text-slate-300">
              <Mail className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              <span>구독자 발송 대상이 없거나 아직 발송되지 않았어요. 아래 카카오톡 공유 또는 링크 복사로 직접 전달할 수 있어요.</span>
            </div>
          )}
        </div>

        {shareUnavailable ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-label text-rose-200"
          >
            공유 주소(APP_BASE_URL) 설정이 없어 링크를 만들 수 없어요. 관리자에게 문의해 주세요.
          </div>
        ) : null}

        {/* 수동 공유 및 전달 액션 버튼 */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onKakao}
            disabled={shareUnavailable}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3 text-body font-bold text-[#3C1E1E] shadow-md shadow-amber-500/10 transition-all hover:bg-[#FEE500]/90 disabled:opacity-50"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            카카오톡으로 1:1 수동 공유
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={shareUnavailable}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-3 text-body font-bold text-white transition-all hover:bg-slate-700 disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            개인화 매거진 링크 복사하기
          </button>
        </div>

        {/* 결과 안내 (토스트가 사라져도 남는 인라인 안내) */}
        <div aria-live="polite" className="min-h-5">
          {notice ? <p className="text-label font-semibold text-emerald-300">{notice}</p> : null}
        </div>
        {viewerUrl ? (
          <p className="break-all rounded-lg bg-black/30 p-2 font-mono text-label text-ink-muted">{viewerUrl}</p>
        ) : null}
      </div>
    </Modal>
  );
}
