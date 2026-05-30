import React from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import {
  formatDuration,
  formatNumber,
  formatRunStartDate,
  formatRunStartTime,
  normalizeRunStatus,
  triggerLabel,
} from '../utils/formatters';
import { StatusPill } from './StatusBadge';

const NODE_PILL_COLORS = ['#f97316', '#6366f1', '#ec4899', '#eab308', '#ef4444', '#22c55e'];

function pipelinePills(nodeCount?: number) {
  const n = Math.max(nodeCount ?? 0, 1);
  const count = Math.min(n, 6);
  const labels = ['Source', 'Filter', 'Enrich', 'Transform', 'Validate', 'Sink'];
  return Array.from({ length: count }, (_, i) => ({
    label: labels[i] ?? `Node ${i + 1}`,
    color: NODE_PILL_COLORS[i % NODE_PILL_COLORS.length],
  }));
}

function durationBarPct(run: FloExecutionRunSummary): number {
  const st = normalizeRunStatus(run.status);
  if (st === 'success' || st === 'warning') return 100;
  if (st === 'error') return 65;
  if (st === 'running') return 55;
  return 25;
}

function durationBarColor(run: FloExecutionRunSummary): string {
  const st = normalizeRunStatus(run.status);
  if (st === 'success') return 'var(--green)';
  if (st === 'warning') return 'var(--amber)';
  if (st === 'error') return 'var(--red)';
  if (st === 'running') return 'var(--cyan)';
  return 'var(--slate)';
}

export interface PulseRunsTableProps {
  runs: FloExecutionRunSummary[];
  onViewRun: (runId: string) => void;
}

export const PulseRunsTable: React.FC<PulseRunsTableProps> = ({ runs, onViewRun }) => {
  if (runs.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <p>No executions match the current filters.</p>
      </div>
    );
  }

  return (
    <table className="pulse-table">
      <thead>
        <tr>
          <th>Flo / Run ID</th>
          <th>Run start</th>
          <th>Duration</th>
          <th>Status</th>
          <th>Trigger</th>
          <th>Records</th>
          <th>Pipeline nodes</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {runs.map(run => {
          const pills = pipelinePills(run.nodeCount);
          return (
            <tr key={run.runId}>
              <td>
                <div className="pulse-flo-cell-name">{run.runLabel ?? run.floName ?? run.floId}</div>
                {run.runLabel && (
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>{run.floName ?? run.floId}</div>
                )}
                <div className="pulse-flo-cell-runid">{run.runId}</div>
                <div className="pulse-flo-cell-date">{formatRunStartDate(run.startedAt)}</div>
              </td>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                {formatRunStartTime(run.startedAt)}
              </td>
              <td>
                <div>{formatDuration(run.durationMs)}</div>
                <div className="pulse-duration-bar">
                  <div
                    className="pulse-duration-fill"
                    style={{ width: `${durationBarPct(run)}%`, background: durationBarColor(run) }}
                  />
                </div>
              </td>
              <td><StatusPill status={run.status} /></td>
              <td>{triggerLabel(run.source)}</td>
              <td style={{ fontFamily: 'var(--mono)' }}>{formatNumber(run.nodeCount ?? 0)}</td>
              <td>
                <div className="pulse-node-pills">
                  {pills.map(p => (
                    <span
                      key={p.label}
                      className="pulse-node-pill"
                      style={{ borderLeft: `2px solid ${p.color}` }}
                    >
                      {p.label}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <button type="button" className="pulse-view-link" onClick={() => onViewRun(run.runId)}>
                  + View
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
