import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode } from './CompactNode';

export const StartNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.initVars as unknown[]) ?? []).length;
  return (
    <CompactNode id={id} selected={!!selected} color="#22c55e" icon="▶" title="START"
      subtitle={n ? `${n} init variable${n === 1 ? '' : 's'}` : 'Flow entry'}
      hasTarget={false} hasSource />
  );
};

export const EndNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.outputParams as string[]) ?? []).length;
  return (
    <CompactNode id={id} selected={!!selected} color="#f59e0b" icon="■" title="END"
      subtitle={n ? `${n} output param${n === 1 ? '' : 's'}` : 'Full cStream output'}
      hasTarget hasSource={false} />
  );
};
