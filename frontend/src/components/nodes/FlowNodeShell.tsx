/**
 * Unified canvas node chrome — resize handles, delete button, consistent styling.
 */
import React from 'react';
import { NodeResizer } from '@xyflow/react';

export const DEFAULT_NODE_WIDTH  = 172;
export const DEFAULT_NODE_HEIGHT = 64;
export const MIN_NODE_WIDTH      = 120;
export const MIN_NODE_HEIGHT     = 52;

export interface FlowNodeShellProps {
  selected:    boolean;
  color:       string;
  width?:      number;
  height?:     number;
  minWidth?:   number;
  minHeight?:  number;
  onDelete?:   () => void;
  deletable?:  boolean;
  children:    React.ReactNode;
  /** Extra handles / overlays rendered inside the shell (after children). */
  extras?:     React.ReactNode;
}

export const FlowNodeShell: React.FC<FlowNodeShellProps> = ({
  selected,
  color,
  width  = DEFAULT_NODE_WIDTH,
  height = DEFAULT_NODE_HEIGHT,
  minWidth  = MIN_NODE_WIDTH,
  minHeight = MIN_NODE_HEIGHT,
  onDelete,
  deletable = true,
  children,
  extras,
}) => (
  <div style={{
    position: 'relative',
    width,
    height,
    boxSizing: 'border-box',
    fontFamily: "'Inter',-apple-system,sans-serif",
  }}>
    {selected && (
      <NodeResizer
        minWidth={minWidth}
        minHeight={minHeight}
        isVisible={selected}
        color={color}
        lineStyle={{ borderColor: `${color}66` }}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
          border: '2px solid #0f1117',
        }}
      />
    )}

    {selected && deletable && onDelete && (
      <button
        type="button"
        className="nodrag nopan fp-node-delete-btn"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        title="Delete node (Del)"
        aria-label="Delete node"
        style={{
          position: 'absolute', top: 4, right: 4, zIndex: 12,
          width: 18, height: 18, borderRadius: 4,
          background: 'rgba(248,113,113,0.92)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', lineHeight: 1, padding: 0,
          boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        }}
      >
        ×
      </button>
    )}

    <div style={{
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      background: selected ? '#1e2130' : '#181b24',
      border: `1px solid ${selected ? color : 'rgba(255,255,255,0.12)'}`,
      boxShadow: selected ? `0 0 0 1px ${color}40` : 'none',
      borderRadius: 9,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {children}
      {extras}
    </div>
  </div>
);

/** Read width/height from React Flow node props. */
export function nodeDimensions(
  props: { width?: number; height?: number; measured?: { width?: number; height?: number } },
  defaults?: { width?: number; height?: number },
): { width: number; height: number } {
  return {
    width:  props.width ?? props.measured?.width ?? defaults?.width ?? DEFAULT_NODE_WIDTH,
    height: props.height ?? props.measured?.height ?? defaults?.height ?? DEFAULT_NODE_HEIGHT,
  };
}

export function nodeDeleteHandler(
  data: Record<string, unknown>,
  id: string,
): (() => void) | undefined {
  const fn = data.onDelete as ((nid: string) => void) | undefined;
  return fn ? () => fn(id) : undefined;
}
