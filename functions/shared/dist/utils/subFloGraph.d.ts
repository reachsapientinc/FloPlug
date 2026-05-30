/**
 * SubFlo compartments, loop regions, and cycle detection on a single flo graph.
 */
export interface GraphNode {
    id: string;
    type: string;
    data: Record<string, unknown>;
}
export interface GraphEdge {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}
export declare function nodeSubFloId(node: GraphNode): string | undefined;
/** Compartment anchor id — SubFlo node id, or tagged subFloId on member nodes. */
export declare function nodeCompartmentId(node: GraphNode): string;
/**
 * Whether an edge may connect source → target without crossing compartment boundaries.
 * SubFlo anchor may wire to nodes not yet tagged (they join the compartment on connect).
 */
export declare function compartmentsCompatible(src: GraphNode, tgt: GraphNode): boolean;
/** Main-flow nodes only (exclude subflo compartments). */
export declare function filterMainFlowNodes(nodes: GraphNode[]): GraphNode[];
export declare function filterMainFlowEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[];
export declare function getSubFloCompartment(allNodes: GraphNode[], anchorId: string): {
    nodes: GraphNode[];
    edges: GraphEdge[];
};
export declare function compartmentEdges(compartmentNodeIds: Set<string>, allEdges: GraphEdge[]): GraphEdge[];
export declare function listSubFloAnchors(nodes: GraphNode[]): GraphNode[];
/** Nodes reachable from loop handle, excluding loop node itself. */
export declare function collectLoopRegionNodeIds(loopNodeId: string, nodes: GraphNode[], edges: GraphEdge[]): Set<string>;
/** Union of all loop-region node ids (excluded from main topo). */
export declare function allLoopRegionNodeIds(nodes: GraphNode[], edges: GraphEdge[]): Set<string>;
export declare function filterExecutableMainNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[];
export declare function filterExecutableMainEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[];
/** Static cycle detection via DFS (for validation). */
export declare function findGraphCycles(nodes: GraphNode[], edges: GraphEdge[]): string[][];
/** InvokeSubFlo → SubFlo → … → InvokeSubFlo same target. */
export declare function detectSubFloInvokeCycle(anchorId: string, compartmentNodes: GraphNode[], edges: GraphEdge[]): boolean;
export declare function loopHasExitEdge(loopNodeId: string, edges: GraphEdge[]): boolean;
export declare function loopHasLoopEdge(loopNodeId: string, edges: GraphEdge[]): boolean;
