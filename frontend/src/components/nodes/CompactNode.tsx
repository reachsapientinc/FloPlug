import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { FlowNodeShell, nodeDeleteHandler, nodeDimensions, type FlowNodeShellProps } from './FlowNodeShell';

export type NodeStatus = 'idle' | 'running' | 'ok' | 'error';

const STATUS_COLOR: Record<NodeStatus, string> = {
  idle:    '#6b7080',
  running: '#f59e0b',
  ok:      '#22c55e',
  error:   '#f87171',
};

export interface CompactNodeProps {
  id:          string;
  selected:    boolean;
  color:       string;
  icon:        string;
  title:       string;
  subtitle?:   string;
  badge?:      string;
  status?:     NodeStatus;
  hasTarget?:  boolean;
  hasSource?:  boolean;
  onDelete?:   () => void;
  deletable?:  boolean;
  width?:      number;
  height?:     number;
}

export const deriveNodeStatus = (data: Record<string, unknown>): NodeStatus => {
  if (data._loading) return 'running';
  if (data._isError) return 'error';
  if (data._result)  return 'ok';
  return 'idle';
};

export const outputTargetBadge = (data: Record<string, unknown>): string | undefined => {
  const target = (data.outputTarget as string) || 'cStream';
  if (target === 'cStream') return undefined;
  const name = (data.outputVarName as string) || '?';
  return `→ ${target}.${name}`;
};

export const inputSourceBadge = (data: Record<string, unknown>): string | undefined => {
  const source = (data.inputSource as string) || 'cStream';
  if (source === 'cStream') return undefined;
  const name = (data.inputVarName as string) || '?';
  return `← ${source}.${name}`;
};

export const floActionIoBadge = (data: Record<string, unknown>): string | undefined => {
  const parts = [inputSourceBadge(data), outputTargetBadge(data)].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
};

export const CompactNode: React.FC<CompactNodeProps> = ({
  id: _id, selected, color, icon, title, subtitle, badge, status = 'idle',
  hasTarget = true, hasSource = true, onDelete, deletable = true,
  width = 172, height = 64,
}) => (
  <FlowNodeShell
    selected={selected}
    color={color}
    width={width}
    height={height}
    onDelete={onDelete}
    deletable={deletable}
    extras={
      <>
        {hasTarget && (
          <Handle type="target" position={Position.Left} style={{
            width: 10, height: 10, background: color,
            border: '2px solid #0f1117', borderRadius: '50%',
          }} />
        )}
        {hasSource && (
          <Handle type="source" position={Position.Right} style={{
            width: 10, height: 10, background: color,
            border: '2px solid #0f1117', borderRadius: '50%',
          }} />
        )}
      </>
    }
  >
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      padding: '8px 10px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 5, flexShrink: 0,
          background: `${color}22`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: icon.length > 2 ? 7 : 10,
          fontWeight: 800, color,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: '#e8e8f0',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize: 8, color: '#9090a8', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{subtitle}</div>
          )}
        </div>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: STATUS_COLOR[status],
        }} title={status} />
      </div>

      {badge && (
        <div style={{
          fontSize: 7, color: '#39ff14', alignSelf: 'flex-start',
          background: 'rgba(57,255,20,0.07)', border: '0.5px solid rgba(57,255,20,0.2)',
          borderRadius: 3, padding: '1px 5px', maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{badge}</div>
      )}
    </div>
  </FlowNodeShell>
);

export type { FlowNodeShellProps };
