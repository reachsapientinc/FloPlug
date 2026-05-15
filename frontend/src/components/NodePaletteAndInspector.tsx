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

import React, { useState, useEffect, useCallback } from 'react';
import type { Node }                   from '@xyflow/react';
import { collection, getDocs }         from 'firebase/firestore';
import { db }                          from '../firebaseConfig';
import type { PlugConfig, PlugVariableHint, PlugVariableBinding } from '@floplug/shared';

// ── Shared input styles ───────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '5px 7px', borderRadius: 4,
  border: '0.5px solid rgba(255,255,255,.12)',
  background: '#0f1117', color: '#ffffff',
  fontSize: 10, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
};
const sel: React.CSSProperties = {
  ...inp, cursor: 'pointer',
};
const labelStyle: React.CSSProperties = {
  fontSize: 9, color: '#39ff14', textTransform: 'uppercase',
  letterSpacing: '0.4px', marginBottom: 3, fontWeight: 600,
};
const sectionBox: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '0.5px solid rgba(255,255,255,0.07)',
  borderRadius: 6, padding: '8px 10px', marginBottom: 8,
};

// ── Source options ────────────────────────────────────────────────────────────
type SourceType = 'static' | 'cStream' | 'local' | 'global';

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'static',  label: 'Static'  },
  { value: 'cStream', label: 'cStream' },
  { value: 'local',   label: 'Local'   },
  { value: 'global',  label: 'Global'  },
];

const CONTENT_TYPES = [
  'text/plain', 'text/csv', 'text/html','text/xml',
  'application/pdf', 'application/json',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];

// ── EmailFieldBinding — per-field state shape ─────────────────────────────────
interface EmailFieldBinding {
  source:        SourceType;
  value:         string;        // static text OR variable path
  asAttachment?: boolean;       // only relevant when source !== 'static'
  fileName?:     string;
  contentType?:  string;
}

type EmailBindings = Record<string, EmailFieldBinding>;

