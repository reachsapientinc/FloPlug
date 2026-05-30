/**
 * NodePaletteAndInspector.tsx
 *
 * Changes in this version:
 *  1. EmailPlugInspector — brand-new inspector for smtp_basic plugs.
 *     Shows to/cc/bcc (list fields), subject, body — each with a source
 *     selector: static | cStream | local | global.
 *     - static  → rich-text-style textarea (formattable plain text)
 *     - cStream/local/global → variable path input + choice: "inline body"
 *       or "send as attachment" (requires fileName + contentType).
 *  2. PlugNodeInspector — routes to EmailPlugInspector when
 *     authProtocol === 'smtp_basic', otherwise shows URL-variable form.
 *  3. PlugManager / NodePalette — plugs prop is now a callback-based
 *     live list: Designer passes onPlugCreated so the palette updates
 *     immediately after savePlug resolves, without a full page refresh.
 *  4. PlugManager.PlugFormModal — strips ALL email routing fields
 *     (to/cc/bcc/subject/body/fileName) from variableHints for smtp_basic
 *     connectors. Admin only captures SMTP credentials.
 *  5. All previous behaviour retained for non-email plugs.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { PlugConfig, FloActionPaletteItem } from '@floplug/shared';
import { PALETTE_ITEMS, PALETTE_CATEGORIES, type PaletteItem } from '../catalog/nodeHelpCatalog';

const CATEGORIES = [...PALETTE_CATEGORIES];

// ── Palette help popup (portal — never clipped by palette overflow) ─────────────
interface PaletteHelpContent {
  title:       string;
  titleColor?: string;
  subtitle?:   string;
  body?:       string;
  footer?:     string;
  typeHint?:   string;
}

const PaletteHelpPortal: React.FC<{
  anchorRect: DOMRect;
  content:    PaletteHelpContent;
  onClose:    () => void;
}> = ({ anchorRect, content, onClose }) => {
  const width = 220;
  const margin = 8;
  let left = anchorRect.right + margin;
  let top  = anchorRect.top + anchorRect.height / 2 - 40;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, anchorRect.left - width - margin);
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - 160));

  return createPortal(
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }}
      />
      <div style={{
        position: 'fixed', left, top, zIndex: 9999, width,
        background: '#1e2130', border: '0.5px solid rgba(255,255,255,0.14)',
        borderRadius: 8, padding: '10px 12px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.55)', whiteSpace: 'normal',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: content.titleColor ?? '#e8e8f0' }}>{content.title}</div>
          <button
            type="button"
            className="nodrag"
            onClick={onClose}
            aria-label="Close help"
            title="Close (Esc)"
            style={{
              flexShrink: 0, width: 20, height: 20, borderRadius: 4,
              border: '0.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
              color: '#c0c0cc', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0,
            }}
          >×</button>
        </div>
        {content.subtitle && <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 4 }}>{content.subtitle}</div>}
        {content.body && <div style={{ fontSize: 9, color: '#c8c8d8', lineHeight: 1.55, marginBottom: content.footer ? 6 : 0 }}>{content.body}</div>}
        {content.footer && <div style={{ fontSize: 8, color: '#22c55e' }}>{content.footer}</div>}
        {content.typeHint && <div style={{ marginTop: 6, fontSize: 8, color: '#9090a8', fontFamily: 'monospace' }}>{content.typeHint}</div>}
      </div>
    </>,
    document.body,
  );
};

// ── IconWithTooltip ───────────────────────────────────────────────────────────
const IconWithTooltip: React.FC<{
  item:        PaletteItem;
  onDragStart: (e: React.DragEvent, item: PaletteItem) => void;
  helpOpen:    boolean;
  onToggleHelp:(rect: DOMRect) => void;
}> = ({ item, onDragStart, helpOpen, onToggleHelp }) => {
  const iconRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        ref={iconRef}
        draggable
        onDragStart={e => onDragStart(e, item)}
        onClick={e => {
          e.stopPropagation();
          const rect = iconRef.current?.getBoundingClientRect();
          if (rect) onToggleHelp(rect);
        }}
        title="Click for help · drag to canvas"
        style={{
          width: 42, height: 42, borderRadius: 8,
          background:  helpOpen ? item.color : `${item.color}28`,
          border:      `0.5px solid ${helpOpen ? item.color : `${item.color}50`}`,
          display:     'flex', flexDirection: 'column',
          alignItems:  'center', justifyContent: 'center',
          cursor:      'grab', transition: 'background 0.15s, border-color 0.15s',
          userSelect:  'none', gap: 2,
        }}
      >
        <span style={{ fontSize: item.icon.length > 2 ? 7 : 11, fontWeight: 800, color: helpOpen ? '#fff' : item.color, lineHeight: 1, transition: 'color 0.15s', fontFamily: "'Inter',-apple-system,sans-serif" }}>
          {item.icon}
        </span>
        <span style={{ fontSize: 7, color: helpOpen ? '#fff' : '#f59e0b', lineHeight: 1, textAlign: 'center', maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.15s', fontFamily: "'Inter',-apple-system,sans-serif" }}>
          {item.label}
        </span>
      </div>
    </div>
  );
};

// ── PlugIcon ──────────────────────────────────────────────────────────────────
const PlugIcon: React.FC<{
  plug:        PlugConfig;
  onDragStart: (e: React.DragEvent, plug: PlugConfig) => void;
  helpOpen:    boolean;
  onToggleHelp:(rect: DOMRect) => void;
}> = ({ plug, onDragStart, helpOpen, onToggleHelp }) => {
  const iconRef = useRef<HTMLDivElement>(null);
  const initials = plug.name.slice(0, 2).toUpperCase();
  const color    = plug.authProtocol === 'smtp_basic' ? '#f59e0b' : '#4f8ef7';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        ref={iconRef}
        draggable
        onDragStart={e => onDragStart(e, plug)}
        onClick={e => {
          e.stopPropagation();
          const rect = iconRef.current?.getBoundingClientRect();
          if (rect) onToggleHelp(rect);
        }}
        title="Click for help · drag to canvas"
        style={{
          width: 42, height: 42, borderRadius: 8,
          background: helpOpen ? color : `${color}28`,
          border:     `0.5px solid ${helpOpen ? color : `${color}50`}`,
          display:    'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor:     'grab', transition: 'background 0.15s, border-color 0.15s',
          userSelect: 'none', gap: 2,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: helpOpen ? '#fff' : color, lineHeight: 1 }}>
          {plug.authProtocol === 'smtp_basic' ? '✉' : initials}
        </span>
        <span style={{ fontSize: 7, color: helpOpen ? '#fff' : '#f59e0b', lineHeight: 1, textAlign: 'center', maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {plug.name}
        </span>
      </div>
    </div>
  );
};

// ── FloActionIcon — click toggles plug-style bubble ───────────────────────────
const FloActionIcon: React.FC<{
  action:      FloActionPaletteItem;
  bubbleOpen:  boolean;
  onToggle:    (rect: DOMRect) => void;
  onDragStart: (e: React.DragEvent, action: FloActionPaletteItem) => void;
}> = ({ action, bubbleOpen, onToggle, onDragStart }) => {
  const color = '#10b981';
  const iconRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        ref={iconRef}
        draggable
        onDragStart={e => onDragStart(e, action)}
        onClick={e => {
          e.stopPropagation();
          const rect = iconRef.current?.getBoundingClientRect();
          if (rect) onToggle(rect);
        }}
        title="Click for help · drag to canvas"
        style={{
          width: 42, height: 42, borderRadius: 8,
          background: bubbleOpen ? color : `${color}28`,
          border: `0.5px solid ${bubbleOpen ? color : `${color}50`}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'grab', userSelect: 'none', gap: 2,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: bubbleOpen ? '#fff' : color }}>⚡</span>
        <span style={{
          fontSize: 7, color: bubbleOpen ? '#fff' : '#f59e0b', lineHeight: 1, textAlign: 'center',
          maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {action.flaLabel}
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NodePalette
// Accepts plugs as a prop (live list from Designer state).
// onPlugsChange is called by PlugManager when a new plug is saved so the
// palette updates immediately without a page refresh.
// ─────────────────────────────────────────────────────────────────────────────
interface NodePaletteProps {
  plugs?:      PlugConfig[];
  floActions?: FloActionPaletteItem[];
  /** Reports visible palette width so inspector expand can stop at palette edge. */
  onPaletteWidthChange?: (width: number) => void;
}

