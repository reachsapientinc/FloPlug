import React, { useMemo, useState } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import {
  countByStatus,
  DEFAULT_PULSE_FILTERS,
  filterPulseRuns,
  paginateRuns,
  type PulseDatePreset,
  type PulseFilterState,
  type PulseStatusTab,
  type PulseTriggerFilter,
} from '../utils/filterPulseRuns';
import {
  formatDuration,
  formatDurationFixed,
  formatNumber,
  formatPercent,
  normalizeRunStatus,
} from '../utils/formatters';
import type { ExecutionHubRunDetail } from '../api/hubApi';
import { PulseAdvancedFiltersPanel } from './PulseAdvancedFilters';
import { PulseRunsTable } from './PulseRunsTable';
import { RunDetailPanel } from './RunDetailPanel';

export interface PulseViewProps {
  runs: FloExecutionRunSummary[];
  floFilter: string | null;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  detail: ExecutionHubRunDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onKillRun?: (runId: string) => void | Promise<void>;
  killing?: boolean;
  onReconcileRun?: (runId: string) => void | Promise<void>;
  reconciling?: boolean;
}

const STATUS_TABS: { key: PulseStatusTab; label: string }[] = [
  { key: 'all', label: 'All runs' },
  { key: 'running', label: 'Running' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'error', label: 'Failed' },
  { key: 'killed', label: 'Killed' },
  { key: 'fatal', label: 'Fatal' },
  { key: 'unknown', label: 'Queued' },
];

const DATE_CHIPS: { key: PulseDatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7d' },
  { key: '30d', label: 'Last 30d' },
  { key: 'custom', label: 'Custom' },
];

const TRIGGER_CHIPS: { key: PulseTriggerFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'webhook', label: 'Webhook' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'manual', label: 'Manual' },
];

