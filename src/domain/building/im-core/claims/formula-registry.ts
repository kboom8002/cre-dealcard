export interface FormulaDefinition {
  formulaId: string;
  version: string;
  inputs: string[];
  outputSubject: string;
  calculate: (inputs: Record<string, number>) => number;
  unit: string;
  basisLabel: string;
}

export function validateNoFormulaCycles(formulas: FormulaDefinition[]): void {
  const adj = new Map<string, string[]>();
  const allNodes = new Set<string>();

  for (const f of formulas) {
    allNodes.add(f.outputSubject);
    for (const inp of f.inputs) {
      allNodes.add(inp);
    }
    const current = adj.get(f.outputSubject) ?? [];
    adj.set(f.outputSubject, [...current, ...f.inputs]);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recStack.add(node);

    const neighbors = adj.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor]);
      } else if (recStack.has(neighbor)) {
        throw new Error(
          `CIRCULAR_FORMULA_CYCLE: Formula cycle detected: ${path.join(' -> ')} -> ${neighbor}`
        );
      }
    }

    recStack.delete(node);
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }
}
