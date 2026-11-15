import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { createModuleLogger } from "@/lib/logger";
import { z } from "zod/v4";

const log = createModuleLogger("broker-client-contacts-item");
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const UpdateSchema = z.object({
  contact_type: z.string().optional(),
  summary: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const brokerId = guard.user!.id;

    const { id, contactId } = await params;
    if (!id || !contactId || !SAFE_ID_RE.test(id) || !SAFE_ID_RE.test(contactId)) {
      return NextResponse.json({ error: "유효하지 않은 요청입니다." }, { status: 400 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const parsed = UpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "입력 항목을 확인해주세요." }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Verify parent client belongs to caller
    const { data: parentClient, error: clientErr } = await serviceClient
      .from("broker_clients")
      .select("id")
      .eq("id", id)
      .eq("broker_id", brokerId)
      .maybeSingle();

    if (clientErr) {
      log.error("Parent client lookup failed", { id, error: clientErr.message });
      return NextResponse.json({ error: "고객 정보를 확인하지 못했습니다." }, { status: 500 });
    }
    if (!parentClient) {
      return NextResponse.json({ error: "연락 이력을 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: updatedRows, error } = await serviceClient
      .from("contact_history")
      .update(parsed.data)
      .eq("id", contactId)
      .eq("client_id", id)
      .eq("broker_id", brokerId)
      .select("id");

    if (error) {
      log.error("Contact history update failed", { id, contactId, error: error.message });
      return NextResponse.json({ error: "연락 이력 수정에 실패했습니다." }, { status: 500 });
    }

    const matched = Array.isArray(updatedRows) ? updatedRows.length > 0 : Boolean(updatedRows);
    if (!matched) {
      return NextResponse.json({ error: "연락 이력을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    log.error("PATCH contact_history unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const brokerId = guard.user!.id;

    const { id, contactId } = await params;
    if (!id || !contactId || !SAFE_ID_RE.test(id) || !SAFE_ID_RE.test(contactId)) {
      return NextResponse.json({ error: "유효하지 않은 요청입니다." }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Verify parent client belongs to caller
    const { data: parentClient, error: clientErr } = await serviceClient
      .from("broker_clients")
      .select("id")
      .eq("id", id)
      .eq("broker_id", brokerId)
      .maybeSingle();

    if (clientErr) {
      log.error("Parent client lookup failed on DELETE", { id, error: clientErr.message });
      return NextResponse.json({ error: "고객 정보를 확인하지 못했습니다." }, { status: 500 });
    }
    if (!parentClient) {
      return NextResponse.json({ error: "연락 이력을 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: deletedRows, error } = await serviceClient
      .from("contact_history")
      .delete()
      .eq("id", contactId)
      .eq("client_id", id)
      .eq("broker_id", brokerId)
      .select("id");

    if (error) {
      log.error("Contact history delete failed", { id, contactId, error: error.message });
      return NextResponse.json({ error: "연락 이력 삭제에 실패했습니다." }, { status: 500 });
    }

    const matched = Array.isArray(deletedRows) ? deletedRows.length > 0 : Boolean(deletedRows);
    if (!matched) {
      return NextResponse.json({ error: "연락 이력을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    log.error("DELETE contact_history unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
