/**
 * Draft vs published flo graph — shared by designer, functions, webhook.
 */
export function getDraftGraph(floData) {
    const draft = floData.draft;
    if (draft && Array.isArray(draft.nodes)) {
        return {
            nodes: draft.nodes ?? [],
            edges: draft.edges ?? [],
            viewport: draft.viewport,
        };
    }
    return {
        nodes: floData.nodes ?? [],
        edges: floData.edges ?? [],
        viewport: floData.viewport,
    };
}
/** Published graph for webhook / scheduler / sub-flow loads. Null if never published. */
export function getPublishedGraph(floData) {
    const published = floData.published;
    if (published && Array.isArray(published.nodes) && published.nodes.length > 0) {
        return {
            nodes: published.nodes,
            edges: published.edges ?? [],
            viewport: published.viewport,
        };
    }
    const publishState = String(floData.publishState ?? '');
    const status = String(floData.status ?? '');
    if (publishState === 'published' || status === 'active') {
        const legacyNodes = floData.nodes;
        if (Array.isArray(legacyNodes) && legacyNodes.length > 0) {
            return {
                nodes: legacyNodes,
                edges: floData.edges ?? [],
                viewport: floData.viewport,
            };
        }
    }
    return null;
}
export function computeGraphHash(graph) {
    return JSON.stringify({ nodes: graph.nodes, edges: graph.edges });
}
export function graphsEqual(a, b) {
    return computeGraphHash(a) === computeGraphHash(b);
}
/** True when a saved draft graph differs from the last published version. */
export function hasInProgressDraft(floData) {
    const published = getPublishedGraph(floData);
    if (!published?.nodes?.length)
        return false;
    const draft = getDraftGraph(floData);
    return !graphsEqual({ nodes: draft.nodes, edges: draft.edges ?? [] }, { nodes: published.nodes, edges: published.edges ?? [] });
}
