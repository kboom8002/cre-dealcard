import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { recordEvent } from "@/domain/analytics/record-event";

export interface LogGateAccessInput {
  gateRequestId: string;
  accessorId: string;
  buildingId: string;
  accessedFields: string[];
  accessType: 'view' | 'download' | 'share' | 'copy';
  ipAddress?: string;
  userAgent?: string;
}

export function hashIp(ip: string): string {
  if (!ip) return "";
  return createHash("sha256").update(ip).digest("hex");
}

export async function logGateAccess(
  supabase: SupabaseClient,
  input: LogGateAccessInput
): Promise<boolean> {
  const ipHash = input.ipAddress ? hashIp(input.ipAddress) : null;

  // 1. gate_access_log 테이블에 감사 트레일 저장
  const { error: insertError } = await supabase
    .from("gate_access_log")
    .insert({
      gate_request_id: input.gateRequestId,
      accessor_id: input.accessorId,
      building_id: input.buildingId,
      accessed_fields: input.accessedFields,
      access_type: input.accessType,
      ip_hash: ipHash,
      user_agent: input.userAgent ?? null,
    });

  if (insertError) {
    console.error("[logGateAccess] Failed to write access log:", insertError.message);
    return false;
  }

  // 2. 통합 활동 이벤트 로깅 (recordEvent 호출)
  // 'gate_request_reviewed' 타입을 임시 활용하거나,
  // recordEvent의 MvpEventType에 'gate_accessed'가 정의되어 있다면 그것을 씁니다.
  await recordEvent(supabase, {
    actorId: input.accessorId,
    eventType: "gate_request_reviewed", // or "gate_accessed" (타입 수정 후)
    entityType: "gate_request",
    entityId: input.gateRequestId,
    metadata: {
      building_id: input.buildingId,
      access_type: input.accessType,
      accessed_fields_count: input.accessedFields.length,
    },
  });

  return true;
}
