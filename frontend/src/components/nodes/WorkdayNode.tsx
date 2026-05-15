// nodes/WorkdayNode.tsx
import React from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import { httpsCallable } from 'firebase/functions';
import { BaseNode, NodeField, NodeInput, NodeSelect, NodeButton, NodeResult } from './BaseNode';
import { NodeDrawer } from './NodeDrawer';

const ACTION_TYPES = ['Get_Suppliers','Get_Customers','Get_Sales_Items','Get_Supplier_Invoices','Get_Workers'];

export const WorkdayNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const refId      = (data.refId      as string)  ?? '';
  const refIdType  = (data.refIdType  as string)  ?? '';
  const actionType = (data.actionType as string)  ?? 'Get_Workers';
  const result     = (data._result    as string)  ?? '';
  const isError    = (data._isError   as boolean) ?? false;
  const loading    = (data._loading   as boolean) ?? false;
  const outputTarget = (data.outputTarget as string) || 'cStream';
  const update = (p: Record<string, unknown>) => (data.onUpdate as any)?.(id, p);

  const handleExecute = async () => {
    if (!data.functions) { update({ _result: 'No functions context', _isError: true }); return; }
    update({ _loading: true, _result: 'Calling Workday…', _isError: false });
    try {
      const fn = httpsCallable<
        { refId: string; refIdType: string; actionType: string; hubId: string; tenantId: string },
        { success: boolean; data: { message: string } }
      >(data.functions as any, 'executeWorkdayAction');
      const res = await fn({ refId, refIdType, actionType, hubId: data.hubId as string, tenantId: data.tenantId as string });
      update({ _loading: false, _result: `✓ ${res.data?.data?.message ?? 'Success'}`, _isError: false });
    } catch (err: any) {
      update({ _loading: false, _result: err.message, _isError: true });
    }
  };

  const onDelete = (e: React.MouseEvent) => { e.stopPropagation(); (data.onDelete as any)?.(id); };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <NodeResizer isVisible={selected as boolean} minWidth={200} minHeight={120}
        handleStyle={{ background: '#f5a623', border: '2px solid #0f1117', width: 10, height: 10, borderRadius: 3 }}
        lineStyle={{ borderColor: 'rgba(245,166,35,0.35)' }}
      />
      {selected && (
        <button onClick={onDelete} title="Delete node" style={{
          position: 'absolute', top: -10, right: -10, width: 20, height: 20, borderRadius: '50%',
          background: '#f87171', border: '2px solid #0f1117', color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, lineHeight: 1, padding: 0,
        }}>×</button>
      )}
      <BaseNode selected={!!selected} color="#f5a623" icon="W" title="Workday"
        status={loading ? 'running' : isError ? 'error' : result ? 'ok' : 'idle'}>

        {/* Output target badge in header area */}
        {outputTarget !== 'cStream' && (
          <div style={{ fontSize: 8, color: '#39ff14', background: 'rgba(57,255,20,0.07)', border: '0.5px solid rgba(57,255,20,0.2)', borderRadius: 3, padding: '1px 5px', alignSelf: 'flex-start', marginBottom: 4 }}>
            → {outputTarget}.{(data.outputVarName as string) || '?'}
          </div>
        )}

        <NodeField label="Reference ID">
          <NodeInput placeholder="e.g. S-00481" value={refId} onChange={e => update({ refId: e.target.value })} />
        </NodeField>
        <NodeField label="Reference ID Type">
          <NodeInput placeholder="e.g. Supplier_ID" value={refIdType} onChange={e => update({ refIdType: e.target.value })} />
        </NodeField>
        <NodeField label="Action">
          <NodeSelect value={actionType} onChange={e => update({ actionType: e.target.value })}>
            {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </NodeSelect>
        </NodeField>
        <NodeButton onClick={handleExecute} disabled={loading || !refId}>
          {loading ? 'Running…' : 'Run engine'}
        </NodeButton>
        {result && <NodeResult text={result} isError={isError} />}

        {/* Settings drawer */}
        <NodeDrawer id={id} data={data as Record<string, unknown>} label="Output settings" color="#f5a623" defaultOpen={false}>
          <div style={{ fontSize: 8, color: '#3a3a50', marginBottom: 4, lineHeight: 1.5 }}>
            Store the Workday response in cStream (default) or save to a variable
            so cStream is not overwritten.
          </div>
        </NodeDrawer>
      </BaseNode>
    </div>
  );
};
