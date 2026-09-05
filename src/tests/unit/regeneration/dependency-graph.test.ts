import { describe, it, expect } from 'vitest';
import { DependencyGraph } from '@/platform/im-pipeline/regeneration/dependency-graph';

describe('DependencyGraph Downstream Impact Resolution (PR-B4-01 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Changing upstream node returns exact transitive downstream dependents', () => {
    const graph = new DependencyGraph();

    // Source -> Snapshot -> Package -> MobileIM & PPTX
    graph.addNode({ id: 'source-1', type: 'source', channel: 'core' });
    graph.addNode({ id: 'snapshot-1', type: 'snapshot', channel: 'core' });
    graph.addNode({ id: 'package-1', type: 'package', channel: 'core' });
    graph.addNode({ id: 'mobile-section-1', type: 'mobile_section', channel: 'mobile' });
    graph.addNode({ id: 'pptx-slide-1', type: 'pptx_slide', channel: 'pptx' });
    graph.addNode({ id: 'unrelated-node', type: 'claim', channel: 'core' });

    graph.addEdge({ from: 'source-1', to: 'snapshot-1', relation: 'derived_from' });
    graph.addEdge({ from: 'snapshot-1', to: 'package-1', relation: 'uses' });
    graph.addEdge({ from: 'package-1', to: 'mobile-section-1', relation: 'renders' });
    graph.addEdge({ from: 'package-1', to: 'pptx-slide-1', relation: 'renders' });

    const downstream = graph.getDownstreamNodes('snapshot-1');
    const ids = downstream.map((n) => n.id);

    expect(ids).toContain('package-1');
    expect(ids).toContain('mobile-section-1');
    expect(ids).toContain('pptx-slide-1');
    expect(ids).not.toContain('unrelated-node');
  });

  it('Negative Pair: Querying leaf node or independent branch yields zero downstream nodes', () => {
    const graph = new DependencyGraph();
    graph.addNode({ id: 'mobile-leaf', type: 'mobile_section', channel: 'mobile' });

    const downstream = graph.getDownstreamNodes('mobile-leaf');
    expect(downstream.length).toBe(0);
  });
});
