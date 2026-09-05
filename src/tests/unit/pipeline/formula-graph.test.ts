import { describe, it, expect } from 'vitest';
import { FormulaDependencyGraph } from '@/domain/building/common-pipeline/formula-graph';

describe('Formula Dependency Graph & Confidence Propagation (CIM-0405 / PR-M4-05)', () => {
  it('should detect cycles and throw exception when cyclic formula dependency exists', () => {
    const graph = new FormulaDependencyGraph();

    // Node A depends on B, Node B depends on A (Cycle!)
    graph.addNode({
      name: 'price',
      dependencies: ['capRate'],
      calculate: (inputs) => (1000000 / inputs.capRate) * 100,
    });
    graph.addNode({
      name: 'capRate',
      dependencies: ['price'],
      calculate: (inputs) => (1000000 / inputs.price) * 100,
    });

    const cycles = graph.detectCycles();
    expect(cycles.length).toBeGreaterThan(0);

    expect(() =>
      graph.evaluateGraph({ price: 100000000, capRate: 0.05 }, { price: 'verified', capRate: 'verified' })
    ).toThrow(/CIRCULAR_FORMULA_CYCLE/);
  });

  it('should propagate unverified status from upstream dependencies to downstream metrics', () => {
    const graph = new FormulaDependencyGraph();

    graph.addNode({
      name: 'annualRent',
      dependencies: ['monthlyRent'],
      calculate: (inputs) => inputs.monthlyRent * 12,
    });

    graph.addNode({
      name: 'grossYield',
      dependencies: ['annualRent'],
      calculate: (inputs) => (inputs.annualRent / 1000000000) * 100,
    });

    // If monthlyRent is unverified, grossYield must also become unverified
    const result = graph.evaluateGraph(
      { monthlyRent: 4000000 },
      { monthlyRent: 'unverified' }
    );

    expect(result.values.annualRent).toBe(48000000);
    expect(result.values.grossYield).toBe(4.8);
    expect(result.confidences.annualRent).toBe('unverified');
    expect(result.confidences.grossYield).toBe('unverified');
  });
});
