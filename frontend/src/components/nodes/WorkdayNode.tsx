import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';

export const WorkdayNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const action = String(d.actionType ?? 'Get_Workers');
  const refId = String(d.refId ?? '');
  return (
    <CompactNode
      id={id}
      selected={!!selected}
      color="#f5a623"
      icon="W"
      title="Workday"
      subtitle={refId ? `${action} · ${refId}` : action}
      badge={outputTargetBadge(d)}
      status={deriveNodeStatus(d)}
      onDelete={() => (d.onDelete as (id: string) => void)?.(id)}
    />
  );
};
