import React from 'react';
import type { Node } from '@xyflow/react';
import { useTheme } from '../theme/ThemeContext';
import { Btn } from './ui';

export const InspectorHeader: React.FC<{ node: Node }> = ({ node }) => {
  const t = useTheme();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary, marginBottom: 2 }}>
        {(node.data.label as string) ?? node.type}
      </div>
      <div style={{ fontSize: 9, color: t.textDim, fontFamily: 'monospace' }}>{node.id}</div>
    </div>
  );
};

export const InspectorFooter: React.FC<{ position: { x: number; y: number } }> = ({ position }) => {
  const t = useTheme();
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${t.panelBorder}` }}>
      <div style={{ fontSize: 9, color: t.textDim, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
        Position
      </div>
      <div style={{ fontSize: 9, color: t.textMuted, fontFamily: 'monospace' }}>
        x: {Math.round(position.x)} · y: {Math.round(position.y)}
      </div>
    </div>
  );
};

export const NodeTestPanel: React.FC<{
  nodeId:        string;
  testingNodeId: string | null;
  onTest:        () => void;
  canTest?:      boolean;
  result?:       string;
  isError?:      boolean;
  loading?:      boolean;
}> = ({ nodeId, testingNodeId, onTest, canTest = true, result, isError, loading }) => {
  const t = useTheme();
  const busy = testingNodeId === nodeId || loading;

  if (!canTest && !result) return null;

  return (
    <div style={{
      marginTop: 12, paddingTop: 12,
      borderTop: `0.5px solid ${t.panelBorder}`,
    }}>
      {canTest && (
        <Btn fullWidth disabled={busy} onClick={onTest}>
          {busy ? 'Running…' : '▶ Test node'}
        </Btn>
      )}
      {result && (
        <pre style={{
          marginTop: 8, marginBottom: 0, padding: '6px 8px', borderRadius: 5,
          background: t.codeBg, border: `0.5px solid ${t.border}`,
          fontSize: 9, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          color: isError ? t.danger : t.success, maxHeight: 120, overflowY: 'auto',
        }}>{result}</pre>
      )}
    </div>
  );
};
