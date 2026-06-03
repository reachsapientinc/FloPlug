import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { nodeDisplayTitle } from '@floplug/shared';
import { FlowNodeShell, nodeDeleteHandler, nodeDimensions } from './FlowNodeShell';
import { ErrorSourceHandle } from './CompactNode';

const SUB_COLOR = '#0d9488';
const INVOKE_COLOR = '#2563eb';
const RETURN_COLOR = '#14b8a6';

export const SubFloNode: React.FC<NodeProps> = ({ id, data, selected, width, height, measured }) => {
  const d = data as Record<string, unknown>;
  const title = nodeDisplayTitle(d, 'SubFlo');
  const inN = ((d.inputArgs as unknown[]) ?? []).length;
  const outN = ((d.returnArgs as unknown[]) ?? []).length;
  const dims = nodeDimensions({ width, height, measured }, { width: 188, height: 64 });

  return (
    <FlowNodeShell
      selected={!!selected}
      color={SUB_COLOR}
      width={dims.width}
      height={dims.height}
      onDelete={nodeDeleteHandler(d, id)}
      extras={
        <Handle type="source" position={Position.Right} style={{
          width: 10, height: 10, background: SUB_COLOR, border: '2px solid #0f1117', borderRadius: '50%',
        }} />
      }
    >
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#f0f0f4' }}>{title}</div>
        <div style={{ fontSize: 8, color: '#9090a8', marginTop: 4 }}>{inN} in · {outN} out</div>
        {d.description && (
          <div style={{ fontSize: 7, color: '#9090a8', marginTop: 3 }} title={String(d.description)}>
            {String(d.description).slice(0, 48)}{String(d.description).length > 48 ? '…' : ''}
          </div>
        )}
      </div>
    </FlowNodeShell>
  );
};

export const SubFloReturnNode: React.FC<NodeProps> = ({ id, data, selected, width, height, measured }) => {
  const d = data as Record<string, unknown>;
  const dims = nodeDimensions({ width, height, measured });

  return (
    <FlowNodeShell
      selected={!!selected}
      color={RETURN_COLOR}
      width={dims.width}
      height={dims.height}
      onDelete={nodeDeleteHandler(d, id)}
      extras={
        <Handle type="target" position={Position.Left} style={{
          width: 10, height: 10, background: RETURN_COLOR, border: '2px solid #0f1117', borderRadius: '50%',
        }} />
      }
    >
      <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#5eead4' }}>
        SubFlo Return
      </div>
    </FlowNodeShell>
  );
};

export const InvokeSubFloNode: React.FC<NodeProps> = ({ id, data, selected, width, height, measured }) => {
  const d = data as Record<string, unknown>;
  const target = String(d.targetSubFloId ?? '');
  const showError = !!d._showErrorHandle;
  const dims = nodeDimensions({ width, height, measured });

  return (
    <FlowNodeShell
      selected={!!selected}
      color={INVOKE_COLOR}
      width={dims.width}
      height={dims.height}
      onDelete={nodeDeleteHandler(d, id)}
      extras={
        <>
          <Handle type="target" position={Position.Left} style={{
            width: 10, height: 10, background: INVOKE_COLOR, border: '2px solid #0f1117', borderRadius: '50%',
          }} />
          <Handle type="source" position={Position.Right} style={{
            width: 10, height: 10, background: INVOKE_COLOR, border: '2px solid #0f1117', borderRadius: '50%',
            ...(showError ? { top: '38%' } : {}),
          }} />
          {showError && <ErrorSourceHandle top="72%" />}
        </>
      }
    >
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#f0f0f4' }}>
          {nodeDisplayTitle(d, 'Invoke SubFlo')}
        </div>
        <div style={{ fontSize: 8, color: '#9090a8', marginTop: 4 }}>
          {target ? `→ ${target.slice(0, 14)}…` : 'No SubFlo selected'}
        </div>
      </div>
    </FlowNodeShell>
  );
};
