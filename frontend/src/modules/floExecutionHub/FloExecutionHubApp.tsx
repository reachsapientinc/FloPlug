/**
 * FloExecution Hub — standalone execution viewer (decoupled from Designer).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { sortRunsByStartedDesc } from '@floplug/shared';
import {
  getExecutionRun,
  killExecutionRun,
  reconcileExecutionRuns,
  listExecutionRuns,
  type ExecutionHubRunDetail,
} from './api/hubApi';
import { MonitorView, type MonitorSubView } from './components/MonitorView';
import { AlertsView } from './components/AlertsView';
import './hubTheme.css';
import '../../styles/copy-ui.css';
import { readTenantUiState, writeTenantUiState } from '../../utils/tenantUiState';

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
  const [tab, setTab]               = useState<HubTab>(() =>
    readTenantUiState(hubId, tenantId).executionsTab ?? 'monitor',
  );
  const [monitorView, setMonitorView] = useState<MonitorSubView>(() =>
    readTenantUiState(hubId, tenantId).executionsMonitorView ?? 'dashboard',
  );
  const [runs, setRuns]             = useState<FloExecutionRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError]   = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [floFilter, setFloFilter]   = useState<string | null>(null);
  const [detail, setDetail]         = useState<ExecutionHubRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [killing, setKilling]       = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [clock, setClock]           = useState(() => new Date().toLocaleTimeString());
  const [autoRefreshing, setAutoRefreshing] = useState(false);

  useEffect(() => {
    writeTenantUiState(hubId, tenantId, {
      view: 'executions',
      executionsTab: tab,
      executionsMonitorView: monitorView,
    });
  }, [hubId, tenantId, tab, monitorView]);

  const loadRuns = useCallback(async (silent = false) => {
    if (!silent) setRunsLoading(true);
    setRunsError(null);
    try {
      const list = sortRunsByStartedDesc(await listExecutionRuns(hubId, tenantId, 200));
      setRuns(list);
      setSelectedRunId(prev => (prev && list.some(r => r.runId === prev) ? prev : null));
    } catch (err: unknown) {
      setRunsError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!silent) setRunsLoading(false);
    }
  }, [hubId, tenantId]);

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

  /** Live command center — poll Firestore while Monitor tab is active. */
  useEffect(() => {
    if (tab !== 'monitor') return undefined;
    setAutoRefreshing(true);
    const poll = () => {
      loadRuns(true);
      refreshDetail();
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      clearInterval(t);
      setAutoRefreshing(false);
    };
  }, [tab, loadRuns, refreshDetail]);

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

  const onKillRun = useCallback(async (runId: string) => {
    setKilling(true);
    try {
      await killExecutionRun(hubId, tenantId, runId);
      await loadRuns(true);
      await refreshDetail();
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setKilling(false);
    }
  }, [hubId, tenantId, loadRuns, refreshDetail]);

  const onReconcileRun = useCallback(async (runId: string) => {
    setReconciling(true);
    try {
      await reconcileExecutionRuns(hubId, tenantId, runId);
      await loadRuns(true);
      await refreshDetail();
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconciling(false);
    }
  }, [hubId, tenantId, loadRuns, refreshDetail]);

  const hubRuns = useMemo(
    () => runs.filter(r => Boolean(r.floId?.trim())),
    [runs],
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
          {tab === 'monitor' && (
            <div className="hub-view-toggle">
              <button
                type="button"
                className={`hub-view-toggle-btn${monitorView === 'dashboard' ? ' on' : ''}`}
                onClick={() => setMonitorView('dashboard')}
              >
                Dashboard
              </button>
              <button
                type="button"
                className={`hub-view-toggle-btn${monitorView === 'pulse' ? ' on' : ''}`}
                onClick={() => setMonitorView('pulse')}
              >
                Pulse
              </button>
            </div>
          )}
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

      <main className="body">
        {tab === 'monitor' && (
          runsLoading && hubRuns.length === 0 ? (
            <div className="empty-state" style={{ flex: 1 }}>Loading executions…</div>
          ) : (
            <MonitorView
              subView={monitorView}
              runs={hubRuns}
              selectedRunId={selectedRunId}
              floFilter={floFilter}
              onFloFilter={setFloFilter}
              onSelectRun={onSelectRun}
              detail={detail}
              detailLoading={detailLoading}
              detailError={detailError}
              onRefresh={() => loadRuns()}
              autoRefreshing={autoRefreshing}
              onKillRun={onKillRun}
              killing={killing}
              onReconcileRun={onReconcileRun}
              reconciling={reconciling}
            />
          )
        )}
        {tab === 'alerts' && (
          <AlertsView hubId={hubId} tenantId={tenantId} />
        )}
      </main>
    </div>
  );
};

export default FloExecutionHubApp;
