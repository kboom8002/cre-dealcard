// @vitest-environment jsdom
/**
 * @file src/tests/foundations/autosave-jobtray.test.tsx
 * @description P0.5 Foundation Verification for useWorkspaceAutosave & GlobalJobTray:
 * 1. Autosave: 3s debounce, optimistic expectedVersion, 409 conflict, offline queue, flush().
 * 2. GlobalJobTray: Job stages, progress bar, cancel trigger, senior-friendly styling.
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useWorkspaceAutosave, type UseWorkspaceAutosaveResult } from '@/lib/hooks/useWorkspaceAutosave';
import { GlobalJobTray, type WorkspaceJob } from '@/components/workspace/GlobalJobTray';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('WP-P05-05: useWorkspaceAutosave Hook', () => {
  let root: Root;
  let container: HTMLDivElement;
  let latestResult: UseWorkspaceAutosaveResult | null = null;

  function AutosaveHarness({
    id,
    data,
    expectedVersion = 1,
    onSave,
    onConflict,
  }: {
    id: string;
    data: { title: string };
    expectedVersion?: number | string | null;
    onSave: any;
    onConflict?: any;
  }) {
    latestResult = useWorkspaceAutosave({
      id,
      data,
      expectedVersion,
      debounceMs: 3000,
      onSave,
      onConflict,
    });
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    latestResult = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes in idle state and saves after 3000ms debounce on data change', async () => {
    const onSave = vi.fn().mockResolvedValue({ version: 2 });

    await act(async () => {
      root.render(<AutosaveHarness id="draft-1" data={{ title: 'First' }} onSave={onSave} />);
    });

    expect(latestResult?.status).toBe('idle');
    expect(latestResult?.dirty).toBe(false);

    // Update data
    await act(async () => {
      root.render(<AutosaveHarness id="draft-1" data={{ title: 'Updated' }} onSave={onSave} />);
    });

    expect(latestResult?.status).toBe('dirty');
    expect(latestResult?.dirty).toBe(true);
    expect(onSave).not.toHaveBeenCalled();

    // Advance 2999ms
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Advance 1ms more (reaches 3000ms debounce)
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(onSave).toHaveBeenCalledWith({
      id: 'draft-1',
      data: { title: 'Updated' },
      expectedVersion: 1,
    });
  });

  it('supports immediate manual flush() without waiting for debounce', async () => {
    const onSave = vi.fn().mockResolvedValue({ version: 2 });

    await act(async () => {
      root.render(<AutosaveHarness id="draft-2" data={{ title: 'Initial' }} onSave={onSave} />);
    });

    await act(async () => {
      root.render(<AutosaveHarness id="draft-2" data={{ title: 'Needs Instant Save' }} onSave={onSave} />);
    });

    expect(latestResult?.dirty).toBe(true);

    let success = false;
    await act(async () => {
      success = (await latestResult?.flush()) ?? false;
    });

    expect(success).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(latestResult?.status).toBe('saved');
    expect(latestResult?.dirty).toBe(false);
  });

  it('handles 409 conflict and invokes onConflict callback', async () => {
    const conflictError = Object.assign(new Error('Conflict'), { status: 409, serverVersion: 10 });
    const onSave = vi.fn().mockRejectedValue(conflictError);
    const onConflict = vi.fn();

    await act(async () => {
      root.render(
        <AutosaveHarness
          id="draft-conflict"
          data={{ title: 'Base' }}
          onSave={onSave}
          onConflict={onConflict}
        />
      );
    });

    await act(async () => {
      root.render(
        <AutosaveHarness
          id="draft-conflict"
          data={{ title: 'Conflicted Change' }}
          onSave={onSave}
          onConflict={onConflict}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalled();
    expect(latestResult?.status).toBe('conflict');
    expect(onConflict).toHaveBeenCalledWith(10);
  });

  it('marks clean on markClean()', async () => {
    const onSave = vi.fn().mockResolvedValue({});

    await act(async () => {
      root.render(<AutosaveHarness id="draft-clean" data={{ title: 'V1' }} onSave={onSave} />);
    });

    await act(async () => {
      root.render(<AutosaveHarness id="draft-clean" data={{ title: 'V2' }} onSave={onSave} />);
    });

    expect(latestResult?.dirty).toBe(true);

    act(() => {
      latestResult?.markClean();
    });

    expect(latestResult?.dirty).toBe(false);
    expect(latestResult?.status).toBe('saved');
  });
});

describe('WP-P05-07: GlobalJobTray Component', () => {
  let root: Root;
  let container: HTMLDivElement;

  const sampleJob: WorkspaceJob = {
    id: 'job-999',
    title: '양평동 5가 Basic IM 생성',
    status: 'running',
    stage: '공적장부(토지/건축물대장) 분석 중',
    progress: 45,
    stages: [
      { id: '1', label: '공적장부 불러오기', status: 'completed' },
      { id: '2', label: '공적장부 분석 중', status: 'in_progress' },
      { id: '3', label: '렌트롤 및 수익률 산출', status: 'pending' },
    ],
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders active job title, status badge, and progress percentage', async () => {
    await act(async () => {
      root.render(<GlobalJobTray activeJob={sampleJob} defaultExpanded={true} />);
    });

    expect(container.textContent).toContain('양평동 5가 Basic IM 생성');
    expect(container.textContent).toContain('⏳ 만드는 중');
    expect(container.textContent).toContain('45%');
    expect(container.textContent).toContain('공적장부(토지/건축물대장) 분석 중');
    expect(container.textContent).toContain('공적장부 불러오기');
  });

  it('renders cancel button and triggers onCancel when clicked', async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(<GlobalJobTray activeJob={sampleJob} onCancel={onCancel} defaultExpanded={true} />);
    });

    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('작업 멈추기')
    ) as HTMLButtonElement | undefined;
    expect(cancelBtn).toBeDefined();
    expect(cancelBtn?.textContent).toContain('작업 멈추기');

    await act(async () => {
      cancelBtn?.click();
    });

    expect(onCancel).toHaveBeenCalledWith('job-999');
  });

  it('renders completed job state and result open button', async () => {
    const completedJob: WorkspaceJob = {
      id: 'job-done',
      title: '테헤란로 빌딩 IM 완성',
      status: 'completed',
      progress: 100,
      resultUrl: '/broker/buildings/123/im',
    };

    const onOpenResult = vi.fn();

    await act(async () => {
      root.render(
        <GlobalJobTray
          activeJob={completedJob}
          onOpenResult={onOpenResult}
          defaultExpanded={true}
        />
      );
    });

    expect(container.textContent).toContain('✓ 완성됨');
    const openBtn = container.querySelector('button.bg-blue-700') as HTMLButtonElement | null;
    expect(openBtn).not.toBeNull();
    expect(openBtn?.textContent).toContain('결과 열기 →');

    await act(async () => {
      openBtn?.click();
    });

    expect(onOpenResult).toHaveBeenCalledWith('job-done', '/broker/buildings/123/im');
  });
});
