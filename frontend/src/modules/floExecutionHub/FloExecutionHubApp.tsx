/**
 * FloExecution Hub — standalone execution viewer (decoupled from Designer).
 * Visible to all authenticated hub users; per-flo access control comes later.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { sortRunsByStartedDesc } from '@floplug/shared';
import {
  getExecutionRun,
  listExecutionRuns,
  type ExecutionHubRunDetail,
} from './api/hubApi';
import { LiveMonitorView } from './components/LiveMonitorView';
import { AlertsView } from './components/AlertsView';
import { ExecutionHubFilters } from './components/ExecutionHubFilters';
import { DEFAULT_RUN_FILTERS, filterExecutionRuns } from './utils/filterRuns';
import './hubTheme.css';

export type HubTab = 'monitor' | 'alerts';

export interface FloExecutionHubAppProps {
  hubId:    string;
  tenantId: string;
  hubName?: string;
  onBack:   () => void;
}

export const FloExecutionHubApp: React.FC<FloExecutionHubAppProps> = ({
  hubId, tenantId, hubName = 'FloPlug', onBack,
}) => {
  const [tab, setTab]               = useState<HubTab>('monitor');
  const [runs, setRuns]             = useState<FloExecutionRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError]   = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [floFilter, setFloFilter]   = useState<string | null>(null);
  const [runFilters, setRunFilters] = useState(DEFAULT_RUN_FILTERS);
  const [detail, setDetail]         = useState<ExecutionHubRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [clock, setClock]           = useState(() => new Date().toLocaleTimeString());

  const [autoRefreshing, setAutoRefreshing] = useState(false);

  const loadRuns = useCallback(async (silent = false) => {
    if (!silent) setRunsLoading(true);
    setRunsError(null);
    try {
      const list = sortRunsByStartedDesc(await listExecutionRuns(hubId, tenantId, 100));
      setRuns(list);
      if (list.length > 0 && !selectedRunId) {
        setSelectedRunId(list[0].runId);
      }
    } catch (err: unknown) {
      setRunsError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!silent) setRunsLoading(false);
    }
  }, [hubId, tenantId, selectedRunId]);

  const refreshDetail = useCallback(async () => {
    if (!selectedRunId) return;
    try {
      const d = await getExecutionRun(hubId, tenantId, selectedRunId);
      setDetail(d);
    } catch {
      /* keep last detail */
    }
  }, [hubId, tenantId, selectedRunId]);

  useEffect(() => { loadRuns(); }, [hubId, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hasRunning = runs.some(r => {
      const s = (r.status ?? '').toLowerCase();
      return s === 'running' || s === 'in_progress';
    });
    if (!hasRunning) {
      setAutoRefreshing(false);
      return;
    }
    setAutoRefreshing(true);
    const t = setInterval(() => {
      loadRuns(true);
      refreshDetail();
    }, 5000);
    return () => clearInterval(t);
  }, [runs, loadRuns, refreshDetail]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const d = await getExecutionRun(hubId, tenantId, selectedRunId);
        if (!cancelled) setDetail(d);
      } catch (err: unknown) {
        if (!cancelled) setDetailError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hubId, tenantId, selectedRunId]);

  const onSelectRun = (runId: string) => setSelectedRunId(runId);

  const filteredRuns = useMemo(
    () => filterExecutionRuns(runs, runFilters),
    [runs, runFilters],
  );

  return (
    <div className="flo-hub">
      <header className="topbar">
        <button type="button" className="back-btn" onClick={onBack}>← Designer</button>
        <div className="logo-text">
          {hubName} <em>Execution</em> Hub
        </div>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {(['monitor', 'alerts'] as HubTab[]).map(t => (
            <button
              key={t}
              type="button"
              className={`ntab${tab === t ? ' on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'monitor' ? 'Monitor' : 'Alerts'}
            </button>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="live"><span className="ldot" /> Live</span>
          <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>{clock}</span>
        </div>
      </header>

      {runsError && (
        <div className="error-banner">
          {runsError}
          <button type="button" className="refresh-btn" onClick={() => loadRuns()} style={{ marginLeft: 12 }}>
            Retry
          </button>
        </div>
      )}

      {runsLoading && !runs.length ? (
        <div className="empty-state" style={{ flex: 1 }}>Loading executions…</div>
      ) : (
        <>
          {tab !== 'alerts' && (
            <ExecutionHubFilters
              runs={runs}
              filters={runFilters}
              onChange={patch => setRunFilters(prev => ({ ...prev, ...patch }))}
              matchCount={filteredRuns.length}
              totalCount={runs.length}
            />
          )}
          <main className="body">
            {tab === 'monitor' && (
              <LiveMonitorView
                runs={filteredRuns}
                selectedRunId={selectedRunId}
                floFilter={floFilter}
                onFloFilter={setFloFilter}
                onSelectRun={onSelectRun}
                detail={detail}
                detailLoading={detailLoading}
                detailError={detailError}
                onRefresh={() => loadRuns()}
                autoRefreshing={autoRefreshing}
              />
            )}
            {tab === 'alerts' && (
              <AlertsView hubId={hubId} tenantId={tenantId} />
            )}
          </main>
        </>
      )}
    </div>
  );
};

export default FloExecutionHubApp;
