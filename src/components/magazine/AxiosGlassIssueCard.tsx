/**
 * src/components/magazine/AxiosGlassIssueCard.tsx
 *
 * 뉴스레터 핵심 이슈 5선 — 카드뉴스형 글래스모피즘 카드 (에디터 미리보기 · 고객 뷰어 공용 SSOT)
 *  - 다크 베이스 + 톤 메시 그래디언트 배경 위에 반투명 글래스 패널(backdrop-blur)을 겹친 모던 카드뉴스 표면
 *  - 제목 36자 · 해설 48자 카피 예산(issue-clustering SSOT)으로 생성하고,
 *    렌더링은 line-clamp/truncate 없이 자연 줄바꿈(break-keep)만 허용해 "잘리는 글 0건"을 보장
 *  - 흰색 텍스트 + 미세 텍스트 섀도로 메시 배경 위 가독성(WCAG AA)을 확보
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

const TITLE_TEXT_SHADOW = "0 1px 2px rgba(2, 6, 23, 0.45), 0 0 18px rgba(2, 6, 23, 0.25)";
const BRIEF_TEXT_SHADOW = "0 1px 1px rgba(2, 6, 23, 0.35)";

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
      className="relative isolate overflow-hidden rounded-3xl border border-white/15"
      style={{ background: meta.glassBackground, boxShadow: meta.glassGlow }}
    >
      {/* 장식용 글로우 오브 (톤 강조색) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-40 blur-3xl"
        style={{ background: meta.glassAccent }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0))",
        }}
      />

      {/* 반투명 글래스 패널 */}
      <div
        className={`relative m-[3px] rounded-[1.35rem] bg-white/[0.07] ring-1 ring-inset ring-white/10 backdrop-blur-xl ${s.pad}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 font-black tracking-[0.12em] text-white ring-1 ring-inset ring-white/25 ${s.chip}`}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: meta.glassAccent, boxShadow: `0 0 8px ${meta.glassAccent}` }}
              />
              ISSUE {issueNo}
            </span>
            {channelLabel && (
              <span
                data-testid={channelBadgeTestId}
                className={`rounded-full bg-white/10 px-2.5 py-0.5 font-bold text-white/90 ring-1 ring-inset ring-white/15 ${s.chip}`}
              >
                {channelEmoji && <span aria-hidden="true">{channelEmoji}</span>} {channelLabel}
              </span>
            )}
            {sentimentLabel && (
              <span
                className={`rounded-full bg-white/10 px-2 py-0.5 font-bold text-white/85 ring-1 ring-inset ring-white/15 ${s.chip}`}
              >
                {sentimentSymbol && <span aria-hidden="true">{sentimentSymbol}</span>} {sentimentLabel}
              </span>
            )}
            {topic && (
              <span
                className={`rounded-full bg-black/20 px-2 py-0.5 font-bold text-white/80 ${s.chip}`}
              >
                {topic}
              </span>
            )}
          </div>
          {typeof clusterCount === "number" && clusterCount > 1 && (
            <span className={`font-bold text-white/75 ${s.chip}`}>AI 클러스터링 {clusterCount}건</span>
          )}
        </div>

        {/* 카드뉴스 헤드라인 — 36자 예산 · 자연 줄바꿈 · 잘림 없음 */}
        <TitleTag
          data-testid={titleTestId}
          data-axios-headline-lines="2"
          data-max-chars="36"
          title={title}
          className={`mt-3 break-keep font-extrabold tracking-[-0.015em] text-white ${s.title}`}
          style={{ wordBreak: "keep-all", textShadow: TITLE_TEXT_SHADOW }}
        >
          {title}
        </TitleTag>

        <span
          aria-hidden="true"
          className="mt-2.5 block h-[3px] w-9 rounded-full"
          style={{ background: `linear-gradient(90deg, ${meta.glassAccent}, rgba(255,255,255,0.15))` }}
        />

        {/* AXIOS 부제형 해설 — 48자 예산 · 자연 줄바꿈 · 잘림 없음 */}
        {brief && (
          <p
            data-testid={briefTestId}
            data-axios-brief-lines="2"
            data-max-chars="48"
            className={`mt-2 break-keep font-medium text-white/[0.88] ${s.brief}`}
            style={{ wordBreak: "keep-all", textShadow: BRIEF_TEXT_SHADOW }}
          >
            {brief}
          </p>
        )}

        {(source || safeUrl) && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
            {source ? (
              <p className={`font-semibold text-white/70 ${s.chip}`}>출처: {source}</p>
            ) : (
              <span />
            )}
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-track="news_click"
                className={`font-extrabold text-white underline decoration-white/40 underline-offset-2 hover:opacity-80 ${s.chip}`}
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
