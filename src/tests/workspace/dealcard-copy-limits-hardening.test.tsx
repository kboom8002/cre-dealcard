// @vitest-environment jsdom
/**
 * @file src/tests/workspace/dealcard-copy-limits-hardening.test.tsx
 * @description 딜카드 18자 문구 하드닝 회귀 테스트 (사용자 스크린샷 결함 2.1 · 2.2)
 *
 * 1. 결정적 교정기(copy-limits): 스크린샷 3문장 + 조사/관형어 꼬리 → ≤18자 · 말줄임 없음 · 완결 체언
 * 2. 프롬프트 하드닝: 18자 · JSON · 근거(FactBook) · 자체 검증 · few-shot · 엄격 스키마
 * 3. 편집기 ↔ 미리보기 SSOT: AI 제목이 "한 줄 제목" 입력에 들어가고, 입력 수정이 미리보기 제목에 반영
 *    + 서버에서 제목 없이 내려온 카드는 편집기 입력에 파생 제목이 미리 채워짐 (조용한 불일치 금지)
 * 4. 고객 화면/미리보기: 장점 줄에 한 줄 말줄임(truncate/line-clamp-1/nowrap/ellipsis) 클래스 금지
 */
import React, { act, useState } from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import {
  DEAL_CARD_LINE_MAX,
  countDealCardChars,
  deriveDealCardHeadline,
  endsWithDanglingParticle,
  isCompleteDealCardLine,
  normalizeDealCardCopy,
  repairDealCardLine,
  stripUngroundedNumbers,
} from '@/lib/deal-card/copy-limits';
import {
  BLIND_TEASER_USER_TEMPLATE,
  DEAL_CARD_COPY_SYSTEM,
  buildDealCardCopyPrompt,
} from '@/ai/prompts/broker-deal-card';
import { DealCardCopyStrictOutputSchema } from '@/ai/schemas/broker-deal-card';
import { DEAL_CARD_AI_SYSTEM_PROMPT } from '@/lib/deal-card/ai-copy-schema';
import { generateAiOgHeadline, type Card4Data } from '@/lib/deal-card/card4-schema';
import { Card4ConfirmCard } from '@/components/broker/deal-card/Card4ConfirmCard';
import { KakaoBubblePreview } from '@/components/broker/deal-card/KakaoBubblePreview';
import {
  DealCardLineText,
  FORBIDDEN_LINE_CLIP_CLASSES,
} from '@/components/broker/deal-card/DealCardLineText';
import DealCardsWorkspacePage from '@/app/(broker)/broker/w/dealcards/page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/broker/w/dealcards',
  useSearchParams: () => new URLSearchParams(),
}));

const SCREENSHOT_SENTENCES = [
  '8m 도로 코너 입지로 가시성이 좋습니다.',
  '신사역과 잠원역 접근이 가능한 잠원권역입니다.',
  'F&B 및 IT·디자인 오피스가 만실로 운영 중입니다.',
] as const;

const DANGLING_CASES = [
  '8m 도로 코너 입지로 가시성이',
  'F&B 및 IT·디자인 오피스가',
  '역세권 우수 입지의',
  '대로변 코너 입지로',
  '교통이 편리한',
  '전층 만실 및',
  '역세권 입지…',
  '주차 공간이 충분히 있습니다',
  '대지 약 127평 연면적 약 439평 규모의 알짜 매물',
];

