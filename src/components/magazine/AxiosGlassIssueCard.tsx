/**
 * src/components/magazine/AxiosGlassIssueCard.tsx
 *
 * 뉴스레터 핵심 이슈 5선 — SOTA 루미너스 글래스모피즘 카드뉴스 포스트잇 (에디터 미리보기 · 고객 뷰어 공용 SSOT)
 *  - Apple News+ · Toss Securities · Axios AM · Radix Color Scale(Step 1~3 표면 + Step 11~12 잉크) 기반 설계:
 *    1) 고명도(L* 95~98) 파스텔 오로라 메시 그래디언트 + 반투명 프로스티드 글래스 패널(backdrop-blur-xl) + 스페큘러 상단 림
 *    2) 짙은 슬레이트 잉크(#0F172A 제목 15:1+, #1E293B 해설 12:1+) + 미세 화이트 레터프레스 섀도로 WCAG AAA 시인성 및 노안·난시 빛번짐(Halation) 제로 달성
 *    3) .broker-paper-theme(라이트 워크스페이스) 및 .dark(공개 뷰어) 양쪽 테마 캐스케이드 충돌 원천 차단(명시적 인라인 잉크 토큰 바인딩)
 *  - 제목 36자 · 해설 48자 카피 예산(issue-clustering SSOT)으로 생성하고,
 *    렌더링은 line-clamp/truncate 없이 자연 줄바꿈(break-keep)만 허용해 "잘리는 글 0건"을 보장
 */
import React from "react";
import { POST_IT_TONE_META } from "@/domain/magazine/issue-clustering";
import type { PostItTone } from "@/domain/magazine/types";

export type AxiosGlassCardSize = "preview" | "viewer";

export interface AxiosGlassIssueCardProps {
  index: number;
  tone: PostItTone;
  title: string;
  brief: string;
  size?: AxiosGlassCardSize;
  channelEmoji?: string;
  channelLabel?: string;
  sentimentSymbol?: string;
  sentimentLabel?: string;
  topic?: string;
  source?: string;
  safeUrl?: string | null;
  clusterCount?: number;
  cardTestId?: string;
  titleTestId?: string;
  briefTestId?: string;
  channelBadgeTestId?: string;
  /** 제목 태그 (에디터 미리보기 h4 / 고객 뷰어 h3) */
  titleAs?: "h3" | "h4";
}

const SIZE_CLASS: Record<AxiosGlassCardSize, { pad: string; title: string; brief: string; chip: string }> = {
  // 에디터 미리보기: 기존 text-lg → text-base, text-sm → text-[13px] (한 단계 축소)
  preview: {
    pad: "p-4",
    title: "text-base leading-[1.42]",
    brief: "text-[13px] leading-[1.62]",
    chip: "text-xs",
  },
  // 고객 뷰어: 기존 19/21px → 17/19px, 15/16px → 14/15px (한 단계 축소)
  viewer: {
    pad: "p-5",
    title: "text-[17px] sm:text-[19px] leading-[1.42]",
    brief: "text-[14px] sm:text-[15px] leading-[1.62]",
    chip: "text-caption",
  },
};

// 밝은 프로스티드 글래스 위 짙은 잉크의 광학 선명도를 높이는 미세 화이트 스페큘러 레터프레스 효과
const TITLE_TEXT_SHADOW = "0 1px 0 rgba(255, 255, 255, 0.88)";
const BRIEF_TEXT_SHADOW = "0 1px 0 rgba(255, 255, 255, 0.72)";

