/**
 * RunModal — designer flow test run: input JSON, optional run label, expandable results.
 */

import React, { useState } from 'react';
import { CodeBlockWithCopy } from './CodeBlockWithCopy';
import { CopyButton, copyTextToClipboard } from './CopyButton';
import '../styles/copy-ui.css';
import './RunModal.css';

export interface RunResult {
  log:    string[];
  output: Record<string, unknown> | null;
  status: 'success' | 'error' | 'killed' | 'fatal';
  executionId?: string;
  runLabel?: string;
  simulated?: boolean;
}

interface Props {
  open:      boolean;
  running:   boolean;
  result:    RunResult | null;
  onRun:     (inputJson: Record<string, unknown>, runLabel?: string, dryRun?: boolean) => void;
  onClose:   () => void;
  /** When set, full flow run is disabled (validation errors on canvas). */
  runBlockedReason?: string;
}

const DEFAULT_INPUT = JSON.stringify({ message: 'Hello FloPlug', value: 42 }, null, 2);

function statusBadgeStyle(status: RunResult['status']): React.CSSProperties {
  if (status === 'success') {
    return { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '0.5px solid rgba(34,197,94,0.3)' };
  }
  if (status === 'killed') {
    return { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '0.5px solid rgba(251,191,36,0.35)' };
  }
  if (status === 'fatal') {
    return { background: 'rgba(192,132,252,0.15)', color: '#e9d5ff', border: '0.5px solid rgba(192,132,252,0.4)' };
  }
  return { background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '0.5px solid rgba(248,113,113,0.3)' };
}

function statusLabel(status: RunResult['status']): string {
  if (status === 'success') return '✓ Success';
  if (status === 'killed') return '⊘ Killed';
  if (status === 'fatal') return '⚠ Fatal';
  return '✕ Error';
}

export const RunModal: React.FC<Props> = ({ open, running, result, onRun, onClose, runBlockedReason }) => {
  const [raw, setRaw]           = useState(DEFAULT_INPUT);
  const [runLabel, setRunLabel] = useState('');
  const [dryRun, setDryRun]     = useState(true);
  const [parseErr, setParseErr] = useState('');
  const [expanded, setExpanded] = useState(false);

  if (!open) return null;

  const handleRun = () => {
    try {
      const parsed = JSON.parse(raw);
      setParseErr('');
      onRun(parsed, runLabel.trim() || undefined, dryRun);
    } catch {
      setParseErr('Invalid JSON — please fix before running');
    }
  };

  const handleClose = () => {
    setParseErr('');
    setExpanded(false);
    onClose();
  };

  const outputText = result?.output
    ? JSON.stringify(result.output, null, 2)
    : '— No output captured —';
  const logText = result?.log?.join('\n') ?? '';

  return (
    <div className="run-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={`run-modal${expanded ? ' run-modal-expanded' : ''}`} role="dialog" aria-modal="true">
        <div className="run-modal-header">
          <div className="run-modal-header-left">
            <div className="run-modal-dot" />
            <span className="run-modal-title">
              {result ? 'Run complete' : 'Run flow'}
            </span>
                {result?.runLabel && (
                  <span className="run-modal-label-chip">{result.runLabel}</span>
                )}
                {result?.simulated && (
                  <span className="run-modal-label-chip" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                    simulated
                  </span>
                )}
          </div>
          <div className="run-modal-header-actions">
            <button
              type="button"
              className="run-modal-icon-btn"
              onClick={() => setExpanded(v => !v)}
              title={expanded ? 'Restore size' : 'Maximize'}
            >
              {expanded ? '⊟' : '⊞'}
            </button>
            <button type="button" className="run-modal-icon-btn" onClick={handleClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="run-modal-body">
          {!result && (
            <>
              <label className="run-modal-field-label">Run label (optional)</label>
              <input
                type="text"
                className="run-modal-text-input"
                placeholder="e.g. Testing action mapping"
                value={runLabel}
                onChange={e => setRunLabel(e.target.value)}
                maxLength={120}
                disabled={running}
              />
              <p className="run-modal-hint">Shown in Execution Hub and searchable in Pulse.</p>

              <label className="run-modal-field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={e => setDryRun(e.target.checked)}
                  disabled={running}
                />
                Dry run / Simulate (no outbound HTTP or email)
              </label>
              <p className="run-modal-hint">
                Evaluates each node and shows transformed data in the log. Uncheck only when you intend to hit real integrations.
              </p>

              {runBlockedReason && (
                <div className="run-modal-err" style={{ marginBottom: 12 }}>
                  {runBlockedReason}
                </div>
              )}

              <label className="run-modal-field-label">Input JSON (Start node)</label>
              <textarea
                value={raw}
                onChange={e => { setRaw(e.target.value); setParseErr(''); }}
                className="run-modal-textarea"
                spellCheck={false}
                disabled={running}
              />
              {parseErr && <div className="run-modal-err">{parseErr}</div>}
            </>
          )}

          {result && (
            <>
              <div className="run-modal-status-row">
                <span className="run-modal-status-badge" style={statusBadgeStyle(result.status)}>
                  {statusLabel(result.status)}
                </span>
                {result.executionId && (
                  <span className="run-modal-runid">run {result.executionId.slice(0, 12)}…</span>
                )}
              </div>

              <CodeBlockWithCopy
                title="Output JSON (End node)"
                content={outputText}
                maxHeight={expanded ? '42vh' : 200}
              />

              <div style={{ marginTop: 14 }}>
                <div className="code-block-head" style={{ borderRadius: '7px 7px 0 0', border: '0.5px solid rgba(255,255,255,0.08)', borderBottom: 'none', background: 'rgba(255,255,255,0.03)' }}>
                  <span className="code-block-title">Execution log</span>
                  <CopyButton text={logText} label="Copy log" />
                </div>
                <div className="run-modal-log-scroll" style={{ maxHeight: expanded ? '38vh' : 180 }}>
                  {result.log.map((line, i) => (
                    <div
                      key={i}
                      className="run-modal-log-line"
                      data-kind={
                        line.includes('Platform error') ? 'fatal'
                          : line.startsWith('Error') || line.includes('Error in') ? 'error'
                          : line.startsWith('✓') ? 'ok'
                          : 'default'
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="run-modal-footer">
          {!result && (
            <>
              <button type="button" className="run-modal-btn-ghost" onClick={handleClose} disabled={running}>
                Cancel
              </button>
              <button
                type="button"
                className="run-modal-btn-run"
                onClick={handleRun}
                disabled={running || !!runBlockedReason}
                title={runBlockedReason ?? undefined}
              >
                {running ? '⏳ Running…' : '▶ Run flow'}
              </button>
            </>
          )}
          {result && (
            <>
              <button
                type="button"
                className="run-modal-btn-ghost"
                onClick={async () => { await copyTextToClipboard(`${outputText}\n\n--- LOG ---\n${logText}`); }}
              >
                Copy all
              </button>
              <button type="button" className="run-modal-btn-run" onClick={handleClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
