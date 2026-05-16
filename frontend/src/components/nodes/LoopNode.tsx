import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';

export const LoopNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const mode = String(d.mode ?? 'iterator');
  return (
    <CompactNode id={id} selected={!!selected} color="#ea580c" icon="↻" title="Loop"
      subtitle={mode === 'iterator' ? `Iterator · ${d.arrayPath || 'cStream'}` : 'Expression loop'}
      badge={outputTargetBadge(d)} status={deriveNodeStatus(d)}
      onDelete={() => (d.onDelete as (nid: string) => void)?.(id)} />
  );
};
