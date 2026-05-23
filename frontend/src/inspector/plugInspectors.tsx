/** Plug + email inspectors (moved from NodePaletteAndInspector). */
import React, { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { PlugVariableHint, PlugVariableBinding, FloConnectionSafe } from '@floplug/shared';
import {
  extractUrlTemplateVarNames,
  isDeveloperPlugUrlVar,
} from '@floplug/shared';
import type { NodeInspectorProps } from './types';
import { Section, Field, Inp, Sel, Help } from './ui';
import { NodeTestPanel } from './InspectorChrome';
import { OutputTargetSection } from './OutputTargetSection';
import { PlugTestInput } from './PlugTestInput';
import { DEFAULT_PLUG_TEST_INPUT } from './plugTest';
import { useTheme } from '../theme/ThemeContext';

type SourceType = 'static' | 'cStream' | 'local' | 'global';
interface EmailFieldBinding {
  source: SourceType;
  value: string;
  asAttachment?: boolean;
  fileName?: string;
  contentType?: string;
}
type EmailBindings = Record<string, EmailFieldBinding>;

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'static', label: 'Static' }, { value: 'cStream', label: 'cStream' },
  { value: 'local', label: 'Local' }, { value: 'global', label: 'Global' },
];
const CONTENT_TYPES = [
  'text/plain', 'text/csv', 'text/html', 'text/xml', 'application/pdf',
  'application/json', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];
const EMAIL_FIELDS: { key: string; label: string; isList?: boolean }[] = [
  { key: 'to', label: 'To', isList: true }, { key: 'cc', label: 'CC', isList: true },
  { key: 'bcc', label: 'BCC', isList: true }, { key: 'subject', label: 'Subject' },
  { key: 'body', label: 'Body' },
];

