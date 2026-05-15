import React from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react';
import type { PlugVariableBinding, PlugVariableHint } from '@floplug/shared';

interface PlugNodeData {
  plugId:         string;
  plugName:       string;
  urlPattern:     string;
  connectorLabel: string;
  variableHints?: PlugVariableHint[];
  urlVariables?:  Record<string, PlugVariableBinding>;
  onDelete?:      (id: string) => void;
}

const PlugNode: React.FC<{ id: string; data: PlugNodeData; selected: boolean }> = ({ id, data, selected }) => {
  const urlVars     = [...((data.urlPattern ?? '').matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]);
  const filledCount = urlVars.filter(v => {
    const b = data.urlVariables?.[v];
    if (b?.value) return true;
    // also count if there's a defaultValue hint
    return data.variableHints?.find(h => h.name === v)?.defaultValue;
  }).length;
  const allFilled = filledCount === urlVars.length && urlVars.length > 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onDelete?.(id);
  };

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={80}
        handleStyle={{
          background: '#4f8ef7',
          border: '2px solid #0f1117',
          width: 10, height: 10, borderRadius: 3,
        }}
        lineStyle={{ borderColor: 'rgba(79,142,247,0.4)' }}
      />

      {/* Delete button — shown when selected */}
      {selected && (
        <button
          onClick={handleDelete}
          title="Delete node"
          style={{
            position: 'absolute', top: -10, right: -10,
            width: 20, height: 20, borderRadius: '50%',
            background: '#f87171', border: '2px solid #0f1117',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 10, lineHeight: 1, padding: 0,
          }}
        >
          ×
        </button>
      )}

      <div style={{
        background: selected ? '#1e2130' : '#181b24',
        border: `1px solid ${selected ? '#4f8ef7' : 'rgba(79,142,247,0.4)'}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 160,
        minHeight: 80,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        fontFamily: "'Inter',-apple-system,sans-serif",
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <Handle type="target" position={Position.Left} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: 'rgba(79,142,247,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: '#4f8ef7',
          }}>
            {data.plugName?.slice(0, 2).toUpperCase() ?? 'PL'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#e8e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data.plugName ?? 'Plug'}
            </div>
            <div style={{ fontSize: 9, color: '#6b6b80', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data.connectorLabel ?? ''}
            </div>
          </div>
        </div>

        {/* Variable fill status */}
        {urlVars.length > 0 && (
          <div style={{
            fontSize: 9,
            color:      allFilled ? '#22c55e' : '#f59e0b',
            background: allFilled ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
            border:     `0.5px solid ${allFilled ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
            padding: '2px 7px',
            borderRadius: 4,
            alignSelf: 'flex-start',
          }}>
            {allFilled
              ? `✓ ${filledCount}/${urlVars.length} vars ready`
              : `⚠ ${filledCount}/${urlVars.length} vars set`}
          </div>
        )}

        {/* URL preview — dimmed monospace */}
        {data.urlPattern && (
          <div style={{
            fontSize: 7.5,
            color: '#3a3a50',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {data.urlPattern}
          </div>
        )}

        <Handle type="source" position={Position.Right} />
      </div>
    </>
  );
};

export default PlugNode;