// ── Single email field row ────────────────────────────────────────────────────
const EmailField: React.FC<{
  fieldKey:   string;
  label:      string;
  isList?:    boolean;   // to/cc/bcc render a tag-list style hint
  binding:    EmailFieldBinding;
  onChange:   (patch: Partial<EmailFieldBinding>) => void;
}> = ({ fieldKey, label, isList = false, binding, onChange }) => {
  const isStatic  = binding.source === 'static';
  const isDynamic = !isStatic;

  return (
    <div style={sectionBox}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={labelStyle}>{label}{isList ? ' (list)' : ''}</div>
        <select
          style={{ ...sel, width: 80, fontSize: 9, padding: '3px 5px' }}
          value={binding.source}
          onChange={e => onChange({ source: e.target.value as SourceType, asAttachment: false })}
        >
          {SOURCE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Static: textarea (formattable text) */}
      {isStatic && (
        <textarea
          style={{ ...inp, minHeight: fieldKey === 'body' ? 90 : 32, resize: 'vertical', lineHeight: 1.5 }}
          placeholder={
            fieldKey === 'body'    ? 'Email body — supports plain text and basic HTML'
            : isList               ? 'e.g. alice@co.com, bob@co.com'
            : fieldKey === 'subject' ? 'e.g. Report for {{date}}'
            : 'Static value'
          }
          value={binding.value}
          onChange={e => onChange({ value: e.target.value })}
        />
      )}

      {/* Dynamic: variable path + inline/attachment choice */}
      {isDynamic && (
        <>
          <input
            style={{ ...inp, marginBottom: 6 }}
            placeholder={`${binding.source} variable path — e.g. ${
              binding.source === 'cStream' ? 'emailAddress'
              : binding.source === 'local' ? 'localVar.recipientList'
              : 'global.reportRecipients'
            }`}
            value={binding.value}
            onChange={e => onChange({ value: e.target.value })}
          />

          {/* Inline body vs attachment — only for body/content fields */}
          {(fieldKey === 'body') && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[
                { val: false, label: '📄 Inline body' },
                { val: true,  label: '📎 Send as attachment' },
              ].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => onChange({ asAttachment: opt.val })}
                  style={{
                    flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 9,
                    fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
                    border: `0.5px solid ${binding.asAttachment === opt.val ? '#4f8ef7' : 'rgba(255,255,255,0.1)'}`,
                    background: binding.asAttachment === opt.val ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.03)',
                    color: binding.asAttachment === opt.val ? '#4f8ef7' : '#6b6b80',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Attachment sub-fields */}
          {fieldKey === 'body' && binding.asAttachment && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 5, background: 'rgba(79,142,247,0.06)', border: '0.5px solid rgba(79,142,247,0.2)' }}>
              <div style={labelStyle}>Attachment file name *</div>
              <input
                style={inp}
                placeholder='e.g. report.csv  or  {{local.exportFileName}}'
                value={binding.fileName ?? ''}
                onChange={e => onChange({ fileName: e.target.value })}
              />
              <div style={{ ...labelStyle, marginTop: 4 }}>Content type *</div>
              <select
                style={sel}
                value={binding.contentType ?? ''}
                onChange={e => onChange({ contentType: e.target.value })}
              >
                <option value="">— Select content type —</option>
                {CONTENT_TYPES.map(ct => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
              {(!binding.fileName || !binding.contentType) && (
                <div style={{ fontSize: 9, color: '#f59e0b' }}>
                  ⚠ File name and content type are required for attachments.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── EmailPlugInspector ────────────────────────────────────────────────────────
const EMAIL_FIELDS: { key: string; label: string; isList?: boolean }[] = [
  { key: 'to',      label: 'To',      isList: true  },
  { key: 'cc',      label: 'CC',      isList: true  },
  { key: 'bcc',     label: 'BCC',     isList: true  },
  { key: 'subject', label: 'Subject'                },
  { key: 'body',    label: 'Body'                   },
];

const DEFAULT_BINDING: EmailFieldBinding = { source: 'static', value: '' };

const EmailPlugInspector: React.FC<{
  node:     Node;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}> = ({ node, onUpdate }) => {
  const data     = node.data as Record<string, unknown>;
  const bindings = (data.emailBindings ?? {}) as EmailBindings;

  const getBinding = (key: string): EmailFieldBinding =>
    bindings[key] ?? { ...DEFAULT_BINDING };

  const patchBinding = (key: string, patch: Partial<EmailFieldBinding>) => {
    const updated: EmailBindings = {
      ...bindings,
      [key]: { ...getBinding(key), ...patch },
    };
    onUpdate(node.id, { emailBindings: updated });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* Plug info header */}
      <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(79,142,247,0.06)', border: '0.5px solid rgba(79,142,247,0.15)', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#4f8ef7' }}>
          ✉ {data.plugName as string}
        </div>
        <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 1 }}>
          {data.connectorLabel as string} · SMTP
        </div>
        <div style={{ fontSize: 8, color: '#3a3a50', marginTop: 3, lineHeight: 1.5 }}>
          Select a source for each field. Use <span style={{ color: '#39ff14' }}>Static</span> for
          fixed values, or map from a <span style={{ color: '#39ff14' }}>variable</span>.
          Body can be sent inline or as an attachment.
        </div>
      </div>

      {EMAIL_FIELDS.map(f => (
        <EmailField
          key={f.key}
          fieldKey={f.key}
          label={f.label}
          isList={f.isList}
          binding={getBinding(f.key)}
          onChange={patch => patchBinding(f.key, patch)}
        />
      ))}
    </div>
  );
};

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

// ── MapperEditor ──────────────────────────────────────────────────────────────
interface MapperEditorProps {
  mappings: string[];
  onChange: (mappings: string[]) => void;
}

const MapperEditor: React.FC<MapperEditorProps> = ({ mappings, onChange }) => {
  const pairs = mappings.map(m => {
    const [src = '', tgt = ''] = m.split('→').map(s => s.trim());
    return { src, tgt };
  });
  const updatePair = (i: number, field: 'src' | 'tgt', v: string) => {
    const next = pairs.map((p, idx) => idx === i ? { ...p, [field]: v } : p);
    onChange(next.map(p => `${p.src} → ${p.tgt}`));
  };
  const addRow    = () => onChange([...mappings, ' → ']);
  const removeRow = (i: number) => onChange(mappings.filter((_, idx) => idx !== i));

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Source</div>
        <div style={{ width: 14 }} />
        <div style={{ flex: 1, fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Target</div>
        <div style={{ width: 18 }} />
      </div>
      {pairs.length === 0 && <div style={{ fontSize: 10, color: '#3a3a50', marginBottom: 6, fontStyle: 'italic' }}>No mappings yet</div>}
      {pairs.map((pair, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <input value={pair.src} placeholder="source" onChange={e => updatePair(i, 'src', e.target.value)} style={mapInput} />
          <span style={{ fontSize: 10, color: '#7c3aed', flexShrink: 0 }}>→</span>
          <input value={pair.tgt} placeholder="target" onChange={e => updatePair(i, 'tgt', e.target.value)} style={mapInput} />
          <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>×</button>
        </div>
      ))}
      <button onClick={addRow} style={{ marginTop: 2, width: '100%', padding: '4px 0', borderRadius: 4, border: '0.5px dashed rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.06)', color: '#7c3aed', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
        + Add mapping
      </button>
    </div>
  );
};

const mapInput: React.CSSProperties = {
  flex: 1, padding: '4px 6px', borderRadius: 4,
  border: '0.5px solid rgba(255,255,255,0.08)',
  background: '#0f1117', color: '#c0c0cc',
  fontSize: 10, fontFamily: 'inherit', outline: 'none', minWidth: 0,
};

// ── PlugNodeInspector — routes to email or URL-variable inspector ──────────────
interface PlugNodeData {
  plugId:          string;
  plugName:        string;
  urlPattern:      string;
  connectorId:     string;
  connectorLabel:  string;
  authProtocol?:   string;
  variableHints?:  PlugVariableHint[];
  urlVariables?:   Record<string, PlugVariableBinding>;
  emailBindings?:  Record<string, EmailFieldBinding>;
  actionId?:       string;
}

const PlugNodeInspector: React.FC<{
  node:     Node;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as unknown as PlugNodeData;

  // Email plugs get the dedicated email inspector
  if (data.authProtocol === 'smtp_basic') {
    return <EmailPlugInspector node={node} onUpdate={onUpdate} />;
  }

  // All other plugs: URL-variable form (original behaviour)
  const urlVars = [...((data.urlPattern ?? '').matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Plug info — read only */}
      <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(79,142,247,0.06)', border: '0.5px solid rgba(79,142,247,0.15)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#4f8ef7' }}>{data.plugName}</div>
        <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 1 }}>{data.connectorLabel}</div>
        <div style={{ fontSize: 8, color: '#3a3a50', fontFamily: 'monospace', marginTop: 2, wordBreak: 'break-all' }}>{data.urlPattern}</div>
        {data.authProtocol && (
          <div style={{ fontSize: 8, color: '#0f766e', marginTop: 3 }}>🔑 {data.authProtocol}</div>
        )}
      </div>

      {/* URL Variables — developer fills these */}
      {urlVars.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
            URL Variables
          </div>
          {urlVars.map(varName => {
            const hint    = data.variableHints?.find(h => h.name === varName);
            const binding = data.urlVariables?.[varName];
            return (
              <div key={varName} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: '#4f8ef7', fontFamily: 'monospace', marginBottom: 2 }}>
                  {`{{${varName}}}`}
                </div>
                {hint?.hint && (
                  <div style={{ fontSize: 8, color: '#45455a', marginBottom: 4, lineHeight: 1.4 }}>{hint.hint}</div>
                )}
                <div style={{ display: 'flex', gap: 5 }}>
                  <select
                    style={{ flex: '0 0 75px', padding: '4px 6px', borderRadius: 4, border: '0.5px solid rgba(255,255,255,.08)', background: '#0f1117', color: '#ffffff', fontSize: 9, fontFamily: 'inherit', outline: 'none' }}
                    value={binding?.source ?? 'static'}
                    onChange={e => onUpdate(node.id, {
                      urlVariables: { ...(data.urlVariables ?? {}), [varName]: { source: e.target.value, value: binding?.value ?? hint?.defaultValue ?? '' } }
                    })}
                  >
                    <option value="static">Static</option>
                    <option value="cStream">cStream</option>
                    <option value="global">Global</option>
                    <option value="local">Local</option>
                  </select>
                  <input
                    style={{ flex: 1, padding: '4px 6px', borderRadius: 4, border: '0.5px solid rgba(255,255,255,.08)', background: '#0f1117', color: '#ffffff', fontSize: 9, fontFamily: 'inherit', outline: 'none' }}
                    placeholder={hint?.defaultValue ?? `value for ${varName}`}
                    value={binding?.value ?? ''}
                    onChange={e => onUpdate(node.id, {
                      urlVariables: { ...(data.urlVariables ?? {}), [varName]: { source: binding?.source ?? 'static', value: e.target.value } }
                    })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── NodeInspector ─────────────────────────────────────────────────────────────
interface InspectorProps {
  node:     Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

const INSPECTOR_FIELDS: Record<string, { key: string; label: string; options?: string[] }[]> = {
  workdayNode:    [
    { key: 'workerId',   label: 'Worker ID' },
    { key: 'actionType', label: 'Action type', options: ['GET_DETAILS','GET_TIMESHEETS','GET_PAYROLL','GET_BENEFITS','LIST_WORKERS'] },
  ],
  salesforceNode: [
    { key: 'sfObject',  label: 'SF object',  options: ['Contact','Account','Opportunity','Lead','Case'] },
    { key: 'operation', label: 'Operation',  options: ['Query','Upsert','Insert','Update','Delete'] },
    { key: 'filter',    label: 'Filter / payload' },
  ],
  sapNode: [
    { key: 'sapModule', label: 'Module', options: ['FI','MM','HR','SD','PP'] },
    { key: 'action',    label: 'Action', options: ['READ_BAPI','POST_DOCUMENT','GET_TABLE'] },
    { key: 'bapi',      label: 'BAPI / table' },
  ],
  oracleNode: [
    { key: 'action',    label: 'Action',        options: ['QUERY','INSERT','UPDATE','CALL_PROC'] },
    { key: 'sqlOrProc', label: 'SQL / procedure' },
  ],
  filterNode: [
    { key: 'field',    label: 'Field path' },
    { key: 'operator', label: 'Operator', options: ['==','!=','>','<','>=','<=','contains','startsWith'] },
    { key: 'value',    label: 'Value' },
  ],
};

export const NodeInspector: React.FC<InspectorProps> = ({ node, onUpdate }) => {
  if (!node) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, color: '#3a3a50', fontSize: 11, fontFamily: "'Inter',-apple-system,sans-serif", textAlign: 'center' }}>
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" style={{ marginBottom: 8, opacity: 0.3 }}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <div>Select a node to inspect</div>
      </div>
    );
  }

  const fields = INSPECTOR_FIELDS[node.type ?? ''] ?? [];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14, fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 11, color: '#c0c0cc' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#d0d0dc', marginBottom: 2 }}>
          {(node.data.label as string) ?? node.type}
        </div>
        <div style={{ fontSize: 9, color: '#3a3a50', fontFamily: 'monospace' }}>{node.id}</div>
      </div>

      {node.type === 'mapperNode' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Field Mappings</div>
          <MapperEditor
            mappings={(node.data.mappings as string[]) ?? []}
            onChange={mappings => onUpdate(node.id, { mappings })}
          />
        </div>
      )}

      {node.type === 'plugNode' && (
        <PlugNodeInspector node={node} onUpdate={onUpdate} />
      )}

      {node.type !== 'mapperNode' && node.type !== 'plugNode' && (
        <>
          {fields.map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{f.label}</div>
              {f.options ? (
                <select value={(node.data[f.key] as string) ?? ''} onChange={e => onUpdate(node.id, { [f.key]: e.target.value })}
                  style={{ width: '100%', padding: '5px 7px', borderRadius: 4, border: '0.5px solid rgba(255,255,255,.08)', background: '#0f1117', color: '#ffffff', fontSize: 10, fontFamily: 'inherit', outline: 'none' }}>
                  {f.options.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input value={(node.data[f.key] as string) ?? ''} onChange={e => onUpdate(node.id, { [f.key]: e.target.value })}
                  style={{ width: '100%', padding: '5px 7px', borderRadius: 4, border: '0.5px solid rgba(255,255,255,.08)', background: '#0f1117', color: '#ffffff', fontSize: 10, fontFamily: 'inherit', outline: 'none' }} />
              )}
            </div>
          ))}
          {fields.length === 0 && (
            <div style={{ fontSize: 10, color: '#3a3a50', fontStyle: 'italic' }}>No configurable properties</div>
          )}
        </>
      )}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#2a2a38', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Position</div>
        <div style={{ fontSize: 9, color: '#3a3a50', fontFamily: 'monospace' }}>
          x: {Math.round(node.position.x)} · y: {Math.round(node.position.y)}
        </div>
      </div>
    </div>
  );
};
