import React, { useState } from 'react';
import type { FloExecutionNodeRecord } from '@floplug/shared';
import { formatDuration } from '../utils/formatters';
import { StatusDot } from './StatusBadge';
import { GenericNodeBody } from './GenericNodeRenderer';

export interface NodeRecordCardProps {
  record: FloExecutionNodeRecord;
  defaultOpen?: boolean;
}

export const NodeRecordCard: React.FC<NodeRecordCardProps> = ({
  record,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const nodeStatus = record.status === 'ok' ? 'success'
    : record.status === 'error' ? 'error'
    : record.status;

  return (
    <div className="node-card">
      <div
        className="node-card-head"
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(o => !o); }}
      >
        <StatusDot status={nodeStatus} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>
            {record.nodeLabel ?? record.nodeId}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
            {record.nodeType} · {formatDuration(record.durationMs)}
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="node-card-body">
          {record.logLine && (
            <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 10 }}>
              {record.logLine}
            </div>
          )}
          {record.error && (
            <div style={{
              fontSize: 11, color: 'var(--red)', marginBottom: 10,
              padding: '8px 10px', background: 'var(--red-dim)', borderRadius: 6,
            }}>
              {record.error}
            </div>
          )}
          <GenericNodeBody record={record} />
        </div>
      )}
    </div>
  );
};
