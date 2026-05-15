/**
 * nodes/TemplateNode.tsx
 *
 * Resize fix: ReactFlow sets width/height on the node's outer wrapper.
 * For resize to work on ALL corners (not just horizontal), the component
 * must render a single root div with explicit pixel width/height from props,
 * NOT rely on position:absolute or flex fill from a parent.
 *
 * Pattern that works:
 *   <div style={{ width, height }}>   ← explicit pixels from NodeProps
 *     <NodeResizer />
 *     content fills this div
 *   </div>
 *
 * Pattern that breaks vertical resize:
 *   <NodeResizer />  (sibling)
 *   <BaseNode fillContainer>  ← BaseNode tries position:absolute but
 *     ...                        ReactFlow wrapper hasn't set a height
 *   </BaseNode>
 */

import React, { useState, useRef, useEffect } from 'react';
import { type NodeProps, NodeResizer, Handle, Position } from '@xyflow/react';
import { NodeDrawer } from './NodeDrawer';

// ── Content-type options ──────────────────────────────────────────────────────
export const CONTENT_TYPES = [
  { value: 'text/plain',       label: 'Plain Text',  badge: 'TXT'  },
  { value: 'application/xml',  label: 'XML',         badge: 'XML'  },
  { value: 'application/json', label: 'JSON',        badge: 'JSON' },
  { value: 'text/html',        label: 'HTML',        badge: 'HTML' },
  { value: 'text/csv',         label: 'CSV',         badge: 'CSV'  },
] as const;

export type TemplateContentType = typeof CONTENT_TYPES[number]['value'];

const BADGE_COLORS: Record<string, string> = {
  'text/plain':       '#6b6b80',
  'application/xml':  '#0891b2',
  'application/json': '#7c3aed',
  'text/html':        '#b45309',
  'text/csv':         '#065f46',
};

const PLACEHOLDERS: Record<string, string> = {
  'text/plain':       'Hello {{displayName}},\nYour value is {{value}}.',
  'application/xml':  '<Root>\n  <Name>{{displayName}}</Name>\n  <Value>{{value}}</Value>\n</Root>',
  'application/json': '{\n  "name":  "{{displayName}}",\n  "value": "{{value}}"\n}',
  'text/html':        '<p>Hello <strong>{{displayName}}</strong></p>',
  'text/csv':         'name,value\n{{displayName}},{{value}}',
};

// ── Highlight renderer ────────────────────────────────────────────────────────
const HighlightedTemplate: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return <span style={{ color: '#3a3a50', fontStyle: 'italic' }}>Click "Edit Template" to start</span>;
  const parts = text.split(/((?:\{\{[\w.]+\}\})|(?:\$\$[\w.]+\$\$))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\{\{[\w.]+\}\}$/.test(part))
          return <span key={i} style={{ color: '#60a5fa', fontWeight: 600 }}>{part}</span>;
        if (/^\$\$global\.[\w.]+\$\$$/.test(part))
          return <span key={i} style={{ color: '#fbbf24', fontWeight: 600 }}>{part}</span>;
        if (/^\$\$local\.[\w.]+\$\$$/.test(part))
          return <span key={i} style={{ color: '#34d399', fontWeight: 600 }}>{part}</span>;
        if (/^\$\$[\w.]+\$\$$/.test(part))
          return <span key={i} style={{ color: '#a78bfa', fontWeight: 600 }}>{part}</span>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

// ── Shared select style for modal header ──────────────────────────────────────
const selStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 5,
  border: '0.5px solid rgba(255,255,255,0.1)',
  background: '#181b24', color: '#c8c8d8',
  fontSize: 10, fontFamily: 'inherit', outline: 'none',
};

// ── Template Editor Modal ─────────────────────────────────────────────────────
interface EditorModalProps {
  value:       string;
  contentType: string;
  outputMode:  string;
  storeScope:  string;
  storeName:   string;
  onSave:      (value: string, ct: string, om: string, sc: string, sn: string) => void;
  onClose:     () => void;
}

