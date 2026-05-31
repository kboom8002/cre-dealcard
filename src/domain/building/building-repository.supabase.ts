import type { SupabaseClient } from "@supabase/supabase-js";
import type { IBuildingRepository } from "./building-repository.interface";
import type { BuildingSsotLite } from "@/types/database";

export class SupabaseBuildingRepository implements IBuildingRepository {
  constructor(private supabase: SupabaseClient) {}

  async createBuildingSsotLite(data: {
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
  }): Promise<{ id: string }> {
    const { data: building, error } = await this.supabase
      .from("building_ssot_lite")
      .insert(data)
      .select("id")
      .single();

    if (error || !building) {
      throw new Error(`Failed to create building_ssot_lite in repository: ${error?.message}`);
    }

    return building;
  }

  async getBuildingSsotLiteById(id: string): Promise<BuildingSsotLite | null> {
    const { data: building, error } = await this.supabase
      .from("building_ssot_lite")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get building_ssot_lite: ${error.message}`);
    }

    return building;
  }

  async updateBuildingSsotLite(
    id: string,
    data: Partial<Omit<BuildingSsotLite, "id" | "created_at" | "updated_at">>
  ): Promise<void> {
    const { error } = await this.supabase
      .from("building_ssot_lite")
      .update(data)
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to update building_ssot_lite: ${error.message}`);
    }
  }
}
