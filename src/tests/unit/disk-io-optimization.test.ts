import { describe, it, expect } from 'vitest';
import { pruneSupersededDocumentObjects } from '@/lib/supabase/prune-document-objects';
import { checkRateLimit } from '@/lib/rate-limiter';

describe('Disk IO Optimization Guards', () => {
  it('pruneSupersededDocumentObjects deletes older rows beyond keepCount and strips base64 map blobs from 2nd-latest row', async () => {
    const deletedIds: string[] = [];
    const updatedBodies: Record<string, any> = {};

    const fakeRows = [
      { id: 'doc-v4', created_at: '2026-11-01T10:00:00Z' },
      { id: 'doc-v3', created_at: '2026-11-01T09:00:00Z' },
      { id: 'doc-v2', created_at: '2026-11-01T08:00:00Z' },
      { id: 'doc-v1', created_at: '2026-11-01T07:00:00Z' },
    ];

    const fakeSupabase = {
      from(table: string) {
        expect(table).toBe('document_objects');
        return {
          select(cols: string) {
            if (cols === 'id, body') {
              return {
                eq(_col: string, val: string) {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          id: val,
                          body: {
                            title: 'Historical IM',
                            enrichment: {
                              cadastralMapImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
                              locationMapImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
                              landUsePlan: { zoning: '일반상업지역' },
                            },
                          },
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            }
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return {
                          async limit() {
                            return { data: fakeRows, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          delete() {
            return {
              async in(_col: string, ids: string[]) {
                deletedIds.push(...ids);
                return { error: null };
              },
            };
          },
          update(payload: { body: any }) {
            return {
              async eq(_col: string, id: string) {
                updatedBodies[id] = payload.body;
                return { error: null };
              },
            };
          },
        };
      },
    };

    const res = await pruneSupersededDocumentObjects(fakeSupabase, 'bld-1', 'mobile_im', 2);
    expect(res.deletedCount).toBe(2);
    expect(deletedIds).toEqual(['doc-v2', 'doc-v1']);
    expect(res.strippedCount).toBe(1);
    expect(updatedBodies['doc-v3']?.enrichment?.cadastralMapImage).toBeNull();
    expect(updatedBodies['doc-v3']?.enrichment?.locationMapImage).toBeNull();
    expect(updatedBodies['doc-v3']?.enrichment?.landUsePlan?.zoning).toBe('일반상업지역');
  });

  it('checkRateLimit enforces window limits in-memory without DB queries', async () => {
    const key = `test_${Date.now()}`;
    expect(await checkRateLimit('127.0.0.1', key, 2, 60_000)).toBe(true);
    expect(await checkRateLimit('127.0.0.1', key, 2, 60_000)).toBe(true);
    expect(await checkRateLimit('127.0.0.1', key, 2, 60_000)).toBe(false);
  });
});
