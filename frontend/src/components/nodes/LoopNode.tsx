/**
 * Loop canvas node — loop path + exit path (FloSwitch-style handles).
 */
import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { LOOP_LOOP_HANDLE, LOOP_EXIT_HANDLE, nodeDisplayTitle } from '@floplug/shared';
import { deriveNodeStatus, outputTargetBadge, ErrorSourceHandle } from './CompactNode';
import { FlowNodeShell, nodeDeleteHandler, nodeDimensions } from './FlowNodeShell';

const COLOR = '#ea580c';

export const LoopNode: React.FC<NodeProps> = ({ id, data, selected, width, height, measured }) => {
  const d = data as Record<string, unknown>;
  const title = nodeDisplayTitle(d, 'Loop');
  const execOnce = d.executeAtLeastOnce !== false;
  const showError = !!d._showErrorHandle;
  const dims = nodeDimensions({ width, height, measured }, { width: 188, height: 72 });

  return (
    <FlowNodeShell
      selected={!!selected}
      color={COLOR}
      width={dims.width}
      height={dims.height}
      minWidth={160}
      minHeight={72}
      onDelete={nodeDeleteHandler(d, id)}
      extras={
        <>
          <Handle type="target" position={Position.Left} style={{
            width: 10, height: 10, background: COLOR, border: '2px solid #0f1117', borderRadius: '50%',
          }} />
          <Handle
            type="source"
            id={LOOP_LOOP_HANDLE}
            position={Position.Right}
            style={{ width: 10, height: 10, background: COLOR, border: '2px solid #0f1117', top: '38%' }}
            title="Loop execution path"
          />
          <Handle
            type="source"
            id={LOOP_EXIT_HANDLE}
            position={Position.Right}
            style={{ width: 10, height: 10, background: '#6b6b80', border: '2px solid #0f1117', top: showError ? '58%' : '72%' }}
            title="Loop exit path"
          />
          {showError && <ErrorSourceHandle top="82%" />}
        </>
      }
    >
      <div style={{ padding: '8px 10px', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: COLOR }}>↻</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#f0f0f4' }}>{title}</span>
        </div>
        <div style={{ fontSize: 8, color: '#9090a8', marginTop: 4 }}>
          {execOnce ? 'Do-while' : 'While'} · max {Number(d.maxIterations ?? 100)}
        </div>
        {outputTargetBadge(d) && (
          <div style={{ fontSize: 7, color: '#39ff14', marginTop: 4 }}>{outputTargetBadge(d)}</div>
        )}
        <div style={{ position: 'absolute', right: 14, top: '32%', fontSize: 7, color: COLOR, pointerEvents: 'none' }}>loop</div>
        <div style={{ position: 'absolute', right: 14, top: showError ? '54%' : '66%', fontSize: 7, color: '#9090a8', pointerEvents: 'none' }}>exit</div>
        {showError && (
          <div style={{ position: 'absolute', right: 14, top: '78%', fontSize: 7, color: '#ef4444', pointerEvents: 'none' }}>err</div>
        )}
      </div>
    </FlowNodeShell>
  );
};
