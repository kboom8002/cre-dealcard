// @vitest-environment jsdom
/**
 * Wave 4 Agent 2 P2 Polish Verification Suite:
 * - A4-14: PhoneActionButton + sanitized tel: + desktop copy fallback + <8-digit omission
 * - A4-15: OG kakao-v2 char scaling/overflow/dead-code removal & OgImage thumbnail legibility
 * - A6-09: Localized Korean domain placeholders (zero example.com)
 * - A6-17: Workbench cleanup & holdout profile save label consistency
 */
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { copyTextSpy } = vi.hoisted(() => ({
  copyTextSpy: vi.fn(async (_text: string) => true),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/script', () => ({
  default: () => null,
}));

vi.mock('@/lib/ux/clipboard', () => ({
  copyText: (text: string) => copyTextSpy(text),
  COPY_FAILED_MESSAGE: '복사가 안 됐어요. 길게 눌러 직접 복사해 주세요.',
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  PhoneActionButton,
  formatKrPhoneForDisplay,
  isValidKrPhone,
  sanitizePhoneDigits,
} from '@/components/common/PhoneActionButton';
import { ContactGateModal } from '@/components/teaser/ContactGateModal';
import { FloatingActionBar } from '@/app/(public)/im-lite/[buildingId]/components/floating-action-bar';
import { ViewerBottomBar } from '@/components/magazine/ViewerBottomBar';
import { SubscribeCard } from '@/components/magazine/SubscribeCard';
import { SubscribeFormClient } from '@/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient';
import { buildImageModel } from '@/lib/magazine/og-image-data';
import { OgImage, makeTranslate } from '@/lib/magazine/og-image-render';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(el: HTMLInputElement, val: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('A4-14: PhoneActionButton & Phone CTA Wiring', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('sanitizes phone digits, normalizes +82, and enforces >= 8-digit minimum', () => {
    expect(sanitizePhoneDigits('010-1234-5678 (직통)')).toBe('01012345678');
    expect(sanitizePhoneDigits('+82 10-9876-5432')).toBe('01098765432');
    expect(sanitizePhoneDigits('(02) 555-0199')).toBe('025550199');
    expect(isValidKrPhone('1588-0000')).toBe(true);
    expect(isValidKrPhone('010-1234-5678')).toBe(true);
    expect(isValidKrPhone('1234567')).toBe(false);
    expect(isValidKrPhone('-')).toBe(false);
    expect(isValidKrPhone('')).toBe(false);
    expect(isValidKrPhone(null)).toBe(false);
    expect(formatKrPhoneForDisplay('01012345678')).toBe('010-1234-5678');
    expect(formatKrPhoneForDisplay('025550199')).toBe('02-555-0199');
    expect(formatKrPhoneForDisplay('1234')).toBe('');
  });

  it('omits PhoneActionButton when phone has < 8 digits, or renders fallbackHref when provided', async () => {
    await act(async () => {
      root.render(<PhoneActionButton phone="123-4567" />);
    });
    expect(container.innerHTML).toBe('');

    await act(async () => {
      root.render(
        <PhoneActionButton phone="-" fallbackLabel="전화 문의" fallbackHref="#10_contact" />,
      );
    });
    const fallbackAnchor = container.querySelector('a') as HTMLAnchorElement;
    expect(fallbackAnchor).not.toBeNull();
    expect(fallbackAnchor.getAttribute('href')).toBe('#10_contact');
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders sanitized tel: link + desktop one-click copy fallback with >=14px / min-h-[44px]', async () => {
    await act(async () => {
      root.render(<PhoneActionButton phone="010-1234-5678 (직통)" variant="inline" />);
    });
    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('tel:01012345678');
    expect(container.textContent).toContain('010-1234-5678');

    const copyBtn = container.querySelector('button') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    expect(copyBtn.className).toContain('min-h-[44px]');
    expect(copyBtn.className).toContain('text-sm');

    await act(async () => {
      copyBtn.click();
    });
    expect(copyTextSpy).toHaveBeenCalledWith('010-1234-5678');
    expect(copyBtn.textContent).toContain('복사됨');
  });

  it('wires PhoneActionButton into ContactGateModal confirmed card (and hides when <8 digits)', async () => {
    await act(async () => {
      root.render(
        <ContactGateModal
          isOpen={true}
          onClose={vi.fn()}
          buildingId="bld-1"
          onSuccess={vi.fn()}
          brokerPhone="02-555-0199"
          initialConfirmed={true}
        />,
      );
    });
    expect(container.querySelector('[data-testid="contact-gate-call-btn"]')?.getAttribute('href')).toBe('tel:025550199');
    const copyBtn = container.querySelector('[data-testid="contact-gate-copy-phone-btn"]') as HTMLButtonElement;
    await act(async () => {
      copyBtn.click();
    });
    expect(copyTextSpy).toHaveBeenCalledWith('02-555-0199');

    await act(async () => {
      root.render(
        <ContactGateModal
          isOpen={true}
          onClose={vi.fn()}
          buildingId="bld-2"
          onSuccess={vi.fn()}
          brokerPhone="1234"
          initialConfirmed={true}
        />,
      );
    });
    expect(container.querySelector('[data-testid="contact-gate-broker-phone-card"]')).toBeNull();
  });

  it('wires PhoneActionButton into FloatingActionBar and ViewerBottomBar with sanitized tel: and copy button', async () => {
    await act(async () => {
      root.render(
        <FloatingActionBar
          title="역삼 빌딩"
          buildingId="bld-im-1"
          brokerPhone="010-2222-3333 (직통)"
          isBroker={false}
        />,
      );
    });
    const fabTel = container.querySelector('a[href^="tel:"]') as HTMLAnchorElement;
    expect(fabTel).not.toBeNull();
    expect(fabTel.getAttribute('href')).toBe('tel:01022223333');
    const fabCopy = container.querySelector('button[aria-label*="번호 복사"]') as HTMLButtonElement;
    expect(fabCopy).not.toBeNull();
    await act(async () => {
      fabCopy.click();
    });
    expect(copyTextSpy).toHaveBeenCalledWith('010-2222-3333');

    await act(async () => {
      root.render(
        <FloatingActionBar
          title="역삼 빌딩"
          buildingId="bld-im-2"
          brokerPhone="-"
          isBroker={false}
        />,
      );
    });
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();

    await act(async () => {
      root.render(
        <ViewerBottomBar
          phone="010-9988-7766"
          brokerSlug="kim-broker"
          brokerId="kim-broker"
          date="2026-10-05"
          dateLabel="2026.10.05"
          target="all"
        />,
      );
    });
    const barTel = container.querySelector('a[href^="tel:"]') as HTMLAnchorElement;
    expect(barTel).not.toBeNull();
    expect(barTel.getAttribute('href')).toBe('tel:01099887766');
    const barCopy = container.querySelector('button[aria-label*="번호 복사"]') as HTMLButtonElement;
    expect(barCopy).not.toBeNull();
    await act(async () => {
      barCopy.click();
    });
    expect(copyTextSpy).toHaveBeenCalledWith('010-9988-7766');
  });

  it('omits phone CTA on SubscribeCard & SubscribeFormClient when brokerPhone has <8 digits, and shows formatted phone + copy when valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({
        ok: true,
        status: 'pending',
        pendingReason: 'NO_EMAIL_CONFIRM_CHANNEL',
      }),
    } as Response);

    await act(async () => {
      root.render(
        <SubscribeCard
          brokerId="kim-broker"
          source="magazine"
          variant="full"
          brokerPhone="123"
        />,
      );
    });

    const kakaoToggle = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('카카오톡'),
    ) as HTMLButtonElement | undefined;
    expect(kakaoToggle).toBeDefined();
    await act(async () => {
      kakaoToggle?.click();
    });

    const phoneInput = container.querySelector('input[type="tel"]') as HTMLInputElement;
    expect(phoneInput).not.toBeNull();
    await act(async () => {
      setInputValue(phoneInput, '010-5555-6666');
      for (const cb of Array.from(container.querySelectorAll('input[type="checkbox"]'))) {
        const input = cb as HTMLInputElement;
        if (!input.checked) input.click();
      }
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(container.textContent).not.toContain('전화로 직접 문의하기');
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();

    // SubscribeFormClient with valid phone
    await act(async () => {
      root.render(
        <SubscribeFormClient
          brokerId="kim-broker"
          brokerName="김중개"
          brokerPhone="010-7777-8888"
          regions={['강남·서초']}
          assets={['꼬마빌딩']}
          initialSource="magazine"
          referrer={null}
          latestDate={null}
        />,
      );
    });

    const formTel = container.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(formTel, '010-5555-6666');
      for (const cb of Array.from(container.querySelectorAll('input[type="checkbox"]'))) {
        const input = cb as HTMLInputElement;
        if (!input.checked) input.click();
      }
    });
    const formSubmit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      formSubmit.click();
    });

    const formCallLink = container.querySelector('a[href="tel:01077778888"]') as HTMLAnchorElement;
    expect(formCallLink).not.toBeNull();
    expect(formCallLink.textContent).toContain('전화로 구독 신청하기');
    const formCopyBtn = container.querySelector('button[aria-label*="번호 복사"]') as HTMLButtonElement;
    expect(formCopyBtn).not.toBeNull();
    await act(async () => {
      formCopyBtn.click();
    });
    expect(copyTextSpy).toHaveBeenCalledWith('010-7777-8888');
  });

  it('sanitizes tel: and delegates mobile-im-viewer phone actions via PhoneActionButton', () => {
    const mobileViewerCode = readRepoFile('src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx');
    expect(mobileViewerCode).toContain('<PhoneActionButton');
    expect(mobileViewerCode).not.toContain('href={`tel:${brokerPhone}`}');
    expect(mobileViewerCode).not.toContain('href={brokerPhone && brokerPhone !== "-" ? `tel:${brokerPhone}`');
  });
});