function expectCompleteLine(out: string) {
  expect(out.trim().length).toBeGreaterThan(0);
  expect(countDealCardChars(out)).toBeLessThanOrEqual(DEAL_CARD_LINE_MAX);
  expect(Array.from(out.trim()).length).toBeLessThanOrEqual(18);
  expect(out).not.toMatch(/…|\.\.\./);
  expect(endsWithDanglingParticle(out)).toBe(false);
  expect(out).not.toMatch(/(?:습니다|입니다)$/);
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const baseCard4: Card4Data = {
  headline: '',
  posture: 'income',
  region: '서초구 잠원동',
  use: '근린생활시설',
  area: '연면적 420평',
  priceBand: '180~200억',
  points: [...SCREENSHOT_SENTENCES] as [string, string, string],
  provenance: { points: ['ai', 'ai', 'ai'] },
  card4_version: 1,
};

/* ════════════════════════════════════════════════════════════════════════
 * 1. 결정적 교정기
 * ════════════════════════════════════════════════════════════════════════ */
describe('1. copy-limits repair helper (2.1 root fix — no mid-word hard slicing)', () => {
  it('repairs the three screenshot sentences into complete ≤18-char noun phrases', () => {
    const outs = SCREENSHOT_SENTENCES.map((s) => repairDealCardLine(s));
    outs.forEach(expectCompleteLine);
    expect(outs[0]).toBe('8m 도로 코너 입지 가시성 우수');
    expect(outs[1]).toBe('신사·잠원역 접근 가능 잠원권역');
    expect(outs[2]).toBe('F&B·IT·디자인 오피스 만실');
    // 스크린샷의 잘린 출력과 달라야 한다
    expect(outs).not.toContain('8m 도로 코너 입지로 가시성이');
    expect(outs).not.toContain('신사역과 잠원역 접근이 가능한 잠');
    expect(outs).not.toContain('F&B 및 IT·디자인 오피스가');
  });

  it.each(DANGLING_CASES)('repairs dangling/over-length input: %s', (input) => {
    const out = repairDealCardLine(input);
    expectCompleteLine(out);
    expect(isCompleteDealCardLine(out)).toBe(true);
  });

  it('is idempotent and keeps already-valid broker copy untouched', () => {
    for (const ok of ['역세권 도보 3분 코너', '우량 임차인 전층 만실', '대로변 코너 각지 위치']) {
      expect(repairDealCardLine(ok)).toBe(ok);
    }
    for (const s of [...SCREENSHOT_SENTENCES, ...DANGLING_CASES]) {
      const once = repairDealCardLine(s);
      expect(repairDealCardLine(once)).toBe(once);
    }
  });

  it('never invents yield numbers in the derived headline (old "연 4%대" fallback removed)', () => {
    const derived = deriveDealCardHeadline({ posture: 'income', points: [...SCREENSHOT_SENTENCES] });
    expectCompleteLine(derived);
    expect(derived).not.toMatch(/%/);
    expect(generateAiOgHeadline({ posture: 'income', points: ['코너 입지', '만실 운영', '역세권'] })).not.toContain('4%');
    const withYield = deriveDealCardHeadline({ posture: 'income', points: ['연 수익률 4.2% 안정권', '우량 임차인 만실', '코너'] });
    expect(withYield).toContain('4.2%');
    expectCompleteLine(withYield);
  });

  it('strips numbers that are not grounded in the input FactBook', () => {
    const { cleaned, stripped } = stripUngroundedNumbers('연 4%대 우량임차 만실 코너', '서초구 근린 180~200억');
    expect(stripped).toContain('4');
    expect(cleaned).toBe('우량임차 만실 코너');
  });

  it('normalizeDealCardCopy fills an empty headline only when the card has content', () => {
    const filled = normalizeDealCardCopy({ ...baseCard4 }, { fillHeadline: true });
    expect(filled.headline).toBeTruthy();
    expectCompleteLine(filled.headline!);
    filled.points.forEach(expectCompleteLine);
    const empty = normalizeDealCardCopy(
      { ...baseCard4, region: '', use: '', priceBand: '', points: ['', '', ''] },
      { fillHeadline: true },
    );
    expect(empty.headline).toBe('');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 2. 프롬프트 하드닝
 * ════════════════════════════════════════════════════════════════════════ */
describe('2. deal-card copy prompt hardening (TaskFlow TF8)', () => {
  it('system prompt carries persona, taskflow steps, grounding, 18-char JSON contract, few-shot and self-check', () => {
    const p = DEAL_CARD_COPY_SYSTEM;
    expect(DEAL_CARD_AI_SYSTEM_PROMPT).toBe(p); // legacy export points at the hardened prompt
    expect(p).toContain('상업용 부동산 매각 전문 중개인');
    expect(p).toContain('18자');
    expect(p).toContain('JSON');
    expect(p).toMatch(/근거|Grounding/);
    expect(p).toContain('FactBook');
    expect(p).toMatch(/자체 검증|Self-check/);
    expect(p).toContain('[L] Logic Chain');
    expect(p).toContain('Step 5.');
    expect(p).toContain('체언');
    expect(p).toMatch(/말줄임/);
    expect(p).toContain('8m 도로 코너 입지로 가시성이 좋습니다.'); // BAD few-shot
    expect(p).toContain('신사·잠원역 더블 역세권'); // GOOD few-shot
    expect(p).toMatch(/칩/);
  });

  it('user prompt is FactBook-only and exposes a grounding context for number checks', () => {
    const built = buildDealCardCopyPrompt({
      mode: 'both',
      postureTitle: '임대수익용',
      region: '서초구 잠원동',
      use: '근린생활시설',
      priceBand: '180~200억',
      currentPoints: [...SCREENSHOT_SENTENCES],
      facts: { yieldPct: 4.2 },
    });
    expect(built.userPrompt).toContain('[K] Knowledge (FactBook');
    expect(built.userPrompt).toContain('서초구 잠원동');
    expect(built.userPrompt).toContain('수익률(%)=4.2');
    expect(built.factContext).toContain('4.2');
    expect(built.userPrompt).not.toMatch(/base64|data:image/);
  });

  it('blind-teaser (from-memo) prompt now requests 18-char card4Headline/card4Points', () => {
    expect(BLIND_TEASER_USER_TEMPLATE).toContain('card4Headline');
    expect(BLIND_TEASER_USER_TEMPLATE).toContain('card4Points');
    expect(BLIND_TEASER_USER_TEMPLATE).toContain('18자');
  });

  it('strict output schema rejects over-length, dangling and ellipsis lines', () => {
    expect(
      DealCardCopyStrictOutputSchema.safeParse({
        headline: '연 4.2% 우량임차 만실 코너',
        points: ['8m 코너 입지 높은 가시성', '신사·잠원역 더블 역세권', 'F&B·IT 오피스 만실 운영'],
      }).success,
    ).toBe(true);
    expect(DealCardCopyStrictOutputSchema.safeParse({ headline: SCREENSHOT_SENTENCES[0] }).success).toBe(false);
    expect(DealCardCopyStrictOutputSchema.safeParse({ headline: 'F&B 및 IT·디자인 오피스가' }).success).toBe(false);
    expect(DealCardCopyStrictOutputSchema.safeParse({ headline: '역세권 입지…' }).success).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 3. 편집기 ↔ 미리보기 단일 진실 원천
 * ════════════════════════════════════════════════════════════════════════ */
describe('3. editor "한 줄 제목" ↔ preview/customer title SSOT (2.2)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function Harness({ initial }: { initial: Card4Data }) {
    const [card4, setCard4] = useState<Card4Data>(initial);
    return (
      <div>
        <Card4ConfirmCard card4={card4} onChange={setCard4} />
        <KakaoBubblePreview card4={card4} />
      </div>
    );
  }

  const q = <T extends Element>(sel: string) => container.querySelector(sel) as T;

  it('AI-generated title lands in the headline input, and editing it updates the preview + customer title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        source: 'llm',
        result: { headline: '연 4.2% 우량임차 만실 코너', points: [...SCREENSHOT_SENTENCES] },
      }),
    } as Response);

    await act(async () => {
      root.render(<Harness initial={{ ...baseCard4 }} />);
    });

    // 제목이 비어 있으면 미리보기와 같은 파생 제목을 "AI 추천"으로 노출 (조용한 불일치 금지)
    const suggestion = q<HTMLElement>('[data-testid="card4-headline-suggestion-text"]');
    expect(suggestion).not.toBeNull();
    expect(q<HTMLElement>('[data-testid="kakao-bubble-og-title"]').textContent).toBe(suggestion.textContent);

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="card4-ai-headline-btn"]').click();
    });
    const headlineInput = q<HTMLInputElement>('[data-testid="card4-headline-input"]');
    expect(headlineInput.value).toBe('연 4.2% 우량임차 만실 코너');
    expect(q<HTMLElement>('[data-testid="kakao-bubble-og-title"]').textContent).toBe('연 4.2% 우량임차 만실 코너');
    expect(q<HTMLElement>('[data-testid="dealcard-preview-customer-title"]').textContent).toBe('연 4.2% 우량임차 만실 코너');
    expect(q('[data-testid="card4-headline-suggestion"]')).toBeNull();
    expect(q<HTMLElement>('[data-testid="card4-headline-counter"]').textContent).toBe('17/18');

    await act(async () => {
      setNativeInputValue(headlineInput, '우량임차 만실 코너 빌딩');
    });
    expect(headlineInput.value).toBe('우량임차 만실 코너 빌딩');
    expect(q<HTMLElement>('[data-testid="kakao-bubble-og-title"]').textContent).toBe('우량임차 만실 코너 빌딩');
    expect(q<HTMLElement>('[data-testid="dealcard-preview-customer-title"]').textContent).toBe('우량임차 만실 코너 빌딩');
  });

  it('"AI로 3줄 쓰기" repairs long AI sentences instead of chopping them; preview shows complete lines', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { points: [...SCREENSHOT_SENTENCES] } }),
    } as Response);

    await act(async () => {
      root.render(<Harness initial={{ ...baseCard4, headline: '우량임차 만실 코너', points: ['', '', ''] }} />);
    });
    await act(async () => {
      q<HTMLButtonElement>('[data-testid="card4-ai-recluster-btn"]').click();
    });

    const expected = ['8m 도로 코너 입지 가시성 우수', '신사·잠원역 접근 가능 잠원권역', 'F&B·IT·디자인 오피스 만실'];
    expected.forEach((line, idx) => {
      expect(q<HTMLInputElement>(`[data-testid="card4-point-input-${idx}"]`).value).toBe(line);
      expect(q<HTMLElement>(`[data-testid="dealcard-postit-preview-text-${idx}"]`).textContent).toBe(line);
      expect(q<HTMLElement>(`[data-testid="card4-point-counter-${idx}"]`).getAttribute('data-state')).toBe('ok');
    });
  });

  it('pasting a long sentence is repaired at word boundaries (no maxLength mid-word chop) and the counter warns while typing over', async () => {
    await act(async () => {
      root.render(<Harness initial={{ ...baseCard4, headline: '우량임차 만실 코너', points: ['', '', ''] }} />);
    });
    const input0 = q<HTMLInputElement>('[data-testid="card4-point-input-0"]');
    expect(input0.hasAttribute('maxlength')).toBe(false);

    await act(async () => {
      setNativeInputValue(input0, SCREENSHOT_SENTENCES[1]); // paste (multi-char jump)
    });
    expect(input0.value).toBe('신사·잠원역 접근 가능 잠원권역');

    // 한 글자씩 넘치게 타이핑하면 원문 유지 + 경고 카운터 + 고객 화면 교정 미리보기
    await act(async () => {
      setNativeInputValue(input0, '신사·잠원역 접근 가능 잠원권역입');
    });
    await act(async () => {
      setNativeInputValue(input0, '신사·잠원역 접근 가능 잠원권역입니');
    });
    expect(input0.value).toBe('신사·잠원역 접근 가능 잠원권역입니');
    expect(q<HTMLElement>('[data-testid="card4-point-counter-0"]').textContent).toBe('19/18');
    expect(q<HTMLElement>('[data-testid="card4-point-counter-0"]').getAttribute('data-state')).toBe('warn');
    expect(q<HTMLElement>('[data-testid="card4-point-repair-hint-0"]')).not.toBeNull();
  });

  it('workspace hydration: a server card without headline shows the derived title IN the editor input (same as preview)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/broker/workspace/summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            dealcards: [
              {
                id: 'bld-7777',
                title: '서초구 잠원동 근린생활시설',
                region: '서초구 잠원동',
                use: '근린생활시설',
                priceBand: '180~200억',
                status: 'draft',
                updatedAt: '방금',
                card4: { ...baseCard4, headline: '', card4_version: 3 },
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    });

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });

    const headlineInput = q<HTMLInputElement>('[data-testid="card4-headline-input"]');
    expect(headlineInput.value.length).toBeGreaterThan(0);
    expectCompleteLine(headlineInput.value);
    expect(q<HTMLElement>('[data-testid="kakao-bubble-og-title"]').textContent).toBe(headlineInput.value);
    expect(q('[data-testid="card4-headline-suggestion"]')).toBeNull();
    [0, 1, 2].forEach((idx) => {
      expectCompleteLine(q<HTMLInputElement>(`[data-testid="card4-point-input-${idx}"]`).value);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 4. 고객 화면 / 미리보기 줄바꿈 안전망
 * ════════════════════════════════════════════════════════════════════════ */
describe('4. customer view never single-line-truncates advantage lines', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function expectNoClipClasses(el: Element | null) {
    expect(el).not.toBeNull();
    const classes = (el as HTMLElement).className.split(/\s+/);
    for (const forbidden of FORBIDDEN_LINE_CLIP_CLASSES) {
      expect(classes).not.toContain(forbidden);
    }
    expect(classes).toContain('break-keep');
    expect(classes).toContain('whitespace-normal');
  }

  it('preview advantage lines + title render full 18-char text without clip classes', async () => {
    const eighteen = '8m 도로 코너 입지 가시성 우수';
    expect(countDealCardChars(eighteen)).toBe(18);
    await act(async () => {
      root.render(
        <KakaoBubblePreview card4={{ ...baseCard4, headline: '우량임차 만실 코너', points: [eighteen, eighteen, eighteen] }} />,
      );
    });
    [0, 1, 2].forEach((idx) => {
      const el = container.querySelector(`[data-testid="dealcard-postit-preview-text-${idx}"]`);
      expectNoClipClasses(el);
      expect(el?.textContent).toBe(eighteen);
    });
    expectNoClipClasses(container.querySelector('[data-testid="kakao-bubble-og-title"]'));
    expectNoClipClasses(container.querySelector('[data-testid="dealcard-preview-customer-title"]'));
  });

  it('shared DealCardLineText repairs instead of slicing and stays wrap-safe', async () => {
    await act(async () => {
      root.render(<DealCardLineText testId="line" text={SCREENSHOT_SENTENCES[2]} />);
    });
    const el = container.querySelector('[data-testid="line"]');
    expectNoClipClasses(el);
    expect(el?.textContent).toBe('F&B·IT·디자인 오피스 만실');
  });

  it('/dc/[id] customer page source uses the shared wrap-safe renderer and no hard 18-char slicing', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(public)/dc/[id]/page.tsx'),
      'utf8',
    );
    expect(src).toContain('DealCardLineText');
    expect(src).toContain('repairDealCardLine');
    expect(src).not.toMatch(/slice\(0,\s*18\)/);
    const pointsSection = src.slice(src.indexOf('public-dealcard-points'), src.indexOf('<TrustLine'));
    for (const forbidden of ['truncate', 'line-clamp-1', 'whitespace-nowrap', 'text-ellipsis']) {
      expect(pointsSection).not.toContain(forbidden);
    }
  });
});
