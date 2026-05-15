/**
 * ConnectorNodes.tsx
 * - NodeShell: width/height 100% so content fills resized frame
 * - Handles: Left (target) / Right (source) for horizontal flow
 * - All nodes fully controlled via node.data + onUpdate
 */

import React from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import { httpsCallable } from 'firebase/functions';
import { BaseNode, NodeField, NodeInput, NodeSelect, NodeButton, NodeResult } from './BaseNode';

// ── NodeShell ─────────────────────────────────────────────────────────────────
interface ShellProps {
  id: string; data: Record<string, unknown>; selected: boolean;
  color: string; icon: string; title: string;
  status?: 'idle' | 'running' | 'ok' | 'error';
  hasTarget?: boolean; hasSource?: boolean; children: React.ReactNode;
}

const NodeShell: React.FC<ShellProps> = ({
  id, data, selected, color, icon, title, status = 'idle',
  hasTarget = true, hasSource = true, children,
}) => {
  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    (data.onDelete as any)?.(id);
  };
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <NodeResizer
        isVisible={selected} minWidth={180} minHeight={80}
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
      <BaseNode selected={selected} color={color} icon={icon} title={title}
        status={status} hasTarget={hasTarget} hasSource={hasSource}>
        {children}
      </BaseNode>
    </div>
  );
};

// ── SalesforceNode ─────────────────────────────────────────────────────────────
const SF_OBJECTS    = ['Contact', 'Account', 'Opportunity', 'Lead', 'Case'];
const SF_OPERATIONS = ['Query', 'Upsert', 'Insert', 'Update', 'Delete'];

export const SalesforceNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const sfObject  = (data.sfObject  as string)  ?? 'Contact';
  const operation = (data.operation as string)  ?? 'Query';
  const filter    = (data.filter    as string)  ?? '';
  const result    = (data._result   as string)  ?? '';
  const isError   = (data._isError  as boolean) ?? false;
  const loading   = (data._loading  as boolean) ?? false;
  const update = (p: Record<string, unknown>) => (data.onUpdate as any)?.(id, p);

  const handleExecute = async () => {
    if (!data.functions) return;
    update({ _loading: true, _result: 'Calling Salesforce…', _isError: false });
    try {
      const fn = httpsCallable(data.functions as any, 'executeSalesforceAction');
      const res: any = await fn({ sfObject, operation, filter, hubId: data.hubId, tenantId: data.tenantId });
      update({ _loading: false, _result: `✓ ${res.data?.message ?? 'Done'}`, _isError: false });
    } catch (err: any) { update({ _loading: false, _result: err.message, _isError: true }); }
  };

  return (
    <NodeShell id={id} data={data} selected={selected as boolean} color="#00a1e0" icon="SF" title="Salesforce"
      status={loading ? 'running' : isError ? 'error' : result ? 'ok' : 'idle'}>
      <NodeField label="Object">
        <NodeSelect value={sfObject} onChange={e => update({ sfObject: e.target.value })}>
          {SF_OBJECTS.map(o => <option key={o}>{o}</option>)}
        </NodeSelect>
      </NodeField>
      <NodeField label="Operation">
        <NodeSelect value={operation} onChange={e => update({ operation: e.target.value })}>
          {SF_OPERATIONS.map(o => <option key={o}>{o}</option>)}
        </NodeSelect>
      </NodeField>
      <NodeField label="SOQL filter / payload">
        <NodeInput placeholder="e.g. Email='a@b.com'" value={filter} onChange={e => update({ filter: e.target.value })} />
      </NodeField>
      <NodeButton onClick={handleExecute} disabled={loading}>{loading ? 'Running…' : 'Execute'}</NodeButton>
      {result && <NodeResult text={result} isError={isError} />}
    </NodeShell>
  );
};

// ── SapNode ────────────────────────────────────────────────────────────────────
const SAP_MODULES = ['FI', 'MM', 'HR', 'SD', 'PP'];
const SAP_ACTIONS = ['READ_BAPI', 'POST_DOCUMENT', 'GET_TABLE'];

