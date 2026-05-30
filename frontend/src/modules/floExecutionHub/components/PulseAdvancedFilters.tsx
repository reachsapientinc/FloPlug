import React, { useMemo, useState } from 'react';
import type { FloExecutionRunSummary } from '@floplug/shared';
import type { PulseFilterState, PulseTriggerFilter } from '../utils/filterPulseRuns';
import type { RunStatusKind } from '../utils/formatters';

export interface PulseAdvancedFiltersProps {
  runs: FloExecutionRunSummary[];
  filters: PulseFilterState;
  open: boolean;
  onChange: (patch: Partial<PulseFilterState>) => void;
  onApply: () => void;
  onClear: () => void;
}

const STATUS_OPTIONS: { value: RunStatusKind; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Failed' },
  { value: 'killed', label: 'Killed' },
  { value: 'fatal', label: 'Fatal (platform)' },
  { value: 'unknown', label: 'Queued' },
];

const TRIGGER_OPTIONS: { value: PulseTriggerFilter; label: string }[] = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'manual', label: 'Manual' },
];

function MultiSelectDropdown<T extends string>({
  label,
  options,
  selected,
  onToggle,
  subfilterPlaceholder,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  subfilterPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState('');

  const filtered = useMemo(() => {
    const q = sub.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, sub]);

  const summary = selected.length === 0 ? 'All' : `${selected.length} selected`;

  return (
    <div className="pulse-advanced-field pulse-multi-select">
      <label>{label}</label>
      <button
        type="button"
        className="pulse-action-btn"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={() => setOpen(v => !v)}
      >
        {summary}
      </button>
      {open && (
        <div className="pulse-multi-dropdown">
          {subfilterPlaceholder && (
            <input
              type="search"
              className="pulse-multi-subfilter"
              placeholder={subfilterPlaceholder}
              value={sub}
              onChange={e => setSub(e.target.value)}
            />
          )}
          {filtered.map(o => (
            <label key={o.value} className="pulse-multi-option">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
              {o.label}
            </label>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 8, fontSize: 11, color: 'var(--t3)' }}>No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

export const PulseAdvancedFiltersPanel: React.FC<PulseAdvancedFiltersProps> = ({
  runs, filters, open, onChange, onApply, onClear,
}) => {
  const floOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of runs) {
      if (!map.has(r.floId)) map.set(r.floId, r.floName ?? r.floId);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [runs]);

  if (!open) return null;

  const toggleFlo = (floId: string) => {
    const next = filters.floIds.includes(floId)
      ? filters.floIds.filter(id => id !== floId)
      : [...filters.floIds, floId];
    onChange({ floIds: next });
  };

  const toggleStatus = (status: RunStatusKind) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter(s => s !== status)
      : [...filters.statuses, status];
    onChange({ statuses: next });
  };

  const toggleTrigger = (trigger: PulseTriggerFilter) => {
    const next = filters.triggers.includes(trigger)
      ? filters.triggers.filter(t => t !== trigger)
      : [...filters.triggers, trigger];
    onChange({ triggers: next });
  };

  return (
    <div className="pulse-advanced-panel">
      <div className="pulse-advanced-title">Advanced filters</div>

      <div className="pulse-advanced-field">
        <label>Date / time from</label>
        <input
          type="datetime-local"
          value={filters.dateFrom}
          onChange={e => onChange({ datePreset: 'custom', dateFrom: e.target.value })}
        />
      </div>

      <div className="pulse-advanced-field">
        <label>Date / time to</label>
        <input
          type="datetime-local"
          value={filters.dateTo}
          onChange={e => onChange({ datePreset: 'custom', dateTo: e.target.value })}
        />
      </div>

      <MultiSelectDropdown
        label="Flo names"
        options={floOptions}
        selected={filters.floIds}
        onToggle={toggleFlo}
        subfilterPlaceholder="Filter flo names…"
      />

      <MultiSelectDropdown
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.statuses}
        onToggle={toggleStatus}
      />

      <MultiSelectDropdown
        label="Trigger type"
        options={TRIGGER_OPTIONS}
        selected={filters.triggers}
        onToggle={toggleTrigger}
      />

      <div className="pulse-advanced-actions">
        <button type="button" className="pulse-action-btn" onClick={onClear}>Clear</button>
        <button type="button" className="pulse-action-btn" onClick={onApply} style={{ color: 'var(--cyan)' }}>
          Apply
        </button>
      </div>
    </div>
  );
};