const TemplateEditorModal: React.FC<EditorModalProps> = ({
  value, contentType, outputMode, storeScope, storeName, onSave, onClose,
}) => {
  const [text,      setText]      = useState(value);
  const [ct,        setCt]        = useState(contentType);
  const [om,        setOm]        = useState(outputMode);
  const [scope,     setScope]     = useState(storeScope);
  const [sName,     setSName]     = useState(storeName);
  const [searchQ,   setSearchQ]   = useState('');
  const [tab,       setTab]       = useState<'edit' | 'preview'>('edit');
  const [formatErr, setFormatErr] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = text.split('\n').length;
  const usedVars  = [...new Set(
    [...text.matchAll(/\{\{([\w.]+)\}\}/g)].map(m => m[1])
    .concat([...text.matchAll(/\$\$([\w.]+)\$\$/g)].map(m => m[1]))
  )];

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFormat = () => {
    setFormatErr('');
    try {
      if (ct === 'application/json') {
        setText(JSON.stringify(JSON.parse(text), null, 2));
      } else if (ct === 'application/xml') {
        let indent = 0;
        const lines = text
          .replace(/>\s*</g, '>\n<')
          .split('\n')
          .map(line => {
            line = line.trim();
            if (!line) return '';
            if (line.startsWith('</')) indent = Math.max(0, indent - 1);
            const out = '  '.repeat(indent) + line;
            if (!line.startsWith('</') && !line.endsWith('/>') && !line.startsWith('<?')
                && line.includes('<') && !line.includes('</')) indent++;
            return out;
          })
          .filter(Boolean);
        setText(lines.join('\n'));
      }
    } catch (e: any) {
      setFormatErr(`Format error: ${e.message}`);
    }
  };

  const insertVar = (varText: string) => {
    const ta = textareaRef.current;
    if (!ta) { setText(t => t + varText); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    setText(text.slice(0, start) + varText + text.slice(end));
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varText.length, start + varText.length);
    }, 0);
  };

  const suggestions = [
    { label: '{{value}}',           color: '#60a5fa', desc: 'cStream root value' },
    { label: '{{message}}',         color: '#60a5fa', desc: 'cStream message field' },
    { label: '{{displayName}}',     color: '#60a5fa', desc: 'cStream displayName' },
    { label: '$$global.varName$$',  color: '#fbbf24', desc: 'Global store variable' },
    { label: '$$local.varName$$',   color: '#34d399', desc: 'Local store variable' },
    { label: '$$cStream.field$$',   color: '#a78bfa', desc: 'Explicit cStream path' },
  ].filter(v =>
    !searchQ ||
    v.label.toLowerCase().includes(searchQ.toLowerCase()) ||
    v.desc.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter',-apple-system,sans-serif",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        width: '88vw', maxWidth: 1080, height: '84vh',
        background: '#141720', borderRadius: 12,
        border: '0.5px solid rgba(255,255,255,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 32px 100px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 6,
          padding: '10px 14px',
          borderBottom: '0.5px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 5, background: '#0f766e', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: '#fff',
          }}>TN</div>

          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e8f0' }}>Template Editor</div>
            <div style={{ fontSize: 9, color: '#45455a' }}>
              {lineCount} lines · {text.length} chars · {usedVars.length} vars
            </div>
          </div>

          <select value={ct} onChange={e => setCt(e.target.value)} style={selStyle}>
            {CONTENT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <select value={om} onChange={e => setOm(e.target.value)} style={selStyle}>
            <option value="overwrite">Replace cStream</option>
            <option value="store">Write to store</option>
          </select>

          {om === 'store' && (
            <>
              <select value={scope} onChange={e => setScope(e.target.value)} style={{ ...selStyle, width: 76 }}>
                <option value="global">Global</option>
                <option value="local">Local</option>
              </select>
              <input
                value={sName} onChange={e => setSName(e.target.value)}
                placeholder="var name"
                style={{ ...selStyle, width: 90 }}
              />
            </>
          )}

          {/* Edit / Preview tab */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
            {(['edit', 'preview'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 10px', borderRadius: 4, border: 'none',
                background: tab === t ? '#4f8ef7' : 'transparent',
                color: tab === t ? '#fff' : '#6b6b80',
                fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {t === 'edit' ? '✏ Edit' : '👁 Preview'}
              </button>
            ))}
          </div>

          {/* Format button */}
          {(ct === 'application/xml' || ct === 'application/json') && (
            <button onClick={handleFormat} style={{
              padding: '4px 10px', borderRadius: 5,
              border: '0.5px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: '#9090b0', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            }}>⚡ Format</button>
          )}

          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            border: '0.5px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: '#9090b0', fontSize: 15, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit',
          }}>×</button>
        </div>

        {/* Format error */}
        {formatErr && (
          <div style={{ padding: '5px 14px', flexShrink: 0, background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: 10 }}>
            {formatErr}
          </div>
        )}

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Editor / Preview pane */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {tab === 'edit' ? (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={PLACEHOLDERS[ct] ?? ''}
                spellCheck={false}
                autoFocus
                style={{
                  flex: 1, width: '100%',
                  background: '#0a0c12',
                  border: 'none',
                  borderRight: '0.5px solid rgba(255,255,255,0.07)',
                  color: '#c8c8d8',
                  fontSize: 12,
                  fontFamily: '"Fira Code","Cascadia Code","JetBrains Mono","Consolas",monospace',
                  padding: '14px 16px',
                  resize: 'none', outline: 'none',
                  boxSizing: 'border-box',
                  lineHeight: 1.65,
                  tabSize: 2,
                  overflowY: 'auto',
                }}
              />
            ) : (
              <div style={{
                flex: 1, overflowY: 'auto',
                background: '#0a0c12',
                borderRight: '0.5px solid rgba(255,255,255,0.07)',
                padding: '14px 16px',
                fontSize: 12,
                fontFamily: '"Fira Code","Cascadia Code","JetBrains Mono","Consolas",monospace',
                lineHeight: 1.65, color: '#c8c8d8',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                <HighlightedTemplate text={text} />
              </div>
            )}
          </div>

          {/* Variable sidebar */}
          <div style={{
            width: 230, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            background: '#0f1117',
            borderLeft: '0.5px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                Insert Variable
              </div>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search…"
                style={{
                  width: '100%', padding: '5px 8px', borderRadius: 4,
                  border: '0.5px solid rgba(255,255,255,0.08)',
                  background: '#181b24', color: '#c0c0cc',
                  fontSize: 10, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {suggestions.map((v, i) => (
                <button key={i} onClick={() => insertVar(v.label)} title="Click to insert at cursor" style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 12px', background: 'transparent', border: 'none',
                  cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{ fontSize: 10, color: v.color, fontFamily: 'monospace', fontWeight: 600 }}>{v.label}</div>
                  <div style={{ fontSize: 9, color: '#45455a', marginTop: 1 }}>{v.desc}</div>
                </button>
              ))}
              {usedVars.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px 3px', fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Used in template
                  </div>
                  {usedVars.map((v, i) => (
                    <div key={i} style={{ padding: '3px 12px', fontSize: 10, color: '#22c55e', fontFamily: 'monospace' }}>
                      ✓ {v}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          borderTop: '0.5px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <span style={{ flex: 1, fontSize: 9, color: '#3a3a50' }}>
            Esc to cancel · Ctrl+A to select all
          </span>
          <button onClick={onClose} style={{
            padding: '6px 16px', borderRadius: 6,
            border: '0.5px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: '#9090b0',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={() => { onSave(text, ct, om, scope, sName); onClose(); }} style={{
            padding: '6px 18px', borderRadius: 6,
            border: 'none', background: '#4f8ef7', color: '#fff',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Save Template</button>
        </div>
      </div>
    </div>
  );
};

// ── TemplateNode ──────────────────────────────────────────────────────────────
// KEY: destructure width/height from NodeProps — ReactFlow sets these when
// the user resizes. We pass them directly to the root div as explicit pixels.
export const TemplateNode: React.FC<NodeProps> = ({ id, data, selected, width, height }) => {
  const template    = (data.template    as string) ?? '';
  const outputMode  = (data.outputMode  as string) ?? 'overwrite';
  const contentType = (data.contentType as string) ?? 'text/plain';
  const storeScope  = (data.storeScope  as string) ?? 'global';
  const storeName   = (data.storeName   as string) ?? '';
  const [modalOpen, setModalOpen] = useState(false);

  const update = (patch: Record<string, unknown>) =>
    (data.onUpdate as any)?.(id, patch);

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    (data.onDelete as any)?.(id);
  };

  const badge      = CONTENT_TYPES.find(c => c.value === contentType)?.badge ?? 'TXT';
  const badgeColor = BADGE_COLORS[contentType] ?? '#6b6b80';
  const lineCount  = template ? template.split('\n').length : 0;
  const preview    = template.slice(0, 200);

  // Use explicit pixel dimensions from ReactFlow — default for first render
  const w = (width  ?? 260);
  const h = (height ?? 220);

  return (
    <>
      {modalOpen && (
        <TemplateEditorModal
          value={template}
          contentType={contentType}
          outputMode={outputMode}
          storeScope={storeScope}
          storeName={storeName}
          onSave={(t, ct, om, sc, sn) =>
            update({ template: t, contentType: ct, outputMode: om, storeScope: sc, storeName: sn })
          }
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* NodeResizer must be INSIDE the root div, not a sibling */}
      <NodeResizer
        isVisible={selected as boolean}
        minWidth={200}
        minHeight={160}
        handleStyle={{
          background: '#4f8ef7', border: '2px solid #0f1117',
          width: 10, height: 10, borderRadius: 3,
        }}
        lineStyle={{ borderColor: 'rgba(79,142,247,0.4)' }}
      />

      {/* Delete button */}
      {selected && (
        <button onClick={onDelete} title="Delete node" style={{
          position: 'absolute', top: -10, right: -10, zIndex: 10,
          width: 20, height: 20, borderRadius: '50%',
          background: '#f87171', border: '2px solid #0f1117',
          color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, padding: 0,
        }}>×</button>
      )}

      {/*
        ROOT DIV — explicit pixel width/height from ReactFlow NodeProps.
        This is what makes all-corner resize work. When ReactFlow calls
        onNodesChange with a resize delta it updates node.width/node.height,
        which flos into these props. The div must match those exact pixels.
      */}
      <div style={{
        width:      w,
        height:     h,
        minWidth:   200,
        minHeight:  160,
        boxSizing:  'border-box',
        background: selected ? '#1e2130' : '#181b24',
        border:     `0.5px solid ${selected ? '#4f8ef7' : 'rgba(255,255,255,0.12)'}`,
        boxShadow:  selected ? '0 0 0 1px rgba(79,142,247,0.2)' : 'none',
        borderRadius: 9,
        padding:    '10px 12px',
        fontFamily: "'Inter',-apple-system,sans-serif",
        fontSize:   11,
        color:      '#d0d0e0',
        display:    'flex',
        flexDirection: 'column',
        gap:        6,
        overflow:   'hidden',
        position:   'relative',
      }}>
        <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: '#4f8ef7', border: '2px solid #0f1117', borderRadius: '50%' }} />

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4, background: '#0f766e', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 800, color: '#fff',
          }}>TN</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#e0e0ec', flex: 1 }}>Template</span>
          {/* Badge */}
          <span style={{
            padding: '2px 6px', borderRadius: 3, flexShrink: 0,
            background: badgeColor, color: '#fff',
            fontSize: 8, fontWeight: 700, letterSpacing: '0.5px',
          }}>{badge}</span>
          <span style={{ fontSize: 9, color: '#6b6b80', flexShrink: 0 }}>
            {lineCount > 0 ? `${lineCount}L` : 'empty'}
          </span>
          {outputMode === 'store' && (
            <span style={{ fontSize: 8, color: '#fbbf24', flexShrink: 0 }}>
              →{storeScope}.{storeName || '?'}
            </span>
          )}
        </div>

        {/* Template preview — flex: 1 so it fills all remaining vertical space */}
        <div style={{
          flex: 1,
          minHeight: 0,         // ← critical: allows shrinking in flex column
          background: '#0a0c12',
          border: '0.5px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
          padding: '5px 7px',
          overflowY: 'auto',    // ← scrollable when content exceeds available height
          fontSize: 8.5,
          fontFamily: '"Fira Code","Cascadia Code","Consolas",monospace',
          color: '#6b6b80',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          cursor: 'default',
        }}>
          <HighlightedTemplate text={preview + (template.length > 200 ? '\n…' : '')} />
        </div>

        {/* Edit button */}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setModalOpen(true); }}
          style={{
            flexShrink: 0,
            padding: '5px 8px', borderRadius: 5,
            border: '0.5px solid rgba(79,142,247,0.35)',
            background: 'rgba(79,142,247,0.08)',
            color: '#4f8ef7', fontSize: 10, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          ✏ Edit Template
        </button>

        {/* Output target drawer — consistent with all other nodes */}
        <NodeDrawer
          id={id}
          data={data as unknown as Record<string, unknown>}
          label="Output settings"
          color="#0f766e"
          defaultOpen={false}
        >
          <div style={{ fontSize: 8, color: '#3a3a50', marginBottom: 4, lineHeight: 1.5 }}>
            By default the rendered template replaces <code style={{ fontFamily: 'monospace', color: '#4f8ef7' }}>cStream.message</code>.
            Use local/global to store without overwriting cStream.
          </div>
        </NodeDrawer>

        <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: '#4f8ef7', border: '2px solid #0f1117', borderRadius: '50%' }} />
      </div>
    </>
  );
};

export default TemplateNode;
