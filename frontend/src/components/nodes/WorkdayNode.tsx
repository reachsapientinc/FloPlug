import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { nodeDisplayTitle } from '@floplug/shared';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';
import { nodeDimensions } from './FlowNodeShell';

export const WorkdayNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  const action = String(d.actionType ?? 'Get_Workers');
  const refId = String(d.refId ?? '');
  const dims = nodeDimensions(dimProps);
  return (
    <CompactNode
      id={id}
      selected={!!selected}
      color="#f5a623"
      icon="W"
      title={nodeDisplayTitle(d, 'Workday')}
      subtitle={refId ? `${action} · ${refId}` : action}
      badge={outputTargetBadge(d)}
      status={deriveNodeStatus(d)}
      showErrorHandle={!!d._showErrorHandle}
      width={dims.width}
      height={dims.height}
      onDelete={() => (d.onDelete as (nid: string) => void)?.(id)}
    />
  );
};
