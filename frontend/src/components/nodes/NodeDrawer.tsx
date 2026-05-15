/**
 * NodeDrawer.tsx
 *
 * Shared collapsible settings drawer used by every node type.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │  [icon] Title        status  │  ← header (always visible, from parent)
 *   │  compact summary             │  ← parent content above drawer
 *   ├──────────────────────────────┤
 *   │  ⌄  Settings          [icon] │  ← drawer toggle bar
 *   ├──────────────────────────────┤
 *   │  ...fields...                │  ← drawer body (collapsible)
 *   │  ─────────────────────────   │
 *   │  Output target  [cStream ▾]  │  ← always last row, injected by drawer
 *   │  Var name       [          ] │
 *   └──────────────────────────────┘
 *
 * Usage:
 *   <NodeDrawer id={id} data={data} label="Settings" defaultOpen={false}>
 *     <NodeField label="Action">...</NodeField>
 *   </NodeDrawer>
 *
 * The drawer reads/writes outputTarget and outputVarName on node.data
 * via data.onUpdate so the engine can honour local/global storage.
 */

import React, { useState } from 'react';

interface NodeDrawerProps {
  id:           string;
  data:         Record<string, unknown>;
  label?:       string;
  defaultOpen?: boolean;
  children:     React.ReactNode;
  /** Accent colour used for the toggle bar border */
  color?:       string;
}

export const NodeDrawer: React.FC<NodeDrawerProps> = ({
  id, data, label = 'Settings', defaultOpen = false, children, color = '#4f8ef7',
}) => {
  const [open, setOpen] = useState(defaultOpen);

  const outputTarget  = (data.outputTarget  as string) || 'cStream';
  const outputVarName = (data.outputVarName as string) || '';
  const update = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);

  const needsVarName = outputTarget === 'local' || outputTarget === 'global';

  return (
    <div style={{ marginTop: 4 }}>
      {/* Toggle bar */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 6px',
          borderRadius: 4,
          border: `0.5px solid ${open ? color : 'rgba(255,255,255,0.07)'}`,
          background: open ? `${color}12` : 'rgba(255,255,255,0.02)',
          color: open ? color : '#45455a',
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.12s',
        }}
      >
        <span>{label}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Drawer body */}
      {open && (
        <div style={{
          marginTop: 4,
          padding: '8px 6px 6px',
          borderRadius: 5,
          border: `0.5px solid rgba(255,255,255,0.06)`,
          background: 'rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}>
          {/* Node-specific fields */}
          {children}

          {/* Output target — always last */}
          <div style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '0.5px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              fontSize: 8, color: '#39ff14', textTransform: 'uppercase' as const,
              letterSpacing: '0.4px', fontWeight: 700, marginBottom: 5,
            }}>
              Output target
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <select
                value={outputTarget}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => update({ outputTarget: e.target.value, outputVarName: '' })}
                style={drawerSelectStyle}
              >
                <option value="cStream">→ cStream (overwrite)</option>
                <option value="local">→ local variable</option>
                <option value="global">→ global variable</option>
              </select>
              {needsVarName && (
                <input
                  value={outputVarName}
                  placeholder={`${outputTarget} var name`}
                  onMouseDown={e => e.stopPropagation()}
                  onChange={e => update({ outputVarName: e.target.value })}
                  style={{ ...drawerSelectStyle, flex: 1 }}
                />
              )}
            </div>
            {outputTarget === 'cStream' && (
              <div style={{ fontSize: 8, color: '#3a3a50', marginTop: 3, lineHeight: 1.5 }}>
                Result replaces <code style={{ fontFamily: 'monospace', color: '#4f8ef7' }}>cStream.message</code>.
                Next node sees this output.
              </div>
            )}
            {needsVarName && (
              <div style={{ fontSize: 8, color: '#3a3a50', marginTop: 3, lineHeight: 1.5 }}>
                cStream passes through unchanged.
                Reference as <code style={{ fontFamily: 'monospace', color: '#39ff14' }}>{outputTarget}.{outputVarName || '?'}</code> downstream.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Shared drawer input/select styles ─────────────────────────────────────────
export const drawerSelectStyle: React.CSSProperties = {
  padding: '3px 6px', borderRadius: 4,
  border: '0.5px solid rgba(255,255,255,0.1)',
  background: '#0f1117', color: '#ffffff',
  fontSize: 9, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box' as const,
};

export const drawerInputStyle: React.CSSProperties = {
  ...drawerSelectStyle,
  width: '100%',
};

export const drawerFieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 3,
  marginBottom: 6,
};

export const drawerLabelStyle: React.CSSProperties = {
  fontSize: 8,
  color: '#7070a0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.4px',
};