export const PulseView: React.FC<PulseViewProps> = ({
  runs,
  floFilter,
  selectedRunId,
  onSelectRun,
  detail,
  detailLoading,
  detailError,
  onKillRun,
  killing,
  onReconcileRun,
  reconciling,
}) => {
  const [filters, setFilters] = useState<PulseFilterState>(DEFAULT_PULSE_FILTERS);
  const [draftFilters, setDraftFilters] = useState<PulseFilterState>(DEFAULT_PULSE_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const sidebarScoped = useMemo(
    () => (floFilter ? runs.filter(r => r.floId === floFilter) : runs),
    [runs, floFilter],
  );

  const statusCounts = useMemo(() => countByStatus(sidebarScoped), [sidebarScoped]);

  const filtered = useMemo(
    () => filterPulseRuns(runs, filters, floFilter),
    [runs, filters, floFilter],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  const page = Math.min(filters.page, pageCount);
  const pageRuns = useMemo(
    () => paginateRuns(filtered, page, filters.pageSize),
    [filtered, page, filters.pageSize],
  );

  const kpis = useMemo(() => {
    const total = filtered.length;
    const success = filtered.filter(r => normalizeRunStatus(r.status) === 'success').length;
    const warning = filtered.filter(r => normalizeRunStatus(r.status) === 'warning').length;
    const failed = filtered.filter(r => normalizeRunStatus(r.status) === 'error').length;
    const durations = filtered.map(r => r.durationMs).filter((d): d is number => d != null);
    const avgMs = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
      : 0;
    const successRate = total > 0 ? (success / total) * 100 : 0;
    const periodLabel = filters.datePreset === 'today'
      ? 'today'
      : filters.datePreset === '30d'
        ? 'last 30 days'
        : 'last 7 days';

    return { total, success, warning, failed, avgMs, p95, successRate, periodLabel };
  }, [filtered, filters.datePreset]);

  const patchFilters = (patch: Partial<PulseFilterState>) => {
    setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  };

  const handleViewRun = (runId: string) => {
    onSelectRun(runId);
    setDetailOpen(true);
  };

  const pageButtons = useMemo(() => {
    const pages: number[] = [];
    for (let i = 1; i <= pageCount; i += 1) {
      if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    }
    return pages;
  }, [page, pageCount]);

  return (
    <section className="pulse-content">
      <header className="pulse-header">
        <div>
          <h2 className="pulse-title">Pulse — Execution History</h2>
          <p className="pulse-sub">Filter and drill into every flo run across all pipelines.</p>
        </div>
        <div className="pulse-header-actions">
          <button type="button" className="pulse-action-btn">Export</button>
          <button type="button" className="pulse-action-btn">+ Schedule</button>
        </div>
      </header>

      <nav className="pulse-status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`pulse-status-tab${filters.statusTab === tab.key ? ' on' : ''}`}
            onClick={() => patchFilters({ statusTab: tab.key })}
          >
            {tab.label}
            <span className="tab-count">({statusCounts[tab.key]})</span>
          </button>
        ))}
      </nav>

      <div className="pulse-filter-bar">
        <div className="pulse-filter-group">
          <span className="pulse-filter-label">Date</span>
          {DATE_CHIPS.map(chip => (
            <button
              key={chip.key}
              type="button"
              className={`pulse-chip${filters.datePreset === chip.key ? ' on' : ''}`}
              onClick={() => patchFilters({ datePreset: chip.key })}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="pulse-filter-group">
          <span className="pulse-filter-label">Trigger</span>
          {TRIGGER_CHIPS.map(chip => (
            <button
              key={chip.key}
              type="button"
              className={`pulse-chip${filters.triggerFilter === chip.key ? ' on' : ''}`}
              onClick={() => patchFilters({ triggerFilter: chip.key })}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="pulse-search">
          <input
            type="search"
            placeholder="Search label, flo name, run ID…"
            value={filters.searchQuery}
            onChange={e => patchFilters({ searchQuery: e.target.value })}
          />
        </div>

        <div className="pulse-advanced-wrap">
          <button
            type="button"
            className={`pulse-funnel-btn${advancedOpen ? ' on' : ''}`}
            title="Advanced filters"
            onClick={() => {
              setDraftFilters(filters);
              setAdvancedOpen(v => !v);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 4h16l-6 7v6l-4 2v-8L4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </button>
          <PulseAdvancedFiltersPanel
            runs={runs}
            filters={draftFilters}
            open={advancedOpen}
            onChange={patch => setDraftFilters(prev => ({ ...prev, ...patch }))}
            onApply={() => {
              setFilters({ ...draftFilters, page: 1 });
              setAdvancedOpen(false);
            }}
            onClear={() => {
              const cleared = { ...DEFAULT_PULSE_FILTERS, page: 1 };
              setDraftFilters(cleared);
              setFilters(cleared);
              setAdvancedOpen(false);
            }}
          />
        </div>
      </div>

      <div className="pulse-kpis">
        <div className="pulse-kpi">
          <div className="pulse-kpi-lbl">Total runs</div>
          <div className="pulse-kpi-val" style={{ color: 'var(--cyan)' }}>{formatNumber(kpis.total)}</div>
          <div className="pulse-kpi-sub">{kpis.periodLabel}</div>
        </div>
        <div className="pulse-kpi accent-green">
          <div className="pulse-kpi-lbl">Success</div>
          <div className="pulse-kpi-val" style={{ color: 'var(--green)' }}>{formatNumber(kpis.success)}</div>
          <div className="pulse-kpi-sub">{formatPercent(kpis.successRate)} rate</div>
        </div>
        <div className="pulse-kpi accent-amber">
          <div className="pulse-kpi-lbl">Warnings</div>
          <div className="pulse-kpi-val" style={{ color: 'var(--amber)' }}>{formatNumber(kpis.warning)}</div>
          <div className="pulse-kpi-sub">partial runs</div>
        </div>
        <div className="pulse-kpi accent-red">
          <div className="pulse-kpi-lbl">Failed</div>
          <div className="pulse-kpi-val" style={{ color: 'var(--red)' }}>{formatNumber(kpis.failed)}</div>
          <div className="pulse-kpi-sub">node errors</div>
        </div>
        <div className="pulse-kpi">
          <div className="pulse-kpi-lbl">Avg duration</div>
          <div className="pulse-kpi-val">{formatDurationFixed(kpis.avgMs)}</div>
          <div className="pulse-kpi-sub">p95: {formatDurationFixed(kpis.p95)}</div>
        </div>
      </div>

      <div className="pulse-table-wrap">
        <PulseRunsTable runs={pageRuns} onViewRun={handleViewRun} />
      </div>

      <footer className="pulse-footer">
        <span>
          Showing {pageRuns.length} of {filtered.length} executions
          {filtered.length > 0 ? ` · Page ${page} of ${pageCount}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            Rows
            <select
              value={filters.pageSize}
              onChange={e => patchFilters({ pageSize: Number(e.target.value), page: 1 })}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--t1)',
                fontSize: 11,
              }}
            >
              {[10, 25, 50].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="pulse-pagination">
            {pageButtons.map(p => (
              <button
                key={p}
                type="button"
                className={`pulse-page-btn${p === page ? ' on' : ''}`}
                onClick={() => patchFilters({ page: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </footer>

      {detailOpen && selectedRunId && (
        <div className="pulse-detail-overlay" onClick={() => setDetailOpen(false)} role="presentation">
          <aside
            className="pulse-detail-drawer"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Run detail"
          >
            <button type="button" className="pulse-detail-close" onClick={() => setDetailOpen(false)}>
              Close
            </button>
            <RunDetailPanel
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onKillRun={onKillRun}
              killing={killing}
              onReconcileRun={onReconcileRun}
              reconciling={reconciling}
            />
          </aside>
        </div>
      )}
    </section>
  );
};
