// @vitest-environment jsdom
/**
 * @file src/tests/workspace/wave5-wp17-bulk-contact-import.test.tsx
 * @description Wave 5 — WP-17: 3-Way Bulk Contact & Subscriber Import
 *   Covers:
 *   1. Excel (.xlsx) workbook buffer parsing + Korean column auto-mapping + stripped leading-zero restoration
 *   2. CSV parsing with UTF-8 BOM + duplicate phone/email merging + invalid row flagging + strict opt-in
 *   3. Freeform multi-line copy-paste parsing + MAX_BULK_IMPORT_ROWS cap
 *   4. POST /api/broker/inbox/import-contacts (401 unauth, 403 non-broker, batch upsert + GET /api/broker/inbox visibility, unsubscribed suppression, blank consent safety, audit event)
 *   5. ContactBulkImportModal 3-step wizard UI + AddSubscriberForm bulk button + UX lexicon guard compatibility
 */

import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import {
  MAX_BULK_IMPORT_ROWS,
  buildSampleCsvContent,
  parseCsvContactsText,
  parseExcelContactsBuffer,
  parseMarketingConsent,
  parsePastedContactsText,
} from '@/lib/crm/contact-bulk-parser';
import { BANNED_UI_TERMS } from '@/lib/ux/lexicon';
import { stripNonUiCode } from '@/tests/workspace/ux-lexicon-guard.test';
import { clearRateLimitBuckets } from '@/lib/rate-limiter';
import { getInboxState, saveInboxState } from '@/lib/im-lite/quick-generate-store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BROKER_ID = '11111111-1111-4111-8111-111111111111';
const BROKER_SLUG = 'gangnam-prime-broker';

interface MockDb {
  broker_profiles: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  broker_custom_clients: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  building_ssot_lite: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  im_inquiry_requests: Array<Record<string, any>>;
  in_app_notifications: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
}

function createMockDb(): MockDb {
  return {
    broker_profiles: [{ user_id: BROKER_ID, slug: BROKER_SLUG }],
    broker_clients: [],
    broker_custom_clients: [],
    magazine_subscribers: [],
    activity_events: [],
    building_ssot_lite: [],
    gate_requests: [],
    im_inquiry_requests: [],
    in_app_notifications: [],
    im_share_links: [],
  };
}

let mockDb: MockDb = createMockDb();
let mockAuthState:
  | { authenticated: false }
  | { authenticated: true; userId: string; role: string } = {
  authenticated: true,
  userId: BROKER_ID,
  role: 'broker',
};

function createFakeSupabaseClient(db: MockDb) {
  let idSeq = 1;
  return {
    from(tableName: string) {
      const table = (db as unknown as Record<string, Array<Record<string, any>>>)[tableName] ?? [];
      const predicates: Array<(row: Record<string, any>) => boolean> = [];
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: any = null;
      let limitNum: number | null = null;

      const execute = () => {
        if (op === 'insert') {
          const items = Array.isArray(payload) ? payload : [payload];
          const inserted = items.map((item) => {
            const row = {
              id: item.id ?? `00000000-0000-4000-8000-${String(idSeq++).padStart(12, '0')}`,
              created_at: item.created_at ?? new Date().toISOString(),
              ...item,
            };
            table.push(row);
            return row;
          });
          return {
            data: Array.isArray(payload) ? inserted : inserted[0],
            error: null,
          };
        }

        const matched = table.filter((row) => predicates.every((fn) => fn(row)));

        if (op === 'update') {
          for (const row of matched) {
            Object.assign(row, payload);
          }
          return { data: matched, error: null };
        }

        if (op === 'delete') {
          for (const row of matched) {
            const idx = table.indexOf(row);
            if (idx >= 0) table.splice(idx, 1);
          }
          return { data: matched, error: null };
        }

        const sliced = limitNum !== null ? matched.slice(0, limitNum) : matched;
        return { data: [...sliced], error: null };
      };

      const builder: any = {
        select() {
          return builder;
        },
        insert(values: any) {
          op = 'insert';
          payload = values;
          return builder;
        },
        update(values: any) {
          op = 'update';
          payload = values;
          return builder;
        },
        delete() {
          op = 'delete';
          return builder;
        },
        eq(col: string, val: unknown) {
          predicates.push((r) => String(r[col] ?? '') === String(val ?? ''));
          return builder;
        },
        in(col: string, vals: unknown[]) {
          const set = new Set((vals || []).map((v) => String(v)));
          predicates.push((r) => set.has(String(r[col] ?? '')));
          return builder;
        },
        or() {
          return builder;
        },
        gte() {
          return builder;
        },
        order() {
          return builder;
        },
        limit(n: number) {
          limitNum = n;
          return builder;
        },
        maybeSingle() {
          const res = execute();
          const first = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
          return Promise.resolve({ data: first, error: res.error });
        },
        single() {
          const res = execute();
          const first = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
          return Promise.resolve({ data: first, error: res.error });
        },
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  };
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => createFakeSupabaseClient(mockDb),
}));

