import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import {
  getQuickImRecord,
  isUuid,
} from "@/lib/im-lite/quick-generate-store";
import {
  assertLegacyOrDbOwnership,
  getWorkspaceItemByAnyId,
  WorkspaceRepositoryError,
} from "@/lib/workspace/workspace-repository";
import {
  buildBrokerProfileMeta,
  isWorkspaceMemoryEnabled,
  type BrokerProfileMeta,
  type ImSummaryItem,
} from "@/lib/workspace/summary/types-and-helpers";
import { handleGetWorkspaceSummary } from "@/lib/workspace/summary/get-summary";
import {
  handleMemoOnlyActions,
  handlePatchWorkspaceLifecycle,
} from "@/lib/workspace/summary/patch-lifecycle";
import { handlePatchWorkspaceUpsert } from "@/lib/workspace/summary/patch-upsert";

export type { ImSummaryItem };

async function fetchVerifiedBrokerProfileMeta(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<BrokerProfileMeta | null> {
  if (!supabase || typeof supabase.from !== "function") return null;
  try {
    const fetchBpRow = async () => {
      const full = await supabase
        .from("broker_profiles")
        .select(
          "office_address, representative_name, office_reg_number, license_number, slug, photo_url, card_name, contact_email"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (full?.error && (full.error.code === "42703" || full.error.code === "PGRST204")) {
        return await supabase
          .from("broker_profiles")
          .select(
            "office_reg_number, license_number, slug, photo_url, card_name, contact_email"
          )
          .eq("user_id", userId)
          .maybeSingle();
      }
      return full;
    };
    const [{ data: pRow }, { data: bpRow }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, company, phone, photo_url")
        .eq("id", userId)
        .maybeSingle(),
      fetchBpRow(),
    ]);
    return buildBrokerProfileMeta(pRow, bpRow);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error || !auth.user) return auth.error!;
  const userId = auth.user.id;
  const supabase = createServiceClient();
  const targetId =
    request.nextUrl.searchParams.get("buildingId") ||
    request.nextUrl.searchParams.get("id");

  const brokerProfile = await fetchVerifiedBrokerProfileMeta(supabase, userId);

  const payload = await handleGetWorkspaceSummary({
    supabase,
    userId,
    role: auth.role || "broker",
    targetId,
    brokerProfile,
  });

  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error || !auth.user) return auth.error!;

  const body = (await request.json().catch(() => null)) as Record<string, any> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const action = (body.action as string | undefined) || "upsert";
  const supabase = createServiceClient();

  const memoRes = await handleMemoOnlyActions({
    supabase,
    userId: auth.user.id,
    role: auth.role || "broker",
    body,
    action,
    brokerProfileMeta: undefined,
  });
  if (memoRes) return memoRes;

  const incomingImObj =
    body.imItem && typeof body.imItem === "object"
      ? (body.imItem as Record<string, any>)
      : body.item && typeof body.item === "object"
      ? (body.item as Record<string, any>)
      : null;
  const buildingId = (body.buildingId ||
    incomingImObj?.buildingId ||
    incomingImObj?.id ||
    body.id) as string | undefined;

  if (!buildingId) {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
  }

  const existingQuick = isWorkspaceMemoryEnabled()
    ? getQuickImRecord(buildingId) ||
      (incomingImObj?.id ? getQuickImRecord(String(incomingImObj.id)) : null)
    : null;

  let uuidOwnerVerified = false;
  if (isUuid(buildingId)) {
    const ownerCheck = await assertBuildingOwner(supabase, buildingId, auth.user.id, {
      allowAdmin: true,
      role: auth.role || "broker",
    });
    if (!ownerCheck.ok) {
      if (ownerCheck.status === 403) {
        return ownerCheck.response;
      }
      // WP-7.3C P2: repository errors must surface as JSON, not an unhandled 500.
      let wsExisting: Awaited<ReturnType<typeof getWorkspaceItemByAnyId>> = null;
      try {
        wsExisting = await getWorkspaceItemByAnyId(supabase, buildingId);
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json(
            { ok: false, error: err.message, code: err.code },
            { status: err.status }
          );
        }
        return NextResponse.json(
          { ok: false, error: "작업 항목 조회에 실패했습니다.", code: "DB_READ_FAILED" },
          { status: 500 }
        );
      }
      if (wsExisting) {
        if (wsExisting.ownerId !== auth.user.id && auth.role !== "admin") {
          return NextResponse.json(
            { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
            { status: 403 }
          );
        }
        uuidOwnerVerified = true;
      } else {
        if (action === "upsert") {
          return ownerCheck.response;
        }
        if (
          existingQuick?.ownerId &&
          existingQuick.ownerId !== auth.user.id &&
          auth.role !== "admin"
        ) {
          return NextResponse.json(
            { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
            { status: 403 }
          );
        }
      }
    } else {
      uuidOwnerVerified = true;
    }
  } else if (
    existingQuick?.ownerId &&
    existingQuick.ownerId !== auth.user.id &&
    auth.role !== "admin"
  ) {
    return NextResponse.json(
      { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  try {
    await assertLegacyOrDbOwnership(supabase, {
      id: buildingId,
      userId: auth.user.id,
      isAdmin: auth.role === "admin",
      requireExisting: false,
    });
  } catch (err) {
    if (err instanceof WorkspaceRepositoryError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json({ ok: false, error: "권한 확인 실패" }, { status: 500 });
  }

  // 클라이언트 body.brokerProfile 위변조 차단: DB에서 검증된 공인중개사 프로필만 주입한다.
  const brokerProfileMeta =
    (await fetchVerifiedBrokerProfileMeta(supabase, auth.user.id)) || undefined;

  const baseCtx = {
    supabase,
    userId: auth.user.id,
    role: auth.role || "broker",
    body,
    action,
    brokerProfileMeta,
    buildingId,
    uuidOwnerVerified,
  };

  const lifecycleRes = await handlePatchWorkspaceLifecycle(baseCtx);
  if (lifecycleRes) return lifecycleRes;

  return handlePatchWorkspaceUpsert(baseCtx);
}
