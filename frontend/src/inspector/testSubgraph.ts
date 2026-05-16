import type { Node, Edge } from '@xyflow/react';

/** Nodes on a path from start → target (inclusive). Falls back to start + target + end. */
export function nodesForNodeTest(allNodes: Node[], allEdges: Edge[], targetId: string): Node[] {
  const start = allNodes.find(n => n.type === 'startNode');
  const end   = allNodes.find(n => n.type === 'endNode');
  const target = allNodes.find(n => n.id === targetId);
  if (!start || !target) return allNodes;

  const path = bfsPath(start.id, targetId, allEdges);
  const ids = new Set(
    path.length > 0
      ? path
      : [start.id, targetId, end?.id].filter(Boolean) as string[],
  );

  return allNodes.filter(n => ids.has(n.id));
}

export function edgesForNodeTest(allEdges: Edge[], nodeIds: Set<string>): Edge[] {
  return allEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
}

function bfsPath(from: string, to: string, edges: Edge[]): string[] {
  const queue: string[][] = [[from]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    if (last === to) return path;
    if (visited.has(last)) continue;
    visited.add(last);
    for (const e of edges) {
      if (e.source === last) queue.push([...path, e.target]);
    }
  }
  return [];
}