vi.mock('@/lib/auth-guard', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireBroker: async () => {
      if (!mockAuthState.authenticated) {
        return {
          user: null,
          role: null,
          profile: null,
          error: NextResponse.json(
            { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
            { status: 401 },
          ),
        };
      }
      if (mockAuthState.role !== 'broker' && mockAuthState.role !== 'admin') {
        return {
          user: { id: mockAuthState.userId },
          role: mockAuthState.role,
          profile: { role: mockAuthState.role, display_name: '일반회원' },
          error: NextResponse.json(
            { ok: false, error: { code: 'FORBIDDEN', message: '중개사 권한이 필요합니다.' } },
            { status: 403 },
          ),
        };
      }
      return {
        user: { id: mockAuthState.userId, email: 'broker@credeal.kr' },
        role: mockAuthState.role,
        profile: { role: mockAuthState.role, display_name: '강남 김대표' },
        error: null,
      };
    },
  };
});

const toastSuccessSpy = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessSpy(...args),
    error: vi.fn(),
  },
}));

import { POST as importContactsPost } from '@/app/api/broker/inbox/import-contacts/route';
import { GET as inboxGet } from '@/app/api/broker/inbox/route';
import { ContactBulkImportModal } from '@/components/workspace/inbox/ContactBulkImportModal';
import { AddSubscriberForm } from '@/components/magazine-editor/AddSubscriberForm';

