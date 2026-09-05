import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface WorkItem {
  id: string;
  phase: string;
  title: string;
  requirements: string[];
  depends_on: string[];
}

interface Catalog {
  schema_version: string;
  items: WorkItem[];
}

describe('work_item_catalog DAG integrity test (CIM-0001 / PR-M0-01)', () => {
  const catalogPath = path.resolve(
    process.cwd(),
    'CREDEAL_IM_MODERNIZATION/knowledge/work_item_catalog.yaml'
  );

  it('should load catalog and parse valid JSON/YAML', () => {
    expect(fs.existsSync(catalogPath)).toBe(true);
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(raw) as Catalog;
    expect(catalog.schema_version).toBe('1.0.0');
    expect(catalog.items.length).toBeGreaterThanOrEqual(39);
  });

  it('should contain valid requirements and valid IDs for all items', () => {
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(raw) as Catalog;
    const ids = new Set<string>();

    for (const item of catalog.items) {
      expect(item.id).toMatch(/^CIM-[0-9]{4}$/);
      expect(item.phase).toMatch(/^CIM-M[0-8]$/);
      expect(item.requirements.length).toBeGreaterThanOrEqual(1);
      for (const req of item.requirements) {
        expect(req).toMatch(/^CIM-R-[0-9]{3}$/);
      }
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    }
  });

  it('should have all dependencies pointing to existing work item IDs', () => {
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(raw) as Catalog;
    const ids = new Set<string>(catalog.items.map((i) => i.id));

    for (const item of catalog.items) {
      for (const dep of item.depends_on) {
        expect(ids.has(dep)).toBe(true);
      }
    }
  });

  it('should contain no cycles in the dependency graph (DAG check)', () => {
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(raw) as Catalog;
    const adj = new Map<string, string[]>();

    for (const item of catalog.items) {
      adj.set(item.id, item.depends_on);
    }

    // 0: unvisited, 1: visiting, 2: visited
    const state = new Map<string, number>();
    for (const item of catalog.items) {
      state.set(item.id, 0);
    }

    function dfs(u: string): boolean {
      state.set(u, 1);
      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        if (state.get(v) === 1) {
          return true; // Cycle detected
        }
        if (state.get(v) === 0) {
          if (dfs(v)) return true;
        }
      }
      state.set(u, 2);
      return false;
    }

    for (const item of catalog.items) {
      if (state.get(item.id) === 0) {
        expect(dfs(item.id)).toBe(false);
      }
    }
  });

  it('should have no orphaned leaf nodes before M8 (all M0-M7 items must be depended on)', () => {
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(raw) as Catalog;
    
    // Set of all items that are depended on by at least one other item
    const dependedOn = new Set<string>();
    for (const item of catalog.items) {
      for (const dep of item.depends_on) {
        dependedOn.add(dep);
      }
    }

    // Every item in M0 ~ M7 must be depended upon by some downstream task
    const m0ToM7Items = catalog.items.filter((i) => i.phase !== 'CIM-M8');
    const orphans = m0ToM7Items.filter((i) => !dependedOn.has(i.id));

    expect(orphans.map((o) => o.id)).toEqual([]);
  });
});
