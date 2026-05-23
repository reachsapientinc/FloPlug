import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { HubNodeExecStatus } from '../utils/executionStatus';
import { formatDuration } from '../utils/formatters';

export interface HubExecutionNodeData {
  label:       string;
  nodeType:    string;
  stepIndex?:  number;
  status:      HubNodeExecStatus;
  error?:      string;
  logLine?:    string;
  durationMs?: number;
}

const STATUS_STYLES: Record<HubNodeExecStatus, { border: string; glow: string; badge: string }> = {
  ok: {
    border: 'var(--green-border)',
    glow:   '0 0 12px rgba(52, 211, 153, 0.25)',
    badge:  'var(--green)',
  },
  error: {
    border: 'var(--red-border)',
    glow:   '0 0 16px rgba(248, 113, 113, 0.45)',
    badge:  'var(--red)',
  },
  skipped: {
    border: 'rgba(148, 163, 184, 0.35)',
    glow:   'none',
    badge:  'var(--slate)',
  },
  pending: {
    border: 'var(--border-md)',
    glow:   'none',
    badge:  'var(--t3)',
  },
  running: {
    border: 'var(--cyan-border)',
    glow:   '0 0 14px rgba(56, 189, 248, 0.35)',
    badge:  'var(--cyan)',
  },
};

function statusLabel(status: HubNodeExecStatus): string {
  switch (status) {
    case 'ok':      return 'OK';
    case 'error':   return 'ERROR';
    case 'skipped': return 'SKIPPED';
    case 'running': return 'ACTIVE';
    default:        return 'PENDING';
  }
}

export const HubExecutionNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as HubExecutionNodeData;
  const st = STATUS_STYLES[d.status] ?? STATUS_STYLES.pending;

  return (
    <div
      className={`hub-exec-node${selected ? ' sel' : ''}${d.status === 'error' ? ' err' : ''}`}
      style={{
        borderColor: st.border,
        boxShadow:   selected ? st.glow : (d.status === 'error' ? st.glow : undefined),
      }}
    >
      <Handle type="target" position={Position.Left} className="hub-exec-handle" />
      {d.stepIndex != null && (
        <div className="hub-exec-step">STEP {d.stepIndex}</div>
      )}
      <div className="hub-exec-title">{d.label}</div>
      <div className="hub-exec-type">{d.nodeType}</div>
      <div className="hub-exec-footer">
        <span className="hub-exec-badge" style={{ color: st.badge, borderColor: st.border }}>
          {statusLabel(d.status)}
        </span>
        {d.durationMs != null && (
          <span className="hub-exec-metric">{formatDuration(d.durationMs)}</span>
        )}
      </div>
      {d.status === 'error' && d.error && (
        <div className="hub-exec-error" title={d.error}>
          {d.error.length > 72 ? `${d.error.slice(0, 72)}…` : d.error}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="hub-exec-handle" />
    </div>
  );
});

HubExecutionNode.displayName = 'HubExecutionNode';
