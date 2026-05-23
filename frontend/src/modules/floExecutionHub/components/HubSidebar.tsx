import React, { useMemo } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';

const STATUS_LEGEND = [
  { key: 'running', color: 'var(--cyan)', label: 'Running', hint: 'Actively processing' },
  { key: 'success', color: 'var(--green)', label: 'Success', hint: 'Completed without errors' },
  { key: 'error', color: 'var(--red)', label: 'Failed', hint: 'Stopped on node error' },
  { key: 'unknown', color: 'var(--slate)', label: 'Queued / unknown', hint: 'Waiting or legacy status' },
];

const NODE_LEGEND = [
  { color: '#4f8ef7', label: 'Plug / Source', hint: 'HTTP, file, email ingress' },
  { color: '#8b5cf6', label: 'FloAction', hint: 'Connector API call' },
  { color: '#a855f7', label: 'Filter / FIF', hint: 'Branch & rules' },
  { color: '#06b6d4', label: 'Transform', hint: 'Template / mapper' },
  { color: '#22c55e', label: 'Start / End', hint: 'Flow boundaries' },
];

export interface HubSidebarProps {
  runs: FloExecutionRunSummary[];
  floFilter: string | null;
  onFloFilter: (floId: string | null) => void;
}

export const HubSidebar: React.FC<HubSidebarProps> = ({ runs, floFilter, onFloFilter }) => {
  const floList = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const r of runs) {
      const cur = map.get(r.floId);
      if (cur) cur.count += 1;
      else map.set(r.floId, { name: r.floName ?? r.floId, count: 1 });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [runs]);

  return (
    <aside className="hub-sidebar">
      <div className="hub-sidebar-section">
        <div className="hub-sidebar-heading">All flos</div>
        <button
          type="button"
          className={`sidebar-item${floFilter === null ? ' on' : ''}`}
          onClick={() => onFloFilter(null)}
        >
          <span style={{ flex: 1 }}>All flos</span>
          <span className="hub-sidebar-count">{runs.length}</span>
        </button>
        {floList.map(f => (
          <button
            key={f.id}
            type="button"
            className={`sidebar-item${floFilter === f.id ? ' on' : ''}`}
            onClick={() => onFloFilter(f.id)}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            <span className="hub-sidebar-count">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="hub-sidebar-section">
        <div className="hub-sidebar-heading">Status colors</div>
        {STATUS_LEGEND.map(s => (
          <div key={s.key} className="hub-legend-row">
            <span className="hub-legend-dot" style={{ background: s.color }} />
            <div>
              <div className="hub-legend-label">{s.label}</div>
              <div className="hub-legend-hint">{s.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="hub-sidebar-section">
        <div className="hub-sidebar-heading">Node types</div>
        {NODE_LEGEND.map(n => (
          <div key={n.label} className="hub-legend-row">
            <span className="hub-legend-dot" style={{ background: n.color }} />
            <div>
              <div className="hub-legend-label">{n.label}</div>
              <div className="hub-legend-hint">{n.hint}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
