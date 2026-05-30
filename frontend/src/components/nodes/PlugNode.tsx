import React from 'react';
import { type NodeProps } from '@xyflow/react';
import type { PlugVariableBinding, PlugVariableHint } from '@floplug/shared';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';
import { nodeDimensions } from './FlowNodeShell';

interface PlugNodeData {
  plugName?:         string;
  connectorLabel?:   string;
  authProtocol?:     string;
  nodeType?:         string;
  urlPattern?:       string;
  urlVariables?:     Record<string, PlugVariableBinding>;
  variableHints?:    PlugVariableHint[];
  emailBindings?:    Record<string, { value?: string }>;
  onDelete?:         (id: string) => void;
  [key: string]:     unknown;
}

const PlugNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as PlugNodeData;
  const dims = nodeDimensions(dimProps);
  const isEmail = d.authProtocol === 'smtp_basic' || d.nodeType === 'emailNode';
  const urlVars = isEmail ? [] : [...((d.urlPattern ?? '').matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]);
  const filledCount = urlVars.filter(v => {
    const b = d.urlVariables?.[v];
    if (b?.value) return true;
    return d.variableHints?.find(h => h.name === v)?.defaultValue;
  }).length;

  let subtitle = d.connectorLabel ?? '';
  if (isEmail) {
    const to = d.emailBindings?.to?.value ?? '';
    subtitle = to ? `✉ ${to.slice(0, 24)}${to.length > 24 ? '…' : ''}` : 'Email — configure in panel';
  } else if (urlVars.length > 0) {
    subtitle = `${filledCount}/${urlVars.length} vars set`;
  }

  return (
    <CompactNode
      id={id}
      selected={!!selected}
      color={isEmail ? '#f59e0b' : '#4f8ef7'}
      icon={isEmail ? '✉' : (d.plugName?.slice(0, 2).toUpperCase() ?? 'PL')}
      title={d.plugName ?? 'Plug'}
      subtitle={subtitle}
      badge={outputTargetBadge(d as Record<string, unknown>)}
      status={deriveNodeStatus(d as Record<string, unknown>)}
      width={dims.width}
      height={dims.height}
      onDelete={() => d.onDelete?.(id)}
    />
  );
};

export default PlugNode;
