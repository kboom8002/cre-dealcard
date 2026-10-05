/**
 * src/lib/magazine/edition-draft.ts — 서버 전용: 이번 호 초안 조회/생성 (E-01)
 *
 * getOrCreateDraftEdition: 같은 (broker, type, label) 에디션이 있으면 그것을 돌려주고(발행본 우선),
 * 없으면 빈 초안 1건을 만든다. 임시저장은 magazine_editions 에만 쓰며 magazine_issues 는 건드리지 않는다.
 *
 * 유니크 제약(마이그레이션 000013) 적용 전에는 동시 생성 경합이 가능하므로,
 * 삽입 후 가장 먼저 만들어진 행만 남기는 방어 로직을 둔다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentWeekLabel, todayKst } from '@/lib/magazine/kst';
import { DEFAULT_THEME_COLOR } from '@/lib/magazine/edition-save';

export interface DraftCtx {
  slug: string;
  brokerKeys: string[];
}

export interface EditionRecord {
  id: string;
  status?: string | null;
  created_at?: string | null;
  [k: string]: unknown;
}

export class EditionDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditionDraftError';
  }
}

export function kindOfEditionType(editionType: string): 'weekly' | 'special' | 'daily' {
  if (editionType === 'special') return 'special';
  if (editionType === 'daily') return 'daily';
  return 'weekly';
}

function pickExisting(rows: EditionRecord[]): EditionRecord | null {
  if (rows.length === 0) return null;
  const published = rows.find((r) => r.status === 'published');
  if (published) return published;
  return rows[0];
}

export async function getOrCreateDraftEdition(
  supabase: SupabaseClient,
  ctx: DraftCtx,
  opts: { editionType?: string; editionLabel?: string } = {},
): Promise<{ edition: EditionRecord; created: boolean }> {
  const editionType = opts.editionType ?? 'weekly';
  const editionLabel = opts.editionLabel ?? currentWeekLabel();

  const lookup = async (): Promise<EditionRecord[]> => {
    const { data, error } = await supabase
      .from('magazine_editions')
      .select('*')
      .in('broker_id', ctx.brokerKeys)
      .eq('edition_type', editionType)
      .eq('edition_label', editionLabel)
      .order('created_at', { ascending: true })
      .limit(10);
    if (error) throw new EditionDraftError(`edition lookup failed: ${error.message}`);
    return (data ?? []) as unknown as EditionRecord[];
  };

  const before = pickExisting(await lookup());
  if (before) return { edition: before, created: false };

  const insertRow = {
    broker_id: ctx.slug,
    edition_type: editionType,
    edition_label: editionLabel,
    status: 'draft',
    title: '',
    market_temp: null,
    cover_keywords: [] as string[],
    theme_color: DEFAULT_THEME_COLOR,
    featured_deal_ids: [] as string[],
    target_segments: ['all'],
    content: {
      schemaVersion: 1,
      kind: kindOfEditionType(editionType),
      issueDate: todayKst(),
      weekLabel: editionLabel,
    },
  };
  const { data: inserted, error: insErr } = await supabase
    .from('magazine_editions')
    .insert(insertRow)
    .select('*')
    .maybeSingle();
  if (insErr || !inserted) {
    // 동시 생성으로 유니크 위반이 났다면 승자 행을 돌려준다
    const raced = pickExisting(await lookup());
    if (raced) return { edition: raced, created: false };
    throw new EditionDraftError(`edition insert failed: ${insErr?.message ?? 'no row returned'}`);
  }
  const mine = inserted as unknown as EditionRecord;

  // 경합 방어: 가장 먼저 만들어진 행(동률은 id 사전순)만 남긴다.
  const after = await lookup();
  const sorted = [...after].sort((a, b) => {
    const ta = String(a.created_at ?? '');
    const tb = String(b.created_at ?? '');
    return ta === tb ? String(a.id).localeCompare(String(b.id)) : ta.localeCompare(tb);
  });
  const winner = sorted.find((r) => r.status === 'published') ?? sorted[0];
  if (winner && winner.id !== mine.id) {
    const { error: delErr } = await supabase.from('magazine_editions').delete().eq('id', mine.id);
    if (delErr) throw new EditionDraftError(`duplicate cleanup failed: ${delErr.message}`);
    return { edition: winner, created: false };
  }
  return { edition: mine, created: true };
}
