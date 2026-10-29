"use client";

import React, { useState } from "react";
import { Check, MessageSquare, ExternalLink, Mail, AlertTriangle, Copy, Send } from "lucide-react";
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

  const subscribeUrl = selfManaged && resolvedBase ? `${resolvedBase}/magazine/${brokerSlug}` : "";

  // 1-Click Kakao group-chat copy package (인사말 + 소식지 링크 + 무료 구독 링크)
  const groupChatCopyPackage = `[CRE DealCard 주간 부동산 소식지]
${shareTitle || "이번 주 핵심 상업용 부동산 브리핑"}

${shareDescription ? `${shareDescription}\n\n` : ""}📌 소식지 전문 보기:
${viewerUrl || ""}

✨ VIP 무료 구독 신청 (매주 발행 알림):
${subscribeUrl}`.trim();

  const smsHref = `sms:?body=${encodeURIComponent(groupChatCopyPackage)}`;

  async function onCopyGroupChatPackage() {
    if (!viewerUrl) {
      toast.error("공유 주소를 만들 수 없어요. 관리자에게 문의해 주세요.");
      return;
    }
    try {
      await copyText(groupChatCopyPackage);
      setNotice("단톡방·VIP 전송용 문구 패키지(인사말+링크+구독)를 복사했어요! 카톡 대화창에 바로 붙여넣으세요.");
      toast.success("단톡방 문구 패키지를 복사했어요");
    } catch {
      setNotice("복사하지 못했어요. 아래 주소를 직접 선택해 복사해 주세요.");
      toast.error("복사하지 못했어요");
    }
  }

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
      setNotice("소식지 링크를 복사했어요.");
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
      description="이메일 구독자에게는 자동 발송되며, 단톡방이나 VIP 고객에게는 아래 1-클릭 문구 패키지로 즉시 전달하실 수 있습니다."
      size="md"
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 border border-emerald-300">
            <Check className="h-6 w-6 stroke-[3]" aria-hidden="true" />
          </div>
        </div>

        {/* ━━━ 최우선 승격: 1-Click 단톡방/VIP 문구 패키지 복사 & 문자 발송 ━━━ */}
        <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-300">
          <p className="text-xs font-bold text-slate-600">⚡ 1초 원클릭 배포 패키지</p>
          <button
            type="button"
            data-testid="copy-group-chat-pkg-btn"
            onClick={onCopyGroupChatPackage}
            disabled={shareUnavailable}
            className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-3 text-[15px] font-black text-white shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            📋 카톡 단톡방/VIP 문구 패키지 복사
          </button>
          <a
            href={smsHref}
            data-testid="sms-dispatch-link"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 py-2.5 text-sm font-bold text-slate-800 transition-all cursor-pointer shadow-2xs"
          >
            <Send className="h-4 w-4 text-blue-600" aria-hidden="true" />
            💬 문자(SMS) 앱으로 바로 보내기
          </a>
        </div>

        {/* 발송 결과 */}
        <div className="space-y-2">
          {sendDisabled ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 font-semibold"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>발송은 현재 중지됨. 구독자에게는 발송되지 않았어요. 상단 단톡방 문구 또는 링크를 직접 공유해 주세요.</span>
            </div>
          ) : emailSent > 0 || kakaoSent > 0 ? (
            <div className="space-y-1.5">
              {emailSent > 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-sm font-semibold text-blue-900">
                  <Mail className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                  <span>이메일 구독자 {emailSent}명에게 자동 발송 완료</span>
                </div>
              ) : null}
              {kakaoSent > 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-sm font-semibold text-emerald-900">
                  <MessageSquare className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>카카오 알림톡 {kakaoSent}건 발송 완료</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 font-medium">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span>구독자 자동 발송 대상이 없거나 아직 발송 전입니다. 상단 단톡방 문구 패키지로 즉시 전달해 보세요.</span>
            </div>
          )}
        </div>

        {shareUnavailable ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 font-semibold"
          >
            서비스 도메인 주소 설정이 아직 완료되지 않아 링크를 만들 수 없어요. 관리자에게 문의해 주세요.
          </div>
        ) : null}

        {/* 수동 공유 보조 액션 버튼 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onKakao}
            disabled={shareUnavailable}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] hover:bg-[#FEE500]/90 py-2.5 text-sm font-bold text-[#3C1E1E] transition-all disabled:opacity-50 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            🟡 카카오톡 1:1 공유
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={shareUnavailable}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 py-2.5 text-sm font-bold text-slate-700 transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <ExternalLink className="h-4 w-4 text-slate-500" aria-hidden="true" />
            🔗 소식지 링크만 복사
          </button>
        </div>

        {/* 결과 안내 (토스트가 사라져도 남는 인라인 안내) */}
        <div aria-live="polite" className="min-h-5">
          {notice ? <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-lg">{notice}</p> : null}
        </div>
        {viewerUrl ? (
          <p className="break-all rounded-lg bg-slate-100 border border-slate-200 p-2 font-mono text-xs text-slate-600 select-all">{viewerUrl}</p>
        ) : null}
      </div>
    </Modal>
  );
}
