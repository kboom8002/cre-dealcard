/**
 * Data Provenance Guard for CREDEAL v3 (S0-T4)
 * 
 * Ensures all mutations to asset attributes include explicit provenance metadata
 * (tier, verified_at, source_ref).
 */

export type ProvenanceTier = 'public_data' | 'expert_verified' | 'broker_input' | 'ai_inferred';

export interface FieldProvenance {
  tier: ProvenanceTier;
  verified_at: string;
  source_ref?: string;
}

export type AssetProvenanceMap = Record<string, FieldProvenance>;

export interface AssetAttrPayload {
  attrs: Record<string, unknown>;
  provenance: AssetProvenanceMap;
}

/**
 * Validates that all keys in `attrs` have a corresponding provenance entry in `provenance`.
 * Throws an error if any attribute is missing provenance metadata.
 */
export function validateAssetProvenance(payload: AssetAttrPayload): void {
  const attrKeys = Object.keys(payload.attrs || {});
  const provenanceMap = payload.provenance || {};

  const missingProvenanceKeys: string[] = [];

  for (const key of attrKeys) {
    if (!provenanceMap[key] || !provenanceMap[key].tier) {
      missingProvenanceKeys.push(key);
    }
  }

  if (missingProvenanceKeys.length > 0) {
    throw new Error(
      `[ProvenanceViolation] Missing provenance metadata for attribute keys: [${missingProvenanceKeys.join(
        ', '
      )}]. Rule S0-T4 requires all asset mutations to specify provenance tier.`
    );
  }
}

/**
 * Attaches default provenance to attributes if missing (useful for legacy data migrations).
 */
export function attachDefaultProvenance(
  attrs: Record<string, unknown>,
  defaultTier: ProvenanceTier = 'ai_inferred',
  sourceRef: string = 'system_migration'
): AssetAttrPayload {
  const now = new Date().toISOString();
  const provenance: AssetProvenanceMap = {};

  for (const key of Object.keys(attrs)) {
    provenance[key] = {
      tier: defaultTier,
      verified_at: now,
      source_ref: sourceRef,
    };
  }

  return { attrs, provenance };
}
