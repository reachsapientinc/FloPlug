import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { formatDuration, formatNumber, formatPercent, normalizeRunStatus } from '../utils/formatters';
import { RunCard } from './RunCard';
import { RunDetailPanel } from './RunDetailPanel';
import type { ExecutionHubRunDetail } from '../api/hubApi';

const DETAIL_WIDTH_KEY = 'flo-hub-detail-width';
const DEFAULT_DETAIL_WIDTH = 480;
const MIN_DETAIL_WIDTH = 320;
const MAX_DETAIL_WIDTH = 1200;
const SIDEBAR_WIDTH = 220;
const MIN_CENTER_WIDTH = 280;

function clampWidth(w: number): number {
  return Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, w));
}

function expandedPanelWidth(): number {
  return Math.max(MIN_DETAIL_WIDTH, window.innerWidth - SIDEBAR_WIDTH - MIN_CENTER_WIDTH);
}

export interface LiveMonitorViewProps {
  runs: FloExecutionRunSummary[];
  selectedRunId: string | null;
  floFilter: string | null;
  onSelectRun: (runId: string) => void;
  detail: ExecutionHubRunDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onRefresh: () => void;
  autoRefreshing?: boolean;
  onKillRun?: (runId: string) => void | Promise<void>;
  killing?: boolean;
  onReconcileRun?: (runId: string) => void | Promise<void>;
  reconciling?: boolean;
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  runs, selectedRunId, floFilter, onSelectRun,
  detail, detailLoading, detailError, onRefresh, autoRefreshing,
  onKillRun, killing, onReconcileRun, reconciling,
}) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailWidth, setDetailWidth] = useState(() => {
    const saved = localStorage.getItem(DETAIL_WIDTH_KEY);
    const n = saved ? Number(saved) : DEFAULT_DETAIL_WIDTH;
    return Number.isFinite(n) ? clampWidth(n) : DEFAULT_DETAIL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const widthBeforeExpandRef = useRef(detailWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const filtered = floFilter ? runs.filter(r => r.floId === floFilter) : runs;

  const metrics = useMemo(() => {
    let success = 0;
    let running = 0;
    let totalNodes = 0;
    let totalDuration = 0;
    let durationCount = 0;
    for (const r of filtered) {
      const k = normalizeRunStatus(r.status);
      if (k === 'running') running += 1;
      if (k === 'success') success += 1;
      totalNodes += r.nodeCount ?? 0;
      if (r.durationMs != null) {
        totalDuration += r.durationMs;
        durationCount += 1;
      }
    }
    const total = filtered.length;
    const successRate = total > 0 ? (success / total) * 100 : 0;
    const avgLatency = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    return { total, running, success, totalNodes, successRate, avgLatency };
  }, [filtered]);

  const activeRuns = useMemo(() => {
    const running = filtered.filter(r => normalizeRunStatus(r.status) === 'running');
    const rest = filtered.filter(r => normalizeRunStatus(r.status) !== 'running');
    return [...running, ...rest].slice(0, 30);
  }, [filtered]);

  const persistWidth = useCallback((w: number) => {
    localStorage.setItem(DETAIL_WIDTH_KEY, String(clampWidth(w)));
  }, []);

  const handleSelectRun = useCallback((runId: string) => {
    onSelectRun(runId);
    setDetailOpen(true);
  }, [onSelectRun]);

  const stopResize = useCallback(() => {
    dragRef.current = null;
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (expanded) setExpanded(false);
    dragRef.current = { startX: e.clientX, startWidth: detailWidth };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [detailWidth, expanded]);

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const delta = dragRef.current.startX - e.clientX;
    setDetailWidth(clampWidth(dragRef.current.startWidth + delta));
  }, []);

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const delta = dragRef.current.startX - e.clientX;
    const finalWidth = clampWidth(dragRef.current.startWidth + delta);
    setDetailWidth(finalWidth);
    persistWidth(finalWidth);
    stopResize();
  }, [persistWidth, stopResize]);

  const toggleExpand = useCallback(() => {
    if (expanded) {
      setDetailWidth(widthBeforeExpandRef.current);
      setExpanded(false);
      return;
    }
    widthBeforeExpandRef.current = detailWidth;
    setDetailWidth(expandedPanelWidth());
    setExpanded(true);
  }, [detailWidth, expanded]);

  useEffect(() => {
    if (!selectedRunId) setDetailOpen(false);
  }, [selectedRunId]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onResize = () => setDetailWidth(expandedPanelWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expanded]);

  const panelWidth = detailOpen ? detailWidth : 0;

  return (
    <>
      <section className="live-monitor-center">
        <div className="live-monitor-header">
          <div>
            <h2 className="live-monitor-title">Live Monitor</h2>
            <p className="live-monitor-sub">
              Active flo executions{autoRefreshing ? ' · auto-refreshing' : ' · live'}
            </p>
          </div>
          <div className="live-monitor-header-actions">
            <button type="button" className="pulse-action-btn">Pause all</button>
            <button type="button" className="pulse-action-btn">Export</button>
            <button type="button" className="pulse-action-btn">+ New Run</button>
            <button type="button" className="refresh-btn" onClick={onRefresh}>Refresh</button>
          </div>
        </div>

        <div className="metrics live-monitor-metrics">
          <div className="mc cc">
            <div className="mc-lbl">Records processed</div>
            <div className="mc-val">{formatNumber(metrics.totalNodes)}</div>
            <div className="mc-sub">{metrics.running > 0 ? `${metrics.running} running` : '0 running'}</div>
          </div>
          <div className="mc cg">
            <div className="mc-lbl">Success rate</div>
            <div className="mc-val">{formatPercent(metrics.successRate)}</div>
            <div className="mc-sub">{formatNumber(metrics.success)} succeeded</div>
          </div>
          <div className="mc ca">
            <div className="mc-lbl">Avg latency</div>
            <div className="mc-val">{formatDuration(metrics.avgLatency)}</div>
            <div className="mc-sub">across {formatNumber(filtered.length)} runs</div>
          </div>
          <div className="mc cp">
            <div className="mc-lbl">Data volume</div>
            <div className="mc-val">0 GB</div>
            <div className="mc-sub">of 0 GB est.</div>
          </div>
        </div>

        <div className="live-monitor-runs-label">Active runs — click a run to inspect</div>
        <div className="live-monitor-runs scroll-area">
          {activeRuns.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <p>No executions for this selection. Run a flo from the designer or trigger via webhook.</p>
            </div>
          ) : (
            activeRuns.map(r => (
              <RunCard
                key={r.runId}
                run={r}
                selected={r.runId === selectedRunId}
                onSelect={handleSelectRun}
                showProgress
              />
            ))
          )}
        </div>
      </section>

      <aside
        className={`live-monitor-detail detail-panel${detailOpen ? '' : ' closed'}${isResizing ? ' resizing' : ''}${expanded ? ' expanded' : ''}`}
        style={{ width: panelWidth }}
      >
        {detailOpen && (
          <>
            <div
              className="detail-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize detail panel"
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <div className="detail-panel-toolbar">
              <span className="detail-panel-toolbar-title">Run inspector</span>
              <div className="detail-panel-toolbar-actions">
                <button
                  type="button"
                  className={`detail-panel-icon-btn${expanded ? ' on' : ''}`}
                  onClick={toggleExpand}
                  title={expanded ? 'Restore panel width' : 'Expand panel'}
                  aria-label={expanded ? 'Restore panel width' : 'Expand panel'}
                >
                  {expanded ? '◧' : '◨'}
                </button>
                <button
                  type="button"
                  className="detail-panel-icon-btn"
                  onClick={() => setDetailOpen(false)}
                  aria-label="Close detail panel"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="detail-panel-body">
              <RunDetailPanel
                detail={detail}
                loading={detailLoading}
                error={detailError}
                onKillRun={onKillRun}
                killing={killing}
                onReconcileRun={onReconcileRun}
                reconciling={reconciling}
              />
            </div>
          </>
        )}
      </aside>
    </>
  );
};