describe('A4-15: OG Image Scaling, Overflow & Dead-Code Cleanup', () => {
  it('OgImage scales long headlines (>32 chars -> 50px vs 60px), uses overflow:hidden, and bumps eyebrow/footer legibility', () => {
    const shortModel = buildImageModel(
      { headline: '성수권 수익형 빌딩 리포트', market_temp: '선별 매수' },
      { name: '박성수', company: '성수빌딩중개법인', phone: '02-555-7777' },
      '2026-10-05',
    )!;
    const shortHtml = renderToStaticMarkup(
      <OgImage m={shortModel} t={makeTranslate(true)} width={1200} height={630} />,
    );
    expect(shortHtml).toContain('font-size:60px');
    expect(shortHtml).toContain('font-size:30px');
    expect(shortHtml).toContain('font-size:32px');
    expect(shortHtml).toContain('overflow:hidden');

    const longModel = buildImageModel(
      {
        headline: '강남·서초·성수 핵심 상권 꼬마빌딩 수익률 급등 및 임대시장 심층 분석 리포트',
        market_temp: '선별 매수',
      },
      { name: '박성수', company: '성수빌딩중개법인', phone: '02-555-7777' },
      '2026-10-05',
    )!;
    const longHtml = renderToStaticMarkup(
      <OgImage m={longModel} t={makeTranslate(true)} width={1200} height={630} />,
    );
    expect(longHtml).toContain('font-size:50px');
    expect(longHtml).toContain('overflow:hidden');
  });

  it('kakao-v2 removes dead post-query neq(), adds overflow:hidden on quadrant cells, and scales text (>10 -> 52px, >7 -> 58px)', () => {
    const code = readRepoFile('src/app/api/og/deal/[id]/kakao-v2/route.tsx');
    expect(code).not.toContain("ssotQuery = ssotQuery.neq('status', 'archived')");
    expect(code).toContain("overflow: 'hidden'");
    expect(code).toContain("fontSize: '64px'");
    expect(code).toContain("if (len > 10) return '52px'");
    expect(code).toContain("if (len > 7) return '58px'");
  });
});

