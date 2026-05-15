/**
 * nodes/LoopNode.tsx  (revised)
 *
 * Fixes:
 *  - Uses fillContainer on BaseNode so content fills the resized frame
 *  - Left (target) / Right (source) handles — consistent with all other nodes
 *  - NodeShell passes fillContainer through correctly
 *  - Content area uses flex + overflowY:auto so resize reveals more content
 *
 * Two modes:
 *  iterator   — splits an array at a dot-path in cStream, runs body once per element
 *  expression — runs while a JS expression returns true (pagination, retry, poll)
 */

import React from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import { BaseNode, NodeField, NodeInput, NodeSelect } from './BaseNode';

// ── NodeShell ─────────────────────────────────────────────────────────────────
interface ShellProps {
  id: string;
  data: Record<string, unknown>;
  selected: boolean;
  children: React.ReactNode;
  minWidth?: number;
  minHeight?: number;
}

const NodeShell: React.FC<ShellProps> = ({
  id, data, selected, children,
  minWidth = 240, minHeight = 140,
}) => {
  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    (data.onDelete as any)?.(id);
  };

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={minWidth}
        minHeight={minHeight}
        handleStyle={{
          background: '#ea580c', border: '2px solid #0f1117',
          width: 10, height: 10, borderRadius: 3,
        }}
        lineStyle={{ borderColor: 'rgba(234,88,12,0.35)' }}
      />
      {selected && (
        <button
          onClick={onDelete}
          title="Delete node"
          style={{
            position: 'absolute', top: -10, right: -10,
            width: 20, height: 20, borderRadius: '50%',
            background: '#f87171', border: '2px solid #0f1117',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 10, lineHeight: 1, padding: 0,
          }}
        >×</button>
      )}
      {/* fillContainer=true makes BaseNode stretch to whatever NodeResizer sets */}
      <BaseNode
        selected={selected}
        color="#ea580c"
        icon="↻"
        title="Loop"
        status="idle"
        hasTarget
        hasSource
        fillContainer
      >
        {children}
      </BaseNode>
    </>
  );
};

// ── LoopNode ──────────────────────────────────────────────────────────────────

const EXPRESSION_PLACEHOLDER =
`// iteration = current loop count (0-based)
// Return true to continue, false to stop.
// Example: pagination
iteration < Math.ceil(cStream.total / cStream.pageSize)`;

export const LoopNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const mode           = (data.mode           as string) ?? 'iterator';
  const arrayPath      = (data.arrayPath      as string) ?? '';
  const itemVar        = (data.itemVar        as string) ?? '_item';
  const expression     = (data.expression     as string) ?? '';
  const maxIterations  = (data.maxIterations  as number) ?? 100;
  const storeResultAs  = (data.storeResultAs  as string) ?? '';
  const bodyFloId     = (data.bodyFloId     as string) ?? '';
  const availableFlos = (data.availableFlos as { id: string; name: string }[]) ?? [];

  const update = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);

  return (
    <NodeShell id={id} data={data} selected={selected as boolean}>
      {/* Scrollable content fills the resized frame */}
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>

        {/* Mode */}
        <NodeField label="Loop Mode">
          <NodeSelect value={mode} onChange={e => update({ mode: e.target.value })}>
            <option value="iterator">Iterator — one run per array element</option>
            <option value="expression">Expression — run while condition is true</option>
          </NodeSelect>
        </NodeField>

        {/* ── Iterator config ── */}
        {mode === 'iterator' && (
          <>
            {/* Two-column row: array path + item var */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <NodeField label="Array Path (empty = cStream)">
                <NodeInput
                  placeholder="e.g. data.items"
                  value={arrayPath}
                  onChange={e => update({ arrayPath: e.target.value })}
                />
              </NodeField>
              <NodeField label="Item Variable">
                <NodeInput
                  placeholder="_item"
                  value={itemVar}
                  onChange={e => update({ itemVar: e.target.value })}
                />
              </NodeField>
            </div>
            <div style={{ fontSize: 9, color: '#3a3a50', marginBottom: 6, lineHeight: 1.5 }}>
              Each iteration: cStream +{' '}
              <span style={{ color: '#ea580c' }}>{itemVar || '_item'}</span>
              {' '}+ _index + _total
            </div>
          </>
        )}

        {/* ── Expression config ── */}
        {mode === 'expression' && (
          <>
            <NodeField label="Continue While (JS expression)">
              <textarea
                value={expression || EXPRESSION_PLACEHOLDER}
                onChange={e => update({ expression: e.target.value })}
                spellCheck={false}
                style={{
                  width: '100%', minHeight: 72,
                  background: '#0a0c12',
                  border: '0.5px solid rgba(255,255,255,0.08)',
                  borderRadius: 4, color: '#ea580c',
                  fontSize: 9, fontFamily: 'monospace',
                  padding: '5px 7px', resize: 'none', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </NodeField>
            <div style={{ fontSize: 9, color: '#3a3a50', marginBottom: 6, lineHeight: 1.5 }}>
              Receives: cStream, global, local, iteration (count)
            </div>
          </>
        )}

        {/* Body flow + max iterations — two-column */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6, marginBottom: 6 }}>
          <NodeField label="Loop Body Flow">
            <NodeSelect
              value={bodyFloId}
              onChange={e => update({ bodyFloId: e.target.value })}
            >
              <option value="">— Select body flow —</option>
              {availableFlos.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </NodeSelect>
          </NodeField>
          <NodeField label="Max Iter.">
            <NodeInput
              type="number"
              min={1}
              max={500}
              value={maxIterations}
              onChange={e => update({
                maxIterations: Math.min(500, Math.max(1, Number(e.target.value))),
              })}
            />
          </NodeField>
        </div>

        {!bodyFloId && (
          <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 4 }}>
            ⚠ No body flow selected — loop will be skipped at runtime.
          </div>
        )}

        {/* Store result */}
        <NodeField label="Store Result As (global variable, optional)">
          <NodeInput
            placeholder="e.g. processedInvoices"
            value={storeResultAs}
            onChange={e => update({ storeResultAs: e.target.value })}
          />
        </NodeField>

        <div style={{
          marginTop: 4, fontSize: 9, color: '#3a3a50',
          borderTop: '0.5px solid rgba(255,255,255,0.05)',
          paddingTop: 4, lineHeight: 1.5,
        }}>
          Local store destroyed after loop. Global store persists.
        </div>
      </div>
    </NodeShell>
  );
};
