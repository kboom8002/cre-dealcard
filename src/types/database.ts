/**
 * Database types for JS Building SSoT MVP v0.1
 * Generated from docs/07-database-schema.md
 *
 * These types mirror the Supabase Postgres schema.
 * In production, use `supabase gen types typescript` to keep in sync.
 */

// ---- Enums / Union Types ----

export type UserRole = "public_user" | "broker" | "admin" | "expert";

export type InputType = "address" | "broker_memo" | "voice_note" | "manual_form";

export type BuildingSsotStatus =
  | "draft"
  | "public_signal_ready"
  | "snapshot_draft_ready"
  | "archived";

export type Visibility =
  | "public"
  | "public_blind"
  | "gate_restricted"
  | "internal_only"
  | "private_truth";

export type DocumentStatus =
  | "draft"
  | "disclosure_checked"
  | "broker_reviewed"
  | "approved_internal"
  | "shared_external"
  | "archived";

export type DocumentType =
  | "deal_curiosity_report"
  | "blind_teaser"
  | "buyer_fit_memo"
  | "owner_prep_memo"
  | "missing_data_checklist"
  | "gate_request_note";

export type SourceType =
  | "building_ssot_lite"
  | "buyer_intent_lite"
  | "owner_readiness_check"
  | "gate_request"
  | "manual";

export type GateLevel = "G1" | "G2" | "G3";

export type GateRequestStatus =
  | "submitted"
  | "broker_review"
  | "approved"
  | "rejected"
  | "expired";

export type ExpertNoteStatus =
  | "requested"
  | "in_review"
  | "completed"
  | "cancelled";

export type RiskTolerance = "low" | "medium" | "high" | "unknown";

export type BuyerIntentVisibility =
  | "private"
  | "broker_only"
  | "anonymous_matchable";

export type EvidenceVisibility =
  | "private"
  | "expert_only"
  | "gate_restricted"
  | "public_redacted";

export type AiRunStatus = "started" | "completed" | "failed";

// ---- Row Types ----

export interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
  phone: string | null;
  company: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrokerProfile {
  id: string;
  user_id: string;
  specialty_regions: string[];
  specialty_assets: string[];
  bio: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface BuildingSsotLite {
  id: string;
  owner_id: string | null;
  created_by_role: string;
  input_type: InputType;
  raw_input: string;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
  size_signal: string | null;
  current_use_signal: string | null;
  vacancy_signal: string | null;
  fit_summary: string | null;
  caution_summary: string | null;
  hidden_fields: string[];
  layers: Record<string, unknown>;
  confidence: Record<string, unknown>;
  disclosure: Record<string, unknown>;
  status: BuildingSsotStatus;
  created_at: string;
  updated_at: string;
}

export interface BuildingSignalCard {
  id: string;
  building_id: string;
  owner_id: string | null;
  title: string;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
  deal_points: string[];
  caution_points: string[];
  buyer_fit_types: string[];
  visibility: Visibility;
  status: DocumentStatus;
  body: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BuyerIntentLite {
  id: string;
  owner_id: string | null;
  raw_input: string;
  buyer_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_display: string | null;
  preferred_regions: string[];
  asset_types: string[];
  purchase_purpose: string | null;
  must_have: string[];
  nice_to_have: string[];
  risk_tolerance: RiskTolerance;
  financing_note: string | null;
  visibility: BuyerIntentVisibility;
  normalized: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OwnerReadinessCheck {
  id: string;
  owner_id: string | null;
  building_id: string | null;
  checklist: Record<string, unknown>;
  readiness_score: number;
  available_outputs: string[];
  missing_data: string[];
  next_recommended_action: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentObject {
  id: string;
  owner_id: string | null;
  source_type: SourceType;
  source_id: string | null;
  building_id: string | null;
  document_type: DocumentType;
  visibility: Visibility;
  status: DocumentStatus;
  title: string | null;
  body: Record<string, unknown>;
  markdown: string | null;
  source_refs: Record<string, unknown>;
  model_version: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface GateRequest {
  id: string;
  building_id: string;
  requester_id: string | null;
  target_broker_id: string | null;
  requested_level: GateLevel;
  requested_fields: string[];
  reason: string | null;
  status: GateRequestStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpertNoteRequest {
  id: string;
  user_id: string | null;
  building_id: string | null;
  request_type: string;
  user_goal: string | null;
  contact: Record<string, unknown>;
  ai_report_id: string | null;
  status: ExpertNoteStatus;
  expert_note: string | null;
  next_recommendation: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface EvidenceFile {
  id: string;
  owner_id: string | null;
  building_id: string | null;
  file_type: string | null;
  storage_bucket: string;
  storage_path: string;
  visibility: EvidenceVisibility;
  contains_sensitive_data: boolean;
  training_allowed: boolean;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AiRun {
  id: string;
  user_id: string | null;
  run_type: string;
  input_ref: Record<string, unknown>;
  output_ref: Record<string, unknown>;
  model: string | null;
  prompt_version: string | null;
  status: AiRunStatus;
  token_usage: Record<string, unknown>;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
}

// ---- Insert Types (omit auto-generated fields) ----

export type ProfileInsert = Omit<Profile, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
};

export type BuildingSsotLiteInsert = Omit<
  BuildingSsotLite,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type BuildingSignalCardInsert = Omit<
  BuildingSignalCard,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DocumentObjectInsert = Omit<
  DocumentObject,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ActivityEventInsert = Omit<
  ActivityEvent,
  "id" | "created_at"
> & {
  id?: string;
  created_at?: string;
};

export type AiRunInsert = Omit<AiRun, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type GateRequestInsert = Omit<
  GateRequest,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ExpertNoteRequestInsert = Omit<
  ExpertNoteRequest,
  "id" | "created_at"
> & {
  id?: string;
  created_at?: string;
};

export type BuyerIntentLiteInsert = Omit<
  BuyerIntentLite,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type OwnerReadinessCheckInsert = Omit<
  OwnerReadinessCheck,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
