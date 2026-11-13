import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { generateWeeklyMagazine } from "@/domain/magazine/weekly-generator";
import {
  requireBrokerContext,
  assertOwnsRow,
  notFoundResponse,
  jsonError,
  type BrokerCtx,
} from "@/lib/magazine/authz";
import { resolveBroker } from "@/lib/magazine/resolve-broker";
import { maskPublicAddresses, sanitizeBrokerPhone } from "@/lib/magazine/public-page-data";
import { isUuid } from "@/lib/magazine/slug";
import { currentWeekLabel } from "@/lib/magazine/kst";
import { defaultLabelForEditionType } from "@/lib/magazine/edition-draft";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { parseEditionContentDraft } from "@/domain/magazine/edition-content.schema";
import { loadBrokerNewsletterPreferences } from "@/app/api/broker/magazine/preferences/route";
import { getInboxState } from "@/lib/im-lite/quick-generate-store";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// 공통
// ---------------------------------------------------------------------------

const TOKEN_RE = /^[a-z][a-z0-9_]{0,29}$/;

/** 공개 응답에 허용하는 컬럼 (published 뷰어가 쓰는 컬럼과 동일 — 내부 필드 비노출). */
const PUBLIC_COLUMNS =
  "id, broker_id, edition_type, edition_label, status, title, market_temp, cover_keywords, cover_image_url, field_note, theme_title, theme_body_md, theme_asset_types, theme_color, content, published_at, created_at";

