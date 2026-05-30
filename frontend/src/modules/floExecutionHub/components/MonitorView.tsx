import React from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { HubSidebar } from './HubSidebar';
import { LiveMonitorView } from './LiveMonitorView';
import { PulseView } from './PulseView';
import type { ExecutionHubRunDetail } from '../api/hubApi';

export type MonitorSubView = 'dashboard' | 'pulse';

export interface MonitorViewProps {
  subView: MonitorSubView;
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
  onKillRun?: (runId: string) => void | Promise<void>;
  killing?: boolean;
  onReconcileRun?: (runId: string) => void | Promise<void>;
  reconciling?: boolean;
}

export const MonitorView: React.FC<MonitorViewProps> = ({
  subView,
  runs,
  selectedRunId,
  floFilter,
  onFloFilter,
  onSelectRun,
  detail,
  detailLoading,
  detailError,
  onRefresh,
  autoRefreshing,
  onKillRun,
  killing,
  onReconcileRun,
  reconciling,
}) => (
  <div className={`view on ${subView === 'dashboard' ? 'live-monitor-layout' : 'pulse-shell'}`}>
    <HubSidebar runs={runs} floFilter={floFilter} onFloFilter={onFloFilter} />
    {subView === 'dashboard' ? (
      <LiveMonitorView
        runs={runs}
        selectedRunId={selectedRunId}
        floFilter={floFilter}
        onSelectRun={onSelectRun}
        detail={detail}
        detailLoading={detailLoading}
        detailError={detailError}
        onRefresh={onRefresh}
        autoRefreshing={autoRefreshing}
        onKillRun={onKillRun}
        killing={killing}
        onReconcileRun={onReconcileRun}
        reconciling={reconciling}
      />
    ) : (
      <PulseView
        runs={runs}
        floFilter={floFilter}
        selectedRunId={selectedRunId}
        onSelectRun={onSelectRun}
        detail={detail}
        detailLoading={detailLoading}
        detailError={detailError}
        onKillRun={onKillRun}
        killing={killing}
        onReconcileRun={onReconcileRun}
        reconciling={reconciling}
      />
    )}
  </div>
);
