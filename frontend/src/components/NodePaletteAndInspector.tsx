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

import React, { useState } from 'react';
import type { PlugConfig } from '@floplug/shared';

// ── Palette static items ──────────────────────────────────────────────────────
interface PaletteItem {
  type:     string;
  label:    string;
  icon:     string;
  color:    string;
  category: string;
  help:     string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'sapNode',           label: 'SAP S/4HANA',  icon: 'S',   color: '#0052cc', category: 'ERP',       help: 'Read or post to SAP S/4HANA via BAPI / RFC calls.' },
  { type: 'oracleNode',        label: 'Oracle EBS',   icon: 'O',   color: '#e07b39', category: 'ERP',       help: 'Query tables or call stored procedures in Oracle EBS.' },
  { type: 'workdayNode',       label: 'Workday',      icon: 'W',   color: '#f5a623', category: 'HRIS',      help: 'Fetch worker details, timesheets, payroll or benefits.' },
  { type: 'salesforceNode',    label: 'Salesforce',   icon: 'SF',  color: '#00a1e0', category: 'CRM',       help: 'Query, insert, update or upsert Salesforce objects.' },
  { type: 'mapperNode',        label: 'Field Mapper', icon: 'M',   color: '#7c3aed', category: 'Transform', help: 'Rename or remap keys in cStream using source→target pairs.' },
  { type: 'filterNode',        label: 'Filter',       icon: 'F',   color: '#0f766e', category: 'Transform', help: 'Drop records from cStream that do not match a field condition.' },
  { type: 'variableStoreNode', label: 'Var Store',    icon: 'VS',  color: '#0891b2', category: 'Transform', help: 'Read/write named variables (global or local scope) in multi-row mode.' },
  { type: 'fifNode',           label: 'Flow in Flow', icon: 'FiF', color: '#7e22ce', category: 'Logic',     help: 'Embed another flow as a sub-step. Recursive flos are blocked.' },
  { type: 'functionNode',      label: 'Function',     icon: 'fn',  color: '#b45309', category: 'Logic',     help: 'Run a sandboxed JS snippet server-side; returns an object to merge into cStream.' },
  { type: 'templateNode',      label: 'Template',     icon: 'TN',  color: '#0f766e', category: 'Logic',     help: 'Render JSON/XML/CSV using {{path}} placeholders.' },
  { type: 'loopNode',          label: 'Loop',         icon: '↻',   color: '#ea580c', category: 'Logic',     help: 'Iterate over an array in cStream or run while a condition is true.' },
];

const CATEGORIES = ['ERP', 'HRIS', 'CRM', 'Transform', 'Logic'];

