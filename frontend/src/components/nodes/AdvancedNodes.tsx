/**
 * AdvancedNodes.tsx — VariableStoreNode, FIFNode, FunctionNode
 * All nodes now have a NodeDrawer for output target configuration.
 */

import React, { useState } from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import { BaseNode, NodeField, NodeInput, NodeSelect } from './BaseNode';
import { NodeDrawer } from './NodeDrawer';

// ── NodeShell ─────────────────────────────────────────────────────────────────
interface ShellProps {
  id: string; data: Record<string, unknown>; selected: boolean;
  color: string; icon: string; title: string;
  status?: 'idle' | 'running' | 'ok' | 'error';
  hasTarget?: boolean; hasSource?: boolean;
  children: React.ReactNode;
  minWidth?: number; minHeight?: number;
}

const NodeShell: React.FC<ShellProps> = ({
  id, data, selected, color, icon, title, status = 'idle',
  hasTarget = true, hasSource = true, children,
  minWidth = 240, minHeight = 100,
}) => {
  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    (data.onDelete as any)?.(id);
  };
  const outputTarget = (data.outputTarget as string) || 'cStream';

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={minWidth}
        minHeight={minHeight}
        handleStyle={{ background: '#4f8ef7', border: '2px solid #0f1117', width: 10, height: 10, borderRadius: 3 }}
        lineStyle={{ borderColor: 'rgba(79,142,247,0.35)' }}
      />
      {selected && (
        <button onClick={onDelete} title="Delete node" style={{
          position: 'absolute', top: -10, right: -10,
          width: 20, height: 20, borderRadius: '50%',
          background: '#f87171', border: '2px solid #0f1117',
          color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 10, lineHeight: 1, padding: 0,
        }}>×</button>
      )}
      <BaseNode
        selected={selected} color={color} icon={icon} title={title}
        status={status} hasTarget={hasTarget} hasSource={hasSource} fillContainer
      >
        {/* Output target badge */}
        {outputTarget !== 'cStream' && (
          <div style={{ fontSize: 8, color: '#39ff14', background: 'rgba(57,255,20,0.07)', border: '0.5px solid rgba(57,255,20,0.2)', borderRadius: 3, padding: '1px 5px', alignSelf: 'flex-start', marginBottom: 4 }}>
            → {outputTarget}.{(data.outputVarName as string) || '?'}
          </div>
        )}

        {children}

        {/* Shared output target drawer */}
        <NodeDrawer id={id} data={data} label="Output settings" color={color} defaultOpen={false}>
          <div style={{ fontSize: 8, color: '#3a3a50', marginBottom: 4, lineHeight: 1.5 }}>
            Where should this node store its result?
            Use local/global to keep cStream unchanged for downstream nodes.
          </div>
        </NodeDrawer>
      </BaseNode>
    </>
  );
};

// ── VariableStoreRow type ─────────────────────────────────────────────────────
export interface StoreRow {
  action:     'set' | 'get' | 'clear';
  scope:      'global' | 'local';
  varName:    string;
  sourcePath: string;
  targetPath: string;
}

const defaultRow = (): StoreRow => ({
  action: 'set', scope: 'global', varName: '', sourcePath: '', targetPath: '',
});

// ── VariableStoreNode ─────────────────────────────────────────────────────────
export const VariableStoreNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const rows: StoreRow[] = (data.rows as StoreRow[]) ?? [defaultRow()];
  const update = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);

  const setRows = (next: StoreRow[]) => update({ rows: next });
  const addRow    = () => setRows([...rows, defaultRow()]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const patchRow  = (i: number, patch: Partial<StoreRow>) =>
    setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  return (
    <NodeShell id={id} data={data} selected={selected as boolean}
      color="#0891b2" icon="VS" title="Variable Store"
      minWidth={420} minHeight={120}>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <div style={styles.tableHeader}>
          <div style={{ ...styles.col, flex: '0 0 70px' }}>Action</div>
          <div style={{ ...styles.col, flex: '0 0 62px' }}>Scope</div>
          <div style={{ ...styles.col, flex: 1 }}>Variable</div>
          <div style={{ ...styles.col, flex: 1 }}>Src / Tgt path</div>
          <div style={{ width: 18 }} />
        </div>

        {rows.map((row, i) => (
          <div key={i} style={styles.tableRow}>
            <select value={row.action} onChange={e => patchRow(i, { action: e.target.value as StoreRow['action'] })}
              style={{ ...styles.cell, flex: '0 0 70px' }}>
              <option value="set">Set</option>
              <option value="get">Get</option>
              <option value="clear">Clear</option>
            </select>
            <select value={row.scope} onChange={e => patchRow(i, { scope: e.target.value as StoreRow['scope'] })}
              style={{ ...styles.cell, flex: '0 0 62px' }}>
              <option value="global">Global</option>
              <option value="local">Local</option>
            </select>
            <input value={row.varName} placeholder="varName"
              onChange={e => patchRow(i, { varName: e.target.value })}
              style={{ ...styles.cell, flex: 1 }} />
            {row.action === 'set' ? (
              <input value={row.sourcePath} placeholder="src path (empty=all)"
                onChange={e => patchRow(i, { sourcePath: e.target.value })}
                style={{ ...styles.cell, flex: 1 }}
                title="Dot-path within cStream.message to read from. Leave empty to capture entire message." />
            ) : row.action === 'get' ? (
              <input value={row.targetPath} placeholder="inject at path (empty=replace)"
                onChange={e => patchRow(i, { targetPath: e.target.value })}
                style={{ ...styles.cell, flex: 1 }} />
            ) : (
              <div style={{ ...styles.cell, flex: 1, color: '#3a3a50', fontStyle: 'italic' }}>—</div>
            )}
            <button onClick={() => removeRow(i)}
              style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 13, cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>×</button>
          </div>
        ))}

        <button onClick={addRow} style={styles.addBtn}>+ Add store operation</button>
        <div style={{ fontSize: 9, color: '#3a3a50', marginTop: 4, lineHeight: 1.6, padding: '0 2px' }}>
          Paths apply to <code style={{ fontFamily: 'monospace', color: '#4f8ef7' }}>cStream.message</code> — use dot-notation e.g. <code style={{ fontFamily: 'monospace', color: '#4f8ef7' }}>invoice.total</code>
        </div>
      </div>
    </NodeShell>
  );
};

