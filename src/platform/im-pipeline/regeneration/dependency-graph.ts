export interface DependencyNode {
  id: string;
  type:
    | 'source'
    | 'snapshot'
    | 'claim'
    | 'proposal'
    | 'package'
    | 'mobile_section'
    | 'pptx_slide'
    | 'approval';
  channel?: 'mobile' | 'pptx' | 'dealcard' | 'core';
}

export interface DependencyEdge {
  from: string;
  to: string;
  relation: 'derived_from' | 'uses' | 'renders' | 'approved_as';
}

export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private edges: DependencyEdge[] = [];

  addNode(node: DependencyNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: DependencyEdge): void {
    this.edges.push(edge);
  }

  getNode(nodeId: string): DependencyNode | undefined {
    return this.nodes.get(nodeId);
  }

  getDownstreamNodes(changedNodeId: string): DependencyNode[] {
    const downstreamIds = new Set<string>();
    const queue: string[] = [changedNodeId];

    // Adjacency from parent to child: if B is derived_from A, edge is from B to A OR from A to B.
    // Convention: from=predecessor, to=successor (downstream dependent)
    while (queue.length > 0) {
      const current = queue.shift()!;
      const outgoing = this.edges.filter((e) => e.from === current);

      for (const edge of outgoing) {
        if (!downstreamIds.has(edge.to)) {
          downstreamIds.add(edge.to);
          queue.push(edge.to);
        }
      }
    }

    return Array.from(downstreamIds)
      .map((id) => this.nodes.get(id))
      .filter((n): n is DependencyNode => n !== undefined);
  }
}
