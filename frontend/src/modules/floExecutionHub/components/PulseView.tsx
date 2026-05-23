import React, { useMemo } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { RunCard } from './RunCard';
import { RunDetailPanel } from './RunDetailPanel';
import type { ExecutionHubRunDetail } from '../api/hubApi';

export interface PulseViewProps {
  runs: FloExecutionRunSummary[];
  selectedRunId: string | null;
  floFilter: string | null;
  onFloFilter: (floId: string | null) => void;
  onSelectRun: (runId: string) => void;
  detail: ExecutionHubRunDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onRefresh: () => void;
}

export const PulseView: React.FC<PulseViewProps> = ({
  runs, selectedRunId, floFilter, onFloFilter, onSelectRun,
  detail, detailLoading, detailError, onRefresh,
}) => {
  const floList = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of runs) {
      if (!map.has(r.floId)) map.set(r.floId, r.floName ?? r.floId);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [runs]);

  const filtered = floFilter
    ? runs.filter(r => r.floId === floFilter)
    : runs;

  return (
    <div className="view on pulse-layout">
      <div className="sidebar">
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 8, padding: '0 4px' }}>
          Flos
        </div>
        <div
          className={`sidebar-item${floFilter === null ? ' on' : ''}`}
          onClick={() => onFloFilter(null)}
          role="button"
          tabIndex={0}
        >
          All flos
        </div>
        {floList.map(f => (
          <div
            key={f.id}
            className={`sidebar-item${floFilter === f.id ? ' on' : ''}`}
            onClick={() => onFloFilter(f.id)}
            role="button"
            tabIndex={0}
          >
            {f.name}
          </div>
        ))}
      </div>

      <div className="pulse-main">
        <div className="run-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{filtered.length} runs</span>
            <button type="button" className="refresh-btn" onClick={onRefresh}>Refresh</button>
          </div>
          {filtered.map(r => (
            <RunCard
              key={r.runId}
              run={r}
              selected={r.runId === selectedRunId}
              onSelect={onSelectRun}
              compact
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--t3)', padding: 20, textAlign: 'center' }}>
              No runs for this filter
            </div>
          )}
        </div>
        <div className="detail-panel">
          <RunDetailPanel detail={detail} loading={detailLoading} error={detailError} />
        </div>
      </div>
    </div>
  );
};
