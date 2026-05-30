/**
 * Shared designer popups — context menu + quick help (Esc / × to dismiss).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Edge, Node } from '@xyflow/react';
import { getNodeQuickHelp, type NodeQuickHelpContent } from '../../catalog/nodeHelpCatalog';

function useDismissPopup(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointer = () => onClose();
    window.addEventListener('keydown', onKey, true);
    const t = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointer);
      window.addEventListener('scroll', onPointer, true);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', onPointer, true);
    };
  }, [onClose, active]);
}

const closeBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: 4,
  border: '0.5px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: '#c0c0cc',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
};

// ── Quick help popup ───────────────────────────────────────────────────────────

export const DesignerHelpPopup: React.FC<{
  x:       number;
  y:       number;
  content: NodeQuickHelpContent;
  onClose: () => void;
}> = ({ x, y, content, onClose }) => {
  useDismissPopup(onClose, true);

  const width = 240;
  const margin = 8;
  let left = x + margin;
  let top  = y - 20;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, x - width - margin);
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - 180));

  return createPortal(
    <div
      role="dialog"
      aria-label="Node quick help"
      style={{
        position: 'fixed', left, top, zIndex: 10002, width,
        background: '#1e2130', border: '0.5px solid rgba(255,255,255,0.14)',
        borderRadius: 8, padding: '10px 12px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: content.titleColor ?? '#e8e8f0' }}>
          {content.title}
        </div>
        <button type="button" onClick={onClose} aria-label="Close help" title="Close (Esc)" style={closeBtnStyle}>
          ×
        </button>
      </div>
      <div style={{ fontSize: 9, color: '#c8c8d8', lineHeight: 1.55 }}>{content.body}</div>
      {content.typeHint && (
        <div style={{ marginTop: 8, fontSize: 8, color: '#9090a8', fontFamily: 'monospace' }}>
          {content.typeHint}
        </div>
      )}
    </div>,
    document.body,
  );
};

// ── Node context menu ──────────────────────────────────────────────────────────

export interface NodeContextMenuState {
  nodeId: string;
  x:      number;
  y:      number;
}

export interface NodeQuickHelpState {
  nodeId: string;
  x:      number;
  y:      number;
}

export const NodeCanvasContextMenu: React.FC<{
  state:          NodeContextMenuState;
  node:           Node;
  edges:          Edge[];
  onClose:        () => void;
  onRemoveWiring: (nodeId: string, direction: 'inbound' | 'outbound') => void;
  onDelete:       (nodeId: string) => void;
  onQuickHelp:    (state: NodeQuickHelpState) => void;
}> = ({
  state, node, edges, onClose, onRemoveWiring, onDelete, onQuickHelp,
}) => {
  const [wiringOpen, setWiringOpen] = useState(false);
  useDismissPopup(onClose, true);

  const inbound  = edges.filter(e => e.target === state.nodeId);
  const outbound = edges.filter(e => e.source === state.nodeId);
  const hasWiring = inbound.length > 0 || outbound.length > 0;
  const canDelete = node.type !== 'startNode' && node.type !== 'endNode';

  const menuW = 220;
  const subW  = 168;
  let left = state.x;
  let top  = state.y;
  if (left + menuW + subW > window.innerWidth - 8) left = Math.max(8, state.x - menuW);
  top = Math.max(8, Math.min(top, window.innerHeight - 200));

  const itemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    color: '#e8e8f0',
    fontSize: 11,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const disabledStyle: React.CSSProperties = {
    ...itemStyle,
    color: '#6b7080',
    cursor: 'not-allowed',
  };

  return createPortal(
    <div
      role="menu"
      style={{
        position: 'fixed', left, top, zIndex: 10001,
        minWidth: menuW,
        background: '#1a1f2e',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        overflow: 'visible',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px 6px 12px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 10, color: '#9090a8', letterSpacing: '0.04em' }}>Node options</span>
        <button type="button" onClick={onClose} aria-label="Close menu" title="Close (Esc)" style={closeBtnStyle}>
          ×
        </button>
      </div>

      {hasWiring && (
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => setWiringOpen(true)}
          onMouseLeave={() => setWiringOpen(false)}
        >
          <button type="button" style={{ ...itemStyle, display: 'flex', justifyContent: 'space-between' }}>
            <span>Remove Flo wiring</span>
            <span style={{ color: '#9090a8' }}>›</span>
          </button>
          {wiringOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                left: '100%',
                top: 0,
                minWidth: subW,
                marginLeft: 2,
                background: '#1a1f2e',
                border: '0.5px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                overflow: 'hidden',
              }}
              onMouseEnter={() => setWiringOpen(true)}
              onMouseLeave={() => setWiringOpen(false)}
            >
              <button
                type="button"
                disabled={inbound.length === 0}
                style={inbound.length === 0 ? disabledStyle : itemStyle}
                onClick={() => {
                  if (inbound.length === 0) return;
                  onRemoveWiring(state.nodeId, 'inbound');
                }}
              >
                Inbound{inbound.length > 0 ? ` (${inbound.length})` : ''}
              </button>
              <button
                type="button"
                disabled={outbound.length === 0}
                style={outbound.length === 0 ? disabledStyle : itemStyle}
                onClick={() => {
                  if (outbound.length === 0) return;
                  onRemoveWiring(state.nodeId, 'outbound');
                }}
              >
                Outbound{outbound.length > 0 ? ` (${outbound.length})` : ''}
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!canDelete}
        style={canDelete
          ? { ...itemStyle, color: '#f87171' }
          : disabledStyle}
        onClick={() => {
          if (!canDelete) return;
          onDelete(state.nodeId);
        }}
      >
        Delete
      </button>

      <button
        type="button"
        style={itemStyle}
        onClick={() => {
          onQuickHelp({ nodeId: state.nodeId, x: state.x, y: state.y });
          onClose();
        }}
      >
        Quick help
      </button>
    </div>,
    document.body,
  );
};

export { getNodeQuickHelp };
