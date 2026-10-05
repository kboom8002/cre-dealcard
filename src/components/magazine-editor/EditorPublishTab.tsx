'use client';

/**
 * 발행설정 탭 (E-01/E-02): 에디션 정보(읽기 전용), 테마 컬러, 매거진 제목, 발송 대상(세그먼트),
 * 설문(판매자 의도 포함), 세무·법률 클리닉, 섹션 순서/on-off, 원페이지 이미지.
 * 저장/발행 버튼은 여기에 두지 않는다 — 에디터 하단의 단일 sticky 버튼 세트만 사용(U2-23).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { editorToast } from './editor-toaster';
import { BarChart3, BookOpen, ChevronRight, Info, Lightbulb, Link2, Newspaper, Palette, Target } from 'lucide-react';
import {
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  TARGET_SEGMENTS,
  type PollOptionForm,
  type TargetSegment,
} from '@/lib/magazine/edition-save';

export const SECTION_LABELS: Record<string, string> = {
  ai_briefing: '🤖 AI 브리핑',
  field_note: '🏗️ 필드노트',
  theme_of_week: '🎯 주간 테마',
  featured_deals: '🏢 추천 매물',
  poll: '📊 투표',
  market_data: '📈 시장 데이터',
  news_curation: '📰 뉴스',
  tax_clinic: '💰 세무 클리닉',
  auction_picks: '⚖️ 경매',
  sentiment_index: '🌡️ 심리지수',
  roi_calculator: '🧮 수지분석 계산기',
  referral: '🎁 추천 레퍼럴',
};

const POLL_PLACEHOLDERS = ['저평가 — 매수 타이밍', '적정가 — 관망', '고평가 — 조정 필요', '기타 의견'];

interface EditorPublishTabProps {
  editionLabel: string;
  editionTypeLabel: string;
  statusBadge: ReactNode;
  brokerSlug: string;
  isPublished: boolean;
  /** 발행 후에만 이미지 내보내기 가능 */
  issueDate: string;

  themeColor: string;
  setThemeColor: (v: string) => void;
  magazineTitle: string;
  setMagazineTitle: (v: string) => void;

  targetSegment: TargetSegment;
  setTargetSegment: (v: TargetSegment) => void;

  pollQuestion: string;
  setPollQuestion: (v: string) => void;
  pollOptions: PollOptionForm[];
  setPollOptions: (v: PollOptionForm[]) => void;

  taxQuestion: string;
  setTaxQuestion: (v: string) => void;
  taxAnswer: string;
  setTaxAnswer: (v: string) => void;
  taxSource: string;
  setTaxSource: (v: string) => void;

  sectionOrder: string[];
  setSectionOrder: (v: string[]) => void;
  sectionsEnabled: Record<string, boolean>;
  setSectionsEnabled: (v: Record<string, boolean>) => void;
}

const CARD = 'space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl';

