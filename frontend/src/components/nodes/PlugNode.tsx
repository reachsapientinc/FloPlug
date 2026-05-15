/**
 * PlugNode.tsx
 *
 * Canvas node for a configured Plug (HTTP, SMTP, etc.)
 * Settings drawer at the bottom shows output target configuration.
 * Email plugs (authProtocol=smtp_basic) show a brief config summary
 * since their full settings are in the right-panel EmailPlugInspector.
 */
import React from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react';
import type { PlugVariableBinding, PlugVariableHint } from '@floplug/shared';
import { NodeDrawer } from './NodeDrawer';

interface PlugNodeData {
  plugId:          string;
  plugName:        string;
  urlPattern:      string;
  connectorLabel:  string;
  authProtocol?:   string;
  nodeType?:       string;
  variableHints?:  PlugVariableHint[];
  urlVariables?:   Record<string, PlugVariableBinding>;
  emailBindings?:  Record<string, any>;
  outputTarget?:   string;
  outputVarName?:  string;
  onDelete?:       (id: string) => void;
  onUpdate?:       (id: string, patch: Record<string, unknown>) => void;
}

const PlugNode: React.FC<{ id: string; data: PlugNodeData; selected: boolean }> = ({ id, data, selected }) => {
  const isEmail   = data.authProtocol === 'smtp_basic' || data.nodeType === 'emailNode';
  const urlVars   = isEmail ? [] : [...((data.urlPattern ?? '').matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]);
  const filledCount = urlVars.filter(v => {
    const b = data.urlVariables?.[v];
    if (b?.value) return true;
    return data.variableHints?.find(h => h.name === v)?.defaultValue;
  }).length;
  const allFilled = isEmail || (filledCount === urlVars.length && urlVars.length > 0);

  const outputTarget = data.outputTarget || 'cStream';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onDelete?.(id);
  };

  // Email binding summary for canvas preview
  const emailTo = (data.emailBindings as any)?.to?.value ?? '';
  const emailSubject = (data.emailBindings as any)?.subject?.value ?? '';

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={80}
        handleStyle={{
          background: '#4f8ef7', border: '2px solid #0f1117',
          width: 10, height: 10, borderRadius: 3,
        }}
        lineStyle={{ borderColor: 'rgba(79,142,247,0.4)' }}
      />

      {selected && (
        <button onClick={handleDelete} title="Delete node" style={{
          position: 'absolute', top: -10, right: -10,
          width: 20, height: 20, borderRadius: '50%',
          background: '#f87171', border: '2px solid #0f1117',
          color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 10, lineHeight: 1, padding: 0,
        }}>×</button>
      )}

      <div style={{
        background: selected ? '#1e2130' : '#181b24',
        border: `1px solid ${selected ? '#4f8ef7' : isEmail ? 'rgba(245,158,11,0.5)' : 'rgba(79,142,247,0.4)'}`,
        borderRadius: 10, padding: '10px 14px',
        minWidth: 160, minHeight: 80,
        width: '100%', height: '100%',
        boxSizing: 'border-box' as const,
        fontFamily: "'Inter',-apple-system,sans-serif",
        display: 'flex', flexDirection: 'column' as const, gap: 5,
      }}>
        <Handle type="target" position={Position.Left} style={{
          width: 10, height: 10, background: '#4f8ef7',
          border: '2px solid #0f1117', borderRadius: '50%',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: isEmail ? 'rgba(245,158,11,0.15)' : 'rgba(79,142,247,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isEmail ? 14 : 10, fontWeight: 700,
            color: isEmail ? '#f59e0b' : '#4f8ef7',
          }}>
            {isEmail ? '✉' : (data.plugName?.slice(0, 2).toUpperCase() ?? 'PL')}
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

        {/* Email summary OR URL var status */}
        {isEmail ? (
          <div style={{ fontSize: 8, color: '#f59e0b', lineHeight: 1.5 }}>
            {emailTo
              ? <span>✉ {emailTo.slice(0, 28)}{emailTo.length > 28 ? '…' : ''}</span>
              : <span style={{ color: '#3a3a50' }}>⚠ To: not set — click to configure</span>
            }
            {emailSubject && (
              <div style={{ color: '#6b6b80' }}>
                Subj: {emailSubject.slice(0, 24)}{emailSubject.length > 24 ? '…' : ''}
              </div>
            )}
          </div>
        ) : urlVars.length > 0 ? (
          <div style={{
            fontSize: 9,
            color:      allFilled ? '#22c55e' : '#f59e0b',
            background: allFilled ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
            border:     `0.5px solid ${allFilled ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
            padding: '2px 7px', borderRadius: 4, alignSelf: 'flex-start' as const,
          }}>
            {allFilled ? `✓ ${filledCount}/${urlVars.length} vars ready` : `⚠ ${filledCount}/${urlVars.length} vars set`}
          </div>
        ) : null}

        {/* URL preview */}
        {!isEmail && data.urlPattern && (
          <div style={{ fontSize: 7.5, color: '#3a3a50', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.urlPattern}
          </div>
        )}

        {/* Output target badge */}
        {outputTarget !== 'cStream' && (
          <div style={{ fontSize: 8, color: '#39ff14', background: 'rgba(57,255,20,0.07)', border: '0.5px solid rgba(57,255,20,0.2)', borderRadius: 3, padding: '1px 5px', alignSelf: 'flex-start' as const }}>
            → {outputTarget}.{data.outputVarName || '?'}
          </div>
        )}

        {/* Settings drawer */}
        <NodeDrawer id={id} data={data as unknown as Record<string, unknown>} label="Output settings" color="#4f8ef7" defaultOpen={false}>
          {/* No extra fields here — output target is injected by NodeDrawer itself.
              Email-specific fields live in the right-panel EmailPlugInspector.
              URL variable bindings live in the right-panel PlugNodeInspector. */}
          <div style={{ fontSize: 8, color: '#3a3a50', lineHeight: 1.6, marginBottom: 4 }}>
            {isEmail
              ? 'Configure recipients and body in the right panel (select this node).'
              : 'Configure URL variables in the right panel (select this node).'
            }
          </div>
        </NodeDrawer>

        <Handle type="source" position={Position.Right} style={{
          width: 10, height: 10, background: '#4f8ef7',
          border: '2px solid #0f1117', borderRadius: '50%',
        }} />
      </div>
    </>
  );
};

export default PlugNode;