export const SapNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const sapModule = (data.sapModule as string)  ?? 'FI';
  const action    = (data.action    as string)  ?? 'READ_BAPI';
  const bapi      = (data.bapi      as string)  ?? '';
  const result    = (data._result   as string)  ?? '';
  const isError   = (data._isError  as boolean) ?? false;
  const loading   = (data._loading  as boolean) ?? false;
  const update = (p: Record<string, unknown>) => (data.onUpdate as any)?.(id, p);

  const run = async () => {
    if (!data.functions) return;
    update({ _loading: true, _result: 'Calling SAP…', _isError: false });
    try {
      const fn = httpsCallable(data.functions as any, 'executeSapAction');
      const res: any = await fn({ sapModule, action, bapi, hubId: data.hubId, tenantId: data.tenantId });
      update({ _loading: false, _result: `✓ ${res.data?.message ?? 'Done'}`, _isError: false });
    } catch (err: any) { update({ _loading: false, _result: err.message, _isError: true }); }
  };

  return (
    <NodeShell id={id} data={data} selected={selected as boolean} color="#0052cc" icon="S" title="SAP S/4HANA"
      status={loading ? 'running' : isError ? 'error' : result ? 'ok' : 'idle'}>
      <NodeField label="Module">
        <NodeSelect value={sapModule} onChange={e => update({ sapModule: e.target.value })}>
          {SAP_MODULES.map(m => <option key={m}>{m}</option>)}
        </NodeSelect>
      </NodeField>
      <NodeField label="Action">
        <NodeSelect value={action} onChange={e => update({ action: e.target.value })}>
          {SAP_ACTIONS.map(a => <option key={a}>{a}</option>)}
        </NodeSelect>
      </NodeField>
      <NodeField label="BAPI / Table">
        <NodeInput placeholder="e.g. BAPI_EMPLOYEE_GET" value={bapi} onChange={e => update({ bapi: e.target.value })} />
      </NodeField>
      <NodeButton onClick={run} disabled={loading}>{loading ? 'Running…' : 'Execute'}</NodeButton>
      {result && <NodeResult text={result} isError={isError} />}
    </NodeShell>
  );
};

// ── OracleNode ─────────────────────────────────────────────────────────────────
const ORACLE_ACTIONS = ['QUERY', 'INSERT', 'UPDATE', 'CALL_PROC'];

export const OracleNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const action    = (data.action    as string)  ?? 'QUERY';
  const sqlOrProc = (data.sqlOrProc as string)  ?? '';
  const result    = (data._result   as string)  ?? '';
  const isError   = (data._isError  as boolean) ?? false;
  const loading   = (data._loading  as boolean) ?? false;
  const update = (p: Record<string, unknown>) => (data.onUpdate as any)?.(id, p);

  const run = async () => {
    if (!data.functions) return;
    update({ _loading: true, _result: 'Calling Oracle EBS…', _isError: false });
    try {
      const fn = httpsCallable(data.functions as any, 'executeOracleAction');
      const res: any = await fn({ action, sqlOrProc, hubId: data.hubId, tenantId: data.tenantId });
      update({ _loading: false, _result: `✓ ${res.data?.message ?? 'Done'}`, _isError: false });
    } catch (err: any) { update({ _loading: false, _result: err.message, _isError: true }); }
  };

  return (
    <NodeShell id={id} data={data} selected={selected as boolean} color="#e07b39" icon="O" title="Oracle EBS"
      status={loading ? 'running' : isError ? 'error' : result ? 'ok' : 'idle'}>
      <NodeField label="Action">
        <NodeSelect value={action} onChange={e => update({ action: e.target.value })}>
          {ORACLE_ACTIONS.map(a => <option key={a}>{a}</option>)}
        </NodeSelect>
      </NodeField>
      <NodeField label="SQL / Procedure">
        <NodeInput placeholder="SELECT * FROM …" value={sqlOrProc} onChange={e => update({ sqlOrProc: e.target.value })} />
      </NodeField>
      <NodeButton onClick={run} disabled={loading}>{loading ? 'Running…' : 'Execute'}</NodeButton>
      {result && <NodeResult text={result} isError={isError} />}
    </NodeShell>
  );
};

// ── MapperNode ─────────────────────────────────────────────────────────────────
const TRANSFORMS = ['', 'Upper', 'Lower', 'Trim', 'Round', 'JSON', 'String'];

