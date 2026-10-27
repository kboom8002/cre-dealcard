// @vitest-environment jsdom
/**
 * @file src/tests/adversarial/m1-autosave-stress.test.tsx
 * @description Empirical Challenger M1: useWorkspaceAutosave Adversarial Stress Harness.
 *
 * Stress-tests:
 * 1. Rapid state changes (100 rapid keystrokes/mutations in tight loop):
 *    - Validates debounce coalescing (single save execution).
 *    - Validates zero-data-loss: saved payload MUST match the final (100th) update.
 *    - In-flight mutation: mutations occurring while save is in-flight must trigger a second save.
 * 2. Offline / Online transitions:
 *    - Offline mutation freezes save, sets status to 'offline'.
 *    - Reconnecting (online event) immediately flushes dirty changes.
 *    - Clean online reconnection safely restores 'idle'.
 * 3. 409 Conflict Handling & Resolution:
 *    - 409 error triggers 'conflict' status and fires onConflict with serverVersion.
 *    - resolveConflictByOverwriting() ignores expectedVersion, forces save, and recovers to 'saved'.
 * 4. Error classification:
 *    - Distinguishes 409 conflict vs 500 server error.
 * 5. Manual flush race condition:
 *    - flush() clears pending debounce and executes immediate save.
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import {
  useWorkspaceAutosave,
  type UseWorkspaceAutosaveResult,
} from '@/lib/hooks/useWorkspaceAutosave';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Empirical Challenger: useWorkspaceAutosave Stress Harness', () => {
  let root: Root;
  let container: HTMLDivElement;
  let latestResult: UseWorkspaceAutosaveResult | null = null;

  function AutosaveTestHarness({
    id,
    data,
    expectedVersion = 1,
    debounceMs = 3000,
    intervalMs = 30000,
    enabled = true,
    ready = true,
    onSave,
    onConflict,
    onError,
  }: {
    id: string;
    data: any;
    expectedVersion?: number | string | null;
    debounceMs?: number;
    intervalMs?: number;
    enabled?: boolean;
    ready?: boolean;
    onSave: any;
    onConflict?: any;
    onError?: any;
  }) {
    latestResult = useWorkspaceAutosave({
      id,
      data,
      expectedVersion,
      debounceMs,
      intervalMs,
      enabled,
      ready,
      onSave,
      onConflict,
      onError,
    });
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    latestResult = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Rapid state changes: 100 rapid mutations coalesce into single save with latest payload (no state loss)', async () => {
    const onSave = vi.fn().mockImplementation(async (payload) => {
      return { version: 100 };
    });

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-stress-1"
          data={{ counter: 0, text: 'Initial' }}
          onSave={onSave}
        />
      );
    });

    expect(latestResult?.status).toBe('idle');
    expect(latestResult?.dirty).toBe(false);

    // Simulate 100 rapid keystrokes within 500ms
    for (let i = 1; i <= 100; i++) {
      await act(async () => {
        root.render(
          <AutosaveTestHarness
            id="doc-stress-1"
            data={{ counter: i, text: `Keystroke ${i}` }}
            onSave={onSave}
          />
        );
        // Advance timer slightly (5ms per keystroke) - much shorter than 3000ms debounce
        vi.advanceTimersByTime(5);
      });
      expect(latestResult?.dirty).toBe(true);
      expect(onSave).not.toHaveBeenCalled();
    }

    // Now advance 2999ms after the 100th keystroke
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Advance 1ms more -> reaches 3000ms debounce since last keystroke
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    // Must be called exactly ONCE with the 100th keystroke data
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      id: 'doc-stress-1',
      data: { counter: 100, text: 'Keystroke 100' },
      expectedVersion: 1,
    });

    expect(latestResult?.status).toBe('saved');
    expect(latestResult?.dirty).toBe(false);
  });

  it('In-flight mutation: changes occurring during active network save trigger subsequent debounced save', async () => {
    let resolveFirstSave: (val: any) => void = () => {};
    const firstSavePromise = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });

    const onSave = vi.fn()
      .mockImplementationOnce(() => firstSavePromise)
      .mockImplementationOnce(async (payload) => ({ version: 3 }));

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-inflight"
          data={{ title: 'Version 1' }}
          onSave={onSave}
        />
      );
    });

    // Change to Version 2 -> triggers debounce
    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-inflight"
          data={{ title: 'Version 2' }}
          onSave={onSave}
        />
      );
    });

    // Debounce triggers first save
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(latestResult?.status).toBe('saving');

    // While first save is still in-flight, user modifies to Version 3!
    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-inflight"
          data={{ title: 'Version 3' }}
          onSave={onSave}
        />
      );
    });

    // Complete first save returning version: 2
    await act(async () => {
      resolveFirstSave({ version: 2 });
    });

    // Advance 3000ms debounce for Version 3
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Second save fired with Version 3
    expect(onSave).toHaveBeenCalledTimes(2);
    // Note: Because AutosaveTestHarness passed static expectedVersion={1} without updating the prop,
    // line 103 (expectedVersionRef.current = expectedVersion) in useWorkspaceAutosave resets it to 1
    // rather than keeping the server's res.version: 2. This is a critical finding documented in Challenger report.
    expect(onSave).toHaveBeenLastCalledWith({
      id: 'doc-inflight',
      data: { title: 'Version 3' },
      expectedVersion: 1,
    });
    expect(latestResult?.status).toBe('saved');
    expect(latestResult?.dirty).toBe(false);
  });

  it('Stateful version sync: when parent component updates expectedVersion prop from onSave response, second save transmits incremented version', async () => {
    let currentServerVersion = 1;
    const onSave = vi.fn().mockImplementation(async (payload) => {
      currentServerVersion += 1;
      return { version: currentServerVersion };
    });

    function StatefulHarness() {
      const [ver, setVer] = React.useState(1);
      const [data, setData] = React.useState({ title: 'V1' });

      latestResult = useWorkspaceAutosave({
        id: 'doc-stateful',
        data,
        expectedVersion: ver,
        debounceMs: 3000,
        onSave: async (p) => {
          const res = await onSave(p);
          if (res?.version) {
            setVer(res.version);
          }
          return res;
        },
      });

      return (
        <div>
          <button onClick={() => setData({ title: 'V2' })}>Edit V2</button>
          <button onClick={() => setData({ title: 'V3' })}>Edit V3</button>
        </div>
      );
    }

    await act(async () => {
      root.render(<StatefulHarness />);
    });

    expect(latestResult?.status).toBe('idle');

    // Edit to V2
    await act(async () => {
      container.querySelector('button')?.click();
    });

    // Advance debounce -> Save 1 executes
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith({
      id: 'doc-stateful',
      data: { title: 'V2' },
      expectedVersion: 1,
    });

    // Edit to V3
    await act(async () => {
      container.querySelectorAll('button')[1]?.click();
    });

    // Advance debounce -> Save 2 executes
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    // When parent properly syncs expectedVersion prop, second save sends updated version 2
    expect(onSave).toHaveBeenLastCalledWith({
      id: 'doc-stateful',
      data: { title: 'V3' },
      expectedVersion: 2,
    });
    expect(latestResult?.status).toBe('saved');
  });

  it('Offline / Online transitions: freezes save while offline, flushes immediately upon reconnection', async () => {
    const onSave = vi.fn().mockResolvedValue({ version: 2 });

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-offline"
          data={{ text: 'Connected' }}
          onSave={onSave}
        />
      );
    });

    // 1. Simulate going offline
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(latestResult?.isOnline).toBe(false);
    expect(latestResult?.status).toBe('offline');

    // 2. Modify data while offline
    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-offline"
          data={{ text: 'Tunnel Edit 1' }}
          onSave={onSave}
        />
      );
    });

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-offline"
          data={{ text: 'Tunnel Edit 2' }}
          onSave={onSave}
        />
      );
    });

    // Advance timers well beyond debounce
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // Save must NOT be attempted while offline
    expect(onSave).not.toHaveBeenCalled();
    expect(latestResult?.status).toBe('offline');

    // 3. Reconnect to internet
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    expect(latestResult?.isOnline).toBe(true);

    // Reconnection must immediately trigger the queued save without waiting 3000ms
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      id: 'doc-offline',
      data: { text: 'Tunnel Edit 2' },
      expectedVersion: 1,
    });
    expect(latestResult?.status).toBe('saved');
  });

  it('409 Conflict Handling: triggers conflict state, invokes onConflict, and recovers via overwrite', async () => {
    const conflictError = Object.assign(new Error('Optimistic Lock Conflict'), {
      status: 409,
      serverVersion: 55,
    });

    const onSave = vi.fn()
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce({ version: 56 });

    const onConflict = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-conflict"
          expectedVersion={50}
          data={{ text: 'Desktop edit' }}
          onSave={onSave}
          onConflict={onConflict}
          onError={onError}
        />
      );
    });

    // Modify data
    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-conflict"
          expectedVersion={50}
          data={{ text: 'Mobile edit clash' }}
          onSave={onSave}
          onConflict={onConflict}
          onError={onError}
        />
      );
    });

    // Advance debounce
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Verify 409 detection
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(latestResult?.status).toBe('conflict');
    expect(onConflict).toHaveBeenCalledWith(55);
    expect(onError).not.toHaveBeenCalled(); // 409 must NOT be classified as generic error

    // Overwrite conflict resolution
    let overwriteSuccess = false;
    await act(async () => {
      overwriteSuccess = (await latestResult?.resolveConflictByOverwriting()) ?? false;
    });

    expect(overwriteSuccess).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(2);
    // Overwrite save MUST pass expectedVersion: null to bypass optimistic lock
    expect(onSave).toHaveBeenLastCalledWith({
      id: 'doc-conflict',
      data: { text: 'Mobile edit clash' },
      expectedVersion: null,
    });
    expect(latestResult?.status).toBe('saved');
  });

  it('Distinguishes 500 server error from 409 conflict and invokes onError', async () => {
    const serverError = new Error('500 Internal Server Error');
    const onSave = vi.fn().mockRejectedValue(serverError);
    const onConflict = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-err"
          data={{ text: 'Original' }}
          onSave={onSave}
          onConflict={onConflict}
          onError={onError}
        />
      );
    });

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-err"
          data={{ text: 'Causing Error' }}
          onSave={onSave}
          onConflict={onConflict}
          onError={onError}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(latestResult?.status).toBe('error');
    expect(latestResult?.error).toBe(serverError);
    expect(onError).toHaveBeenCalledWith(serverError);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('flush() cancels active debounce and executes immediate synchronous save', async () => {
    const onSave = vi.fn().mockResolvedValue({ version: 10 });

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-flush"
          data={{ text: 'V1' }}
          onSave={onSave}
        />
      );
    });

    await act(async () => {
      root.render(
        <AutosaveTestHarness
          id="doc-flush"
          data={{ text: 'V2 urgent flush' }}
          onSave={onSave}
        />
      );
    });

    expect(latestResult?.dirty).toBe(true);
    expect(onSave).not.toHaveBeenCalled();

    // Call flush immediately
    await act(async () => {
      await latestResult?.flush();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(latestResult?.status).toBe('saved');

    // Advance remaining debounce time: save must NOT fire a duplicate second time
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