// ── FIFNode ───────────────────────────────────────────────────────────────────
export const FIFNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const selectedFloId  = (data.selectedFloId  as string)   ?? '';
  const availableFlos  = (data.availableFlos  as { id: string; name: string }[]) ?? [];
  const disabledFloIds = (data.disabledFloIds as string[]) ?? [];
  const update = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);

  return (
    <NodeShell id={id} data={data} selected={selected as boolean}
      color="#7e22ce" icon="FiF" title="Flow in Flow" minWidth={220} minHeight={90}>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <NodeField label="Sub-Flow to Execute">
          <NodeSelect value={selectedFloId} onChange={e => update({ selectedFloId: e.target.value })}>
            <option value="">— Select a flow —</option>
            {availableFlos.map(f => (
              <option key={f.id} value={f.id} disabled={disabledFloIds.includes(f.id)}>
                {disabledFloIds.includes(f.id) ? `⚠ ${f.name} (recursive)` : f.name}
              </option>
            ))}
          </NodeSelect>
        </NodeField>
        <div style={{ fontSize: 9, color: '#3a3a50', marginTop: 4, lineHeight: 1.5 }}>
          cStream passes into sub-flow and is replaced by its output.<br />
          Global store is shared. Local store is isolated.
        </div>
        {!selectedFloId && (
          <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 4 }}>
            ⚠ No flow selected — this node will be skipped at runtime.
          </div>
        )}
      </div>
    </NodeShell>
  );
};

// ── FunctionNode ──────────────────────────────────────────────────────────────
const FUNCTION_PLACEHOLDER = `// Available: cStream, global, local
// cStream is the canonical envelope — use cStream.message for the payload.
// Return a value to replace/merge into cStream.message.
return {
  processed: cStream.message?.value * 2,
};`;

export const FunctionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const code       = (data.code       as string) ?? FUNCTION_PLACEHOLDER;
  const outputMode = (data.outputMode as string) ?? 'overwrite';
  const targetPath = (data.targetPath as string) ?? '';
  const update = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);

  return (
    <NodeShell id={id} data={data} selected={selected as boolean}
      color="#b45309" icon="fn" title="Function" minWidth={240} minHeight={160}>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 6, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <NodeField label="Output Mode">
              <NodeSelect value={outputMode} onChange={e => update({ outputMode: e.target.value })}>
                <option value="overwrite">Overwrite cStream.message</option>
                <option value="append">Append at path</option>
              </NodeSelect>
            </NodeField>
          </div>
          {outputMode === 'append' && (
            <div style={{ flex: 1 }}>
              <NodeField label="Target Path">
                <NodeInput placeholder="e.g. result.out" value={targetPath}
                  onChange={e => update({ targetPath: e.target.value })} />
              </NodeField>
            </div>
          )}
        </div>

        <NodeField label="Code Snippet">
          <textarea value={code} onChange={e => update({ code: e.target.value })} spellCheck={false}
            style={{
              width: '100%', flex: 1, minHeight: 80,
              background: '#0a0c12', border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 4, color: '#22c55e', fontSize: 9, fontFamily: 'monospace',
              padding: '5px 7px', resize: 'none', outline: 'none', boxSizing: 'border-box',
            }} />
        </NodeField>

        <div style={{ fontSize: 9, color: '#3a3a50' }}>Runs server-side in a sandboxed context.</div>
      </div>
    </NodeShell>
  );
};

// ── Local styles ──────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  tableHeader: {
    display: 'flex', gap: 4, padding: '0 2px 4px',
    borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 4,
  },
  col: {
    fontSize: 8, color: '#45455a', textTransform: 'uppercase',
    letterSpacing: '0.4px', fontWeight: 600,
  },
  tableRow: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 },
  cell: {
    padding: '3px 5px', borderRadius: 4,
    border: '0.5px solid rgba(255,255,255,0.08)',
    background: '#0f1117', color: '#c0c0cc',
    fontSize: 9, fontFamily: 'inherit', outline: 'none', minWidth: 0,
  },
  addBtn: {
    marginTop: 4, width: '100%', padding: '4px 0', borderRadius: 4,
    border: '0.5px dashed rgba(8,145,178,0.4)', background: 'rgba(8,145,178,0.06)',
    color: '#0891b2', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit',
  },
};
