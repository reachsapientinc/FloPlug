import React, { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, type NodeStatus } from '../../../components/nodes/CompactNode';
import type { HubNodeExecStatus } from '../utils/executionStatus';
import { formatDuration } from '../utils/formatters';
import { hubNodeTitle, hubNodeVisual } from '../utils/hubNodeStyles';

export interface HubDesignerNodeData {
  nodeType:    string;
  graphData?:  Record<string, unknown>;
  stepIndex?:  number;
  status:      HubNodeExecStatus;
  error?:      string;
  durationMs?: number;
}

function execToCompactStatus(status: HubNodeExecStatus): NodeStatus {
  if (status === 'ok') return 'ok';
  if (status === 'error') return 'error';
  if (status === 'running') return 'running';
  return 'idle';
}

export const HubDesignerNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as HubDesignerNodeData;
  const graphData = d.graphData ?? {};
  const visual = hubNodeVisual(d.nodeType, graphData);
  const title = hubNodeTitle(d.nodeType, graphData, id);
  const subtitle = d.stepIndex != null
    ? `Step ${d.stepIndex} · ${formatDuration(d.durationMs)}`
    : formatDuration(d.durationMs);

  return (
    <div style={{ position: 'relative' }}>
      {d.status === 'error' && <div className="hub-node-error-ring" />}
      {d.status === 'running' && <div className="hub-node-active-ring" />}
      <CompactNode
        id={id}
        selected={!!selected}
        color={visual.color}
        icon={visual.icon}
        title={title}
        subtitle={subtitle !== '—' ? subtitle : (d.nodeType.replace(/Node$/, '') || 'node')}
        status={execToCompactStatus(d.status)}
        hasTarget
        hasSource
        width={188}
        height={68}
      />
      {d.status === 'error' && d.error && (
        <div className="hub-node-tooltip-err" title={d.error}>
          {d.error.length > 48 ? `${d.error.slice(0, 48)}…` : d.error}
        </div>
      )}
    </div>
  );
});

HubDesignerNode.displayName = 'HubDesignerNode';
