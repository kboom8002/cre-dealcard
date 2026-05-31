import { z } from "zod";

// 실제 API에서 반환되는 payload 그대로 복사
const rawPayload = {
  "handoff_id": "400eede3-5903-409a-9cb4-72a6a78d764a",
  "handoff_token": "73b7ea41a9075237a13fef70efbbedd75616a60a936dfafbe8e95d31f8e0fb71",
  "status": "pending_import",
  "source_app": "js-building-ssot-mvp",
  "source_app_version": "0.1.0",
  "contracts_version": "0.2.0",
  "payload_version": "1.0",
  "source_building_ssot_lite_id": "03f44849-2777-4345-9342-d204b785d750",
  "source_document_ids": ["8bb8e859-97ad-4762-b439-5506855b346d"],
  "requested_output": "buyer_ready_full_im",
  "package_intent": "ai_expert_review",
  "actor_role": "broker",
  "source_visibility_level": "internal_only",
  "allowed_import_scope": ["building_ssot_lite"],
  "expires_at": "2026-05-19T06:42:05.381208+00:00",
  "created_at": "2026-05-12T06:42:05.381208+00:00",
  "building_ssot_lite": {
    "id": "03f44849-2777-4345-9342-d204b785d750",
    "status": "public_signal_ready"
  }
};

const FullIMHandoffPayloadSchema = z.object({
  handoff_id: z.string(),
  handoff_token: z.string(),
  source_app: z.literal("js-building-ssot-mvp"),
  source_app_version: z.string().optional(),
  contracts_version: z.string(),
  payload_version: z.string().default("1.0"),
  source_building_ssot_lite_id: z.string(),
  source_document_ids: z.array(z.string()).default([]),
  source_buyer_intent_id: z.string().optional(),
  source_owner_readiness_id: z.string().optional(),
  source_expert_note_request_id: z.string().optional(),
  requested_output: z.enum([
    "im_lite", "buyer_ready_full_im", "expert_review",
    "expert_full_build", "dealroom_ready_package"
  ]),
  package_intent: z.enum([
    "ai_self_authoring", "ai_expert_review", "expert_full_build",
    "dealroom_ready_package", "unknown"
  ]).default("unknown"),
  created_by: z.string().optional(),
  actor_role: z.enum(["public_user", "owner", "broker", "admin", "system"]),
  source_visibility_level: z.enum([
    "public", "public_blind", "registered_interest", "qualified_summary",
    "gate_restricted", "internal_only", "private_truth"
  ]),
  allowed_import_scope: z.array(z.enum([
    "building_ssot_lite", "source_documents", "buyer_intent",
    "owner_readiness", "expert_note", "evidence_refs"
  ])).default(["building_ssot_lite"]),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime()
});

const result = FullIMHandoffPayloadSchema.safeParse(rawPayload);
if (result.success) {
  console.log("✅ Schema parse SUCCESS");
} else {
  console.log("❌ Schema parse FAILED:");
  console.log(JSON.stringify(result.error.issues, null, 2));
}

// Test datetime parsing
console.log("\n--- Datetime tests ---");
const dtSchema = z.string().datetime();
const testDates = [
  "2026-05-19T06:42:05.381208+00:00",
  "2026-05-19T06:42:05.381208Z",
  "2026-05-19T06:42:05Z",
  "2026-05-19T06:42:05+09:00",
];
for (const d of testDates) {
  const r = dtSchema.safeParse(d);
  console.log(`${d}: ${r.success ? "✅" : "❌ " + r.error.issues[0]?.message}`);
}