const EmailFieldRow: React.FC<{
  fieldKey: string; label: string; isList?: boolean;
  binding: EmailFieldBinding; onChange: (p: Partial<EmailFieldBinding>) => void;
}> = ({ fieldKey, label, binding, onChange }) => {
  const t = useTheme();
  const isStatic = binding.source === 'static';
  return (
    <Section>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: t.accent, fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
        <Sel value={binding.source} onChange={e => onChange({ source: e.target.value as SourceType, asAttachment: false })} style={{ width: 80, fontSize: 9 }}>
          {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Sel>
      </div>
      {isStatic ? (
        <textarea
          value={binding.value}
          onChange={e => onChange({ value: e.target.value })}
          style={{
            width: '100%', minHeight: fieldKey === 'body' ? 90 : 32, padding: '5px 7px',
            borderRadius: 4, border: `0.5px solid ${t.border}`, background: t.inputBg,
            color: t.inputText, fontSize: 10, fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      ) : (
        <>
          <Inp value={binding.value} onChange={e => onChange({ value: e.target.value })} placeholder="variable path" />
          {fieldKey === 'body' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {[{ val: false, label: 'Inline' }, { val: true, label: 'Attachment' }].map(opt => (
                <button key={String(opt.val)} type="button" onClick={() => onChange({ asAttachment: opt.val })} style={{
                  flex: 1, padding: '4px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
                  border: `0.5px solid ${binding.asAttachment === opt.val ? t.accent : t.border}`,
                  background: binding.asAttachment === opt.val ? `${t.accent}22` : 'transparent',
                  color: binding.asAttachment === opt.val ? t.accent : t.textMuted,
                }}>{opt.label}</button>
              ))}
            </div>
          )}
          {fieldKey === 'body' && binding.asAttachment && (
            <>
              <Field label="File name"><Inp value={binding.fileName ?? ''} onChange={e => onChange({ fileName: e.target.value })} /></Field>
              <Field label="Content type">
                <Sel value={binding.contentType ?? ''} onChange={e => onChange({ contentType: e.target.value })}>
                  <option value="">— Select —</option>
                  {CONTENT_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                </Sel>
              </Field>
            </>
          )}
        </>
      )}
    </Section>
  );
};

export const PlugNodeInspectorPanel: React.FC<NodeInspectorProps> = ({ node, onUpdate, ctx }) => {
  const t = useTheme();
  const d = node.data as Record<string, unknown>;
  const isEmail = d.authProtocol === 'smtp_basic' || d.nodeType === 'emailNode';

  const authProtocol = String(d.authProtocol ?? '');
  const allowedConnectionIds = (d.allowedConnectionIds as string[]) ?? [];
  const defaultConnectionId = String(d.defaultConnectionId ?? '');
  const selectedConnectionId = String(d.connectionId ?? defaultConnectionId ?? '');

  const [connections, setConnections] = useState<FloConnectionSafe[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);
  const [connError, setConnError] = useState('');

  const fetchConnections = useCallback(async () => {
    if (!authProtocol || !ctx.hubId || !ctx.tenantId) return;
    setLoadingConns(true);
    setConnError('');
    try {
      const fn = httpsCallable<
        { hubId: string; tenantId: string; authProtocol: string },
        { connections: FloConnectionSafe[] }
      >(getFunctions(), 'getFloConnectionsForPlug');
      const res = await fn({ hubId: ctx.hubId, tenantId: ctx.tenantId, authProtocol });
      let list = res.data.connections ?? [];
      if (allowedConnectionIds.length > 0) {
        const allowed = new Set(allowedConnectionIds);
        list = list.filter(c => allowed.has(c.id));
      }
      setConnections(list);
    } catch (e: unknown) {
      setConnError(e instanceof Error ? e.message : 'Failed to load connections.');
    } finally {
      setLoadingConns(false);
    }
  }, [authProtocol, ctx.hubId, ctx.tenantId, allowedConnectionIds.join(',')]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  useEffect(() => {
    if (isEmail) return;
    const patch: Record<string, unknown> = {};
    if (!d.connectionId && (defaultConnectionId || connections[0]?.id)) {
      patch.connectionId = defaultConnectionId || connections[0]?.id;
    }
    if (Object.keys(patch).length > 0) onUpdate(node.id, patch);
  }, [node.id, isEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isEmail) {
    const bindings = (d.emailBindings ?? {}) as EmailBindings;
    const get = (k: string): EmailFieldBinding => bindings[k] ?? { source: 'static', value: '' };
    const patch = (k: string, p: Partial<EmailFieldBinding>) =>
      onUpdate(node.id, { emailBindings: { ...bindings, [k]: { ...get(k), ...p } } });

    return (
      <>
        <Section>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.accent }}>✉ {String(d.plugName ?? 'Email plug')}</div>
          <Help>Map recipients and body from static text or variables.</Help>
        </Section>
        {EMAIL_FIELDS.map(f => (
          <EmailFieldRow key={f.key} fieldKey={f.key} label={f.label} isList={f.isList}
            binding={get(f.key)} onChange={p => patch(f.key, p)} />
        ))}
        <OutputTargetSection
          outputTarget={(d.outputTarget as string) ?? 'cStream'}
          outputVarName={(d.outputVarName as string) ?? ''}
          onChange={p => onUpdate(node.id, p)}
        />
        <PlugTestInput
          value={String(d.testInputJson ?? DEFAULT_PLUG_TEST_INPUT)}
          onChange={json => onUpdate(node.id, { testInputJson: json })}
        />
        <NodeTestPanel nodeId={node.id} testingNodeId={ctx.testingNodeId} onTest={() => ctx.onTestNode(node.id)}
          result={d._result as string} isError={d._isError as boolean} loading={d._loading as boolean} />
      </>
    );
  }

  const devUrlVars = extractUrlTemplateVarNames(String(d.urlPattern ?? ''))
    .filter(isDeveloperPlugUrlVar);
  const urlVariables = (d.urlVariables ?? {}) as Record<string, PlugVariableBinding>;
  const selectedConn = connections.find(c => c.id === selectedConnectionId);

  return (
    <>
      <Section>
        <div style={{ fontSize: 11, fontWeight: 600, color: t.accent }}>{String(d.plugName ?? 'Plug')}</div>
        <div style={{ fontSize: 9, color: t.textMuted }}>{String(d.connectorLabel ?? '')}</div>
        {authProtocol && (
          <span style={{
            display: 'inline-block', marginTop: 6, fontSize: 9, padding: '2px 8px', borderRadius: 12,
            background: `${t.accent}22`, color: t.accent, border: `0.5px solid ${t.accent}44`,
          }}>
            {authProtocol}
          </span>
        )}
      </Section>

      <Field label="Connection">
        {connError && (
          <div style={{ fontSize: 10, color: '#e05555', marginBottom: 6 }}>{connError}</div>
        )}
        {loadingConns ? (
          <span style={{ fontSize: 10, color: t.textMuted, fontStyle: 'italic' }}>Loading connections…</span>
        ) : connections.length === 0 ? (
          <span style={{ fontSize: 10, color: t.warning, fontStyle: 'italic' }}>
            No connections for this protocol. Ask your hub admin to create one.
          </span>
        ) : (
          <Sel
            value={selectedConnectionId}
            onChange={e => onUpdate(node.id, {
              connectionId: e.target.value,
              connectionName: connections.find(c => c.id === e.target.value)?.name ?? '',
            })}
          >
            <option value="">— select connection —</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.environmentLabel ? ` (${c.environmentLabel})` : ''}
                {c.id === defaultConnectionId ? ' (default)' : ''}
              </option>
            ))}
          </Sel>
        )}
        {allowedConnectionIds.length > 0 ? (
          <Help>
            Connections are limited to those configured by your hub admin for this plug.
            {defaultConnectionId ? ` Default: ${connections.find(c => c.id === defaultConnectionId)?.name ?? defaultConnectionId}.` : ''}
          </Help>
        ) : selectedConn ? (
          <Help>
            Host and tenant come from connection “{selectedConn.name}” — not configured here.
          </Help>
        ) : null}
      </Field>

      {devUrlVars.map(varName => {
        const hint = (d.variableHints as PlugVariableHint[] | undefined)?.find(h => h.name === varName);
        const binding = urlVariables[varName];
        const label = varName === 'version' ? 'API version' : varName === 'module' ? 'Module' : varName;
        return (
          <Field key={varName} label={label}>
            <div style={{ display: 'flex', gap: 5 }}>
              <Sel style={{ flex: '0 0 75px' }} value={binding?.source ?? 'static'}
                onChange={e => onUpdate(node.id, {
                  urlVariables: { ...urlVariables, [varName]: { source: e.target.value, value: binding?.value ?? hint?.defaultValue ?? '' } },
                })}>
                <option value="static">Static</option>
                <option value="cStream">cStream</option>
                <option value="global">Global</option>
                <option value="local">Local</option>
              </Sel>
              <Inp value={binding?.value ?? ''} placeholder={hint?.defaultValue ?? varName}
                onChange={e => onUpdate(node.id, {
                  urlVariables: { ...urlVariables, [varName]: { source: binding?.source ?? 'static', value: e.target.value } },
                })} />
            </div>
          </Field>
        );
      })}
      <OutputTargetSection
        outputTarget={(d.outputTarget as string) ?? 'cStream'}
        outputVarName={(d.outputVarName as string) ?? ''}
        onChange={p => onUpdate(node.id, p)}
      />
      <PlugTestInput
        value={String(d.testInputJson ?? DEFAULT_PLUG_TEST_INPUT)}
        onChange={json => onUpdate(node.id, { testInputJson: json })}
      />
      <NodeTestPanel nodeId={node.id} testingNodeId={ctx.testingNodeId} onTest={() => ctx.onTestNode(node.id)}
        result={d._result as string} isError={d._isError as boolean} loading={d._loading as boolean} />
    </>
  );
};
