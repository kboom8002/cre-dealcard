/**
 * UnpublishedNotice — 발행되지 않은 날짜/잘못된 날짜 접근 안내 화면 (E-03 T2-UX-4).
 * notFound() 로 막다른 길을 만들지 않고, 최신호·지난 호·구독으로 이어지는 길을 제공한다.
 * 서버 컴포넌트(상호작용 없음). 페이지에서 noindex 메타데이터와 함께 사용한다.
 */
import React from 'react';
import Link from 'next/link';
import { formatKoreanDate } from '@/lib/magazine/kst';

export type UnpublishedReason = 'invalid' | 'future' | 'missing' | 'draft';

export interface UnpublishedNoticeProps {
  reason: UnpublishedReason;
  /** 정규 slug (링크용). */
  brokerSlug: string;
  /** 요청된 날짜(YYYY-MM-DD). invalid 이면 표시하지 않는다. */
  date?: string | null;
  /** 실제 최신 발행본 날짜(없으면 null → 최신호 링크 생략). */
  latestDate?: string | null;
}

export function unpublishedDescription(reason: UnpublishedReason, dateLabel: string | null): string {
  const when = dateLabel ? `${dateLabel} 호` : '요청하신 호';
  switch (reason) {
    case 'invalid':
      return '주소의 날짜 형식이 올바르지 않습니다. 아래에서 발행된 매거진을 확인해 주세요.';
    case 'future':
      return `${when}는 아직 발행일이 되지 않았습니다. 발행일 이후에 다시 확인해 주세요.`;
    case 'draft':
      return `${when}는 발행 준비 중입니다. 발행이 완료되면 열람할 수 있어요.`;
    default:
      return `${when}는 발행되지 않았거나 공개 대기 중입니다.`;
  }
}

const linkBase =
  'inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-body font-bold transition-colors';

export function UnpublishedNotice({ reason, brokerSlug, date, latestDate }: UnpublishedNoticeProps) {
  let dateLabel: string | null = null;
  if (date && reason !== 'invalid') {
    try {
      dateLabel = formatKoreanDate(date);
    } catch {
      dateLabel = null; // 표시용일 뿐 — 형식 오류 날짜는 라벨 없이 안내
    }
  }
  const slug = encodeURIComponent(brokerSlug);
  return (
    <main
      id="magazine-main"
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)' }}
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-xl">
        <div className="text-5xl" aria-hidden="true">📰</div>
        <h1 className="text-title font-bold text-white">아직 발행되지 않은 매거진입니다</h1>
        <p className="text-body leading-relaxed text-ink-muted">{unpublishedDescription(reason, dateLabel)}</p>
        <div className="space-y-2 pt-2">
          {latestDate ? (
            <Link href={`/magazine/${slug}/${latestDate}`} className={`${linkBase} bg-indigo-500 text-white hover:bg-indigo-400`}>
              가장 최근 호 보기 ({formatKoreanDate(latestDate)})
            </Link>
          ) : null}
          <Link href={`/magazine/${slug}`} className={`${linkBase} border border-white/20 bg-white/5 text-white hover:bg-white/10`}>
            지난 매거진 목록
          </Link>
          <Link href={`/magazine/${slug}/subscribe`} className={`${linkBase} border border-white/20 text-ink-muted hover:bg-white/5`}>
            다음 호 구독하기
          </Link>
        </div>
      </div>
    </main>
  );
}
