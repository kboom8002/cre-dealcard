/**
 * @module ProvenanceLint
 * @description Detects and resolves provenance conflicts when multiple data sources
 * report different values for the same attribute slot.
 * @see SDD S1-T4
 */

import type { Asset } from '@/types/database';

/** Tier priority (higher = more trusted) */
const TIER_PRIORITY: Record<string, number> = {
  official_api: 100,
  registry: 90,
  broker_input: 70,
  ocr_confirmed: 60,
  ocr_raw: 30,
  crawled: 20,
  inferred: 10,
};

export interface ProvenanceConflict {
  slotKey: string;
  sources: Array<{ tier: string; value: unknown; updatedAt: string }>;
  resolution: 'highest_tier' | 'most_recent' | 'manual';
  resolvedValue: unknown;
}

export interface LintResult {
  conflicts: ProvenanceConflict[];
  warnings: string[];
  overallHealth: 'clean' | 'minor_conflicts' | 'major_conflicts';
}

/**
 * Detects provenance conflicts in asset attributes.
 * A conflict exists when two sources report different values for the same slot.
 */
export function detectProvenanceConflicts(
  attrs: Record<string, unknown>,
  provenance: Record<string, { tier: string; updated_at?: string }>
): ProvenanceConflict[] {
  const conflicts: ProvenanceConflict[] = [];
  
  // Group provenance entries by slot key prefix
  const slotGroups = new Map<string, Array<{ tier: string; value: unknown; updatedAt: string }>>();
  
  for (const [key, meta] of Object.entries(provenance)) {
    const slotKey = key.replace(/_source$/, '').replace(/_tier$/, '');
    if (!slotGroups.has(slotKey)) slotGroups.set(slotKey, []);
    slotGroups.get(slotKey)!.push({
      tier: meta.tier,
      value: attrs[slotKey],
      updatedAt: meta.updated_at || new Date().toISOString(),
    });
  }
  
  for (const [slotKey, sources] of slotGroups) {
    if (sources.length <= 1) continue;
    
    // Check if values differ
    const uniqueValues = new Set(sources.map(s => JSON.stringify(s.value)));
    if (uniqueValues.size <= 1) continue;
    
    // Resolve by highest tier
    const sorted = [...sources].sort((a, b) => 
      (TIER_PRIORITY[b.tier] || 0) - (TIER_PRIORITY[a.tier] || 0)
    );
    
    conflicts.push({
      slotKey,
      sources,
      resolution: 'highest_tier',
      resolvedValue: sorted[0].value,
    });
  }
  
  return conflicts;
}

/**
 * Resolves a single provenance conflict using the specified strategy.
 */
export function resolveConflict(
  conflict: ProvenanceConflict,
  strategy: 'highest_tier' | 'most_recent' = 'highest_tier'
): unknown {
  if (strategy === 'most_recent') {
    const sorted = [...conflict.sources].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return sorted[0].value;
  }
  
  // Default: highest tier
  const sorted = [...conflict.sources].sort((a, b) => 
    (TIER_PRIORITY[b.tier] || 0) - (TIER_PRIORITY[a.tier] || 0)
  );
  return sorted[0].value;
}

/**
 * Runs a full provenance lint on an asset's attributes.
 */
export function lintProvenance(
  attrs: Record<string, unknown>,
  provenance: Record<string, { tier: string; updated_at?: string }>
): LintResult {
  const conflicts = detectProvenanceConflicts(attrs, provenance);
  
  const warnings: string[] = [];
  
  // Check for missing provenance on key fields
  const keyFields = ['askingPriceKrw', 'totalFloorAreaPyung', 'buildYear', 'zoningRegion'];
  for (const field of keyFields) {
    if (attrs[field] !== undefined && !provenance[field]) {
      warnings.push(`Missing provenance for key field: ${field}`);
    }
  }
  
  // Check for stale data (older than 90 days)
  const now = Date.now();
  for (const [key, meta] of Object.entries(provenance)) {
    if (meta.updated_at) {
      const age = now - new Date(meta.updated_at).getTime();
      if (age > 90 * 86400000) {
        warnings.push(`Stale provenance for ${key}: ${Math.round(age / 86400000)} days old`);
      }
    }
  }
  
  const overallHealth = conflicts.length > 3 ? 'major_conflicts' 
    : conflicts.length > 0 ? 'minor_conflicts' : 'clean';
  
  return { conflicts, warnings, overallHealth };
}
