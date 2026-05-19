import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';

interface FloActionNodeData {
  floActionName?:       string;
  flaLabel?:            string;
  connectorId?:         string;
  actionIds?:           string[];
  connectionId?:        string;
  outputTarget?:        'cStream' | 'local' | 'global';
  varName?:             string;
  onDelete?:            (id: string) => void;
  [key: string]:        unknown;
}

const FloActionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as FloActionNodeData;
  const title = d.flaLabel ?? d.floActionName ?? 'FloAction';
  const subtitle = d.varName
    ? `→ ${d.outputTarget}:${d.varName}`
    : (d.connectorId ?? '');

  return (
    <CompactNode
      id={id}
      selected={!!selected}
      color="#10b981"
      icon="⚡"
      title={title}
      //subtitle={d.floActionName && d.flaLabel !== d.floActionName ? d.floActionName : (d.connectorId ?? '')}
      subtitle={subtitle}
      badge={outputTargetBadge(d as Record<string, unknown>)}
      status={deriveNodeStatus(d as Record<string, unknown>)}
      onDelete={() => d.onDelete?.(id)}
    />
  );
};

export default FloActionNode;