// ── IconWithTooltip ───────────────────────────────────────────────────────────
const IconWithTooltip: React.FC<{
  item:        PaletteItem;
  onDragStart: (e: React.DragEvent, item: PaletteItem) => void;
}> = ({ item, onDragStart }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        draggable
        onDragStart={e => onDragStart(e, item)}
        style={{
          width: 42, height: 42, borderRadius: 8,
          background:  hovered ? item.color : `${item.color}28`,
          border:      `0.5px solid ${hovered ? item.color : `${item.color}50`}`,
          display:     'flex', flexDirection: 'column',
          alignItems:  'center', justifyContent: 'center',
          cursor:      'grab', transition: 'background 0.15s, border-color 0.15s',
          userSelect:  'none', gap: 2,
        }}
      >
        <span style={{ fontSize: item.icon.length > 2 ? 7 : 11, fontWeight: 800, color: hovered ? '#fff' : item.color, lineHeight: 1, transition: 'color 0.15s', fontFamily: "'Inter',-apple-system,sans-serif" }}>
          {item.icon}
        </span>
        <span style={{ fontSize: 7, color: hovered ? '#fff' : '#f59e0b', lineHeight: 1, textAlign: 'center', maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.15s', fontFamily: "'Inter',-apple-system,sans-serif" }}>
          {item.label}
        </span>
      </div>
      {hovered && (
        <div style={{ position: 'absolute', left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)', zIndex: 9999, pointerEvents: 'none', background: '#1e2130', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', width: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', whiteSpace: 'normal' }}>
          <div style={{ position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid rgba(255,255,255,0.12)' }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: '#d0d0dc', marginBottom: 3 }}>{item.label}</div>
          <div style={{ fontSize: 9, color: '#f59e0b', lineHeight: 1.5 }}>{item.help}</div>
          <div style={{ marginTop: 5, fontSize: 8, color: '#3a3a50', fontFamily: 'monospace' }}>{item.type}</div>
        </div>
      )}
    </div>
  );
};

// ── PlugIcon ──────────────────────────────────────────────────────────────────
const PlugIcon: React.FC<{
  plug:        PlugConfig;
  onDragStart: (e: React.DragEvent, plug: PlugConfig) => void;
}> = ({ plug, onDragStart }) => {
  const [hovered, setHovered] = useState(false);
  const initials = plug.name.slice(0, 2).toUpperCase();
  const color    = plug.authProtocol === 'smtp_basic' ? '#f59e0b' : '#4f8ef7';

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        draggable
        onDragStart={e => onDragStart(e, plug)}
        style={{
          width: 42, height: 42, borderRadius: 8,
          background: hovered ? color : `${color}28`,
          border:     `0.5px solid ${hovered ? color : `${color}50`}`,
          display:    'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor:     'grab', transition: 'background 0.15s, border-color 0.15s',
          userSelect: 'none', gap: 2,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: hovered ? '#fff' : color, lineHeight: 1 }}>
          {plug.authProtocol === 'smtp_basic' ? '✉' : initials}
        </span>
        <span style={{ fontSize: 7, color: hovered ? '#fff' : '#f59e0b', lineHeight: 1, textAlign: 'center', maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {plug.name}
        </span>
      </div>
      {hovered && (
        <div style={{ position: 'absolute', left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)', zIndex: 9999, pointerEvents: 'none', background: '#1e2130', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', width: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid rgba(255,255,255,0.12)' }} />
          <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 2 }}>{plug.name}</div>
          <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 4 }}>{plug.connectorLabel ?? plug.connectorId}</div>
          {plug.authProtocol === 'smtp_basic'
            ? <div style={{ fontSize: 8, color: '#22c55e' }}>✉ Email plug — configure recipients and body on canvas</div>
            : <div style={{ fontSize: 8, color: '#3a3a50', fontFamily: 'monospace', wordBreak: 'break-all' }}>{plug.urlPattern}</div>
          }
          <div style={{ marginTop: 5, fontSize: 8, color: '#22c55e' }}>🔌 Drag to add to flow</div>
        </div>
      )}
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
  plugs?:          PlugConfig[];
}

export const NodePalette: React.FC<NodePaletteProps> = ({ plugs = [] }) => {
  const [collapsed,   setCollapsed]   = useState<Record<string, boolean>>({});
  const [panelHidden, setPanelHidden] = useState(false);

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
      plugId:         plug.id,
      plugName:       plug.name,
      urlPattern:     plug.urlPattern,
      variableHints:  plug.variableHints ?? [],
      connectorId:    plug.connectorId,
      connectorLabel: plug.connectorLabel ?? plug.connectorId,
      authProtocol:   plug.authProtocol,
      category:       plug.authProtocol === 'smtp_basic' ? 'email' : (plug.connectorId ?? ''),
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const EXPANDED_WIDTH = 128;
  const RAIL_WIDTH     = 28;

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
    <div style={{ width: EXPANDED_WIDTH, background: '#141720', borderRight: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', overflowX: 'visible', fontFamily: "'Inter',-apple-system,sans-serif", userSelect: 'none', position: 'relative' }}>
      {/* Header */}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#3a3a50', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nodes</span>
        <button onClick={() => setPanelHidden(true)} title="Hide palette" style={toggleBtnStyle}>
          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      </div>

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
                  <IconWithTooltip key={item.type} item={item} onDragStart={onDragStart} />
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
                <PlugIcon key={plug.id} plug={plug} onDragStart={onPlugDragStart} />
              ))}
            </div>
          )
        )}
      </div>

      <div style={{ marginTop: 'auto', padding: '8px', borderTop: '0.5px solid rgba(255,255,255,0.04)', fontSize: 8, color: '#2a2a38', lineHeight: 1.5, flexShrink: 0 }}>
        Drag onto canvas
      </div>
    </div>
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
