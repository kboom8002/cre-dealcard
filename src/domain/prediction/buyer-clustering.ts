import { callLLM } from '@/ai/llm-client';
import { createServiceClient } from '@/lib/supabase/service';
import type { WeightProfile } from '@/domain/matching/matching-types';

export interface BuyerCluster {
  id: number;
  label: string;
  weightProfile: WeightProfile;
  memberCount: number;
  avgBudgetMin: number | null;
  avgBudgetMax: number | null;
  topRegions: string[];
  topPurposes: string[];
}

export interface ClusteringResult {
  k: number;
  silhouetteScore: number;
  clusters: BuyerCluster[];
  assignedCount: number;
}

// ─── Feature vector construction ────────────────────────────────────────

const REGION_MAP: Record<string, number> = {
  '강남': 1, '서초': 2, '송파': 3, '용산': 4, '마포': 5,
  '성동': 6, '성수': 6, '합정': 5, '홍대': 5, '여의도': 7,
  '광화문': 8, '종로': 8, '판교': 9, '기타': 0,
};

const PURPOSE_MAP: Record<string, number> = {
  '사옥': 1, '투자': 2, '증여': 3, '혼합': 4, 'unknown': 0,
};

const RISK_MAP: Record<string, number> = { low: 1, medium: 2, high: 3, unknown: 0 };
const URGENCY_MAP: Record<string, number> = { low: 1, medium: 2, high: 3 };

function encodeRegion(regions: string[]): number {
  for (const r of regions) {
    for (const [key, val] of Object.entries(REGION_MAP)) {
      if (r.includes(key)) return val;
    }
  }
  return 0;
}

function buildFeatureVector(buyer: Record<string, unknown>): number[] {
  const budgetMin  = ((buyer.budget_range as { min?: number })?.min ?? 0) / 100_000_000_000; // normalize to 1000억
  const budgetMax  = ((buyer.budget_range as { max?: number })?.max ?? 0) / 100_000_000_000;
  const region     = encodeRegion((buyer.preferred_regions as string[]) ?? []) / 10;
  const purpose    = (PURPOSE_MAP[(buyer.inferred_purpose as string) ?? 'unknown'] ?? 0) / 4;
  const risk       = (RISK_MAP[(buyer.risk_tolerance as string) ?? 'unknown'] ?? 0) / 3;
  const urgency    = (URGENCY_MAP[(buyer.urgency as string) ?? 'medium'] ?? 2) / 3;
  const buyerType  = (buyer.buyer_type as string)?.includes('법인') ? 1 : 0;

  return [budgetMin, budgetMax, region, purpose, risk, urgency, buyerType];
}

// ─── Silhouette score approximation ─────────────────────────────────────

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, ai, i) => sum + (ai - b[i]) ** 2, 0));
}

function approxSilhouette(vectors: number[][], assignments: number[], k: number): number {
  if (vectors.length < k * 2) return 0;
  const sample = vectors.slice(0, Math.min(50, vectors.length));
  const sampleAssignments = assignments.slice(0, sample.length);
  let total = 0;

  for (let i = 0; i < sample.length; i++) {
    const myCluster = sampleAssignments[i];
    const intraDistances = sample
      .filter((_, j) => j !== i && sampleAssignments[j] === myCluster)
      .map((v) => euclidean(sample[i], v));
    const a = intraDistances.length > 0
      ? intraDistances.reduce((s, d) => s + d, 0) / intraDistances.length
      : 0;

    let minB = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      const otherDistances = sample
        .filter((_, j) => sampleAssignments[j] === c)
        .map((v) => euclidean(sample[i], v));
      if (otherDistances.length > 0) {
        const b = otherDistances.reduce((s, d) => s + d, 0) / otherDistances.length;
        if (b < minB) minB = b;
      }
    }

    const s = minB === Infinity ? 0 : (minB - a) / Math.max(a, minB);
    total += s;
  }

  return total / sample.length;
}