const GetQuerySchema = z.object({
  broker_id: z.string().min(1).max(100),
  type: z.string().regex(TOKEN_RE).default("weekly"),
  status: z.string().regex(TOKEN_RE).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** 로그인한 소유자인지 소프트 판정. 비로그인/불일치는 공개 조회로 취급(fail-closed: published만). */
async function softOwnerContext(request: NextRequest, brokerParam: string): Promise<BrokerCtx | null> {
  const { ctx } = await requireBrokerContext(request);
  if (!ctx) return null;
  return ctx.brokerKeys.includes(brokerParam) ? ctx : null;
}

// ---------------------------------------------------------------------------
// GET /api/magazine/editions
// Query params: broker_id (required), type, status, limit
//  - 공개(비로그인·타 브로커): published만. 그 외 status 요청은 404(존재 비노출).
//  - 소유자(로그인 + 소유 slug/uuid): draft 포함 전체
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = GetQuerySchema.safeParse({
    broker_id: searchParams.get("broker_id") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "broker_id 파라미터가 필요하며 올바른 형식이어야 합니다.", 400);
  }
  const { broker_id: brokerParam, type: editionType, status, limit } = parsed.data;

  const supabase = createServiceClient();

  if (brokerParam === "me") {
    const { ctx, error: authErr } = await requireBrokerContext(request);
    if (authErr || !ctx) {
      return authErr ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    let selfQuery = supabase
      .from("magazine_editions")
      .select("*", { count: "exact" })
      .in("broker_id", ctx.brokerKeys)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (editionType && editionType !== "all") {
      selfQuery = selfQuery.eq("edition_type", editionType);
    }
    if (status) {
      selfQuery = selfQuery.eq("status", status);
    }

    const loadBrokerClientsSafely = async () => {
      try {
        const withEmail = await supabase
          .from("broker_clients")
          .select("id, display_name, phone, email, tier, tags")
          .eq("broker_id", ctx.userId);
        if ((withEmail as any)?.error?.code === "42703") {
          return await supabase
            .from("broker_clients")
            .select("id, display_name, phone, tier, tags")
            .eq("broker_id", ctx.userId);
        }
        return withEmail;
      } catch {
        return { data: null };
      }
    };

    const SUBSCRIBER_SELECT_COLS =
      "id, broker_id, broker_user_id, subscriber_phone, subscriber_email, subscriber_name, status, confirm_status, unsubscribed_at, interest_profile, segment";

    const brokerProfileRes = await Promise.resolve(
      supabase
        .from("broker_profiles")
        .select("user_id, slug, name, card_name")
        .eq("user_id", ctx.userId)
        .maybeSingle()
    ).catch(() => ({ data: null }));

    const brokerProfileRow = (brokerProfileRes?.data ?? null) as {
      user_id?: string | null;
      slug?: string | null;
      name?: string | null;
      card_name?: string | null;
      office_name?: string | null;
      company_name?: string | null;
      phone?: string | null;
      display_name?: string | null;
    } | null;

    const brokerSlug = ctx.slug || brokerProfileRow?.slug?.trim() || "";
    const subBrokerKeys = Array.from(
      new Set([ctx.userId, brokerSlug, ...ctx.brokerKeys].filter((v): v is string => Boolean(v)))
    );

    const loadMagazineSubscribersSafely = async () => {
      const byBrokerIdPromise = Promise.resolve(
        supabase
          .from("magazine_subscribers")
          .select(SUBSCRIBER_SELECT_COLS, { count: "exact" })
          .in("broker_id", subBrokerKeys)
      ).catch(() => ({ data: null, count: null }));

      const byBrokerUserIdPromise = isUuid(ctx.userId)
        ? Promise.resolve(
            supabase
              .from("magazine_subscribers")
              .select(SUBSCRIBER_SELECT_COLS)
              .eq("broker_user_id", ctx.userId)
          ).catch(() => ({ data: null }))
        : Promise.resolve({ data: null });

      const [byIdRes, byUserRes] = await Promise.all([byBrokerIdPromise, byBrokerUserIdPromise]);
      const merged: Array<Record<string, any>> = [];
      const seenIds = new Set<string>();
      for (const row of [
        ...(Array.isArray((byIdRes as any)?.data) ? (byIdRes as any).data : []),
        ...(Array.isArray((byUserRes as any)?.data) ? (byUserRes as any).data : []),
      ]) {
        if (!row || typeof row !== "object") continue;
        const rowId = row.id ? String(row.id) : "";
        if (rowId && seenIds.has(rowId)) continue;
        if (rowId) seenIds.add(rowId);
        merged.push(row);
      }
      return {
        data: merged,
        count: typeof (byIdRes as any)?.count === "number" ? (byIdRes as any).count : null,
      };
    };

    const [{ data, count, error }, subRes, brokerPreferences, brokerClientsRes, clientEventsRes, profileRes] = await Promise.all([
      selfQuery,
      loadMagazineSubscribersSafely(),
      loadBrokerNewsletterPreferences(supabase, ctx.userId),
      loadBrokerClientsSafely(),
      Promise.resolve(
        supabase
          .from("activity_events")
          .select("id, event_type, metadata, created_at")
          .eq("actor_id", ctx.userId)
          .in("event_type", [
            "custom_client_upserted",
            "custom_client_deleted",
            "newsletter_subscription_toggled",
            "magazine_subscribed",
            "magazine_subscribe",
            "magazine_unsubscribed",
          ])
          .order("created_at", { ascending: false })
          .limit(160)
      ).catch(() => ({ data: null })),
      Promise.resolve(
        supabase
          .from("profiles")
          .select("display_name, company, phone")
          .eq("id", ctx.userId)
          .maybeSingle()
      ).catch(() => ({ data: null })),
    ]);

    if (error) {
      log.error("[api/magazine/editions/GET:me]", error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }

    const normalizePhoneKey = (phone?: unknown): string => {
      const rawPhone = typeof phone === "string" ? phone.trim() : "";
      let digits = rawPhone.replace(/\D/g, "");
      if (digits.startsWith("82") && digits.length >= 11) {
        digits = "0" + digits.slice(digits.startsWith("820") ? 3 : 2);
      }
      return digits.length >= 9 ? `tel:${digits}` : "";
    };

    const normalizeEmailKey = (email?: unknown): string => {
      const rawEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      return rawEmail && rawEmail.includes("@") ? `email:${rawEmail}` : "";
    };

    const phoneToCanonical = new Map<string, string>();
    const emailToCanonical = new Map<string, string>();

    const normalizeSubKey = (
      phone?: unknown,
      email?: unknown,
      name?: unknown,
      fallbackId?: unknown
    ): string => {
      const pKey = normalizePhoneKey(phone);
      const eKey = normalizeEmailKey(email);
      const existing =
        (pKey ? phoneToCanonical.get(pKey) : undefined) ||
        (eKey ? emailToCanonical.get(eKey) : undefined);
      const canonical =
        existing ||
        pKey ||
        eKey ||
        (typeof name === "string" && name.trim() ? `name:${name.trim()}` : "") ||
        (typeof fallbackId === "string" && fallbackId.trim() ? `id:${fallbackId.trim()}` : "");
      if (canonical) {
        if (pKey && !phoneToCanonical.has(pKey)) phoneToCanonical.set(pKey, canonical);
        if (eKey && !emailToCanonical.has(eKey)) emailToCanonical.set(eKey, canonical);
      }
      return canonical;
    };

    const extractSubscriberTags = (s: Record<string, any>): string[] => {
      const out: string[] = [];
      const ip = s?.interest_profile;
      if (Array.isArray(ip)) {
        for (const item of ip) {
          if (typeof item === "string" && item.trim()) out.push(item.trim());
        }
      } else if (ip && typeof ip === "object") {
        const ipRec = ip as Record<string, unknown>;
        const rawTags = ipRec.tags;
        if (Array.isArray(rawTags)) {
          for (const t of rawTags) {
            if (typeof t === "string" && t.trim()) out.push(t.trim());
          }
        } else if (rawTags && typeof rawTags === "object") {
          const tagObj = rawTags as Record<string, unknown>;
          for (const arrKey of ["regions", "assetTypes", "topics"] as const) {
            const arr = tagObj[arrKey];
            if (Array.isArray(arr)) {
              for (const v of arr) if (typeof v === "string" && v.trim()) out.push(v.trim());
            }
          }
        }
        for (const arrKey of ["regions", "assetTypes", "topics"] as const) {
          const arr = ipRec[arrKey];
          if (Array.isArray(arr)) {
            for (const v of arr) if (typeof v === "string" && v.trim()) out.push(v.trim());
          }
        }
      }
      if (typeof s?.segment === "string" && s.segment.trim()) {
        out.push(s.segment.trim());
      }
      return out;
    };

    const hasExplicitNewsletterTag = (tags: readonly string[]): boolean =>
      tags.some((t) => /뉴스레터|구독|newsletter|subscribe/i.test(t) && !/수신거부|해지|unsub/i.test(t)) &&
      !tags.some((t) => /수신거부|해지|unsub/i.test(t));

    const subscriberKeys = new Set<string>();
    const vipCandidateKeys = new Set<string>();
    const dbUnsubscribedAt = new Map<string, number>();
    const eventUnsubscribedKeys = new Set<string>();
    const buyerKeys = new Set<string>();
    const sellerKeys = new Set<string>();

    const recordDbUnsub = (k: string, unsubTs: number) => {
      if (!k) return;
      const prev = dbUnsubscribedAt.get(k);
      if (prev === undefined || unsubTs > prev) {
        dbUnsubscribedAt.set(k, unsubTs);
      }
    };

    // 1) activity_events 최신순 파싱: 삭제된 고객(custom_client_deleted) 및 토글 오버라이드(newsletter_subscription_toggled) 수집
    const rawEventRows = Array.isArray((clientEventsRes as any)?.data) ? (clientEventsRes as any).data : [];
    const eventRows = [...rawEventRows].sort((a, b) => {
      const ta = typeof a?.created_at === "string" ? Date.parse(a.created_at) : 0;
      const tb = typeof b?.created_at === "string" ? Date.parse(b.created_at) : 0;
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
      return 0;
    });

    const deletedClientIds = new Set<string>();
    const seenClientLifecycle = new Set<string>();
    const toggleOverrideMap = new Map<string, { subscribed: boolean; ts: number }>();
    const latestCustomClientEvents: Array<{
      cId: string;
      rawCId: string;
      meta: Record<string, unknown>;
      ts: number;
    }> = [];

    const recordToggleOverride = (k: string, subscribed: boolean, ts: number) => {
      if (!k || toggleOverrideMap.has(k)) return;
      toggleOverrideMap.set(k, { subscribed, ts });
    };

    for (const ev of eventRows) {
      const meta = (ev?.metadata && typeof ev.metadata === "object" ? ev.metadata : {}) as Record<string, unknown>;
      const rawTs = typeof ev?.created_at === "string" ? Date.parse(ev.created_at) : Number.NaN;
      const evTs = Number.isFinite(rawTs) ? rawTs : 0;

      if (ev?.event_type === "custom_client_deleted") {
        const delId = String(meta.client_id ?? "").trim();
        const rawDelId = String(meta.raw_client_id ?? delId.replace(/^(?:custom[-_]|cli-)/, "")).trim();
        for (const k of [delId, rawDelId, rawDelId ? `custom_${rawDelId}` : "", rawDelId ? `cli-${rawDelId}` : ""].filter(Boolean)) {
          if (!seenClientLifecycle.has(k)) {
            seenClientLifecycle.add(k);
            deletedClientIds.add(k);
          }
        }
      } else if (ev?.event_type === "newsletter_subscription_toggled") {
        const subVal = Boolean(meta.newsletter_subscribed ?? meta.subscribed);
        const cId = String(meta.client_id ?? meta.thread_id ?? "").trim();
        const rawCId = String(meta.raw_client_id ?? cId.replace(/^(?:custom[-_]|cli-)/, "")).trim();
        const pKey = normalizePhoneKey(meta.client_phone ?? meta.phone);
        const eKey = normalizeEmailKey(meta.client_email ?? meta.email);
        if (cId) recordToggleOverride(cId, subVal, evTs);
        if (rawCId) {
          recordToggleOverride(rawCId, subVal, evTs);
          recordToggleOverride(`custom_${rawCId}`, subVal, evTs);
          recordToggleOverride(`cli-${rawCId}`, subVal, evTs);
        }
        if (pKey) recordToggleOverride(pKey, subVal, evTs);
        if (eKey) recordToggleOverride(eKey, subVal, evTs);
      } else if (
        ev?.event_type === "magazine_subscribed" ||
        ev?.event_type === "magazine_subscribe" ||
        ev?.event_type === "magazine_unsubscribed"
      ) {
        const subVal = ev.event_type !== "magazine_unsubscribed";
        const pKey = normalizePhoneKey(meta.subscriber_phone ?? meta.phone);
        const eKey = normalizeEmailKey(meta.subscriber_email ?? meta.email);
        const fullKey = normalizeSubKey(
          meta.subscriber_phone ?? meta.phone,
          meta.subscriber_email ?? meta.email,
          meta.subscriber_name ?? meta.name
        );
        if (pKey) recordToggleOverride(pKey, subVal, evTs);
        if (eKey) recordToggleOverride(eKey, subVal, evTs);
        if (fullKey) recordToggleOverride(fullKey, subVal, evTs);
      } else if (ev?.event_type === "custom_client_upserted") {
        const cId = String(meta.client_id ?? `custom_${ev.id}`).trim();
        const rawCId = cId.replace(/^(?:custom[-_]|cli-)/, "");
        if (
          seenClientLifecycle.has(cId) ||
          (rawCId && seenClientLifecycle.has(rawCId)) ||
          deletedClientIds.has(cId) ||
          (rawCId && deletedClientIds.has(rawCId))
        ) {
          continue;
        }
        seenClientLifecycle.add(cId);
        if (rawCId) seenClientLifecycle.add(rawCId);
        latestCustomClientEvents.push({ cId, rawCId, meta, ts: evTs });
      }
    }

    const resolveLatestOverride = (...candidateKeys: string[]): { subscribed: boolean; ts: number } | undefined => {
      let best: { subscribed: boolean; ts: number } | undefined;
      for (const ck of candidateKeys) {
        if (!ck) continue;
        const found = toggleOverrideMap.get(ck);
        if (found && (!best || found.ts > best.ts)) {
          best = found;
        }
      }
      return best;
    };

    // 2) magazine_subscribers 집계 (active && !unsubscribed_at && confirm_status !== "pending")
    const subRows = Array.isArray((subRes as any)?.data) ? (subRes as any).data : [];
    for (const s of subRows) {
      const phoneVal = s?.subscriber_phone ?? s?.phone;
      const emailVal = s?.subscriber_email ?? s?.email;
      const nameVal = s?.subscriber_name ?? s?.name;
      const statusVal = String(s?.status ?? "active").toLowerCase();
      const confirmVal = String(s?.confirm_status ?? "").toLowerCase();
      const hasUnsubAt = Boolean(s?.unsubscribed_at);
      const segVal = String(s?.segment ?? "investor").toLowerCase();
      const k = normalizeSubKey(phoneVal, emailVal, nameVal, s?.id);
      const pKey = normalizePhoneKey(phoneVal);
      const eKey = normalizeEmailKey(emailVal);

      if (statusVal === "unsubscribed" || statusVal === "inactive" || hasUnsubAt) {
        const rawTs = Date.parse(String(s?.unsubscribed_at ?? s?.updated_at ?? ""));
        const unsubTs = Number.isFinite(rawTs) ? rawTs : Number.POSITIVE_INFINITY;
        recordDbUnsub(k, unsubTs);
        recordDbUnsub(pKey, unsubTs);
        recordDbUnsub(eKey, unsubTs);
      } else if (statusVal === "active" && confirmVal !== "pending" && k) {
        const subId = s?.id ? String(s.id).trim() : "";
        const override = resolveLatestOverride(subId ? `sub_${subId}` : "", subId, k, pKey, eKey);
        if (override && !override.subscribed) {
          eventUnsubscribedKeys.add(k);
          continue;
        }
        subscriberKeys.add(k);
        const subTags = extractSubscriberTags(s);
        if (
          segVal === "seller" ||
          segVal === "owner" ||
          subTags.some((t) => /매도|건물주|seller|owner/i.test(t))
        ) {
          sellerKeys.add(k);
        } else {
          buyerKeys.add(k);
        }
        if (subTags.some((t) => /^(?:vip|high_interest)$/i.test(t) || /고관심|핫리드/i.test(t))) {
          vipCandidateKeys.add(k);
        }
      }
    }
    if (subRows.length === 0 && typeof subRes?.count === "number" && subRes.count > 0) {
      for (let i = 0; i < subRes.count; i++) {
        subscriberKeys.add(`mag-sub-${i}`);
      }
    }

    // 3) broker_clients 집계 (PIPA: isVip 자동 opt-in 제거 — 명시적 구독 동의 또는 토글 오버라이드만 인정)
    const dbClientRows = Array.isArray((brokerClientsRes as any)?.data) ? (brokerClientsRes as any).data : [];
    for (const c of dbClientRows) {
      const rawId = String(c?.id ?? "").trim();
      const cliKey = rawId ? `cli-${rawId}` : "";
      const customKey = rawId ? `custom_${rawId}` : "";
      if (
        (rawId && deletedClientIds.has(rawId)) ||
        (cliKey && deletedClientIds.has(cliKey)) ||
        (customKey && deletedClientIds.has(customKey))
      ) {
        continue;
      }
      const tags = Array.isArray(c?.tags) ? c.tags.map((t: unknown) => String(t)) : [];
      const isVip =
        String(c?.tier || "").toLowerCase() === "vip" ||
        tags.some((t: string) => /^(?:vip|high_interest)$/i.test(t) || /고관심|핫리드/i.test(t));
      const key = normalizeSubKey(c?.phone, c?.email, c?.display_name, c?.id);
      if (!key) continue;
      if (isVip) vipCandidateKeys.add(key);

      const pKey = normalizePhoneKey(c?.phone);
      const eKey = normalizeEmailKey(c?.email);
      const override = resolveLatestOverride(cliKey, rawId, customKey, key, pKey, eKey);
      const explicitRowOptIn =
        (c as Record<string, unknown>)?.newsletter_subscribed === true ||
        (c as Record<string, unknown>)?.newsletterSubscribed === true ||
        hasExplicitNewsletterTag(tags);
      const explicitRowOptOut =
        (c as Record<string, unknown>)?.newsletter_subscribed === false ||
        (c as Record<string, unknown>)?.newsletterSubscribed === false ||
        tags.some((t: string) => /수신거부|해지|unsub/i.test(t));

      const subscribed = override ? override.subscribed : explicitRowOptIn;
      if (subscribed) {
        if (override && override.ts > 0) {
          for (const uk of [key, pKey, eKey].filter(Boolean)) {
            const prevDbUnsub = dbUnsubscribedAt.get(uk);
            if (prevDbUnsub !== undefined && override.ts > prevDbUnsub) {
              dbUnsubscribedAt.delete(uk);
            }
          }
        }
        subscriberKeys.add(key);
        if (tags.some((t: string) => /매도|건물주|seller|owner/i.test(t))) {
          sellerKeys.add(key);
        } else {
          buyerKeys.add(key);
        }
      } else if ((override && !override.subscribed) || explicitRowOptOut) {
        eventUnsubscribedKeys.add(key);
      }
    }

    // 4) custom_client_upserted 및 인메모리 customClients 집계 (PIPA: newsletter_subscribed === true 또는 토글 ON만 인정)
    const handledCustomIds = new Set<string>();
    for (const item of latestCustomClientEvents) {
      const { cId, rawCId, meta, ts } = item;
      handledCustomIds.add(cId);
      if (rawCId) handledCustomIds.add(rawCId);

      const key = normalizeSubKey(
        meta.client_phone ?? meta.phone,
        meta.client_email ?? meta.email,
        meta.client_name ?? meta.name,
        cId
      );
      if (!key) continue;

      const isVip =
        String(meta.client_grade ?? meta.grade ?? meta.tier ?? "").toUpperCase() === "VIP";
      if (isVip) vipCandidateKeys.add(key);

      const pKey = normalizePhoneKey(meta.client_phone ?? meta.phone);
      const eKey = normalizeEmailKey(meta.client_email ?? meta.email);
      const customTags = Array.isArray(meta.tags) ? meta.tags.map((t: unknown) => String(t)) : [];
      const override = resolveLatestOverride(cId, rawCId, rawCId ? `custom_${rawCId}` : "", key, pKey, eKey);
      const explicitOptIn =
        meta.newsletter_subscribed === true ||
        meta.newsletterSubscribed === true ||
        hasExplicitNewsletterTag(customTags);
      const explicitOptOut =
        meta.newsletter_subscribed === false ||
        meta.newsletterSubscribed === false ||
        customTags.some((t) => /수신거부|해지|unsub/i.test(t));

      const subscribed = override ? override.subscribed : explicitOptIn;
      if (subscribed) {
        const effTs = override?.ts || ts;
        if (effTs > 0) {
          for (const uk of [key, pKey, eKey].filter(Boolean)) {
            const prevDbUnsub = dbUnsubscribedAt.get(uk);
            if (prevDbUnsub !== undefined && effTs > prevDbUnsub) {
              dbUnsubscribedAt.delete(uk);
            }
          }
        }
        subscriberKeys.add(key);
        buyerKeys.add(key);
      } else if ((override && !override.subscribed) || explicitOptOut) {
        eventUnsubscribedKeys.add(key);
      }
    }

    // 이벤트만으로 수신동의한 구독자(magazine_subscribed / magazine_subscribe / toggle ON with tel/email) 반영
    for (const [ovKey, ovVal] of toggleOverrideMap.entries()) {
      if (!ovKey.startsWith("tel:") && !ovKey.startsWith("email:")) continue;
      const canonical =
        (ovKey.startsWith("tel:") ? phoneToCanonical.get(ovKey) : emailToCanonical.get(ovKey)) || ovKey;
      if (ovVal.subscribed) {
        const prevDbUnsub = dbUnsubscribedAt.get(canonical) ?? dbUnsubscribedAt.get(ovKey);
        if (prevDbUnsub !== undefined && ovVal.ts > 0 && ovVal.ts > prevDbUnsub) {
          dbUnsubscribedAt.delete(canonical);
          dbUnsubscribedAt.delete(ovKey);
        }
        subscriberKeys.add(canonical);
        if (!sellerKeys.has(canonical)) buyerKeys.add(canonical);
      } else {
        eventUnsubscribedKeys.add(canonical);
      }
    }

    const inboxCustomClients = (getInboxState().customClients || []).filter(
      (c) => Boolean(c.ownerId) && c.ownerId === ctx.userId
    );
    for (const c of inboxCustomClients) {
      const cId = String(c.id || "").trim();
      const rawCId = cId.replace(/^(?:custom[-_]|cli-)/, "");
      if (
        (cId && (deletedClientIds.has(cId) || handledCustomIds.has(cId))) ||
        (rawCId && (deletedClientIds.has(rawCId) || handledCustomIds.has(rawCId)))
      ) {
        continue;
      }
      const key = normalizeSubKey(c.clientPhone, undefined, c.clientName, c.id);
      if (!key) continue;
      if (c.clientGrade === "VIP") vipCandidateKeys.add(key);

      const pKey = normalizePhoneKey(c.clientPhone);
      const override = resolveLatestOverride(cId, rawCId, key, pKey);
      const subscribed = override ? override.subscribed : c.newsletterSubscribed === true;
      const cTs = typeof c.createdAt === "string" ? Date.parse(c.createdAt) : Number.NaN;

      if (subscribed) {
        const effTs = override?.ts || (Number.isFinite(cTs) ? cTs : 0);
        if (effTs > 0) {
          for (const uk of [key, pKey].filter(Boolean)) {
            const prevDbUnsub = dbUnsubscribedAt.get(uk);
            if (prevDbUnsub !== undefined && effTs > prevDbUnsub) {
              dbUnsubscribedAt.delete(uk);
            }
          }
        }
        subscriberKeys.add(key);
        buyerKeys.add(key);
      } else if ((override && !override.subscribed) || c.newsletterSubscribed === false) {
        eventUnsubscribedKeys.add(key);
      }
    }

    for (const rawUk of [...dbUnsubscribedAt.keys(), ...eventUnsubscribedKeys]) {
      const canonicalUk =
        (rawUk.startsWith("tel:") ? phoneToCanonical.get(rawUk) : undefined) ||
        (rawUk.startsWith("email:") ? emailToCanonical.get(rawUk) : undefined) ||
        rawUk;
      for (const uk of [rawUk, canonicalUk]) {
        subscriberKeys.delete(uk);
        buyerKeys.delete(uk);
        sellerKeys.delete(uk);
      }
    }

    const highInterestKeys = new Set<string>();
    for (const vk of vipCandidateKeys) {
      if (subscriberKeys.has(vk)) {
        highInterestKeys.add(vk);
      }
    }

    const prof = (profileRes?.data ?? null) as {
      display_name?: string | null;
      company?: string | null;
      phone?: string | null;
    } | null;

    const brokerName =
      ctx.displayName ||
      brokerProfileRow?.name?.trim() ||
      prof?.display_name?.trim() ||
      brokerProfileRow?.display_name?.trim() ||
      "";
    const brokerOffice =
      prof?.company?.trim() ||
      brokerProfileRow?.office_name?.trim() ||
      brokerProfileRow?.company_name?.trim() ||
      "";
    const brokerPhone = sanitizeBrokerPhone(prof?.phone || brokerProfileRow?.phone || "");

    return NextResponse.json({
      editions: data ?? [],
      total: count ?? 0,
      brokerId: ctx.userId,
      brokerSlug,
      hasSlug: Boolean(brokerSlug),
      brokerName,
      brokerOffice,
      brokerPhone,
      subscriberCount: subscriberKeys.size,
      highInterestCount: highInterestKeys.size,
      segmentCounts: {
        all: subscriberKeys.size,
        buyer: buyerKeys.size,
        seller: sellerKeys.size,
      },
      brokerPreferences,
    });
  }

  const owner = await softOwnerContext(request, brokerParam);

  let keys: string[];
  let columns: string;
  let effectiveStatus: string | undefined = status;

  if (owner) {
    keys = owner.brokerKeys;
    columns = "*";
  } else {
    if (status && status !== "published") return notFoundResponse();
    effectiveStatus = "published";
    columns = PUBLIC_COLUMNS;
    try {
      const broker = await resolveBroker(supabase, brokerParam);
      if (!broker) return notFoundResponse();
      keys = Array.from(new Set([broker.slug, broker.userId].filter((k): k is string => !!k)));
    } catch (e) {
      log.error("[api/magazine/editions/GET] resolveBroker", e instanceof Error ? e.message : String(e));
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
  }

  let query = supabase
    .from("magazine_editions")
    .select(columns, { count: "exact" })
    .in("broker_id", keys)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (editionType && editionType !== "all") {
    query = query.eq("edition_type", editionType);
  }

  if (effectiveStatus) {
    query = query.eq("status", effectiveStatus);
  }

  const { data, count, error } = await query;

  if (error) {
    log.error("[api/magazine/editions/GET]", error.message);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }

  const rawRows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const responseEditions = !owner
    ? rawRows.map((row) =>
        row && row.content && typeof row.content === "object" && !Array.isArray(row.content)
          ? { ...row, content: maskPublicAddresses(row.content as Record<string, unknown>) }
          : row
      )
    : rawRows;

  return NextResponse.json({ editions: responseEditions, total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// POST /api/magazine/editions
// Body: { edition_type?, edition_label? }   ← body.broker_id는 무시(서버가 ctx로 결정, S2-05)
// ---------------------------------------------------------------------------
const PostBodySchema = z.object({
  edition_type: z.string().regex(TOKEN_RE).default("weekly"),
  edition_label: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _.\-]{0,39}$/)
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request, { requireSlug: true });
    if (authError || !ctx || !ctx.slug) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }
    const parsed = PostBodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return jsonError("INVALID_INPUT", "입력값을 확인해 주세요.", 400);
    }
    const editionType = parsed.data.edition_type;
    const editionLabel = parsed.data.edition_label ?? defaultLabelForEditionType(editionType);
    const brokerId = ctx.slug; // body.broker_id 무시

    const supabase = createServiceClient();

    // 이미 발행된 동일 호수를 재생성(upsert 덮어쓰기)하지 못하게 차단 — 정정 발행은 Wave 2
    const { data: existing, error: exErr } = await supabase
      .from("magazine_editions")
      .select("id, status")
      .in("broker_id", ctx.brokerKeys)
      .eq("edition_type", editionType)
      .eq("edition_label", editionLabel)
      .limit(5);
    if (exErr) {
      log.error("[api/magazine/editions/POST] existing lookup", exErr.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    if ((existing ?? []).some((r: { status?: string | null }) => r.status === "published")) {
      return jsonError("PUBLISHED_LOCKED", "이미 발행된 호수입니다. 정정이 필요하면 정정 발행을 이용해 주세요.", 409);
    }

    // Generate magazine content via domain generator
    const edition = await generateWeeklyMagazine({
      supabase,
      brokerId,
      editionType,
      editionLabel,
    });

    return NextResponse.json({ edition }, { status: 201 });
  } catch (err: unknown) {
    log.error("[api/magazine/editions/POST]", err);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/magazine/editions
// Body: { id, ...updates }
//  - 소유권 확인(불일치/없음 404), zod 검증, published 잠금(draft 복귀 금지)
// ---------------------------------------------------------------------------

const PatchBodySchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(300).optional(),
    field_note: z.record(z.string(), z.unknown()).nullable().optional(),
    theme_title: z.string().max(300).nullable().optional(),
    theme_body_md: z.string().max(30000).nullable().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["draft", "published"]).optional(),
    market_temp: z.string().max(30).nullable().optional(),
    cover_keywords: z.array(z.string().max(60)).max(20).optional(),
    featured_deal_ids: z.array(z.string().max(100)).max(100).optional(),
    cover_image_url: z.string().max(2000).nullable().optional(),
    theme_color: z.string().max(30).nullable().optional(),
    target_segments: z.array(z.enum(["all", "buyer", "seller"])).max(3).optional(),
    /** 낙관적 동시성: 마지막으로 본 updated_at (null=아직 없음). 생략하면 검사하지 않는다. */
    expected_updated_at: z.string().max(64).nullable().optional(),
  });

const UPDATE_FIELDS = [
  "title",
  "field_note",
  "theme_title",
  "theme_body_md",
  "content",
  "status",
  "market_temp",
  "cover_keywords",
  "featured_deal_ids",
  "cover_image_url",
  "theme_color",
  "target_segments",
] as const;

/** 저장 본문 상한 (남용 방지) */
const MAX_PATCH_BYTES = 600 * 1024;

export async function PATCH(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let raw: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_PATCH_BYTES) return jsonError("PAYLOAD_TOO_LARGE", "본문이 너무 큽니다.", 413);
      raw = JSON.parse(text);
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }

    const parsed = PatchBodySchema.safeParse(raw);
    if (!parsed.success) {
      const idBad = parsed.error.issues.some((i) => i.path[0] === "id");
      return jsonError("INVALID_INPUT", idBad ? "id 필드가 필요합니다." : "입력값을 확인해 주세요.", 400);
    }
    const { id } = parsed.data;
    const expectedUpdatedAt = parsed.data.expected_updated_at;

    if (parsed.data.status === "published") {
      return NextResponse.json(
        { error: "Direct publish via PATCH is disallowed. Use POST /api/magazine/editions/[id]/publish" },
        { status: 400 },
      );
    }

    if (parsed.data.content !== undefined) {
      const draft = parseEditionContentDraft(parsed.data.content);
      if (!draft.ok) {
        return jsonError("INVALID_CONTENT", `콘텐츠 형식이 올바르지 않습니다: ${draft.issues[0]}`, 400);
      }
    }

    // Pick only allowed fields
    const updates: Record<string, unknown> = {};
    for (const key of UPDATE_FIELDS) {
      if (parsed.data[key] !== undefined) {
        updates[key] = parsed.data[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("INVALID_INPUT", "업데이트할 필드가 없습니다.", 400);
    }

    const supabase = createServiceClient();

    // 소유권 확인 — 타 브로커/없음 모두 404
    const existing = await assertOwnsRow<{ id: string; status: string | null }>(
      supabase,
      "magazine_editions",
      id,
      ctx,
      { select: "id, status" },
    );
    if (!existing) return notFoundResponse();

    // 상태 전이 검증: 발행본은 PATCH로 draft 복귀 불가 (정정 발행은 Wave 2)
    if (existing.status === "published" && updates.status !== undefined && updates.status !== "published") {
      return jsonError(
        "PUBLISHED_LOCKED",
        "이미 발행된 호수는 초안으로 되돌릴 수 없습니다. 정정이 필요하면 정정 발행을 이용해 주세요.",
        409,
      );
    }

    // 발행본의 본문(content)은 PATCH로 바꿀 수 없다 — 정정 발행(/[id]/publish, correction)만 공개 행과 함께 갱신 (E-01)
    if (existing.status === "published" && updates.content !== undefined) {
      return jsonError(
        "PUBLISHED_LOCKED",
        "이미 발행된 호수의 본문은 저장으로 바꿀 수 없습니다. 정정이 필요하면 정정 발행을 이용해 주세요.",
        409,
      );
    }

    updates.updated_at = new Date().toISOString();

    let updateQuery = supabase
      .from("magazine_editions")
      .update(updates)
      .eq("id", id)
      .in("broker_id", ctx.brokerKeys);
    // 낙관적 동시성: 클라이언트가 마지막으로 본 updated_at 과 같을 때만 쓴다 (E-01, 다른 탭 덮어쓰기 방지)
    if (expectedUpdatedAt !== undefined) {
      updateQuery = expectedUpdatedAt === null ? updateQuery.is("updated_at", null) : updateQuery.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await updateQuery.select().maybeSingle();

    if (error) {
      log.error("[api/magazine/editions/PATCH]", error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    if (!data) {
      if (expectedUpdatedAt !== undefined) {
        const current = await assertOwnsRow<{ id: string; updated_at: string | null }>(
          supabase,
          "magazine_editions",
          id,
          ctx,
          { select: "id, updated_at" },
        );
        if (current) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "EDIT_CONFLICT",
                message: "다른 탭이나 기기에서 이 매거진이 수정되었습니다. 새로고침한 뒤 다시 편집해 주세요.",
              },
              currentUpdatedAt: current.updated_at,
            },
            { status: 409 },
          );
        }
      }
      return notFoundResponse();
    }

    return NextResponse.json({ edition: data });
  } catch (err: unknown) {
    log.error("[api/magazine/editions/PATCH]", err);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/magazine/editions?id=<uuid> (또는 JSON body { id })
//  - 인증된 브로커 본인의 에디션만 삭제 허용 (타 브로커/미존재 시 404)
// ---------------------------------------------------------------------------
const DeleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) {
      return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    let candidateId = request.nextUrl.searchParams.get("id") ?? undefined;
    if (!candidateId) {
      try {
        const text = await request.text();
        const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        if (typeof body.id === "string") candidateId = body.id;
      } catch {
        return jsonError("INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.", 400);
      }
    }

    const parsed = DeleteSchema.safeParse({ id: candidateId });
    if (!parsed.success) {
      return jsonError("INVALID_INPUT", "삭제할 에디션 ID(UUID)가 필요합니다.", 400);
    }
    const { id } = parsed.data;

    const supabase = createServiceClient();
    const owned = await assertOwnsRow<{ id: string }>(supabase, "magazine_editions", id, ctx);
    if (!owned) return notFoundResponse();

    const { error: deleteErr } = await supabase
      .from("magazine_editions")
      .delete()
      .eq("id", id)
      .in("broker_id", ctx.brokerKeys);

    if (deleteErr) {
      log.error("[api/magazine/editions/DELETE]", deleteErr.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }

    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    log.error("[api/magazine/editions/DELETE]", err);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