export function AxiosGlassIssueCard({
  index,
  tone,
  title,
  brief,
  size = "viewer",
  channelEmoji,
  channelLabel,
  sentimentSymbol,
  sentimentLabel,
  topic,
  source,
  safeUrl,
  clusterCount,
  cardTestId,
  titleTestId,
  briefTestId,
  channelBadgeTestId,
  titleAs = "h3",
}: AxiosGlassIssueCardProps) {
  const meta = POST_IT_TONE_META[tone] ?? POST_IT_TONE_META.amber;
  const s = SIZE_CLASS[size];
  const TitleTag = titleAs;
  const issueNo = String(index + 1).padStart(2, "0");

  return (
    <li
      data-testid={cardTestId}
      data-postit-tone={tone}
      data-card-style="glass"
      data-contrast-tier="wcag-aaa"
      className="relative isolate overflow-hidden rounded-3xl border"
      style={{
        background: meta.glassBackground,
        borderColor: meta.glassBorder,
        boxShadow: meta.glassGlow,
        color: meta.titleColor,
      }}
    >
      {/* 우상단 소프트 오로라 글로우 오브 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl"
        style={{ background: meta.glassAccent }}
      />
      {/* 상단 유리 스페큘러 하이라이트 헤어라인 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.2), rgba(255,255,255,0.95), rgba(255,255,255,0.2))",
        }}
      />
      {/* 좌측 에디토리얼 시그니처 컬러 스트립 (포스트잇 컬러 아이덴티티) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 left-0 top-4 w-[3.5px] rounded-r-full"
        style={{
          background: `linear-gradient(180deg, ${meta.glassAccent} 0%, ${meta.cardBorder} 100%)`,
        }}
      />

      {/* 반투명 프로스티드 펄 글래스 패널 */}
      <div
        className={`relative m-[3px] rounded-[1.35rem] backdrop-blur-xl ${s.pad}`}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.58)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.92)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-black tracking-[0.10em] ${s.chip}`}
              style={{
                backgroundColor: meta.glassPillBg,
                borderColor: meta.glassPillBorder,
                color: meta.badgeText,
              }}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: meta.glassAccent,
                  boxShadow: `0 0 6px ${meta.glassAccent}66`,
                }}
              />
              ISSUE {issueNo}
            </span>
            {channelLabel && (
              <span
                data-testid={channelBadgeTestId}
                className={`rounded-full border px-2.5 py-0.5 font-bold ${s.chip}`}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.86)",
                  borderColor: "rgba(15, 23, 42, 0.12)",
                  color: "#1E293B",
                }}
              >
                {channelEmoji && <span aria-hidden="true">{channelEmoji}</span>} {channelLabel}
              </span>
            )}
            {sentimentLabel && (
              <span
                className={`rounded-full border px-2 py-0.5 font-bold ${s.chip}`}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.80)",
                  borderColor: "rgba(15, 23, 42, 0.10)",
                  color: "#334155",
                }}
              >
                {sentimentSymbol && <span aria-hidden="true">{sentimentSymbol}</span>} {sentimentLabel}
              </span>
            )}
            {topic && (
              <span
                className={`rounded-full border px-2 py-0.5 font-bold ${s.chip}`}
                style={{
                  backgroundColor: "rgba(248, 250, 252, 0.85)",
                  borderColor: "rgba(15, 23, 42, 0.10)",
                  color: "#334155",
                }}
              >
                {topic}
              </span>
            )}
          </div>
          {typeof clusterCount === "number" && clusterCount > 1 && (
            <span
              className={`font-bold ${s.chip}`}
              style={{ color: meta.metaColor }}
            >
              AI 클러스터링 {clusterCount}건
            </span>
          )}
        </div>

        {/* 카드뉴스 헤드라인 — 36자 예산 · #0F172A 15:1+ 초고대비 · 자연 줄바꿈 · 잘림 없음 */}
        <TitleTag
          data-testid={titleTestId}
          data-axios-headline-lines="2"
          data-max-chars="36"
          title={title}
          className={`mt-3 break-keep font-extrabold tracking-[-0.02em] text-slate-900 ${s.title}`}
          style={{
            color: meta.titleColor,
            wordBreak: "keep-all",
            textShadow: TITLE_TEXT_SHADOW,
          }}
        >
          {title}
        </TitleTag>

        <span
          aria-hidden="true"
          className="mt-2.5 block h-[3px] w-10 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${meta.glassAccent} 0%, ${meta.cardBorder} 100%)`,
          }}
        />

        {/* AXIOS 부제형 해설 — 48자 예산 · #1E293B 12:1+ 고대비 · 자연 줄바꿈 · 잘림 없음 */}
        {brief && (
          <p
            data-testid={briefTestId}
            data-axios-brief-lines="2"
            data-max-chars="48"
            className={`mt-2 break-keep font-medium text-slate-800 ${s.brief}`}
            style={{
              color: meta.bodyColor,
              wordBreak: "keep-all",
              textShadow: BRIEF_TEXT_SHADOW,
            }}
          >
            {brief}
          </p>
        )}

        {(source || safeUrl) && (
          <div
            className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5"
            style={{ borderColor: "rgba(15, 23, 42, 0.09)" }}
          >
            {source ? (
              <p
                className={`font-semibold ${s.chip}`}
                style={{ color: "#475569" }}
              >
                출처: {source}
              </p>
            ) : (
              <span />
            )}
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-track="news_click"
                className={`font-extrabold underline underline-offset-2 hover:opacity-80 ${s.chip}`}
                style={{
                  color: meta.metaColor,
                  textDecorationColor: meta.glassBorder,
                }}
              >
                원문 보기 ↗
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