export function EditorPublishTab(p: EditorPublishTabProps) {
  const pollOpen = p.pollQuestion.trim().length > 0;

  const setOption = (idx: number, patch: Partial<PollOptionForm>) => {
    const next = p.pollOptions.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    p.setPollOptions(next);
  };

  return (
    <div className="space-y-5">
      {/* 에디션 정보 (읽기 전용: 상태는 저장/발행으로만 바뀜) */}
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-bold text-slate-200">에디션 정보</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-caption text-ink-subtle">에디션 타입</span>
            <span className="text-caption text-white bg-slate-800 px-2 py-0.5 rounded">{p.editionTypeLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-ink-subtle">에디션 라벨</span>
            <span className="text-caption text-white font-mono bg-slate-800 px-2 py-0.5 rounded">{p.editionLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-ink-subtle">상태</span>
            {p.statusBadge}
          </div>
          <p className="text-caption text-ink-subtle">
            {p.isPublished
              ? '발행된 호수입니다. 내용을 고친 뒤 하단의 "정정 발행"을 누르면 공개 페이지가 갱신됩니다.'
              : '상태는 저장·발행에 따라 자동으로 바뀝니다. 하단의 "발행하기"로 공개합니다.'}
          </p>
        </div>
      </div>

      {/* 테마 컬러 */}
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Palette className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold text-slate-200">테마 컬러</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="테마 컬러 선택"
            value={p.themeColor}
            onChange={(e) => p.setThemeColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent"
          />
          <div>
            <p className="text-caption text-white font-mono">{p.themeColor}</p>
            <p className="text-caption text-ink-subtle">매거진 강조 컬러를 설정합니다</p>
          </div>
        </div>
        <div className="flex gap-2">
          {['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'].map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`테마 컬러 ${color}`}
              onClick={() => p.setThemeColor(color)}
              aria-pressed={p.themeColor === color}
              className="inline-flex min-h-11 min-w-11 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={`block w-7 h-7 rounded-full border-2 transition-all ${
                  p.themeColor === color ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* 화이트라벨 매거진 설정 */}
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold text-slate-200">매거진 설정</span>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="editor-slug" className="text-caption text-slate-400 block">
              매거진 주소 (Slug)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-caption text-ink-subtle">credeal.net/magazine/</span>
              <input
                id="editor-slug"
                type="text"
                value={p.brokerSlug}
                readOnly
                aria-readonly="true"
                className="flex-1 min-h-11 bg-slate-900/60 border border-slate-700 text-xs text-slate-300 p-1.5 rounded cursor-not-allowed focus:outline-none"
              />
            </div>
            <p className="text-caption text-ink-subtle">주소는 구독자 링크에 쓰이므로 여기서 바꿀 수 없습니다.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="editor-magazine-title" className="text-caption text-slate-400 block">
              매거진 제목
            </label>
            <input
              id="editor-magazine-title"
              type="text"
              value={p.magazineTitle}
              onChange={(e) => p.setMagazineTitle(e.target.value)}
              placeholder="예: 김성공 중개사의 부동산 인사이트"
              className="w-full min-h-11 bg-slate-900 border border-slate-700 text-xs text-white p-1.5 rounded focus:outline-none focus:border-indigo-500"
            />
            <p className="text-caption text-ink-subtle">제목은 발행할 때 프로필에 함께 저장됩니다.</p>
          </div>
        </div>
      </div>

      {/* 발송 대상 */}
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold text-slate-200">발송 대상</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="발송 대상">
          {TARGET_SEGMENTS.map((seg) => {
            const active = p.targetSegment === seg.value;
            return (
              <button
                key={seg.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => p.setTargetSegment(seg.value)}
                className={`min-h-11 text-caption font-bold px-3 py-1.5 rounded-lg border transition-all ${
                  active
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-900/60 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {seg.label}
              </button>
            );
          })}
        </div>
        <p className="text-caption text-ink-subtle">
          {TARGET_SEGMENTS.find((s) => s.value === p.targetSegment)?.help} 발행 시 이 대상이 발송 요청에 그대로 전달됩니다.
        </p>
      </div>

      {/* 설문 */}
      <div className="space-y-3 p-4 bg-violet-950/20 border border-violet-500/20 rounded-xl">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-bold text-violet-300">1-Click 투표 (선택)</span>
        </div>
        <p className="text-caption text-violet-200/80">
          질문과 선택지를 {MIN_POLL_OPTIONS}개 이상 채우면 투표가 게시됩니다. 비워 두면 투표 섹션이 나타나지 않습니다.
        </p>
        <label htmlFor="editor-poll-question" className="sr-only">
          투표 질문
        </label>
        <input
          id="editor-poll-question"
          type="text"
          value={p.pollQuestion}
          onChange={(e) => p.setPollQuestion(e.target.value)}
          placeholder="예: 현재 강남 꼬마빌딩 평당 1.2억, 적정하다고 보십니까?"
          className="w-full min-h-11 bg-violet-950/30 border border-violet-500/20 rounded-lg px-3 py-2 text-xs text-white placeholder-violet-300/60 focus:outline-none focus:border-violet-500/40"
        />
        {pollOpen && (
          <div className="space-y-1.5">
            {p.pollOptions.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-caption text-violet-300/80 w-4">{idx + 1}.</span>
                <input
                  type="text"
                  aria-label={`선택지 ${idx + 1}`}
                  value={opt.label}
                  onChange={(e) => setOption(idx, { label: e.target.value })}
                  placeholder={POLL_PLACEHOLDERS[idx] ?? '선택지'}
                  className="flex-1 min-w-0 min-h-11 bg-violet-950/20 border border-violet-500/15 rounded px-2.5 py-1.5 text-caption text-white placeholder-violet-300/60 focus:outline-none focus:border-violet-500/30"
                />
                <label className="flex min-h-11 items-center gap-1 text-caption text-violet-200/80 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={opt.intent === 'seller'}
                    onChange={(e) => setOption(idx, { intent: e.target.checked ? 'seller' : undefined })}
                    className="h-3.5 w-3.5"
                  />
                  판매자 의도
                </label>
                {p.pollOptions.length > MIN_POLL_OPTIONS && (
                  <button
                    type="button"
                    aria-label={`선택지 ${idx + 1} 삭제`}
                    onClick={() => p.setPollOptions(p.pollOptions.filter((_, i) => i !== idx))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-caption text-violet-300/80 hover:text-white px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {p.pollOptions.length < MAX_POLL_OPTIONS && (
              <button
                type="button"
                onClick={() => p.setPollOptions([...p.pollOptions, { label: '' }])}
                className="inline-flex min-h-11 items-center text-caption font-semibold text-violet-300 hover:text-white"
              >
                + 선택지 추가
              </button>
            )}
            <p className="text-caption text-violet-200/80">
              &quot;판매자 의도&quot;를 체크한 선택지를 고른 독자는 매도 관심 구독자로 분류됩니다.
            </p>
          </div>
        )}
      </div>

      {/* 세무/법률 클리닉 */}
      <div className="space-y-3 p-4 bg-amber-950/15 border border-amber-500/15 rounded-xl">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-bold text-amber-300">💰 세무·법률 클리닉 (선택)</span>
        </div>
        <p className="text-caption text-amber-200/80">
          질문과 답변을 모두 채우면 1문1답이 게시됩니다. 비워 두면 섹션이 나타나지 않습니다.
        </p>
        <label htmlFor="editor-tax-question" className="sr-only">
          세무·법률 질문
        </label>
        <input
          id="editor-tax-question"
          type="text"
          value={p.taxQuestion}
          onChange={(e) => p.setTaxQuestion(e.target.value)}
          placeholder="Q. 법인 취득세 중과 범위는 어디까지인가요?"
          className="w-full min-h-11 bg-amber-950/20 border border-amber-500/15 rounded-lg px-3 py-2 text-xs text-white placeholder-amber-300/60 focus:outline-none focus:border-amber-500/30"
        />
        {p.taxQuestion.trim() && (
          <>
            <label htmlFor="editor-tax-answer" className="sr-only">
              세무·법률 답변
            </label>
            <textarea
              id="editor-tax-answer"
              value={p.taxAnswer}
              onChange={(e) => p.setTaxAnswer(e.target.value)}
              placeholder="A. 답변을 입력하세요. 근거 조문이나 출처를 함께 적으면 신뢰도가 올라갑니다."
              rows={3}
              className="w-full bg-amber-950/20 border border-amber-500/15 rounded-lg px-3 py-2 text-xs text-white placeholder-amber-300/60 focus:outline-none focus:border-amber-500/30"
            />
            <input
              type="text"
              aria-label="출처"
              value={p.taxSource}
              onChange={(e) => p.setTaxSource(e.target.value)}
              placeholder="출처: 지방세법 제13조의2 (선택)"
              className="w-full min-h-11 bg-amber-950/10 border border-amber-500/10 rounded px-3 py-1.5 text-caption text-slate-400 placeholder-amber-300/60 focus:outline-none"
            />
          </>
        )}
      </div>

      {/* 섹션 순서 + on/off */}
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold text-slate-200">섹션 순서·노출</span>
        </div>
        <p className="text-caption text-ink-subtle">
          노출 순서를 바꾸고, 체크를 끄면 해당 섹션이 매거진에서 숨겨집니다.
        </p>
        <div className="space-y-1">
          {p.sectionOrder.map((sec, idx) => {
            const enabled = p.sectionsEnabled[sec] !== false;
            return (
              <div key={sec} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-1.5">
                <span className="text-caption text-ink-subtle w-4">{idx + 1}</span>
                <label className="flex flex-1 min-h-11 items-center gap-2 text-caption text-slate-300">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => p.setSectionsEnabled({ ...p.sectionsEnabled, [sec]: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                  <span className={enabled ? '' : 'line-through opacity-50'}>{SECTION_LABELS[sec] || sec}</span>
                </label>
                <button
                  type="button"
                  aria-label={`${SECTION_LABELS[sec] || sec} 위로`}
                  onClick={() => {
                    if (idx === 0) return;
                    const next = [...p.sectionOrder];
                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                    p.setSectionOrder(next);
                  }}
                  disabled={idx === 0}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-caption text-ink-subtle hover:text-white disabled:opacity-20 px-1"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`${SECTION_LABELS[sec] || sec} 아래로`}
                  onClick={() => {
                    if (idx === p.sectionOrder.length - 1) return;
                    const next = [...p.sectionOrder];
                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                    p.setSectionOrder(next);
                  }}
                  disabled={idx === p.sectionOrder.length - 1}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-caption text-ink-subtle hover:text-white disabled:opacity-20 px-1"
                >
                  ▼
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 원페이지 이미지 */}
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-bold text-slate-200">원페이지 이미지 (1080x1920)</span>
          </div>
          <span className="text-caption bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
            카톡/스토리 최적화
          </span>
        </div>
        <p className="text-caption text-slate-400">
          링크 클릭 없이 메신저에서 바로 읽을 수 있는 요약 이미지입니다. 발행한 뒤에 만들 수 있습니다.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!p.isPublished}
            onClick={async () => {
              const imgUrl = `/api/magazine/${p.brokerSlug}/${p.issueDate}/image?format=story`;
              try {
                editorToast.info('이미지 생성 및 다운로드 중...');
                const res = await fetch(imgUrl);
                if (!res.ok) throw new Error(`image ${res.status}`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `CRE-Magazine-${p.brokerSlug}-${p.issueDate}.png`;
                a.click();
                URL.revokeObjectURL(url);
                editorToast.success('원페이지 이미지가 다운로드되었습니다!');
              } catch {
                editorToast.error('이미지 다운로드에 실패했습니다.');
              }
            }}
            className="flex-1 flex min-h-11 items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 text-xs font-bold transition-all disabled:opacity-40"
          >
            ⬇️ 이미지 다운로드
          </button>
          <button
            type="button"
            disabled={!p.isPublished}
            onClick={() => {
              const imgUrl = `${window.location.origin}/api/magazine/${p.brokerSlug}/${p.issueDate}/image?format=story`;
              navigator.clipboard.writeText(imgUrl).then(
                () => editorToast.success('이미지 URL이 복사되었습니다.'),
                () => editorToast.error('복사하지 못했습니다.'),
              );
            }}
            className="min-h-11 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-all disabled:opacity-40"
          >
            🔗 URL 복사
          </button>
        </div>
      </div>

      {/* 에디션 아카이브 링크 */}
      <Link
        href={`/magazine/${p.brokerSlug}`}
        className="flex min-h-11 items-center justify-center gap-2 text-caption font-semibold px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all"
      >
        <BookOpen className="w-3.5 h-3.5" />
        지난 에디션 보기
        <ChevronRight className="w-3 h-3 opacity-50" />
      </Link>
    </div>
  );
}