describe('Wave 5 — WP-17: 3-Way Bulk Contact & Subscriber Import', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockDb = createMockDb();
    mockAuthState = { authenticated: true, userId: BROKER_ID, role: 'broker' };
    clearRateLimitBuckets();
    toastSuccessSpy.mockClear();

    const state = getInboxState();
    state.customClients = [];
    saveInboxState(state);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.querySelectorAll('[data-magazine-modal]').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  describe('1. Pure 3-Way Parser (contact-bulk-parser.ts)', () => {
    it('parses .xlsx workbook buffer, auto-maps Korean columns, and restores Excel stripped leading zeros', () => {
      const wb = XLSX.utils.book_new();
      // First empty sheet should be skipped cleanly
      const emptySheet = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, emptySheet, '빈시트');

      const dataRows = [
        [
          '성함',
          '휴대폰',
          '전자우편',
          '법인명',
          '매수/매도',
          '중요',
          '관심지역',
          '희망금액',
          '수신동의',
          '특이사항',
        ],
        [
          '최투자',
          1012345678, // Excel numeric formatting stripped leading '0'!
          'choi@invest.co.kr',
          '한강에셋',
          '투자자',
          '★',
          '강남·서초',
          '80억 내외',
          '동의',
          '역세권 코너 선호',
        ],
        [
          '정소유',
          212345678, // Seoul 02 landline with stripped leading '0'
          '',
          '',
          '건물주',
          '',
          '마포·홍대',
          '',
          '', // Blank consent MUST remain false!
          '매각 검토중',
        ],
      ];
      const contactsSheet = XLSX.utils.aoa_to_sheet(dataRows);
      XLSX.utils.book_append_sheet(wb, contactsSheet, '고객명단');

      const xlsxArray = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const result = parseExcelContactsBuffer(xlsxArray);

      expect(result.sourceMode).toBe('excel');
      expect(result.validRows).toHaveLength(2);
      expect(result.invalidRows).toHaveLength(0);
      expect(result.restoredLeadingZeroCount).toBe(2);

      const first = result.validRows[0];
      expect(first.name).toBe('최투자');
      expect(first.phone).toBe('010-1234-5678');
      expect(first.email).toBe('choi@invest.co.kr');
      expect(first.company).toBe('한강에셋');
      expect(first.clientRole).toBe('buyer');
      expect(first.isVip).toBe(true);
      expect(first.preferredRegions).toBe('강남·서초');
      expect(first.budgetText).toBe('80억 내외');
      expect(first.marketingConsent).toBe(true);
      expect(first.memo).toBe('역세권 코너 선호');

      const second = result.validRows[1];
      expect(second.name).toBe('정소유');
      expect(second.phone).toBe('02-1234-5678');
      expect(second.clientRole).toBe('seller');
      expect(second.isVip).toBe(false);
      expect(second.marketingConsent).toBe(false);
    });

    it('parses .csv with UTF-8 BOM, merges duplicate phone/email rows, and flags invalid rows with Korean reasons', () => {
      const sampleCsv = buildSampleCsvContent();
      expect(sampleCsv.startsWith('\uFEFF')).toBe(true);
      const sampleParsed = parseCsvContactsText(sampleCsv);
      expect(sampleParsed.validRows).toHaveLength(2);
      expect(sampleParsed.validRows[0].marketingConsent).toBe(true);
      expect(sampleParsed.validRows[1].marketingConsent).toBe(false);

      const customCsv =
        '\uFEFF' +
        [
          '이름,연락처,이메일,회사,구분,VIP,예산,수신동의,메모',
          '이중복,010-5555-6666,,선릉홀딩스,매수,,50억,,1차 상담',
          '이중복,01055556666,dup@credeal.kr,,매수,VIP,,Y,2차 미팅 완료',
          '박누락,,,빈회사,임차,,,미동의,연락처 없음',
          '오류메일,,not-an-email,,공동중개,,,,잘못된 이메일',
        ].join('\r\n');

      const res = parseCsvContactsText(customCsv);
      expect(res.sourceMode).toBe('csv');
      expect(res.validRows).toHaveLength(1);
      expect(res.mergedDuplicatesCount).toBe(1);
      expect(res.invalidRows).toHaveLength(2);

      const merged = res.validRows[0];
      expect(merged.name).toBe('이중복');
      expect(merged.phone).toBe('010-5555-6666');
      expect(merged.email).toBe('dup@credeal.kr');
      expect(merged.company).toBe('선릉홀딩스');
      expect(merged.budgetText).toBe('50억');
      expect(merged.isVip).toBe(true);
      expect(merged.marketingConsent).toBe(true);
      expect(merged.memo).toContain('1차 상담');
      expect(merged.memo).toContain('2차 미팅 완료');

      expect(res.invalidRows[0].rawName).toBe('박누락');
      expect(res.invalidRows[0].reason).toContain('누락');
      expect(res.invalidRows[1].reason).toContain('이메일 형식');

      // Consent strictness unit checks
      expect(parseMarketingConsent('')).toBe(false);
      expect(parseMarketingConsent(null)).toBe(false);
      expect(parseMarketingConsent('미동의')).toBe(false);
      expect(parseMarketingConsent('N')).toBe(false);
      expect(parseMarketingConsent('Y')).toBe(true);
      expect(parseMarketingConsent('동의')).toBe(true);
    });

    it('parses freeform multi-line copy-paste text and enforces MAX_BULK_IMPORT_ROWS = 1000', () => {
      const pasted = [
        '김매수\t010-2222-3333\tkim@example.com\t매수\tVIP',
        '박임대 1099998888 park@building.kr 임대인 수신동의',
        '이름만있는줄',
      ].join('\n');

      const parsed = parsePastedContactsText(pasted);
      expect(parsed.sourceMode).toBe('paste');
      expect(parsed.validRows).toHaveLength(2);
      expect(parsed.invalidRows).toHaveLength(1);

      expect(parsed.validRows[0]).toMatchObject({
        name: '김매수',
        phone: '010-2222-3333',
        email: 'kim@example.com',
        clientRole: 'buyer',
        isVip: true,
        marketingConsent: false,
      });

      expect(parsed.validRows[1]).toMatchObject({
        name: '박임대',
        phone: '010-9999-8888',
        email: 'park@building.kr',
        clientRole: 'seller',
        marketingConsent: true,
        restoredLeadingZero: true,
      });

      // Cap test (> 1000 rows)
      const manyLines = Array.from({ length: 1005 }, (_, idx) => {
        const num = String(idx + 1).padStart(4, '0');
        return `고객${idx + 1}\t010-3000-${num}`;
      }).join('\n');
      const cappedRes = parsePastedContactsText(manyLines);
      expect(cappedRes.validRows).toHaveLength(MAX_BULK_IMPORT_ROWS);
      expect(cappedRes.truncatedRowsCount).toBe(5);
    });
  });

  describe('2. API Route (POST /api/broker/inbox/import-contacts)', () => {
    it('rejects unauthenticated requests with 401 and non-broker roles with 403', async () => {
      mockAuthState = { authenticated: false };
      const unauthReq = new NextRequest('http://localhost/api/broker/inbox/import-contacts', {
        method: 'POST',
        body: JSON.stringify({
          contacts: [{ name: '홍길동', phone: '010-1234-5678' }],
        }),
      });
      const res401 = await importContactsPost(unauthReq);
      expect(res401.status).toBe(401);

      mockAuthState = { authenticated: true, userId: BROKER_ID, role: 'public_user' };
      const forbiddenReq = new NextRequest('http://localhost/api/broker/inbox/import-contacts', {
        method: 'POST',
        body: JSON.stringify({
          contacts: [{ name: '홍길동', phone: '010-1234-5678' }],
        }),
      });
      const res403 = await importContactsPost(forbiddenReq);
      expect(res403.status).toBe(403);
    });

    it('upserts contacts, syncs opted-in subscribers, respects unsubscribed suppression, never marks blank consent as opt-in, and surfaces in GET /api/broker/inbox', async () => {
      // Seed an existing unsubscribed subscriber to verify strict suppression
      mockDb.magazine_subscribers.push({
        id: '99999999-9999-4999-8999-999999999999',
        broker_id: BROKER_SLUG,
        broker_user_id: BROKER_ID,
        subscriber_name: '기존해지고객',
        subscriber_phone: '01077778888',
        subscriber_email: 'unsub@example.com',
        channel: 'both',
        status: 'unsubscribed',
        unsubscribed_at: '2026-10-01T00:00:00.000Z',
      });

      const firstBatchReq = new NextRequest('http://localhost/api/broker/inbox/import-contacts', {
        method: 'POST',
        body: JSON.stringify({
          registerAsNewsletterSubscriber: true,
          contacts: [
            {
              name: '김동의',
              phone: '1011112222', // stripped leading zero
              email: 'optin@example.com',
              company: '동의자산',
              clientRole: 'buyer',
              isVip: true,
              preferredRegions: '강남·서초',
              budgetText: '100억',
              marketingConsent: true,
              memo: '주간 소식지 희망',
            },
            {
              name: '박상담전용',
              phone: '010-3333-4444',
              email: 'consult@example.com',
              clientRole: 'seller',
              // marketingConsent omitted (blank) -> MUST NOT opt-in!
            },
            {
              name: '기존해지고객',
              phone: '010-7777-8888',
              email: 'unsub@example.com',
              marketingConsent: true, // Even if Excel had Y, unsubscribed DB status MUST suppress!
            },
          ],
        }),
      });

      const res1 = await importContactsPost(firstBatchReq);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1).toMatchObject({
        ok: true,
        importedCount: 3,
        updatedCount: 0,
        skippedCount: 0,
        subscriberAddedCount: 1,
        skippedUnsubscribedCount: 1,
      });

      // Verify unsubscribed subscriber stayed 'unsubscribed'
      const unsubRecord = mockDb.magazine_subscribers.find(
        (s) => s.subscriber_email === 'unsub@example.com',
      );
      expect(unsubRecord?.status).toBe('unsubscribed');

      // Verify blank consent contact was NOT added to magazine_subscribers
      const blankSubRecord = mockDb.magazine_subscribers.find(
        (s) => s.subscriber_email === 'consult@example.com',
      );
      expect(blankSubRecord).toBeUndefined();

      // Verify opted-in contact WAS added to magazine_subscribers with normalized phone
      const addedSubRecord = mockDb.magazine_subscribers.find(
        (s) => s.subscriber_email === 'optin@example.com',
      );
      expect(addedSubRecord).toBeDefined();
      expect(addedSubRecord?.status).toBe('active');
      expect(addedSubRecord?.subscriber_phone).toBe('01011112222');
      expect(addedSubRecord?.broker_user_id).toBe(BROKER_ID);

      // Verify audit event recorded in activity_events
      const auditEvt = mockDb.activity_events.find(
        (e) => e.event_type === 'contacts_bulk_imported',
      );
      expect(auditEvt).toBeDefined();
      expect(auditEvt?.actor_id).toBe(BROKER_ID);
      expect(auditEvt?.metadata).toMatchObject({
        importedCount: 3,
        updatedCount: 0,
        skippedUnsubscribedCount: 1,
      });

      // Verify re-importing an existing contact updates instead of duplicating
      const secondBatchReq = new NextRequest('http://localhost/api/broker/inbox/import-contacts', {
        method: 'POST',
        body: JSON.stringify({
          registerAsNewsletterSubscriber: false,
          contacts: [
            {
              name: '김동의(수정)',
              phone: '010-1111-2222',
              budgetText: '120억',
            },
          ],
        }),
      });
      const res2 = await importContactsPost(secondBatchReq);
      const body2 = await res2.json();
      expect(body2).toMatchObject({
        ok: true,
        importedCount: 0,
        updatedCount: 1,
      });

      // Verify contacts immediately appear in GET /api/broker/inbox without duplicates
      const inboxReq = new NextRequest('http://localhost/api/broker/inbox');
      const inboxRes = await inboxGet(inboxReq);
      expect(inboxRes.status).toBe(200);
      const inboxData = await inboxRes.json();
      const threadNames = (inboxData.threads as Array<{ clientName: string }>).map(
        (t) => t.clientName,
      );
      expect(threadNames).toContain('김동의(수정)');
      expect(threadNames).toContain('박상담전용');

      const blankThread = (
        inboxData.threads as Array<{ clientName: string; newsletterSubscribed: boolean }>
      ).find((t) => t.clientName === '박상담전용');
      expect(blankThread?.newsletterSubscribed).toBe(false);
    });
  });

  describe('3. Senior UI Wizard (ContactBulkImportModal) & AddSubscriberForm Integration', () => {
    it('walks through all 3 wizard steps and submits bulk contacts cleanly', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          importedCount: 2,
          updatedCount: 0,
          skippedCount: 0,
          subscriberAddedCount: 1,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const onImported = vi.fn();

      await act(async () => {
        root.render(
          <ContactBulkImportModal
            open={true}
            onOpenChange={() => {}}
            defaultNewsletterSync={true}
            onImported={onImported}
          />,
        );
      });

      // Step 1 rendered
      expect(document.body.querySelector('[data-testid="bulk-step-1"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="download-sample-csv-btn"]')).not.toBeNull();

      // Switch to paste mode in Step 1
      const pasteTabBtn = document.body.querySelector(
        '[data-testid="bulk-input-mode-paste"]',
      ) as HTMLButtonElement;
      await act(async () => {
        pasteTabBtn.click();
      });

      const pasteArea = document.body.querySelector(
        '[data-testid="bulk-contact-paste-textarea"]',
      ) as HTMLTextAreaElement;
      expect(pasteArea).not.toBeNull();

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        setter?.call(
          pasteArea,
          [
            '김매수\t1022223333\tkim@example.com\t매수\tVIP\t수신동의',
            '이상담\t010-4444-5555\tlee@example.com\t매도',
            '연락처없는분',
          ].join('\n'),
        );
        pasteArea.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const parseNextBtn = document.body.querySelector(
        '[data-testid="bulk-parse-paste-next-btn"]',
      ) as HTMLButtonElement;
      await act(async () => {
        parseNextBtn.click();
      });

      // Step 2: Summary badges + leading-zero notice + preview table
      expect(document.body.querySelector('[data-testid="bulk-step-2"]')).not.toBeNull();
      expect(document.body.textContent).toContain('등록 가능 2명');
      expect(document.body.textContent).toContain('중복 자동 합침 0건');
      expect(document.body.textContent).toContain('확인 필요(연락처 누락) 1건');
      expect(document.body.textContent).toContain('010-2222-3333');

      const step2NextBtn = document.body.querySelector(
        '[data-testid="step2-next-btn"]',
      ) as HTMLButtonElement;
      await act(async () => {
        step2NextBtn.click();
      });

      // Step 3: Compliance notice & checkboxes
      expect(document.body.querySelector('[data-testid="bulk-step-3"]')).not.toBeNull();
      expect(document.body.textContent).toContain(
        "명단에 '수신동의(Y)'가 표시된 고객만 뉴스레터·안내 발송 대상으로 등록되며, 미표시 고객은 내 고객 수첩(상담용)으로만 안전하게 저장됩니다.",
      );

      const syncCheckbox = document.body.querySelector(
        '[data-testid="newsletter-sync-checkbox"]',
      ) as HTMLInputElement;
      expect(syncCheckbox.checked).toBe(true);

      const submitBtn = document.body.querySelector(
        '[data-testid="bulk-import-submit-btn"]',
      ) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      const complianceCheckbox = document.body.querySelector(
        '[data-testid="compliance-confirm-checkbox"]',
      ) as HTMLInputElement;
      await act(async () => {
        complianceCheckbox.click();
      });
      expect(submitBtn.disabled).toBe(false);

      await act(async () => {
        submitBtn.click();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('/api/broker/inbox/import-contacts');
      const sentBody = JSON.parse(calledInit.body as string);
      expect(sentBody.registerAsNewsletterSubscriber).toBe(true);
      expect(sentBody.contacts).toHaveLength(2);
      expect(sentBody.contacts[0].marketingConsent).toBe(true);
      expect(sentBody.contacts[1].marketingConsent).toBe(false);

      expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
      expect(onImported).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, importedCount: 2, subscriberAddedCount: 1 }),
      );
    });

    it('renders open-bulk-subscriber-import-btn inside AddSubscriberForm and opens ContactBulkImportModal with defaultNewsletterSync=true', async () => {
      await act(async () => {
        root.render(<AddSubscriberForm open={true} onClose={() => {}} onAdded={() => {}} />);
      });

      const openBulkBtn = document.body.querySelector(
        '[data-testid="open-bulk-subscriber-import-btn"]',
      ) as HTMLButtonElement;
      expect(openBulkBtn).not.toBeNull();
      expect(openBulkBtn.textContent).toContain('📋 엑셀·명단 한 번에 등록');

      await act(async () => {
        openBulkBtn.click();
      });

      const bulkModal = document.body.querySelector('[data-testid="contact-bulk-import-modal"]');
      expect(bulkModal).not.toBeNull();
    });

    it('passes UX lexicon guard (zero BANNED_UI_TERMS) across ContactBulkImportModal and AddSubscriberForm', () => {
      const filesToVerify = [
        'src/components/workspace/inbox/ContactBulkImportModal.tsx',
        'src/components/magazine-editor/AddSubscriberForm.tsx',
        'src/components/magazine-editor/outreach/AddSubscriberForm.tsx',
      ];

      for (const relPath of filesToVerify) {
        const fullPath = path.join(process.cwd(), relPath);
        const code = stripNonUiCode(fs.readFileSync(fullPath, 'utf8'));
        const violations: string[] = [];
        for (const { term, use } of BANNED_UI_TERMS) {
          const m = code.match(term);
          if (m) violations.push(`"${m[0]}" -> ${use}`);
        }
        expect(violations, `${relPath} has banned terms`).toEqual([]);
      }
    });
  });
});
