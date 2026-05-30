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
  /** When set, shows test payload editor above the run button */
  testInputJson?: string;
  onTestInputChange?: (json: string) => void;
  testInputHint?: string;
}> = ({
  nodeId, testingNodeId, onTest, canTest = true, result, isError, loading,
  testInputJson, onTestInputChange, testInputHint,
}) => {
  const t = useTheme();
  const busy = testingNodeId === nodeId || loading;

  if (!canTest && !result) return null;

  return (
    <div style={{
      marginTop: 12, paddingTop: 12,
      borderTop: `0.5px solid ${t.panelBorder}`,
    }}>
      {canTest && onTestInputChange && testInputJson !== undefined && (
        <div style={{ marginBottom: 10 }}>
          {/* Lazy import avoided — parent passes NodeTestInput via withOutput */}
          <label style={{ display: 'block', fontSize: 10, color: t.textMuted, marginBottom: 4 }}>
            Test input (JSON → cStream)
          </label>
          <textarea
            rows={5}
            value={testInputJson}
            onChange={e => onTestInputChange(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 5,
              color: t.inputText, background: t.codeBg, border: `0.5px solid ${t.border}`,
              fontFamily: 'monospace', fontSize: 9, resize: 'vertical',
            }}
          />
          <div style={{ fontSize: 9, color: t.textDim, marginTop: 4, lineHeight: 1.45 }}>
            {testInputHint ?? 'Simulated only — no outbound HTTP/email. Does not write to Execution Hub.'}
          </div>
        </div>
      )}
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
          color: isError ? t.danger : t.success, maxHeight: 160, overflowY: 'auto',
        }}>{result}</pre>
      )}
    </div>
  );
};
