/**
 * RunModal.tsx
 *
 * Modal shown when the user clicks ▶ Run.
 *
 * Phase 1 — INPUT:  User pastes or types the input JSON for the StartNode.
 *                   Clicking "Run Flow" triggers execution.
 * Phase 2 — OUTPUT: After execution, the modal switches to show the full
 *                   execution log and the final output JSON from the EndNode.
 *
 * The modal is controlled by the parent (Designer) which owns run state.
 */

import React, { useState } from 'react';

export interface RunResult {
  log:    string[];
  output: Record<string, unknown> | null;
  status: 'success' | 'error';
}

interface Props {
  open:      boolean;
  running:   boolean;
  result:    RunResult | null;
  onRun:     (inputJson: Record<string, unknown>) => void;
  onClose:   () => void;
}

const DEFAULT_INPUT = JSON.stringify({ message: 'Hello FloPlug', value: 42 }, null, 2);

export const RunModal: React.FC<Props> = ({ open, running, result, onRun, onClose }) => {
  const [raw,      setRaw]      = useState(DEFAULT_INPUT);
  const [parseErr, setParseErr] = useState('');

  if (!open) return null;

  const handleRun = () => {
    try {
      const parsed = JSON.parse(raw);
      setParseErr('');
      onRun(parsed);
    } catch {
      setParseErr('Invalid JSON — please fix before running');
    }
  };

  const handleClose = () => {
    setParseErr('');
    onClose();
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={runDot} />
            <span style={modalTitle}>
              {result ? 'Run Complete' : 'Run Flow'}
            </span>
          </div>
          <button onClick={handleClose} style={closeBtn}>✕</button>
        </div>

        {/* ── Phase 1: Input ── */}
        {!result && (
          <>
            <div style={sectionLabel}>Input JSON (passed to Start node)</div>
            <textarea
              value={raw}
              onChange={e => { setRaw(e.target.value); setParseErr(''); }}
              style={textarea}
              spellCheck={false}
              disabled={running}
            />
            {parseErr && <div style={errText}>{parseErr}</div>}
            <div style={modalFooter}>
              <button onClick={handleClose} style={btnGhost} disabled={running}>Cancel</button>
              <button onClick={handleRun}   style={btnRun}   disabled={running}>
                {running ? '⏳ Running…' : '▶ Run Flow'}
              </button>
            </div>
          </>
        )}

        {/* ── Phase 2: Result ── */}
        {result && (
          <>
            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{
                ...statusBadge,
                background: result.status === 'success'
                  ? 'rgba(34,197,94,0.15)'
                  : 'rgba(248,113,113,0.15)',
                color: result.status === 'success' ? '#22c55e' : '#f87171',
                border: `0.5px solid ${result.status === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
              }}>
                {result.status === 'success' ? '✓ Success' : '✕ Error'}
              </span>
            </div>

            {/* Output JSON */}
            <div style={sectionLabel}>Output JSON (from End node)</div>
            <div style={outputBox}>
              <pre style={outputPre}>
                {result.output
                  ? JSON.stringify(result.output, null, 2)
                  : '— No output captured —'}
              </pre>
            </div>

            {/* Execution log */}
            <div style={{ ...sectionLabel, marginTop: 14 }}>Execution Log</div>
            <div style={logBox}>
              {result.log.map((line, i) => (
                <div key={i} style={{
                  fontSize:    10,
                  fontFamily:  'monospace',
                  lineHeight:  1.7,
                  color: line.startsWith('Error') ? '#f87171'
                       : line.startsWith('✓')     ? '#22c55e'
                       : '#6b6b80',
                }}>
                  {line}
                </div>
              ))}
            </div>

            <div style={modalFooter}>
              <button onClick={handleClose} style={btnRun}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position:        'fixed',
  inset:           0,
  background:      'rgba(0,0,0,0.7)',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  zIndex:          1000,
  backdropFilter:  'blur(4px)',
};

const modal: React.CSSProperties = {
  background:   '#181b24',
  border:       '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding:      '24px 28px',
  width:        520,
  maxWidth:     '95vw',
  maxHeight:    '90vh',
  overflowY:    'auto',
  fontFamily:   "'Inter',-apple-system,sans-serif",
};

const modalHeader: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'space-between',
  marginBottom:   18,
};

const runDot: React.CSSProperties = {
  width:        10,
  height:       10,
  borderRadius: '50%',
  background:   '#22c55e',
};

const modalTitle: React.CSSProperties = {
  fontSize:   15,
  fontWeight: 600,
  color:      '#f0f0f4',
};

const closeBtn: React.CSSProperties = {
  background:  'none',
  border:      'none',
  color:       '#6b6b80',
  fontSize:    14,
  cursor:      'pointer',
  padding:     4,
  lineHeight:  1,
};

const sectionLabel: React.CSSProperties = {
  fontSize:      10,
  fontWeight:    600,
  color:         '#3a3a50',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom:  6,
};

const textarea: React.CSSProperties = {
  width:        '100%',
  height:       180,
  background:   '#0a0c12',
  border:       '0.5px solid rgba(255,255,255,0.08)',
  borderRadius: 7,
  color:        '#22c55e',
  fontSize:     12,
  fontFamily:   'monospace',
  padding:      '10px 12px',
  resize:       'vertical',
  outline:      'none',
  boxSizing:    'border-box',
};

const errText: React.CSSProperties = {
  fontSize:   11,
  color:      '#f87171',
  marginTop:  6,
};

const modalFooter: React.CSSProperties = {
  display:        'flex',
  justifyContent: 'flex-end',
  gap:            8,
  marginTop:      18,
};

const btnGhost: React.CSSProperties = {
  padding:      '7px 16px',
  borderRadius: 7,
  fontSize:     12,
  fontWeight:   500,
  cursor:       'pointer',
  fontFamily:   'inherit',
  border:       '0.5px solid rgba(255,255,255,0.1)',
  background:   'rgba(255,255,255,0.04)',
  color:        '#9090a0',
};

const btnRun: React.CSSProperties = {
  padding:      '7px 20px',
  borderRadius: 7,
  fontSize:     12,
  fontWeight:   600,
  cursor:       'pointer',
  fontFamily:   'inherit',
  border:       'none',
  background:   '#22c55e',
  color:        '#fff',
};

const statusBadge: React.CSSProperties = {
  fontSize:     11,
  fontWeight:   600,
  padding:      '3px 10px',
  borderRadius: 20,
};

const outputBox: React.CSSProperties = {
  background:   '#0a0c12',
  border:       '0.5px solid rgba(255,255,255,0.06)',
  borderRadius: 7,
  padding:      '10px 12px',
  maxHeight:    160,
  overflowY:    'auto',
};

const outputPre: React.CSSProperties = {
  margin:     0,
  fontSize:   11,
  color:      '#22c55e',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak:  'break-all',
};

const logBox: React.CSSProperties = {
  background:   '#0a0c12',
  border:       '0.5px solid rgba(255,255,255,0.05)',
  borderRadius: 7,
  padding:      '8px 10px',
  maxHeight:    140,
  overflowY:    'auto',
};
