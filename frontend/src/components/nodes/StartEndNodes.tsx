import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { nodeDisplayTitle } from '@floplug/shared';
import { CompactNode } from './CompactNode';
import { nodeDimensions } from './FlowNodeShell';

export const StartNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.initVars as unknown[]) ?? []).length;
  const dims = nodeDimensions(dimProps);
  return (
    <CompactNode id={id} selected={!!selected} color="#22c55e" icon="▶"
      title={nodeDisplayTitle(d, 'START')}
      subtitle={n ? `${n} init variable${n === 1 ? '' : 's'}` : 'Flow entry'}
      hasTarget={false} hasSource deletable={false}
      width={dims.width} height={dims.height} />
  );
};

export const EndNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.outputParams as string[]) ?? []).length;
  const dims = nodeDimensions(dimProps);
  return (
    <CompactNode id={id} selected={!!selected} color="#f59e0b" icon="■"
      title={nodeDisplayTitle(d, 'END')}
      subtitle={n ? `${n} output param${n === 1 ? '' : 's'}` : 'Full cStream output'}
      hasTarget hasSource={false} deletable={false}
      width={dims.width} height={dims.height} />
  );
};
