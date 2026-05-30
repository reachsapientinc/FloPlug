import React from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { formatFloRunVersion } from '@floplug/shared';
import { formatDuration, formatRunStartTime, truncateId, normalizeRunStatus, triggerLabel } from '../utils/formatters';
import { StatusDot, StatusPill } from './StatusBadge';

export interface RunCardProps {
  run: FloExecutionRunSummary;
  selected: boolean;
  onSelect: (runId: string) => void;
  compact?: boolean;
  showProgress?: boolean;
}

function progressForRun(run: FloExecutionRunSummary): { pct: number; color: string; label?: string } {
  const st = normalizeRunStatus(run.status);
  if (st === 'success') return { pct: 100, color: 'var(--green)' };
  if (st === 'error') return { pct: 100, color: 'var(--red)', label: run.errorMessage ? 'Failed' : undefined };
  if (st === 'running') return { pct: 55, color: 'var(--cyan)' };
  if (st === 'killed') return { pct: 100, color: 'var(--amber)', label: 'Killed' };
  if (st === 'fatal') return { pct: 100, color: '#c084fc', label: 'Fatal' };
  return { pct: 20, color: 'var(--slate)' };
}

export const RunCard: React.FC<RunCardProps> = ({ run, selected, onSelect, compact, showProgress }) => {
  const progress = progressForRun(run);

  return (
    <div
      className={`run-card${selected ? ' sel' : ''}${showProgress ? ' run-card-progress' : ''}`}
      onClick={() => onSelect(run.runId)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(run.runId); }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compact && !showProgress ? 0 : 8 }}>
        <StatusDot status={run.status} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="run-card-title">
            {run.runLabel ?? run.floName ?? run.floId}
            {!compact && showProgress && (
              <span className="run-card-runid"> · {truncateId(run.runId, 8)}</span>
            )}
          </div>
          {run.runLabel && (
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
              {run.floName ?? run.floId}
            </div>
          )}
          {!compact && !showProgress && (
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--t3)' }}>
              {truncateId(run.runId, 10)}
            </div>
          )}
          {showProgress && (
            <div className="run-card-sub">
              Started {formatRunStartTime(run.startedAt)}
              {run.durationMs != null ? ` · ${formatDuration(run.durationMs)}` : ''}
              {run.source ? ` · ${triggerLabel(run.source)}` : ''}
              {run.nodeCount != null ? ` · ${run.nodeCount.toLocaleString()} records` : ''}
            </div>
          )}
        </div>
        <StatusPill status={run.status} />
        <span className="run-card-version">
          {formatFloRunVersion(run.floVersion, run.executedGraph)}
        </span>
      </div>

      {!compact && !showProgress && (
        <>
          <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--t3)', flexWrap: 'wrap' }}>
            <span>{formatRunStartTime(run.startedAt)}</span>
            <span>{formatDuration(run.durationMs)}</span>
            {run.source && <span>{run.source}</span>}
            {run.nodeCount != null && <span>{run.nodeCount} nodes</span>}
          </div>
          {run.status === 'error' && run.errorMessage && (
            <div className="run-card-err-snippet">{run.errorMessage}</div>
          )}
        </>
      )}

      {showProgress && (
        <>
          <div className="run-progress-track">
            <div
              className={`run-progress-fill${normalizeRunStatus(run.status) === 'running' ? ' pulsing' : ''}`}
              style={{ width: `${progress.pct}%`, background: progress.color }}
            />
          </div>
          {run.status === 'error' && run.errorMessage && (
            <div className="run-card-err-snippet">{run.errorMessage}</div>
          )}
        </>
      )}
    </div>
  );
};
