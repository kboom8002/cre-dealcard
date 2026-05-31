import type { BuildingSsotLite } from "@/types/database";

export interface IBuildingRepository {
  createBuildingSsotLite(data: {
    owner_id: string | null;
    created_by_role: string;
    input_type: string;
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
    status: string;
  }): Promise<{ id: string }>;

  getBuildingSsotLiteById(id: string): Promise<BuildingSsotLite | null>;
  
  updateBuildingSsotLite(
    id: string,
    data: Partial<Omit<BuildingSsotLite, "id" | "created_at" | "updated_at">>
  ): Promise<void>;
}
