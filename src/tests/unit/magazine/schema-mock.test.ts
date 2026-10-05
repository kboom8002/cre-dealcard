import { describe, it, expect } from 'vitest';
import {
  createSchemaAwareSupabase,
  normalizeSchema,
  loadSchema,
  schemaSnapshotAvailable,
  SchemaViolationError,
} from '../../helpers/schema-aware-supabase-mock';

const schema = {
  magazine_subscribers: ['id', 'broker_id', 'subscriber_email', 'interest_profile', 'status', 'created_at'],
  magazine_editions: ['id', 'broker_id', 'edition_date', 'status'],
};

function mk(seed: Record<string, Record<string, unknown>[]> = {}) {
  return createSchemaAwareSupabase(seed, { schema });
}

describe('schema-aware supabase mock (F-05)', () => {
  it('존재하지 않는 테이블은 42P01 로 throw', () => {
    const db = mk();
    expect(() => db.from('nope')).toThrow(SchemaViolationError);
    try {
      db.from('nope');
    } catch (e) {
      expect((e as SchemaViolationError).code).toBe('42P01');
    }
  });

  it('존재하지 않는 컬럼은 select/eq/in/order/or/not 에서 42703 throw', () => {
    const db = mk();
    expect(() => db.from('magazine_subscribers').select('id,email')).toThrow(/email/);
    expect(() => db.from('magazine_subscribers').select('*').eq('interest_tags', 'x')).toThrow(/interest_tags/);
    expect(() => db.from('magazine_subscribers').select('*').in('email', ['a'])).toThrow(/email/);
    expect(() => db.from('magazine_subscribers').select('*').order('nope')).toThrow(/nope/);
    expect(() => db.from('magazine_subscribers').select('*').or('email.eq.a,status.eq.active')).toThrow(/email/);
    expect(() => db.from('magazine_subscribers').select('*').not('email', 'is', null)).toThrow(/email/);
  });

  it('insert/update/upsert 의 없는 컬럼은 throw', () => {
    const db = mk();
    expect(() => db.from('magazine_subscribers').insert({ id: 1, email: 'a' })).toThrow(/email/);
    expect(() => db.from('magazine_subscribers').update({ interest_tags: [] })).toThrow(/interest_tags/);
    expect(() => db.from('magazine_subscribers').upsert({ id: 1, zzz: 1 })).toThrow(/zzz/);
    expect(() => db.from('magazine_subscribers').upsert({ id: 1 }, { onConflict: 'broker_id,email' })).toThrow(/email/);
  });

  it('seed 가 스키마를 어기면 throw', () => {
    expect(() => mk({ magazine_subscribers: [{ id: 1, email: 'a' }] })).toThrow(/email/);
    expect(() => mk({ ghost: [{ id: 1 }] })).toThrow(/ghost/);
  });

  it('유효한 체인은 select/eq/in/order/limit/maybeSingle 로 동작', async () => {
    const db = mk({
      magazine_subscribers: [
        { id: 1, broker_id: 'b1', status: 'active', subscriber_email: 'a@x.com' },
        { id: 2, broker_id: 'b1', status: 'paused', subscriber_email: 'b@x.com' },
        { id: 3, broker_id: 'b2', status: 'active', subscriber_email: 'c@x.com' },
      ],
    });
    const r = await db.from('magazine_subscribers').select('id,subscriber_email').eq('broker_id', 'b1').order('id', { ascending: false });
    expect((r.data as { id: number }[]).map((x) => x.id)).toEqual([2, 1]);

    const r2 = await db.from('magazine_subscribers').select('*').in('status', ['active']).limit(1);
    expect((r2.data as unknown[]).length).toBe(1);

    const one = await db.from('magazine_subscribers').select('*').eq('id', 3).maybeSingle();
    expect((one.data as { broker_id: string }).broker_id).toBe('b2');

    const none = await db.from('magazine_subscribers').select('*').eq('id', 99).maybeSingle();
    expect(none.data).toBeNull();
  });

  it('insert+select / update / upsert / delete', async () => {
    const db = mk();
    const ins = await db.from('magazine_editions').insert({ id: 'e1', broker_id: 'b', edition_date: '2026-01-06', status: 'draft' }).select('id').single();
    expect((ins.data as { id: string }).id).toBe('e1');

    await db.from('magazine_editions').update({ status: 'published' }).eq('id', 'e1');
    expect(db.__rows('magazine_editions')[0].status).toBe('published');

    await db.from('magazine_editions').upsert({ id: 'e1', status: 'archived' });
    await db.from('magazine_editions').upsert({ id: 'e2', status: 'draft' });
    expect(db.__rows('magazine_editions').map((r) => r.status)).toEqual(['archived', 'draft']);

    await db.from('magazine_editions').delete().eq('id', 'e2');
    expect(db.__rows('magazine_editions')).toHaveLength(1);
  });

  it('.or 필터는 일치 행만 통과', async () => {
    const db = mk({
      magazine_subscribers: [
        { id: 1, status: 'active' },
        { id: 2, status: 'paused' },
        { id: 3, status: 'deleted' },
      ],
    });
    const r = await db.from('magazine_subscribers').select('id').or('status.eq.active,status.eq.paused');
    expect((r.data as unknown[]).length).toBe(2);
  });

  it('normalizeSchema 는 {tables:{t:{col:{}}}} / {t:[cols]} / {t:{columns:[{name}]}} 를 모두 수용', () => {
    expect(normalizeSchema({ tables: { a: { x: {}, y: {} } } })).toEqual({ a: ['x', 'y'] });
    expect(normalizeSchema({ a: ['x'] })).toEqual({ a: ['x'] });
    expect(normalizeSchema({ a: { columns: [{ name: 'x' }] } })).toEqual({ a: ['x'] });
  });

  it.runIf(schemaSnapshotAvailable())('실제 스냅샷: magazine_subscribers 에 email/interest_tags 는 없다', () => {
    const real = loadSchema();
    expect(real.magazine_subscribers).toBeDefined();
    expect(real.magazine_subscribers).not.toContain('interest_tags');
    expect(real.magazine_subscribers).not.toContain('email');
    const db = createSchemaAwareSupabase({}, { schema: real });
    expect(() => db.from('magazine_subscribers').select('email')).toThrow(SchemaViolationError);
  });
});
