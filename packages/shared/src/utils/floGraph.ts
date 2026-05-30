/**
 * Draft vs published flo graph — shared by designer, functions, webhook.
 */

import type { FloPublishedGraph } from '../types/floVersioning.js';

export type FloGraphSnapshot = FloPublishedGraph;

export function getDraftGraph(floData: Record<string, unknown>): FloGraphSnapshot {
  const draft = floData.draft as Partial<FloGraphSnapshot> | undefined;
  if (draft && Array.isArray(draft.nodes)) {
    return {
      nodes: draft.nodes ?? [],
      edges: draft.edges ?? [],
      viewport: draft.viewport,
    };
  }
  return {
    nodes: (floData.nodes as unknown[]) ?? [],
    edges: (floData.edges as unknown[]) ?? [],
    viewport: floData.viewport as FloGraphSnapshot['viewport'],
  };
}

/** Published graph for webhook / scheduler / sub-flow loads. Null if never published. */
export function getPublishedGraph(floData: Record<string, unknown>): FloGraphSnapshot | null {
  const published = floData.published as Partial<FloGraphSnapshot> | undefined;
  if (published && Array.isArray(published.nodes) && published.nodes.length > 0) {
    return {
      nodes: published.nodes,
      edges: published.edges ?? [],
      viewport: published.viewport,
    };
  }

  const publishState = String(floData.publishState ?? '');
  const status       = String(floData.status ?? '');
  if (publishState === 'published' || status === 'active') {
    const legacyNodes = floData.nodes;
    if (Array.isArray(legacyNodes) && legacyNodes.length > 0) {
      return {
        nodes: legacyNodes,
        edges: (floData.edges as unknown[]) ?? [],
        viewport: floData.viewport as FloGraphSnapshot['viewport'],
      };
    }
  }

  return null;
}

export function computeGraphHash(graph: FloGraphSnapshot): string {
  return JSON.stringify({ nodes: graph.nodes, edges: graph.edges });
}

export function graphsEqual(a: FloGraphSnapshot, b: FloGraphSnapshot): boolean {
  return computeGraphHash(a) === computeGraphHash(b);
}

/** True when a saved draft graph differs from the last published version. */
export function hasInProgressDraft(floData: Record<string, unknown>): boolean {
  const published = getPublishedGraph(floData);
  if (!published?.nodes?.length) return false;
  const draft = getDraftGraph(floData);
  return !graphsEqual(
    { nodes: draft.nodes, edges: draft.edges ?? [] },
    { nodes: published.nodes, edges: published.edges ?? [] },
  );
}