const MIN_WIDTH = 100;
  const MAX_WIDTH = 280;
  const DEFAULT_WIDTH = 128;
  const RAIL_WIDTH = 28;



export const NodePalette: React.FC<NodePaletteProps> = ({
  plugs = [],
  floActions = [],
  onPaletteWidthChange,
}) => {
  const [collapsed,       setCollapsed]       = useState<Record<string, boolean>>({});
  const [panelHidden,     setPanelHidden]     = useState(false);
  const [paletteWidth, setPaletteWidth] = useState(DEFAULT_WIDTH);
  const [paletteHelp, setPaletteHelp] = useState<{
    key: string;
    rect: DOMRect;
    content: PaletteHelpContent;
  } | null>(null);
  const isResizing = useRef(false);
  const paletteRef = useRef<HTMLDivElement>(null);

  const closePaletteHelp = useCallback(() => setPaletteHelp(null), []);

  const toggleItemHelp = useCallback((key: string, rect: DOMRect, content: PaletteHelpContent) => {
    setPaletteHelp(prev => (prev?.key === key ? null : { key, rect, content }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePaletteHelp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePaletteHelp]);

  useEffect(() => {
    onPaletteWidthChange?.(panelHidden ? RAIL_WIDTH : paletteWidth);
  }, [paletteWidth, panelHidden, onPaletteWidthChange]);

  const toggleCat = (cat: string) =>
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));

  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData('application/flonode-type',  item.type);
    e.dataTransfer.setData('application/flonode-label', item.label);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onPlugDragStart = (e: React.DragEvent, plug: PlugConfig) => {
    e.dataTransfer.setData('application/flonode-type',  'plugNode');
    e.dataTransfer.setData('application/flonode-label', plug.name);
    e.dataTransfer.setData('application/flonode-meta',  JSON.stringify({
      plugId:               plug.id,
      plugName:             plug.name,
      urlPattern:           plug.urlPattern,
      variableHints:        plug.variableHints ?? [],
      connectorId:          plug.connectorId,
      connectorLabel:       plug.connectorLabel ?? plug.connectorId,
      authProtocol:         plug.authProtocol,
      category:             plug.authProtocol === 'smtp_basic' ? 'email' : (plug.connectorId ?? ''),
      defaultConnectionId:  plug.defaultConnectionId ?? plug.connectionId ?? '',
      allowedConnectionIds: plug.allowedConnectionIds ?? [],
      connectionId:         plug.defaultConnectionId ?? plug.connectionId ?? '',
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onFloActionDragStart = (e: React.DragEvent, action: FloActionPaletteItem) => {
    e.dataTransfer.setData('application/flonode-type',  'floActionNode');
    e.dataTransfer.setData('application/flonode-label', action.flaLabel);
    e.dataTransfer.setData('application/flonode-meta',  JSON.stringify({
      floActionNodeId:      action.id,
      floActionName:        action.floActionName,
      flaLabel:             action.flaLabel,
      description:          action.description ?? '',
      floKitId:             action.floKitId,
      connectorId:          action.connectorId,
      actionIds:            action.actionIds,
      defaultConnectionId:  action.defaultConnectionId,
      allowedConnectionIds: action.allowedConnectionIds ?? [],
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  //const EXPANDED_WIDTH = 128;
  //const RAIL_WIDTH     = 28;

  const onResizeMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  isResizing.current = true;
  const startX = e.clientX;
  const startW = paletteWidth;

  const onMove = (mv: MouseEvent) => {
    if (!isResizing.current) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + mv.clientX - startX));
    setPaletteWidth(next);
  };
  const onUp = () => {
    isResizing.current = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

  

  if (panelHidden) {
    return (
      <div style={{ width: RAIL_WIDTH, background: '#141720', borderRight: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, flexShrink: 0 }}>
        <button onClick={() => setPanelHidden(false)} title="Show palette" style={toggleBtnStyle}>
          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    );
  }

  return (
    <>
    <div ref={paletteRef} style={{ width: paletteWidth,
                                  minWidth: MIN_WIDTH,
                                  maxWidth: MAX_WIDTH, 
                                  background: '#141720', 
                                  borderRight: '0.5px solid rgba(255,255,255,0.06)', 
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  flexShrink: 0, 
                                  overflow: 'hidden', 
                                  fontFamily: "'Inter',-apple-system,sans-serif", 
                                  userSelect: 'none', position: 'relative' }}>
      {/* Header */}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#9090a8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nodes</span>
        <button onClick={() => setPanelHidden(true)} title="Hide palette" style={toggleBtnStyle}>
          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
      {/* Static node categories */}
      {CATEGORIES.map(cat => {
        const items  = PALETTE_ITEMS.filter(i => i.category === cat);
        const isOpen = !collapsed[cat];
        return (
          <div key={cat}>
            <button onClick={() => toggleCat(cat)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: 'none', border: 'none', borderTop: '0.5px solid rgba(255,255,255,0.04)', cursor: 'pointer', color: isOpen ? '#f59e0b' : '#3a3a50' }}>
              <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'inherit' }}>{cat}</span>
              <span style={{ fontSize: 8 }}>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, padding: '4px 8px 8px' }}>
                {items.map(item => (
                  <IconWithTooltip
                    key={item.type}
                    item={item}
                    onDragStart={onDragStart}
                    helpOpen={paletteHelp?.key === `item:${item.type}`}
                    onToggleHelp={rect => toggleItemHelp(`item:${item.type}`, rect, {
                      title: item.label,
                      titleColor: item.color,
                      body: item.help,
                      footer: 'Drag onto canvas to add',
                      typeHint: item.type,
                    })}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Plugs section — live, no refresh needed */}
      <div>
        <button onClick={() => toggleCat('Plugs')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: 'none', border: 'none', borderTop: '0.5px solid rgba(79,142,247,0.15)', cursor: 'pointer', color: !collapsed['Plugs'] ? '#4f8ef7' : '#3a3a50' }}>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'inherit' }}>
            🔌 Plugs {plugs.length > 0 && `(${plugs.length})`}
          </span>
          <span style={{ fontSize: 8 }}>{!collapsed['Plugs'] ? '▾' : '▸'}</span>
        </button>
        {!collapsed['Plugs'] && (
          plugs.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 9, color: '#3a3a50', lineHeight: 1.6 }}>
              No plugs configured yet.<br/>
              Ask your hub admin to create a plug in the <span style={{ color: '#4f8ef7' }}>Hub Manager</span> panel.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, padding: '4px 8px 8px' }}>
              {plugs.map(plug => (
                <PlugIcon
                  key={plug.id}
                  plug={plug}
                  onDragStart={onPlugDragStart}
                  helpOpen={paletteHelp?.key === `plug:${plug.id}`}
                  onToggleHelp={rect => toggleItemHelp(`plug:${plug.id}`, rect, {
                    title: plug.name,
                    titleColor: plug.authProtocol === 'smtp_basic' ? '#f59e0b' : '#4f8ef7',
                    subtitle: plug.connectorLabel ?? plug.connectorId,
                    body: plug.authProtocol === 'smtp_basic'
                      ? 'Email plug — configure recipients and body on canvas.'
                      : plug.urlPattern,
                    footer: '🔌 Drag to add to flow',
                  })}
                />
              ))}
            </div>
          )
        )}
      </div>

      <div>
        <button onClick={() => toggleCat('FloActions')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: 'none', border: 'none', borderTop: '0.5px solid rgba(16,185,129,0.2)', cursor: 'pointer', color: !collapsed['FloActions'] ? '#10b981' : '#3a3a50' }}>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'inherit' }}>
            ⚡ FloActions {floActions.length > 0 && `(${floActions.length})`}
          </span>
          <span style={{ fontSize: 8 }}>{!collapsed['FloActions'] ? '▾' : '▸'}</span>
        </button>
        {!collapsed['FloActions'] && (
          floActions.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 9, color: '#3a3a50', lineHeight: 1.6 }}>
              No FloActions enabled yet.<br/>
              Ask your hub admin to configure actions in <span style={{ color: '#10b981' }}>Hub Manager → Actions</span>.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, padding: '4px 8px 8px' }}>
              {floActions.map(action => (
                <FloActionIcon
                  key={action.id}
                  action={action}
                  bubbleOpen={paletteHelp?.key === `action:${action.id}`}
                  onToggle={rect => toggleItemHelp(`action:${action.id}`, rect, {
                    title: action.floActionName,
                    titleColor: '#10b981',
                    subtitle: action.connectorId,
                    body: action.description || `${action.actionIds.length} action(s) enabled`,
                    footer: '⚡ Drag to add FloAction to flow',
                  })}
                  onDragStart={onFloActionDragStart}
                />
              ))}
            </div>
          )
        )}
      </div>

      </div>

      <div style={{ marginTop: 'auto', padding: '8px', borderTop: '0.5px solid rgba(255,255,255,0.04)', fontSize: 8, color: '#9090a8', lineHeight: 1.5, flexShrink: 0 }}>
        Drag onto canvas · click icon for help (Esc to close)
      </div>
      {/* Drag-resize handle — right edge */}
      <div
        onMouseDown={onResizeMouseDown}
        title="Drag to resize palette"
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 8, cursor: 'col-resize', zIndex: 5,
          background: 'rgba(255,255,255,0.03)',
          borderLeft: '0.5px solid rgba(255,255,255,0.08)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,142,247,0.25)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      />
    </div>
    {paletteHelp && (
      <PaletteHelpPortal
        anchorRect={paletteHelp.rect}
        content={paletteHelp.content}
        onClose={closePaletteHelp}
      />
    )}
    </>
  );
};

const toggleBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
  borderRadius: 5, color: '#f59e0b', cursor: 'pointer', width: 20, height: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  flexShrink: 0, transition: 'background 0.12s, color 0.12s',
};


export { NodeInspectorPanel as NodeInspector } from '../inspector/NodeInspector';
export type { NodeInspectorPanelProps } from '../inspector/NodeInspector';
