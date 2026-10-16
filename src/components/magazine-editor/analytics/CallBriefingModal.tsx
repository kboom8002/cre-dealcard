'use client';

import React, { useState } from 'react';
import { Check, Copy, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { formatKrPhoneDisplay } from '@/lib/magazine/phone-input';
import { formatKstDateTime, honorific, type LeadForBriefing } from './analytics-text';
import type { HotLead } from './types';

const SUBSCRIBER_SEGMENT_KO_MAP: Record<string, string> = {
  investor: '투자 관심',
  investment: '투자 관심',
  buyer: '매수 희망',
  buy: '매수 희망',
  seller: '건물주·매도',
  sell: '건물주·매도',
  owner: '건물주·매도',
  landlord: '건물주·매도',
  tenant: '임차 희망',
  lease: '임차 희망',
  lessee: '임차 희망',
  all: '일반 구독자',
  general: '일반 구독자',
  default: '일반 구독자',
  subscriber: '일반 구독자',
};

/**
 * C-18: 영문 세그먼트 코드를 60대 친화 한국어 라벨로 변환한다.
 * - 'investor' -> '투자 관심'
 * - 'buyer' -> '매수 희망'
 * - 'seller' -> '건물주·매도'
 * - 'tenant' -> '임차 희망'
 * - 'all' / 'general' -> '일반 구독자'
 */
export function formatSubscriberSegmentKo(segment: string | null | undefined): string {
  const raw = (segment ?? '').trim();
  if (!raw) return '일반 구독자';
  const lower = raw.toLowerCase();
  if (SUBSCRIBER_SEGMENT_KO_MAP[lower]) {
    return SUBSCRIBER_SEGMENT_KO_MAP[lower];
  }
  const parenMatch = raw.match(/\(([A-Za-z_-]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].toLowerCase();
    return SUBSCRIBER_SEGMENT_KO_MAP[inner] ?? '일반 구독자';
  }
  if (/[가-힣]/.test(raw) && !/[A-Za-z]/.test(raw)) {
    return raw;
  }
  return '일반 구독자';
}

const SECTION_LABEL_KO_MAP: Record<string, string> = {
  featured_deals: '추천 매물',
  deals: '추천 매물',
  deal_highlights: '추천 매물',
  listing: '추천 매물',
  listings: '추천 매물',
  theme_deals: '테마 기획·매물',
  theme: '테마 기획',
  market: '시장 브리핑',
  market_pulse: '시장 브리핑',
  pulse: '시장 브리핑',
  field_note: '현장 노트',
  fieldnote: '현장 노트',
  cover: '표지 헤드라인',
  hero: '표지 헤드라인',
  news: '주요 뉴스',
  top_news: '주요 뉴스',
  tax: '세무·법률 클리닉',
  tax_clinic: '세무·법률 클리닉',
  poll: '독자 투표',
  vote: '독자 투표',
  cta: '상담·문의 안내',
};

/** 영문 섹션 ID가 넘어와도 자연스러운 한국어 섹션명으로 변환 */
export function formatSectionLabelKo(section: string | null | undefined): string {
  const raw = (section ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (SECTION_LABEL_KO_MAP[lower]) {
    return SECTION_LABEL_KO_MAP[lower];
  }
  if (/[가-힣]/.test(raw)) {
    return raw;
  }
  return '주요 콘텐츠';
}

/**
 * 60대 친화 통화 브리핑 스크립트 생성기 (AI 생성 아님 — 실제 열람·관심 데이터만 반영).
 * - 중개사 표시 이름(없으면 '담당 공인중개사')을 인사말에 반영
 * - 관심 섹션/매물 요약을 자연스러운 한국어로 정돈
 */
export function buildSeniorBriefingTemplate(
  lead: LeadForBriefing & { segment?: string | null },
  brokerDisplayName?: string | null,
): string {
  const brokerName = (brokerDisplayName ?? '').trim() || '담당 공인중개사';
  const lines: string[] = [];
  lines.push(`${honorific(lead.subscriber_name)}, 안녕하세요. ${brokerName}입니다.`);

  const sectionsKo = Array.from(
    new Set((lead.recentSections ?? []).map((s) => formatSectionLabelKo(s)).filter(Boolean)),
  );
  if (lead.totalViews > 0 && sectionsKo.length > 0) {
    const sectionSummary = sectionsKo.slice(0, 2).join(', ');
    lines.push(
      `보내 드린 매거진을 ${lead.totalViews}회 열람해 주시고, 특히 [${sectionSummary}] 내용을 관심 있게 보신 것으로 확인되어 연락드렸습니다.`,
    );
  } else if (lead.totalViews > 0) {
    lines.push(`보내 드린 매거진을 ${lead.totalViews}회 열어보신 것으로 확인되어 연락드렸습니다.`);
  } else {
    lines.push('보내 드린 매거진은 잘 받아보셨는지 여쭙고자 연락드렸습니다.');
  }

  const tags = [...(lead.interest_tags?.regions ?? []), ...(lead.interest_tags?.assetTypes ?? [])].slice(0, 3);
  if (tags.length > 0) {
    lines.push(`관심 두신 지역·자산(${tags.join(', ')})과 관련해 추가로 검토하실 만한 매물이나 궁금하신 점이 있으신지 여쭙고 싶습니다.`);
  }

  lines.push('지금 통화 가능하실까요? 어려우시면 편한 시간을 알려 주세요.');
  return lines.join('\n');
}

interface Props {
  lead: HotLead | null;
  onClose: () => void;
  brokerDisplayName?: string | null;
}

/**
 * 통화 브리핑(템플릿) — AI 가 생성한 스크립트가 아니라 실제 열람 데이터로 채운 고정 템플릿이다.
 * 데이터에 없는 사실(예: "방금 접수된 매물")은 쓰지 않으며, 문구는 복사해서 사용한다 (T3-16, B-19, C-21).
 */
export function CallBriefingModal({ lead, onClose, brokerDisplayName }: Props) {
  const [copied, setCopied] = useState<'phone' | 'script' | null>(null);

  const copy = async (kind: 'phone' | 'script', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(kind === 'phone' ? '전화번호가 복사되었습니다.' : '통화 브리핑 문구가 복사되었습니다.');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('복사하지 못했습니다. 직접 선택해서 복사해 주세요.');
    }
  };

  const script = lead ? buildSeniorBriefingTemplate(lead, brokerDisplayName) : '';
  const formattedPhone = lead ? formatKrPhoneDisplay(lead.subscriber_phone) || lead.subscriber_phone : '';
  const segmentKo = lead ? formatSubscriberSegmentKo(lead.segment) : '';
  const recentSectionsKo = lead
    ? Array.from(new Set(lead.recentSections.map((s) => formatSectionLabelKo(s)).filter(Boolean)))
    : [];

  return (
    <Modal
      open={!!lead}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={lead ? `${lead.subscriber_name} 고객 통화 브리핑` : '통화 브리핑'}
      description="통화 전 참고용 템플릿입니다 (AI 생성 아님)."
    >
      {lead ? (
        <div className="space-y-4">
          {/* ── 상단: 18px 큰 전화번호 + [📞 바로 전화 걸기] / [📋 전화번호 복사] 나란히 배치 ── */}
          <div className="rounded-xl border border-emerald-500/30 bg-slate-950/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="block text-sm font-medium text-slate-300">고객 연락처</span>
                <span className="mt-0.5 block font-mono text-lg font-extrabold tracking-wide text-white">
                  {formattedPhone}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-sm font-bold text-slate-200">
                  {segmentKo}
                </span>
                <span className="rounded-lg bg-rose-500/20 px-2.5 py-1 text-sm font-bold text-rose-200">
                  {lead.buyerTemperature}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href={`tel:${lead.subscriber_phone}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-bold text-white hover:bg-emerald-500 transition-colors"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>📞 바로 전화 걸기</span>
              </a>
              <button
                type="button"
                aria-label="전화번호 복사"
                onClick={() => copy('phone', lead.subscriber_phone)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-base font-bold text-slate-100 hover:bg-slate-700 transition-colors"
              >
                {copied === 'phone' ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{copied === 'phone' ? '전화번호 복사됨' : '📋 전화번호 복사'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5 text-sm">
              <div>
                <span className="block text-sm text-slate-300">최근 30일 열람</span>
                <span className="mt-0.5 block text-base font-bold text-indigo-300">{lead.totalViews}회</span>
              </div>
              <div>
                <span className="block text-sm text-slate-300">마지막 반응</span>
                <span className="mt-0.5 block font-mono text-sm font-semibold text-slate-200">
                  {formatKstDateTime(lead.lastActiveAt)}
                </span>
              </div>
            </div>
          </div>

          {/* ── 최근 집중해서 본 내용 ── */}
          <div>
            <h3 className="mb-2 text-base font-bold text-slate-100">최근 집중해서 본 내용</h3>
            {recentSectionsKo.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {recentSectionsKo.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-rose-500/20 px-3 py-1 text-sm font-semibold text-rose-200"
                  >
                    ✓ {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-300">연결된 섹션 열람 기록이 없습니다.</p>
            )}
          </div>

          {/* ── 통화 스크립트 본문 (16px 이상, AI 생성 아님 유지) ── */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-100">통화 오프닝 (템플릿)</h3>
              <span className="text-sm text-slate-300">실제 열람 기록 기반 · AI 생성 아님</span>
            </div>
            <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 font-sans text-base leading-relaxed text-slate-100">
              {script}
            </pre>
          </div>

          {/* ── 하단 액션 ── */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => copy('script', script)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-base font-bold text-slate-100 hover:bg-slate-700 transition-colors"
            >
              {copied === 'script' ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>문구 복사</span>
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
