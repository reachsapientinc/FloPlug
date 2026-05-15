/**
 * BaseNode.tsx
 *
 * KEY FIX for resize: ReactFlow passes width/height as props to every node
 * component when the node has been resized. The outermost div MUST use these
 * explicit pixel values — not width:'100%' — otherwise the node collapses to
 * content size and NodeResizer has nothing to anchor to.
 *
 * For draggability: ReactFlow needs a non-zero measured size on first render.
 * We default to minWidth=200 / minHeight=100 so new nodes are draggable
 * immediately without needing to resize first.
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';

export interface BaseNodeProps {
  selected:       boolean;
  color:          string;
  icon:           string;
  title:          string;
  status?:        'idle' | 'running' | 'ok' | 'error';
  children:       React.ReactNode;
  hasTarget?:     boolean;
  hasSource?:     boolean;
  /**
   * When true the node fills its ReactFlow resize frame.
   * Pass width/height from the NodeProps to make resize work correctly.
   */
  fillContainer?: boolean;
  width?:         number;
  height?:        number;
}

const STATUS_COLOR: Record<string, string> = {
  idle:    '#45455a',
  running: '#f59e0b',
  ok:      '#22c55e',
  error:   '#f87171',
};

export const BaseNode: React.FC<BaseNodeProps> = ({
  selected, color, icon, title, status = 'idle',
  children, hasTarget = true, hasSource = true,
  fillContainer = false,
  width, height,
}) => {
  // When fillContainer, use explicit pixel dims so the node truly fills
  // the resize frame. Fall back to sensible defaults for first render.
  const outerStyle: React.CSSProperties = fillContainer
    ? {
        width:         width  ?? 260,
        height:        height ?? 220,
        minWidth:      160,
        minHeight:     80,
        boxSizing:     'border-box',
        display:       'flex',
        flexDirection: 'column',
        position:      'relative',
        background:    '#181b24',
        border:        `0.5px solid ${selected ? '#4f8ef7' : 'rgba(255,255,255,0.12)'}`,
        boxShadow:     selected ? '0 0 0 1px rgba(79,142,247,0.25)' : 'none',
        borderRadius:  9,
        padding:       '10px 12px',
        fontFamily:    "'Inter',-apple-system,sans-serif",
        fontSize:      11,
        color:         '#d0d0e0',
        overflow:      'hidden',
      }
    : {
        width:         '100%',
        boxSizing:     'border-box',
        position:      'relative',
        background:    '#181b24',
        border:        `0.5px solid ${selected ? '#4f8ef7' : 'rgba(255,255,255,0.12)'}`,
        boxShadow:     selected ? '0 0 0 1px rgba(79,142,247,0.25)' : 'none',
        borderRadius:  9,
        padding:       '10px 12px',
        fontFamily:    "'Inter',-apple-system,sans-serif",
        fontSize:      11,
        color:         '#d0d0e0',
      };

  return (
    <div style={outerStyle}>
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 10, height: 10,
            background: '#4f8ef7',
            border: '2px solid #0f1117',
            borderRadius: '50%',
          }}
        />
      )}

      {/* Header — fixed height */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        marginBottom: 8, flexShrink: 0,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 4, background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, color: '#e0e0ec',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: STATUS_COLOR[status] ?? STATUS_COLOR.idle,
          flexShrink: 0,
        }} title={status} />
      </div>

      {/* Content — grows to fill remaining height when fillContainer */}
      <div style={fillContainer
        ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        : {}
      }>
        {children}
      </div>

      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: 10, height: 10,
            background: '#4f8ef7',
            border: '2px solid #0f1117',
            borderRadius: '50%',
          }}
        />
      )}
    </div>
  );
};

// ── Shared sub-components ─────────────────────────────────────────────────────

export const NodeField: React.FC<{
  label:    string;
  children: React.ReactNode;
  grow?:    boolean;
}> = ({ label, children, grow }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6,
    ...(grow ? { flex: 1, minHeight: 0 } : {}),
  }}>
    <div style={{
      fontSize: 9, color: '#7070a0',
      textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0,
    }}>
      {label}
    </div>
    {children}
  </div>
);

export const NodeInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} style={{
    width: '100%', padding: '4px 7px', borderRadius: 4,
    border: '0.5px solid rgba(255,255,255,0.1)',
    background: '#0f1117', color: '#d0d0e0',
    fontSize: 10, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
    ...props.style,
  }} />
);

export const NodeSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} style={{
    width: '100%', padding: '4px 7px', borderRadius: 4,
    border: '0.5px solid rgba(255,255,255,0.1)',
    background: '#0f1117', color: '#d0d0e0',
    fontSize: 10, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
    ...props.style,
  }} />
);

export const NodeButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }
> = ({ variant = 'primary', ...props }) => (
  <button {...props} style={{
    width: '100%', padding: '5px 8px', borderRadius: 4,
    border: variant === 'ghost' ? '0.5px solid rgba(255,255,255,.12)' : 'none',
    background: variant === 'ghost' ? 'rgba(255,255,255,.04)' : '#4f8ef7',
    color: '#fff', fontSize: 10, fontWeight: 600,
    cursor: props.disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', opacity: props.disabled ? 0.55 : 1,
    boxSizing: 'border-box',
    ...props.style,
  }} />
);

export const NodeResult: React.FC<{ text: string; isError?: boolean }> = ({ text, isError }) => (
  <div style={{
    marginTop: 6, fontSize: 9, padding: '3px 6px', borderRadius: 4,
    background: isError ? 'rgba(248,113,113,0.08)' : 'rgba(34,197,94,0.08)',
    color: isError ? '#f87171' : '#22c55e',
    wordBreak: 'break-word', lineHeight: 1.5,
  }}>
    {text}
  </div>
);
