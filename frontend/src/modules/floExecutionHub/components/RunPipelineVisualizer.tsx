import React, { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { FloExecutionNodeRecord } from '@floplug/shared';
import { HubDesignerNode, type HubDesignerNodeData } from './HubDesignerNode';
import { HubExecutionNode, type HubExecutionNodeData } from './HubExecutionNode';
import { buildNodeExecutionMap } from '../utils/executionStatus';

const hubDesignerTypes = { hubDesigner: HubDesignerNode };
const hubExecTypes = { hubExec: HubExecutionNode };

export interface CanvasGraphNode {
  id:       string;
  type?:    string;
  position?: { x: number; y: number };
  data?:    Record<string, unknown>;
}

export interface CanvasGraphEdge {
  id?:     string;
  source:  string;
  target:  string;
  sourceHandle?: string | null;
}

export interface RunPipelineVisualizerProps {
  graphNodes:  CanvasGraphNode[];
  graphEdges:  CanvasGraphEdge[];
  records:     FloExecutionNodeRecord[];
  runLog?:     string[];
  selectedNodeId?: string | null;
  onSelectNode?:   (nodeId: string | null) => void;
  /** Use designer CompactNode styling (default true) */
  useDesignerNodes?: boolean;
  /** Taller canvas for detail panel */
  tall?: boolean;
}

const DesignerInner: React.FC<RunPipelineVisualizerProps> = ({
  graphNodes, graphEdges, records, runLog = [],
  selectedNodeId, onSelectNode, useDesignerNodes = true, tall = false,
}) => {
  const statusMap = useMemo(
    () => buildNodeExecutionMap(graphNodes.map(n => n.id), records, runLog),
    [graphNodes, records, runLog],
  );

  const { nodes, edges } = useMemo(() => {
    const execOrder = topoOrder(graphNodes, graphEdges);
    const stepOf = new Map(execOrder.map((id, i) => [id, i + 1]));

    const flowNodes: Node[] = graphNodes.map((n, i) => {
      const d = n.data ?? {};
      const info = statusMap[n.id] ?? { status: 'pending' as const };
      const nodeType = n.type ?? 'node';
      const useDesigner = useDesignerNodes;

      if (useDesigner) {
        return {
          id:       n.id,
          type:     'hubDesigner',
          position: n.position ?? { x: (stepOf.get(n.id) ?? i) * 220, y: 60 + (i % 3) * 90 },
          data: {
            nodeType,
            graphData:  d as Record<string, unknown>,
            stepIndex:  stepOf.get(n.id),
            status:     info.status,
            error:      info.error,
            durationMs: info.durationMs,
            caughtCount: info.caughtCount,
            isGlobalCatcher: info.isGlobalCatcher,
          } satisfies HubDesignerNodeData,
          selected: n.id === selectedNodeId,
        };
      }

      const label = String(d.label ?? d.plugName ?? d.flaLabel ?? n.id);
      return {
        id:       n.id,
        type:     'hubExec',
        position: n.position ?? { x: (stepOf.get(n.id) ?? i) * 240, y: 80 + (i % 2) * 40 },
        data: {
          label,
          nodeType,
          stepIndex:  stepOf.get(n.id),
          status:     info.status,
          error:      info.error,
          logLine:    info.logLine,
          durationMs: info.durationMs,
          caughtCount: info.caughtCount,
          isGlobalCatcher: info.isGlobalCatcher,
        } satisfies HubExecutionNodeData,
        selected: n.id === selectedNodeId,
      };
    });

    const flowEdges: Edge[] = graphEdges.map((e, i) => {
      const targetStatus = statusMap[e.target]?.status;
      const stroke = targetStatus === 'error'
        ? 'var(--red)'
        : targetStatus === 'ok'
          ? 'var(--green)'
          : targetStatus === 'skipped'
            ? 'var(--slate)'
            : 'var(--t3)';
      return {
        id:     e.id ?? `e-${i}`,
        source: e.source,
        target: e.target,
        animated: targetStatus === 'running',
        style: { stroke, strokeWidth: 2, strokeDasharray: '6 4' },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [graphNodes, graphEdges, statusMap, selectedNodeId, useDesignerNodes]);

  const nodeTypes = useDesignerNodes ? hubDesignerTypes : hubExecTypes;
  const wrapClass = tall ? 'hub-pipeline-wrap hub-pipeline-wrap-tall' : 'hub-pipeline-wrap';

  if (graphNodes.length === 0) {
    return (
      <div className="hub-pipeline-empty">
        No canvas graph available for this run. Save/publish the flo with layout, or re-run after deploying the latest hub API.
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={1.5}
        onNodeClick={(_, n) => onSelectNode?.(n.id)}
        onPaneClick={() => onSelectNode?.(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--t4)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={n => {
            const st = (n.data as unknown as HubExecutionNodeData)?.status;
            if (st === 'error') return '#f87171';
            if (st === 'ok') return '#34d399';
            return '#4a5a72';
          }}
          maskColor="rgba(7, 9, 15, 0.85)"
        />
      </ReactFlow>
    </div>
  );
};

export const RunPipelineVisualizer: React.FC<RunPipelineVisualizerProps> = props => (
  <ReactFlowProvider>
    <DesignerInner {...props} />
  </ReactFlowProvider>
);

function topoOrder(nodes: CanvasGraphNode[], edges: CanvasGraphEdge[]): string[] {
  const deg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const n of nodes) {
    deg[n.id] = 0;
    adj[n.id] = [];
  }
  for (const e of edges) {
    if (!adj[e.source]) adj[e.source] = [];
    adj[e.source].push(e.target);
    deg[e.target] = (deg[e.target] ?? 0) + 1;
    if (deg[e.source] === undefined) deg[e.source] = 0;
  }
  const queue = nodes.filter(n => (deg[n.id] ?? 0) === 0).map(n => n.id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const nxt of adj[id] ?? []) {
      if (--deg[nxt] === 0) queue.push(nxt);
    }
  }
  for (const n of nodes) {
    if (!out.includes(n.id)) out.push(n.id);
  }
  return out;
}
