import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, deriveNodeStatus, floActionIoBadge } from './CompactNode';

interface FloActionNodeData {
  floActionName?:       string;
  flaLabel?:            string;
  connectorId?:         string;
  actionIds?:           string[];
  connectionId?:        string;
  inputSource?:         'cStream' | 'local' | 'global';
  inputVarName?:        string;
  inputContentType?:    string;
  outputTarget?:        'cStream' | 'local' | 'global';
  outputVarName?:       string;
  onDelete?:            (id: string) => void;
  [key: string]:        unknown;
}

const FloActionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as FloActionNodeData;
  const title = d.flaLabel ?? d.floActionName ?? 'FloAction';
  const subtitle = d.connectorId ?? '';

  return (
    <CompactNode
      id={id}
      selected={!!selected}
      color="#10b981"
      icon="⚡"
      title={title}
      subtitle={subtitle}
      badge={floActionIoBadge(d as Record<string, unknown>)}
      status={deriveNodeStatus(d as Record<string, unknown>)}
      onDelete={() => d.onDelete?.(id)}
    />
  );
};

export default FloActionNode;
