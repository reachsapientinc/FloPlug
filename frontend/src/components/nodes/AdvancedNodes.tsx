import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { nodeDisplayTitle } from '@floplug/shared';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';
import { nodeDimensions } from './FlowNodeShell';

export interface StoreRow {
  action:     'set' | 'get' | 'clear';
  scope:      'global' | 'local';
  varName:    string;
  sourcePath: string;
  targetPath: string;
}

const logicCard = (
  id: string, data: Record<string, unknown>, selected: boolean,
  color: string, icon: string, defaultTitle: string, subtitle: string,
  dims: { width: number; height: number },
) => (
  <CompactNode
    id={id}
    selected={selected}
    color={color}
    icon={icon}
    title={nodeDisplayTitle(data, defaultTitle)}
    subtitle={subtitle}
    badge={outputTargetBadge(data)}
    status={deriveNodeStatus(data)}
    showErrorHandle={!!data._showErrorHandle}
    width={dims.width}
    height={dims.height}
    onDelete={() => (data.onDelete as (nid: string) => void)?.(id)}
  />
);

export const VariableStoreNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.rows as StoreRow[]) ?? []).length;
  return logicCard(id, d, !!selected, '#0891b2', 'VS', 'Variable Store',
    `${n} operation${n === 1 ? '' : 's'}`, nodeDimensions(dimProps));
};

export const FIFNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  const floId = String(d.selectedFloId ?? '');
  return logicCard(id, d, !!selected, '#7e22ce', 'FiF', 'Flow in Flow',
    floId ? 'Sub-flow selected' : 'No sub-flow', nodeDimensions(dimProps));
};

export const FunctionNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  return logicCard(id, d, !!selected, '#b45309', 'fn', 'Function',
    String(d.outputMode ?? 'overwrite'), nodeDimensions(dimProps));
};
