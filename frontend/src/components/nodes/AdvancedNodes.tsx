import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';

export interface StoreRow {
  action:     'set' | 'get' | 'clear';
  scope:      'global' | 'local';
  varName:    string;
  sourcePath: string;
  targetPath: string;
}

export const VariableStoreNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.rows as StoreRow[]) ?? []).length;
  return (
    <CompactNode id={id} selected={!!selected} color="#0891b2" icon="VS" title="Variable Store"
      subtitle={`${n} operation${n === 1 ? '' : 's'}`} badge={outputTargetBadge(d)} status={deriveNodeStatus(d)}
      onDelete={() => (d.onDelete as (nid: string) => void)?.(id)} />
  );
};

export const FIFNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const floId = String(d.selectedFloId ?? '');
  return (
    <CompactNode id={id} selected={!!selected} color="#7e22ce" icon="FiF" title="Flow in Flow"
      subtitle={floId ? 'Sub-flow selected' : 'No sub-flow'} badge={outputTargetBadge(d)}
      status={deriveNodeStatus(d)} onDelete={() => (d.onDelete as (nid: string) => void)?.(id)} />
  );
};

export const FunctionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  return (
    <CompactNode id={id} selected={!!selected} color="#b45309" icon="fn" title="Function"
      subtitle={String(d.outputMode ?? 'overwrite')} badge={outputTargetBadge(d)}
      status={deriveNodeStatus(d)} onDelete={() => (d.onDelete as (nid: string) => void)?.(id)} />
  );
};