export const MapperNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const rawMappings = (data.mappings as string[]) ?? [];
  const mapMode     = (data.mapMode  as string)  ?? 'pure';

  const pairs = rawMappings.map(m => {
    const [mappingPart = '', tgt = ''] = m.split('→').map(s => s.trim());
    const [src = '', transform = '']   = mappingPart.split('|').map(s => s.trim());
    return { src, transform, tgt };
  });

  const commit = (next: { src: string; transform: string; tgt: string }[]) =>
    (data.onUpdate as any)?.(id, {
      mappings: next.map(p => `${p.src}${p.transform ? ` | ${p.transform}` : ''} → ${p.tgt}`)
    });

  const updatePair = (i: number, field: 'src' | 'transform' | 'tgt', val: string) =>
    commit(pairs.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addRow    = () => commit([...pairs, { src: '', transform: '', tgt: '' }]);
  const removeRow = (i: number) => commit(pairs.filter((_, idx) => idx !== i));

  return (
    <NodeShell id={id} data={data} selected={selected as boolean} color="#7c3aed" icon="M" title="Field Mapper" status="idle">
      <NodeField label="Mode">
        <NodeSelect value={mapMode} onChange={e => (data.onUpdate as any)?.(id, { mapMode: e.target.value })}>
          <option value="pure">Pure — output only mapped fields</option>
          <option value="transform">Transform — keep unmapped fields</option>
        </NodeSelect>
      </NodeField>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr 14px', gap: 3, marginBottom: 3 }}>
        {['Source', 'Transform', 'Target', ''].map((h, i) => (
          <div key={i} style={{ fontSize: 8, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</div>
        ))}
      </div>

      {pairs.length === 0 && (
        <div style={{ fontSize: 9, color: '#3a3a50', fontStyle: 'italic', marginBottom: 4 }}>No mappings — click + to add</div>
      )}

      {pairs.map((pair, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr 14px', gap: 3, marginBottom: 4, alignItems: 'center' }}>
          <NodeInput value={pair.src} placeholder="source" onChange={e => updatePair(i, 'src', e.target.value)} style={{ minWidth: 0 }} />
          <select value={pair.transform} onChange={e => updatePair(i, 'transform', e.target.value)}
            style={{ padding: '3px 3px', borderRadius: 3, border: '0.5px solid rgba(255,255,255,0.08)', background: '#0f1117', color: '#c0c0cc', fontSize: 8, fontFamily: 'inherit', outline: 'none', width: '100%' }}>
            {TRANSFORMS.map(t => <option key={t.toLowerCase()} value={t}>{t || 'None'}</option>)}
          </select>
          <NodeInput value={pair.tgt} placeholder="target" onChange={e => updatePair(i, 'tgt', e.target.value)} style={{ minWidth: 0 }} />
          <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
        </div>
      ))}

      <button onClick={addRow} style={{
        width: '100%', padding: '3px 0', borderRadius: 4,
        border: '0.5px dashed rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.06)',
        color: '#7c3aed', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2,
      }}>+ Add mapping</button>
    </NodeShell>
  );
};

// ── FilterNode ─────────────────────────────────────────────────────────────────
const OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith'];

export const FilterNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const field    = (data.field    as string) ?? '';
  const operator = (data.operator as string) ?? '==';
  const value    = (data.value    as string) ?? '';
  const onSkip   = (data.onSkip   as string) ?? 'stop';
  const update   = (p: Record<string, unknown>) => (data.onUpdate as any)?.(id, p);

  return (
    <NodeShell id={id} data={data} selected={selected as boolean} color="#0f766e" icon="F" title="Filter" status="idle">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr', gap: 4, marginBottom: 6 }}>
        <NodeInput placeholder="field path" value={field} onChange={e => update({ field: e.target.value })} />
        <NodeSelect value={operator} onChange={e => update({ operator: e.target.value })} style={{ padding: '4px 2px' }}>
          {OPERATORS.map(o => <option key={o}>{o}</option>)}
        </NodeSelect>
        <NodeInput placeholder="value" value={value} onChange={e => update({ value: e.target.value })} />
      </div>
      <NodeField label="If condition fails">
        <NodeSelect value={onSkip} onChange={e => update({ onSkip: e.target.value })}>
          <option value="stop">Stop flow</option>
          <option value="continue">Continue with empty payload</option>
        </NodeSelect>
      </NodeField>
      <div style={{ fontSize: 9, color: '#3a3a50' }}>
        {field || 'field'} {operator} {value || '…'} → {onSkip === 'stop' ? 'kill on fail' : 'pass empty on fail'}
      </div>
    </NodeShell>
  );
};