describe('A6-09: Localized Domain Placeholders (Zero example.com)', () => {
  const placeholderFiles = [
    'src/app/(auth)/login/page.tsx',
    'src/app/(auth)/reset-password/page.tsx',
    'src/app/(auth)/signup/page.tsx',
    'src/components/broker/im-studio/HeaderFooterEditor.tsx',
    'src/components/magazine-editor/EditorCoverTab.tsx',
    'src/components/magazine-editor/AddSubscriberForm.tsx',
    'src/components/magazine-editor/outreach/AddSubscriberForm.tsx',
    'src/components/magazine-editor/outreach/SubscriberDetailModal.tsx',
    'src/components/workspace/inbox/ContactBulkImportModal.tsx',
    'src/components/magazine/SubscribeCard.tsx',
    'src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx',
  ];

  it.each(placeholderFiles)('%s contains zero example.com placeholders', (relPath) => {
    const content = readRepoFile(relPath);
    expect(content).not.toMatch(/example\.com/i);
  });

  it('uses Korean-localized domains (company.co.kr / credeal.net) for placeholders', () => {
    expect(readRepoFile('src/app/(auth)/login/page.tsx')).toContain('name@company.co.kr');
    expect(readRepoFile('src/components/broker/im-studio/HeaderFooterEditor.tsx')).toContain(
      'https://www.credeal.net/sample-logo.png',
    );
    expect(readRepoFile('src/components/magazine-editor/EditorCoverTab.tsx')).toContain(
      'https://www.credeal.net/sample-cover.jpg',
    );
    expect(readRepoFile('src/components/magazine-editor/outreach/SubscriberDetailModal.tsx')).toContain(
      'client@company.co.kr',
    );
  });
});

describe('A6-17: Workbench Cleanup & Holdout Profile Save Label Alignment', () => {
  it('aligns QaFullLoopWorkbenchClient server cleanup label to immediate delete', () => {
    const workbench = readRepoFile('src/app/qa-full-loop/_components/QaFullLoopWorkbenchClient.tsx');
    expect(workbench).not.toContain('🧹 내 테스트 매물·딜카드·IM 서버에서 즉시 삭제');
    expect(workbench).toContain('🧹 내 테스트 매물·딜카드·IM 즉시 삭제');
  });

  it('aligns holdout data, MD, and HTML guides to exact profile save button label', () => {
    const expectedLabel = '💾 내 프로필 · 사무소 정보 저장하기';
    const data = readRepoFile('src/lib/testguide/full-loop-v2-holdout-data.ts');
    const md = readRepoFile('docs/finaltest/FULL_LOOP_V2_HOLDOUT_HUMAN_TEST_GUIDE.md');
    const html = readRepoFile('docs/finaltest/FULL_LOOP_V2_HOLDOUT_HUMAN_TEST_GUIDE.html');

    for (const content of [data, md, html]) {
      expect(content).not.toContain('[저장]');
      expect(content).toContain(expectedLabel);
    }
  });
});
