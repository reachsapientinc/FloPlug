import React, { useMemo } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import { collectRunVersionOptions } from '@floplug/shared';
import type { ExecutionRunFilters } from '../utils/filterRuns';

export interface ExecutionHubFiltersProps {
  runs: FloExecutionRunSummary[];
  filters: ExecutionRunFilters;
  onChange: (patch: Partial<ExecutionRunFilters>) => void;
  matchCount: number;
  totalCount: number;
}

export const ExecutionHubFilters: React.FC<ExecutionHubFiltersProps> = ({
  runs, filters, onChange, matchCount, totalCount,
}) => {
  const versionOptions = useMemo(() => collectRunVersionOptions(runs), [runs]);

  return (
    <div className="hub-filters" style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      padding: '10px 16px', borderBottom: '0.5px solid var(--border)',
      background: 'var(--panel)',
    }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--t3)' }}>
        Flo name / ID
        <input
          type="search"
          value={filters.floQuery}
          onChange={e => onChange({ floQuery: e.target.value })}
          placeholder="Search flo…"
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--t3)' }}>
        Version
        <select
          value={filters.versionFilter}
          onChange={e => onChange({ versionFilter: e.target.value })}
          style={inputStyle}
        >
          {versionOptions.map(o => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--t3)' }}>
        From
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange({ dateFrom: e.target.value })}
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--t3)' }}>
        To
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange({ dateTo: e.target.value })}
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)', marginTop: 14 }}>
        <input
          type="checkbox"
          checked={filters.floRunsOnly}
          onChange={e => onChange({ floRunsOnly: e.target.checked })}
        />
        Flo runs only
      </label>
      <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto', marginTop: 14 }}>
        {matchCount} of {totalCount} runs · newest first
      </span>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: '0.5px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--t1)',
  fontSize: 11,
  fontFamily: 'inherit',
  minWidth: 120,
};
