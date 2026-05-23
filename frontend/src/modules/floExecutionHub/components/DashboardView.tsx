import React, { useMemo } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { normalizeRunStatus } from '../utils/formatters';
import { RunCard } from './RunCard';
import { RunDetailPanel } from './RunDetailPanel';
import type { ExecutionHubRunDetail } from '../api/hubApi';

export interface DashboardViewProps {
  runs: FloExecutionRunSummary[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  detail: ExecutionHubRunDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onRefresh: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  runs, selectedRunId, onSelectRun, detail, detailLoading, detailError, onRefresh,
}) => {
  const metrics = useMemo(() => {
    let running = 0;
    let success = 0;
    let error = 0;
    for (const r of runs) {
      const k = normalizeRunStatus(r.status);
      if (k === 'running') running++;
      else if (k === 'success') success++;
      else if (k === 'error') error++;
    }
    return { total: runs.length, running, success, error };
  }, [runs]);

  const recent = runs.slice(0, 20);

  return (
    <div className="view on" style={{ flexDirection: 'row' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="dash-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Dashboard</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--t3)' }}>
              Recent flo executions across your hub
            </p>
          </div>
          <button type="button" className="refresh-btn" onClick={onRefresh}>Refresh</button>
        </div>

        <div className="metrics">
          <div className="mc cc">
            <div className="mc-lbl">Total runs</div>
            <div className="mc-val" style={{ color: 'var(--cyan)' }}>{metrics.total}</div>
          </div>
          <div className="mc cg">
            <div className="mc-lbl">Success</div>
            <div className="mc-val" style={{ color: 'var(--green)' }}>{metrics.success}</div>
          </div>
          <div className="mc cr">
            <div className="mc-lbl">Errors</div>
            <div className="mc-val" style={{ color: 'var(--red)' }}>{metrics.error}</div>
          </div>
          <div className="mc ca">
            <div className="mc-lbl">Running</div>
            <div className="mc-val" style={{ color: 'var(--amber)' }}>{metrics.running}</div>
          </div>
        </div>

        <div className="scroll-area">
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 12 }}>
            Recent runs
          </div>
          {recent.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <p>No executions yet. Run a flo from the designer or trigger via webhook.</p>
            </div>
          ) : (
            recent.map(r => (
              <RunCard
                key={r.runId}
                run={r}
                selected={r.runId === selectedRunId}
                onSelect={onSelectRun}
              />
            ))
          )}
        </div>
      </div>

      <div className="detail-panel" style={{ width: 520, flexShrink: 0, overflow: 'auto' }}>
        <RunDetailPanel detail={detail} loading={detailLoading} error={detailError} />
      </div>
    </div>
  );
};