// ─── Seeded Random for Deterministic K-Means ────────────────────────────

function createSeededRandom(seed: number) {
  let current = seed;
  return function() {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

// ─── Simple K-Means (Deterministic Seeded) ─────────────────────────────

function kMeans(vectors: number[][], k: number, maxIter = 50): { assignments: number[]; centroids: number[][] } {
  const random = createSeededRandom(42);

  // Initialize centroids with k-means++ using seeded random
  const centroids: number[][] = [vectors[Math.floor(random() * vectors.length)]];
  while (centroids.length < k) {
    const distances = vectors.map((v) => Math.min(...centroids.map((c) => euclidean(v, c))));
    const total = distances.reduce((s, d) => s + d, 0);
    let rand = random() * total;
    for (let i = 0; i < distances.length; i++) {
      rand -= distances[i];
      if (rand <= 0) { centroids.push(vectors[i]); break; }
    }
  }

  let assignments = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign
    const newAssignments = vectors.map((v) => {
      let minDist = Infinity; let best = 0;
      centroids.forEach((c, i) => { const d = euclidean(v, c); if (d < minDist) { minDist = d; best = i; } });
      return best;
    });

    if (JSON.stringify(newAssignments) === JSON.stringify(assignments)) break;
    assignments = newAssignments;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      for (let d = 0; d < vectors[0].length; d++) {
        centroids[c][d] = members.reduce((s, v) => s + v[d], 0) / members.length;
      }
    }
  }

  return { assignments, centroids };
}

// ─── Auto-label cluster using OpenAI via centralized callLLM ───────────

async function labelCluster(
  members: Array<Record<string, unknown>>,
): Promise<{ label: string; weightProfile: WeightProfile }> {
  const sample = members.slice(0, 5).map((m) => ({
    buyerType: m.buyer_type,
    budget: m.budget_range,
    regions: m.preferred_regions,
    purpose: m.inferred_purpose ?? m.purchase_purpose,
    urgency: m.urgency,
  }));

  try {
    const resp = await callLLM({
      model: 'gpt-4o-mini',
      systemPrompt: `한국 상업부동산 매수자 클러스터를 분석하여 3-5자 한글 레이블과 weightProfile을 반환하세요.
weightProfile은 반드시 "사옥", "투자", "증여", "default" 중 하나.
JSON: { "label": "강남 사옥 법인", "weightProfile": "사옥" }`,
      userPrompt: `클러스터 샘플: ${JSON.stringify(sample)}`,
      responseFormat: 'json_object',
      maxTokens: 200,
    });

    const parsed = JSON.parse(resp.content ?? '{}');
    return {
      label:         parsed.label || '매수자 그룹',
      weightProfile: (['사옥', '투자', '증여', 'default'].includes(parsed.weightProfile)
        ? parsed.weightProfile
        : 'default') as WeightProfile,
    };
  } catch {
    return { label: '매수자 그룹', weightProfile: 'default' };
  }
}

// ─── Main clustering function (Bulk Upsert) ────────────────────────────

