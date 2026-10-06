/**
 * 뷰어 섹션 모음 (E-03/U-03/U-05, U-06) — **Server Component 호환**: 훅·이벤트 핸들러·브라우저 API 없음.
 * 인터랙션이 필요한 조각은 클라이언트 섬으로 분리했다 (SectionCard 아코디언 · GlossaryTerm · BrokerAvatar ·
 * ForwardSection · PollSection · RoiIsland). 클릭 추적은 `data-track*` 속성 + `viewer-track` 위임.
 * 모든 텍스트는 토큰(text-caption 이상), 보조 텍스트는 ink-muted/ink-subtle, 색 단독 의미 없음.
 */
import React from "react";
import {
  BarChart3, BookOpen, Globe, Hammer, Lightbulb, Newspaper, ShieldAlert, TrendingUp,
} from "lucide-react";
import { BrokerAvatar } from "@/components/magazine/BrokerAvatar";
import { GlossaryText } from "@/components/magazine/GlossaryText";
import { DataBadge, SectionCard } from "@/components/magazine/viewer-primitives";
import {
  formatPriceKo,
  newsSentimentMeta,
  sentimentMeta,
  topicLabelKo,
  type NewsItemView,
} from "@/lib/magazine/view-helpers";

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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
      icon={<BarChart3 className="h-4 w-4 text-sky-300" aria-hidden="true" />}
      badge={recentTxs.length > 0 ? <DataBadge type="public" /> : undefined}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-4">
        {recentTxs.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1 text-label font-bold text-emerald-200">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              최근 실거래
              <span className="ml-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-caption font-normal text-emerald-100">
                {recentTxs.length}건
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-caption">
                <caption className="sr-only">최근 실거래 내역</caption>
                <thead>
                  <tr className="border-b border-white/10 text-ink-subtle">
                    <th scope="col" className="py-1.5 text-left font-medium">주소</th>
                    <th scope="col" className="py-1.5 text-right font-medium">거래가</th>
                    <th scope="col" className="py-1.5 text-right font-medium">날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTxs.slice(0, 5).map((tx, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="max-w-[140px] truncate py-1.5 text-ink-muted">{tx.dong || tx.address}</td>
                      <td className="py-1.5 text-right font-bold text-emerald-200">{formatPriceKo(tx.transaction_price)}</td>
                      <td className="py-1.5 text-right text-ink-subtle">{tx.transaction_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {rentalTrend && (
          <div>
            <h3 className="mb-2 text-label font-bold text-sky-200">임대 동향</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat value={`${rentalTrend.vacancy_rate}%`} label="공실률" tone="text-sky-200" />
              <Stat value={String(rentalTrend.rental_index)} label="렌탈 인덱스" tone="text-indigo-200" />
            </div>
            <p className="mt-1 text-caption text-ink-subtle">
              <GlossaryText text={String(rentalTrend.region ?? "")} seen={seen} /> · {rentalTrend.quarter}
            </p>
          </div>
        )}
        {commercialDistrict && (
          <div>
            <h3 className="mb-2 text-label font-bold text-amber-200">상권 분석</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat value={String(commercialDistrict.sales_volume_index)} label="매출 지수" tone="text-amber-200" />
              <Stat value={String(commercialDistrict.footfall_index)} label="유동인구 지수" tone="text-rose-200" />
            </div>
            <p className="mt-1 text-caption text-ink-subtle">
              <GlossaryText text={String(commercialDistrict.district_name ?? "")} seen={seen} />
            </p>
          </div>
        )}
        {monthlySummary && (
          <div>
            <h3 className="mb-2 flex items-center gap-1 text-label font-bold text-violet-200">
              📊 월간 실거래 요약
              <span className="ml-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-caption font-normal text-violet-100">
                {monthlySummary.period || "최근"}
              </span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={`${monthlySummary.totalCount ?? "—"}건`} label="거래 건수" tone="text-violet-200" small />
              <Stat value={String(monthlySummary.avgPrice ?? "—")} label="평균 거래가" tone="text-violet-200" small />
              <Stat
                value={`${(monthlySummary.changeRate ?? 0) >= 0 ? "▲ +" : "▼ "}${monthlySummary.changeRate ?? "—"}%`}
                label="전월 대비"
                tone={(monthlySummary.changeRate ?? 0) >= 0 ? "text-emerald-200" : "text-rose-200"}
                small
              />
            </div>
            {Array.isArray(monthlySummary.usageDistribution) && monthlySummary.usageDistribution.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {monthlySummary.usageDistribution.slice(0, 5).map((u: AnyRec, i: number) => (
                  <span key={i} className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-caption text-violet-100">
                    {u.usage || u.type} {u.count}건 ({u.ratio || u.percentage}%)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 출처·기준일 (시장 데이터 신뢰 표기) */}
        <p className="border-t border-white/10 pt-2 text-caption text-ink-subtle" data-testid="market-source">
          출처: 공공데이터 · 기준일: {dateLabel} 발행 시점 (항목별 기준 시점은 각 항목에 표기)
        </p>
      </div>
    </SectionCard>
  );
}

function Stat({ value, label, tone, small }: { value: string; label: string; tone: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
      <p className={`${small ? "text-title" : "text-display"} font-extrabold leading-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-caption text-ink-muted">{label}</p>
    </div>
  );
}

// ── 뉴스 큐레이션 (최대 6건, 감성은 텍스트+기호 병기) ─────────────
export function NewsSection({ items }: { items: NewsItemView[] }) {
  if (items.length === 0) return null;
  return (
    <SectionCard
      title="뉴스 큐레이션"
      icon={<Newspaper className="h-4 w-4 text-slate-300" aria-hidden="true" />}
      badge={<DataBadge type="realtime" />}
    >
      <ul className="space-y-2">
        {items.map((n, i) => {
          const s = newsSentimentMeta(n.sentiment);
          const topic = topicLabelKo(n.topic);
          return (
            <li key={i} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-md border border-white/20 px-1.5 py-0.5 text-caption font-bold text-ink-muted">
                  <span aria-hidden="true">{s.symbol}</span> {s.label}
                </span>
                {topic && <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-caption text-indigo-200">{topic}</span>}
              </div>
              <p className="line-clamp-2 text-label font-bold leading-snug text-white">{n.title}</p>
              {n.summary && <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-ink-muted">{n.summary}</p>}
              {n.source && <p className="mt-1 text-caption text-ink-subtle">{n.source}</p>}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// ── 경매 픽 / 리포트 / 투자 심리 ─────────────────────────────────
export function AuctionSection({ picks }: { picks: AnyRec[] }) {
  if (picks.length === 0) return null;
  const seen = new Set<string>();
  return (
    <SectionCard
      title="경매 픽"
      icon={<Hammer className="h-4 w-4 text-amber-300" aria-hidden="true" />}
      badge={
        // 헤더는 <button> 이므로 용어 설명 버튼(GlossaryText)을 넣지 않는다 — 중첩 button 은 hydration 오류. 설명은 패널 본문에 둔다.
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-caption font-bold text-amber-200">
          NPL 소싱
        </span>
      }
    >
      <div className="space-y-2">
        <p className="text-caption leading-relaxed text-ink-subtle">
          <GlossaryText text="NPL 기반 경매 물건 — 최저입찰가와 감정가를 비교해 보세요." seen={seen} />
        </p>
        {picks.map((a, i) => (
          <div key={i} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5">
            <div className="mb-2 flex items-start justify-between">
              <p className="mr-2 flex-1 text-label font-bold leading-snug text-white">{a.address}</p>
              {a.discountPct > 0 && (
                <span className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-caption font-extrabold text-rose-200">
                  -{a.discountPct}%
                </span>
              )}
            </div>
            {a.discountPct > 0 && (
              <div className="mb-2">
                <div className="mb-1 flex justify-between text-caption text-ink-muted">
                  <span>최저입찰가 {formatPriceKo(a.minimumBid)}</span>
                  <span>감정가 {formatPriceKo(a.appraisedValue)}</span>
                </div>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500" style={{ width: `${100 - a.discountPct}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 text-caption text-ink-muted">
              <span className="font-bold text-amber-200">{a.auctionDate}</span>
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
      icon={<Globe className="h-4 w-4 text-indigo-300" aria-hidden="true" />}
    >
      <div className="space-y-2">
        {reports.map((r, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-caption font-bold text-indigo-200">{r.institution}</p>
              <p className="line-clamp-1 text-label font-bold text-white">{r.title}</p>
              <p className="mt-0.5 line-clamp-2 text-caption leading-relaxed text-ink-muted">{r.summary}</p>
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
  return (
    <SectionCard
      title="CRE 투자자 심리 지수"
      icon={<span className="text-base" aria-hidden="true">🌡️</span>}
      badge={<span className={`text-caption font-bold ${meta.text}`}>{sentiment.status ?? meta.label}</span>}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-label text-ink-muted">CRE 시장 심리</span>
          <span className="text-title font-extrabold text-white">
            {sentiment.score}
            <span className="text-label font-normal text-ink-subtle">/100</span>
            <span className={`ml-2 text-caption font-bold ${meta.text}`}>{meta.label}</span>
          </span>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`심리 지수 ${sentiment.score}점, ${meta.label}`}>
          <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${sentiment.score < 0 ? 0 : sentiment.score > 100 ? 100 : sentiment.score}%` }} />
        </div>
        <div className="flex justify-between text-caption text-ink-subtle">
          <span>극단 위축</span><span>중립 50</span><span>극단 과열</span>
        </div>
        {sentiment.asOf && <p className="text-caption text-ink-subtle">기준일: {sentiment.asOf}</p>}
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
    <div className="space-y-1 border-t border-white/10 pt-2">
      {source && <p className="text-caption leading-relaxed text-ink-subtle">근거: {source}</p>}
      {asOf && <p className="text-caption text-ink-subtle">기준일: {asOf}</p>}
      <p className="text-caption leading-relaxed text-ink-muted" data-testid="tax-disclaimer">
        ※ {disclaimer}
      </p>
      {telHref && (
        <a
          href={telHref}
          data-track="tax_inquiry"
          className="inline-flex min-h-11 items-center text-caption font-semibold text-indigo-200 underline underline-offset-4"
        >
          세무 관련 문의는 중개사에게 전화하기
        </a>
      )}
    </div>
  );

  // 에디터가 직접 쓴 Q/A 형태
  if (taxClinic.question && taxClinic.answer) {
    return (
      <SectionCard title="💰 세무·법률 클리닉" icon={<Lightbulb className="h-4 w-4 text-amber-300" aria-hidden="true" />}>
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
            <p className="text-label font-bold text-amber-200">Q. {taxClinic.question}</p>
          </div>
          <div className="whitespace-pre-line text-body leading-relaxed text-ink-muted">{taxClinic.answer}</div>
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
      icon={<ShieldAlert className="h-4 w-4 text-slate-300" aria-hidden="true" />}
      badge={<span className="rounded-md border border-white/20 bg-white/5 px-1.5 py-0.5 text-caption font-bold text-slate-200">일반 정보</span>}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <h3 className="mb-2 text-body font-bold leading-snug text-white">{taxClinic.title}</h3>
          {taxClinic.scenario && <p className="text-label leading-relaxed text-ink-muted">{taxClinic.scenario}</p>}
        </div>
        {optA && optB && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[{ label: "대안 A", opt: optA }, { label: "대안 B", opt: optB }].map(({ label, opt }) => (
              <div key={label} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3">
                <div aria-hidden="true" className="absolute left-0 top-0 h-full w-1 bg-slate-500" />
                <p className="mb-1 text-caption font-bold text-ink-muted">{label}</p>
                <p className="mb-2 text-label font-bold text-white">{opt.name}</p>
                <p className="mb-2 text-caption leading-relaxed text-ink-muted">{opt.description}</p>
                {opt.expectedTaxInfo && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-caption font-medium text-slate-200">예상 세금(예시): {opt.expectedTaxInfo}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {taxClinic.conclusion && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
            <p className="mb-1 text-caption font-bold text-ink-muted">요약</p>
            <p className="text-label font-medium leading-relaxed text-white">{taxClinic.conclusion}</p>
          </div>
        )}
        {Footer}
      </div>
    </SectionCard>
  );
}

// ── 전달하기(ForwardSection)는 클립보드/공유 API 가 필요해 클라이언트 섬 `ForwardSection.tsx` 로 분리 (U-06) ──


// ── 중개사 프로필 (실적 0건 숨김, 사진 실패 시 이니셜 아바타) ──────────────
export function BrokerProfileSection({
  name, company, photoUrl, specialties, slug, dealCount, listingCount, bio,
}: {
  name: string;
  company?: string | null;
  photoUrl?: string | null;
  specialties: string[];
  slug?: string | null;
  dealCount?: number;
  listingCount?: number;
  bio?: string | null;
}) {
  const stats = [
    dealCount && dealCount > 0 ? { label: "거래 실적", value: `${dealCount}건` } : null,
    listingCount && listingCount > 0 ? { label: "진행 매물", value: `${listingCount}건` } : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="sr-only">담당 중개사</h2>
      <div className="flex items-center gap-3">
        <BrokerAvatar name={name} photoUrl={photoUrl} />
        <div className="min-w-0">
          <p className="truncate text-body font-bold text-white">{name}</p>
          {company && <p className="truncate text-caption text-ink-muted">{company}</p>}
        </div>
      </div>
      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {specialties.slice(0, 8).map((s, i) => (
            <span key={i} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-caption text-ink-muted">{s}</span>
          ))}
        </div>
      )}
      {bio && <p className="line-clamp-3 text-label leading-relaxed text-ink-muted">{bio}</p>}
      {stats.length > 0 && (
        <dl className="flex gap-4 text-caption">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-ink-subtle">{s.label}</dt>
              <dd className="font-bold text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {slug && (
        <a
          href={`/broker-profile/${encodeURIComponent(slug)}?ref=magazine-profile`}
          className="inline-flex min-h-11 items-center text-label font-semibold text-indigo-200 underline underline-offset-4"
        >
          중개사 프로필 보기
        </a>
      )}
    </div>
  );
}
