/**
 * Formula Dependency Graph & Cycle Detector
 * @see CREDEAL_IM_MODERNIZATION/09_PHASE_3_4_COMMON_PIPELINE_AND_CROSS_CUTTING.md §PR-M4-05
 */

export interface FormulaNode {
  name: string;
  dependencies: string[];
  calculate: (inputs: Record<string, number>) => number;
}

export class FormulaDependencyGraph {
  private nodes = new Map<string, FormulaNode>();

  addNode(node: FormulaNode): void {
    this.nodes.set(node.name, node);
  }

  detectCycles(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (curr: string, path: string[]) => {
      visited.add(curr);
      recursionStack.add(curr);
      path.push(curr);

      const node = this.nodes.get(curr);
      if (node) {
        for (const dep of node.dependencies) {
          if (!visited.has(dep)) {
            dfs(dep, [...path]);
          } else if (recursionStack.has(dep)) {
            const cycleStart = path.indexOf(dep);
            cycles.push([...path.slice(cycleStart), dep]);
          }
        }
      }

      recursionStack.delete(curr);
    };

    for (const name of this.nodes.keys()) {
      if (!visited.has(name)) {
        dfs(name, []);
      }
    }

    return cycles;
  }

  evaluateGraph(
    baseInputs: Record<string, number>,
    inputConfidences: Record<string, 'verified' | 'unverified'>
  ): {
    values: Record<string, number>;
    confidences: Record<string, 'verified' | 'unverified'>;
  } {
    const cycles = this.detectCycles();
    if (cycles.length > 0) {
      throw new Error(`CIRCULAR_FORMULA_CYCLE: Formula dependency cycle detected: ${JSON.stringify(cycles)}`);
    }

    const values = { ...baseInputs };
    const confidences = { ...inputConfidences };

    // Topological resolution
    for (const [name, node] of this.nodes.entries()) {
      const depValues: Record<string, number> = {};
      let isAnyDepUnverified = false;

      for (const dep of node.dependencies) {
        depValues[dep] = values[dep];
        if (confidences[dep] !== 'verified') {
          isAnyDepUnverified = true;
        }
      }

      values[name] = node.calculate(depValues);
      confidences[name] = isAnyDepUnverified ? 'unverified' : 'verified';
    }

    return { values, confidences };
  }
}
