import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';

const UNSUB_SECRET =
  process.env.UNSUBSCRIBE_SECRET || 'ci-test-unsub-secret-minimum-32-chars-ok';

function signTestUnsubToken(subscriberId: string, brokerId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payloadB64 = Buffer.from(`v2.${subscriberId}.${brokerId}.${exp}`).toString('base64url');
  const sigB64 = createHmac('sha256', UNSUB_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

test.describe('WP 5-B: Commercialization, Multi-Tenant IDOR, Unsubscribe, Share-Link & Statutory Gates', () => {
  test('1. Cross-tenant hijack / IDOR blocked (403/404) on foreign building and gate request', async ({
    request,
  }) => {
    const foreignBuildingId = '00000000-0000-4000-8000-000000000999';
    const foreignDealRes = await request.patch(`/api/broker/deal-card/${foreignBuildingId}`, {
      data: {
        blind_teaser: { headline: '탈취 시도 제목', area_band: '강남' },
      },
    });
    expect([403, 404]).toContain(foreignDealRes.status());

    const foreignGateRes = await request.post('/api/broker/inbox/actions', {
      data: {
        action: 'approve_gate',
        gateRequestId: foreignBuildingId,
        buildingId: foreignBuildingId,
      },
    });
    expect([403, 404]).toContain(foreignGateRes.status());

    const foreignSummaryRes = await request.patch('/api/broker/workspace/summary', {
      data: {
        action: 'upsert',
        buildingId: foreignBuildingId,
        card4: {
          region: '서울 마포구',
          use: '근린생활시설',
          area: '100평대',
          priceBand: '50억~60억',
          points: ['역세권 코너', '전층 임대', '가시성 우수'],
        },
      },
    });
    expect([403, 404]).toContain(foreignSummaryRes.status());
  });

  test('2. CRM client unsubscribe blocks broker manual re-subscribe (403) and preserves suppression', async ({
    request,
  }) => {
    const profileRes = await request.get('/api/broker/profile');
    expect(profileRes.status()).toBe(200);
    const profileJson = await profileRes.json();
    const brokerUserId = String(
      profileJson?.data?.id || profileJson?.data?.broker?.user_id || ''
    );
    expect(brokerUserId).toMatch(/^[0-9a-f-]{36}$/i);

    const uniqueSuffix = Date.now();
    const clientEmail = `w5-unsub-${uniqueSuffix}@example.invalid`;
    const upsertRes = await request.post('/api/broker/inbox/actions', {
      data: {
        action: 'upsert_client',
        clientName: `W5해지테스트-${uniqueSuffix}`,
        clientEmail,
        clientPhone: `010-99${String(uniqueSuffix).slice(-6)}`,
        clientGrade: '일반',
        newsletterSubscribed: true,
      },
    });
    expect(upsertRes.status()).toBe(200);
    const upsertJson = await upsertRes.json();
    const rawClientId = String(upsertJson?.client?.id || upsertJson?.clientId || '');
    let cleanClientId = rawClientId.replace(/^(?:custom[-_]|cli-|sub_)/, '');

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanClientId)) {
      const createClientRes = await request.post('/api/broker/clients', {
        data: {
          client_type: 'buyer',
          display_name: `W5해지테스트-${uniqueSuffix}`,
          phone: `010-99${String(uniqueSuffix).slice(-6)}`,
          email: clientEmail,
          tier: 'normal',
          tags: ['뉴스레터구독'],
        },
      });
      expect(createClientRes.status()).toBe(201);
      const createdJson = await createClientRes.json();
      cleanClientId = String(createdJson?.data?.id || '');
    }
    expect(cleanClientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const verifyClientRes = await request.get(`/api/broker/clients/${cleanClientId}`);
    expect(verifyClientRes.status()).toBe(200);

    try {
      const token = signTestUnsubToken(cleanClientId, brokerUserId);
      const getUnsub = await request.get(`/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`);
      expect(getUnsub.status()).toBe(200);

      const html = await getUnsub.text();
      expect(html).toContain('수신 거부');

      const postUnsub = await request.post('/api/public/magazine/unsubscribe', {
        data: { t: token },
      });
      expect(postUnsub.status()).toBe(200);
      const postJson = await postUnsub.json();
      expect(postJson.ok).toBe(true);

      const resubAttempt = await request.post('/api/broker/inbox/actions', {
        data: {
          action: 'toggle_newsletter_subscription',
          clientId: cleanClientId,
          subscribed: true,
          clientEmail,
        },
      });
      expect(resubAttempt.status()).toBe(403);
      const resubJson = await resubAttempt.json();
      expect(resubJson?.error?.code || resubJson?.code).toBe('RECIPIENT_SELF_OPTIN_REQUIRED');
    } finally {
      if (cleanClientId) {
        await request
          .post('/api/broker/inbox/actions', {
            data: { action: 'delete_client', clientId: cleanClientId },
          })
          .catch(() => null);
        await request.delete(`/api/broker/clients/${cleanClientId}`).catch(() => null);
      }
    }
  });

  test('3. Share-link token issue -> valid public read (200) -> revoke -> fail-closed (403)', async ({
    request,
    page,
  }) => {
    const ts = Date.now();
    const bldId = `bld-w5-share-${ts}`;
    const origProfileRes = await request.get('/api/broker/profile');
    const origProfileJson = origProfileRes.ok() ? await origProfileRes.json().catch(() => null) : null;
    const origData = origProfileJson?.data || null;
    const origBroker = origData?.broker || null;

    const prepProfileRes = await request.put('/api/broker/profile', {
      data: {
        display_name: '김세정',
        representative_name: '김세정',
        company: '세정빌딩부동산중개',
        phone: '02-555-7100',
        office_reg_number: '11680-2024-00321',
        office_address: '서울특별시 강남구 테헤란로 212',
      },
    });
    expect(prepProfileRes.status()).toBe(200);

    try {
      const upsertRes = await request.patch('/api/broker/workspace/summary', {
        data: {
          action: 'upsert_im',
          buildingId: bldId,
          imItem: {
            id: bldId,
            buildingId: bldId,
            title: 'W5 공유토큰 검증 빌딩',
            address: '서울특별시 마포구 양화로 120',
            askingPriceManwon: 750000,
            landAreaSqm: 260,
            gfaSqm: 720,
            zoning: '제2종일반주거지역',
            completionDate: '2016-05-01',
            grossYieldPct: 4.5,
            capRatePct: 4.5,
            status: 'published',
          },
        },
      });
      expect(upsertRes.status()).toBe(200);

      const clientRes = await request.post('/api/broker/inbox/actions', {
        data: {
          action: 'upsert_client',
          clientName: 'W5열람고객',
          clientPhone: '010-8811-2233',
          buildingId: bldId,
          buildingTitle: 'W5 공유토큰 검증 빌딩',
        },
      });
      expect(clientRes.status()).toBe(200);
      const clientJson = await clientRes.json();
      const threadId = String(
        clientJson?.thread?.id || clientJson?.client?.id || `custom_${ts}`
      );

      const approveRes = await request.post('/api/broker/inbox/actions', {
        data: {
          action: 'approve_gate',
          threadId,
          buildingId: bldId,
        },
      });
      expect(approveRes.status()).toBe(200);
      const approveJson = await approveRes.json();
      const token = String(approveJson?.shareToken || '');
      expect(token).toMatch(/^slk\./);

      const validRes = await request.get(
        `/api/public/im-lite/${encodeURIComponent(bldId)}?token=${encodeURIComponent(token)}`
      );
      expect(validRes.status()).toBe(200);

      const revokeRes = await request.post('/api/broker/share-links/revoke', {
        data: {
          buildingId: bldId,
          shareToken: token,
          threadId,
          reason: 'w5_test_revoke',
        },
      });
      expect(revokeRes.status()).toBe(200);

      const afterRevokeApi = await request.get(
        `/api/public/im-lite/${encodeURIComponent(bldId)}?token=${encodeURIComponent(token)}`
      );
      expect(afterRevokeApi.status()).toBe(403);
      const afterRevokeJson = await afterRevokeApi.json();
      expect(afterRevokeJson?.error?.code).toBe('LINK_REVOKED');

      const anonCtx = await page.context().browser()!.newContext();
      const anonPage = await anonCtx.newPage();
      try {
        await anonPage.goto(`/im-lite/${encodeURIComponent(bldId)}?token=${encodeURIComponent(token)}`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(anonPage.getByTestId('revoked-im-screen')).toBeVisible({ timeout: 15000 });
      } finally {
        await anonCtx.close();
      }
    } finally {
      await request
        .patch('/api/broker/workspace/summary', {
          data: { action: 'delete_im', buildingId: bldId, imId: bldId },
        })
        .catch(() => null);
      if (origData) {
        await request
          .put('/api/broker/profile', {
            data: {
              ...(typeof origData.display_name === 'string' && origData.display_name.trim()
                ? { display_name: origData.display_name }
                : {}),
              representative_name: origBroker?.representative_name ?? null,
              company: typeof origData.company === 'string' ? origData.company : '',
              phone: typeof origData.phone === 'string' ? origData.phone : '',
              office_reg_number:
                typeof origBroker?.office_reg_number === 'string' ? origBroker.office_reg_number : '',
              office_address:
                typeof origBroker?.office_address === 'string' ? origBroker.office_address : '',
            },
          })
          .catch(() => null);
      }
    }
  });

  test('4. Newsletter analytics schema & studio dry-run load without 5xx', async ({
    request,
    page,
  }) => {
    const analyticsRes = await request.get('/api/broker/magazine/analytics');
    expect(analyticsRes.status()).toBe(200);
    const analyticsJson = await analyticsRes.json();
    expect(typeof analyticsJson.subscriberCount).toBe('number');
    expect(Array.isArray(analyticsJson.editions)).toBe(true);

    const api5xx: string[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() >= 500) {
        api5xx.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto('/broker/w/newsletter', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('editor-mode-bar')).toBeVisible({ timeout: 20000 });
    expect(api5xx).toEqual([]);
  });

  test('5. Statutory & core publish gate returns 422 with Korean missing labels', async ({
    request,
  }) => {
    const bldId = `bld-w5-gate-${Date.now()}`;
    const res = await request.patch('/api/broker/workspace/summary', {
      data: {
        action: 'publish_im',
        buildingId: bldId,
        imItem: {
          id: bldId,
          buildingId: bldId,
          title: '미완성 IM 빌딩',
          address: '서울특별시 강남구 논현동',
          askingPriceManwon: 500000,
          landAreaSqm: 200,
          gfaSqm: 500,
          status: 'published',
        },
      },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.missingLabels)).toBe(true);
    expect(body.missingLabels.length).toBeGreaterThanOrEqual(1);

    const narrowRes = await request.patch('/api/broker/workspace/summary', {
      data: {
        action: 'upsert',
        buildingId: `bld-w5-narrow-${Date.now()}`,
        card4: {
          region: '강남구 역삼동',
          use: '수익형 근생',
          area: '대지 100평',
          priceBand: '2000~2010억',
          points: ['역세권 코너', '전층 임대', '가시성 우수'],
        },
      },
    });
    expect(narrowRes.status()).toBe(422);
  });

  test('6. Unified blind price band (>= 5% spread & 조 unit) on DealCard workspace', async ({
    request,
  }) => {
    const bldId = `bld-w5-band-${Date.now()}`;
    const validRes = await request.patch('/api/broker/workspace/summary', {
      data: {
        action: 'upsert',
        buildingId: bldId,
        card4: {
          region: '서초구 서초동',
          use: '오피스 빌딩',
          area: '연면적 3,000평대',
          priceBand: '1.1~1.3조',
          points: ['테헤란로 인접', '프라임 오피스', '임대수익 안정'],
        },
      },
    });
    expect(validRes.status()).toBe(200);
    await request
      .patch('/api/broker/workspace/summary', {
        data: { action: 'delete_dealcard', buildingId: bldId },
      })
      .catch(() => null);
  });
});