export async function runBuyerClustering(): Promise<ClusteringResult> {
  const supabase = createServiceClient();

  const { data: buyers } = await supabase
    .from('buyer_intent_lite')
    .select('*');

  if (!buyers || buyers.length < 10) {
    throw new Error(`매수자 데이터 부족: ${buyers?.length ?? 0}건 (최소 10건 필요)`);
  }

  const vectors = buyers.map((b) => buildFeatureVector(b as Record<string, unknown>));

  // Try k = 3..6, pick best silhouette
  let bestK = 3;
  let bestScore = -Infinity;
  let bestResult = { assignments: [] as number[], centroids: [] as number[][] };

  for (let k = 3; k <= Math.min(6, Math.floor(buyers.length / 3)); k++) {
    const result = kMeans(vectors, k);
    const score  = approxSilhouette(vectors, result.assignments, k);
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
      bestResult = result;
    }
  }

  const { assignments, centroids } = bestResult;

  // Build cluster info
  const clusterMembers: Record<number, Array<Record<string, unknown>>> = {};
  buyers.forEach((b, i) => {
    const c = assignments[i];
    if (!clusterMembers[c]) clusterMembers[c] = [];
    clusterMembers[c].push(b as Record<string, unknown>);
  });

  // Label each cluster
  const clusters: BuyerCluster[] = [];
  for (let c = 0; c < bestK; c++) {
    const members = clusterMembers[c] ?? [];
    const { label, weightProfile } = await labelCluster(members);

    const budgets = members.map((m) => (m.budget_range as { min?: number; max?: number }) ?? {});
    const avgMin  = budgets.map((b) => b.min).filter((v): v is number => typeof v === 'number').reduce((s, v, _, a) => s + v / a.length, 0) || null;
    const avgMax  = budgets.map((b) => b.max).filter((v): v is number => typeof v === 'number').reduce((s, v, _, a) => s + v / a.length, 0) || null;
    const allRegions = members.flatMap((m) => m.preferred_regions as string[] ?? []);
    const regionFreq  = allRegions.reduce((acc, r) => { acc[r] = ((acc[r] as number | undefined) ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const topRegions  = Object.entries(regionFreq).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 3).map(([r]) => r);
    const purposeFreq = members.reduce((acc, m) => { const p = (m.inferred_purpose ?? 'unknown') as string; acc[p] = ((acc[p] as number | undefined) ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const topPurposes = Object.entries(purposeFreq).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 2).map(([p]) => p);

    clusters.push({ id: c, label, weightProfile, memberCount: members.length, avgBudgetMin: avgMin, avgBudgetMax: avgMax, topRegions, topPurposes });

    // Save cluster definition
    await supabase.from('buyer_clusters').upsert({ id: c, label, weight_profile: weightProfile, centroid: { values: centroids[c] }, member_count: members.length, avg_budget_min: avgMin, avg_budget_max: avgMax, top_regions: topRegions, top_purposes: topPurposes, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  }

  // Bulk assign cluster_id to each buyer
  const updatedBuyers = buyers.map((b, i) => {
    const cluster = clusters[assignments[i]];
    return {
      ...b,
      cluster_id: assignments[i],
      cluster_label: cluster.label,
      cluster_updated_at: new Date().toISOString(),
    };
  });

  await supabase.from('buyer_intent_lite').upsert(updatedBuyers);

  return { k: bestK, silhouetteScore: bestScore, clusters, assignedCount: buyers.length };
}

// ─── Classify a single new buyer ──────────────────────────────────────

export async function classifyNewBuyer(
  buyerId: string,
): Promise<{ clusterId: number; clusterLabel: string; weightProfile: WeightProfile } | null> {
  const supabase = createServiceClient();

  const [{ data: buyer }, { data: clusters }] = await Promise.all([
    supabase.from('buyer_intent_lite').select('*').eq('id', buyerId).single(),
    supabase.from('buyer_clusters').select('id, label, weight_profile, centroid'),
  ]);

  if (!buyer || !clusters?.length) return null;

  const vector = buildFeatureVector(buyer as Record<string, unknown>);
  let minDist = Infinity;
  let bestCluster = clusters[0];

  for (const cluster of clusters) {
    const centroid = (cluster.centroid as { values?: number[] })?.values ?? [];
    if (centroid.length === 0) continue;
    const dist = euclidean(vector, centroid);
    if (dist < minDist) { minDist = dist; bestCluster = cluster; }
  }

  await supabase.from('buyer_intent_lite').update({ cluster_id: bestCluster.id, cluster_label: bestCluster.label, cluster_updated_at: new Date().toISOString() }).eq('id', buyerId);

  return { clusterId: bestCluster.id, clusterLabel: bestCluster.label, weightProfile: bestCluster.weight_profile as WeightProfile };
}
