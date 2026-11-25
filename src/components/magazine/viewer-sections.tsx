/**
 * 뷰어 섹션 모음 (E-03/U-03/U-05, U-06) — **Server Component 호환**: 훅·이벤트 핸들러·브라우저 API 없음.
 * 인터랙션이 필요한 조각은 클라이언트 섬으로 분리했다 (SectionCard 아코디언 · GlossaryTerm · BrokerAvatar ·
 * ForwardSection · PollSection · RoiIsland). 클릭 추적은 `data-track*` 속성 + `viewer-track` 위임.
 * 모든 텍스트는 토큰(text-sm 이상), 보조 텍스트는 ink-muted/ink-subtle, 색 단독 의미 없음.
 */
import React from "react";
import {
  BarChart3, BookOpen, Globe, Hammer, Lightbulb, PenLine, Quote, ShieldAlert, TrendingUp,
} from "lucide-react";
import { GlossaryText } from "@/components/magazine/GlossaryText";
import { DataBadge, SectionCard } from "@/components/magazine/viewer-primitives";
import { AxiosGlassIssueCard } from "@/components/magazine/AxiosGlassIssueCard";
import { MonthlyGlassStatCard } from "@/components/magazine/MonthlyGlassStatCard";
import { PhoneActionButton } from "@/components/common/PhoneActionButton";
import { isSingleCommentFieldNote } from "@/lib/magazine/simple-format";
import {
  cleanNewsSummaryText,
  cleanNewsTitle,
  formatPhoneDisplay,
  formatPriceKo,
  sanitizeDealAddress,
  sentimentMeta,
  topicLabelKo,
  type NewsItemView,
} from "@/lib/magazine/view-helpers";
import {
  NEWS_CHANNEL_MAP,
  isCreRelevantArticle,
  resolveNewsChannel,
} from "@/domain/magazine/news-channels";
import {
  POST_IT_TONES,
  formatAxiosBrief,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
  formatShortIssueSource,
} from "@/domain/magazine/issue-clustering";
import type { AxiosUnitIssue, MonthlyRegionalChart, PostItTone } from "@/domain/magazine/types";
import {
  extractSanitizedStatutoryItems,
  sanitizeStatutoryField,
} from "@/lib/legal/broker-statutory-disclosure";

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ── 현장 노트 / 중개사의 한마디 (단일 코멘트 시 60대 친화 18px 인용 카드로 렌더링) ──
export function FieldNoteSection({
  fieldNote,
  brokerName = "중개사",
  company,
  cadence,
}: {
  fieldNote: AnyRec | null | undefined;
  brokerName?: string | null;
  company?: string | null;
  cadence?: "daily" | "weekly" | "monthly" | null;
}) {
  if (!fieldNote || typeof fieldNote !== "object") return null;
  const safeBrokerName = typeof brokerName === "string" && brokerName.trim() ? brokerName.trim() : "중개사";
  const safeCompany = typeof company === "string" && company.trim() ? company.trim() : null;
  const cadencePeriodLabel =
    cadence === "daily"
      ? "오늘"
      : cadence === "weekly"
        ? "이번 주"
        : cadence === "monthly"
          ? "이번 달"
          : "이번 호";

  if (isSingleCommentFieldNote(fieldNote)) {
    const comment = String(fieldNote.comment ?? "").trim();
    return (
      <div
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ wordBreak: "keep-all" }}
        data-testid="field-note-quote-card"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <PenLine className="h-4 w-4 text-violet-700" aria-hidden="true" />
          <h2 className="text-sm font-bold text-violet-900">중개사의 한마디</h2>
        </div>
        <figure className="p-4 sm:p-5">
          <div className="rounded-xl border-2 border-violet-200 bg-violet-50/70 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-violet-800">
              <Quote className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-bold text-violet-900">{cadencePeriodLabel} 현장 코멘트</span>
            </div>
            <blockquote className="whitespace-pre-line text-reader font-bold leading-[1.8] text-slate-900">
              {comment}
            </blockquote>
            <figcaption className="mt-3 flex items-center justify-end gap-1.5 border-t border-violet-200 pt-2.5 text-sm font-semibold text-slate-800">
              <span>— {safeBrokerName}</span>
              {safeCompany && <span className="text-slate-700">· {safeCompany}</span>}
            </figcaption>
          </div>
        </figure>
      </div>
    );
  }

  const hasAny =
    Boolean(String(fieldNote.question ?? "").trim()) ||
    Boolean(String(fieldNote.buyerReaction ?? "").trim()) ||
    Boolean(String(fieldNote.sellerReaction ?? "").trim()) ||
    Boolean(String(fieldNote.marketJudgment ?? "").trim()) ||
    Boolean(String(fieldNote.comment ?? "").trim());
  if (!hasAny) return null;

  const fieldRow = (emoji: string, label: string, text?: string) =>
    !text ? null : (
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-base" aria-hidden="true">
          {emoji}
        </span>
        <div>
          <h3 className="mb-0.5 text-sm font-bold text-slate-700">{label}</h3>
          <p className="text-reader text-slate-900">{text}</p>
        </div>
      </div>
    );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <PenLine className="h-4 w-4 text-violet-700" aria-hidden="true" />
        <h2 className="text-sm font-bold text-violet-900">{safeBrokerName}의 현장 노트</h2>
        {/* 현장 노트는 중개인이 직접 쓴 글 — 'AI 분석' 배지를 붙이지 않는다(허위 출처 표기 방지) */}
      </div>
      <div className="space-y-3.5 p-4">
        {fieldRow("💬", `${cadencePeriodLabel} 시장`, fieldNote.question)}
        {fieldRow("📈", "매수 반응", fieldNote.buyerReaction)}
        {fieldRow("📉", "매도 반응", fieldNote.sellerReaction)}
        {fieldRow("🌡️", "시장 판단", fieldNote.marketJudgment)}
        {fieldNote.comment && (
          <div className="mt-1 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-base" aria-hidden="true">
                💡
              </span>
              <div>
                <h3 className="mb-0.5 text-sm font-bold text-violet-900">중개인 한마디</h3>
                <p className="text-reader font-bold text-slate-900">{fieldNote.comment}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 시장 데이터 ──────────────────────────────────────────────
export function MarketDataSection({
  recentTxs, rentalTrend, commercialDistrict, monthlySummary, dateLabel, defaultOpen,
}: {
  recentTxs: AnyRec[];
  rentalTrend: AnyRec | null;
  commercialDistrict: AnyRec | null;
  monthlySummary: AnyRec | null;
  dateLabel: string;
  defaultOpen?: boolean;
}) {
  const seen = new Set<string>(); // 용어 첫 등장만 설명
  return (
    <SectionCard
      title="시장 데이터"
      icon={<BarChart3 className="h-4 w-4 text-sky-700" aria-hidden="true" />}
      badge={recentTxs.length > 0 ? <DataBadge type="public" /> : undefined}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-4">
        {recentTxs.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1 text-sm font-bold text-emerald-800">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              최근 실거래
              <span className="ml-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-sm font-semibold text-emerald-800">
                {recentTxs.length}건
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">최근 실거래 내역</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-slate-700">
                    <th scope="col" className="py-1.5 text-left font-semibold">주소</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">거래가</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTxs.slice(0, 5).map((tx, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="max-w-[140px] truncate py-1.5 text-slate-900">{tx.dong || tx.address}</td>
                      <td className="py-1.5 text-right font-bold text-emerald-800">{formatPriceKo(tx.transaction_price)}</td>
                      <td className="py-1.5 text-right text-slate-700">{tx.transaction_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {rentalTrend && (
          <div>
            <h3 className="mb-2 text-sm font-bold text-sky-800">임대 동향</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat value={`${rentalTrend.vacancy_rate}%`} label="공실률" tone="text-sky-800" />
              <Stat value={String(rentalTrend.rental_index)} label="임대료 지수" tone="text-indigo-800" />
            </div>
            <p className="mt-1 text-sm text-slate-700">
              <GlossaryText text={String(rentalTrend.region ?? "")} seen={seen} /> · {rentalTrend.quarter}
            </p>
          </div>
        )}
        {commercialDistrict && (
          <div>
            <h3 className="mb-2 text-sm font-bold text-amber-800">상권 분석</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat value={String(commercialDistrict.sales_volume_index)} label="매출 지수" tone="text-amber-800" />
              <Stat value={String(commercialDistrict.footfall_index)} label="유동인구 지수" tone="text-rose-800" />
            </div>
            <p className="mt-1 text-sm text-slate-700">
              <GlossaryText text={String(commercialDistrict.district_name ?? "")} seen={seen} />
            </p>
          </div>
        )}
        {monthlySummary && (
          <div>
            <h3 className="mb-2 flex items-center gap-1 text-sm font-bold text-violet-900">
              📊 월간 실거래 요약
              <span className="ml-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-sm font-semibold text-violet-900">
                {monthlySummary.period || "최근"}
              </span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={`${monthlySummary.totalCount ?? "—"}건`} label="거래 건수" tone="text-violet-900" small />
              <Stat value={String(monthlySummary.avgPrice ?? "—")} label="평균 거래가" tone="text-violet-900" small />
              <Stat
                value={`${(monthlySummary.changeRate ?? 0) >= 0 ? "▲ +" : "▼ "}${monthlySummary.changeRate ?? "—"}%`}
                label="전월 대비"
                tone={(monthlySummary.changeRate ?? 0) >= 0 ? "text-emerald-800" : "text-rose-800"}
                small
              />
            </div>
            {Array.isArray(monthlySummary.usageDistribution) && monthlySummary.usageDistribution.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {monthlySummary.usageDistribution.slice(0, 5).map((u: AnyRec, i: number) => (
                  <span key={i} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-sm font-medium text-violet-900">
                    {u.usage || u.type} {u.count}건 ({u.ratio || u.percentage}%)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 출처·기준일 (시장 데이터 신뢰 표기) */}
        <p className="border-t border-slate-200 pt-2 text-sm text-slate-700" data-testid="market-source">
          출처: 공공데이터 · 기준일: {dateLabel} 발행 시점 (항목별 기준 시점은 각 항목에 표기)
        </p>
      </div>
    </SectionCard>
  );
}

function Stat({ value, label, tone, small }: { value: string; label: string; tone: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
      <p className={`${small ? "text-title" : "text-display"} font-extrabold leading-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-700">{label}</p>
    </div>
  );
}

// ── 월간 권역별 유용한 통계 2건 그래프 섹션 (모던 글래스모피즘 카드뉴스형 바 그래픽) ──
export function MonthlyRegionalChartsSection({
  charts,
}: {
  charts: MonthlyRegionalChart[];
}) {
  if (!Array.isArray(charts) || charts.length === 0) return null;
  const topTwo = charts.slice(0, 2);

  return (
    <SectionCard
      title="권역별 핵심 통계 그래픽 2선"
      icon={<BarChart3 className="h-4 w-4 text-sky-700" aria-hidden="true" />}
      badge={<DataBadge type="public" />}
      defaultOpen
    >
      <div className="space-y-4" data-testid="monthly-regional-charts-section">
        {topTwo.map((chart, idx) => (
          <MonthlyGlassStatCard
            key={chart.id || idx}
            index={idx}
            chart={chart}
            size="viewer"
            cardTestId="monthly-regional-chart-card"
            sourceTestId="monthly-chart-source"
          />
        ))}
      </div>
    </SectionCard>
  );
}

// ── AI 클러스터링 AXIOS형 와이드 포스트잇 이슈 카드 뉴스 (2줄 카드뉴스형 대형 제목 + 2줄 부제형 해설 + 파스텔 포스트잇 배경) ──
export function NewsSection({
  items,
  unitIssues,
  cadence: _cadence = "weekly",
}: {
  items: NewsItemView[];
  unitIssues?: AxiosUnitIssue[];
  cadence?: string;
}) {
  const validUnitIssues = Array.isArray(unitIssues)
    ? unitIssues.filter((u) => isCreRelevantArticle({ title: u.title, summary: u.brief }))
    : [];
  const validItems = Array.isArray(items)
    ? items.filter((n) => isCreRelevantArticle({ title: n.title, summary: n.summary }))
    : [];

  const hasExplicitUnitIssues = validUnitIssues.length > 0;
  if (!hasExplicitUnitIssues && validItems.length === 0) return null;

  // unitIssues가 있으면 우선 사용하고, 없으면 items를 AXIOS 카드뉴스 포스트잇 형식으로 변환
  const cards = hasExplicitUnitIssues
    ? validUnitIssues.slice(0, 5).map((u, idx) => {
        const rawTone = (u.memoTone || (u as AnyRec).tone) as PostItTone;
        const tone: PostItTone = POST_IT_TONES.includes(rawTone)
          ? rawTone
          : POST_IT_TONES[idx % POST_IT_TONES.length];
        const rawTitle = cleanNewsTitle(u.title) || u.title;
        const rawTopic = u.topic || (u as AnyRec).category || "";
        const topic = rawTopic ? topicLabelKo(rawTopic) : "";
        const channelId = resolveNewsChannel({
          title: rawTitle,
          summary: u.brief,
          topic: rawTopic,
          channel: u.channel || rawTopic,
        });
        const cleanedTitle = formatAxiosCardTitle(rawTitle) || rawTitle;
        const cleanedBrief = formatAxiosTwoLineBrief(u.brief, {
          title: cleanedTitle,
          channel: channelId,
        });
        const channelMeta = NEWS_CHANNEL_MAP[channelId];
        const safeUrl =
          typeof u.url === "string" && /^https?:\/\//i.test(u.url.trim())
            ? u.url.trim()
            : null;
        const rawSourceLabel =
          typeof (u as AnyRec).sourceLabel === "string"
            ? (u as AnyRec).sourceLabel.trim()
            : "";
        const sourceText = formatShortIssueSource({
          sources: u.sources,
          sourceLabel: rawSourceLabel,
          url: safeUrl,
        });
        return {
          id: u.id || `issue-${idx + 1}`,
          tone,
          title: cleanedTitle,
          brief: cleanedBrief,
          topic,
          channelMeta,
          source: sourceText,
          clusterCount: u.articleCount || (u as AnyRec).clusterCount || 1,
          safeUrl,
        };
      })
    : validItems.slice(0, 5).map((n, idx) => {
        const tone: PostItTone = POST_IT_TONES[idx % POST_IT_TONES.length];
        const topic = topicLabelKo(n.topic);
        const channelId = resolveNewsChannel(n);
        const channelMeta = NEWS_CHANNEL_MAP[channelId];
        const cleanedTitle = formatAxiosCardTitle(n.title) || n.title;
        const cleanedBrief = formatAxiosTwoLineBrief(cleanNewsSummaryText(n.summary), {
          title: cleanedTitle,
          channel: channelId,
        });
        const safeUrl =
          typeof n.url === "string" && /^https?:\/\//i.test(n.url.trim())
            ? n.url.trim()
            : null;
        return {
          id: `news-${idx + 1}`,
          tone,
          title: cleanedTitle,
          brief: cleanedBrief,
          topic,
          channelMeta,
          source: formatShortIssueSource({ source: n.source, url: safeUrl }),
          clusterCount: 1,
          safeUrl,
        };
      });

  return (
    <div className="space-y-3.5" data-testid="news-section-clean">
      {/* 카드뉴스형 글래스모피즘 이슈 카드 (제목 44자 · 상세 해설 74자 · 자연 줄바꿈) */}
      <ul className="space-y-3.5" data-testid="axios-postit-list">
        {cards.map((card, i) => (
          <AxiosGlassIssueCard
            key={card.id || i}
            index={i}
            tone={card.tone}
            title={card.title}
            brief={card.brief}
            size="viewer"
            channelEmoji={card.channelMeta?.emoji}
            channelLabel={card.channelMeta?.shortLabel || card.topic || "부동산·시장"}
            topic={undefined}
            source={card.source}
            safeUrl={card.safeUrl}
            clusterCount={card.clusterCount}
            cardTestId="axios-postit-card"
            titleTestId="axios-postit-title"
            briefTestId="axios-postit-brief"
            channelBadgeTestId="viewer-news-channel-badge"
            titleAs="h3"
          />
        ))}
      </ul>
    </div>
  );
}

// ── 경매 픽 / 리포트 / 투자 심리 ─────────────────────────────────
export function AuctionSection({ picks }: { picks: AnyRec[] }) {
  if (picks.length === 0) return null;
  const seen = new Set<string>();
  return (
    <SectionCard
      title="경매 픽"
      icon={<Hammer className="h-4 w-4 text-amber-700" aria-hidden="true" />}
      badge={
        // 헤더는 <button> 이므로 용어 설명 버튼(GlossaryText)을 넣지 않는다 — 중첩 button 은 hydration 오류. 설명은 패널 본문에 둔다.
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-bold text-amber-900">
          경매·부실채권(NPL) 발굴
        </span>
      }
    >
      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-slate-700">
          <GlossaryText text="경매·부실채권(NPL) 물건 — 최저입찰가와 감정가를 비교해 보세요." seen={seen} />
        </p>
        {picks.map((a, i) => (
          <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
            <div className="mb-2 flex items-start justify-between">
              <p className="mr-2 flex-1 text-sm font-bold leading-snug text-slate-900">{sanitizeDealAddress(a.address)}</p>
              {a.discountPct > 0 && (
                <span className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-sm font-extrabold text-rose-800">
                  -{a.discountPct}%
                </span>
              )}
            </div>
            {a.discountPct > 0 && (
              <div className="mb-2">
                <div className="mb-1 flex justify-between text-sm text-slate-700">
                  <span>최저입찰가 {formatPriceKo(a.minimumBid)}</span>
                  <span>감정가 {formatPriceKo(a.appraisedValue)}</span>
                </div>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500" style={{ width: `${100 - a.discountPct}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <span className="font-bold text-amber-900">{a.auctionDate}</span>
              <span aria-hidden="true">·</span>
              <span>{a.status}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function ReportsSection({ reports }: { reports: AnyRec[] }) {
  if (reports.length === 0) return null;
  return (
    <SectionCard
      title="전문 리서치 리포트"
      icon={<Globe className="h-4 w-4 text-indigo-700" aria-hidden="true" />}
    >
      <div className="space-y-2">
        {reports.map((r, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-sm font-bold text-indigo-800">{r.institution}</p>
              <p className="line-clamp-1 text-sm font-bold text-slate-900">{r.title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-slate-700">{r.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function SentimentSection({
  sentiment,
}: {
  sentiment: { score: number; status?: string; asOf?: string };
}) {
  const meta = sentimentMeta(sentiment.score);
  const lightToneText =
    sentiment.score >= 70 ? "text-rose-700" : sentiment.score >= 50 ? "text-emerald-800" : "text-sky-800";
  return (
    <SectionCard
      title="CRE 투자자 심리 지수"
      icon={<span className="text-base" aria-hidden="true">🌡️</span>}
      badge={<span className={`text-sm font-bold ${lightToneText}`}>{sentiment.status ?? meta.label}</span>}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700">CRE 시장 심리</span>
          <span className="text-title font-extrabold text-slate-900">
            {sentiment.score}
            <span className="text-sm font-normal text-slate-600">/100</span>
            <span className={`ml-2 text-sm font-bold ${lightToneText}`}>{meta.label}</span>
          </span>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`심리 지수 ${sentiment.score}점, ${meta.label}`}>
          <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${sentiment.score < 0 ? 0 : sentiment.score > 100 ? 100 : sentiment.score}%` }} />
        </div>
        <div className="flex justify-between text-sm text-slate-700">
          <span>극단 위축</span><span>중립 50</span><span>극단 과열</span>
        </div>
        {sentiment.asOf && <p className="text-sm text-slate-700">기준일: {sentiment.asOf}</p>}
      </div>
    </SectionCard>
  );
}

// ── 세무·법률 클리닉 (일반 정보 + 면책 + 기준일, 문의는 강등된 텍스트 링크) ──────────
export function TaxClinicSection({
  taxClinic, telHref,
}: {
  taxClinic: AnyRec | null;
  telHref?: string | null;
}) {
  if (!taxClinic || (!taxClinic.question && !taxClinic.title)) return null;
  const disclaimer: string =
    typeof taxClinic.disclaimer === "string" && taxClinic.disclaimer.trim()
      ? taxClinic.disclaimer
      : "일반 정보이며 세무 자문이 아닙니다.";
  const asOf: string | null = typeof taxClinic.asOf === "string" && taxClinic.asOf ? taxClinic.asOf : null;
  const source: string | null = typeof taxClinic.source === "string" && taxClinic.source ? taxClinic.source : null;

  const Footer = (
    <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
      {source && <p className="text-sm leading-relaxed text-slate-700">근거: {source}</p>}
      {asOf && <p className="text-sm text-slate-700">기준일: {asOf}</p>}
      <p className="text-sm leading-relaxed text-slate-700" data-testid="tax-disclaimer">
        ※ {disclaimer}
      </p>
      {telHref && (
        <a
          href={telHref}
          data-track="tax_inquiry"
          className="inline-flex min-h-12 items-center text-sm font-semibold text-indigo-700 hover:text-indigo-900 underline underline-offset-4"
        >
          세무 관련 문의는 중개사에게 전화하기
        </a>
      )}
    </div>
  );

  // 에디터가 직접 쓴 Q/A 형태
  if (taxClinic.question && taxClinic.answer) {
    return (
      <SectionCard title="💰 세무·법률 클리닉" icon={<Lightbulb className="h-4 w-4 text-amber-700" aria-hidden="true" />}>
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">Q. {taxClinic.question}</p>
          </div>
          <div className="whitespace-pre-line text-body leading-relaxed text-slate-800">{taxClinic.answer}</div>
          {Footer}
        </div>
      </SectionCard>
    );
  }

  // 일반 정보 비교 UI (추천 표현 없음)
  const optA = taxClinic.comparison?.optionA;
  const optB = taxClinic.comparison?.optionB;
  return (
    <SectionCard
      title="💡 세대 전환 전략 (증여/상속)"
      icon={<ShieldAlert className="h-4 w-4 text-slate-700" aria-hidden="true" />}
      badge={<span className="rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-sm font-bold text-slate-800">일반 정보</span>}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <h3 className="mb-2 text-body font-bold leading-snug text-slate-900">{taxClinic.title}</h3>
          {taxClinic.scenario && <p className="text-sm leading-relaxed text-slate-700">{taxClinic.scenario}</p>}
        </div>
        {optA && optB && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[{ label: "대안 A", opt: optA }, { label: "대안 B", opt: optB }].map(({ label, opt }) => (
              <div key={label} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div aria-hidden="true" className="absolute left-0 top-0 h-full w-1 bg-slate-400" />
                <p className="mb-1 text-sm font-bold text-slate-700">{label}</p>
                <p className="mb-2 text-sm font-bold text-slate-900">{opt.name}</p>
                <p className="mb-2 text-sm leading-relaxed text-slate-700">{opt.description}</p>
                {opt.expectedTaxInfo && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-sm font-medium text-slate-800">예상 세금(예시): {opt.expectedTaxInfo}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {taxClinic.conclusion && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="mb-1 text-sm font-bold text-slate-700">요약</p>
            <p className="text-sm font-medium leading-relaxed text-slate-900">{taxClinic.conclusion}</p>
          </div>
        )}
        {Footer}
      </div>
    </SectionCard>
  );
}

// ── 전달하기(ForwardSection)는 클립보드/공유 API 가 필요해 클라이언트 섬 `ForwardSection.tsx` 로 분리 (U-06) ──


// ── 중개사 연락처 간소화 바 (이름 + 원터치 전화 걸기, 부수 링크/아바타 제거) ──────────────
export function BrokerProfileSection({
  name,
  company: _company,
  photoUrl: _photoUrl,
  specialties: _specialties,
  slug: _slug,
  dealCount: _dealCount,
  listingCount: _listingCount,
  bio: _bio,
  phone,
  officeAddress: _officeAddress,
  officeRegNumber: _officeRegNumber,
  representativeName: _representativeName,
}: {
  name: string;
  company?: string | null;
  photoUrl?: string | null;
  specialties: string[];
  slug?: string | null;
  dealCount?: number;
  listingCount?: number;
  bio?: string | null;
  phone?: string | null;
  officeAddress?: string | null;
  officeRegNumber?: string | null;
  representativeName?: string | null;
}) {
  const safePhone = sanitizeStatutoryField(phone, "phone");
  const formattedPhone = formatPhoneDisplay(safePhone);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm" style={{ wordBreak: "keep-all" }}>
      <h2 className="sr-only">담당 중개사</h2>
      <p className="text-body font-bold text-slate-900">{name}</p>
      {safePhone && formattedPhone ? (
        <div data-track="cta_click" className="inline-flex items-center">
          <PhoneActionButton
            phone={safePhone}
            variant="compact"
            showFormattedNumber={false}
            desktopCopyOnly={true}
            callClassName="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[17px] font-extrabold text-indigo-800 tabular-nums hover:bg-indigo-50 transition-colors"
            renderCallContent={
              <>
                <span aria-hidden="true">📞</span>
                <span>{formattedPhone}</span>
              </>
            }
            fallbackLabel={
              <>
                <span aria-hidden="true">📞</span>
                <span>{formattedPhone}</span>
              </>
            }
            fallbackClassName="font-mono text-[17px] font-extrabold text-indigo-800 tabular-nums"
          />
        </div>
      ) : null}
    </div>
  );
}

// ── 뉴스레터 하단 법정 표시의무 안내 (공인중개사법 제18조의2 — 접힘 기본으로 시각 부담 최소화, text-sm 준수) ──
export function BrokerStatutoryFooter({
  company,
  officeAddress,
  officeRegNumber,
  representativeName,
  displayName,
  phone,
}: {
  company?: string | null;
  officeAddress?: string | null;
  officeRegNumber?: string | null;
  representativeName?: string | null;
  displayName?: string | null;
  phone?: string | null;
}) {
  const trimmedDisplay = typeof displayName === "string" ? displayName.trim() : "";
  const hasBrokerMeta = Boolean(
    (typeof company === "string" && company.trim()) ||
      (typeof officeAddress === "string" && officeAddress.trim()) ||
      (typeof officeRegNumber === "string" && officeRegNumber.trim()) ||
      (typeof representativeName === "string" && representativeName.trim()) ||
      (typeof phone === "string" && phone.trim()) ||
      (trimmedDisplay && trimmedDisplay !== "중개사"),
  );
  if (!hasBrokerMeta) return null;

  const formattedPhone = formatPhoneDisplay(sanitizeStatutoryField(phone, "phone"));
  const statutory = extractSanitizedStatutoryItems({
    company,
    officeAddress,
    officeRegNumber,
    representativeName,
    displayName: displayName && displayName !== "중개사" ? displayName : undefined,
    phone: formattedPhone || phone,
  });

  return (
    <details
      data-testid="magazine-broker-statutory-disclosure"
      className="rounded-xl border border-slate-200/80 bg-transparent px-3 py-2 text-sm text-slate-600"
      style={{ wordBreak: "keep-all" }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-slate-500 select-none">
        <span>중개사무소 법정 표시사항</span>
        <span aria-hidden="true" className="text-slate-400">▾</span>
      </summary>
      <div className="mt-2 border-t border-slate-200/70 pt-2">
        {statutory.hasAny ? (
          <dl className="space-y-1 text-sm">
            {statutory.items.map((item) => (
              <div key={item.key} className="flex flex-wrap items-baseline gap-x-2">
                <dt className="shrink-0 font-semibold text-slate-600">{item.label}</dt>
                <dd className="text-slate-800">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-600">
            담당 중개사무소의 상세 표시사항은 중개사 프로필에서 최신 정보로 확인하실 수 있습니다.
          </p>
        )}
      </div>
    </details>
  );
}

