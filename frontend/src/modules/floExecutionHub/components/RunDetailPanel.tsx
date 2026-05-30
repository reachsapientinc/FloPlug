import React, { useState, useEffect } from 'react';
import type { FloExecutionNodeRecord } from '@floplug/shared';
import { formatFloRunVersion, extractRunErrorFromLog } from '@floplug/shared';
import type { ExecutionHubRunDetail } from '../api/hubApi';
import {
  formatDuration, formatTime, truncateId, normalizeRunStatus, isStaleRunningRun,
} from '../utils/formatters';
import { StatusPill } from './StatusBadge';
import { NodeRecordCard } from './NodeRecordCard';
import { RunPipelineVisualizer } from './RunPipelineVisualizer';
import { NodeInspectorPanel } from './NodeInspectorPanel';

export interface RunDetailPanelProps {
  detail: ExecutionHubRunDetail | null;
  loading: boolean;
  error: string | null;
  onKillRun?: (runId: string) => void | Promise<void>;
  killing?: boolean;
  onReconcileRun?: (runId: string) => void | Promise<void>;
  reconciling?: boolean;
}

export const RunDetailPanel: React.FC<RunDetailPanelProps> = ({
  detail, loading, error, onKillRun, killing, onReconcileRun, reconciling,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);

  useEffect(() => {
    setSelectedNodeId(null);
    setShowAllRecords(false);
  }, [detail?.run?.id]);

  if (loading) {
    return <div className="empty-state">Loading run detail…</div>;
  }
  if (error) {
    return <div className="empty-state" style={{ color: 'var(--red)' }}>{error}</div>;
  }
  if (!detail) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 28, marginBottom: 12 }}>◎</div>
        <div style={{ fontSize: 14, color: 'var(--t2)' }}>Select a run to inspect the pipeline and node payloads</div>
      </div>
    );
  }

  const { run, nodes, graph } = detail;
  const runId = String(run.id ?? '');
  const floName = String(run.floName ?? run.floId ?? 'Unknown flo');
  const runLabel = typeof run.runLabel === 'string' && run.runLabel.trim()
    ? run.runLabel.trim()
    : undefined;
  const status = String(run.status ?? 'unknown');
  const durationMs = typeof run.durationMs === 'number' ? run.durationMs : undefined;
  const versionLabel = formatFloRunVersion(
    typeof run.floVersion === 'number' ? run.floVersion : undefined,
    run.executedGraph as 'draft' | 'published' | undefined,
  );

  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.startedAt && b.startedAt) return a.startedAt.localeCompare(b.startedAt);
    return a.nodeId.localeCompare(b.nodeId);
  });

  const runLog = Array.isArray(run.log) ? (run.log as string[]) : [];
  const errorMessage = typeof run.errorMessage === 'string'
    ? run.errorMessage
    : (status === 'error' || status === 'killed' || status === 'fatal'
      ? extractRunErrorFromLog(runLog)
      : undefined);

  const isRunning = normalizeRunStatus(status) === 'running';
  const stale = isStaleRunningRun(status, String(run.startedAt ?? ''));

  const okCount = sortedNodes.filter(n => n.status === 'ok').length;
  const errCount = sortedNodes.filter(n => n.status === 'error').length;
  const selectedRecord = sortedNodes.find(n => n.nodeId === selectedNodeId) ?? null;

  return (
    <div className="run-detail-panel">
      <div className="run-detail-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <h2 className="run-detail-title">{floName}</h2>
          <StatusPill status={status} />
        </div>
        {runLabel && (
          <div className="run-detail-label" style={{ fontSize: 13, color: 'var(--cyan)', marginBottom: 6 }}>
            {runLabel}
          </div>
        )}
        <div className="run-detail-meta">
          run {truncateId(runId, 12)} · {formatTime(String(run.startedAt ?? ''))}
          {durationMs != null ? ` · ${formatDuration(durationMs)}` : ''}
          {run.source ? ` · ${String(run.source)}` : ''}
          {versionLabel !== '—' ? ` · ${versionLabel}` : ''}
        </div>
        {(isRunning || stale) && (onKillRun || onReconcileRun) && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {stale && (
              <span style={{ fontSize: 11, color: '#c084fc' }}>
                Stale — worker likely crashed (memory/CPU). New Firebase instances do not resume this run.
                Mark as Fatal to close it, then start a new run.
              </span>
            )}
            {stale && onReconcileRun && (
              <button
                type="button"
                className="refresh-btn"
                style={{ borderColor: '#c084fc', color: '#e9d5ff' }}
                disabled={reconciling}
                onClick={() => onReconcileRun(runId)}
              >
                {reconciling ? 'Reconciling…' : 'Mark as Fatal'}
              </button>
            )}
            {isRunning && !stale && onKillRun && (
              <button
                type="button"
                className="refresh-btn"
                style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
                disabled={killing}
                onClick={() => onKillRun(runId)}
              >
                {killing ? 'Killing…' : 'Kill run'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="run-detail-kpis">
        <div className="run-kpi"><span className="run-kpi-l">Nodes</span><span className="run-kpi-v">{sortedNodes.length || (typeof run.nodeCount === 'number' ? run.nodeCount : '—')}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">OK</span><span className="run-kpi-v" style={{ color: 'var(--green)' }}>{okCount}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">Errors</span><span className="run-kpi-v" style={{ color: 'var(--red)' }}>{errCount}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">Duration</span><span className="run-kpi-v">{formatDuration(durationMs)}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">Graph</span><span className="run-kpi-v">{graph?.nodes?.length ?? '—'}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">Status</span><span className="run-kpi-v">{normalizeRunStatus(status)}</span></div>
      </div>

      {errorMessage && (
        <div className="run-detail-error">{errorMessage}</div>
      )}

      <div className="run-detail-pipeline-label">Pipeline — click a node to inspect</div>
      <RunPipelineVisualizer
        graphNodes={graph?.nodes ?? []}
        graphEdges={graph?.edges ?? []}
        records={nodes}
        runLog={runLog}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        tall
      />

      <NodeInspectorPanel
        record={selectedRecord}
        onClose={selectedNodeId ? () => setSelectedNodeId(null) : undefined}
      />

      <div className="run-detail-records-toggle">
        <button
          type="button"
          className="refresh-btn"
          onClick={() => setShowAllRecords(v => !v)}
        >
          {showAllRecords ? 'Hide' : 'Show'} all node records ({sortedNodes.length})
        </button>
      </div>

      {showAllRecords && sortedNodes.map((n: FloExecutionNodeRecord, i) => (
        <NodeRecordCard
          key={n.nodeId}
          record={n}
          defaultOpen={selectedNodeId ? n.nodeId === selectedNodeId : i === 0}
        />
      ))}
    </div>
  );
};
