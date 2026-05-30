import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, deriveNodeStatus, floActionIoBadge } from './CompactNode';
import { nodeDimensions } from './FlowNodeShell';
import { nodeDisplayTitle } from '@floplug/shared';

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

const FloActionNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as FloActionNodeData;
  const dims = nodeDimensions(dimProps);
  const title = nodeDisplayTitle(d as Record<string, unknown>, d.flaLabel ?? d.floActionName ?? 'FloAction');
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
      width={dims.width}
      height={dims.height}
      onDelete={() => d.onDelete?.(id)}
    />
  );
};

export default FloActionNode;
