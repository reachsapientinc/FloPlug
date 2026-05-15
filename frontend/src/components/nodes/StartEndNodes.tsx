/**
 * StartEndNodes.tsx — horizontal flow (Right source, Left target)
 * Start: Right handle only. End: Left handle only.
 * Both support resize. Delete button disabled (greyed out) since they're protected.
 */
import React from 'react';
import { Handle, Position, type NodeProps, NodeResizer } from '@xyflow/react';
import { NodeInput, NodeButton } from './BaseNode';

// ── StartNode ──────────────────────────────────────────────────────────────────
export const StartNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const initVars = (data.initVars as { key: string; value: string }[]) ?? [];
  const update   = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);

  const updateVar = (i: number, field: 'key' | 'value', val: string) =>
    update({ initVars: initVars.map((v, idx) => idx === i ? { ...v, [field]: val } : v) });
  const addVar    = () => update({ initVars: [...initVars, { key: '', value: '' }] });
  const removeVar = (i: number) => update({ initVars: initVars.filter((_, idx) => idx !== i) });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <NodeResizer isVisible={!!selected} minWidth={140} minHeight={60}
        handleStyle={{ background: '#22c55e', border: '2px solid #181b24', width: 9, height: 9, borderRadius: 3 }}
        lineStyle={{ borderColor: 'rgba(34,197,94,0.4)' }}
      />
      <div style={{
        background: '#181b24', border: `1.5px solid ${selected ? '#22c55e' : 'rgba(34,197,94,0.4)'}`,
        boxShadow: selected ? '0 0 0 2px rgba(34,197,94,0.25)' : 'none',
        borderRadius: 10, padding: '10px 14px', width: '100%', boxSizing: 'border-box',
        fontFamily: "'Inter',-apple-system,sans-serif",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', color: '#22c55e' }}>START</span>
        </div>
        <div style={{ fontSize: 10, color: '#3a3a50', marginBottom: initVars.length ? 8 : 0 }}>Input JSON flos from here</div>

        {initVars.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 8, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Init Global Variables</div>
            {initVars.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 8px 1fr 14px', gap: 3, marginBottom: 3, alignItems: 'center' }}>
                <NodeInput value={v.key} placeholder="key" onChange={e => updateVar(i, 'key', e.target.value)} style={{ fontSize: 9 }} />
                <span style={{ color: '#45455a', fontSize: 9, textAlign: 'center' }}>=</span>
                <NodeInput value={v.value} placeholder="value" onChange={e => updateVar(i, 'value', e.target.value)} style={{ fontSize: 9 }} />
                <button onClick={() => removeVar(i)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <NodeButton variant="ghost" onClick={addVar} style={{ fontSize: 9, padding: '3px 6px', borderColor: 'rgba(34,197,94,0.3)', color: '#22c55e' }}>
          + Init variable
        </NodeButton>
      </div>
      <Handle type="source" position={Position.Right}
        style={{ width: 10, height: 10, background: '#22c55e', border: '2px solid #181b24', borderRadius: '50%' }} />
    </div>
  );
};

// ── EndNode ────────────────────────────────────────────────────────────────────
export const EndNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const output       = data.output as string | undefined;
  const outputParams = (data.outputParams as string[]) ?? [];
  const update       = (patch: Record<string, unknown>) => (data.onUpdate as any)?.(id, patch);

  const updateParam = (i: number, val: string) =>
    update({ outputParams: outputParams.map((p, idx) => idx === i ? val : p) });
  const addParam    = () => update({ outputParams: [...outputParams, ''] });
  const removeParam = (i: number) => update({ outputParams: outputParams.filter((_, idx) => idx !== i) });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <NodeResizer isVisible={!!selected} minWidth={160} minHeight={60}
        handleStyle={{ background: '#f59e0b', border: '2px solid #181b24', width: 9, height: 9, borderRadius: 3 }}
        lineStyle={{ borderColor: 'rgba(245,158,11,0.4)' }}
      />
      <Handle type="target" position={Position.Left}
        style={{ width: 10, height: 10, background: '#f59e0b', border: '2px solid #181b24', borderRadius: '50%' }} />

      <div style={{
        background: '#181b24', border: `1.5px solid ${selected ? '#f59e0b' : 'rgba(245,158,11,0.4)'}`,
        boxShadow: selected ? '0 0 0 2px rgba(245,158,11,0.25)' : 'none',
        borderRadius: 10, padding: '10px 14px', width: '100%', boxSizing: 'border-box',
        fontFamily: "'Inter',-apple-system,sans-serif",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', color: '#f59e0b' }}>END</span>
        </div>
        <div style={{ fontSize: 10, color: '#3a3a50' }}>Output JSON captured here</div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 8, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>
            Output Params {outputParams.length === 0 && <span style={{ color: '#3a3a50', textTransform: 'none', fontWeight: 400 }}>(full cStream)</span>}
          </div>
          {outputParams.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 14px', gap: 3, marginBottom: 3, alignItems: 'center' }}>
              <NodeInput value={p} placeholder="e.g. invoice.total" onChange={e => updateParam(i, e.target.value)} style={{ fontSize: 9 }} />
              <button onClick={() => removeParam(i)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
            </div>
          ))}
          <NodeButton variant="ghost" onClick={addParam} style={{ fontSize: 9, padding: '3px 6px', marginTop: 2, borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }}>
            + Output param
          </NodeButton>
        </div>

        {output && (
          <div style={{ marginTop: 8, background: '#0a0c12', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 5, padding: '5px 7px', maxHeight: 100, overflowY: 'auto' }}>
            <pre style={{ margin: 0, fontSize: 9, color: '#22c55e', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{output}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
