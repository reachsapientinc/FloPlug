import React, { useMemo } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { normalizeRunStatus } from '../utils/formatters';
import { HubSidebar } from './HubSidebar';
import { RunCard } from './RunCard';
import { RunDetailPanel } from './RunDetailPanel';
import type { ExecutionHubRunDetail } from '../api/hubApi';

export interface LiveMonitorViewProps {
  runs: FloExecutionRunSummary[];
  selectedRunId: string | null;
  floFilter: string | null;
  onFloFilter: (floId: string | null) => void;
  onSelectRun: (runId: string) => void;
  detail: ExecutionHubRunDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onRefresh: () => void;
  autoRefreshing?: boolean;
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  runs, selectedRunId, floFilter, onFloFilter, onSelectRun,
  detail, detailLoading, detailError, onRefresh, autoRefreshing,
}) => {
  const filtered = floFilter ? runs.filter(r => r.floId === floFilter) : runs;

  const metrics = useMemo(() => {
    let running = 0;
    let success = 0;
    let error = 0;
    let totalNodes = 0;
    let totalDuration = 0;
    let durationCount = 0;
    for (const r of filtered) {
      const k = normalizeRunStatus(r.status);
      if (k === 'running') running++;
      else if (k === 'success') success++;
      else if (k === 'error') error++;
      if (r.nodeCount) totalNodes += r.nodeCount;
      if (r.durationMs != null) {
        totalDuration += r.durationMs;
        durationCount += 1;
      }
    }
    const total = filtered.length;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '—';
    const avgLatency = durationCount > 0 ? Math.round(totalDuration / durationCount) : null;
    return { total, running, success, error, totalNodes, successRate, avgLatency };
  }, [filtered]);

  const activeRuns = useMemo(() => {
    const running = filtered.filter(r => normalizeRunStatus(r.status) === 'running');
    const rest = filtered.filter(r => normalizeRunStatus(r.status) !== 'running');
    return [...running, ...rest].slice(0, 30);
  }, [filtered]);

  return (
    <div className="view on live-monitor-layout">
      <HubSidebar runs={runs} floFilter={floFilter} onFloFilter={onFloFilter} />

      <section className="live-monitor-center">
        <div className="live-monitor-header">
          <div>
            <h2 className="live-monitor-title">Live Monitor</h2>
            <p className="live-monitor-sub">
              Active flo executions{autoRefreshing ? ' · auto-refreshing' : ''}
            </p>
          </div>
          <button type="button" className="refresh-btn" onClick={onRefresh}>Refresh</button>
        </div>

        <div className="metrics live-monitor-metrics">
          <div className="mc cc">
            <div className="mc-lbl">Records / nodes</div>
            <div className="mc-val">{metrics.totalNodes.toLocaleString()}</div>
            <div className="mc-sub">{metrics.total} runs in view</div>
          </div>
          <div className="mc cg">
            <div className="mc-lbl">Success rate</div>
            <div className="mc-val">{metrics.successRate}{metrics.successRate !== '—' ? '%' : ''}</div>
            <div className="mc-sub">{metrics.success} succeeded</div>
          </div>
          <div className="mc ca">
            <div className="mc-lbl">Avg latency</div>
            <div className="mc-val">{metrics.avgLatency != null ? `${metrics.avgLatency}ms` : '—'}</div>
            <div className="mc-sub">{metrics.running} running now</div>
          </div>
          <div className="mc cp">
            <div className="mc-lbl">Errors</div>
            <div className="mc-val" style={{ color: 'var(--red)' }}>{metrics.error}</div>
            <div className="mc-sub">failed runs</div>
          </div>
        </div>

        <div className="live-monitor-runs-label">Active runs — click a run to inspect</div>
        <div className="live-monitor-runs scroll-area">
          {activeRuns.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <p>No executions yet. Run a flo from the designer or trigger via webhook.</p>
            </div>
          ) : (
            activeRuns.map(r => (
              <RunCard
                key={r.runId}
                run={r}
                selected={r.runId === selectedRunId}
                onSelect={onSelectRun}
                showProgress
              />
            ))
          )}
        </div>
      </section>

      <aside className="live-monitor-detail detail-panel">
        <RunDetailPanel detail={detail} loading={detailLoading} error={detailError} />
      </aside>
    </div>
  );
};
