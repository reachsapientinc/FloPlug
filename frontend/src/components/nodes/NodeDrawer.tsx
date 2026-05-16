/**
 * NodeDrawer.tsx
 *
 * Collapsible settings drawer that lives INSIDE every node.
 * Renders inline — expands the node height when open.
 * Never uses position:absolute or fixed — pure flow layout.
 *
 * The key rules that prevent the "escape" bug:
 *  1. Wrapper is display:block with full width, not position:relative
 *  2. Drawer body is inline-block, pushes the node height down
 *  3. Parent node containers must NOT use overflow:hidden
 *  4. ReactFlow NodeResizer uses minHeight so node can grow
 */

import React, { useState } from 'react';

interface NodeDrawerProps {
  id:           string;
  data:         Record<string, unknown>;
  label?:       string;
  defaultOpen?: boolean;
  children?:    React.ReactNode;
  color?:       string;
}

export const NodeDrawer: React.FC<NodeDrawerProps> = ({
  id, data, label = 'Settings', defaultOpen = false, children, color = '#4f8ef7',
}) => {
  const [open, setOpen] = useState(defaultOpen);

  const outputTarget  = (data.outputTarget  as string) || 'cStream';
  const outputVarName = (data.outputVarName as string) || '';
  const update = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);
  const needsVarName  = outputTarget === 'local' || outputTarget === 'global';

  return (
    <div style={{
      display: 'block',
      width: '100%',
      marginTop: 6,
      boxSizing: 'border-box',
    }}>
      {/* Toggle bar */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          borderRadius: open ? '5px 5px 0 0' : 5,
          border: `0.5px solid ${open ? color : 'rgba(255,255,255,0.08)'}`,
          background: open ? `${color}18` : 'rgba(255,255,255,0.03)',
          color: open ? color : '#45455a',
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.12s',
        }}
      >
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Drawer body — inline, pushes node height naturally */}
      {open && (
        <div style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 8px 6px',
          border: `0.5px solid ${color}40`,
          borderTop: 'none',
          borderRadius: '0 0 5px 5px',
          background: 'rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column' as const,
          gap: 6,
        }}>
          {/* Node-specific fields */}
          {children}

          {/* Output target — always last */}
          <div style={{
            paddingTop: children ? 8 : 0,
            borderTop: children ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
          }}>
            <div style={{
              fontSize: 8,
              color: '#6b6b80',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.4px',
              fontWeight: 700,
              marginBottom: 5,
            }}>
              Output target
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <select
                value={outputTarget}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => update({ outputTarget: e.target.value, outputVarName: '' })}
                style={selStyle}
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
                  style={{ ...selStyle, flex: 1 }}
                />
              )}
            </div>
            <div style={{ fontSize: 8, color: '#6b6b80', marginTop: 3, lineHeight: 1.5 }}>
              {outputTarget === 'cStream'
                ? 'Result becomes the next node\'s input.'
                : `cStream unchanged. Use ${outputTarget}.${outputVarName || '…'} downstream.`
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Shared input/select styles used by nodes that build on NodeDrawer ─────────
export const drawerSelectStyle: React.CSSProperties = {
  padding: '3px 6px', borderRadius: 4,
  border: '0.5px solid rgba(255,255,255,0.1)',
  background: '#0f1117', color: '#ffffff',
  fontSize: 9, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box' as const,
};
export const drawerInputStyle:  React.CSSProperties = { ...drawerSelectStyle, width: '100%' };
export const drawerFieldStyle:  React.CSSProperties = { display: 'flex', flexDirection: 'column' as const, gap: 3, marginBottom: 6 };
export const drawerLabelStyle:  React.CSSProperties = { fontSize: 8, color: '#7070a0', textTransform: 'uppercase' as const, letterSpacing: '0.4px' };

const selStyle: React.CSSProperties = {
  padding: '3px 6px', borderRadius: 4,
  border: '0.5px solid rgba(255,255,255,0.12)',
  background: '#0f1117', color: '#e0e0e8',
  fontSize: 9, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box' as const,
};
