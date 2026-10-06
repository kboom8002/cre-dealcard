// @vitest-environment jsdom
/**
 * useEditionAutosave — 저장 실패 후 복구 (골든 Part1 9-5 / 9-5b 회귀)
 *  - 실패 → 내용을 저장본과 같게 되돌리면 '저장 실패' 가 풀린다(무한 루프 없이)
 *  - 실패 → 다시 시도 성공 → '저장됨'
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useEditionAutosave, type UseEditionAutosaveResult } from '@/components/magazine-editor/useEditionAutosave';
import { AUTOSAVE_DEBOUNCE_MS } from '@/lib/magazine/edition-save';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latest: UseEditionAutosaveResult | null = null;
let renders = 0;

function Harness({ signature }: { signature: string }) {
  renders += 1;
  latest = useEditionAutosave({
    editionId: 'ed-1',
    ready: true,
    enabled: true,
    signature,
    getPayload: () => ({}) as never,
    initialUpdatedAt: '2026-01-01T00:00:00Z',
  });
  return null;
}

describe('useEditionAutosave — 실패 복구', () => {
  let root: Root;
  let el: HTMLElement;
  let patchResults: Array<{ ok: boolean; status: number }>;
  let patchCalls: number;

  beforeEach(() => {
    vi.useFakeTimers();
    latest = null;
    renders = 0;
    patchCalls = 0;
    patchResults = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        patchCalls += 1;
        const r = patchResults.shift() ?? { ok: true, status: 200 };
        return {
          ok: r.ok,
          status: r.status,
          json: async () => (r.ok ? { edition: { updated_at: `2026-01-01T00:00:0${patchCalls}Z` } } : { error: { code: 'internal' } }),
        } as unknown as Response;
      }),
    );
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });

  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function render(sig: string) {
    await act(async () => {
      root.render(React.createElement(Harness, { signature: sig }));
    });
  }
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('실패 후 되돌려도 error 는 유지(다시 시도 버튼 유지) — 재시도하면 요청 없이 풀린다', async () => {
    await render('A'); // 기준선
    patchResults.push({ ok: false, status: 500 });
    await render('B');
    await advance(AUTOSAVE_DEBOUNCE_MS + 50);
    expect(latest?.status).toBe('error');
    expect(patchCalls).toBe(1);

    const before = renders;
    await render('A'); // 저장본과 같게 되돌림
    expect(latest?.status).toBe('error'); // 골든: 다시 시도 버튼이 남아 있어야 한다
    await advance(100);
    expect(renders - before).toBeLessThan(8); // 무한 렌더 루프 없음
    await act(async () => {
      await latest!.saveNow();
    });
    expect(latest?.status).toBe('saved');
    expect(latest?.errorKind).toBeNull();
    expect(latest?.errorMessage).toBeNull();
    expect(patchCalls).toBe(1);
  });

  it('변경 직후(dirty) 저장본과 같게 되돌리면 dirty 가 풀린다', async () => {
    await render('A');
    await render('B');
    expect(latest?.status).toBe('dirty');
    await render('A');
    expect(latest?.status).toBe('saved');
    expect(patchCalls).toBe(0);
  });

  it('실패 후 다시 시도하면 저장되고 saved 가 된다', async () => {
    await render('A');
    patchResults.push({ ok: false, status: 500 });
    await render('B');
    await advance(AUTOSAVE_DEBOUNCE_MS + 50);
    expect(latest?.status).toBe('error');

    await act(async () => {
      await latest!.saveNow();
    });
    expect(patchCalls).toBe(2);
    expect(latest?.status).toBe('saved');
    expect(latest?.errorKind).toBeNull();
  });

  it('되돌린 뒤 error 상태에서 다시 시도해도 저장 요청 없이 saved', async () => {
    await render('A');
    patchResults.push({ ok: false, status: 500 });
    await render('B');
    await advance(AUTOSAVE_DEBOUNCE_MS + 50);
    expect(latest?.status).toBe('error');
    await render('A');
    await act(async () => {
      await latest!.saveNow();
    });
    expect(patchCalls).toBe(1);
    expect(latest?.status).toBe('saved');
  });
});
